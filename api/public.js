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
    res.status(status).json({ success: false, error: status >= 500 ? 'Internal server error' : err.message });
  });
};

const cleanId = (s) => {
  let str = String(s ?? '').trim().toLowerCase().replace(/^(table|tbl|t|#|\s|-|_)+/i, '');
  if (str === '1o') str = '10';
  const stripped = str.replace(/^0+/, '');
  return stripped || str;
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

  if (!settings.restaurant) {
    settings.restaurant = { ...SEEDS.settings.restaurant, name: account.name || canonicalTenant };
  } else if (!settings.restaurant.name || (settings.restaurant.name === 'Kitchgoo' && canonicalTenant.toLowerCase() !== 'kitchgoo')) {
    settings.restaurant = { ...settings.restaurant, name: account.name || canonicalTenant };
  }

  // Merge floor_plans layout with saved pos_tables so guest devices always get the full table list
  const baseTables = ((floorPlans && floorPlans.tables) || []).map(t => ({
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
  const saved = posTables || [];
  const tableMap = new Map();
  baseTables.forEach(t => tableMap.set(String(t.id), t));
  saved.forEach(t => {
    let existingKey = null;
    for (const [k, b] of tableMap.entries()) {
      if (String(b.id) === String(t.id) ||
          (b.number && t.number && String(b.number) === String(t.number)) ||
          String(t.id) === `tbl_${b.number}` ||
          String(t.id) === `tbl_${b.id}`) {
        existingKey = k;
        break;
      }
    }
    if (existingKey) {
      const existing = tableMap.get(existingKey);
      tableMap.set(existingKey, { ...existing, ...t, id: existing.id, number: existing.number || t.number });
    } else {
      tableMap.set(String(t.id), t);
    }
  });
  const mergedPosTables = Array.from(tableMap.values());

  // Scope saved orders to the guest's own table when one is given
  const tableParam = (req.query.table || '').trim();
  let scopedOrders = {};
  if (tableParam) {
    const cleanTableParam = cleanId(tableParam);
    const match = mergedPosTables.find(t => {
      const tNum = String(t.number || '').trim().toLowerCase();
      const tId = String(t.id || '').trim().toLowerCase();
      const tName = String(t.name || '').trim().toLowerCase();
      if (tNum === tableParam.toLowerCase() || tId === tableParam.toLowerCase() || tName === tableParam.toLowerCase()) return true;
      if (cleanTableParam) {
        return cleanId(tNum) === cleanTableParam || cleanId(tId) === cleanTableParam || cleanId(tName) === cleanTableParam;
      }
      return false;
    });
    if (match && savedOrders) {
      const cId = cleanId(match.id);
      const cNum = cleanId(match.number);
      const candidateKeys = [
        match.id,
        match.number ? String(match.number) : null,
        `tbl_${match.id}`,
        match.number ? `tbl_${match.number}` : null,
        cId,
        cNum,
        cId ? `tbl_${cId}` : null,
        cNum ? `tbl_${cNum}` : null,
        cId ? `tbl_0${cId}` : null,
        cNum ? `tbl_0${cNum}` : null,
        cId ? `0${cId}` : null,
        cNum ? `0${cNum}` : null,
        cId === '10' ? 'tbl_1o' : null,
        cNum === '10' ? 'tbl_1o' : null,
        cleanTableParam,
        cleanTableParam ? `tbl_${cleanTableParam}` : null,
        tableParam,
      ].filter(Boolean);

      let foundOrder;
      for (const k of candidateKeys) {
        if (savedOrders[k] !== undefined) {
          foundOrder = savedOrders[k];
          break;
        }
      }
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

// Phone normalization and strict phone-first matching helpers
export function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function phonesMatch(p1, p2) {
  const d1 = normalizePhone(p1);
  const d2 = normalizePhone(p2);
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  // If both have 10+ digits, compare the last 10 digits (handles country codes like 91 or +91 or 0)
  if (d1.length >= 10 && d2.length >= 10 && d1.slice(-10) === d2.slice(-10)) return true;
  // If one ends with the other and the shorter has at least 7 digits
  if (d1.length >= 7 && d2.length >= 7 && (d1.endsWith(d2) || d2.endsWith(d1))) return true;
  return false;
}

export function upsertGuestIntoList(currentGuests = [], { name = '', phone = '', notes = '' } = {}) {
  const rawName = String(name || '').trim();
  const rawPhone = String(phone || '').trim();
  const cleanDigits = normalizePhone(rawPhone);
  const hasValidPhone = cleanDigits.length >= 7;

  let targetGuest = null;
  if (hasValidPhone) {
    // Phone number is the UNIQUE identifier. Match ONLY by phone!
    targetGuest = currentGuests.find(g => phonesMatch(g.phone, rawPhone));
  } else if (rawName && rawName.toLowerCase() !== 'walk-in') {
    // Only if NO phone is present, fallback to name match among phoneless guests
    targetGuest = currentGuests.find(g =>
      !normalizePhone(g.phone) &&
      String(g.name || '').trim().toLowerCase() === rawName.toLowerCase()
    );
  }

  const nowIso = new Date().toISOString();
  if (targetGuest) {
    if (rawName && rawName.toLowerCase() !== 'walk-in') {
      targetGuest.name = rawName;
    }
    if (rawPhone) {
      targetGuest.phone = rawPhone;
    }
    targetGuest.lastVisit = nowIso;
    targetGuest.visitCount = (targetGuest.visitCount || 0) + 1;
    if (notes) {
      targetGuest.notes = targetGuest.notes ? `${targetGuest.notes} | ${notes}` : notes;
    }
  } else {
    targetGuest = {
      id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: (rawName && rawName.toLowerCase() !== 'walk-in')
        ? rawName
        : (hasValidPhone ? `Guest ${cleanDigits.slice(-4)}` : 'Guest'),
      phone: rawPhone,
      email: '',
      visitCount: 1,
      totalSpend: 0,
      notes: notes ? `QR Menu Note: ${notes}` : 'Registered via QR Menu',
      channel: 'QR Menu',
      tags: ['QR Menu'],
      createdAt: nowIso,
      lastVisit: nowIso,
    };
    currentGuests.push(targetGuest);
  }

  // Deduplicate: same phone number can NEVER be assigned to 2 guests!
  if (hasValidPhone) {
    const finalGuests = [];
    const seenPhones = new Set();
    for (const g of currentGuests) {
      const gDigits = normalizePhone(g.phone);
      if (gDigits && gDigits.length >= 7) {
        const key = gDigits.length >= 10 ? gDigits.slice(-10) : gDigits;
        if (seenPhones.has(key)) {
          continue; // skip duplicate
        }
        seenPhones.add(key);
      }
      finalGuests.push(g);
    }
    currentGuests.length = 0;
    currentGuests.push(...finalGuests);
  }

  return targetGuest;
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
    const cleanParamId = cleanId(tableId);

    const merged = current.map(t => {
      const tCleanId = cleanId(t.id);
      const tCleanNum = cleanId(t.number);
      const match = String(t.id) === String(tableId) ||
                    (t.number && String(t.number) === String(tableId)) ||
                    (table && table.id && String(t.id) === String(table.id)) ||
                    (table && table.number && String(t.number) === String(table.number)) ||
                    (cleanParamId && (tCleanId === cleanParamId || tCleanNum === cleanParamId));
      if (match) {
        found = true;
        // Keep existing seatedAt if table was already active!
        const keepSeatedAt = (t.status && t.status !== 'available' && t.status !== 'needs-bussing' && t.seatedAt)
          ? t.seatedAt
          : (table.seatedAt || t.seatedAt || new Date().toISOString());
        return { ...t, ...table, id: t.id, number: t.number || table.number || t.id, seatedAt: keepSeatedAt };
      }
      return t;
    });

    if (!found) {
      const fpTable = ((floorPlans && floorPlans.tables) || []).find(t => {
        const tCleanId = cleanId(t.id);
        const tCleanNum = cleanId(t.number);
        const tCleanLabel = cleanId(t.label || t.name);
        return (
          String(t.id) === String(tableId) ||
          (t.number && String(t.number) === String(tableId)) ||
          (cleanParamId && (tCleanId === cleanParamId || tCleanNum === cleanParamId || tCleanLabel === cleanParamId))
        );
      });
      if (fpTable) {
        merged.push({
          ...fpTable,
          ...table,
          id: fpTable.id || tableId,
          number: fpTable.number || table.number || fpTable.id,
        });
      } else {
        merged.push({ ...table, id: table.id ?? tableId });
      }
    }
    const { error } = await db.from('tenant_data').upsert({
      account_id: canonicalTenant, collection_name: 'pos_tables', value: merged,
    });
    if (error) throw error;

    // Save guest details to CRM guests list if guestName or guestPhone provided
    const rawGuestName = (table.guestName || '').trim();
    const rawGuestPhone = (table.guestPhone || '').trim();
    if ((rawGuestName && rawGuestName.toLowerCase() !== 'walk-in') || rawGuestPhone) {
      try {
        const currentGuests = (await getFlex(db, canonicalTenant, 'guests', [])) || [];
        upsertGuestIntoList(currentGuests, {
          name: rawGuestName,
          phone: rawGuestPhone,
          notes: table.notes ? `QR Menu Note: ${table.notes}` : 'Registered via QR Menu',
        });

        const { error: gErr } = await db.from('tenant_data').upsert({
          account_id: canonicalTenant, collection_name: 'guests', value: currentGuests,
        });
        if (!gErr) {
          await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'guests');
        }
      } catch (gErr) {
        console.error('[Public API] Error saving guest to CRM:', gErr);
      }
    }
  }

  if (savedOrder !== undefined) {
    const currentOrders = (await getFlex(db, canonicalTenant, 'pos_saved_orders', {})) || {};
    const mergedOrders = { ...currentOrders };

    if (savedOrder === null) {
      delete mergedOrders[tableId];
      if (table && table.id) delete mergedOrders[table.id];
      if (table && table.number) delete mergedOrders[String(table.number)];
      const cId = cleanId(tableId);
      const cNum = cleanId(table?.number || table?.id || tableId);
      const toDelete = [
        cId, `tbl_${cId}`, `tbl_0${cId}`, `0${cId}`,
        cNum, `tbl_${cNum}`, `tbl_0${cNum}`, `0${cNum}`,
        cId === '10' ? 'tbl_1o' : null,
        cId === '10' ? '1o' : null,
        cNum === '10' ? 'tbl_1o' : null,
        cNum === '10' ? '1o' : null,
      ].filter(Boolean);
      toDelete.forEach(k => delete mergedOrders[k]);
    } else {
      const cId = cleanId(tableId);
      const cNum = cleanId(table?.number);
      const possibleKeys = [
        tableId,
        table && table.id,
        table && table.number && String(table.number),
        cId,
        cId ? `tbl_${cId}` : null,
        cId ? `tbl_0${cId}` : null,
        cId ? `0${cId}` : null,
        cNum,
        cNum ? `tbl_${cNum}` : null,
        cNum ? `tbl_0${cNum}` : null,
        cNum ? `0${cNum}` : null,
        cId === '10' ? 'tbl_1o' : null,
        cId === '10' ? '1o' : null,
        cNum === '10' ? 'tbl_1o' : null,
        cNum === '10' ? '1o' : null,
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
        (table && table.number && String(t.number) === String(table.number)) ||
        (cleanId(tableId) && cleanId(t.id) === cleanId(tableId)) ||
        (cleanId(tableId) && cleanId(t.number) === cleanId(tableId))
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

      // Also mirror under table number and tbl_ prefix so lookups never miss
      if (table && table.number && String(table.number) !== primaryKey) {
        mergedOrders[String(table.number)] = finalSavedOrder;
      }
      if (tableId !== primaryKey) {
        mergedOrders[tableId] = finalSavedOrder;
      }
      const cNumFinal = cleanId(table?.number || table?.id || tableId);
      if (cNumFinal) {
        mergedOrders[cNumFinal] = finalSavedOrder;
        mergedOrders[`tbl_${cNumFinal}`] = finalSavedOrder;
      }
    }

    const { error } = await db.from('tenant_data').upsert({
      account_id: canonicalTenant, collection_name: 'pos_saved_orders', value: mergedOrders,
    });
    if (error) throw error;
    await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'pos_saved_orders');
  }

  await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'pos_tables');

  // Trigger order_created broadcast so POS floor plan updates immediately
  broadcastServerOrderCreated(canonicalTenant, tableId || table?.id || null, null).catch(() => {});
  if (requestedTenant && requestedTenant !== canonicalTenant) {
    broadcastServerOrderCreated(requestedTenant, tableId || table?.id || null, null).catch(() => {});
  }
  if (account.name && account.name !== canonicalTenant && account.name !== requestedTenant) {
    broadcastServerOrderCreated(account.name, tableId || table?.id || null, null).catch(() => {});
  }

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
  const cleanTNum = ticket.tableNumber ? cleanId(ticket.tableNumber) : null;
  const cleanTId = ticket.tableId ? (ticket.tableId.startsWith('tbl_') ? `tbl_${cleanId(ticket.tableId)}` : cleanId(ticket.tableId)) : null;
  const withId = {
    ...ticket,
    id: ticket.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: ticket.createdAt || new Date().toISOString(),
    ...(cleanTNum ? { tableNumber: cleanTNum } : {}),
    ...(cleanTId ? { tableId: cleanTId } : {}),
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

// POST /api/public/qrmenu/:tenant/guest — upsert a guest record into CRM from QR menu
app.post('/api/public/qrmenu/:tenant/guest', guestWriteLimiter, wrap(async (req, res) => {
  const db = requireDb();
  const { tenant: requestedTenant } = req.params;
  const { guest } = req.body || {};
  if (!guest || (!guest.name && !guest.phone)) {
    return res.status(400).json({ success: false, error: 'Guest name or phone required' });
  }

  const account = await resolveAccount(db, requestedTenant);
  if (!account) return res.status(404).json({ success: false, error: 'Restaurant not found' });
  const canonicalTenant = account.id;

  const currentGuests = (await getFlex(db, canonicalTenant, 'guests', [])) || [];
  const targetGuest = upsertGuestIntoList(currentGuests, {
    name: guest.name,
    phone: guest.phone,
    notes: guest.notes,
  });

  const { error } = await db.from('tenant_data').upsert({
    account_id: canonicalTenant, collection_name: 'guests', value: currentGuests,
  });
  if (error) throw error;

  await broadcastToAll(canonicalTenant, requestedTenant, account.name, 'guests');
  res.json({ success: true, guest: targetGuest });
}));

export default app;
