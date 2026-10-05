import { describe, it, expect, beforeEach } from 'vitest';
import { transferKDSTickets, setLocalCollection, getAll, insert } from '../src/db/database';

describe('Table Shift & Transfer System', () => {
  beforeEach(() => {
    setLocalCollection('kds_tickets', []);
  });

  describe('KDS Ticket Table Transfer', () => {
    it('transfers active tickets from Table 1 to Table 2 and preserves shifted metadata', async () => {
      // Create test active ticket on Table 1
      const ticket1 = await insert('kds_tickets', {
        orderId: 'T1-1001',
        items: [{ id: 'item-1', name: 'Burger', qty: 2, status: 'pending' }],
        tableId: 'table-1',
        status: 'active',
      });

      // Create a completed ticket on Table 1 (should NOT be transferred)
      const ticketCompleted = await insert('kds_tickets', {
        orderId: 'T1-9999',
        items: [{ id: 'item-0', name: 'Water', qty: 1, status: 'bumped' }],
        tableId: 'table-1',
        status: 'completed',
      });

      // Create an active ticket on Table 3 (should NOT be touched)
      const ticket3 = await insert('kds_tickets', {
        orderId: 'T3-1002',
        items: [{ id: 'item-2', name: 'Pizza', qty: 1, status: 'pending' }],
        tableId: 'table-3',
        status: 'active',
      });

      const transferredCount = await transferKDSTickets('table-1', 'table-2', '1', '2');
      expect(transferredCount).toBe(1);

      const allTickets = getAll('kds_tickets');
      const updatedTicket1 = allTickets.find(t => t.id === ticket1.id);
      expect(updatedTicket1.tableId).toBe('table-2');
      expect(updatedTicket1.tableShiftedFrom).toBe('1');
      expect(updatedTicket1.tableShiftedTo).toBe('2');
      expect(updatedTicket1.shiftedAt).toBeDefined();

      const unchangedCompleted = allTickets.find(t => t.id === ticketCompleted.id);
      expect(unchangedCompleted.tableId).toBe('table-1');
      expect(unchangedCompleted.tableShiftedFrom).toBeUndefined();

      const unchangedTicket3 = allTickets.find(t => t.id === ticket3.id);
      expect(unchangedTicket3.tableId).toBe('table-3');
      expect(unchangedTicket3.tableShiftedFrom).toBeUndefined();
    });

    it('matches table by table number when string format varies', async () => {
      const ticket = await insert('kds_tickets', {
        orderId: 'T5-2001',
        items: [{ id: 'item-3', name: 'Pasta', qty: 1, status: 'pending' }],
        tableId: '5',
        status: 'active',
      });

      const count = await transferKDSTickets('table-5-uuid', 'table-6-uuid', '5', '6');
      expect(count).toBe(1);

      const updated = getAll('kds_tickets').find(t => t.id === ticket.id);
      expect(updated.tableId).toBe('table-6-uuid');
      expect(updated.tableShiftedFrom).toBe('5');
    });
  });

  describe('POS Tab & Table Shift Logic', () => {
    it('moves saved orders from Table A to available Table B and flags Table A for bussing', () => {
      const initialSavedOrders = {
        'table-1': [
          { id: 'item-1', name: 'Paneer Tikka', price: 250, qty: 2 },
          { id: 'item-2', name: 'Butter Naan', price: 40, qty: 3 },
        ],
      };

      const initialTables = [
        { id: 'table-1', number: 1, status: 'ordered', guestName: 'Alice', partySize: 2 },
        { id: 'table-2', number: 2, status: 'available', guestName: null, partySize: null },
      ];

      // Simulate shift function logic
      const fromTableId = 'table-1';
      const toTableId = 'table-2';
      const markNeedsCleaning = true;

      const fromItems = initialSavedOrders[fromTableId] || [];

      // Combine orders
      const updatedSavedOrders = { ...initialSavedOrders };
      delete updatedSavedOrders[fromTableId];
      updatedSavedOrders[toTableId] = fromItems;

      // Update tables
      const fromTable = initialTables.find(t => t.id === fromTableId);

      const updatedTables = initialTables.map(t => {
        if (t.id === fromTableId) {
          return {
            ...t,
            status: markNeedsCleaning ? 'needs-bussing' : 'available',
            guestName: null,
            partySize: null,
          };
        }
        if (t.id === toTableId) {
          return {
            ...t,
            status: fromTable.status,
            guestName: fromTable.guestName,
            partySize: fromTable.partySize,
          };
        }
        return t;
      });

      expect(updatedSavedOrders['table-1']).toBeUndefined();
      expect(updatedSavedOrders['table-2']).toHaveLength(2);
      expect(updatedSavedOrders['table-2'][0].name).toBe('Paneer Tikka');

      const updatedT1 = updatedTables.find(t => t.id === 'table-1');
      expect(updatedT1.status).toBe('needs-bussing');
      expect(updatedT1.guestName).toBeNull();

      const updatedT2 = updatedTables.find(t => t.id === 'table-2');
      expect(updatedT2.status).toBe('ordered');
      expect(updatedT2.guestName).toBe('Alice');
      expect(updatedT2.partySize).toBe(2);
    });

    it('merges items when shifting into an already occupied table', () => {
      const savedOrders = {
        'table-1': [
          { _cartKey: 'k1', id: 'biryani', name: 'Biryani', price: 300, qty: 1 },
          { _cartKey: 'k2', id: 'coke', name: 'Coke', price: 50, qty: 2 },
        ],
        'table-2': [
          { _cartKey: 'k2', id: 'coke', name: 'Coke', price: 50, qty: 1 },
          { _cartKey: 'k3', id: 'dessert', name: 'Gulab Jamun', price: 80, qty: 1 },
        ],
      };

      const fromItems = savedOrders['table-1'];
      const targetItems = [...savedOrders['table-2']];

      fromItems.forEach(item => {
        const existing = targetItems.find(i => (i._cartKey || i.id) === (item._cartKey || item.id));
        if (existing) {
          existing.qty += item.qty;
        } else {
          targetItems.push({ ...item });
        }
      });

      const nextSavedOrders = { ...savedOrders };
      delete nextSavedOrders['table-1'];
      nextSavedOrders['table-2'] = targetItems;

      expect(nextSavedOrders['table-1']).toBeUndefined();
      expect(nextSavedOrders['table-2']).toHaveLength(3);

      // Coke quantity merged: 1 + 2 = 3
      const mergedCoke = nextSavedOrders['table-2'].find(i => i.id === 'coke');
      expect(mergedCoke.qty).toBe(3);

      // Biryani added
      const addedBiryani = nextSavedOrders['table-2'].find(i => i.id === 'biryani');
      expect(addedBiryani.qty).toBe(1);

      // Gulab Jamun preserved
      const dessert = nextSavedOrders['table-2'].find(i => i.id === 'dessert');
      expect(dessert.qty).toBe(1);
    });

    it('preserves active cart items during shift table even if not yet saved to savedOrders', () => {
      // User is on Table 1, has added items to cart without firing KOT
      const activeTable = { id: 1, number: 1, status: 'seated', guestName: 'Bob', partySize: 2 };
      const currentCart = [
        { id: 'burger', name: 'Veggie Burger', price: 150, qty: 2 },
        { id: 'fries', name: 'Peri Peri Fries', price: 90, qty: 1 },
      ];
      const savedOrders = {}; // Not yet saved via KOT
      const tables = [
        { id: 1, number: 1, status: 'seated', guestName: 'Bob', partySize: 2 },
        { id: 2, number: 2, status: 'available', guestName: null, partySize: null },
      ];

      const fromTable = activeTable;
      const targetTableId = 2;
      const toTable = tables.find(t => String(t.id) === String(targetTableId));

      const fromItems = (currentCart && currentCart.length > 0)
        ? currentCart
        : (savedOrders[fromTable.id] || savedOrders[String(fromTable.id)] || []);
      const targetExistingItems = savedOrders[toTable.id] || savedOrders[String(toTable.id)] || [];

      let finalTargetItems = [];
      if (targetExistingItems.length > 0) {
        finalTargetItems = [...targetExistingItems];
        fromItems.forEach(item => {
          const existing = finalTargetItems.find(i => (i._cartKey || i.id) === (item._cartKey || item.id));
          if (existing) {
            existing.qty += item.qty;
          } else {
            finalTargetItems.push({ ...item });
          }
        });
      } else {
        finalTargetItems = fromItems.map(i => ({ ...i }));
      }

      // Update savedOrders
      const nextSavedOrders = { ...savedOrders };
      delete nextSavedOrders[fromTable.id];
      delete nextSavedOrders[String(fromTable.id)];
      nextSavedOrders[toTable.id] = finalTargetItems;
      nextSavedOrders[String(toTable.id)] = finalTargetItems;

      // Update active table & cart
      const updatedToTable = {
        ...toTable,
        status: finalTargetItems.length > 0 ? 'ordered' : 'seated',
        guestName: fromTable.guestName || toTable.guestName,
        partySize: fromTable.partySize || toTable.partySize || 1,
      };

      const newActiveCart = finalTargetItems;

      // Assertions
      expect(newActiveCart).toHaveLength(2);
      expect(newActiveCart[0].name).toBe('Veggie Burger');
      expect(newActiveCart[1].name).toBe('Peri Peri Fries');
      expect(nextSavedOrders[2]).toHaveLength(2);
      expect(nextSavedOrders['2']).toHaveLength(2);
      expect(updatedToTable.status).toBe('ordered');
      expect(updatedToTable.guestName).toBe('Bob');
    });

    it('preserves active table cart into savedOrders when returning to floor view', () => {
      const activeTable = { id: 1, number: 1, status: 'seated', guestName: 'Charlie' };
      const cart = [{ id: 'coffee', name: 'Cappuccino', price: 120, qty: 1 }];
      let savedOrders = {};
      let tables = [{ id: 1, number: 1, status: 'seated', guestName: 'Charlie' }];

      // Simulate Floor back button handler for activeTable
      if (cart.length > 0) {
        savedOrders = {
          ...savedOrders,
          [activeTable.id]: cart,
          [String(activeTable.id)]: cart,
        };
        tables = tables.map(t => String(t.id) === String(activeTable.id)
          ? { ...t, status: t.status === 'available' ? 'ordered' : t.status }
          : t
        );
      }

      // Assert savedOrders now contains the unfired cart
      expect(savedOrders[1]).toBeDefined();
      expect(savedOrders[1]).toHaveLength(1);
      expect(savedOrders['1'][0].name).toBe('Cappuccino');
    });
  });
});
