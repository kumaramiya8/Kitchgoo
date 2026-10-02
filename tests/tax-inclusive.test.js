import { describe, it, expect, beforeEach } from 'vitest';
import { createOrder, setLocalCollection, updateSettings, getSettings } from '../src/db/database';

describe('GST Inclusive & Exclusive Menu Pricing System', () => {
  beforeEach(() => {
    // Reset settings with standard test billing configuration
    setLocalCollection('settings', {
      restaurant: { currency: '₹', name: 'Test Cafe' },
      billing: {
        gstRate: 5,
        pricesIncludeGst: true,
        enableServiceCharge: false,
        serviceCharge: 0,
        autoGratuityEnabled: false,
        billPrefix: 'INV',
      },
    });
    setLocalCollection('orders', []);
  });

  describe('Tax & Subtotal Computation Logic', () => {
    it('correctly calculates inclusive GST (5%) where item total matches final bill', () => {
      const itemsTotal = 100;
      const gstRate = 5;
      const pricesIncludeGst = true;

      const tax = pricesIncludeGst
        ? itemsTotal - (itemsTotal / (1 + gstRate / 100))
        : itemsTotal * (gstRate / 100);
      const subtotalNet = pricesIncludeGst ? itemsTotal - tax : itemsTotal;
      const grandTotal = pricesIncludeGst ? itemsTotal : itemsTotal + tax;

      expect(Math.round(tax * 100) / 100).toBe(4.76);
      expect(Math.round(subtotalNet * 100) / 100).toBe(95.24);
      expect(grandTotal).toBe(100);
    });

    it('correctly calculates inclusive GST for 18% tax bracket', () => {
      const itemsTotal = 250;
      const gstRate = 18;
      const pricesIncludeGst = true;

      const tax = pricesIncludeGst
        ? itemsTotal - (itemsTotal / (1 + gstRate / 100))
        : itemsTotal * (gstRate / 100);
      const subtotalNet = pricesIncludeGst ? itemsTotal - tax : itemsTotal;
      const grandTotal = pricesIncludeGst ? itemsTotal : itemsTotal + tax;

      expect(Math.round(tax * 100) / 100).toBe(38.14);
      expect(Math.round(subtotalNet * 100) / 100).toBe(211.86);
      expect(grandTotal).toBe(250);
    });

    it('correctly calculates exclusive GST (5%) where tax is added on top', () => {
      const itemsTotal = 100;
      const gstRate = 5;
      const pricesIncludeGst = false;

      const tax = pricesIncludeGst
        ? itemsTotal - (itemsTotal / (1 + gstRate / 100))
        : itemsTotal * (gstRate / 100);
      const subtotalNet = pricesIncludeGst ? itemsTotal - tax : itemsTotal;
      const grandTotal = pricesIncludeGst ? itemsTotal : itemsTotal + tax;

      expect(tax).toBe(5);
      expect(subtotalNet).toBe(100);
      expect(grandTotal).toBe(105);
    });

    it('handles 0% GST gracefully in both modes', () => {
      const itemsTotal = 150;
      const gstRate = 0;

      const taxInclusive = itemsTotal - (itemsTotal / (1 + gstRate / 100));
      const taxExclusive = itemsTotal * (gstRate / 100);

      expect(taxInclusive).toBe(0);
      expect(taxExclusive).toBe(0);
    });
  });

  describe('Database createOrder Execution with pricesIncludeGst', () => {
    it('creates order with inclusive GST by default', async () => {
      const items = [
        { id: 'item_1', name: 'Cold Coffee', price: 100, qty: 1 },
      ];

      const order = await createOrder('table-1', items, 'Cash');

      expect(order.pricesIncludeGst).toBe(true);
      expect(Math.round(order.tax * 100) / 100).toBe(4.76);
      expect(Math.round(order.subtotal * 100) / 100).toBe(95.24);
      expect(order.total).toBe(100);
    });

    it('creates order with exclusive GST when pricesIncludeGst is disabled in settings', async () => {
      await updateSettings('billing', {
        gstRate: 5,
        pricesIncludeGst: false,
        enableServiceCharge: false,
        billPrefix: 'INV',
      });

      const items = [
        { id: 'item_1', name: 'Cold Coffee', price: 100, qty: 1 },
      ];

      const order = await createOrder('table-1', items, 'Cash');

      expect(order.pricesIncludeGst).toBe(false);
      expect(order.tax).toBe(5);
      expect(order.subtotal).toBe(100);
      expect(order.total).toBe(105);
    });
  });

  describe('Split Bill Calculation under Inclusive Mode', () => {
    it('sums split items accurately to grand total without double-taxing in inclusive mode', () => {
      const cart = [
        { id: 'p1', name: 'Pizza', price: 300, qty: 1 },
        { id: 'c1', name: 'Coke', price: 50, qty: 2 },
      ];
      const gstRate = 5;
      const pricesIncludeGst = true;

      // Item total = 300 + 100 = 400
      const grandTotal = 400;

      // Person A takes Pizza (300), Person B takes 2 Cokes (100)
      const itemAssignments = { p1: 'A', c1: 'B' };
      const totals = {};

      cart.forEach(item => {
        const person = itemAssignments[item.id] || 'A';
        const lineTotal = pricesIncludeGst
          ? item.price * item.qty
          : item.price * item.qty * (1 + gstRate / 100);
        totals[person] = (totals[person] || 0) + lineTotal;
      });

      expect(totals['A']).toBe(300);
      expect(totals['B']).toBe(100);
      expect(totals['A'] + totals['B']).toBe(grandTotal);
    });
  });
});
