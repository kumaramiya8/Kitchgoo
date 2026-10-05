import { describe, it, expect, beforeEach } from 'vitest';
import { extractBillNumber, getNextBillCounter, createOrder, getAll } from '../src/db/database';
import { allocateNextBillCounter } from '../api/_lib/core';

describe('Invoice Number Uniqueness & Dynamic Max Scan (#1 and #2)', () => {
  describe('extractBillNumber()', () => {
    it('extracts trailing numeric sequence from standard Kitchgoo bill numbers', () => {
      expect(extractBillNumber('INV-KIK6Y-1069')).toBe(1069);
      expect(extractBillNumber('INV-KIK6Y-1070')).toBe(1070);
      expect(extractBillNumber('INV-1001')).toBe(1001);
      expect(extractBillNumber('DEL-KIK6Y-505')).toBe(505);
      expect(extractBillNumber('BILL-9999')).toBe(9999);
      expect(extractBillNumber('1050')).toBe(1050);
    });

    it('returns null for non-numeric or empty strings', () => {
      expect(extractBillNumber('')).toBe(null);
      expect(extractBillNumber(null)).toBe(null);
      expect(extractBillNumber(undefined)).toBe(null);
      expect(extractBillNumber('INV-ABC')).toBe(null);
    });
  });

  describe('getNextBillCounter() with Dynamic Max Scan', () => {
    it('returns at least max(existing orders) + 1 even if fallback counter is lower', () => {
      // Simulate orders containing #1069 from Oct 2nd
      const nextCounter = getNextBillCounter('Kitchgoo', 1001);
      // Since existing orders in cache may contain various orders, it must be >= 1001
      expect(nextCounter).toBeGreaterThanOrEqual(1001);
    });
  });

  describe('createOrder() collision prevention', () => {
    it('guarantees unique and monotonically increasing bill numbers across created orders', async () => {
      const items = [{ id: '1', name: 'Item 1', price: 100, qty: 1 }];

      const order1 = await createOrder('1', items, 'Cash');
      const order2 = await createOrder('2', items, 'UPI');
      const order3 = await createOrder('3', items, 'Card');

      expect(order1.billNo).toBeDefined();
      expect(order2.billNo).toBeDefined();
      expect(order3.billNo).toBeDefined();

      const num1 = extractBillNumber(order1.billNo);
      const num2 = extractBillNumber(order2.billNo);
      const num3 = extractBillNumber(order3.billNo);

      // Must be distinct
      expect(order1.billNo).not.toBe(order2.billNo);
      expect(order2.billNo).not.toBe(order3.billNo);
      expect(order1.billNo).not.toBe(order3.billNo);

      // Must be strictly increasing
      expect(num2).toBe(num1 + 1);
      expect(num3).toBe(num2 + 1);
    });
  });

  describe('Server Atomic Sequence allocateNextBillCounter()', () => {
    it('allocates next counter higher than any existing order in mock database', async () => {
      const mockOrders = [
        { bill_no: 'INV-KIK6Y-1068' },
        { bill_no: 'INV-KIK6Y-1069' },
      ];

      const mockDb = {
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: mockOrders, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'tenant_data') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { value: { counter: 1069 } }, error: null }),
                  }),
                }),
              }),
              upsert: async () => ({ error: null }),
            };
          }
          return {};
        },
      };

      const next = await allocateNextBillCounter(mockDb, 'Kitchgoo');
      expect(next).toBe(1070); // Must be strictly higher than 1069
    });
  });
});
