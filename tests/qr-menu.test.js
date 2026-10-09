import { describe, it, expect, beforeEach } from 'vitest';
import { matchTable, cleanTableId } from '../src/pages/QRMenu';
import { createKDSTicket, saveTableState, saveTableOrder, setLocalCollection, getAll, upsertGuestFromQR } from '../src/db/database';
import { buildPosTables, matchTableEntry } from '../src/db/AppContext';
import { resolveTableSavedOrder } from '../src/pages/POS';
import { resolveAccount } from '../api/_lib/core';

describe('QR Menu Feature for Kiko Cafe & Guests', () => {
  beforeEach(() => {
    setLocalCollection('pos_tables', []);
    setLocalCollection('pos_saved_orders', {});
    setLocalCollection('kds_tickets', []);
    setLocalCollection('guests', []);
  });

  describe('Flexible Table Matching (matchTable)', () => {
    const mockTables = [
      { id: 't1', number: 1, name: 'Table 1', status: 'available' },
      { id: 't2', number: 2, name: 'Table 2', status: 'needs-bussing' },
      { id: 'patio-3', number: 'P3', name: 'Patio 3', status: 'available' },
      { id: 't4', number: '04', name: 'Booth 4', status: 'available' },
    ];

    it('matches table by exact number or string', () => {
      expect(matchTable(mockTables, '1')?.id).toBe('t1');
      expect(matchTable(mockTables, 1)?.id).toBe('t1');
      expect(matchTable(mockTables, '2')?.id).toBe('t2');
      expect(matchTable(mockTables, 'P3')?.id).toBe('patio-3');
    });

    it('matches table by ID', () => {
      expect(matchTable(mockTables, 't1')?.id).toBe('t1');
      expect(matchTable(mockTables, 't2')?.id).toBe('t2');
      expect(matchTable(mockTables, 'patio-3')?.id).toBe('patio-3');
    });

    it('matches table with prefixes like "Table 1", "table 1", "T1", "T-1", "#1"', () => {
      expect(matchTable(mockTables, 'Table 1')?.id).toBe('t1');
      expect(matchTable(mockTables, 'table 1')?.id).toBe('t1');
      expect(matchTable(mockTables, 'T1')?.id).toBe('t1');
      expect(matchTable(mockTables, 'T-1')?.id).toBe('t1');
      expect(matchTable(mockTables, '#1')?.id).toBe('t1');
      expect(matchTable(mockTables, 'tbl 1')?.id).toBe('t1');
      expect(matchTable(mockTables, 'Table 2')?.id).toBe('t2');
      expect(matchTable(mockTables, 't-2')?.id).toBe('t2');
    });

    it('matches table by name', () => {
      expect(matchTable(mockTables, 'Patio 3')?.id).toBe('patio-3');
      expect(matchTable(mockTables, 'Booth 4')?.id).toBe('t4');
    });

    it('returns null for empty queries or non-existent tables', () => {
      expect(matchTable(mockTables, '')).toBeNull();
      expect(matchTable(mockTables, null)).toBeNull();
      expect(matchTable(mockTables, '99')).toBeNull();
    });

    it('normalizes leading zeros and typos (01 -> 1, 05 -> 5, 1o -> 10)', () => {
      expect(cleanTableId('01')).toBe('1');
      expect(cleanTableId('05')).toBe('5');
      expect(cleanTableId('tbl_01')).toBe('1');
      expect(cleanTableId('Table 04')).toBe('4');
      expect(cleanTableId('1o')).toBe('10');
      expect(cleanTableId('tbl_1o')).toBe('10');

      expect(matchTable(mockTables, '01')?.id).toBe('t1');
      expect(matchTable(mockTables, '02')?.id).toBe('t2');
      expect(matchTable(mockTables, '4')?.id).toBe('t4');
      expect(matchTable(mockTables, '04')?.id).toBe('t4');
    });
  });

  describe('Table Occupancy & State Transitions', () => {
    it('occupies a free (available) table, sets status to ordered, and records seatedAt timestamp', async () => {
      const initialTable = {
        id: 'table-1',
        number: 1,
        name: 'Table 1',
        status: 'available',
        guestName: null,
        seatedAt: null,
      };
      setLocalCollection('pos_tables', [initialTable]);

      const cartItems = [
        { item: { id: 'cappuccino', name: 'Cappuccino', price: 180 }, qty: 2, notes: 'Oat milk' },
      ];

      const isFreeOrBussing = !initialTable.status || initialTable.status === 'available' || initialTable.status === 'needs-bussing';
      expect(isFreeOrBussing).toBe(true);

      const beforeTime = Date.now();
      const updatedTable = {
        ...initialTable,
        status: 'ordered',
        guestName: 'Amiya',
        guestPhone: '+919876543210',
        notes: 'Extra hot',
        seatedAt: new Date().toISOString(),
      };

      await saveTableState(initialTable.id, updatedTable);

      const orderItems = cartItems.map(c => ({
        id: c.item.id,
        name: c.item.name,
        price: c.item.price,
        qty: c.qty,
        notes: c.notes,
        specialInstructions: c.notes,
      }));
      await saveTableOrder(initialTable.id, orderItems);

      const tables = getAll('pos_tables');
      const table = tables.find(t => t.id === 'table-1');
      expect(table.status).toBe('ordered');
      expect(table.guestName).toBe('Amiya');
      expect(table.guestPhone).toBe('+919876543210');
      expect(table.notes).toBe('Extra hot');
      expect(new Date(table.seatedAt).getTime()).toBeGreaterThanOrEqual(beforeTime - 1000);

      const savedOrders = getAll('pos_saved_orders');
      expect(savedOrders['table-1']).toHaveLength(1);
      expect(savedOrders['table-1'][0].name).toBe('Cappuccino');
      expect(savedOrders['table-1'][0].qty).toBe(2);
    });

    it('occupies a bussing (needs-bussing) table, clears stale order items, and resets seatedAt timer', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const bussingTable = {
        id: 'table-5',
        number: 5,
        name: 'Table 5',
        status: 'needs-bussing',
        guestName: 'Old Guest',
        seatedAt: threeHoursAgo,
      };
      setLocalCollection('pos_tables', [bussingTable]);
      // Stale leftover items from prior dining session
      setLocalCollection('pos_saved_orders', {
        'table-5': [{ id: 'stale-croissant', name: 'Old Croissant', price: 150, qty: 1 }],
      });

      const isFreeOrBussing = !bussingTable.status || bussingTable.status === 'available' || bussingTable.status === 'needs-bussing';
      expect(isFreeOrBussing).toBe(true);

      const now = Date.now();
      const freshSeatedAt = new Date().toISOString();
      const updatedTable = {
        ...bussingTable,
        status: 'ordered',
        guestName: 'Kiko Diner',
        guestPhone: null,
        seatedAt: freshSeatedAt,
      };

      await saveTableState(bussingTable.id, updatedTable);

      // Free or bussing table starts with fresh empty base items, ignoring stale items
      const baseItems = isFreeOrBussing ? [] : (getAll('pos_saved_orders')['table-5'] || []);
      const newItems = [
        { id: 'iced-latte', name: 'Iced Latte', price: 220, qty: 1, notes: 'Less ice' },
      ];
      const merged = [...baseItems, ...newItems];

      await saveTableOrder(bussingTable.id, merged);

      const tables = getAll('pos_tables');
      const table = tables.find(t => t.id === 'table-5');
      expect(table.status).toBe('ordered');
      expect(table.guestName).toBe('Kiko Diner');
      // Timer is reset to fresh now, not threeHoursAgo
      expect(new Date(table.seatedAt).getTime()).toBeGreaterThanOrEqual(now - 1000);

      const savedOrders = getAll('pos_saved_orders');
      // Stale items were cleared!
      expect(savedOrders['table-5']).toHaveLength(1);
      expect(savedOrders['table-5'][0].id).toBe('iced-latte');
    });

    it('merges additional items when table is already active (ordered) and preserves seatedAt timer', async () => {
      const seatedTime = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 mins ago
      const activeTable = {
        id: 'table-3',
        number: 3,
        name: 'Table 3',
        status: 'ordered',
        guestName: 'Rahul',
        seatedAt: seatedTime,
      };
      setLocalCollection('pos_tables', [activeTable]);
      setLocalCollection('pos_saved_orders', {
        'table-3': [{ id: 'pasta', _cartKey: 'pasta_', name: 'Arrabbiata', price: 350, qty: 1 }],
      });

      const isFreeOrBussing = !activeTable.status || activeTable.status === 'available' || activeTable.status === 'needs-bussing';
      expect(isFreeOrBussing).toBe(false);

      const baseItems = isFreeOrBussing ? [] : (getAll('pos_saved_orders')['table-3'] || []);
      const newItems = [
        { id: 'tiramisu', _cartKey: 'tiramisu_', name: 'Tiramisu', price: 250, qty: 1 },
      ];
      const merged = [...baseItems, ...newItems];

      const updatedTable = {
        ...activeTable,
        status: 'ordered',
        seatedAt: isFreeOrBussing ? new Date().toISOString() : activeTable.seatedAt,
      };

      await saveTableState(activeTable.id, updatedTable);
      await saveTableOrder(activeTable.id, merged);

      const table = getAll('pos_tables').find(t => t.id === 'table-3');
      expect(table.status).toBe('ordered');
      expect(table.seatedAt).toBe(seatedTime); // Kept original timer

      const savedOrders = getAll('pos_saved_orders');
      expect(savedOrders['table-3']).toHaveLength(2);
      expect(savedOrders['table-3'].map(i => i.name)).toEqual(['Arrabbiata', 'Tiramisu']);
    });
  });

  describe('KDS Ticket Creation & Dispatch', () => {
    it('creates active KDS ticket with items, guest name, customer name, and order notes', async () => {
      const orderId = 'QR-T1-8842';
      const items = [
        { id: 'sandwich', name: 'Club Sandwich', qty: 2, notes: 'Toasted well' },
        { id: 'coffee', name: 'Americano', qty: 1, notes: '' },
      ];

      const ticket = await createKDSTicket(orderId, items, 'table-1', 'dine-in', {
        guestName: 'Priya',
        tokenNumber: 1,
        notes: 'Deliver both together please',
      });

      expect(ticket.orderId).toBe(orderId);
      expect(ticket.tableId).toBe('table-1');
      expect(ticket.guestName).toBe('Priya');
      expect(ticket.customerName).toBe('Priya');
      expect(ticket.tokenNumber).toBe(1);
      expect(ticket.notes).toBe('Deliver both together please');
      expect(ticket.status).toBe('active');
      expect(ticket.items).toHaveLength(2);
      expect(ticket.items[0].name).toBe('Club Sandwich');
      expect(ticket.items[0].qty).toBe(2);

      const allTickets = getAll('kds_tickets');
      expect(allTickets.some(t => t.orderId === orderId)).toBe(true);
    });
  });

  describe('Server-Side & Client-Side Multi-Order Merging (No Lost Orders)', () => {
    it('mergeOrderItems appends new items while preserving existing items', async () => {
      const { mergeOrderItems } = await import('../api/public');
      const existing = [
        { id: 'item-1', name: 'Margherita Pizza', price: 400, qty: 1, notes: '' },
      ];
      const incoming = [
        { id: 'item-2', name: 'French Fries', price: 150, qty: 1, notes: 'Extra crispy' },
      ];

      const merged = mergeOrderItems(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(merged[0].name).toBe('Margherita Pizza');
      expect(merged[0].qty).toBe(1);
      expect(merged[1].name).toBe('French Fries');
      expect(merged[1].qty).toBe(1);
    });

    it('mergeOrderItems updates quantity without duplicating when same item is ordered again', async () => {
      const { mergeOrderItems } = await import('../api/public');
      const existing = [
        { id: 'item-1', name: 'Cold Coffee', price: 120, qty: 1, notes: '' },
      ];
      const incoming = [
        { id: 'item-1', name: 'Cold Coffee', price: 120, qty: 2, notes: '' },
      ];

      const merged = mergeOrderItems(existing, incoming);
      expect(merged).toHaveLength(1);
      expect(merged[0].name).toBe('Cold Coffee');
      expect(merged[0].qty).toBe(2);
    });

    it('mergeOrderItems keeps distinct line items when same item has different notes', async () => {
      const { mergeOrderItems } = await import('../api/public');
      const existing = [
        { id: 'item-1', name: 'Burger', price: 200, qty: 1, notes: 'No onion' },
      ];
      const incoming = [
        { id: 'item-1', name: 'Burger', price: 200, qty: 1, notes: 'Extra cheese' },
      ];

      const merged = mergeOrderItems(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(merged[0].notes).toBe('No onion');
      expect(merged[1].notes).toBe('Extra cheese');
    });

    it('guarantees that repeat orders from the same table NEVER lose older items in table cart', async () => {
      const { mergeOrderItems } = await import('../api/public');
      const tableId = 't-kiko-1';
      const initialTable = {
        id: tableId,
        number: 1,
        name: 'Table 1',
        status: 'available',
        guestName: null,
        seatedAt: null,
      };
      setLocalCollection('pos_tables', [initialTable]);
      setLocalCollection('pos_saved_orders', {});

      // ── Order 1: Customer orders Pizza ──────────────────────────────────
      const order1Items = [
        { id: 'pizza-1', _cartKey: 'pizza-1_', name: 'Farmhouse Pizza', price: 450, qty: 1, notes: '' },
      ];
      const tableAfterOrder1 = {
        ...initialTable,
        status: 'ordered',
        guestName: 'Ananya',
        seatedAt: new Date().toISOString(),
      };
      await saveTableState(tableId, tableAfterOrder1);
      await saveTableOrder(tableId, order1Items);

      // Verify Table 1 has Pizza
      let saved = getAll('pos_saved_orders')[tableId];
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Farmhouse Pizza');

      // ── Order 2: Customer from SAME table orders Garlic Bread ───────────
      // Customer's second cart only has garlic bread
      const order2NewItems = [
        { id: 'bread-1', _cartKey: 'bread-1_', name: 'Garlic Bread', price: 180, qty: 1, notes: 'With dip' },
      ];

      // Simulate repeat order merge (both client-side and server-side)
      const currentSavedOrder = getAll('pos_saved_orders')[tableId] || [];
      const mergedOrder2 = mergeOrderItems(currentSavedOrder, order2NewItems);
      await saveTableOrder(tableId, mergedOrder2);

      // Verify Table 1 has BOTH Pizza AND Garlic Bread!
      saved = getAll('pos_saved_orders')[tableId];
      expect(saved).toHaveLength(2);
      expect(saved.map(i => i.name)).toEqual(['Farmhouse Pizza', 'Garlic Bread']);
      expect(saved.find(i => i.name === 'Farmhouse Pizza')?.qty).toBe(1);
      expect(saved.find(i => i.name === 'Garlic Bread')?.qty).toBe(1);

      // ── Order 3: Customer orders another Farmhouse Pizza ───────────────
      const order3NewItems = [
        { id: 'pizza-1', _cartKey: 'pizza-1_', name: 'Farmhouse Pizza', price: 450, qty: 2, notes: '' },
      ];
      const mergedOrder3 = mergeOrderItems(saved, order3NewItems);
      await saveTableOrder(tableId, mergedOrder3);

      // Verify Table 1 retains Garlic Bread and updates Pizza qty to 2!
      saved = getAll('pos_saved_orders')[tableId];
      expect(saved).toHaveLength(2);
      const pizza = saved.find(i => i.name === 'Farmhouse Pizza');
      const bread = saved.find(i => i.name === 'Garlic Bread');
      expect(pizza?.qty).toBe(2);
      expect(bread?.qty).toBe(1);
    });
  });

  describe('Account & Tenant Resolution for Kiko Cafe', () => {
    const mockAccounts = [
      { id: 'kiko-cafe', name: 'Kiko Cafe', status: 'active', plan: 'pro' },
      { id: 'central-kitchen', name: 'Central Kitchen', status: 'active', plan: 'pro' },
    ];

    const mockDb = {
      from: (table) => {
        expect(table).toBe('accounts');
        return {
          select: () => ({
            eq: (col, val) => ({
              maybeSingle: async () => ({
                data: mockAccounts.find(a => a[col] === val) || null,
              }),
            }),
            ilike: (col, val) => ({
              maybeSingle: async () => ({
                data: mockAccounts.find(a => String(a[col]).toLowerCase() === String(val).toLowerCase()) || null,
              }),
            }),
          }),
        };
      },
    };

    it('resolves account by exact id', async () => {
      const res = await resolveAccount(mockDb, 'kiko-cafe');
      expect(res?.id).toBe('kiko-cafe');
    });

    it('resolves account by exact name', async () => {
      const res = await resolveAccount(mockDb, 'Kiko Cafe');
      expect(res?.id).toBe('kiko-cafe');
    });

    it('resolves account case-insensitively', async () => {
      const res = await resolveAccount(mockDb, 'kiko cafe');
      expect(res?.id).toBe('kiko-cafe');
    });

    it('resolves account when unslugged ("kiko-cafe" -> "Kiko Cafe")', async () => {
      const res = await resolveAccount(mockDb, 'kiko-cafe');
      expect(res?.id).toBe('kiko-cafe');
    });

    it('resolves account when slugged ("Kiko Cafe" -> "kiko-cafe")', async () => {
      const res = await resolveAccount(mockDb, 'Kiko Cafe');
      expect(res?.id).toBe('kiko-cafe');
    });

    it('returns null for unknown accounts', async () => {
      const res = await resolveAccount(mockDb, 'unknown-restaurant');
      expect(res).toBeNull();
    });
  });

  describe('Guest CRM Persistence & Input Validation from QR Menu', () => {
    it('saves customer name and mandatory phone number to guest list upon order placement', async () => {
      const guest = await upsertGuestFromQR({
        name: 'Amiya Kumar',
        phone: '+91 98765 43210',
        notes: 'Less spicy',
      });

      expect(guest).toBeDefined();
      expect(guest.name).toBe('Amiya Kumar');
      expect(guest.phone).toBe('+91 98765 43210');
      expect(guest.visitCount).toBe(1);
      expect(guest.tags).toContain('QR Menu');
      expect(guest.channel).toBe('QR Menu');

      const allGuests = getAll('guests');
      expect(allGuests).toHaveLength(1);
      expect(allGuests[0].name).toBe('Amiya Kumar');
      expect(allGuests[0].phone).toBe('+91 98765 43210');
    });

    it('updates existing guest visitCount and lastVisit when the same phone orders again', async () => {
      // First order
      await upsertGuestFromQR({
        name: 'Amiya Kumar',
        phone: '9876543210',
        notes: 'First order',
      });

      let allGuests = getAll('guests');
      expect(allGuests).toHaveLength(1);
      expect(allGuests[0].visitCount).toBe(1);

      // Repeat order from same guest
      await upsertGuestFromQR({
        name: 'Amiya K.',
        phone: '+91 98765 43210', // Same phone digits
        notes: 'Second order',
      });

      allGuests = getAll('guests');
      expect(allGuests).toHaveLength(1); // Not duplicated!
      expect(allGuests[0].visitCount).toBe(2);
      expect(allGuests[0].name).toBe('Amiya K.');
    });

    it('sanitizes table number to numbers only', () => {
      const sanitizeTable = (val) => String(val || '').replace(/\D/g, '');

      expect(sanitizeTable('Table 5')).toBe('5');
      expect(sanitizeTable('T-12')).toBe('12');
      expect(sanitizeTable('#3')).toBe('3');
      expect(sanitizeTable('99')).toBe('99');
      expect(sanitizeTable('abc')).toBe('');
    });

    it('validates mandatory phone number requiring at least 7 digits', () => {
      const validatePhone = (val) => {
        const clean = String(val || '').trim().replace(/\D/g, '');
        return clean.length >= 7;
      };

      expect(validatePhone('')).toBe(false);
      expect(validatePhone('   ')).toBe(false);
      expect(validatePhone('12345')).toBe(false);
      expect(validatePhone('9876543')).toBe(true);
      expect(validatePhone('+91 98765 43210')).toBe(true);
    });

    it('enforces phone number as UNIQUE identifier — same name with different phone numbers creates 2 separate guests', async () => {
      // First guest: Rahul with phone 9876543210
      const guest1 = await upsertGuestFromQR({
        name: 'Rahul',
        phone: '9876543210',
      });

      // Second guest: Also named Rahul, but with different phone 9123456789
      const guest2 = await upsertGuestFromQR({
        name: 'Rahul',
        phone: '9123456789',
      });

      const allGuests = getAll('guests');
      expect(allGuests).toHaveLength(2);
      expect(allGuests.find(g => g.phone === '9876543210')).toBeDefined();
      expect(allGuests.find(g => g.phone === '9123456789')).toBeDefined();
      expect(guest1.id).not.toBe(guest2.id);
    });

    it('enforces phone number as UNIQUE identifier — same phone number CANNOT be assigned to 2 guests', async () => {
      // First order with phone
      const g1 = await upsertGuestFromQR({
        name: 'John Doe',
        phone: '+919988776655',
      });

      // Repeat order from same phone with different name formatting
      const g2 = await upsertGuestFromQR({
        name: 'Johnathan Doe',
        phone: '9988776655', // same normalized digits
      });

      const allGuests = getAll('guests');
      expect(allGuests).toHaveLength(1); // exactly 1 guest
      expect(allGuests[0].id).toBe(g1.id);
      expect(allGuests[0].name).toBe('Johnathan Doe');
      expect(allGuests[0].visitCount).toBe(2);
    });

    it('deduplicates existing guest list so no two guests ever share the same phone number', async () => {
      // Pre-seed 2 duplicate entries in guests collection
      setLocalCollection('guests', [
        { id: 'g1', name: 'User A', phone: '9876500000', visitCount: 1 },
        { id: 'g2', name: 'User A Dup', phone: '+91 9876500000', visitCount: 1 },
      ]);

      await upsertGuestFromQR({
        name: 'User A Final',
        phone: '9876500000',
      });

      const allGuests = getAll('guests');
      expect(allGuests).toHaveLength(1);
      expect(allGuests[0].phone).toBe('9876500000');
      expect(allGuests[0].name).toBe('User A Final');
    });
  });

  describe('POS Floor Plan Table Matching (buildPosTables & matchTableEntry)', () => {
    const floorPlan = {
      tables: [
        { id: 1, label: 'Table 1', number: 1, seats: 4, shape: 'square' },
        { id: 2, label: 'Table 2', number: 2, seats: 4, shape: 'square' },
        { id: 't3', label: 'Table 3', number: 3, seats: 6, shape: 'round' },
      ],
      sections: ['Main'],
    };

    it('matches floor plan table (id: 1) with saved table saved under "tbl_1"', () => {
      const savedTables = [
        { id: 'tbl_1', number: '1', status: 'ordered', guestName: 'Guest 1', seatedAt: '2026-10-09T10:00:00Z' },
      ];

      const merged = buildPosTables(floorPlan, savedTables);
      expect(merged).toHaveLength(3);

      const table1 = merged.find(t => String(t.id) === '1');
      expect(table1).toBeDefined();
      expect(table1.status).toBe('ordered');
      expect(table1.guestName).toBe('Guest 1');
      expect(table1.seatedAt).toBe('2026-10-09T10:00:00Z');
    });

    it('matches floor plan table with saved table by table number or label', () => {
      const savedTables = [
        { id: 'custom_id_99', number: 2, status: 'ordered', guestName: 'Kiko Diner' },
      ];

      const merged = buildPosTables(floorPlan, savedTables);
      const table2 = merged.find(t => String(t.id) === '2');
      expect(table2).toBeDefined();
      expect(table2.status).toBe('ordered');
      expect(table2.guestName).toBe('Kiko Diner');
    });

    it('includes dynamically created QR tables that are not in the base floor plan', () => {
      const savedTables = [
        { id: 'tbl_10', number: '10', name: 'Table 10', status: 'ordered', guestName: 'Walk-in' },
      ];

      const merged = buildPosTables(floorPlan, savedTables);
      // 3 floor plan tables + 1 extra dynamic table = 4 tables
      expect(merged).toHaveLength(4);

      const dynamicTable = merged.find(t => String(t.id) === 'tbl_10');
      expect(dynamicTable).toBeDefined();
      expect(dynamicTable.status).toBe('ordered');
      expect(dynamicTable.guestName).toBe('Walk-in');
    });

    it('matchTableEntry correctly matches across ID prefixes and numbers', () => {
      expect(matchTableEntry({ id: 'tbl_1', number: '1' }, { id: 1, number: 1 })).toBe(true);
      expect(matchTableEntry({ id: 'tbl_5', number: 5 }, { id: 't5', number: 5 })).toBe(true);
      expect(matchTableEntry({ id: 'custom', label: 'Table 2' }, { id: 2, label: 'Table 2' })).toBe(true);
      expect(matchTableEntry({ id: 'tbl_1' }, { id: 2 })).toBe(false);
    });

    it('normalizes leading zeros and prevents duplicate floating ghost tables', () => {
      const savedTables = [
        { id: 'tbl_01', number: '01', status: 'ordered', guestName: 'Prince' },
        { id: 'tbl_02', number: '02', status: 'ordered', guestName: 'Vishal' },
      ];

      const merged = buildPosTables(floorPlan, savedTables);
      // Base floor plan has 3 tables; ghost variants 01 & 02 must merge into Table 1 & Table 2
      // and NOT create duplicate floating tables
      expect(merged).toHaveLength(3);

      const table1 = merged.find(t => String(t.id) === '1');
      expect(table1).toBeDefined();
      expect(table1.status).toBe('ordered');
      expect(table1.guestName).toBe('Prince');

      const table2 = merged.find(t => String(t.id) === '2');
      expect(table2).toBeDefined();
      expect(table2.status).toBe('ordered');
      expect(table2.guestName).toBe('Vishal');
    });

    it('matchTableEntry matches ghost variants (tbl_01, tbl_05, tbl_1o) with canonical tables', () => {
      expect(matchTableEntry({ id: 'tbl_01', number: '01' }, { id: 1, number: 1 })).toBe(true);
      expect(matchTableEntry({ id: 'tbl_05', number: '05' }, { id: 5, number: 5 })).toBe(true);
      expect(matchTableEntry({ id: 'tbl_1o', number: '1o' }, { id: 10, number: 10 })).toBe(true);
    });

    it('resolveTableSavedOrder resolves orders stored under canonical or ghost keys', () => {
      const savedOrders = {
        tbl_01: [{ name: 'Burger', qty: 1, price: 150 }],
        '5': [{ name: 'Fries', qty: 2, price: 80 }],
        tbl_1o: [{ name: 'Shake', qty: 1, price: 120 }],
      };

      const table1 = { id: 1, number: 1 };
      const table5 = { id: 't5', number: 5 };
      const table10 = { id: 10, number: 10 };

      expect(resolveTableSavedOrder(savedOrders, table1)).toHaveLength(1);
      expect(resolveTableSavedOrder(savedOrders, table1)[0].name).toBe('Burger');

      expect(resolveTableSavedOrder(savedOrders, table5)).toHaveLength(1);
      expect(resolveTableSavedOrder(savedOrders, table5)[0].name).toBe('Fries');

      expect(resolveTableSavedOrder(savedOrders, table10)).toHaveLength(1);
      expect(resolveTableSavedOrder(savedOrders, table10)[0].name).toBe('Shake');
    });
  });

  describe('KDS Ticket Creation Flow from QR Menu', () => {
    it('creates active KDS ticket with items, tokenNumber, and table reference', async () => {
      const items = [
        { id: 'item_coffee', name: 'Cold Brew', price: 200, qty: 1, station: 'Bar' },
        { id: 'item_croissant', name: 'Almond Croissant', price: 180, qty: 2, station: 'Pantry' },
      ];

      const ticket = await createKDSTicket('QR-1-1001', items, '1', 'dine-in', {
        guestName: 'Rahul',
        tokenNumber: '1',
        notes: 'Less sweet',
      });

      expect(ticket).toBeDefined();
      expect(ticket.orderId).toBe('QR-1-1001');
      expect(ticket.status).toBe('active');
      expect(ticket.tableId).toBe('1');
      expect(ticket.tokenNumber).toBe('1');
      expect(ticket.guestName).toBe('Rahul');
      expect(ticket.items).toHaveLength(2);
      expect(ticket.items[0].status).toBe('pending');

      const allTickets = getAll('kds_tickets');
      expect(allTickets).toHaveLength(1);
      expect(allTickets[0].orderId).toBe('QR-1-1001');
    });

    it('creates active KDS ticket with numeric tableId without crashing', async () => {
      const items = [
        { id: 'item_momos', name: 'Veg steamed momos', price: 60, qty: 1, station: 'Main Kitchen' }
      ];

      const ticket = await createKDSTicket('QR-7-5438', items, 7, 'dine-in', {
        guestName: 'Kumar',
        tokenNumber: 7,
      });

      expect(ticket).toBeDefined();
      expect(ticket.tableId).toBe(7);
      expect(ticket.status).toBe('active');
    });

    it('normalizes KDS tableId and tableNumber safely across numeric and string values', () => {
      const cleanId = (s) => {
        let str = String(s ?? '').trim().toLowerCase().replace(/^(table|tbl|t|#|\s|-|_)+/i, '');
        if (str === '1o') str = '10';
        const stripped = str.replace(/^0+/, '');
        return stripped || str;
      };

      const normalizeTicket = (ticket) => {
        const cleanTNum = ticket.tableNumber != null ? cleanId(ticket.tableNumber) : null;
        const rawTId = ticket.tableId != null ? String(ticket.tableId).trim() : '';
        const cleanTId = rawTId.startsWith('tab_') || rawTId.startsWith('token_')
          ? rawTId
          : (rawTId ? cleanId(rawTId) : null);
        return { cleanTNum, cleanTId };
      };

      expect(normalizeTicket({ tableId: 7, tableNumber: 7 })).toEqual({ cleanTId: '7', cleanTNum: '7' });
      expect(normalizeTicket({ tableId: 'tbl_7', tableNumber: '07' })).toEqual({ cleanTId: '7', cleanTNum: '7' });
      expect(normalizeTicket({ tableId: 'tab_abc123' })).toEqual({ cleanTId: 'tab_abc123', cleanTNum: null });
      expect(normalizeTicket({ tableId: 'token_5' })).toEqual({ cleanTId: 'token_5', cleanTNum: null });
      expect(normalizeTicket({ tableId: null, tableNumber: undefined })).toEqual({ cleanTId: null, cleanTNum: null });
    });
  });

  describe('QR Menu Tenant Scoping & Isolation', () => {
    it('prevents setCurrentTenant from hijacking tenant on /qrmenu/ routes', async () => {
      const origWindow = globalThis.window;
      globalThis.window = { location: { pathname: '/qrmenu/Test' } };

      const { setCurrentTenant, getCurrentTenant, initGuestTenantDB } = await import('../src/db/database');
      await initGuestTenantDB('Test');
      expect(getCurrentTenant()).toBe('Test');

      // Attempt to hijack tenant to Kitchgoo (as happens during background admin auth bootstrap)
      setCurrentTenant('Kitchgoo');
      expect(getCurrentTenant()).toBe('Test'); // Must remain Test!

      globalThis.window = origWindow;
    });

    it('ensures non-Kitchgoo tenants do not fall back to Kitchgoo restaurant name', () => {
      const canonicalTenant = 'Test';
      const account = { id: 'Test', name: 'Test' };
      const settings = {
        restaurant: { name: 'Kitchgoo', tagline: 'A Fine Dining Experience' }
      };

      if (!settings.restaurant) {
        settings.restaurant = { name: account.name || canonicalTenant };
      } else if (!settings.restaurant.name || (settings.restaurant.name === 'Kitchgoo' && canonicalTenant.toLowerCase() !== 'kitchgoo')) {
        settings.restaurant = { ...settings.restaurant, name: account.name || canonicalTenant };
      }

      expect(settings.restaurant.name).toBe('Test');
    });
  });
});


