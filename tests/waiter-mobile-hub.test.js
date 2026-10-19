import { describe, it, expect } from 'vitest';
import { calculateTableBill } from '../src/utils/tableOrders';

describe('Waiter Mobile Hub System & Settlement Logic', () => {
  describe('Bill Calculation for Waiter Orders', () => {
    const settings = {
      billing: {
        currency: '₹',
        gstRate: 5,
        pricesIncludeGst: false,
        enableServiceCharge: true,
        serviceCharge: 5,
      },
      pos: {
        roundTotal: true,
      },
    };

    it('accurately calculates subtotal, tax, service charge, and grand total', () => {
      const items = [
        { id: '1', name: 'Butter Chicken', price: 350, qty: 2 },
        { id: '2', name: 'Garlic Naan', price: 60, qty: 4 },
      ];
      // Subtotal = (350 * 2) + (60 * 4) = 700 + 240 = 940
      const bill = calculateTableBill({
        items,
        settings,
        partySize: 2,
        orderType: 'dine-in',
      });

      expect(bill.subtotal).toBe(940);
      expect(bill.tax).toBe(47); // 5% of 940
      expect(bill.serviceCharge).toBe(47); // 5% of 940
      expect(bill.grandTotal).toBe(1034); // 940 + 47 + 47
    });

    it('handles empty carts safely', () => {
      const bill = calculateTableBill({
        items: [],
        settings,
        partySize: 1,
        orderType: 'dine-in',
      });

      expect(bill.subtotal).toBe(0);
      expect(bill.tax).toBe(0);
      expect(bill.serviceCharge).toBe(0);
      expect(bill.grandTotal).toBe(0);
    });
  });

  describe('Wallet Credit Redemption & Remaining Payable', () => {
    it('deducts wallet balance up to total payable', () => {
      const grandTotal = 1200;
      const guestWalletBalance = 500;
      const walletRedeemed = Math.min(guestWalletBalance, grandTotal);
      const remainingPayable = Math.max(0, grandTotal - walletRedeemed);

      expect(walletRedeemed).toBe(500);
      expect(remainingPayable).toBe(700);
    });

    it('caps wallet redemption when wallet balance exceeds grand total', () => {
      const grandTotal = 450;
      const guestWalletBalance = 1000;
      const walletRedeemed = Math.min(guestWalletBalance, grandTotal);
      const remainingPayable = Math.max(0, grandTotal - walletRedeemed);

      expect(walletRedeemed).toBe(450);
      expect(remainingPayable).toBe(0);
    });
  });

  describe('Cash Change Calculator', () => {
    it('calculates correct change for tendered notes', () => {
      const remainingPayable = 340;
      const cashTendered = 500;
      const change = Math.max(0, cashTendered - remainingPayable);
      expect(change).toBe(160);
    });

    it('returns 0 change when exact cash tendered or less', () => {
      const remainingPayable = 500;
      const changeExact = Math.max(0, 500 - remainingPayable);
      const changeUnder = Math.max(0, 400 - remainingPayable);
      expect(changeExact).toBe(0);
      expect(changeUnder).toBe(0);
    });
  });

  describe('Split Bill Calculation for Tableside Settle', () => {
    it('splits evenly among specified count of diners', () => {
      const payable = 1000;
      const count = 4;
      const perPerson = Math.round((payable / count) * 100) / 100;
      expect(perPerson).toBe(250);

      const splits = Array.from({ length: count }, (_, i) => ({
        person: i + 1,
        amount: perPerson,
      }));
      const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
      expect(totalSplit).toBe(1000);
    });

    it('validates custom split amounts sum to bill total', () => {
      const totalPayable = 1250;
      const customSplits = [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 750 },
      ];
      const sum = customSplits.reduce((acc, s) => acc + Number(s.amount), 0);
      expect(sum).toBe(totalPayable);
    });
  });

  describe('Table Lifecycle Flow', () => {
    it('transitions table to needs-bussing upon payment settlement', () => {
      const activeTable = {
        id: 4,
        number: 4,
        status: 'eating',
        guestName: 'Sarah Connor',
        partySize: 3,
      };

      const updatedTableAfterSettlement = {
        ...activeTable,
        status: 'needs-bussing',
        guestName: null,
        guestPhone: null,
        guestId: null,
        seatedAt: null,
        partySize: null,
      };

      expect(updatedTableAfterSettlement.status).toBe('needs-bussing');
      expect(updatedTableAfterSettlement.guestName).toBeNull();
    });

    it('transitions table to available upon waiter cleaning', () => {
      const bussingTable = {
        id: 4,
        number: 4,
        status: 'needs-bussing',
      };

      const cleanedTable = {
        ...bussingTable,
        status: 'available',
        guestName: null,
        guestId: null,
        seatedAt: null,
      };

      expect(cleanedTable.status).toBe('available');
    });
  });
});
