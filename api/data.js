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
  uploadDataUrl,
  ordersWindowStart,
  ORDERS_WINDOW_LIMIT,
} from './_lib/core.js';
import { sanitizeInsertPayload, sanitizeUpdatePayload } from '../shared/mappers.js';
import { FLEX_COLLECTIONS, ROW_TABLES, SEEDS } from '../shared/seeds.js';
import { stripItems, stripCollectionItems } from '../shared/items.js';

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

// Full tenant payload; seeds brand-new tenants (first login after register).
// Also returns the session user so the client can boot with ONE request
// instead of /api/session followed by this (each may be a separate lambda
// cold start in production).
app.get('/api/data/bootstrap', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);

  // The payload load doesn't depend on account/seed checks for existing
  // tenants — run everything concurrently and only re-load when we just
  // seeded a brand-new tenant.
  const admin = isPlatformAdmin(req.user);
  const [firstPayload, seeded, accountsRes, allUsersRes] = await Promise.all([
    loadTenantPayload(tenant),
    (async () => {
      await ensureAccount(tenant);
      return seedTenantIfNew(tenant);
    })(),
    admin ? db.from('accounts').select('*') : null,
    admin ? db.from('users').select('id, account_id, name, email, role, avatar, phone, created_at') : null,
  ]);
  const payload = seeded ? await loadTenantPayload(tenant) : firstPayload;

  if (admin) {
    payload.accounts = accountsRes?.data || [];
    payload.allUsers = allUsersRes?.data || [];
  }

  res.json({ success: true, tenant, user: req.user, ...payload });
}));

// A SINGLE collection — the targeted-sync path. Clients hear which
// collection changed (broadcastChange carries the name) and refetch only
// that one instead of the whole ~58 KB payload, so one KOT costs a couple
// of KB of egress across the floor instead of tens of KB per device.
app.get('/api/data/collection/:name', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);
  const { name } = req.params;

  if (ROW_TABLES.includes(name)) {
    if (name === 'users') {
      const { data } = await db.from('users')
        .select('id, account_id, name, email, role, avatar, phone, created_at')
        .eq('account_id', tenant);
      return res.json({ success: true, name, rows: data || [] });
    }
    if (name === 'orders') {
      const ordersFrom = ordersWindowStart();
      const { data } = await db.from('orders').select('*').eq('account_id', tenant)
        .gte('created_at', ordersFrom)
        .order('created_at', { ascending: false })
        .limit(ORDERS_WINDOW_LIMIT);
      const rows = (data || []).map(o => (o && Array.isArray(o.items) ? { ...o, items: stripItems(o.items) } : o));
      return res.json({ success: true, name, rows, ordersFrom });
    }
    const { data } = await db.from(name).select('*').eq('account_id', tenant);
    return res.json({ success: true, name, rows: data || [] });
  }

  if (name === 'settings') {
    const { data } = await db.from('settings').select('*').eq('account_id', tenant);
    const obj = JSON.parse(JSON.stringify(SEEDS.settings));
    (data || []).forEach(row => { obj[row.section_name] = row.value; });
    return res.json({ success: true, name, value: obj });
  }

  if (FLEX_COLLECTIONS.includes(name)) {
    const fallback = Array.isArray(SEEDS[name]) ? [] : (SEEDS[name] ?? []);
    const value = await getFlex(db, tenant, name, fallback);
    return res.json({ success: true, name, value: stripCollectionItems(name, value) });
  }

  return res.status(400).json({ success: false, error: `Unknown collection: ${name}` });
}));

// Store a menu photo / logo in Storage and return its URL — keeps base64
// image bytes out of the DB rows (and therefore out of every sync payload).
app.post('/api/data/upload-image', wrap(async (req, res) => {
  const tenant = resolveTenant(req);
  const { dataUrl, kind } = req.body || {};
  const safeKind = ['menu', 'logo', 'receipt'].includes(kind) ? kind : 'misc';
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ success: false, error: 'An image dataUrl is required' });
  }
  const url = await uploadDataUrl(tenant, safeKind, dataUrl);
  res.json({ success: true, url });
}));

// Same payload without the seeding checks — used for refresh/polling
app.get('/api/data/sync', wrap(async (req, res) => {
  requireDb(res);
  const tenant = resolveTenant(req);
  const payload = await loadTenantPayload(tenant);
  res.json({ success: true, tenant, ...payload });
}));

// Historical orders by range — the default payload only carries the recent
// window, so Reports fetch older periods here on demand.
app.get('/api/data/orders', wrap(async (req, res) => {
  const db = requireDb();
  const tenant = resolveTenant(req);
  const { from, to } = req.query;
  if (!from || !/^\d{4}-\d{2}-\d{2}/.test(String(from))) {
    return res.status(400).json({ success: false, error: 'from date required (YYYY-MM-DD or ISO)' });
  }

  let q = db.from('orders').select('*').eq('account_id', tenant)
    .gte('created_at', String(from))
    .order('created_at', { ascending: false })
    .limit(5000);
  if (to && /^\d{4}-\d{2}-\d{2}/.test(String(to))) {
    q = q.lt('created_at', String(to));
  }
  const { data, error } = await q;
  if (error) throw error;

  res.json({ success: true, orders: data || [] });
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

// ── Generic atomic flex-collection items ────────────────────
// Every flex collection is one JSON array in tenant_data. Clients used to
// PUT the whole array on any change, so two devices writing concurrently
// (or one holding a stale snapshot) silently dropped each other's rows.
// These endpoints read-merge-write a single item server-side instead.

// Growth caps applied on append — these collections otherwise grow forever
// and get shipped to every device on every sync.
function capCollection(name, arr) {
  if (name === 'audit_log') {
    // Newest last; keep the most recent 300 entries (the audit view shows
    // recent activity; full history isn't needed in the live cache).
    return arr.length > 300 ? arr.slice(arr.length - 300) : arr;
  }
  if (name === 'kds_tickets') {
    // Active tickets always; completed ones only for a few hours (long enough
    // for recall during a shift). Keeps this collection — which the KDS pulls
    // and the reconcile checks — small instead of a week's backlog.
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    return arr.filter(t => {
      if (t.status !== 'completed') return true;
      const ts = new Date(t.updatedAt || t.firedAt || t.createdAt || 0).getTime();
      return ts >= cutoff;
    });
  }
  return arr;
}

function assertFlexArray(name) {
  if (!FLEX_COLLECTIONS.includes(name)) {
    const err = new Error(`Unknown collection: ${name}`);
    err.statusCode = 400;
    throw err;
  }
}

// POST /api/data/flex/:name  body: { item } — append (idempotent by id)
app.post('/api/data/flex/:name', wrap(async (req, res) => {
  const db = requireDb();
  const { name } = req.params;
  assertFlexArray(name);
  const tenant = resolveTenant(req);
  const item = req.body?.item;
  if (!item || typeof item !== 'object') {
    return res.status(400).json({ success: false, error: 'item payload required' });
  }

  const current = (await getFlex(db, tenant, name, [])) || [];
  const arr = Array.isArray(current) ? current : [];
  const withId = { ...item, id: item.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  const next = arr.some(x => x.id === withId.id) ? arr : capCollection(name, [...arr, withId]);

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: name, value: next,
  });
  if (error) throw error;

  broadcastChange(tenant, name);
  res.json({ success: true, item: withId });
}));

// PATCH /api/data/flex/:name/:id  body: { data } — merge into the item (upsert)
app.patch('/api/data/flex/:name/:id', wrap(async (req, res) => {
  const db = requireDb();
  const { name, id } = req.params;
  assertFlexArray(name);
  const tenant = resolveTenant(req);
  const data = req.body?.data;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'data payload required' });
  }

  const current = (await getFlex(db, tenant, name, [])) || [];
  const arr = Array.isArray(current) ? current : [];
  let found = false;
  const next = arr.map(x => {
    if (String(x.id) === String(id)) { found = true; return { ...x, ...data, id: x.id }; }
    return x;
  });
  if (!found) next.push({ ...data, id });

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: name, value: next,
  });
  if (error) throw error;

  broadcastChange(tenant, name);
  res.json({ success: true });
}));

// DELETE /api/data/flex/:name/:id — remove one item
app.delete('/api/data/flex/:name/:id', wrap(async (req, res) => {
  const db = requireDb();
  const { name, id } = req.params;
  assertFlexArray(name);
  const tenant = resolveTenant(req);

  const current = (await getFlex(db, tenant, name, [])) || [];
  const arr = Array.isArray(current) ? current : [];
  const next = arr.filter(x => String(x.id) !== String(id));

  const { error } = await db.from('tenant_data').upsert({
    account_id: tenant, collection_name: name, value: next,
  });
  if (error) throw error;

  broadcastChange(tenant, name);
  res.json({ success: true });
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
