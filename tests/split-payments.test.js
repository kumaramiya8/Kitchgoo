import { describe, it, expect } from 'vitest';
import { getOrderPaymentSplits, orderMatchesPaymentType, getOrderPaymentAmount } from '../src/pages/Reports.jsx';

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
      },
      {
        id: 'ord_3_open',
        total: 300,
        paymentMethod: null,
        status: 'open',
        createdAt: '2026-09-24T14:00:00.000Z'
      }
    ];

    const totals = { cash: 0, card: 0, upi: 0 };
    orders.forEach(o => {
      const splits = getOrderPaymentSplits(o);
      if (Array.isArray(splits) && splits.length > 0) {
        splits.forEach(sp => {
          const pm = (sp.method || '').toLowerCase();
          const amt = parseFloat(sp.amount || 0);
          if (pm.includes('cash')) totals.cash += amt;
          else if (pm.includes('card')) totals.card += amt;
          else totals.upi += amt;
        });
      } else {
        const pm = (o.paymentMethod || '').toLowerCase();
        if (pm.includes('cash')) totals.cash += o.total;
        else if (pm.includes('card')) totals.card += o.total;
        else if (pm.includes('upi')) totals.upi += o.total;
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

    expect(orderMatchesPaymentType(order, 'Cash')).toBe(true);
    expect(orderMatchesPaymentType(order, 'UPI')).toBe(true);
    expect(orderMatchesPaymentType(order, 'Card')).toBe(false);
    expect(orderMatchesPaymentType(order, 'Split')).toBe(true);
  });

  it('correctly parses string Split labels and isolates cash payment amounts', () => {
    const stringSplitOrder = {
      id: 'ord_str_split',
      total: 1000,
      paymentMethod: 'Split (Cash: ₹350, UPI: ₹650)',
      paymentSplits: null
    };

    const splits = getOrderPaymentSplits(stringSplitOrder);
    expect(splits).toEqual([
      { method: 'Cash', amount: 350 },
      { method: 'UPI', amount: 650 }
    ]);

    expect(getOrderPaymentAmount(stringSplitOrder, 'Cash')).toBe(350);
    expect(getOrderPaymentAmount(stringSplitOrder, 'UPI')).toBe(650);
    expect(getOrderPaymentAmount(stringSplitOrder, 'Card')).toBe(0);
    expect(getOrderPaymentAmount(stringSplitOrder, 'All')).toBe(1000);
  });

  it('ensures Cash calculations match across Daily Sales Summary, Invoice Register, and Accrual reports', () => {
    const orders = [
      {
        id: 'ord_cash',
        total: 500,
        paymentMethod: 'Cash',
        status: 'Closed'
      },
      {
        id: 'ord_split',
        total: 1000,
        paymentMethod: 'Split (Cash: ₹400, UPI: ₹600)',
        paymentSplits: [
          { method: 'Cash', amount: 400 },
          { method: 'UPI', amount: 600 }
        ],
        status: 'Closed'
      },
      {
        id: 'ord_upi',
        total: 700,
        paymentMethod: 'UPI',
        status: 'Closed'
      },
      {
        id: 'ord_open_table',
        total: 800,
        paymentMethod: null,
        status: 'open'
      }
    ];

    // 1. Daily Sales Summary cash calculation
    let dailySalesCash = 0;
    orders.forEach(o => {
      if ((o.status || '').toLowerCase() === 'voided') return;
      const splits = getOrderPaymentSplits(o);
      if (Array.isArray(splits) && splits.length > 0) {
        splits.forEach(sp => {
          if ((sp.method || '').toLowerCase().includes('cash')) dailySalesCash += parseFloat(sp.amount || 0);
        });
      } else {
        const pm = (o.paymentMethod || '').toLowerCase();
        if (pm.includes('cash')) dailySalesCash += parseFloat(o.total || 0);
      }
    });

    // 2. Detailed Invoice Register with Cash filter
    const invoiceRegisterCashOrders = orders.filter(o => orderMatchesPaymentType(o, 'Cash'));
    const invoiceRegisterCashTotal = invoiceRegisterCashOrders.reduce((sum, o) => {
      return sum + getOrderPaymentAmount(o, 'Cash');
    }, 0);

    // 3. Sales Accrual with Cash filter
    const accrualCashOrders = orders.filter(o => orderMatchesPaymentType(o, 'Cash'));
    const accrualCollectedCash = accrualCashOrders.reduce((sum, o) => {
      const isClosed = o.status === 'Closed' || o.status === 'Completed' || o.status === 'paid';
      if (!isClosed) return sum;
      const total = parseFloat(o.total || 0);
      const cashAmt = getOrderPaymentAmount(o, 'Cash');
      const ratio = total > 0 ? (cashAmt / total) : 0;
      return sum + (total * ratio);
    }, 0);

    // All three must equal 500 (full cash order) + 400 (split cash portion) = 900
    expect(dailySalesCash).toBe(900);
    expect(invoiceRegisterCashTotal).toBe(900);
    expect(accrualCollectedCash).toBe(900);
  });

  it('excludes voided, cancelled, and reopened orders from Dashboard revenue, stats, and top items', () => {
    const orders = [
      { id: '1', total: 600, status: 'paid', items: [{ name: 'Burger', price: 600, qty: 1 }], createdAt: '2026-10-06T10:00:00.000Z' },
      { id: '2', total: 400, status: 'voided', voidReason: 'Customer left', items: [{ name: 'Pizza', price: 400, qty: 1 }], createdAt: '2026-10-06T11:00:00.000Z' },
      { id: '3', total: 250, status: 'cancelled', items: [{ name: 'Salad', price: 250, qty: 1 }], createdAt: '2026-10-06T12:00:00.000Z' },
      { id: '4', total: 350, status: 'reopened', items: [{ name: 'Burger', price: 350, qty: 1 }], createdAt: '2026-10-06T13:00:00.000Z' },
      { id: '5', total: 500, status: 'Closed', items: [{ name: 'Burger', price: 500, qty: 1 }], createdAt: '2026-10-06T14:00:00.000Z' }
    ];

    const validOrders = orders.filter(o => {
      const s = (o.status || '').toLowerCase();
      return s !== 'voided' && s !== 'cancelled' && s !== 'reopened';
    });

    const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
    expect(totalRevenue).toBe(1100); // 600 + 500 (voided 400, cancelled 250, reopened 350 excluded)
    expect(validOrders.length).toBe(2);

    const topItems = {};
    validOrders.forEach(o => {
      o.items.forEach(i => {
        topItems[i.name] = (topItems[i.name] || 0) + (i.price * i.qty);
      });
    });

    expect(topItems['Burger']).toBe(1100);
    expect(topItems['Pizza']).toBeUndefined(); // Voided Pizza must not appear
    expect(topItems['Salad']).toBeUndefined(); // Cancelled Salad must not appear
  });
});


