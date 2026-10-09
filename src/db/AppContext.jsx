/**
 * AppContext — Global React state backed by the database layer.
 * All pages can access and mutate shared data from here.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import {
  getAll,
  getSettings,
  insert,
  update,
  remove,
  setCollection,
  clearCollection,
  computeStockStatus,
  logAttendance,
  getAttendanceForStaff,
  createOrder,
  getTodayStats,
  updateSettings as dbUpdateSettings,
  addDeliveryOrder,
  updateDeliveryStatus,
  createKDSTicket,
  bumpKDSItem,
  bumpKDSTicket,
  recallKDSTicket,
  transferKDSTickets,
  cancelKDSTickets,
  createReservation,
  addToWaitlist,
  logAudit,
  logWaste,
  depleteInventoryForOrder,
  updateCashDrawer,
  genId,
  getCurrentTenant,
  getTenantCode,
  syncTenantDataFromSupabase,
  syncOneCollection,
  lastDbMutationAt,
  setLocalCollection,
  saveTableState,
  saveTableOrder,
  isGuestMode,
  ensureOrdersSince,
  issueGiftCardCredit,
  redeemGiftCardCredit,
} from './database';

const AppContext = createContext(null);

// Key-order-insensitive serialization for change detection. Postgres JSONB
// reorders object keys, so plain JSON.stringify sees phantom diffs between
// synced and locally-built objects and re-pushes unchanged tables.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function cleanTableId(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/(\d)o\b/gi, '$10').replace(/\bo(\d)/gi, '0$1');
  s = s.replace(/^(table|tbl|t|#|\s|-|_)+/i, '').trim();
  if (/^0+[1-9]\d*$/.test(s)) {
    s = s.replace(/^0+/, '');
  }
  return s;
}

// Robust table matching helper to handle any floor plan vs saved table mismatch
export function matchTableEntry(p, t) {
  if (!p || !t) return false;
  const pId = String(p.id ?? '').trim().toLowerCase();
  const tId = String(t.id ?? '').trim().toLowerCase();
  if (pId && tId && pId === tId) return true;

  const pNum = String(p.number ?? '').trim().toLowerCase();
  const tNum = String(t.number ?? '').trim().toLowerCase();
  if (pNum && tNum && pNum === tNum) return true;

  const pIdClean = cleanTableId(pId);
  const tIdClean = cleanTableId(tId);
  const pNumClean = cleanTableId(pNum);
  const tNumClean = cleanTableId(tNum);

  if (pIdClean && tIdClean && pIdClean === tIdClean) return true;
  if (pIdClean && tNumClean && pIdClean === tNumClean) return true;
  if (pNumClean && tIdClean && pNumClean === tIdClean) return true;
  if (pNumClean && tNumClean && pNumClean === tNumClean) return true;

  const pLabel = cleanTableId(p.label || p.name);
  const tLabel = cleanTableId(t.label || t.name);
  if (pLabel && tLabel && pLabel === tLabel) return true;
  if (pLabel && (pLabel === tIdClean || pLabel === tNumClean)) return true;
  if (tLabel && (tLabel === pIdClean || tLabel === pNumClean)) return true;

  return false;
}

// The floor shown in POS = the floor-plan LAYOUT (all tables) merged with
// saved per-table state (status/guest). Used both by the floorPlans effect
// and by hydrateFromCache so a targeted pos_tables refresh always rebuilds
// the full floor — never leaves it as a partial saved-state array.
export function buildPosTables(fp, savedTables) {
  const base = ((fp && fp.tables) || []).map(t => ({
    id: t.id || t.number,
    number: t.number || t.id,
    label: t.label || t.name || (t.number ? `Table ${t.number}` : `Table ${t.id}`),
    name: t.label || t.name || (t.number ? `Table ${t.number}` : `Table ${t.id}`),
    seats: t.seats || t.capacity || 4,
    shape: t.shape || 'square',
    section: t.section || t.sectionId || null,
    status: 'available',
    guestName: null,
    guestId: null,
    seatedAt: null,
    serverId: t.serverId || null,
  }));
  const saved = savedTables || [];
  const matchedSavedIndices = new Set();

  const mergedBase = base.map(t => {
    let matchedSaved = null;
    for (let i = 0; i < saved.length; i++) {
      if (matchTableEntry(saved[i], t)) {
        matchedSaved = saved[i];
        matchedSavedIndices.add(i);
        break;
      }
    }
    if (matchedSaved) {
      return {
        ...t,
        ...matchedSaved,
        id: t.id,
        number: t.number || matchedSaved.number || t.id,
      };
    }
    return t;
  });

  const extraSaved = [];
  for (let i = 0; i < saved.length; i++) {
    if (!matchedSavedIndices.has(i)) {
      const s = saved[i];
      // Prevent duplicate ghost tables matching existing floor plan tables by clean ID/number
      const sClean = cleanTableId(s.number || s.id);
      const isDuplicateOfBase = mergedBase.some(b => cleanTableId(b.number || b.id) === sClean);
      if (isDuplicateOfBase) continue;

      extraSaved.push({
        seats: 4,
        shape: 'square',
        section: null,
        status: 'available',
        ...s,
        id: s.id,
        number: s.number || s.id,
      });
    }
  }

  return [...mergedBase, ...extraSaved];
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [todayStats, setTodayStats] = useState({ gross: 0, orderCount: 0, avg: 0, orders: [] });
  const [kdsTickets, setKdsTickets] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [wasteLog, setWasteLog] = useState([]);
  const [locations, setLocations] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [floorPlans, setFloorPlans] = useState({ tables: [], sections: [] });
  const [modifiers, setModifiers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [tipPools, setTipPools] = useState([]);
  const [loyalty, setLoyalty] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [guests, setGuests] = useState([]);
  const [cashDrawer, setCashDrawer] = useState({});
  const [registerClosures, setRegisterClosures] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [giftCards, setGiftCards] = useState([]);

  const { user, loading: authLoading } = useAuth();

  const [posTables, setPosTables] = useState([]);
  const [posSavedOrders, setPosSavedOrders] = useState({});

  const [hasLoadedFromDb, setHasLoadedFromDb] = useState(false);
  const [activeTenant, setActiveTenant] = useState(null);
  const channelRef = useRef(null);
  const lastMutationAt = useRef(0);
  const realtimeConnectedRef = useRef(false);
  const subscribedOnceRef = useRef(false);
  const lastReconcileAt = useRef(0);

  useEffect(() => {
    if (authLoading || !hasLoadedFromDb) return;
    const tenant = getCurrentTenant();
    localStorage.setItem(`${tenant}_pos_tables`, JSON.stringify(posTables));
    if (!tenant) return;

    const cached = getAll('pos_tables') || [];
    if (stableStringify(cached) === stableStringify(posTables)) return;
    lastMutationAt.current = Date.now();

    const isDemo = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (!supabase || isDemo) {
      setCollection('pos_tables', posTables).catch(err => console.error("Error saving pos_tables:", err));
      return;
    }

    // Live mode: push ONLY the tables that changed, each as an atomic
    // server-side merge. Whole-array writes let a stale device revert
    // every other table (the "table clears itself after KOT" bug).
    let changed = posTables.filter(t => {
      const prev = cached.find(c => String(c.id) === String(t.id));
      return !prev || stableStringify(prev) !== stableStringify(t);
    });
    if (isGuestMode()) {
      const gtId = window.sessionStorage.getItem('kitchgoo_guest_table');
      changed = changed.filter(t => String(t.id) === String(gtId));
    }
    setLocalCollection('pos_tables', posTables);
    changed.forEach(t => { saveTableState(t.id, t); });
  }, [posTables, authLoading, hasLoadedFromDb]);

  useEffect(() => {
    if (authLoading || !hasLoadedFromDb) return;
    const tenant = getCurrentTenant();
    localStorage.setItem(`${tenant}_pos_saved_orders`, JSON.stringify(posSavedOrders));
    if (!tenant) return;

    const cached = getAll('pos_saved_orders');
    const cachedObj = (cached && !Array.isArray(cached)) ? cached : {};
    if (stableStringify(cachedObj) === stableStringify(posSavedOrders)) return;
    lastMutationAt.current = Date.now();

    const isDemo = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (!supabase || isDemo) {
      setCollection('pos_saved_orders', posSavedOrders).catch(err => console.error("Error saving pos_saved_orders:", err));
      return;
    }

    // Live mode: per-table atomic merge (null clears the table's order)
    let changedIds = [...new Set([...Object.keys(cachedObj), ...Object.keys(posSavedOrders || {})])]
      .filter(id => stableStringify(cachedObj[id]) !== stableStringify((posSavedOrders || {})[id]));
    if (isGuestMode()) {
      const gtId = window.sessionStorage.getItem('kitchgoo_guest_table');
      changedIds = changedIds.filter(id => String(id) === String(gtId));
    }
    setLocalCollection('pos_saved_orders', posSavedOrders);
    changedIds.forEach(id => { saveTableOrder(id, (posSavedOrders || {})[id] ?? null); });
  }, [posSavedOrders, authLoading, hasLoadedFromDb]);

  // Rebuild the displayed floor whenever the layout changes
  useEffect(() => {
    if (authLoading) return;
    const tenant = getCurrentTenant();
    let currentSaved = [];
    const isDemoMode = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (!supabase || isDemoMode) {
      try {
        const savedStr = localStorage.getItem(`${tenant}_pos_tables`);
        if (savedStr) currentSaved = JSON.parse(savedStr);
      } catch {}
    } else {
      currentSaved = getAll('pos_tables') || [];
    }
    setPosTables(buildPosTables(floorPlans || { tables: [] }, currentSaved));
  }, [floorPlans, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    const isQrPage = typeof window !== 'undefined' && window.location?.pathname?.startsWith('/qrmenu/');
    if (isQrPage && isGuestMode()) return;
    reload();
  }, [user, authLoading]);

  useEffect(() => {
    setReady(true);
  }, []);

  // Push whatever is already in the in-memory cache into React state.
  // Pure local work — no network, so it's cheap to call after a targeted
  // single-collection fetch.
  const hydrateFromCache = () => {
    const tenant = getCurrentTenant();
    setStaff(getAll('staff'));
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    setMenu(getAll('menu'));
    setOrders(getAll('orders'));
    setDeliveryOrders(getAll('delivery_orders'));
    setSettings(getSettings());
    setTodayStats(getTodayStats());
    setKdsTickets(getAll('kds_tickets'));
    setReservations(getAll('reservations'));
    setWaitlist(getAll('waitlist'));
    setOnlineOrders(getAll('online_orders'));
    setSuppliers(getAll('suppliers'));
    setPurchaseOrders(getAll('purchase_orders'));
    setRecipes(getAll('recipes'));
    setWasteLog(getAll('waste_log'));
    setLocations(getAll('locations'));
    setAuditLog(getAll('audit_log'));
    const fp = getAll('floor_plans');
    setFloorPlans(fp && fp.tables ? fp : { tables: [], sections: [] });
    setModifiers(getAll('modifiers'));
    setSchedules(getAll('schedules'));
    setTipPools(getAll('tip_pools'));
    setLoyalty(getAll('loyalty') || {});
    setCampaigns(getAll('campaigns'));
    setGuests(getAll('guests'));
    setCashDrawer(getAll('cash_drawer') || {});
    setRegisterClosures(getAll('register_closures') || []);
    setAttendance(getAll('attendance'));
    setExpenses(getAll('expenses') || []);
    setGiftCards(getAll('gift_cards') || []);

    const isDemoMode = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (!supabase || isDemoMode) {
      try {
        const savedTables = localStorage.getItem(`${tenant}_pos_tables`);
        setPosTables(savedTables ? JSON.parse(savedTables) : []);
      } catch { setPosTables([]); }
      try {
        const savedOrders = localStorage.getItem(`${tenant}_pos_saved_orders`);
        setPosSavedOrders(savedOrders ? JSON.parse(savedOrders) : {});
      } catch { setPosSavedOrders({}); }
    } else {
      // Always the full floor (layout + saved state), never the raw partial
      // saved-state array — otherwise a targeted refresh could shrink the floor.
      setPosTables(buildPosTables(getAll('floor_plans'), getAll('pos_tables')));
      setPosSavedOrders(getAll('pos_saved_orders') || {});
    }

    setActiveTenant(tenant);
    setHasLoadedFromDb(true);
  };

  // Platform admin's cross-tenant audit log — a separate, admin-only fetch.
  const refreshAdminAuditLog = async () => {
    const tenant = getCurrentTenant();
    const isDemo = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (tenant === 'Kitchgoo' && user && supabase && !isDemo) {
      try {
        const { auditLog: combinedLogs } = await api.get('/api/data/audit-all');
        setAuditLog(combinedLogs || []);
      } catch (err) {
        console.error('[DB] Failed to fetch all audit logs:', err);
      }
    }
  };

  // Full sync: pull the entire tenant payload, then hydrate. Used on boot,
  // login, tenant switch, and as the realtime-disconnected fallback.
  const reload = async (force = false) => {
    const tenant = getCurrentTenant();
    if (tenant) {
      await syncTenantDataFromSupabase(tenant, force);
    }
    hydrateFromCache();
    await refreshAdminAuditLog();
  };

  // Targeted refresh: fetch ONLY the changed collection, then hydrate from
  // cache. Falls back to a full reload if the single-collection fetch can't
  // run (e.g. guest mode). This is what a db_changed broadcast triggers.
  const refreshCollection = async (name) => {
    const ok = await syncOneCollection(name);
    if (!ok) { await reload(); return; }
    hydrateFromCache();
    if (name === 'audit_log') await refreshAdminAuditLog();
  };
  // Apply Appearance Settings globally
  useEffect(() => {
    if (settings && settings.appearance) {
      const { theme, accentColor, compactMode } = settings.appearance;
      const root = document.documentElement;
      
      // Theme
      if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        root.removeAttribute('data-theme');
      }

      // Accent Color
      if (accentColor) {
        root.style.setProperty('--primary', accentColor);
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', accentColor);
        }
      } else {
        root.style.removeProperty('--primary');
      }

      // Compact Mode
      if (compactMode) {
        root.classList.add('compact-mode');
      } else {
        root.classList.remove('compact-mode');
      }
    }
  }, [settings]);

  // Set up realtime updates across all database tables for the active tenant
  useEffect(() => {
    if (authLoading || !hasLoadedFromDb || !activeTenant) return;
    if (!supabase) return;

    const isDemoMode = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (isDemoMode) {
      const handleStorage = (e) => {
        if (e.key && e.key.includes(`${activeTenant}_`)) {
          reload(true);
        }
      };
      window.addEventListener('storage', handleStorage);
      return () => window.removeEventListener('storage', handleStorage);
    }

    const onChange = async (msg) => {
      const table = msg?.payload?.table;
      if (table) {
        await refreshCollection(table);
        if (table === 'pos_tables') await refreshCollection('pos_saved_orders');
        if (table === 'pos_saved_orders') await refreshCollection('pos_tables');
      } else {
        await reload(true);
      }
    };

    const onOrderCreated = async (payload) => {
      const detail = payload?.payload || {};
      window.dispatchEvent(new CustomEvent('kitchgoo_order_created', { detail }));
      // Instantly refresh live collections with 0ms delay
      await Promise.allSettled([
        syncOneCollection('kds_tickets'),
        syncOneCollection('pos_tables'),
        syncOneCollection('pos_saved_orders'),
        syncOneCollection('guests'),
      ]);
      hydrateFromCache();
    };

    // Listen across all tenant alias variations so no broadcast is missed
    const rawAliases = [
      activeTenant,
      user?.restaurantName,
      user?.accountId,
      activeTenant ? String(activeTenant).toLowerCase().replace(/[^a-z0-9]/g, '_') : null,
      activeTenant ? String(activeTenant).toLowerCase().replace(/[^a-z0-9]/g, '-') : null,
      user?.restaurantName ? String(user.restaurantName).toLowerCase().replace(/[^a-z0-9]/g, '_') : null,
      user?.restaurantName ? String(user.restaurantName).toLowerCase().replace(/[^a-z0-9]/g, '-') : null,
      user?.accountId ? String(user.accountId).toLowerCase().replace(/[^a-z0-9]/g, '_') : null,
      user?.accountId ? String(user.accountId).toLowerCase().replace(/[^a-z0-9]/g, '-') : null,
    ].filter(Boolean);

    const channelNames = Array.from(new Set(rawAliases)).map(t => `kitchgoo_changes_${t}`);
    const channels = channelNames.map(cName => {
      return supabase
        .channel(cName)
        .on('broadcast', { event: 'db_changed' }, onChange)
        .on('broadcast', { event: 'order_created' }, onOrderCreated)
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            realtimeConnectedRef.current = true;
            if (subscribedOnceRef.current) reload(true);
            subscribedOnceRef.current = true;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            realtimeConnectedRef.current = false;
            console.warn(`[Realtime] ${status} for channel: ${cName}`, err || '');
          }
        });
    });

    channelRef.current = channels[0];

    return () => {
      realtimeConnectedRef.current = false;
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [authLoading, hasLoadedFromDb, activeTenant, user]);

  // Self-healing safety net. Realtime broadcasts are instant, but network
  // hitches or firewalls can drop sockets. Reconcile live collections every 3.5s
  // so QR menu orders are guaranteed to appear immediately.
  useEffect(() => {
    if (authLoading || !hasLoadedFromDb || !activeTenant) return;
    const isDemoMode = window.localStorage.getItem('kitchgoo_demo_mode') === 'true';
    if (isDemoMode) return;

    const LIVE = ['pos_tables', 'pos_saved_orders', 'kds_tickets'];

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      lastReconcileAt.current = Date.now();
      const before = LIVE.map(n => stableStringify(getAll(n)));
      for (const n of LIVE) { await syncOneCollection(n); }
      const after = LIVE.map(n => stableStringify(getAll(n)));
      if (before.join('|') !== after.join('|')) hydrateFromCache();
    };

    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      await Promise.allSettled([
        syncOneCollection('pos_tables'),
        syncOneCollection('pos_saved_orders'),
        syncOneCollection('kds_tickets'),
      ]);
      hydrateFromCache();
      reload(true);
    };

    const interval = setInterval(tick, 3500);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, hasLoadedFromDb, activeTenant]);

  // ── Staff ────────────────────────────────────────────────
  const addStaff = useCallback(async (data) => {
    await insert('staff', data);
    setStaff(getAll('staff'));
  }, []);

  const editStaff = useCallback(async (id, data) => {
    await update('staff', id, data);
    setStaff(getAll('staff'));
  }, []);

  const deleteStaff = useCallback(async (id) => {
    await remove('staff', id);
    setStaff(getAll('staff'));
  }, []);

  const toggleStaffStatus = useCallback(async (id) => {
    const member = getAll('staff').find(s => s.id === id);
    if (!member) return;
    await update('staff', id, { status: member.status === 'active' ? 'off-duty' : 'active' });
    setStaff(getAll('staff'));
  }, []);

  const checkInOut = useCallback(async (staffId, type, meta = {}) => {
    await logAttendance(staffId, type, meta);
    // logAttendance updates the in-memory cache synchronously — mirror it into
    // React state so the clock-in/out UI reflects the change immediately.
    setAttendance(getAll('attendance'));
  }, []);

  const getStaffAttendance = useCallback((staffId) => {
    return getAttendanceForStaff(staffId);
  }, []);

  // ── Inventory ────────────────────────────────────────────
  const addInventoryItem = useCallback(async (data) => {
    const existing = getAll('inventory').find(i => i.name.toLowerCase() === data.name.toLowerCase());
    let result;
    if (existing) {
      const newStock = existing.stock + parseFloat(data.stock || 0);
      const updated = {
        stock: newStock, status: computeStockStatus(newStock, existing.min),
        lastUpdated: new Date().toISOString(),
      };
      await update('inventory', existing.id, updated);
      result = { ...existing, ...updated };
    } else {
      const stock = parseFloat(data.stock || 0);
      const min = parseFloat(data.min) || 5;
      result = await insert('inventory', { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    }
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    return result;
  }, []);

  const editInventoryItem = useCallback(async (id, data) => {
    const stock = parseFloat(data.stock);
    const min = parseFloat(data.min);
    await update('inventory', id, { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const orderMoreInventory = useCallback(async (id) => {
    const item = getAll('inventory').find(i => i.id === id);
    if (!item) return;
    const newStock = item.stock + item.min * 2;
    await update('inventory', id, { stock: newStock, status: 'good', lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const deleteInventoryItem = useCallback(async (id) => {
    await remove('inventory', id);
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const clearInventory = useCallback(async () => {
    await clearCollection('inventory');
    setInventory([]);
  }, []);


  // ── Menu ─────────────────────────────────────────────────
  const addMenuItem = useCallback(async (data) => {
    const res = await insert('menu', { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
    return res;
  }, []);

  const editMenuItem = useCallback(async (id, data) => {
    await update('menu', id, { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
  }, []);

  const deleteMenuItem = useCallback(async (id) => {
    await remove('menu', id);
    setMenu(getAll('menu'));
  }, []);

  const clearMenu = useCallback(async () => {
    await clearCollection('menu');
    setMenu([]);
  }, []);

  const toggleMenuItemAvailability = useCallback(async (id) => {
    const item = getAll('menu').find(i => i.id === id);
    if (!item) return;
    await update('menu', id, { active: !item.active });
    setMenu(getAll('menu'));
  }, []);

  const toggle86 = useCallback(async (id) => {
    const item = getAll('menu').find(i => i.id === id);
    if (!item) return;
    await update('menu', id, { sold86: !item.sold86, active: item.sold86 ? true : false });
    setMenu(getAll('menu'));
  }, []);

  // ── Orders / POS ────────────────────────────────────────
  const placeOrder = useCallback(async (tableId, items, paymentMethod, extra = {}) => {
    const order = await createOrder(tableId, items, paymentMethod, extra);
    await depleteInventoryForOrder(items);
    setOrders(getAll('orders'));
    setTodayStats(getTodayStats());
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    return order;
  }, []);

  // ── Delivery ──────────────────────────────────────────────
  const addDelivery = useCallback(async (order) => {
    await addDeliveryOrder(order);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const advanceDeliveryStatus = useCallback(async (id) => {
    const FLOW = { new: 'preparing', preparing: 'ready', ready: 'out-for-delivery', 'out-for-delivery': 'delivered' };
    const order = getAll('delivery_orders').find(o => o.id === id);
    if (!order || !FLOW[order.status]) return;
    const nextStatus = FLOW[order.status];
    await updateDeliveryStatus(id, nextStatus);
    
    // If it becomes delivered, add to completed orders!
    if (nextStatus === 'delivered') {
      const orderItems = (order.itemsList && order.itemsList.length > 0)
        ? order.itemsList.map(item => ({ name: item.name, price: item.price, qty: item.qty }))
        : [{ name: `${order.platform || 'Third Party'} Delivery`, price: order.total, qty: 1 }];

      await insert('orders', {
        billNo: order.externalId || `DEL-${getTenantCode(getCurrentTenant())}-${order.id.slice(0, 5)}`,
        items: orderItems,
        subtotal: order.total,
        tax: 0,
        total: order.total,
        paymentMethod: 'Online',
        orderType: 'delivery',
        deliveryChannel: order.platform || 'Third Party',
        customerName: order.customer,
        customerPhone: order.phone,
        deliveryAddress: order.address,
        status: 'paid',
        createdAt: new Date().toISOString(),
      });
      await depleteInventoryForOrder(orderItems);
      setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    }
    setDeliveryOrders(getAll('delivery_orders'));
    setOrders(getAll('orders')); // Sync orders!
    setTodayStats(getTodayStats());
  }, []);

  const rejectDelivery = useCallback(async (id) => {
    await remove('delivery_orders', id);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const updateDeliveryOrder = useCallback(async (id, data) => {
    await update('delivery_orders', id, data);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const simulateNewDelivery = useCallback(async () => {
    const platforms = ['Zomato', 'Swiggy', 'UberEats', 'DoorDash'];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const pfx = { Zomato: 'ZOM', Swiggy: 'SWG', UberEats: 'UBE', DoorDash: 'DD' }[platform];
    await addDeliveryOrder({
      externalId: `${pfx}-${Math.floor(Math.random() * 9000) + 1000}`,
      platform,
      status: 'new',
      items: Math.floor(Math.random() * 4) + 1,
      total: Math.floor(Math.random() * 800) + 200,
      customer: ['Amit B.', 'Rahul K.', 'Sneha M.', 'Priya S.', 'Vikram D.'][Math.floor(Math.random() * 5)],
      address: '123 Main St, Bengaluru',
      phone: '+91 98765 00000',
      driverInstructions: '',
      assignedDriver: null,
    });
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  // ── KDS ─────────────────────────────────────────────────
  const fireToKDS = useCallback(async (orderId, items, tableId, orderType, extra = {}) => {
    await createKDSTicket(orderId, items, tableId, orderType, extra);
    setKdsTickets(getAll('kds_tickets'));
  }, []);

  // When a table's ticket is fully bumped, the food is on its way out —
  // advance the table from 'ordered' to 'eating' on the POS floor.
  const maybeMarkTableEating = useCallback((ticketId) => {
    const ticket = (getAll('kds_tickets') || []).find(t => t.id === ticketId);
    if (ticket && ticket.status === 'completed' && ticket.tableId) {
      const targetId = String(ticket.tableId).trim();
      const targetClean = cleanTableId(targetId);
      setPosTables(prev => prev.map(t => {
        const matches = String(t.id).trim() === targetId ||
          String(t.number).trim() === targetId ||
          cleanTableId(t.id) === targetClean ||
          cleanTableId(t.number) === targetClean;
        return (matches && t.status === 'ordered')
          ? { ...t, status: 'eating' }
          : t;
      }));
    }
  }, []);

  const bumpKDSItemAction = useCallback(async (ticketId, itemIndex) => {
    // 1. Optimistic update: Update React state immediately (0ms delay)
    let shouldCheckEating = false;
    const nowIso = new Date().toISOString();
    setKdsTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      const items = [...(t.items || [])];
      if (items[itemIndex]) {
        items[itemIndex] = { ...items[itemIndex], status: 'bumped', bumpedAt: nowIso };
      }
      const allBumped = items.length > 0 && items.every(i => i.status === 'bumped');
      if (allBumped) shouldCheckEating = true;
      return {
        ...t,
        items,
        status: allBumped ? 'completed' : 'active',
        ...(allBumped ? { bumpedAt: nowIso, completedAt: nowIso } : {}),
        updatedAt: nowIso,
      };
    }));

    if (shouldCheckEating) {
      maybeMarkTableEating(ticketId);
    }

    // 2. Persist in background
    try {
      await bumpKDSItem(ticketId, itemIndex);
      if (shouldCheckEating) {
        maybeMarkTableEating(ticketId);
      }
    } catch (err) {
      console.error('[KDS] Failed to persist bump item:', err);
      setKdsTickets(getAll('kds_tickets'));
    }
  }, [maybeMarkTableEating]);

  const bumpKDSTicketAction = useCallback(async (ticketId) => {
    // 1. Optimistic update: mark ticket and items completed immediately
    const nowIso = new Date().toISOString();
    setKdsTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      const items = (t.items || []).map(i => ({ ...i, status: 'bumped', bumpedAt: nowIso }));
      return {
        ...t,
        items,
        status: 'completed',
        bumpedAt: nowIso,
        completedAt: nowIso,
        updatedAt: nowIso,
      };
    }));
    maybeMarkTableEating(ticketId);

    // 2. Persist in background
    try {
      await bumpKDSTicket(ticketId);
      maybeMarkTableEating(ticketId);
    } catch (err) {
      console.error('[KDS] Failed to persist bump ticket:', err);
      setKdsTickets(getAll('kds_tickets'));
    }
  }, [maybeMarkTableEating]);

  const recallKDSTicketAction = useCallback(async (ticketId) => {
    // 1. Optimistic update
    setKdsTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      const items = (t.items || []).map(i => ({ ...i, status: 'pending', bumpedAt: null }));
      return { ...t, items, status: 'active', bumpedAt: null, completedAt: null, updatedAt: new Date().toISOString() };
    }));

    // 2. Persist in background
    try {
      await recallKDSTicket(ticketId);
    } catch (err) {
      console.error('[KDS] Failed to persist recall ticket:', err);
      setKdsTickets(getAll('kds_tickets'));
    }
  }, []);

  const transferKDSTicketsAction = useCallback(async (fromTableId, toTableId, fromTableNum, toTableNum) => {
    const count = await transferKDSTickets(fromTableId, toTableId, fromTableNum, toTableNum);
    setKdsTickets(getAll('kds_tickets'));
    return count;
  }, []);

  const cancelKDSTicketsAction = useCallback(async (tableId, tableNum) => {
    const count = await cancelKDSTickets(tableId, tableNum);
    setKdsTickets(getAll('kds_tickets'));
    return count;
  }, []);

  // ── Reservations & Waitlist ─────────────────────────────
  const addReservation = useCallback(async (data) => {
    await createReservation(data);
    setReservations(getAll('reservations'));
  }, []);

  const editReservation = useCallback(async (id, data) => {
    await update('reservations', id, data);
    setReservations(getAll('reservations'));
  }, []);

  const cancelReservation = useCallback(async (id) => {
    await update('reservations', id, { status: 'cancelled' });
    setReservations(getAll('reservations'));
  }, []);

  const addWaitlistEntry = useCallback(async (data) => {
    await addToWaitlist(data);
    setWaitlist(getAll('waitlist'));
  }, []);

  const notifyWaitlist = useCallback(async (id) => {
    await update('waitlist', id, { status: 'notified', notifiedAt: new Date().toISOString() });
    setWaitlist(getAll('waitlist'));
  }, []);

  const seatWaitlist = useCallback(async (id, tableId = null) => {
    await update('waitlist', id, { status: 'seated', tableId, seatedAt: new Date().toISOString() });
    setWaitlist(getAll('waitlist'));
  }, []);

  const removeWaitlist = useCallback(async (id, reason = '') => {
    // Mark as 'left' (rather than hard-deleting) so walk-away stats and the
    // "Completed Today" list reflect it.
    await update('waitlist', id, { status: 'left', leftReason: reason, leftAt: new Date().toISOString() });
    setWaitlist(getAll('waitlist'));
  }, []);

  // ── Suppliers ──────────────────────────────────────────
  const addSupplier = useCallback(async (data) => {
    await insert('suppliers', data);
    setSuppliers(getAll('suppliers'));
  }, []);

  const editSupplier = useCallback(async (id, data) => {
    await update('suppliers', id, data);
    setSuppliers(getAll('suppliers'));
  }, []);

  const deleteSupplier = useCallback(async (id) => {
    await remove('suppliers', id);
    setSuppliers(getAll('suppliers'));
  }, []);

  // ── Purchase Orders ────────────────────────────────────
  const addPurchaseOrder = useCallback(async (data) => {
    await insert('purchase_orders', { ...data, status: 'draft' });
    setPurchaseOrders(getAll('purchase_orders'));
  }, []);

  const editPurchaseOrder = useCallback(async (id, data) => {
    await update('purchase_orders', id, data);
    setPurchaseOrders(getAll('purchase_orders'));
  }, []);

  // ── Recipes ────────────────────────────────────────────
  const addRecipe = useCallback(async (data) => {
    await insert('recipes', data);
    setRecipes(getAll('recipes'));
  }, []);

  const editRecipe = useCallback(async (id, data) => {
    await update('recipes', id, data);
    setRecipes(getAll('recipes'));
  }, []);

  const deleteRecipe = useCallback(async (id) => {
    await remove('recipes', id);
    setRecipes(getAll('recipes'));
  }, []);

  // ── Waste ──────────────────────────────────────────────
  const addWasteEntry = useCallback(async (data) => {
    await logWaste(data);
    setWasteLog(getAll('waste_log'));
  }, []);

  // ── Expenses ───────────────────────────────────────────
  const addExpense = useCallback(async (data) => {
    const payload = {
      ...data,
      amount: parseFloat(data.amount) || 0,
      status: data.status || 'paid',
      createdAt: data.createdAt || new Date().toISOString(),
    };
    await insert('expenses', payload);
    setExpenses(getAll('expenses') || []);
  }, []);

  const editExpense = useCallback(async (id, data) => {
    const payload = {
      ...data,
      ...(data.amount !== undefined ? { amount: parseFloat(data.amount) || 0 } : {}),
      updatedAt: new Date().toISOString(),
    };
    await update('expenses', id, payload);
    setExpenses(getAll('expenses') || []);
  }, []);

  const deleteExpense = useCallback(async (id) => {
    await remove('expenses', id);
    setExpenses(getAll('expenses') || []);
  }, []);

  // ── Locations ──────────────────────────────────────────
  const addLocation = useCallback(async (data) => {
    await insert('locations', data);
    setLocations(getAll('locations'));
  }, []);

  const editLocation = useCallback(async (id, data) => {
    await update('locations', id, data);
    setLocations(getAll('locations'));
  }, []);

  // ── Modifiers ──────────────────────────────────────────
  const addModifier = useCallback(async (data) => {
    await insert('modifiers', data);
    setModifiers(getAll('modifiers'));
  }, []);

  const editModifier = useCallback(async (id, data) => {
    await update('modifiers', id, data);
    setModifiers(getAll('modifiers'));
  }, []);

  const deleteModifier = useCallback(async (id) => {
    await remove('modifiers', id);
    setModifiers(getAll('modifiers'));
  }, []);

  // ── Floor Plans ────────────────────────────────────────
  const updateFloorPlans = useCallback(async (data) => {
    await setCollection('floor_plans', data);
    setFloorPlans(data);
  }, []);

  // ── Schedules ──────────────────────────────────────────
  const addSchedule = useCallback(async (data) => {
    await insert('schedules', data);
    setSchedules(getAll('schedules'));
  }, []);

  const editSchedule = useCallback(async (id, data) => {
    await update('schedules', id, data);
    setSchedules(getAll('schedules'));
  }, []);

  const deleteSchedule = useCallback(async (id) => {
    await remove('schedules', id);
    setSchedules(getAll('schedules'));
  }, []);

  // ── Campaigns ──────────────────────────────────────────
  const addCampaign = useCallback(async (data) => {
    await insert('campaigns', data);
    setCampaigns(getAll('campaigns'));
  }, []);

  const editCampaign = useCallback(async (id, data) => {
    await update('campaigns', id, data);
    setCampaigns(getAll('campaigns'));
  }, []);

  const deleteCampaign = useCallback(async (id) => {
    await remove('campaigns', id);
    setCampaigns(getAll('campaigns'));
  }, []);

  // ── Loyalty ────────────────────────────────────────────
  const updateLoyalty = useCallback(async (data) => {
    await setCollection('loyalty', data);
    setLoyalty(data);
  }, []);

  // ── Guests ─────────────────────────────────────────────
  const addGuest = useCallback(async (data) => {
    const res = await insert('guests', data);
    setGuests(getAll('guests'));
    return res;
  }, []);

  const editGuest = useCallback(async (id, data) => {
    await update('guests', id, data);
    setGuests(getAll('guests'));
  }, []);

  const deleteGuest = useCallback(async (id) => {
    await remove('guests', id);
    setGuests(getAll('guests'));
  }, []);

  // ── Gift Cards / Digital Wallet ────────────────────────
  const issueWalletCredit = useCallback(async (params) => {
    const res = await issueGiftCardCredit(params);
    setGuests(getAll('guests'));
    setGiftCards(getAll('gift_cards') || []);
    return res;
  }, []);

  const redeemWalletCredit = useCallback(async (params) => {
    const res = await redeemGiftCardCredit(params);
    setGuests(getAll('guests'));
    setGiftCards(getAll('gift_cards') || []);
    return res;
  }, []);

  // ── Cash Drawer ────────────────────────────────────────
  const updateCashDrawerAction = useCallback(async (data) => {
    const updated = await updateCashDrawer(data);
    setCashDrawer(updated);
  }, []);

  const addRegisterClosureAction = useCallback(async (data) => {
    const newItem = await insert('register_closures', data);
    setRegisterClosures(getAll('register_closures'));
    return newItem;
  }, []);

  const updateRegisterClosureAction = useCallback(async (id, data) => {
    const closures = getAll('register_closures') || [];
    const target = closures.find(c => c.id === id);
    if (!target) return;

    const openingBalance = parseFloat(data.openingBalance) || 0;
    const actualCash = parseFloat(data.actualCash) || 0;
    const notes = data.notes || '';
    
    // Support bank deposit info updates
    const depositAmount = data.depositAmount !== undefined ? (parseFloat(data.depositAmount) || 0) : (target.depositAmount || 0);
    const bankName = data.bankName !== undefined ? data.bankName : (target.bankName || '');
    const depositNotes = data.depositNotes !== undefined ? data.depositNotes : (target.depositNotes || '');

    const dropsSum = (target.drops || []).reduce((s, d) => s + d.amount, 0);
    const expectedBalance = openingBalance + (target.cashIn || 0) - (target.cashOut || 0) - dropsSum;
    const variance = actualCash - expectedBalance;

    await update('register_closures', id, {
      openingBalance,
      actualCash,
      notes,
      expectedBalance,
      variance,
      depositAmount,
      bankName,
      depositNotes
    });
    setRegisterClosures(getAll('register_closures'));
  }, []);

  // ── Audit ──────────────────────────────────────────────
  const addAuditEntry = useCallback(async (action, userId, userName, details) => {
    await logAudit(action, userId, userName, details);
    setAuditLog(getAll('audit_log'));
  }, []);

  // ── Online Orders ──────────────────────────────────────
  const addOnlineOrder = useCallback(async (data) => {
    await insert('online_orders', data);
    setOnlineOrders(getAll('online_orders'));
  }, []);

  const editOnlineOrder = useCallback(async (id, data) => {
    await update('online_orders', id, data);
    
    // If it becomes delivered, add to completed orders!
    if (data.status === 'delivered') {
      const order = getAll('online_orders').find(o => o.id === id);
      if (order) {
        const orderItems = (order.itemsList && order.itemsList.length > 0)
          ? order.itemsList.map(item => ({ name: item.name, price: item.price, qty: item.qty }))
          : [{ name: 'Direct Online Delivery', price: order.total, qty: 1 }];

        await insert('orders', {
          billNo: `ONL-${getTenantCode(getCurrentTenant())}-${order.id.slice(0, 5)}`,
          items: orderItems,
          subtotal: order.total,
          tax: 0,
          total: order.total,
          paymentMethod: 'Online',
          orderType: 'delivery',
          deliveryChannel: 'Direct',
          customerName: order.customer,
          customerPhone: order.phone,
          deliveryAddress: order.address,
          status: 'paid',
          createdAt: new Date().toISOString(),
        });
        await depleteInventoryForOrder(orderItems);
        setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
      }
    }
    setOnlineOrders(getAll('online_orders'));
    setOrders(getAll('orders')); // Sync orders!
    setTodayStats(getTodayStats());
  }, []);

  const updatePOSOrderDeliveryStatus = useCallback(async (id, deliveryStatus) => {
    await update('orders', id, { deliveryStatus });
    setOrders(getAll('orders'));
    setTodayStats(getTodayStats());
  }, []);

  const updatePOSOrder = useCallback(async (id, data) => {
    await update('orders', id, data);
    setOrders(getAll('orders'));
    setTodayStats(getTodayStats());
  }, []);

  // ── Settings ──────────────────────────────────────────────
  const updateSettingsSection = useCallback(async (section, data) => {
    const updated = await dbUpdateSettings(section, data);
    setSettings(updated);
    return updated;
  }, []);

  // ── Tip Pools ─────────────────────────────────────────
  const updateTipPools = useCallback(async (data) => {
    await setCollection('tip_pools', data);
    setTipPools(data);
  }, []);

  // Reports call this when a selected period reaches past the loaded orders
  // window; older rows are fetched once and merged into state.
  const loadOlderOrders = useCallback(async (fromDayStr) => {
    const fetched = await ensureOrdersSince(fromDayStr);
    if (fetched) {
      setOrders(getAll('orders'));
      setTodayStats(getTodayStats());
    }
    return fetched;
  }, []);

  const broadcastOrderCreated = useCallback(async (tableId, kdsOrderId) => {
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'order_created',
        payload: { tableId, kdsOrderId },
      });
    }
  }, []);

  const value = {
    ready,
    // Data
    staff, inventory, menu, orders, deliveryOrders, settings, todayStats,
    kdsTickets, reservations, waitlist, onlineOrders, suppliers, purchaseOrders,
    recipes, wasteLog, locations, auditLog, floorPlans, modifiers, schedules,
    tipPools, loyalty, campaigns, guests, cashDrawer, registerClosures, attendance, expenses, giftCards,
    posTables, setPosTables, posSavedOrders, setPosSavedOrders,
    // Staff
    addStaff, editStaff, deleteStaff, toggleStaffStatus, checkInOut, getStaffAttendance,
    // Inventory
    addInventoryItem, editInventoryItem, orderMoreInventory, deleteInventoryItem, clearInventory,
    // Menu
    addMenuItem, editMenuItem, deleteMenuItem, toggleMenuItemAvailability, toggle86, clearMenu,
    // Orders / POS
    placeOrder,
    // Delivery
    addDelivery, advanceDeliveryStatus, rejectDelivery, simulateNewDelivery, updateDeliveryOrder,
    // KDS
    fireToKDS, bumpKDSItemAction, bumpKDSTicketAction, recallKDSTicketAction, transferKDSTickets: transferKDSTicketsAction, cancelKDSTickets: cancelKDSTicketsAction,
    // Reservations & Waitlist
    addReservation, editReservation, cancelReservation,
    addWaitlistEntry, notifyWaitlist, seatWaitlist, removeWaitlist,
    // Suppliers
    addSupplier, editSupplier, deleteSupplier,
    // Purchase Orders
    addPurchaseOrder, editPurchaseOrder,
    // Expenses
    addExpense, editExpense, deleteExpense,
    // Recipes
    addRecipe, editRecipe, deleteRecipe,
    // Waste
    addWasteEntry,
    // Locations
    addLocation, editLocation,
    // Modifiers
    addModifier, editModifier, deleteModifier,
    // Floor Plans
    updateFloorPlans,
    // Schedules
    addSchedule, editSchedule, deleteSchedule,
    // Campaigns
    addCampaign, editCampaign, deleteCampaign,
    // Loyalty
    updateLoyalty,
    // Guests
    addGuest, editGuest, deleteGuest, issueWalletCredit, redeemWalletCredit,
    // Cash Drawer
    updateCashDrawer: updateCashDrawerAction,
    addRegisterClosure: addRegisterClosureAction,
    updateRegisterClosure: updateRegisterClosureAction,
    // Audit
    addAuditEntry,
    // Online Orders
    addOnlineOrder, editOnlineOrder, updatePOSOrderDeliveryStatus, updatePOSOrder,
    // Settings
    updateSettingsSection,
    // Tip Pools
    updateTipPools,
    // Realtime Broadcasts
    broadcastOrderCreated,
    // Utility
    reload, loadOlderOrders,
  };

  if (!ready) return null;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
