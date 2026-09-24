import { describe, it, expect } from 'vitest';

describe('Split Payments & Report Aggregation', () => {
  it('correctly allocates partial amounts and validates balance', () => {
    const finalTotal = 850;
    const splitRows = [
      { method: 'UPI', amount: '500' },
      { method: 'Cash', amount: '350' }
    ];

    const totalAllocated = splitRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const remainingToPay = Math.round((finalTotal - totalAllocated) * 100) / 100;

    expect(totalAllocated).toBe(850);
    expect(remainingToPay).toBe(0);
  });

  it('correctly isolates the cash portion for cash drawer updates', () => {
    const paymentSplits = [
      { method: 'UPI', amount: 500 },
      { method: 'Cash', amount: 350 },
      { method: 'Card', amount: 150 }
    ];

    const cashPortion = paymentSplits
      .filter(p => p.method.toLowerCase() === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);

    expect(cashPortion).toBe(350);
  });

  it('correctly breaks down split payment into respective methods in Daily Sales Report', () => {
    const orders = [
      {
        id: 'ord_1',
        total: 1000,
        paymentMethod: 'Split (UPI: ₹600, Cash: ₹400)',
        paymentSplits: [
          { method: 'UPI', amount: 600 },
          { method: 'Cash', amount: 400 }
        ],
        createdAt: '2026-09-24T12:00:00.000Z'
      },
      {
        id: 'ord_2',
        total: 500,
        paymentMethod: 'Card',
        paymentSplits: null,
        createdAt: '2026-09-24T13:00:00.000Z'
      }
    ];

    const totals = { cash: 0, card: 0, upi: 0 };
    orders.forEach(o => {
      const splits = o.paymentSplits || o.timestamps?.paymentSplits;
      if (Array.isArray(splits) && splits.length > 0) {
        splits.forEach(sp => {
          const pm = (sp.method || '').toLowerCase();
          const amt = parseFloat(sp.amount || 0);
          if (pm.includes('cash')) totals.cash += amt;
          else if (pm.includes('card')) totals.card += amt;
          else totals.upi += amt;
        });
      } else {
        const pm = (o.paymentMethod || 'Cash').toLowerCase();
        if (pm.includes('cash')) totals.cash += o.total;
        else if (pm.includes('card')) totals.card += o.total;
        else totals.upi += o.total;
      }
    });

    expect(totals.cash).toBe(400);
    expect(totals.upi).toBe(600);
    expect(totals.card).toBe(500);
    expect(totals.cash + totals.upi + totals.card).toBe(1500);
  });

  it('correctly filters split payment orders in Sales Accrual Report', () => {
    const order = {
      id: 'ord_split',
      paymentMethod: 'Split (UPI, Cash)',
      paymentSplits: [
        { method: 'UPI', amount: 300 },
        { method: 'Cash', amount: 200 }
      ]
    };

    const matchesCashFilter = (filter, o) => {
      if (filter === 'Split') {
        return (o.paymentMethod || '').toLowerCase().startsWith('split') || (o.paymentSplits?.length > 1);
      }
      if ((o.paymentMethod || 'N/A') === filter) return true;
      const splits = o.paymentSplits;
      if (Array.isArray(splits) && splits.some(s => (s.method || '').toLowerCase() === filter.toLowerCase())) {
        return true;
      }
      return false;
    };

    expect(matchesCashFilter('Cash', order)).toBe(true);
    expect(matchesCashFilter('UPI', order)).toBe(true);
    expect(matchesCashFilter('Card', order)).toBe(false);
    expect(matchesCashFilter('Split', order)).toBe(true);
  });
});
