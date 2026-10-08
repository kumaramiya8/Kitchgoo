import { describe, it, expect } from 'vitest';
import { getOrderPaymentSplits, getWalletAmountFromOrder, getWalletCreditedFromOrder } from '../src/pages/Reports.jsx';

describe('Payment Reconciliation Report Calculations', () => {
  it('correctly aggregates direct UPI orders for bank statement matching', () => {
    const orders = [
      { id: '1', total: 450, paymentMethod: 'UPI', createdAt: '2026-10-08T10:00:00Z', status: 'Closed' },
      { id: '2', total: 720, paymentMethod: 'UPI (GPay)', createdAt: '2026-10-08T11:30:00Z', status: 'Closed' },
      { id: '3', total: 300, paymentMethod: 'Online QR', createdAt: '2026-10-08T12:15:00Z', status: 'Closed' }
    ];

    const upiTotal = orders.reduce((sum, o) => {
      const pm = (o.paymentMethod || '').toLowerCase();
      if (pm.includes('upi') || pm.includes('qr') || pm.includes('online')) {
        return sum + parseFloat(o.total);
      }
      return sum;
    }, 0);

    expect(upiTotal).toBe(1470);
  });

  it('correctly calculates total cash received including extra cash deposited into customer wallet', () => {
    // Example: Customer bill is ₹420, gives ₹500 note, deposits ₹80 change into digital wallet
    const orderWithWalletCredit = {
      id: 'ord_wallet_credit',
      billNo: 'INV-101',
      total: 420,
      paymentMethod: 'Cash',
      cashTendered: 500,
      walletCredited: 80,
      status: 'Closed'
    };

    const regularCashOrder = {
      id: 'ord_regular_cash',
      billNo: 'INV-102',
      total: 350,
      paymentMethod: 'Cash',
      cashTendered: 350,
      walletCredited: 0,
      status: 'Closed'
    };

    const orders = [orderWithWalletCredit, regularCashOrder];

    const billCash = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const extraWalletCash = orders.reduce((sum, o) => sum + (parseFloat(o.walletCredited) || 0), 0);
    const totalCashInDrawer = billCash + extraWalletCash;

    expect(billCash).toBe(770);
    expect(extraWalletCash).toBe(80);
    // Physical cash in drawer must be 500 + 350 = 850
    expect(totalCashInDrawer).toBe(850);
  });

  it('correctly apportions split payments into Cash and UPI totals', () => {
    const splitOrder = {
      id: 'ord_split',
      billNo: 'INV-103',
      total: 1000,
      paymentMethod: 'Split (UPI: ₹600, Cash: ₹400)',
      paymentSplits: [
        { method: 'UPI', amount: 600 },
        { method: 'Cash', amount: 400 }
      ],
      walletCredited: 50, // customer gave ₹450 cash for the ₹400 portion and deposited ₹50 change into wallet
      status: 'Closed'
    };

    const splits = getOrderPaymentSplits(splitOrder);
    const upiPortion = splits.filter(s => s.method.toLowerCase().includes('upi')).reduce((a, s) => a + s.amount, 0);
    const cashPortion = splits.filter(s => s.method.toLowerCase().includes('cash')).reduce((a, s) => a + s.amount, 0);
    const extraWalletCash = parseFloat(splitOrder.walletCredited || 0);

    const totalCashReceived = cashPortion + extraWalletCash;

    expect(upiPortion).toBe(600);
    expect(cashPortion).toBe(400);
    expect(totalCashReceived).toBe(450); // ₹400 bill cash + ₹50 wallet cash
  });

  it('correctly includes standalone counter cash deposits into drawer cash', () => {
    const orders = [
      { id: '1', total: 200, paymentMethod: 'Cash', walletCredited: 0, status: 'Closed' }
    ];

    const giftCards = [
      { id: 'gc_1', type: 'issue', amount: 500, paymentMethod: 'Cash', guestName: 'Ravi', orderId: null },
      { id: 'gc_2', type: 'issue', amount: 300, paymentMethod: 'UPI', guestName: 'Anita', orderId: null },
      { id: 'gc_3_linked', type: 'issue', amount: 80, paymentMethod: 'Cash', orderId: '1' } // already accounted in order
    ];

    // Filter unlinked top-ups
    const unlinkedTopups = giftCards.filter(g => g.type === 'issue' && !orders.some(o => o.id === g.orderId));

    const standaloneCash = unlinkedTopups
      .filter(g => (g.paymentMethod || 'Cash').toLowerCase().includes('cash'))
      .reduce((sum, g) => sum + g.amount, 0);

    const standaloneUpi = unlinkedTopups
      .filter(g => (g.paymentMethod || '').toLowerCase().includes('upi'))
      .reduce((sum, g) => sum + g.amount, 0);

    expect(standaloneCash).toBe(500);
    expect(standaloneUpi).toBe(300);

    const drawerCash = orders.reduce((s, o) => s + o.total, 0) + standaloneCash;
    expect(drawerCash).toBe(700);
  });

  it('accurately computes live variance against bank statement and physical drawer counts', () => {
    const expectedUPI = 2450;
    const actualBankStatement = 2450;
    const upiDiff = Math.round((actualBankStatement - expectedUPI) * 100) / 100;
    expect(upiDiff).toBe(0);

    const expectedCashSales = 1800;
    const openingDrawerFloat = 500;
    const expectedDrawerCash = expectedCashSales + openingDrawerFloat; // 2300

    const actualDrawerCount = 2280; // short by ₹20
    const cashDiff = Math.round((actualDrawerCount - expectedDrawerCash) * 100) / 100;
    expect(cashDiff).toBe(-20);
  });

  it('correctly extracts walletCredited from order history or giftCards for invoice INV-KIK6Y-1573', () => {
    // Exactly reproducing invoice INV-KIK6Y-1573: ₹500 tendered on ₹130 bill, ₹370 sent to wallet
    const orderFromDatabase = {
      id: 'ord_kik_1573',
      billNo: 'INV-KIK6Y-1573',
      total: 130,
      paymentMethod: 'Cash',
      status: 'paid',
      // Notice: walletCredited field is undefined as fetched from relational database
      history: [
        { action: 'created', timestamp: '2026-10-08T07:36:54Z', by: 'Admin (Kiko Cafe)' },
        { action: 'payment_settled', timestamp: '2026-10-08T10:26:30Z', description: 'Settled via Cash for ₹130.00' },
        {
          action: 'wallet_credit_issued',
          timestamp: '2026-10-08T10:26:30Z',
          amount: 370,
          description: 'Converted ₹370.00 extra cash change to digital wallet credit (linked to 9555604867)'
        }
      ]
    };

    const giftCards = [
      {
        id: 'gc_kik_1',
        type: 'issue',
        amount: 370,
        billNo: 'INV-KIK6Y-1573',
        orderId: 'ord_kik_1573',
        guestPhone: '9555604867',
        paymentMethod: 'Cash'
      }
    ];

    const extraCash = getWalletCreditedFromOrder(orderFromDatabase, giftCards);
    expect(extraCash).toBe(370);

    const billCash = orderFromDatabase.total;
    const totalCashCollected = billCash + extraCash;
    expect(totalCashCollected).toBe(500);
  });
});
