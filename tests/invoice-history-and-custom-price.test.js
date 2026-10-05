import { describe, it, expect } from 'vitest';
import { getInvoiceHistoryRecords } from '../src/components/InvoiceHistoryModal';
import { createOrder } from '../src/db/database';
import { orderMatchesPaymentType, getOrderPaymentAmount } from '../src/pages/Reports';

describe('Invoice Audit History & Custom Price Features', () => {
  describe('getInvoiceHistoryRecords() timeline synthesis', () => {
    it('synthesizes created and payment_settled timeline events for basic orders', () => {
      const order = {
        id: 'ord-12345678',
        billNo: 'INV-1001',
        createdAt: '2026-10-06T10:00:00.000Z',
        serverName: 'John Doe',
        tableId: '4',
        paymentMethod: 'UPI',
        total: 550,
        items: [
          { name: 'Paneer Butter Masala', price: 300, qty: 1 },
          { name: 'Butter Naan', price: 50, qty: 5 },
        ],
      };

      const history = getInvoiceHistoryRecords(order);
      expect(history.length).toBeGreaterThanOrEqual(2);

      const created = history.find(h => h.action === 'created');
      expect(created).toBeDefined();
      expect(created.staffName).toBe('John Doe');
      expect(created.description).toContain('6 items');
      expect(created.description).toContain('Table 4');

      const settled = history.find(h => h.action === 'payment_settled');
      expect(settled).toBeDefined();
      expect(settled.description).toContain('Settled via UPI');
      expect(settled.description).toContain('₹550');
    });

    it('synthesizes custom price overrides on items', () => {
      const order = {
        id: 'ord-2',
        billNo: 'INV-1002',
        serverName: 'Alice',
        total: 400,
        items: [
          {
            name: 'Special Biryani',
            price: 200,
            originalPrice: 250,
            customPrice: true,
            customPriceReason: 'Manager Discount Deal',
            customPriceAt: '2026-10-06T10:15:00.000Z',
            customPriceBy: 'Manager Bob',
            qty: 2,
          }
        ],
      };

      const history = getInvoiceHistoryRecords(order);
      const customPriceEntry = history.find(h => h.action === 'custom_amount');
      expect(customPriceEntry).toBeDefined();
      expect(customPriceEntry.staffName).toBe('Manager Bob');
      expect(customPriceEntry.description).toContain('Price override on "Special Biryani"');
      expect(customPriceEntry.description).toContain('₹250 → ₹200');
    });

    it('synthesizes table shift history with timestamps and staff', () => {
      const order = {
        id: 'ord-3',
        serverName: 'Charlie',
        tableId: '12',
        tableShiftHistory: [
          {
            fromTable: '5',
            toTable: '12',
            itemsCount: 3,
            timestamp: '2026-10-06T11:00:00.000Z',
            by: 'Captain Dave',
          }
        ],
        items: [{ name: 'Tea', price: 40, qty: 3 }],
      };

      const history = getInvoiceHistoryRecords(order);
      const shiftEntry = history.find(h => h.action === 'table_shifted');
      expect(shiftEntry).toBeDefined();
      expect(shiftEntry.staffName).toBe('Captain Dave');
      expect(shiftEntry.description).toContain('Shifted from Table 5 to Table 12');
    });

    it('synthesizes split payment records with full breakdown', () => {
      const order = {
        id: 'ord-4',
        paymentMethod: 'Split',
        total: 1000,
        paymentSplits: [
          { method: 'Cash', amount: 400 },
          { method: 'UPI', amount: 600 },
        ],
        serverName: 'Alice',
      };

      const history = getInvoiceHistoryRecords(order);
      const settled = history.find(h => h.action === 'payment_settled');
      expect(settled).toBeDefined();
      expect(settled.description).toContain('Settled via Split: Cash: ₹400, UPI: ₹600');
    });

    it('synthesizes voided order entries with reason and staff name', () => {
      const order = {
        id: 'ord-5',
        status: 'voided',
        total: 750,
        voidReason: 'Customer walked out before food served',
        voidedAt: '2026-10-06T12:00:00.000Z',
        voidedBy: 'Manager Steve',
        serverName: 'Alice',
      };

      const history = getInvoiceHistoryRecords(order);
      const voidEntry = history.find(h => h.action === 'voided');
      expect(voidEntry).toBeDefined();
      expect(voidEntry.staffName).toBe('Manager Steve');
      expect(voidEntry.description).toContain('Customer walked out before food served');
      expect(voidEntry.description).toContain('₹750');
    });

    it('prioritizes explicit history records stored on order', () => {
      const order = {
        id: 'ord-6',
        history: [
          {
            action: 'created',
            timestamp: '2026-10-06T09:00:00.000Z',
            by: 'Server Jane',
            description: 'Order created with 3 items',
          },
          {
            action: 'custom_amount',
            timestamp: '2026-10-06T09:05:00.000Z',
            by: 'Manager Tom',
            description: 'Price override on "Cold Coffee": ₹120 → ₹100',
          },
          {
            action: 'discount_applied',
            timestamp: '2026-10-06T09:10:00.000Z',
            by: 'Manager Tom',
            description: 'Discount applied: ₹50 (Loyalty Promo)',
          },
          {
            action: 'payment_method_changed',
            timestamp: '2026-10-06T09:30:00.000Z',
            by: 'Cashier Emma',
            description: 'Payment method updated from Cash to UPI',
          },
        ]
      };

      const records = getInvoiceHistoryRecords(order);
      expect(records.length).toBe(4);
      expect(records[1].action).toBe('custom_amount');
      expect(records[1].staffName).toBe('Manager Tom');
      expect(records[2].action).toBe('discount_applied');
      expect(records[3].action).toBe('payment_method_changed');
      expect(records[3].staffName).toBe('Cashier Emma');
    });
  });

  describe('createOrder() persistence of audit and custom fields', () => {
    it('preserves status, void, discount, history, and customPrice metadata', async () => {
      const items = [
        {
          id: 'item-1',
          name: 'Butter Chicken',
          price: 350,
          originalPrice: 400,
          customPrice: true,
          customPriceBy: 'Manager Bob',
          customPriceReason: 'VIP Guest',
          qty: 1,
        }
      ];

      const extra = {
        status: 'voided',
        voidReason: 'Accidental punch',
        voidedAt: '2026-10-06T12:00:00.000Z',
        voidedBy: 'Manager Bob',
        discount: 50,
        discountReason: 'Welcome discount',
        discountAppliedAt: '2026-10-06T11:55:00.000Z',
        discountAppliedBy: 'Manager Bob',
        history: [
          { action: 'created', by: 'Staff', description: 'Created' },
          { action: 'voided', by: 'Manager Bob', description: 'Voided bill' }
        ]
      };

      const order = await createOrder('table-1', items, 'Cash', {
        ...extra,
        orderType: 'dine-in',
        serverName: 'Staff Alice',
      });

      expect(order.status).toBe('voided');
      expect(order.voidReason).toBe('Accidental punch');
      expect(order.voidedBy).toBe('Manager Bob');
      expect(order.discountReason).toBe('Welcome discount');
      expect(order.history).toHaveLength(2);
      expect(order.items[0].customPrice).toBe(true);
      expect(order.items[0].originalPrice).toBe(400);
      expect(order.items[0].customPriceBy).toBe('Manager Bob');
    });
  });

  describe('Reports status filtering & void totals exclusion/inclusion', () => {
    const sampleOrders = [
      { id: '1', status: 'Closed', total: 500, paymentMethod: 'UPI' },
      { id: '2', status: 'paid', total: 300, paymentMethod: 'Cash' },
      { id: '3', status: 'voided', total: 400, paymentMethod: 'UPI', voidReason: 'Cancelled' },
      { id: '4', status: 'Voided', total: 200, paymentMethod: 'Cash', voidReason: 'Table left' },
      { id: '5', status: 'Cancelled', total: 150, paymentMethod: 'Card', voidReason: 'Wrong order' },
    ];

    it('matches payment methods correctly for direct and split transactions', () => {
      const directUpi = { paymentMethod: 'UPI', total: 500 };
      const splitUpi = {
        paymentMethod: 'Split',
        total: 1000,
        paymentSplits: [{ method: 'UPI', amount: 600 }, { method: 'Cash', amount: 400 }]
      };

      expect(orderMatchesPaymentType(directUpi, 'UPI')).toBe(true);
      expect(orderMatchesPaymentType(directUpi, 'Cash')).toBe(false);

      expect(orderMatchesPaymentType(splitUpi, 'UPI')).toBe(true);
      expect(orderMatchesPaymentType(splitUpi, 'Cash')).toBe(true);
      expect(orderMatchesPaymentType(splitUpi, 'Card')).toBe(false);

      expect(getOrderPaymentAmount(splitUpi, 'UPI')).toBe(600);
      expect(getOrderPaymentAmount(splitUpi, 'Cash')).toBe(400);
      expect(getOrderPaymentAmount(directUpi, 'UPI')).toBe(500);
    });

    it('case-insensitively filters voided vs closed orders', () => {
      const closedOrders = sampleOrders.filter(o => {
        const s = (o.status || 'paid').toLowerCase();
        return s === 'closed' || s === 'completed' || s === 'paid';
      });
      expect(closedOrders.length).toBe(2);

      const voidedOrders = sampleOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'voided' || s === 'cancelled';
      });
      expect(voidedOrders.length).toBe(3);
    });

    it('excludes voided orders from regular totals but calculates accurately when Voided filter is selected', () => {
      // Regular view (All or Closed): excludes voided
      const regularValid = sampleOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s !== 'voided' && s !== 'cancelled';
      });
      const regularTotal = regularValid.reduce((sum, o) => sum + o.total, 0);
      expect(regularTotal).toBe(800); // 500 + 300

      // Explicit Voided view: totals the voided orders
      const voidedValid = sampleOrders.filter(o => {
        const s = (o.status || '').toLowerCase();
        return s === 'voided' || s === 'cancelled';
      });
      const voidedTotal = voidedValid.reduce((sum, o) => sum + o.total, 0);
      expect(voidedTotal).toBe(750); // 400 + 200 + 150
      expect(voidedValid.length).toBe(3);
    });
  });
});
