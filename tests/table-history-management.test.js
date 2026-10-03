import { describe, it, expect } from 'vitest';
import { getTableOrders } from '../src/pages/POS';

describe('Past Table Management & Order History', () => {
  const sampleOrders = [
    {
      id: 'ord-101',
      orderNumber: 101,
      tableId: 't-1',
      tableName: 'Table 1',
      total: 450,
      paymentMethod: 'Cash',
      status: 'paid',
      createdAt: '2026-10-03T09:00:00.000Z',
      items: [{ id: 'i1', name: 'Paneer Butter Masala', price: 300, qty: 1 }],
    },
    {
      id: 'ord-102',
      orderNumber: 102,
      tableId: '1',
      tableName: 'Table 1',
      total: 620,
      paymentMethod: 'UPI',
      status: 'paid',
      createdAt: '2026-10-03T10:15:00.000Z',
      items: [{ id: 'i2', name: 'Chicken Biryani', price: 310, qty: 2 }],
    },
    {
      id: 'ord-103',
      orderNumber: 103,
      tableId: 't-2',
      tableName: 'Table 2',
      total: 1200,
      paymentMethod: 'Card',
      status: 'paid',
      createdAt: '2026-10-03T08:30:00.000Z',
      items: [{ id: 'i3', name: 'Tandoori Platter', price: 1200, qty: 1 }],
    },
    {
      id: 'ord-104',
      orderNumber: 104,
      tokenNumber: '105',
      total: 250,
      paymentMethod: 'Cash',
      status: 'paid',
      createdAt: '2026-10-03T11:00:00.000Z',
      items: [{ id: 'i4', name: 'Cold Coffee', price: 125, qty: 2 }],
    },
    {
      id: 'ord-105',
      orderNumber: 105,
      tableId: 't-1',
      tableName: 'Table 1',
      total: 350,
      paymentMethod: 'Cash',
      status: 'voided',
      voidReason: 'Billing Error',
      createdAt: '2026-10-02T18:00:00.000Z',
      items: [{ id: 'i5', name: 'Pasta', price: 350, qty: 1 }],
    },
  ];

  describe('getTableOrders resolution', () => {
    it('returns all valid orders when table is null, undefined, or { id: "all" }', () => {
      const all1 = getTableOrders(sampleOrders, null);
      expect(all1.length).toBe(5);

      const all2 = getTableOrders(sampleOrders, { id: 'all' });
      expect(all2.length).toBe(5);

      // Orders are sorted newest first
      expect(all2[0].id).toBe('ord-104');
      expect(all2[all2.length - 1].id).toBe('ord-105');
    });

    it('matches orders by table.id string', () => {
      const orders = getTableOrders(sampleOrders, { id: 't-2', number: '2' });
      expect(orders.length).toBe(1);
      expect(orders[0].id).toBe('ord-103');
    });

    it('matches orders by table.number when stored as integer or string', () => {
      // Table 1 matches ord-101 (t-1), ord-102 (tableId: '1'), and ord-105 (t-1)
      const orders = getTableOrders(sampleOrders, { id: 't-1', number: 1 });
      expect(orders.length).toBe(3);
      const ids = orders.map(o => o.id);
      expect(ids).toContain('ord-101');
      expect(ids).toContain('ord-102');
      expect(ids).toContain('ord-105');
    });

    it('matches token tabs by tokenNumber', () => {
      const orders = getTableOrders(sampleOrders, { tokenNumber: '105' });
      expect(orders.length).toBe(1);
      expect(orders[0].id).toBe('ord-104');
      expect(orders[0].total).toBe(250);
    });

    it('returns empty array when table has no matching past orders', () => {
      const orders = getTableOrders(sampleOrders, { id: 't-99', number: 99 });
      expect(orders).toEqual([]);
    });
  });

  describe('Payment Tender Changes & Cash Reversals', () => {
    it('calculates drawer delta correctly when switching from Cash to UPI/Card', () => {
      const order = { total: 500, paymentMethod: 'Cash', paymentSplits: [] };
      const newMethod = 'UPI';

      const oldCash = order.paymentMethod === 'Cash' ? order.total : 0;
      const newCash = newMethod === 'Cash' ? order.total : 0;
      const deltaCash = newCash - oldCash;

      expect(deltaCash).toBe(-500); // 500 should be deducted from drawer
    });

    it('calculates drawer delta correctly when switching from Card to Cash', () => {
      const order = { total: 400, paymentMethod: 'Card' };
      const newMethod = 'Cash';

      const oldCash = order.paymentMethod === 'Cash' ? order.total : 0;
      const newCash = newMethod === 'Cash' ? order.total : 0;
      const deltaCash = newCash - oldCash;

      expect(deltaCash).toBe(400); // 400 should be added to drawer
    });

    it('calculates drawer delta correctly for split payments', () => {
      const order = {
        total: 1000,
        paymentMethod: 'Split',
        paymentSplits: [{ method: 'Cash', amount: 500 }, { method: 'UPI', amount: 500 }],
      };
      // User changes split to ₹200 Cash and ₹800 UPI
      const newSplits = [{ method: 'Cash', amount: 200 }, { method: 'UPI', amount: 800 }];

      const oldCash = order.paymentSplits.find(p => p.method === 'Cash')?.amount || 0;
      const newCash = newSplits.find(p => p.method === 'Cash')?.amount || 0;
      const deltaCash = newCash - oldCash;

      expect(deltaCash).toBe(-300); // Drawer should decrease by 300
    });
  });

  describe('Void Order Financial Reversals', () => {
    it('reverses cash if order was paid in cash', () => {
      const cashOrder = { total: 350, paymentMethod: 'Cash' };
      const cashToReverse = (cashOrder.paymentMethod || '').toLowerCase() === 'cash' ? cashOrder.total : 0;
      expect(cashToReverse).toBe(350);
    });

    it('does not reverse cash if order was paid with digital tender', () => {
      const upiOrder = { total: 800, paymentMethod: 'UPI' };
      const cashToReverse = (upiOrder.paymentMethod || '').toLowerCase() === 'cash' ? upiOrder.total : 0;
      expect(cashToReverse).toBe(0);
    });
  });

  describe('Edit Past Order Recalculations', () => {
    it('recalculates subtotal, GST (inclusive), and total when items change', () => {
      // 2 items: ₹210 and ₹315 with 5% inclusive GST
      const items = [
        { id: '1', name: 'Item 1', price: 210, qty: 1 },
        { id: '2', name: 'Item 2', price: 315, qty: 1 },
      ];
      const itemsTotal = items.reduce((s, i) => s + i.price * i.qty, 0); // 525
      const gstRate = 5;
      const tax = itemsTotal - (itemsTotal / (1 + gstRate / 100)); // 25
      const subtotal = itemsTotal - tax; // 500
      const total = subtotal + tax; // 525

      expect(itemsTotal).toBe(525);
      expect(tax).toBeCloseTo(25, 2);
      expect(subtotal).toBeCloseTo(500, 2);
      expect(total).toBeCloseTo(525, 2);
    });

    it('calculates delta and action (charge vs refund) on price change', () => {
      const originalTotal = 500;
      const revisedTotal = 650;
      const delta = revisedTotal - originalTotal;
      const deltaAction = delta > 0.01 ? 'charge' : delta < -0.01 ? 'refund' : 'none';

      expect(delta).toBe(150);
      expect(deltaAction).toBe('charge');

      const refundRevisedTotal = 400;
      const refundDelta = refundRevisedTotal - originalTotal;
      const refundAction = refundDelta > 0.01 ? 'charge' : refundDelta < -0.01 ? 'refund' : 'none';
      expect(refundDelta).toBe(-100);
      expect(refundAction).toBe('refund');
    });

    it('applies discount correctly to revised total', () => {
      const subtotal = 500;
      const tax = 25;
      const discount = 50;
      const revisedTotal = Math.max(0, subtotal + tax - discount);

      expect(revisedTotal).toBe(475);
    });
  });

  describe('Re-Opening Past Orders to Table or Floating Tab', () => {
    it('formats items with _cartKey, qty, and courses for cart compatibility', () => {
      const rawItems = [
        { id: 'm1', name: 'Biryani', price: 250, quantity: 2 },
      ];

      const formatted = rawItems.map(item => ({
        ...item,
        id: item.id || 'gen_id',
        _cartKey: `${item.id}_`,
        qty: item.qty || item.quantity || 1,
        modifiers: item.modifiers || [],
        specialInstructions: item.specialInstructions || '',
        course: item.course || 1,
        seat: item.seat || 1,
      }));

      expect(formatted[0].qty).toBe(2);
      expect(formatted[0]._cartKey).toBe('m1_');
      expect(formatted[0].course).toBe(1);
    });

    it('detects when table is occupied vs available for safe re-opening', () => {
      const availableTable = { id: 't-1', number: 1, status: 'available' };
      const occupiedTable = { id: 't-2', number: 2, status: 'ordered', guestName: 'Alice' };

      const isTableAvailable = (t, savedOrders) => {
        return (t.status === 'available' || t.status === 'needs-bussing') && (!savedOrders[t.id] || savedOrders[t.id].length === 0);
      };

      expect(isTableAvailable(availableTable, {})).toBe(true);
      expect(isTableAvailable(occupiedTable, { 't-2': [{ id: '1' }] })).toBe(false);
    });
  });
});
