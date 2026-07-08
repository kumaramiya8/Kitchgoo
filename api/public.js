/**
 * Public API — the guest-facing QR menu.
 *
 * Guests are unauthenticated, so this surface is deliberately small:
 *  - read-only menu bootstrap that never creates or seeds tenants and only
 *    exposes guest-safe settings sections (no delivery API keys, no roles);
 *  - a single-table order write that merges server-side, so one guest can
 *    never clobber another table's state with a stale snapshot;
 *  - a KDS ticket append (also server-side merged).
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getAdminClient, broadcastChange } from './_lib/core.js';
import { SEEDS } from '../shared/seeds.js';

const app = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

const guestWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Settings sections a guest device may see
const GUEST_SETTINGS_SECTIONS = [
  'restaurant', 'billing', 'payments', 'naming', 'modules',
  'menuCategories', 'operations', 'appearance', 'receipt',
];

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('[Public API]', req.method, req.url, err);
    res.status(status).json({ success: false, error: status >= 500 ? 'Internal server error' : err.message });
  });
};

function requireDb() {
  const db = getAdminClient();
  if (!db) {
    const err = new Error('Database not configured on the server');
    err.statusCode = 500;
    throw err;
  }
  return db;
}

async function getFlex(db, tenant, name, fallback) {
  const { data } = await db
    .from('tenant_data').select('value')
    .eq('account_id', tenant).eq('collection_name', name)
    .maybeSingle();
  return data ? data.value : fallback;
}

// GET /api/public/qrmenu/:tenant?table=<number-or-id>
app.get('/api/public/qrmenu/:tenant', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = req.params.tenant;

  // Unknown tenants 404 — a QR code for a non-existent restaurant must not
  // create one (the old client-side flow did exactly that).
  const { data: account } = await db.from('accounts').select('id').eq('id', tenant).maybeSingle();
  if (!account) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }

  const [{ data: menuRows }, { data: settingsRows }, floorPlans, posTables, savedOrders, modifiers] = await Promise.all([
    db.from('menu').select('*').eq('account_id', tenant),
    db.from('settings').select('section_name, value').eq('account_id', tenant).in('section_name', GUEST_SETTINGS_SECTIONS),
    getFlex(db, tenant, 'floor_plans', SEEDS.floor_plans),
    getFlex(db, tenant, 'pos_tables', []),
    getFlex(db, tenant, 'pos_saved_orders', {}),
    getFlex(db, tenant, 'modifiers', []),
  ]);

  const settings = {};
  GUEST_SETTINGS_SECTIONS.forEach(s => { settings[s] = SEEDS.settings[s]; });
  (settingsRows || []).forEach(row => { settings[row.section_name] = row.value; });

  // Scope saved orders to the guest's own table when one is given
  const tableParam = (req.query.table || '').trim().toLowerCase();
  let scopedOrders = {};
  if (tableParam) {
    const match = (posTables || []).find(t =>
      String(t.number || t.id).trim().toLowerCase() === tableParam || String(t.id) === req.query.table
    );
    if (match && savedOrders && savedOrders[match.id] !== undefined) {
      scopedOrders = { [match.id]: savedOrders[match.id] };
    }
  }

  res.json({
    success: true,
    tenant,
    menu: menuRows || [],
    settings,
    collections: {
      floor_plans: floorPlans,
      pos_tables: posTables || [],
      pos_saved_orders: scopedOrders,
      modifiers: modifiers || [],
    },
  });
}));

// PUT /api/public/qrmenu/:tenant/table/:tableId
// Body: { table: {...} | undefined, savedOrder: <order|null> }
// Merges ONLY the given table into pos_tables / pos_saved_orders.
app.put('/api/public/qrmenu/:tenant/table/:tableId', guestWriteLimiter, wrap(async (req, res) => {
  const db = requireDb();
  const { tenant, tableId } = req.params;
  const { table, savedOrder } = req.body || {};

  const { data: account } = await db.from('accounts').select('id').eq('id', tenant).maybeSingle();
  if (!account) return res.status(404).json({ success: false, error: 'Restaurant not found' });

  if (table !== undefined) {
    const current = (await getFlex(db, tenant, 'pos_tables', [])) || [];
    let found = false;
    const merged = current.map(t => {
      if (String(t.id) === String(tableId)) { found = true; return { ...t, ...table, id: t.id }; }
      return t;
    });
    if (!found) merged.push({ ...table, id: table.id ?? tableId });
    const { error } = await db.from('tenant_data').upsert({
      account_id: tenant, collection_name: 'pos_tables', value: merged,
    });
    if (error) throw error;
  }

  if (savedOrder !== undefined) {
    const current = await getFlex(db, tenant, 'pos_saved_orders', {});
    const merged = { ...(current || {}) };
    if (savedOrder === null) {
      delete merged[tableId];
    } else {
      merged[tableId] = savedOrder;
    }
    const { error } = await db.from('tenant_data').upsert({
      account_id: tenant, collection_name: 'pos_saved_orders', value: merged,
    });
    if (error) throw error;
  }

  broadcastChange(tenant, 'pos_tables');
  res.json({ success: true });
}));

// POST /api/public/qrmenu/:tenant/kds — append one ticket (server-side merge)
app.post('/api/public/qrmenu/:tenant/kds', guestWriteLimiter, wrap(async (req, res) => {
  const db = requireDb();
  const { tenant } = req.params;
  const ticket = req.body?.ticket;
  if (!ticket || typeof ticket !== 'object') {
    return res.status(400).json({ success: false, error: 'Ticket payload required' });
  }

  const { data: account } = await db.from('accounts').select('id').eq('id', tenant).maybeSingle();
  if (!account) return res.status(404).json({ success: false, error: 'Restaurant not found' });

  const current = await getFlex(db, tenant, 'kds_tickets', []);
  const withId = {
    ...ticket,
    id: ticket.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: ticket.createdAt || new Date().toISOString(),
  };
  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: 'kds_tickets', value: [...(current || []), withId],
  });
  if (error) throw error;

  broadcastChange(tenant, 'kds_tickets');
  res.json({ success: true, ticket: withId });
}));

export default app;
