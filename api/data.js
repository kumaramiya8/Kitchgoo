/**
 * Data API — every read/write the app does against tenant data.
 *
 * The browser never talks to the database directly anymore: requests carry
 * the HttpOnly session cookie, the tenant is derived from the JWT server-side,
 * and every query is scoped to that tenant. The Kitchgoo platform admin may
 * act on another tenant via the x-kitchgoo-tenant header (impersonation).
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import {
  getAdminClient,
  requireAuth,
  resolveTenant,
  isPlatformAdmin,
  hashPassword,
  broadcastChange,
  ensureAccount,
  seedTenantIfNew,
  loadTenantPayload,
} from './_lib/core.js';
import { sanitizeInsertPayload, sanitizeUpdatePayload } from '../shared/mappers.js';
import { FLEX_COLLECTIONS, ROW_TABLES } from '../shared/seeds.js';

const app = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.use('/api/data', requireAuth);

// Collections writable via PUT /collections — flex blobs plus the bill counter
const WRITABLE_COLLECTIONS = new Set([...FLEX_COLLECTIONS, 'bill_counter']);

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('[Data API]', req.method, req.url, err);
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

// ── Reads ───────────────────────────────────────────────────

// Full tenant payload; seeds brand-new tenants (first login after register)
app.get('/api/data/bootstrap', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);

  await ensureAccount(tenant);
  await seedTenantIfNew(tenant);
  const payload = await loadTenantPayload(tenant);

  if (isPlatformAdmin(req.user)) {
    const [{ data: accounts }, { data: allUsers }] = await Promise.all([
      db.from('accounts').select('*'),
      db.from('users').select('id, account_id, name, email, role, avatar, phone, created_at'),
    ]);
    payload.accounts = accounts || [];
    payload.allUsers = allUsers || [];
  }

  res.json({ success: true, tenant, ...payload });
}));

// Same payload without the seeding checks — used for refresh/polling
app.get('/api/data/sync', wrap(async (req, res) => {
  requireDb(res);
  const tenant = resolveTenant(req);
  const payload = await loadTenantPayload(tenant);
  res.json({ success: true, tenant, ...payload });
}));

// Combined audit log across all tenants — platform admin only
app.get('/api/data/audit-all', wrap(async (req, res) => {
  const db = requireDb();
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ success: false, error: 'Platform admin only' });
  }
  const { data } = await db.from('tenant_data').select('*').eq('collection_name', 'audit_log');
  const combined = [];
  (data || []).forEach(row => {
    if (Array.isArray(row.value)) {
      row.value.forEach(log => combined.push({ ...log, accountId: row.account_id }));
    }
  });
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ success: true, auditLog: combined });
}));

// ── Row-table writes (users / menu / inventory / orders) ────

function assertRowTable(table) {
  if (!ROW_TABLES.includes(table)) {
    const err = new Error(`Unknown table: ${table}`);
    err.statusCode = 400;
    throw err;
  }
}

app.post('/api/data/rows/:table', wrap(async (req, res) => {
  const db = requireDb();
  const { table } = req.params;
  assertRowTable(table);
  const tenant = resolveTenant(req);
  const item = { ...(req.body?.item || {}) };

  if (table === 'users') {
    // Users may only be created inside the acting tenant; passwords are
    // hashed here so plaintext never reaches the database.
    const targetTenant = item.restaurantName || item.accountId || tenant;
    if (targetTenant !== tenant && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Cannot create users in another account' });
    }
    if (item.password && !String(item.password).startsWith('scrypt$')) {
      item.password = hashPassword(item.password);
    }
    await ensureAccount(targetTenant);
    item.accountId = targetTenant;
  } else {
    item.accountId = tenant;
  }

  const { error } = await db.from(table).insert(sanitizeInsertPayload(table, item));
  if (error) throw error;

  broadcastChange(tenant, table);
  res.json({ success: true });
}));

app.patch('/api/data/rows/:table/:id', wrap(async (req, res) => {
  const db = requireDb();
  const { table, id } = req.params;
  assertRowTable(table);
  const tenant = resolveTenant(req);
  const data = { ...(req.body?.data || {}) };

  if (table === 'users' && data.password && !String(data.password).startsWith('scrypt$')) {
    data.password = hashPassword(data.password);
  }

  const payload = sanitizeUpdatePayload(table, data);
  if (Object.keys(payload).length === 0) {
    return res.json({ success: true, noop: true });
  }

  const { error } = await db.from(table).update(payload).eq('id', id).eq('account_id', tenant);
  if (error) throw error;

  broadcastChange(tenant, table);
  res.json({ success: true });
}));

app.delete('/api/data/rows/:table/:id', wrap(async (req, res) => {
  const db = requireDb();
  const { table, id } = req.params;
  assertRowTable(table);
  const tenant = resolveTenant(req);

  const { error } = await db.from(table).delete().eq('id', id).eq('account_id', tenant);
  if (error) throw error;

  broadcastChange(tenant, table);
  res.json({ success: true });
}));

// Clear a whole table for the tenant (menu import flows use this)
app.delete('/api/data/rows/:table', wrap(async (req, res) => {
  const db = requireDb();
  const { table } = req.params;
  if (!['menu', 'inventory', 'orders'].includes(table)) {
    return res.status(400).json({ success: false, error: `Cannot clear table: ${table}` });
  }
  const tenant = resolveTenant(req);

  const { error } = await db.from(table).delete().eq('account_id', tenant);
  if (error) throw error;

  broadcastChange(tenant, table);
  res.json({ success: true });
}));

// ── Atomic POS state (per-table server-side merge) ──────────
// Whole-collection PUTs race: a client that read before another client's
// write lands will push a stale array back and silently revert tables.
// These endpoints read-merge-write a SINGLE table's slice server-side.

async function getFlex(db, tenant, name, fallback) {
  const { data } = await db
    .from('tenant_data').select('value')
    .eq('account_id', tenant).eq('collection_name', name)
    .maybeSingle();
  return data ? data.value : fallback;
}

// PUT /api/data/tables/:tableId  body: { table }
app.put('/api/data/tables/:tableId', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);
  const { tableId } = req.params;
  const table = req.body?.table;
  if (!table || typeof table !== 'object') {
    return res.status(400).json({ success: false, error: 'table payload required' });
  }

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

  broadcastChange(tenant, 'pos_tables');
  res.json({ success: true });
}));

// PUT /api/data/table-orders/:tableId  body: { savedOrder } (null clears)
app.put('/api/data/table-orders/:tableId', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);
  const { tableId } = req.params;
  const { savedOrder } = req.body || {};

  const current = (await getFlex(db, tenant, 'pos_saved_orders', {})) || {};
  const merged = { ...current };
  if (savedOrder === null || savedOrder === undefined) {
    delete merged[tableId];
  } else {
    merged[tableId] = savedOrder;
  }

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: 'pos_saved_orders', value: merged,
  });
  if (error) throw error;

  broadcastChange(tenant, 'pos_saved_orders');
  res.json({ success: true });
}));

// POST /api/data/kds-append  body: { ticket } — append without clobbering
// tickets other devices created since this client last synced.
app.post('/api/data/kds-append', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);
  const ticket = req.body?.ticket;
  if (!ticket || typeof ticket !== 'object') {
    return res.status(400).json({ success: false, error: 'ticket payload required' });
  }

  const current = (await getFlex(db, tenant, 'kds_tickets', [])) || [];
  const withId = {
    ...ticket,
    id: ticket.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  // Idempotent: retries with the same id don't duplicate the ticket
  const next = current.some(t => t.id === withId.id) ? current : [...current, withId];

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: 'kds_tickets', value: next,
  });
  if (error) throw error;

  broadcastChange(tenant, 'kds_tickets');
  res.json({ success: true, ticket: withId });
}));

// ── Flex collections + settings ─────────────────────────────

app.put('/api/data/collections/:name', wrap(async (req, res) => {
  const db = requireDb();
  const { name } = req.params;
  if (!WRITABLE_COLLECTIONS.has(name)) {
    return res.status(400).json({ success: false, error: `Unknown collection: ${name}` });
  }
  const tenant = resolveTenant(req);

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant,
    collection_name: name,
    value: req.body?.value,
  });
  if (error) throw error;

  broadcastChange(tenant, name);
  res.json({ success: true });
}));

app.put('/api/data/settings/:section', wrap(async (req, res) => {
  const db = requireDb();
  const { section } = req.params;
  if (!/^[a-zA-Z0-9_]{1,50}$/.test(section)) {
    return res.status(400).json({ success: false, error: 'Invalid settings section' });
  }
  const tenant = resolveTenant(req);

  const { error } = await db.from('settings').upsert({
    account_id: tenant,
    section_name: section,
    value: req.body?.value,
  });
  if (error) throw error;

  broadcastChange(tenant, 'settings');
  res.json({ success: true });
}));

export default app;
