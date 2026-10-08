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
import { getAdminClient, broadcastChange, broadcastServerOrderCreated, resolveAccount } from './_lib/core.js';
import { SEEDS } from '../shared/seeds.js';

const app = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// Raised limit to safely accommodate shared restaurant Wi-Fi IP across all diners
const guestWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
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
  const tenantParam = req.params.tenant;

  // Resilient account resolution (id, name, case-insensitive, slug/unslug)
  const account = await resolveAccount(db, tenantParam);
  if (!account) {
    return res.status(404).json({ success: false, error: 'Restaurant not found' });
  }
  const canonicalTenant = account.id;

  const [{ data: menuRows }, { data: settingsRows }, floorPlans, posTables, savedOrders, modifiers] = await Promise.all([
    db.from('menu').select('*').eq('account_id', canonicalTenant),
    db.from('settings').select('section_name, value').eq('account_id', canonicalTenant).in('section_name', GUEST_SETTINGS_SECTIONS),
    getFlex(db, canonicalTenant, 'floor_plans', SEEDS.floor_plans),
    getFlex(db, canonicalTenant, 'pos_tables', []),
    getFlex(db, canonicalTenant, 'pos_saved_orders', {}),
    getFlex(db, canonicalTenant, 'modifiers', []),
  ]);

  const settings = {};
  GUEST_SETTINGS_SECTIONS.forEach(s => { settings[s] = SEEDS.settings[s]; });
  (settingsRows || []).forEach(row => { settings[row.section_name] = row.value; });

  // Merge floor_plans layout with saved pos_tables so guest devices always get the full table list
  const baseTables = ((floorPlans && floorPlans.tables) || []).map(t => ({
    id: t.id || t.number,
    number: t.number || t.id,
    seats: t.seats || t.capacity || 4,
    shape: t.shape || 'square',
    section: t.section || t.sectionId || null,
    status: 'available',
    guestName: null,
    guestId: null,
    seatedAt: null,
    serverId: t.serverId || null,
  }));
  const saved = posTables || [];
  const tableMap = new Map();
  baseTables.forEach(t => tableMap.set(String(t.id), t));
  saved.forEach(t => {
    const existing = tableMap.get(String(t.id));
    if (existing) {
      tableMap.set(String(t.id), { ...existing, ...t });
    } else {
      tableMap.set(String(t.id), t);
    }
  });
  const mergedPosTables = Array.from(tableMap.values());

  // Scope saved orders to the guest's own table when one is given
  const tableParam = (req.query.table || '').trim().toLowerCase();
  let scopedOrders = {};
  if (tableParam) {
    const cleanTableParam = tableParam.replace(/^(table|tbl|t|#|\s|-)+/i, '').trim();
    const match = mergedPosTables.find(t => {
      const tNum = String(t.number || '').trim().toLowerCase();
      const tId = String(t.id || '').trim().toLowerCase();
      const tName = String(t.name || '').trim().toLowerCase();
      if (tNum === tableParam || tId === tableParam || tName === tableParam) return true;
      if (cleanTableParam) {
        const cleanNum = tNum.replace(/^(table|tbl|t|#|\s|-)+/i, '').trim();
        const cleanId = tId.replace(/^(table|tbl|t|#|\s|-)+/i, '').trim();
        return cleanNum === cleanTableParam || cleanId === cleanTableParam;
      }
      return false;
    });
    if (match && savedOrders) {
      const foundOrder = savedOrders[match.id] ??
                         (match.number ? savedOrders[String(match.number)] : undefined) ??
                         savedOrders[cleanTableParam] ??
                         savedOrders[tableParam];
      if (foundOrder !== undefined) {
        scopedOrders[match.id] = foundOrder;
        if (match.number) scopedOrders[String(match.number)] = foundOrder;
      }
    }
  }

  res.json({
    success: true,
    tenant: canonicalTenant,
    menu: menuRows || [],
    settings,
    collections: {
      floor_plans: floorPlans,
      pos_tables: mergedPosTables,
      pos_saved_orders: scopedOrders,
      modifiers: modifiers || [],
    },
  });
}));

// Helper to broadcast changes across all aliases of the tenant
async function broadcastToAll(canonicalTenant, requestedTenant, accountName, table) {
  await broadcastChange(canonicalTenant, table);
  if (requestedTenant && requestedTenant !== canonicalTenant) {
    await broadcastChange(requestedTenant, table);
  }
  if (accountName && accountName !== canonicalTenant && accountName !== requestedTenant) {
    await broadcastChange(accountName, table);
  }
}

// Helper to merge newly ordered items into an active table's existing saved items
export function mergeOrderItems(existingItems = [], incomingItems = []) {
  if (!existingItems || existingItems.length === 0) return incomingItems || [];
  if (!incomingItems || incomingItems.length === 0) return existingItems || [];

  const merged = [...existingItems];

  incomingItems.forEach(incoming => {
    // Check if this item is already present in existingItems
    const idx = merged.findIndex(existing => {
      if (existing._cartKey && incoming._cartKey && existing._cartKey === incoming._cartKey) {
        return true;
      }
      if (existing.id && incoming.id && existing.id === incoming.id) {
        const eNotes = (existing.notes || existing.specialInstructions || '').trim().toLowerCase();
        const iNotes = (incoming.notes || incoming.specialInstructions || '').trim().toLowerCase();
        return eNotes === iNotes;
      }
      return false;
    });

    if (idx >= 0) {
      if (incoming.qty > merged[idx].qty) {
        merged[idx] = { ...merged[idx], qty: incoming.qty };
      }
    } else {
      merged.push(incoming);
    }
  });

  return merged;
}

// PUT /api/public/qrmenu/:tenant/table/:tableId
// Body: { table: {...} | undefined, savedOrder: <order|null> }
// Merges ONLY the given table into pos_tables / pos_saved_orders.
app.put('/api/public/qrmenu/:tenant/table/:tableId', guestWriteLimiter, wrap(async (req, res) => {
  const db = requireDb();
  const { tenant: requestedTenant, tableId } = req.params;
  const { table, savedOrder } = req.body || {};

  const account = await resolveAccount(db, requestedTenant);
  if (!account) return res.status(404).json({ success: false, error: 'Restaurant not found' });
  const canonicalTenant = account.id;

  if (table !== undefined) {
    const floorPlans = await getFlex(db, canonicalTenant, 'floor_plans', SEEDS.floor_plans);
    const current = (await getFlex(db, canonicalTenant, 'pos_tables', [])) || [];
    let found = false;
    const merged = current.map(t => {
      const match = String(t.id) === String(tableId) ||
                    (t.number && String(t.number) === String(tableId)) ||
                    (table && table.id && String(t.id) === String(table.id)) ||
                    (table && table.number && String(t.number) === String(table.number));
      if (match) {
        found = true;
        // Keep existing seatedAt if table was already active!
        const keepSeatedAt = (t.status && t.status !== 'available' && t.status !== 'needs-bussing' && t.seatedAt)
          ? t.seatedAt
          : (table.seatedAt || t.seatedAt || new Date().toISOString());
        return { ...t, ...table, id: t.id, seatedAt: keepSeatedAt };
      }
      return t;
    });
    if (!found) {
      const fpTable = ((floorPlans && floorPlans.tables) || []).find(t =>
        String(t.id) === String(tableId) || (t.number && String(t.number) === String(tableId))
      );
      if (fpTable) {
        merged.push({ ...fpTable, ...table, id: fpTable.id || tableId });
      } else {
        merged.push({ ...table, id: table.id ?? tableId });
      }
    }
    const { error } = await db.from('tenant_data').upsert({
      account_id: canonicalTenant, collection_name: 'pos_tables', value: merged,
    });
    if (error) throw error;
  }

  if (savedOrder !== undefined) {
    const currentOrders = (await getFlex(db, canonicalTenant, 'pos_saved_orders', {})) || {};
    const mergedOrders = { ...currentOrders };

    if (savedOrder === null) {
      delete mergedOrders[tableId];
      if (table && table.id) delete mergedOrders[table.id];
      if (table && table.number) delete mergedOrders[String(table.number)];
    } else {
      const possibleKeys = [
        tableId,
        table && table.id,
        table && table.number && String(table.number),
        tableId.replace(/^tbl_/i, ''),
      ].filter(Boolean).map(String);

      const existingKey = possibleKeys.find(k => mergedOrders[k] !== undefined);
      const existingVal = existingKey ? mergedOrders[existingKey] : null;

      const existingItems = Array.isArray(existingVal)
        ? existingVal
        : (existingVal && Array.isArray(existingVal.items) ? existingVal.items : []);

      const incomingItems = Array.isArray(savedOrder)
        ? savedOrder
        : (savedOrder && Array.isArray(savedOrder.items) ? savedOrder.items : []);

      // Check current table status in pos_tables
      const currentTables = (await getFlex(db, canonicalTenant, 'pos_tables', [])) || [];
      const currentTable = currentTables.find(t =>
        String(t.id) === String(tableId) ||
        (t.number && String(t.number) === String(tableId)) ||
        (table && String(t.id) === String(table.id)) ||
        (table && table.number && String(t.number) === String(table.number))
      );

      const isTableCurrentlyActive = currentTable &&
        currentTable.status &&
        currentTable.status !== 'available' &&
        currentTable.status !== 'needs-bussing';

      let finalItems;
      if (isTableCurrentlyActive && existingItems.length > 0) {
        finalItems = mergeOrderItems(existingItems, incomingItems);
      } else {
        finalItems = incomingItems;
      }

      const finalSavedOrder = Array.isArray(savedOrder)
        ? finalItems
        : { ...(savedOrder || {}), items: finalItems };

      const primaryKey = (table && table.id) ? String(table.id) : String(tableId);
      mergedOrders[primaryKey] = finalSavedOrder;

      // Also mirror under table number so lookups by table.number or table.id never miss
      if (table && table.number && String(table.number) !== primaryKey) {
        mergedOrders[String(table.number)] = finalSavedOrder;
      }
      if (tableId !== primaryKey) {
        mergedOrders[tableId] = finalSavedOrder;
      }
    }

    const { error } = await db.from('tenant_data').upsert({
      account_id: canonicalTenant, collection_name: 'pos_saved_orders', value: mergedOrders,
    });
    if (error) throw error;
    await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'pos_saved_orders');
  }

  await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'pos_tables');
  res.json({ success: true });
}));

// POST /api/public/qrmenu/:tenant/kds — append one ticket (server-side merge)
app.post('/api/public/qrmenu/:tenant/kds', guestWriteLimiter, wrap(async (req, res) => {
  const db = requireDb();
  const { tenant: requestedTenant } = req.params;
  const ticket = req.body?.ticket;
  if (!ticket || typeof ticket !== 'object') {
    return res.status(400).json({ success: false, error: 'Ticket payload required' });
  }

  const account = await resolveAccount(db, requestedTenant);
  if (!account) return res.status(404).json({ success: false, error: 'Restaurant not found' });
  const canonicalTenant = account.id;

  const current = await getFlex(db, canonicalTenant, 'kds_tickets', []);
  const withId = {
    ...ticket,
    id: ticket.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: ticket.createdAt || new Date().toISOString(),
  };
  const { error } = await db.from('tenant_data').upsert({
    account_id: canonicalTenant, collection_name: 'kds_tickets', value: [...(current || []), withId],
  });
  if (error) throw error;

  await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'kds_tickets');

  // Broadcast order_created across all tenant aliases so KDS chimes and reloads immediately
  broadcastServerOrderCreated(canonicalTenant, withId.tableId || null, withId.id).catch(() => {});
  if (requestedTenant && requestedTenant !== canonicalTenant) {
    broadcastServerOrderCreated(requestedTenant, withId.tableId || null, withId.id).catch(() => {});
  }
  if (account.name && account.name !== canonicalTenant && account.name !== requestedTenant) {
    broadcastServerOrderCreated(account.name, withId.tableId || null, withId.id).catch(() => {});
  }

  res.json({ success: true, ticket: withId });
}));

export default app;
