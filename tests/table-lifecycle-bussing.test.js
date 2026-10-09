import { describe, it, expect } from 'vitest';
import { getTableKeys, resolveTableSavedOrder } from '../src/pages/POS';

describe('Table Status Lifecycle & Bussing Settlement System', () => {
  describe('getTableKeys', () => {
    it('generates all alias keys for numeric and string table representations', () => {
      const table = { id: 3, number: 3 };
      const keys = getTableKeys(table);
      expect(keys).toContain(3);
      expect(keys).toContain('3');
      expect(keys).toContain('tbl_3');
      expect(keys).toContain('table_3');
      expect(keys).toContain('03');
      expect(keys).toContain('tbl_03');
    });

    it('generates correct keys for Table 10 / 1o alias', () => {
      const table = { id: 10, number: 10 };
      const keys = getTableKeys(table);
      expect(keys).toContain(10);
      expect(keys).toContain('10');
      expect(keys).toContain('tbl_10');
      expect(keys).toContain('tbl_1o');
      expect(keys).toContain('1o');
    });

    it('handles table object with distinct id and number', () => {
      const table = { id: 'tbl_custom_3', number: 3 };
      const keys = getTableKeys(table);
      expect(keys).toContain('tbl_custom_3');
      expect(keys).toContain(3);
      expect(keys).toContain('3');
      expect(keys).toContain('tbl_3');
    });
  });

  describe('resolveTableSavedOrder', () => {
    it('resolves orders stored under tbl_ prefix when looking up by numeric ID', () => {
      const savedOrders = {
        tbl_3: [{ id: 'item1', name: 'Noodles', price: 150, qty: 1 }],
      };
      const table = { id: 3, number: 3, status: 'ordered' };
      const items = resolveTableSavedOrder(savedOrders, table);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Noodles');
    });

    it('resolves orders stored under numeric key when looking up by string table', () => {
      const savedOrders = {
        '3': [{ id: 'item2', name: 'Fried Rice', price: 180, qty: 2 }],
      };
      const table = { id: '3', number: '3', status: 'ordered' };
      const items = resolveTableSavedOrder(savedOrders, table);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Fried Rice');
    });
  });

  describe('Purging upon Settlement and Cleaning', () => {
    it('purges all alias representations of an order when keys are deleted', () => {
      const savedOrders = {
        '3': [{ id: 'item1', name: 'Noodles', price: 150, qty: 1 }],
        tbl_3: [{ id: 'item1', name: 'Noodles', price: 150, qty: 1 }],
        tbl_03: [{ id: 'item1', name: 'Noodles', price: 150, qty: 1 }],
        '7': [{ id: 'itemX', name: 'Paneer', price: 200, qty: 1 }],
      };

      const table3 = { id: 3, number: 3 };
      const keysToDelete = getTableKeys(table3);

      const next = { ...savedOrders };
      keysToDelete.forEach(k => delete next[k]);

      expect(next['3']).toBeUndefined();
      expect(next['tbl_3']).toBeUndefined();
      expect(next['tbl_03']).toBeUndefined();
      // Other tables must remain intact
      expect(next['7']).toBeDefined();

      // resolveTableSavedOrder should now return empty
      const resolved = resolveTableSavedOrder(next, table3);
      expect(resolved).toEqual([]);
    });
  });

  describe('Table Status Sequence', () => {
    it('follows the strict progression: Available -> Seated -> Ordered -> Eating -> Paying -> Bussing -> Available', () => {
      let table = { id: 3, number: 3, status: 'available', guestName: null, seatedAt: null };
      expect(table.status).toBe('available');

      // 1. Staff confirms guest -> Seated
      table = { ...table, status: 'seated', guestName: 'Alice', seatedAt: new Date().toISOString() };
      expect(table.status).toBe('seated');

      // 2. Order fired / saved -> Ordered
      table = { ...table, status: 'ordered' };
      expect(table.status).toBe('ordered');

      // 3. Kitchen completes ticket -> Eating
      table = { ...table, status: 'eating' };
      expect(table.status).toBe('eating');

      // 4. Staff clicks Settle Bill -> Paying
      table = { ...table, status: 'paying' };
      expect(table.status).toBe('paying');

      // 5. Payment completed -> Bussing (needs-bussing)
      table = { ...table, status: 'needs-bussing', guestName: null, guestId: null, seatedAt: null };
      expect(table.status).toBe('needs-bussing');

      // 6. Staff cleans table -> Available
      table = { ...table, status: 'available' };
      expect(table.status).toBe('available');
    });
  });
});
