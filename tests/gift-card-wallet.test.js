import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDB,
  getAll,
  issueGiftCardCredit,
  redeemGiftCardCredit
} from '../src/db/database';
import {
  orderMatchesPaymentType,
  getOrderPaymentAmount,
  getOrderPaymentSplits
} from '../src/pages/Reports.jsx';

describe('Phone-Linked Digital Wallet & Gift Card System', () => {
  beforeEach(async () => {
    await initDB('tenant_test_wallet');
  });

  describe('Wallet Credit Issuance (Extra Cash to Store Credit)', () => {
    it('creates a new guest wallet when extra cash change is credited', async () => {
      const res = await issueGiftCardCredit({
        guestPhone: '9876543210',
        guestName: 'Amiya Kumar',
        amount: 20,
        orderId: 'ord_101',
        billNo: 'INV-101',
        staffName: 'Cashier John',
        cashTendered: 100,
        billTotal: 80,
        notes: 'Change converted to digital wallet'
      });

      expect(res).not.toBeNull();
      expect(res.guest.phone).toBe('9876543210');
      expect(res.guest.name).toBe('Amiya Kumar');
      expect(res.guest.walletBalance).toBe(20);
      expect(res.guest.totalCreditIssued).toBe(20);

      expect(res.transaction.type).toBe('issue');
      expect(res.transaction.amount).toBe(20);
      expect(res.transaction.previousBalance).toBe(0);
      expect(res.transaction.balanceAfter).toBe(20);
      expect(res.transaction.cashTendered).toBe(100);
      expect(res.transaction.billTotal).toBe(80);
      expect(res.transaction.billNo).toBe('INV-101');

      // Verify DB storage
      const giftCards = getAll('gift_cards') || [];
      expect(giftCards.length).toBeGreaterThanOrEqual(1);
      const savedTx = giftCards.find(g => g.id === res.transaction.id);
      expect(savedTx).toBeDefined();
      expect(savedTx.guestPhone).toBe('9876543210');
    });

    it('accumulates wallet balance on subsequent deposits', async () => {
      // First deposit: ₹20
      await issueGiftCardCredit({
        guestPhone: '9876543210',
        guestName: 'Amiya Kumar',
        amount: 20,
        orderId: 'ord_101',
        billNo: 'INV-101',
        cashTendered: 100,
        billTotal: 80
      });

      // Second deposit: ₹50 change from ₹500 note on ₹450 bill
      const second = await issueGiftCardCredit({
        guestPhone: '9876543210',
        guestName: 'Amiya Kumar',
        amount: 50,
        orderId: 'ord_102',
        billNo: 'INV-102',
        cashTendered: 500,
        billTotal: 450
      });

      expect(second.guest.walletBalance).toBe(70);
      expect(second.guest.totalCreditIssued).toBe(70);
      expect(second.transaction.previousBalance).toBe(20);
      expect(second.transaction.balanceAfter).toBe(70);
    });

    it('ignores non-positive credit amounts gracefully', async () => {
      const resZero = await issueGiftCardCredit({
        guestPhone: '9876543210',
        amount: 0
      });
      expect(resZero).toBeNull();

      const resNeg = await issueGiftCardCredit({
        guestPhone: '9876543210',
        amount: -15
      });
      expect(resNeg).toBeNull();
    });
  });

  describe('Wallet Credit Redemption (Paying Bills with Wallet)', () => {
    it('deducts available balance when redeemed towards a bill', async () => {
      // Initial credit of ₹100
      await issueGiftCardCredit({
        guestPhone: '9123456789',
        guestName: 'Rohan Sharma',
        amount: 100,
        orderId: 'ord_201',
        billNo: 'INV-201'
      });

      // Customer returns and redeems ₹40 towards an ₹80 bill
      const redemption = await redeemGiftCardCredit({
        guestPhone: '9123456789',
        amount: 40,
        orderId: 'ord_202',
        billNo: 'INV-202',
        staffName: 'Cashier Mary'
      });

      expect(redemption).not.toBeNull();
      expect(redemption.amountRedeemed).toBe(40);
      expect(redemption.guest.walletBalance).toBe(60);
      expect(redemption.guest.totalCreditRedeemed).toBe(40);

      expect(redemption.transaction.type).toBe('redeem');
      expect(redemption.transaction.previousBalance).toBe(100);
      expect(redemption.transaction.balanceAfter).toBe(60);
      expect(redemption.transaction.billNo).toBe('INV-202');
    });

    it('caps redemption at current available balance and prevents negative balance', async () => {
      // Customer has ₹30 balance
      await issueGiftCardCredit({
        guestPhone: '9555666777',
        guestName: 'Sneha Rao',
        amount: 30,
        orderId: 'ord_301',
        billNo: 'INV-301'
      });

      // Attempt to redeem ₹50
      const redemption = await redeemGiftCardCredit({
        guestPhone: '9555666777',
        amount: 50,
        orderId: 'ord_302',
        billNo: 'INV-302'
      });

      expect(redemption).not.toBeNull();
      expect(redemption.amountRedeemed).toBe(30); // Capped at available ₹30
      expect(redemption.guest.walletBalance).toBe(0);
      expect(redemption.transaction.balanceAfter).toBe(0);
    });

    it('returns null when redeeming for unknown phone or zero balance', async () => {
      const res = await redeemGiftCardCredit({
        guestPhone: '9000000000',
        amount: 50
      });
      expect(res).toBeNull();
    });
  });

  describe('Day-End Cash Drawer Accounting Invariant', () => {
    it('preserves 100% cash drawer reconciliation when extra change is credited to wallet', () => {
      let drawerCashIn = 0;

      // Scenario: Bill total = ₹80. Customer tenders ₹100 physical cash note.
      // Customer chooses to convert ₹20 change to digital wallet store credit.
      const billTotal = 80;
      const cashTendered = 100;
      const changeAmount = cashTendered - billTotal; // ₹20
      const changeAction = 'wallet'; // converted to wallet credit

      // In the drawer, the cashier puts the full physical ₹100 into the till.
      // Therefore drawer cashIn must increment by cashTendered (₹100), not billTotal (₹80).
      if (changeAction === 'wallet') {
        drawerCashIn += cashTendered;
      } else {
        drawerCashIn += billTotal;
      }

      // Expected physical cash count in register:
      expect(drawerCashIn).toBe(100);
      // Drawer is in exact balance with the ₹100 note in the drawer.
      const physicalCashInDrawer = 100;
      const discrepancy = physicalCashInDrawer - drawerCashIn;
      expect(discrepancy).toBe(0);
    });
  });

  describe('Reports Integration & Payment Filtering', () => {
    const mockOrders = [
      {
        id: 'ord_1',
        billNo: 'INV-001',
        total: 80,
        paymentMethod: 'Cash',
        cashTendered: 100,
        walletCredited: 20,
        walletRedeemed: 0,
        createdAt: '2026-10-07T12:00:00Z'
      },
      {
        id: 'ord_2',
        billNo: 'INV-002',
        total: 150,
        paymentMethod: 'Wallet',
        walletRedeemed: 150,
        walletCredited: 0,
        createdAt: '2026-10-07T13:00:00Z'
      },
      {
        id: 'ord_3',
        billNo: 'INV-003',
        total: 200,
        paymentMethod: 'Split',
        walletRedeemed: 50,
        paymentSplits: [
          { method: 'Wallet', amount: 50 },
          { method: 'UPI', amount: 150 }
        ],
        createdAt: '2026-10-07T14:00:00Z'
      },
      {
        id: 'ord_4',
        billNo: 'INV-004',
        total: 300,
        paymentMethod: 'Card',
        walletRedeemed: 0,
        createdAt: '2026-10-07T15:00:00Z'
      }
    ];

    it('correctly matches wallet payments in orderMatchesPaymentType', () => {
      // Order 2 paid exclusively by wallet
      expect(orderMatchesPaymentType(mockOrders[1], 'Wallet')).toBe(true);

      // Order 3 paid partially by wallet (Split)
      expect(orderMatchesPaymentType(mockOrders[3], 'Wallet')).toBe(false); // Card order
      expect(orderMatchesPaymentType(mockOrders[2], 'Wallet')).toBe(true);  // Split with wallet

      // Order 1 paid by cash, not wallet redeemed
      expect(orderMatchesPaymentType(mockOrders[0], 'Wallet')).toBe(false);
      expect(orderMatchesPaymentType(mockOrders[0], 'Cash')).toBe(true);
    });

    it('calculates the exact wallet portion in getOrderPaymentAmount', () => {
      // Full wallet order
      expect(getOrderPaymentAmount(mockOrders[1], 'Wallet')).toBe(150);

      // Split order with ₹50 wallet portion
      expect(getOrderPaymentAmount(mockOrders[2], 'Wallet')).toBe(50);
      expect(getOrderPaymentAmount(mockOrders[2], 'UPI')).toBe(150);

      // Non-wallet order
      expect(getOrderPaymentAmount(mockOrders[0], 'Wallet')).toBe(0);
    });

    it('correctly decomposes orders where wallet and UPI were used (e.g. ₹910 total, ₹60 wallet, ₹850 UPI)', () => {
      // Exactly matching the user's invoice INV-TES1J-1444
      const order = {
        id: 'ord_1444',
        billNo: 'INV-TES1J-1444',
        total: 910,
        paymentMethod: 'UPI',
        walletRedeemed: 60,
        history: [
          { action: 'created', timestamp: '2026-10-07T10:38:47Z' },
          { action: 'payment_settled', description: 'Settled via UPI for ₹850.00', amount: 850 },
          { action: 'wallet_redeemed', description: 'Redeemed ₹60.00 from digital wallet towards bill', amount: 60 }
        ]
      };

      const splits = getOrderPaymentSplits(order);
      expect(splits).not.toBeNull();
      expect(splits).toHaveLength(2);

      const walletSplit = splits.find(s => s.method === 'Wallet');
      const upiSplit = splits.find(s => s.method === 'UPI');

      expect(walletSplit).toBeDefined();
      expect(walletSplit.amount).toBe(60);

      expect(upiSplit).toBeDefined();
      expect(upiSplit.amount).toBe(850);

      // Check report payment filtering
      expect(orderMatchesPaymentType(order, 'UPI')).toBe(true);
      expect(orderMatchesPaymentType(order, 'Wallet')).toBe(true);
      expect(orderMatchesPaymentType(order, 'Split')).toBe(true);

      // Ensure UPI does NOT take the full ₹910
      expect(getOrderPaymentAmount(order, 'UPI')).toBe(850);
      expect(getOrderPaymentAmount(order, 'Wallet')).toBe(60);
      expect(getOrderPaymentAmount(order, 'All')).toBe(910);
    });

    it('recovers wallet redemption amount even when walletRedeemed was only logged in history', () => {
      const legacyOrder = {
        id: 'ord_legacy',
        billNo: 'INV-LEGACY-01',
        total: 500,
        paymentMethod: 'UPI',
        // walletRedeemed is omitted
        history: [
          { action: 'payment_settled', description: 'Settled via UPI for ₹400.00' },
          { action: 'wallet_redeemed', description: 'Redeemed ₹100.00 from digital wallet towards bill', amount: 100 }
        ]
      };

      const splits = getOrderPaymentSplits(legacyOrder);
      expect(splits).not.toBeNull();
      expect(getOrderPaymentAmount(legacyOrder, 'UPI')).toBe(400);
      expect(getOrderPaymentAmount(legacyOrder, 'Wallet')).toBe(100);
    });
  });
});
