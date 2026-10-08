/**
 * Kitchgoo — Data layer (backend API & local Demo Mode)
 *
 * Architecture:
 *  • The browser NEVER talks to the database directly. All live reads/writes
 *    go through the authenticated backend (/api/data/*), which derives the
 *    tenant from the session cookie and scopes every query server-side.
 *  • Guest devices (public QR menu) use the read-only /api/public/* surface.
 *  • Front-end reads stay synchronous by loading the active tenant's datasets
 *    into an in-memory cache (_cache) at login/switch.
 *  • Writes update the cache immediately and launch targeted API calls.
 *  • Demo Mode keeps everything in localStorage — no network at all.
 */

import { isConfigured } from '../lib/supabase';
import { api } from '../lib/api';
import { SEEDS, FLEX_COLLECTIONS, ROW_TABLES, DEFAULT_MODULES } from '../../shared/seeds';
import { toCamelCase } from '../../shared/mappers';
import { localDayStr, todayLocalStr } from '../../shared/dates';
import { stripItems } from '../../shared/items';

export function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getSessionUser() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('kitchgoo_session');
      if (saved) {
        return JSON.parse(saved);
      }
    }
  } catch {}
  return { id: 'system', name: 'System / Guest' };
}

// Local Storage backup helpers for Demo Mode
function localBackup(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('kitchgoo_local_' + key, JSON.stringify(value));
    }
  } catch (e) {
    console.error('[DB] localBackup error:', e);
  }
}

function localRestore(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem('kitchgoo_local_' + key);
      return data ? JSON.parse(data) : undefined;
    }
  } catch (e) {
    console.error('[DB] localRestore error:', e);
  }
  return undefined;
}

// Legacy hashing helper — still used to seed the demo-mode admin.
// Live-mode passwords are scrypt-hashed on the server; never hash client-side.
export const simpleHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
};

// Check if we are running in local demo mode
function isDemoMode() {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
  }
  return true;
}

// Live mode = backend-backed (not demo). Guest mode = public QR device.
function isLive() {
  return isConfigured && !isDemoMode();
}

let _guestMode = false;
let _guestTableParam = '';

function guestTableId() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem('kitchgoo_guest_table') : null;
  } catch {
    return null;
  }
}

export function setGuestTable(tableIdOrNumber) {
  _guestTableParam = tableIdOrNumber ? String(tableIdOrNumber) : '';
  if (typeof window !== 'undefined' && tableIdOrNumber) {
    try { window.sessionStorage.setItem('kitchgoo_guest_table', String(tableIdOrNumber)); } catch {}
  }
}

// In-memory cache — populated from the backend or LocalStorage
const _cache = {};

let _currentTenant = 'Kitchgoo';

export let lastDbMutationAt = 0;

export function markMutation() {
  lastDbMutationAt = Date.now();
}

// Writes currently in flight. Sync responses that raced with a local write
// are discarded — applying them would revert optimistic state and, worse,
// the persistence effects would then push that stale state back upstream.
let _pendingWrites = 0;

async function tracked(promise) {
  _pendingWrites++;
  try {
    return await promise;
  } finally {
    _pendingWrites--;
    markMutation();
  }
}

export function hasPendingWrites() {
  return _pendingWrites > 0;
}

export function setCurrentTenant(tenant) {
  if (tenant) {
    _currentTenant = tenant;
  }
}

export function getCurrentTenant() {
  return _currentTenant;
}

export function getTenantCode(tenant) {
  if (!tenant) return 'KIT';
  const cleaned = tenant.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= 3) {
    let hash = 0;
    for (let i = 0; i < tenant.length; i++) {
      hash = (hash << 5) - hash + tenant.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(36).toUpperCase();
    const prefix = cleaned.substring(0, 3);
    const suffix = hashStr.substring(0, 2);
    return `${prefix}${suffix}`;
  }
  return cleaned.padEnd(3, 'X');
}

/**
 * Extract trailing number from bill number string (e.g. "INV-KIK6Y-1069" -> 1069)
 */
export function extractBillNumber(billNo) {
  if (!billNo) return null;
  const match = String(billNo).trim().match(/(?:^|[^\d])(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Dynamic Max Scan: scans all existing orders across cache/storage to determine the next sequential counter.
 * Guarantees that any number ever issued in the past can never be repeated across any device or session.
 */
export function getNextBillCounter(tenantName = _currentTenant, fallbackCounter = 1001) {
  const allOrders = _cache['orders'] || (typeof getAll === 'function' ? getAll('orders') : []) || [];
  let maxOrderNum = 0;
  for (const o of allOrders) {
    if (!o || !o.billNo) continue;
    const num = extractBillNumber(o.billNo);
    if (num && num > maxOrderNum) {
      maxOrderNum = num;
    }
  }

  const bcKey = `${tenantName || _currentTenant}_bill_counter`;
  const storedLocal = typeof window !== 'undefined' ? localRestore(bcKey) : undefined;
  const memoryCached = _cache['bill_counter'];

  const candidateCounter = Math.max(
    typeof fallbackCounter === 'number' ? fallbackCounter : 1001,
    typeof storedLocal === 'number' ? storedLocal : 1001,
    typeof memoryCached === 'number' ? memoryCached : 1001,
    maxOrderNum > 0 ? maxOrderNum + 1 : 1001
  );

  return candidateCounter;
}

// ─── Backend payload → cache ────────────────────────────────
function mapUserRow(row) {
  const u = toCamelCase(row);
  u.restaurantName = u.accountId; // legacy field the frontend expects
  return u;
}

// Oldest → newest, the order the app has always assumed
function sortByCreatedAt(list) {
  return [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

// Start of the orders window currently held in the cache (ISO). Older
// ranges are pulled on demand via ensureOrdersSince().
let _ordersLoadedFrom = null;

// When the cache last received a full payload — used to skip the redundant
// sync AppContext fires right after boot/login (it was doubling boot time).
let _lastPayloadAppliedAt = 0;

function applyTenantPayload(payload) {
  if (!payload) return;
  _lastPayloadAppliedAt = Date.now();

  if (payload.menu) _cache['menu'] = payload.menu.map(toCamelCase);
  if (payload.inventory) _cache['inventory'] = payload.inventory.map(toCamelCase);
  if (payload.orders) {
    let orders = payload.orders.map(o => {
      const camel = toCamelCase(o);
      if (!camel.paymentSplits && camel.timestamps?.paymentSplits) {
        camel.paymentSplits = camel.timestamps.paymentSplits;
      }
      if (!camel.history && camel.timestamps?.history) {
        camel.history = camel.timestamps.history;
      }
      return camel;
    });
    if (payload.ordersFrom) {
      // Bounded window from the server: keep any older rows already fetched
      const existing = (_cache['orders'] || []).filter(o =>
        o.createdAt && _ordersLoadedFrom && o.createdAt < payload.ordersFrom && o.createdAt >= _ordersLoadedFrom
      );
      const ids = new Set(orders.map(o => o.id));
      orders = [...orders, ...existing.filter(o => !ids.has(o.id))];
      _ordersLoadedFrom = _ordersLoadedFrom && _ordersLoadedFrom < payload.ordersFrom
        ? _ordersLoadedFrom
        : payload.ordersFrom;
    }
    _cache['orders'] = sortByCreatedAt(orders);
  }
  if (payload.settings) _cache['settings'] = payload.settings;

  if (payload.collections) {
    FLEX_COLLECTIONS.forEach(col => {
      if (payload.collections[col] !== undefined) {
        if (_guestMode && col === 'pos_saved_orders') {
          // In guest mode, do not wipe out cached table order if remote returned empty
          const remoteOrders = payload.collections[col] || {};
          const currentCached = _cache[col] || {};
          _cache[col] = { ...currentCached, ...remoteOrders };
        } else {
          _cache[col] = payload.collections[col];
        }
      } else if (_cache[col] === undefined) {
        _cache[col] = JSON.parse(JSON.stringify(SEEDS[col] !== undefined ? SEEDS[col] : []));
      }
    });
    const bc = payload.collections.bill_counter;
    const remoteCounter = (bc && typeof bc.counter === 'number') ? bc.counter : 1001;
    const dynamicCounter = getNextBillCounter(_currentTenant, remoteCounter);
    _cache['bill_counter'] = Math.max(_cache['bill_counter'] || 1001, dynamicCounter);
    localBackup(`${_currentTenant}_bill_counter`, _cache['bill_counter']);
  }

  // Platform admin gets the global accounts + users lists; everyone else
  // only ever sees their own tenant's users.
  if (payload.accounts) _cache['accounts'] = payload.accounts;
  if (payload.allUsers) {
    _cache['users'] = payload.allUsers.map(mapUserRow);
  } else if (payload.users) {
    _cache['users'] = payload.users.map(mapUserRow);
  }
}

// ─── Sync (refresh cache from backend) ──────────────────────
export async function syncTenantDataFromSupabase(tenantName) {
  if (!isLive()) return;
  // A full payload just landed (boot/login/impersonation) — refetching the
  // exact same data would only slow the first paint down.
  if (Date.now() - _lastPayloadAppliedAt < 3000) return;
  try {
    const mutationsBefore = lastDbMutationAt;
    let payload;
    if (_guestMode) {
      const activeTable = _guestTableParam || guestTableId() || '';
      const q = activeTable ? `?table=${encodeURIComponent(activeTable)}` : '';
      payload = await api.get(`/api/public/qrmenu/${encodeURIComponent(tenantName)}${q}`);
    } else {
      payload = await api.get('/api/data/sync', { tenant: tenantName });
    }
    // A write started or finished while this response was in flight — the
    // payload predates it. Skip; the next sync will carry the fresh state.
    if (_pendingWrites > 0 || lastDbMutationAt !== mutationsBefore) {
      return;
    }
    applyTenantPayload(payload);
  } catch (err) {
    console.error('[DB] sync error:', err);
  }
}

// ─── Targeted single-collection sync ────────────────────────
// Refetch only the collection named in a db_changed broadcast, instead of
// pulling the whole tenant payload. Returns false when it can't (demo,
// guest, or unknown name) so callers fall back to a full sync.
export async function syncOneCollection(name) {
  if (!isLive() || _guestMode || !name) return false;
  try {
    const res = await api.get(`/api/data/collection/${encodeURIComponent(name)}`, { tenant: _currentTenant });
    if (ROW_TABLES.includes(name)) {
      if (name === 'users') {
        _cache['users'] = (res.rows || []).map(mapUserRow);
      } else if (name === 'orders') {
        const windowRows = (res.rows || []).map(o => {
          const camel = toCamelCase(o);
          if (!camel.paymentSplits && camel.timestamps?.paymentSplits) {
            camel.paymentSplits = camel.timestamps.paymentSplits;
          }
          if (!camel.history && camel.timestamps?.history) {
            camel.history = camel.timestamps.history;
          }
          return camel;
        });
        const from = res.ordersFrom;
        // Keep any older orders already fetched for a report view
        const older = (_cache['orders'] || []).filter(o => o.createdAt && from && o.createdAt < from);
        const ids = new Set(windowRows.map(o => o.id));
        _cache['orders'] = sortByCreatedAt([...windowRows, ...older.filter(o => !ids.has(o.id))]);

        // Dynamically re-scan max counter after orders sync
        const nextMax = getNextBillCounter(_currentTenant);
        _cache['bill_counter'] = Math.max(_cache['bill_counter'] || 1001, nextMax);
        localBackup(`${_currentTenant}_bill_counter`, _cache['bill_counter']);
      } else {
        _cache[name] = (res.rows || []).map(toCamelCase);
      }
    } else if (name === 'settings') {
      _cache['settings'] = res.value;
    } else {
      _cache[name] = res.value;
    }
    return true;
  } catch (err) {
    console.error(`[DB] syncOneCollection(${name}) error:`, err);
    return false;
  }
}

// ─── Init — demo seeds or nothing (live waits for login) ────
export async function initDB() {
  if (!isLive()) {
    // Demo mode initialization
    const collections = [
      'settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders',
      'attendance', 'users', 'guests', 'kds_tickets', 'reservations', 'waitlist',
      'online_orders', 'suppliers', 'purchase_orders', 'recipes', 'waste_log',
      'locations', 'audit_log', 'floor_plans', 'modifiers', 'schedules',
      'tip_pools', 'loyalty', 'campaigns', 'cash_drawer', 'register_closures',
      'expenses', 'gift_cards'
    ];
    for (const col of collections) {
      const key = `Kitchgoo_${col}`;
      const localVal = localRestore(key);
      if (localVal !== undefined) {
        _cache[col] = localVal;
      } else {
        _cache[col] = SEEDS[col];
        localBackup(key, SEEDS[col]);
      }
    }
    _cache['users'] = localRestore('users') || [];
    if (_cache['users'].length === 0) {
      const defaultAdmin = {
        id: genId(),
        name: 'Admin',
        email: 'admin@kitchgoo.in',
        password: simpleHash('admin123'),
        role: 'Owner',
        avatar: 'A',
        restaurantName: 'Kitchgoo',
        createdAt: new Date().toISOString(),
      };
      _cache['users'] = [defaultAdmin];
      localBackup('users', _cache['users']);
    }
    _cache['bill_counter'] = getNextBillCounter('Kitchgoo');
    return;
  }

  // Live mode: there is no session yet at boot — the authenticated bootstrap
  // happens in initTenantDB() once AuthContext restores the session.
}

// ─── Tenant DB Initializer (authenticated) ──────────────────
export async function initTenantDB(tenantName) {
  if (!tenantName) return;

  _currentTenant = tenantName;
  _guestMode = false;

  if (!isLive()) {
    // Restore from localStorage under prefix, fallback to SEEDS
    const collections = [
      'settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders',
      'attendance', 'guests', 'kds_tickets', 'reservations', 'waitlist',
      'online_orders', 'suppliers', 'purchase_orders', 'recipes', 'waste_log',
      'locations', 'floor_plans', 'modifiers', 'schedules',
      'tip_pools', 'loyalty', 'campaigns', 'cash_drawer',
      'pos_tables', 'pos_saved_orders', 'register_closures', 'expenses', 'gift_cards'
    ];
    for (const col of collections) {
      const key = `${tenantName}_${col}`;
      const localVal = localRestore(key);
      if (localVal !== undefined) {
        _cache[col] = localVal;
      } else {
        let val = JSON.parse(JSON.stringify(SEEDS[col] || []));
        if (col === 'settings') {
          val = {
            ...SEEDS.settings,
            restaurant: {
              ...SEEDS.settings.restaurant,
              name: tenantName,
              email: `contact@${tenantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            }
          };
        }
        _cache[col] = val;
        localBackup(key, val);
      }
    }
    _cache['bill_counter'] = getNextBillCounter(tenantName);
    return;
  }

  try {
    // One round trip: ensures the account exists, seeds new tenants, and
    // returns everything the cache needs. Tenant scoping happens server-side.
    const payload = await api.get('/api/data/bootstrap', { tenant: tenantName });
    applyTenantPayload(payload);
  } catch (err) {
    console.error('[DB] initTenantDB error:', err);
  }
}

// ─── Guest (public QR menu) initializer ─────────────────────
export async function initGuestTenantDB(tenantName, tableParam = '') {
  if (!tenantName) return;
  _currentTenant = tenantName;
  _guestMode = true;
  _guestTableParam = tableParam || '';

  if (!isLive()) {
    return initTenantDB(tenantName);
  }

  const q = _guestTableParam ? `?table=${encodeURIComponent(_guestTableParam)}` : '';
  const payload = await api.get(`/api/public/qrmenu/${encodeURIComponent(tenantName)}${q}`);

  // Guests get a minimal payload; every other collection falls back to seeds
  FLEX_COLLECTIONS.forEach(col => {
    _cache[col] = JSON.parse(JSON.stringify(SEEDS[col] !== undefined ? SEEDS[col] : []));
  });
  applyTenantPayload(payload);
}

export function isGuestMode() {
  return _guestMode;
}

// Leave the public QR page. Guest mode scopes the shared cache to a single
// table; if it's left on, an authenticated session in the same browser
// reads that partial state (e.g. other tables' carts look empty).
export function exitGuestMode() {
  _guestMode = false;
  _guestTableParam = '';
  try {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('kitchgoo_guest_table');
  } catch {}
}

/**
 * Boot fast path: AuthContext fetches /api/data/bootstrap once (it carries
 * the session user AND the tenant payload) and hands the payload here.
 * Returns false in demo mode so the caller falls back to initTenantDB.
 */
export function applyBootstrapPayload(payload) {
  if (!isLive()) return false;
  if (payload?.tenant) _currentTenant = payload.tenant;
  _guestMode = false;
  applyTenantPayload(payload);
  return true;
}

// ─── On-demand historical orders ─────────────────────────────
// The default payload only carries the recent window. When a report asks
// for an older period, pull the missing range once and widen the window.
export async function ensureOrdersSince(fromDayStr) {
  if (!isLive() || _guestMode || !fromDayStr) return false;
  // fromDayStr is a LOCAL calendar day — convert local midnight to UTC
  const fromDate = new Date(`${fromDayStr}T00:00:00`);
  if (isNaN(fromDate.getTime())) return false;
  const fromIso = fromDate.toISOString();
  if (_ordersLoadedFrom && fromIso >= _ordersLoadedFrom) return false; // already covered

  try {
    const to = _ordersLoadedFrom || undefined;
    const q = to ? `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(to)}` : `?from=${encodeURIComponent(fromIso)}`;
    const { orders } = await api.get(`/api/data/orders${q}`, { tenant: _currentTenant });
    const older = (orders || []).map(toCamelCase);
    const existing = _cache['orders'] || [];
    const ids = new Set(existing.map(o => o.id));
    _cache['orders'] = sortByCreatedAt([...existing, ...older.filter(o => !ids.has(o.id))]);
    _ordersLoadedFrom = fromIso;
    return true;
  } catch (err) {
    console.error('[DB] ensureOrdersSince error:', err);
    return false;
  }
}

// ─── Generic Collection CRUD ────────────────────────────────
export function getAll(collection) {
  return _cache[collection] || [];
}

export function getById(collection, id) {
  const data = getAll(collection);
  if (Array.isArray(data)) return data.find(i => i.id === id) || null;
  return null;
}

export async function insert(collection, data) {
  markMutation();
  const newItem = { createdAt: new Date().toISOString(), ...data };
  if (!newItem.id || String(newItem.id).trim() === '') {
    newItem.id = genId();
  }

  if (collection === 'users') {
    newItem.accountId = newItem.restaurantName || 'Kitchgoo';
    newItem.restaurantName = newItem.accountId; // Keep compatibility
  }

  const items = getAll(collection);
  _cache[collection] = [...items, newItem];

  localBackup(`${_currentTenant}_${collection}`, _cache[collection]);

  if (isLive()) {
    try {
      if (_guestMode) {
        // Guests may only fire KDS tickets; the server appends atomically.
        if (collection === 'kds_tickets') {
          await tracked(api.post(`/api/public/qrmenu/${encodeURIComponent(_currentTenant)}/kds`, { ticket: newItem }));
        }
      } else if (ROW_TABLES.includes(collection)) {
        await tracked(api.post(`/api/data/rows/${collection}`, { item: newItem }, { tenant: _currentTenant }));
      } else {
        // Atomic per-item append — whole-array writes let a stale device
        // silently drop rows other devices just created
        await tracked(api.post(`/api/data/flex/${collection}`, { item: newItem }, { tenant: _currentTenant }));
      }
    } catch (err) {
      console.error(`[DB] Error inserting to ${collection}:`, err);
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      const displayName = newItem.name || newItem.billNo || newItem.title || newItem.id;
      logAudit(
        `${collection}.create`,
        user.id,
        user.name,
        `Added new ${collection}: ${displayName}`
      ).catch(err => console.error('[DB] Failed to log insert audit:', err));
    } catch (e) {
      console.error('[DB] Insert audit logging error:', e);
    }
  }

  return newItem;
}

export async function update(collection, id, data) {
  markMutation();
  const items = getAll(collection);
  let updatedItem = null;

  if (!Array.isArray(items)) {
    const updated = { ...items, ...data };
    _cache[collection] = updated;
    localBackup(`${_currentTenant}_${collection}`, updated);

    if (isLive() && !_guestMode) {
      try {
        await tracked(api.put(`/api/data/collections/${collection}`, { value: updated }, { tenant: _currentTenant }));
      } catch (err) {
        console.error(`[DB] Error updating non-array ${collection}:`, err);
      }
    }
    return updated;
  }

  const updated = items.map(i => {
    if (i.id === id) {
      updatedItem = { ...i, ...data, updatedAt: new Date().toISOString() };
      if (collection === 'users') {
        updatedItem.accountId = updatedItem.restaurantName || updatedItem.accountId || 'Kitchgoo';
        updatedItem.restaurantName = updatedItem.accountId;
      }
      return updatedItem;
    }
    return i;
  });

  _cache[collection] = updated;
  localBackup(`${_currentTenant}_${collection}`, updated);

  if (isLive() && !_guestMode && updatedItem) {
    try {
      if (ROW_TABLES.includes(collection)) {
        await tracked(api.patch(`/api/data/rows/${collection}/${encodeURIComponent(id)}`, { data }, { tenant: _currentTenant }));
      } else {
        // Atomic per-item merge server-side
        await tracked(api.patch(`/api/data/flex/${collection}/${encodeURIComponent(id)}`, { data }, { tenant: _currentTenant }));
      }
    } catch (err) {
      console.error(`[DB] Error updating ${collection}:`, err);
    }
  }
  return updatedItem;
}

export async function remove(collection, id) {
  markMutation();
  const items = getAll(collection).filter(i => i.id !== id);
  _cache[collection] = items;
  localBackup(`${_currentTenant}_${collection}`, items);

  if (isLive() && !_guestMode) {
    try {
      if (ROW_TABLES.includes(collection)) {
        await tracked(api.delete(`/api/data/rows/${collection}/${encodeURIComponent(id)}`, { tenant: _currentTenant }));
      } else {
        // Atomic per-item removal server-side
        await tracked(api.delete(`/api/data/flex/${collection}/${encodeURIComponent(id)}`, { tenant: _currentTenant }));
      }
    } catch (err) {
      console.error(`[DB] Error deleting from ${collection}:`, err);
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      logAudit(
        `${collection}.delete`,
        user.id,
        user.name,
        `Deleted entry from ${collection} with ID: ${id}`
      ).catch(err => console.error('[DB] Failed to log delete audit:', err));
    } catch (e) {
      console.error('[DB] Delete audit logging error:', e);
    }
  }
}

export async function clearCollection(collection) {
  markMutation();
  _cache[collection] = [];
  localBackup(`${_currentTenant}_${collection}`, []);

  if (isLive() && !_guestMode) {
    try {
      if (['menu', 'inventory', 'orders'].includes(collection)) {
        await tracked(api.delete(`/api/data/rows/${collection}`, { tenant: _currentTenant }));
      } else {
        await tracked(api.put(`/api/data/collections/${collection}`, { value: [] }, { tenant: _currentTenant }));
      }
    } catch (err) {
      console.error(`[DB] Error clearing ${collection}:`, err);
    }
  }
}

export async function setCollection(collection, data) {
  markMutation();
  _cache[collection] = data;
  localBackup(`${_currentTenant}_${collection}`, data);

  if (isLive()) {
    try {
      const gtId = guestTableId();
      if (_guestMode && gtId && (collection === 'pos_tables' || collection === 'pos_saved_orders')) {
        // Guests write ONLY their own table; the server merges into the
        // latest stored state so concurrent guests can't clobber each other.
        if (collection === 'pos_tables') {
          const table = (data || []).find(t => String(t.id) === String(gtId));
          if (table) {
            await tracked(api.put(`/api/public/qrmenu/${encodeURIComponent(_currentTenant)}/table/${encodeURIComponent(gtId)}`, { table }));
          }
        } else {
          const savedOrder = data && data[gtId] !== undefined ? data[gtId] : null;
          await tracked(api.put(`/api/public/qrmenu/${encodeURIComponent(_currentTenant)}/table/${encodeURIComponent(gtId)}`, { savedOrder }));
        }
      } else if (!_guestMode) {
        await tracked(api.put(`/api/data/collections/${collection}`, { value: data }, { tenant: _currentTenant }));
      }
    } catch (err) {
      console.error(`[DB] Error setCollection ${collection}:`, err);
      throw err;
    }
  }

  if (collection !== 'audit_log') {
    try {
      const user = getSessionUser();
      logAudit(
        `${collection}.update`,
        user.id,
        user.name,
        `Updated collection: ${collection}`
      ).catch(err => console.error('[DB] Failed to log collection update audit:', err));
    } catch (e) {
      console.error('[DB] Collection audit logging error:', e);
    }
  }
}

// ─── Settings ───────────────────────────────────────────────
export function getSettings() {
  const current = _cache['settings'] || SEEDS.settings;
  if (!current.menuCategories) {
    current.menuCategories = SEEDS.settings.menuCategories;
  }
  if (!current.modules) {
    current.modules = { ...DEFAULT_MODULES };
  } else {
    current.modules = { ...DEFAULT_MODULES, ...current.modules };
  }
  return current;
}

export async function updateSettings(section, data) {
  const settings = getSettings();
  const newSectionValue = Array.isArray(data)
    ? data
    : typeof data === 'object' && !Array.isArray(settings[section])
      ? { ...settings[section], ...data }
      : data;
  const updated = { ...settings, [section]: newSectionValue };
  _cache['settings'] = updated;

  localBackup(`${_currentTenant}_settings`, updated);

  if (isLive() && !_guestMode) {
    try {
      await tracked(api.put(`/api/data/settings/${section}`, { value: newSectionValue }, { tenant: _currentTenant }));
    } catch (err) {
      console.error('[DB] Error updating settings row:', err);
    }
  }

  try {
    const user = getSessionUser();
    logAudit(
      'settings.update',
      user.id,
      user.name,
      `Updated settings section: ${section}`
    ).catch(err => console.error('[DB] Failed to log settings update audit:', err));
  } catch (e) {
    console.error('[DB] Settings audit logging error:', e);
  }

  return updated;
}

// ─── Orders / Transactions ──────────────────────────────────
export async function createOrder(tableId, items, paymentMethod, extra = {}) {
  const bcKey = `${_currentTenant}_bill_counter`;
  const settings = getSettings();
  const billPrefix = settings?.billing?.billPrefix || 'INV';
  const tenantCode = getTenantCode(_currentTenant);

  // 1. Dynamic Max Scan across all existing orders and stored counter
  const baseCounter = getNextBillCounter(_currentTenant);

  // 2. Uniqueness check against all known bills to prevent any collision
  const existingBills = new Set((getAll('orders') || []).map(o => o.billNo).filter(Boolean));
  let counter = baseCounter;
  let candidateBillNo = `${billPrefix}-${tenantCode}-${counter}`;

  while (existingBills.has(candidateBillNo)) {
    counter++;
    candidateBillNo = `${billPrefix}-${tenantCode}-${counter}`;
  }

  // Atomically update memory cache and local backup
  _cache['bill_counter'] = counter + 1;
  localBackup(bcKey, counter + 1);

  const pricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;
  const itemsTotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const gstRate = settings?.billing?.gstRate ?? 5;

  let subtotal = 0;
  let tax = 0;

  if (pricesIncludeGst) {
    tax = gstRate > 0 ? itemsTotal - (itemsTotal / (1 + gstRate / 100)) : 0;
    subtotal = itemsTotal - tax;
  } else {
    subtotal = itemsTotal;
    tax = subtotal * (gstRate / 100);
  }

  const serviceCharge = settings?.billing?.enableServiceCharge
    ? subtotal * ((settings?.billing?.serviceCharge || 0) / 100) : 0;

  let autoGratuity = 0;
  if (settings?.billing?.autoGratuityEnabled && extra.partySize >= (settings?.billing?.autoGratuityThreshold || 6)) {
    const base = settings?.billing?.autoGratuityPreTax ? subtotal : (subtotal + tax);
    autoGratuity = base * ((settings?.billing?.autoGratuityPercent || 18) / 100);
  }

  const discount = extra.discount || 0;
  const comp = extra.comp || 0;
  const tip = extra.tip || 0;
  const rawTotal = subtotal + tax + serviceCharge + autoGratuity - discount - comp + tip;
  const roundingMode = settings?.billing?.roundingMode || 'none';
  const total = roundingMode === 'nearest'
    ? Math.round(rawTotal)
    : roundingMode === 'up'
    ? Math.ceil(rawTotal)
    : parseFloat(rawTotal.toFixed(2));

  const nowIso = new Date().toISOString();

  const walletRedeemed = parseFloat(extra.walletRedeemed || 0);
  let resolvedSplits = extra.paymentSplits;
  let resolvedMethod = paymentMethod;

  if (walletRedeemed > 0) {
    if (!resolvedSplits || resolvedSplits.length === 0) {
      if (total <= walletRedeemed) {
        resolvedSplits = [{ method: 'Wallet', amount: total }];
        resolvedMethod = 'Wallet';
      } else {
        const remaining = Math.max(0, Math.round((total - walletRedeemed) * 100) / 100);
        const otherMethod = (paymentMethod && !paymentMethod.toLowerCase().includes('wallet') && !paymentMethod.toLowerCase().startsWith('split'))
          ? paymentMethod
          : 'Cash';
        resolvedSplits = [
          { method: 'Wallet', amount: walletRedeemed },
          { method: otherMethod, amount: remaining }
        ];
        resolvedMethod = `Split (${otherMethod}: ₹${remaining.toFixed(0)}, Wallet: ₹${walletRedeemed.toFixed(0)})`;
      }
    } else {
      if (!resolvedSplits.some(s => (s.method || '').toLowerCase().includes('wallet'))) {
        resolvedSplits = [
          { method: 'Wallet', amount: walletRedeemed },
          ...resolvedSplits
        ];
      }
    }
  }

  const order = {
    id: genId(),
    billNo: candidateBillNo,
    tableId,
    items: stripItems(items), // store names/prices, not the ordered items' menu images
    subtotal,
    tax,
    taxRate: gstRate,
    pricesIncludeGst,
    serviceCharge,
    autoGratuity,
    discount,
    comp,
    tip,
    total,
    paymentMethod: resolvedMethod,
    orderType: extra.orderType || 'dine-in',
    tokenNumber: extra.tokenNumber || null,
    guestId: extra.guestId || null,
    guestName: extra.guestName || extra.customerName || '',
    guestPhone: extra.customerPhone || extra.guestPhone || '',
    customerName: extra.customerName || extra.guestName || '',
    customerPhone: extra.customerPhone || extra.guestPhone || '',
    walletCredited: extra.walletCredited || 0,
    walletRedeemed: extra.walletRedeemed || 0,
    cashTendered: extra.cashTendered || 0,
    changeReturned: extra.changeReturned || 0,
    serverId: extra.serverId || null,
    serverName: extra.serverName || '',
    partySize: extra.partySize || 1,
    status: extra.status || 'paid',
    paymentStatus: extra.paymentStatus || (extra.status === 'pending_payment' ? 'unpaid' : (extra.status === 'voided' ? 'voided' : 'paid')),
    voidReason: extra.voidReason || '',
    voidedAt: extra.voidedAt || (extra.status === 'voided' ? nowIso : null),
    voidedBy: extra.voidedBy || (extra.status === 'voided' ? (extra.serverName || 'Staff') : null),
    compReason: extra.compReason || '',
    discountReason: extra.discountReason || '',
    discountAppliedAt: extra.discountAppliedAt || (discount > 0 ? nowIso : null),
    discountAppliedBy: extra.discountAppliedBy || (discount > 0 ? (extra.serverName || 'Staff') : null),
    courseFiring: extra.courseFiring || [],
    paidAt: extra.paidAt !== undefined ? extra.paidAt : ((extra.status === 'voided' || extra.status === 'pending_payment') ? null : nowIso),
    closedAt: extra.closedAt !== undefined ? extra.closedAt : (extra.status === 'pending_payment' ? null : nowIso),
    settledAt: extra.settledAt !== undefined ? extra.settledAt : ((extra.status === 'voided' || extra.status === 'pending_payment') ? null : nowIso),
    orderPlacedAt: extra.orderPlacedAt || extra.seatedAt || nowIso,
    ticketPrintedAt: extra.ticketPrintedAt || null,
    foodBumpedAt: extra.foodBumpedAt || null,
    kdsTicketIds: extra.kdsTicketIds || [],
    timestamps: {
      ordered: extra.orderPlacedAt || extra.seatedAt || nowIso,
      ticketPrinted: extra.ticketPrintedAt || null,
      foodBumped: extra.foodBumpedAt || null,
      paid: extra.status === 'voided' ? null : nowIso,
      paymentSplits: extra.paymentSplits || null,
      history: Array.isArray(extra.history) ? extra.history : [],
      ...(extra.timestamps || {})
    },
    paymentSplits: extra.paymentSplits || null,
    history: Array.isArray(extra.history) ? extra.history : (extra.timestamps?.history || []),
    createdAt: extra.createdAt || nowIso,
  };

  const newOrders = [...getAll('orders'), order];
  _cache['orders'] = newOrders;
  _cache['bill_counter'] = counter + 1;

  localBackup(`${_currentTenant}_orders`, newOrders);
  localBackup(bcKey, counter + 1);

  if (isLive() && !_guestMode) {
    try {
      const [orderRes] = await tracked(Promise.all([
        api.post('/api/data/rows/orders', { item: order }, { tenant: _currentTenant }),
        api.put('/api/data/collections/bill_counter', { value: { counter: counter + 1 } }, { tenant: _currentTenant }),
      ]));
      if (orderRes?.billNo && orderRes.billNo !== order.billNo) {
        order.billNo = orderRes.billNo;
        const freshCounter = extractBillNumber(orderRes.billNo);
        if (freshCounter) {
          _cache['bill_counter'] = Math.max(_cache['bill_counter'] || 1001, freshCounter + 1);
          localBackup(bcKey, _cache['bill_counter']);
        }
      }
    } catch (err) {
      console.error('[DB] createOrder API error:', err);
    }
  }

  return order;
}

export function getOrdersByDate(dateStr) {
  // dateStr is a LOCAL calendar day; createdAt timestamps are UTC ISO strings
  return getAll('orders').filter(o => o.createdAt && localDayStr(o.createdAt) === dateStr);
}

export function getTodayStats() {
  const today = todayLocalStr();
  const allTodayOrders = getOrdersByDate(today);
  const todayOrders = allTodayOrders.filter(o => {
    const s = (o.status || '').toLowerCase();
    return s !== 'voided' && s !== 'cancelled' && s !== 'reopened';
  });
  const gross = todayOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  const orderCount = todayOrders.length;
  const avg = orderCount > 0 ? gross / orderCount : 0;
  const tips = todayOrders.reduce((s, o) => s + (parseFloat(o.tip) || 0), 0);
  const comps = todayOrders.reduce((s, o) => s + (parseFloat(o.comp) || 0), 0);
  const discounts = todayOrders.reduce((s, o) => s + (parseFloat(o.discount) || 0), 0);
  return { gross, orderCount, avg, tips, comps, discounts, orders: todayOrders };
}

// ─── Inventory Helpers ───────────────────────────────────────
export function computeStockStatus(stock, min) {
  const threshold = (min !== undefined && min !== null && min > 0)
    ? min
    : (getSettings()?.operations?.lowStockThreshold ?? 5);
  if (stock <= 0) return 'critical';
  if (stock < threshold * 0.5) return 'critical';
  if (stock < threshold) return 'low';
  return 'good';
}

export async function receiveStock(id, quantity) {
  const item = getById('inventory', id);
  if (!item) return null;
  const newStock = item.stock + quantity;
  return update('inventory', id, {
    stock: newStock,
    status: computeStockStatus(newStock, item.min),
    lastUpdated: new Date().toISOString(),
  });
}

export function convertQty(qty, fromUnit, toUnit) {
  const q = parseFloat(qty) || 0;
  if (!fromUnit || !toUnit || fromUnit === toUnit) return q;

  const f = fromUnit.toLowerCase();
  const t = toUnit.toLowerCase();

  // Weight conversions
  if ((f === 'kg' && t === 'g') || (f === 'l' && t === 'ml')) return q * 1000;
  if ((f === 'g' && t === 'kg') || (f === 'ml' && t === 'l')) return q / 1000;

  return q;
}

export async function depleteInventoryForOrder(orderItems) {
  const menu = getAll('menu');
  const inventory = getAll('inventory');
  const recipes = getAll('recipes');
  for (const orderItem of orderItems) {
    const menuItem = menu.find(m => m.name === orderItem.name);
    if (menuItem && menuItem.ingredients && menuItem.ingredients.length > 0) {
      for (const ing of menuItem.ingredients) {
        const invItem = inventory.find(i => i.id === ing.itemId);
        if (invItem) {
          const qtyInItemUnit = convertQty(ing.qty, ing.unit || invItem.unit, invItem.unit) * orderItem.qty;
          const newStock = Math.max(0, invItem.stock - qtyInItemUnit);
          await update('inventory', invItem.id, {
            stock: newStock,
            status: computeStockStatus(newStock, invItem.min),
            lastUpdated: new Date().toISOString(),
          });
        }
      }
    } else {
      const recipe = recipes.find(r => r.menuItemName === orderItem.name);
      if (recipe) {
        for (const ing of recipe.ingredients) {
          const invItem = inventory.find(i => i.name === ing.inventoryItem);
          if (invItem) {
            const qtyInItemUnit = convertQty(ing.qty, ing.unit || invItem.unit, invItem.unit) * orderItem.qty;
            const newStock = Math.max(0, invItem.stock - qtyInItemUnit);
            await update('inventory', invItem.id, {
              stock: newStock,
              status: computeStockStatus(newStock, invItem.min),
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      }
    }
  }
}

// ─── Attendance ──────────────────────────────────────────────
// `meta` may carry { name, lat, lng } — name lets views resolve a person even
// when they have no staff row (e.g. an owner), and lat/lng is a geofence audit trail.
export async function logAttendance(staffId, type, meta = {}) {
  return insert('attendance', {
    staffId,
    type,
    timestamp: new Date().toISOString(),
    date: todayLocalStr(), // shift date = the LOCAL business day
    ...meta,
  });
}

export function getAttendanceForStaff(staffId) {
  return getAll('attendance').filter(a => a.staffId === staffId);
}

// ─── Delivery Orders ─────────────────────────────────────────
export async function addDeliveryOrder(order) {
  return insert('delivery_orders', { ...order, status: order.status || 'new' });
}

export async function updateDeliveryStatus(id, status) {
  return update('delivery_orders', id, { status });
}

// ─── KDS Tickets ─────────────────────────────────────────────
export async function createKDSTicket(orderId, items, tableId, orderType, extra = {}) {
  // Derive the ticket's station from its items so station-filtered KDS screens
  // actually receive it. If every item shares one station, route the whole ticket
  // there; mixed or unconfigured items fall back to 'all' (a wildcard shown everywhere).
  const stations = [...new Set((items || []).map(i => (i.station || '').trim()).filter(Boolean))];
  const ticketStation = stations.length === 1 ? stations[0] : 'all';
  return insert('kds_tickets', {
    orderId,
    items: stripItems(items.map(i => ({ ...i, status: 'pending', bumpedAt: null }))),
    tableId,
    tokenNumber: extra?.tokenNumber || (typeof tableId === 'string' && tableId.startsWith('token_') ? tableId.replace('token_', '') : null),
    guestName: extra?.guestName || null,
    customerName: extra?.guestName || null,
    orderType: orderType || 'dine-in',
    status: 'active',
    station: ticketStation,
    priority: 'normal',
    notes: extra?.notes || null,
    allergyAlert: items.some(i => i.allergens?.length > 0),
    allergens: items.flatMap(i => i.allergens || []),
    courseFiring: [],
    firedAt: new Date().toISOString(),
  });
}

export async function bumpKDSItem(ticketId, itemIndex) {
  const ticket = getById('kds_tickets', ticketId);
  if (!ticket) return;
  const nowIso = new Date().toISOString();
  const items = [...ticket.items];
  items[itemIndex] = { ...items[itemIndex], status: 'bumped', bumpedAt: nowIso };
  const allBumped = items.every(i => i.status === 'bumped');
  const updateData = {
    items,
    status: allBumped ? 'completed' : 'active',
    updatedAt: nowIso,
  };
  if (allBumped) {
    updateData.bumpedAt = nowIso;
    updateData.completedAt = nowIso;
  }
  return update('kds_tickets', ticketId, updateData);
}

export async function bumpKDSTicket(ticketId) {
  const ticket = getById('kds_tickets', ticketId);
  if (!ticket) return;
  const nowIso = new Date().toISOString();
  const items = ticket.items.map(i => ({ ...i, status: 'bumped', bumpedAt: nowIso }));
  return update('kds_tickets', ticketId, {
    items,
    status: 'completed',
    bumpedAt: nowIso,
    completedAt: nowIso,
    updatedAt: nowIso,
  });
}

export async function recallKDSTicket(ticketId) {
  return update('kds_tickets', ticketId, {
    status: 'active',
    bumpedAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function transferKDSTickets(fromTableId, toTableId, fromTableNum, toTableNum) {
  const tickets = getAll('kds_tickets') || [];
  const fromMatches = [
    String(fromTableId),
    String(fromTableNum),
    fromTableId ? String(fromTableId).replace(/^tab_/, '') : null,
    fromTableNum ? `Token #${fromTableNum}` : null,
  ].filter(Boolean);
  const activeTickets = tickets.filter(t =>
    t.status === 'active' && (
      fromMatches.includes(String(t.tableId)) ||
      (t.tokenNumber && fromMatches.includes(String(t.tokenNumber)))
    )
  );
  for (const ticket of activeTickets) {
    await update('kds_tickets', ticket.id, {
      tableId: toTableId,
      tableShiftedFrom: fromTableNum || fromTableId,
      tableShiftedTo: toTableNum || toTableId,
      shiftedAt: new Date().toISOString(),
    });
  }
  return activeTickets.length;
}

export async function cancelKDSTickets(tableId, tableNum) {
  const tickets = getAll('kds_tickets') || [];
  const matches = [
    String(tableId),
    String(tableNum),
    tableId ? String(tableId).replace(/^tab_/, '') : null,
    tableNum ? `Token #${tableNum}` : null,
  ].filter(Boolean);
  const activeTickets = tickets.filter(t =>
    t.status === 'active' && (
      matches.includes(String(t.tableId)) ||
      (t.tokenNumber && matches.includes(String(t.tokenNumber)))
    )
  );
  for (const ticket of activeTickets) {
    await update('kds_tickets', ticket.id, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });
  }
  return activeTickets.length;
}

// ─── Reservations ────────────────────────────────────────────
export async function createReservation(data) {
  return insert('reservations', {
    ...data,
    status: 'confirmed',
    smsStatus: 'sent',
  });
}

export async function addToWaitlist(data) {
  return insert('waitlist', {
    ...data,
    status: 'waiting',
    addedAt: new Date().toISOString(),
    notifiedAt: null,
  });
}

// ─── Audit Log ───────────────────────────────────────────────
export async function logAudit(action, userId, userName, details) {
  let ip = 'local';
  try {
    if (typeof window !== 'undefined') {
      if (!window.__clientIp) {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (data && data.ip) {
          window.__clientIp = data.ip;
        }
      }
      ip = window.__clientIp || 'local';
    }
  } catch (err) {
    console.warn('[DB] Failed to fetch public IP:', err);
  }

  return insert('audit_log', {
    action,
    userId,
    userName,
    details,
    timestamp: new Date().toISOString(),
    ip,
  });
}

// ─── Waste Log ───────────────────────────────────────────────
export async function logWaste(data) {
  // Deduct from inventory stock
  const inventory = getAll('inventory') || [];
  const item = inventory.find(i => i.id === data.itemId);
  if (item) {
    const qtyInItemUnit = convertQty(data.qty, data.unit || item.unit, item.unit);
    const newStock = Math.max(0, item.stock - qtyInItemUnit);
    await update('inventory', item.id, {
      stock: newStock,
      status: computeStockStatus(newStock, item.min),
      lastUpdated: new Date().toISOString()
    });
  }

  return insert('waste_log', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ─── Cash Drawer ─────────────────────────────────────────────
export async function updateCashDrawer(data) {
  const current = getAll('cash_drawer') || SEEDS.cash_drawer;
  const updated = { ...current, ...data };
  _cache['cash_drawer'] = updated;

  localBackup(`${_currentTenant}_cash_drawer`, updated);

  if (isLive() && !_guestMode) {
    try {
      await tracked(api.put('/api/data/collections/cash_drawer', { value: updated }, { tenant: _currentTenant }));
    } catch (err) {
      console.error('[DB] Error updating cash drawer:', err);
    }
  }
  return updated;
}

// ─── Atomic per-table POS state ──────────────────────────────
// Used by the AppContext persistence layer instead of whole-collection PUTs:
// the server merges a single table's slice into the latest stored state, so
// a device holding a stale snapshot can never revert other tables — or this
// one — by writing the whole array.

export function setLocalCollection(collection, data) {
  _cache[collection] = data;
  localBackup(`${_currentTenant}_${collection}`, data);
}

export async function saveTableState(tableId, table) {
  markMutation();
  const current = getAll('pos_tables') || [];
  let found = false;
  const next = current.map(t => {
    if (String(t.id) === String(tableId)) { found = true; return { ...t, ...table, id: t.id }; }
    return t;
  });
  if (!found) next.push({ ...table, id: table.id ?? tableId });
  _cache['pos_tables'] = next;
  localBackup(`${_currentTenant}_pos_tables`, next);

  if (!isLive()) return;
  try {
    if (_guestMode) {
      await tracked(api.put(`/api/public/qrmenu/${encodeURIComponent(_currentTenant)}/table/${encodeURIComponent(tableId)}`, { table }));
    } else {
      await tracked(api.put(`/api/data/tables/${encodeURIComponent(tableId)}`, { table }, { tenant: _currentTenant }));
    }
  } catch (err) {
    console.error('[DB] Error saving table state:', err);
  }
}

export async function saveTableOrder(tableId, savedOrder) {
  markMutation();
  let lean;
  if (Array.isArray(savedOrder)) {
    lean = stripItems(savedOrder);
  } else if (savedOrder && Array.isArray(savedOrder.items)) {
    lean = { ...savedOrder, items: stripItems(savedOrder.items) };
  } else {
    lean = savedOrder ?? null;
  }

  const current = getAll('pos_saved_orders') || {};
  const next = { ...(current || {}) };
  if (lean === null) {
    delete next[tableId];
  } else {
    next[tableId] = lean;
  }
  _cache['pos_saved_orders'] = next;
  localBackup(`${_currentTenant}_pos_saved_orders`, next);

  if (!isLive()) return;
  try {
    if (_guestMode) {
      await tracked(api.put(`/api/public/qrmenu/${encodeURIComponent(_currentTenant)}/table/${encodeURIComponent(tableId)}`, { savedOrder: lean }));
    } else {
      await tracked(api.put(`/api/data/table-orders/${encodeURIComponent(tableId)}`, { savedOrder: lean }, { tenant: _currentTenant }));
    }
  } catch (err) {
    console.error('[DB] Error saving table order:', err);
  }
}

// ─── Gift Cards & Phone-Linked Digital Wallet ───────────────
export async function issueGiftCardCredit({
  guestPhone = '',
  guestName = '',
  guestId = null,
  amount = 0,
  orderId = null,
  billNo = '',
  staffName = 'Staff',
  cashTendered = 0,
  billTotal = 0,
  notes = 'Extra cash change converted to digital wallet'
}) {
  const numAmount = parseFloat(amount) || 0;
  if (numAmount <= 0) return null;

  const cleanPhone = (guestPhone || '').trim();
  const allGuests = getAll('guests') || [];
  let guest = null;

  if (guestId) {
    guest = allGuests.find(g => g.id === guestId);
  }
  if (!guest && cleanPhone) {
    guest = allGuests.find(g => (g.phone || '').trim() === cleanPhone);
  }
  if (!guest && guestName && !cleanPhone) {
    guest = allGuests.find(g => (g.name || '').trim().toLowerCase() === guestName.trim().toLowerCase());
  }

  const prevBalance = parseFloat(guest?.walletBalance || 0);
  const newBalance = Math.round((prevBalance + numAmount) * 100) / 100;
  const nowIso = new Date().toISOString();

  if (guest) {
    const updated = {
      ...guest,
      name: guest.name || guestName || 'Guest',
      phone: guest.phone || cleanPhone,
      walletBalance: newBalance,
      totalCreditIssued: Math.round(((parseFloat(guest.totalCreditIssued || 0)) + numAmount) * 100) / 100,
      updatedAt: nowIso
    };
    await update('guests', guest.id, updated);
    guest = updated;
  } else {
    guest = {
      id: genId(),
      name: guestName || (cleanPhone ? `Guest (${cleanPhone.slice(-4)})` : 'Guest'),
      phone: cleanPhone,
      email: '',
      walletBalance: newBalance,
      totalCreditIssued: numAmount,
      totalCreditRedeemed: 0,
      loyaltyPoints: 0,
      loyaltyTier: 'Bronze',
      visitCount: 1,
      totalSpend: parseFloat(billTotal) || 0,
      lastVisit: nowIso,
      createdAt: nowIso
    };
    await insert('guests', guest);
  }

  const tx = {
    id: genId(),
    type: 'issue',
    guestId: guest.id,
    guestPhone: guest.phone || cleanPhone,
    guestName: guest.name,
    amount: numAmount,
    previousBalance: prevBalance,
    balanceAfter: newBalance,
    orderId,
    billNo,
    cashTendered: parseFloat(cashTendered) || 0,
    billTotal: parseFloat(billTotal) || 0,
    staffName,
    notes,
    createdAt: nowIso
  };

  await insert('gift_cards', tx);
  return { transaction: tx, guest };
}

export async function redeemGiftCardCredit({
  guestPhone = '',
  guestId = null,
  amount = 0,
  orderId = null,
  billNo = '',
  staffName = 'Staff',
  notes = 'Redeemed towards bill payment'
}) {
  const numAmount = parseFloat(amount) || 0;
  if (numAmount <= 0) return null;

  const allGuests = getAll('guests') || [];
  let guest = null;

  if (guestId) {
    guest = allGuests.find(g => g.id === guestId);
  }
  if (!guest && guestPhone) {
    const cleanPhone = (guestPhone || '').trim();
    guest = allGuests.find(g => (g.phone || '').trim() === cleanPhone);
  }

  if (!guest) return null;

  const prevBalance = parseFloat(guest.walletBalance || 0);
  const actualDeduct = Math.min(prevBalance, numAmount);
  if (actualDeduct <= 0) return null;

  const newBalance = Math.round((prevBalance - actualDeduct) * 100) / 100;
  const nowIso = new Date().toISOString();

  const updated = {
    ...guest,
    walletBalance: newBalance,
    totalCreditRedeemed: Math.round(((parseFloat(guest.totalCreditRedeemed || 0)) + actualDeduct) * 100) / 100,
    updatedAt: nowIso
  };
  await update('guests', guest.id, updated);

  const tx = {
    id: genId(),
    type: 'redeem',
    guestId: guest.id,
    guestPhone: guest.phone,
    guestName: guest.name,
    amount: actualDeduct,
    previousBalance: prevBalance,
    balanceAfter: newBalance,
    orderId,
    billNo,
    staffName,
    notes,
    createdAt: nowIso
  };

  await insert('gift_cards', tx);
  return { transaction: tx, guest: updated, amountRedeemed: actualDeduct };
}

