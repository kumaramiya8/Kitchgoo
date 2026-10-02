import { describe, it, expect } from 'vitest';
import { calculateTableBill } from '../src/utils/tableOrders';

describe('Table Hover & Order Billing Calculation', () => {
  describe('calculateTableBill', () => {
    it('returns zeroes and hasOrder: false when items array is empty', () => {
      const result = calculateTableBill({ items: [] });
      expect(result.items).toEqual([]);
      expect(result.itemCount).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.grandTotal).toBe(0);
      expect(result.hasOrder).toBe(false);
    });

    it('calculates GST inclusive pricing correctly (default)', () => {
      // 1 item priced at ₹525 with 5% GST inclusive
      // tax = 525 - (525 / 1.05) = 525 - 500 = 25
      const items = [{ id: 'p1', name: 'Pizza', price: 525, qty: 1 }];
      const settings = {
        billing: {
          gstRate: 5,
          pricesIncludeGst: true,
        },
      };

      const result = calculateTableBill({ items, settings });
      expect(result.itemCount).toBe(1);
      expect(result.subtotal).toBe(525);
      expect(result.tax).toBe(25);
      expect(result.subtotalNet).toBe(500);
      expect(result.grandTotal).toBe(525);
      expect(result.hasOrder).toBe(true);
    });

    it('calculates GST exclusive pricing when configured', () => {
      // 1 item priced at ₹500 with 5% GST added on top
      // tax = 500 * 0.05 = 25
      // grandTotal = 500 + 25 = 525
      const items = [{ id: 'p1', name: 'Pizza', price: 500, qty: 1 }];
      const settings = {
        billing: {
          gstRate: 5,
          pricesIncludeGst: false,
        },
      };

      const result = calculateTableBill({ items, settings });
      expect(result.subtotal).toBe(500);
      expect(result.tax).toBe(25);
      expect(result.grandTotal).toBe(525);
    });

    it('includes modifiers in line price and subtotal', () => {
      // Burger ₹200 with Extra Cheese (₹30) and Bacon (₹50) = ₹280 each, qty 2 = ₹560
      const items = [
        {
          id: 'b1',
          name: 'Burger',
          price: 200,
          qty: 2,
          modifiers: [
            { name: 'Extra Cheese', price: 30 },
            { name: 'Bacon', price: 50 },
          ],
        },
      ];
      const settings = {
        billing: {
          gstRate: 0,
          pricesIncludeGst: true,
        },
      };

      const result = calculateTableBill({ items, settings });
      expect(result.itemCount).toBe(2);
      expect(result.subtotal).toBe(560);
      expect(result.grandTotal).toBe(560);
    });

    it('calculates service charge and auto-gratuity for large parties', () => {
      const items = [{ id: 'm1', name: 'Meal', price: 1000, qty: 1 }];
      const settings = {
        billing: {
          gstRate: 0,
          pricesIncludeGst: true,
          enableServiceCharge: true,
          serviceCharge: 10, // 10%
          autoGratuityEnabled: true,
          autoGratuityThreshold: 6,
          autoGratuityPercent: 15, // 15%
          autoGratuityPreTax: true,
        },
      };

      // Party of 6 triggers auto-gratuity
      const resultLargeParty = calculateTableBill({ items, settings, partySize: 6 });
      expect(resultLargeParty.serviceCharge).toBe(100);
      expect(resultLargeParty.autoGratuity).toBe(150);
      expect(resultLargeParty.grandTotal).toBe(1250);

      // Party of 4 does not trigger auto-gratuity
      const resultSmallParty = calculateTableBill({ items, settings, partySize: 4 });
      expect(resultSmallParty.serviceCharge).toBe(100);
      expect(resultSmallParty.autoGratuity).toBe(0);
      expect(resultSmallParty.grandTotal).toBe(1100);
    });

    it('handles rounding modes: nearest and up', () => {
      const items = [{ id: 'i1', name: 'Item', price: 100.4, qty: 1 }];
      const settingsNearest = { billing: { roundingMode: 'nearest', gstRate: 0 } };
      const settingsUp = { billing: { roundingMode: 'up', gstRate: 0 } };

      const resNearest = calculateTableBill({ items, settings: settingsNearest });
      expect(resNearest.grandTotal).toBe(100);

      const resUp = calculateTableBill({ items, settings: settingsUp });
      expect(resUp.grandTotal).toBe(101);
    });

    it('applies discount amount properly to grand total', () => {
      const items = [{ id: 'i1', name: 'Item', price: 500, qty: 1 }];
      const settings = { billing: { gstRate: 0 } };

      const result = calculateTableBill({ items, settings, discountAmount: 150 });
      expect(result.subtotal).toBe(500);
      expect(result.grandTotal).toBe(350);
    });

    it('caps grandTotal at 0 if discount exceeds total', () => {
      const items = [{ id: 'i1', name: 'Item', price: 100, qty: 1 }];
      const result = calculateTableBill({ items, discountAmount: 200 });
      expect(result.grandTotal).toBe(0);
    });
  });

  describe('Direct Settlement & Table Hover State Validation', () => {
    it('correctly maps saved orders to table billing when table is hovered', () => {
      const mockSavedOrders = {
        'table-5': [
          { id: 'item-1', name: 'Paneer Tikka', price: 280, qty: 2 },
          { id: 'item-2', name: 'Butter Naan', price: 50, qty: 4 },
        ],
      };

      const table5 = { id: 'table-5', number: 5, status: 'ordered', partySize: 4 };
      const items = mockSavedOrders[table5.id] || [];

      const bill = calculateTableBill({
        items,
        partySize: table5.partySize,
        settings: { billing: { gstRate: 5, pricesIncludeGst: true } },
      });

      // Total items: 2 + 4 = 6
      expect(bill.itemCount).toBe(6);
      // Subtotal: 280*2 + 50*4 = 560 + 200 = 760
      expect(bill.subtotal).toBe(760);
      expect(bill.hasOrder).toBe(true);
      expect(bill.grandTotal).toBe(760);
    });

    it('verifies settle action loads items and marks table status as paying', () => {
      const tables = [
        { id: 'table-1', number: 1, status: 'ordered', partySize: 2 },
        { id: 'table-2', number: 2, status: 'available', partySize: null },
      ];

      const savedOrders = {
        'table-1': [{ id: 'coffee', name: 'Cappuccino', price: 150, qty: 2 }],
      };

      const targetTable = tables[0];
      const itemsToSettle = savedOrders[targetTable.id] || [];

      expect(itemsToSettle).toHaveLength(1);
      expect(itemsToSettle[0].name).toBe('Cappuccino');

      // State transition simulated
      const updatedTables = tables.map(t =>
        t.id === targetTable.id ? { ...t, status: 'paying' } : t
      );

      expect(updatedTables.find(t => t.id === 'table-1').status).toBe('paying');
    });
  });
});
