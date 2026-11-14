import { describe, it, expect } from 'vitest';
import { getTableKeys, resolveTableSavedOrder, calculateTableBill } from '../src/utils/tableOrders';

describe('Live Orders & Waiter View Helper Functions', () => {
  describe('getTableKeys', () => {
    it('generates comprehensive table aliases for numeric ID', () => {
      const keys = getTableKeys(1);
      expect(keys).toContain(1);
      expect(keys).toContain('1');
      expect(keys).toContain('tbl_1');
      expect(keys).toContain('table_1');
    });

    it('generates table aliases for string ID object', () => {
      const keys = getTableKeys({ id: 't4', number: 4 });
      expect(keys).toContain('t4');
      expect(keys).toContain(4);
      expect(keys).toContain('4');
      expect(keys).toContain('tbl_4');
      expect(keys).toContain('table_4');
    });

    it('handles leading zeros and special OCR keys like 1o / 10', () => {
      const keys = getTableKeys('05');
      expect(keys).toContain('5');
      expect(keys).toContain('tbl_5');

      const keys10 = getTableKeys('10');
      expect(keys10).toContain('tbl_1o');
      expect(keys10).toContain('1o');
    });

    it('returns empty array for null/undefined', () => {
      expect(getTableKeys(null)).toEqual([]);
      expect(getTableKeys(undefined)).toEqual([]);
    });
  });

  describe('resolveTableSavedOrder', () => {
    it('resolves direct array under number key', () => {
      const savedOrders = {
        '1': [{ id: 'burger', name: 'Veg Burger', price: 150, qty: 2 }],
      };
      const items = resolveTableSavedOrder(savedOrders, { id: 't1', number: 1 });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Veg Burger');
    });

    it('resolves items array from object format under tbl_ prefix', () => {
      const savedOrders = {
        'tbl_3': { items: [{ id: 'pizza', name: 'Margherita', price: 300, qty: 1 }] },
      };
      const items = resolveTableSavedOrder(savedOrders, { id: '3', number: 3 });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Margherita');
    });

    it('returns empty array when table has no saved order', () => {
      const savedOrders = {
        '2': [{ id: 'fries', name: 'French Fries', price: 100, qty: 1 }],
      };
      const items = resolveTableSavedOrder(savedOrders, { id: '5', number: 5 });
      expect(items).toEqual([]);
    });
  });

  describe('calculateTableBill', () => {
    const defaultSettings = {
      billing: {
        gstRate: 5,
        pricesIncludeGst: false,
        enableServiceCharge: true,
        serviceCharge: 10,
        roundingMode: 'nearest',
      },
    };

    it('calculates bill with tax and service charge (exclusive)', () => {
      const items = [
        { id: '1', name: 'Cold Coffee', price: 150, qty: 2 }, // 300
        { id: '2', name: 'Brownie', price: 120, qty: 1, modifiers: [{ name: 'Ice Cream', price: 40 }] }, // 160
      ]; // subtotal = 460

      const bill = calculateTableBill({
        items,
        settings: defaultSettings,
        partySize: 2,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(true);
      expect(bill.itemCount).toBe(3); // 2 + 1
      expect(bill.subtotal).toBe(460);
      expect(bill.serviceCharge).toBe(46); // 10% of 460
      // Tax: 5% of 460 = 23
      expect(bill.tax).toBe(23);
      // Total = 460 + 23 + 46 = 529
      expect(bill.grandTotal).toBe(529);
    });

    it('handles tax inclusive pricing properly', () => {
      const inclusiveSettings = {
        billing: {
          gstRate: 5,
          pricesIncludeGst: true,
          enableServiceCharge: false,
          roundingMode: 'nearest',
        },
      };

      const items = [
        { id: '1', name: 'Club Sandwich', price: 210, qty: 1 },
      ];

      const bill = calculateTableBill({
        items,
        settings: inclusiveSettings,
        partySize: 1,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(true);
      expect(bill.grandTotal).toBe(210);
      expect(bill.subtotal).toBe(210);
      expect(bill.subtotalNet).toBeLessThan(210);
      expect(bill.subtotalNet + bill.tax).toBeCloseTo(210, 0);
    });

    it('returns zeroes when items list is empty', () => {
      const bill = calculateTableBill({
        items: [],
        settings: defaultSettings,
        partySize: 1,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(false);
      expect(bill.itemCount).toBe(0);
      expect(bill.subtotal).toBe(0);
      expect(bill.tax).toBe(0);
      expect(bill.serviceCharge).toBe(0);
      expect(bill.grandTotal).toBe(0);
    });
  });

  describe('Floating Tabs Extraction (Unassigned Orders)', () => {
    it('correctly filters and extracts tab_ entries from savedOrders map', () => {
      const savedOrders = {
        '1': [{ id: 'tea', name: 'Masala Tea', price: 40, qty: 2 }],
        'tab_101': {
          id: '101',
          tokenNumber: '101',
          guestName: 'Rahul',
          partySize: 2,
          items: [{ id: 'sandwich', name: 'Paneer Sandwich', price: 180, qty: 1 }],
        },
        'tab_102': [{ id: 'juice', name: 'Orange Juice', price: 120, qty: 2 }],
      };

      const floatingTabs = [];
      Object.entries(savedOrders).forEach(([key, val]) => {
        if (!key.startsWith('tab_') || !val) return;
        const tabId = key.replace(/^tab_/, '');
        if (typeof val === 'object' && !Array.isArray(val) && val.tokenNumber) {
          floatingTabs.push({ ...val, id: val.id || tabId });
        } else {
          const items = Array.isArray(val) ? val : (val.items || []);
          floatingTabs.push({ id: tabId, tokenNumber: tabId, items });
        }
      });

      expect(floatingTabs).toHaveLength(2);
      expect(floatingTabs[0].tokenNumber).toBe('101');
      expect(floatingTabs[0].guestName).toBe('Rahul');
      expect(floatingTabs[1].tokenNumber).toBe('102');
      expect(floatingTabs[1].items).toHaveLength(1);
    });
  });
});
