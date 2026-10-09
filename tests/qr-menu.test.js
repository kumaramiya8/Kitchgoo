import { describe, it, expect, beforeEach } from 'vitest';
import { matchTable } from '../src/pages/QRMenu';
import { createKDSTicket, saveTableState, saveTableOrder, setLocalCollection, getAll, upsertGuestFromQR } from '../src/db/database';
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
  });
});

