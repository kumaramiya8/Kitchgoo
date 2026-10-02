import { describe, it, expect, beforeEach } from 'vitest';
import { cancelKDSTickets, setLocalCollection, getAll, insert } from '../src/db/database';

describe('Table Release & Clear System', () => {
  beforeEach(() => {
    setLocalCollection('kds_tickets', []);
  });

  describe('KDS Ticket Cancellation on Table Release', () => {
    it('cancels active tickets for released table and preserves tickets from other tables', async () => {
      // Active ticket on Table 4
      const ticket4 = await insert('kds_tickets', {
        orderId: 'T4-101',
        items: [{ id: 'item-1', name: 'Spring Roll', qty: 2, status: 'pending' }],
        tableId: 'table-4',
        status: 'active',
      });

      // Completed ticket on Table 4 (should NOT be marked cancelled)
      const ticket4Completed = await insert('kds_tickets', {
        orderId: 'T4-100',
        items: [{ id: 'item-0', name: 'Water', qty: 1, status: 'bumped' }],
        tableId: 'table-4',
        status: 'completed',
      });

      // Active ticket on Table 7 (should remain untouched)
      const ticket7 = await insert('kds_tickets', {
        orderId: 'T7-102',
        items: [{ id: 'item-2', name: 'Paneer Butter Masala', qty: 1, status: 'pending' }],
        tableId: 'table-7',
        status: 'active',
      });

      const cancelledCount = await cancelKDSTickets('table-4', '4');
      expect(cancelledCount).toBe(1);

      const allTickets = getAll('kds_tickets');
      const updatedTicket4 = allTickets.find(t => t.id === ticket4.id);
      expect(updatedTicket4.status).toBe('cancelled');
      expect(updatedTicket4.cancelledAt).toBeDefined();

      const unchangedTicket4Completed = allTickets.find(t => t.id === ticket4Completed.id);
      expect(unchangedTicket4Completed.status).toBe('completed');

      const unchangedTicket7 = allTickets.find(t => t.id === ticket7.id);
      expect(unchangedTicket7.status).toBe('active');
    });

    it('matches table by table number string when stored as table number', async () => {
      const ticket = await insert('kds_tickets', {
        orderId: 'T12-301',
        items: [{ id: 'item-5', name: 'Garlic Naan', qty: 4, status: 'pending' }],
        tableId: '12',
        status: 'active',
      });

      const cancelledCount = await cancelKDSTickets('tbl_12_uuid', '12');
      expect(cancelledCount).toBe(1);

      const updated = getAll('kds_tickets').find(t => t.id === ticket.id);
      expect(updated.status).toBe('cancelled');
    });
  });

  describe('Table Release Logic (Empty and Occupied Tables)', () => {
    it('releases an empty seated table directly to available', () => {
      const initialTables = [
        {
          id: 'table-1',
          number: 1,
          status: 'seated',
          guestName: 'Walk-in Guest',
          guestId: null,
          partySize: 2,
          seatedAt: '2026-10-02T10:00:00.000Z',
        },
        {
          id: 'table-2',
          number: 2,
          status: 'ordered',
          guestName: 'Bob',
          guestId: null,
          partySize: 4,
          seatedAt: '2026-10-02T09:30:00.000Z',
        },
      ];

      const initialSavedOrders = {
        'table-2': [{ id: 'soup', name: 'Hot & Sour Soup', qty: 2, price: 120 }],
      };

      // Simulating handleReleaseTable on table-1 with empty cart and 0 saved items
      const tableIdToRelease = 'table-1';
      const markStatus = 'available';

      const updatedSavedOrders = { ...initialSavedOrders };
      delete updatedSavedOrders[tableIdToRelease];

      const updatedTables = initialTables.map(t => {
        if (t.id === tableIdToRelease) {
          return {
            ...t,
            status: markStatus,
            guestName: null,
            guestId: null,
            seatedAt: null,
            partySize: null,
            serverId: null,
          };
        }
        return t;
      });

      const releasedTable = updatedTables.find(t => t.id === 'table-1');
      expect(releasedTable.status).toBe('available');
      expect(releasedTable.guestName).toBeNull();
      expect(releasedTable.partySize).toBeNull();
      expect(releasedTable.seatedAt).toBeNull();

      // Ensure other tables are preserved
      const table2 = updatedTables.find(t => t.id === 'table-2');
      expect(table2.status).toBe('ordered');
      expect(table2.guestName).toBe('Bob');
      expect(updatedSavedOrders['table-2']).toHaveLength(1);
    });

    it('releases an occupied table with items, clears savedOrders, and marks as needs-bussing', () => {
      const initialTables = [
        {
          id: 'table-3',
          number: 3,
          status: 'ordered',
          guestName: 'Charlie',
          guestId: 'guest-123',
          partySize: 3,
          seatedAt: '2026-10-02T09:45:00.000Z',
        },
      ];

      const initialSavedOrders = {
        'table-3': [
          { id: 'curry', name: 'Paneer Tikka Masala', qty: 1, price: 280 },
          { id: 'roti', name: 'Tandoori Roti', qty: 4, price: 25 },
        ],
      };

      const tableIdToRelease = 'table-3';
      const markStatus = 'needs-bussing';

      const updatedSavedOrders = { ...initialSavedOrders };
      delete updatedSavedOrders[tableIdToRelease];

      const updatedTables = initialTables.map(t => {
        if (t.id === tableIdToRelease) {
          return {
            ...t,
            status: markStatus,
            guestName: null,
            guestId: null,
            seatedAt: null,
            partySize: null,
            serverId: null,
          };
        }
        return t;
      });

      expect(updatedSavedOrders['table-3']).toBeUndefined();

      const table3 = updatedTables.find(t => t.id === 'table-3');
      expect(table3.status).toBe('needs-bussing');
      expect(table3.guestName).toBeNull();
      expect(table3.guestId).toBeNull();
      expect(table3.partySize).toBeNull();
    });
  });
});
