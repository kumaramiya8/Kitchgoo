import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOrder,
  setLocalCollection,
  getAll,
  insert,
  update,
  updateCashDrawer,
  redeemGiftCardCredit,
} from '../src/db/database';

describe('Guest Management & Settle Bill Later', () => {
  beforeEach(() => {
    setLocalCollection('orders', []);
    setLocalCollection('guests', []);
    setLocalCollection('cash_drawer', {
      openingBalance: 1000,
      currentBalance: 1000,
      cashIn: 0,
      cashOut: 0,
      drops: [],
      shiftStart: new Date().toISOString(),
      isClosed: false,
    });
    setLocalCollection('gift_card_ledger', []);
  });

  describe('1. No Table Order: Guest Search & Auto-Creation', () => {
    it('matches existing guests by phone number or name', async () => {
      await insert('guests', {
        id: 'g-101',
        name: 'Aarav Patel',
        phone: '9876543210',
        email: 'aarav@example.com',
        visitCount: 3,
        totalSpend: 2500,
      });

      const allGuests = getAll('guests');

      // Search by phone
      const phoneQuery = '543210';
      const matchedByPhone = allGuests.find(g => (g.phone || '').includes(phoneQuery));
      expect(matchedByPhone).toBeDefined();
      expect(matchedByPhone.id).toBe('g-101');
      expect(matchedByPhone.name).toBe('Aarav Patel');

      // Search by partial name
      const nameQuery = 'aarav';
      const matchedByName = allGuests.find(g => (g.name || '').toLowerCase().includes(nameQuery));
      expect(matchedByName).toBeDefined();
      expect(matchedByName.id).toBe('g-101');
    });

    it('auto-creates a new guest in CRM if name/phone is not found', async () => {
      const guestsBefore = getAll('guests');
      expect(guestsBefore.length).toBe(0);

      const enteredName = 'Rohan Gupta';
      const enteredPhone = '9123456789';

      // Simulation of NoTableOrderModal auto-creation
      const existing = (getAll('guests') || []).find(g =>
        g.phone === enteredPhone || (g.name || '').toLowerCase() === enteredName.toLowerCase()
      );
      expect(existing).toBeUndefined();

      const newGuest = await insert('guests', {
        name: enteredName,
        phone: enteredPhone,
        visitCount: 0,
        totalSpend: 0,
        notes: 'Token Order Note: Table waiting',
        createdAt: new Date().toISOString(),
      });

      expect(newGuest.id).toBeDefined();
      expect(newGuest.name).toBe('Rohan Gupta');
      expect(newGuest.phone).toBe('9123456789');

      const guestsAfter = getAll('guests');
      expect(guestsAfter.length).toBe(1);
      expect(guestsAfter[0].id).toBe(newGuest.id);
    });
  });

  describe('2. Walk-In Order View: Guest Search & Assignment', () => {
    it('allows assigning an existing guest to an active walk-in table', async () => {
      const guest = await insert('guests', {
        name: 'Priya Sharma',
        phone: '9988776655',
        visitCount: 5,
        totalSpend: 4200,
      });

      // Walk-in table initially
      let activeTable = {
        id: 'T-4',
        number: 4,
        status: 'occupied',
        guestName: null,
        guestPhone: null,
        guestId: null,
      };

      // Assign guest
      activeTable = {
        ...activeTable,
        guestName: guest.name,
        guestPhone: guest.phone,
        guestId: guest.id,
      };

      expect(activeTable.guestId).toBe(guest.id);
      expect(activeTable.guestName).toBe('Priya Sharma');
      expect(activeTable.guestPhone).toBe('9988776655');
    });

    it('allows quick-creating a new guest and assigning them immediately', async () => {
      const newGuestData = {
        name: 'Vikram Mehta',
        phone: '9811223344',
        email: 'vikram@example.com',
        visitCount: 0,
        totalSpend: 0,
        createdAt: new Date().toISOString(),
      };

      const createdGuest = await insert('guests', newGuestData);
      expect(createdGuest.id).toBeDefined();

      let activeTable = { id: 'T-2', number: 2, status: 'occupied' };
      activeTable = {
        ...activeTable,
        guestName: createdGuest.name,
        guestPhone: createdGuest.phone,
        guestId: createdGuest.id,
      };

      expect(activeTable.guestId).toBe(createdGuest.id);
      expect(activeTable.guestName).toBe('Vikram Mehta');
    });
  });

  describe('3. Settle Bill Later (House Accounts & Tabs)', () => {
    it('creates an order with pending_payment status and links to guest profile', async () => {
      const guest = await insert('guests', {
        name: 'Ananya Verma',
        phone: '9845012345',
        visitCount: 1,
        totalSpend: 1200,
      });

      const items = [
        { id: 'item-1', name: 'Paneer Butter Masala', price: 320, qty: 2 },
        { id: 'item-2', name: 'Garlic Naan', price: 60, qty: 3 },
      ];

      const order = await createOrder(
        'T-5',
        items,
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          customerName: guest.name,
          customerPhone: guest.phone,
          settledAt: null,
          paidAt: null,
        }
      );

      expect(order.id).toBeDefined();
      expect(order.status).toBe('pending_payment');
      expect(order.paymentStatus).toBe('unpaid');
      expect(order.paymentMethod).toBe('Pay Later');
      expect(order.guestId).toBe(guest.id);
      expect(order.total).toBe(820);
      expect(order.settledAt).toBeNull();
      expect(order.paidAt).toBeNull();
    });

    it('allows a guest to accumulate multiple pending bills in their profile', async () => {
      const guest = await insert('guests', {
        name: 'Siddharth Roy',
        phone: '9711002233',
        visitCount: 4,
        totalSpend: 3000,
      });

      // Bill 1: Lunch
      const order1 = await createOrder(
        'T-1',
        [{ id: 'i-1', name: 'Lunch Thali', price: 250, qty: 1 }],
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          customerName: guest.name,
          settledAt: null,
          paidAt: null,
        }
      );

      // Bill 2: Evening snacks / Drinks
      const order2 = await createOrder(
        'takeout',
        [{ id: 'i-2', name: 'Cold Coffee', price: 150, qty: 2 }],
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          customerName: guest.name,
          settledAt: null,
          paidAt: null,
        }
      );

      const allOrders = getAll('orders');
      const guestPending = allOrders.filter(o =>
        o.guestId === guest.id && (o.status === 'pending_payment' || o.paymentMethod === 'Pay Later')
      );

      expect(guestPending.length).toBe(2);
      const totalDue = guestPending.reduce((sum, o) => sum + o.total, 0);
      expect(totalDue).toBe(550); // 250 + 300
    });
  });

  describe('4. Settle Pending Bills from Guest Profile', () => {
    it('settles a pending bill via Cash and updates cash drawer and guest spend', async () => {
      const guest = await insert('guests', {
        name: 'Karan Mehra',
        phone: '9822334455',
        visitCount: 2,
        totalSpend: 1500,
      });

      const pendingOrder = await createOrder(
        'T-3',
        [{ id: 'i-1', name: 'Biryani', price: 400, qty: 1 }],
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          settledAt: null,
        }
      );

      expect(pendingOrder.status).toBe('pending_payment');

      // Settle via Cash
      const nowIso = new Date().toISOString();
      await update('orders', pendingOrder.id, {
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: 'Cash',
        settledAt: nowIso,
        paidAt: nowIso,
        settledBy: 'Cashier',
      });

      // Cash drawer updated
      const drawer = getAll('cash_drawer');
      await updateCashDrawer({
        ...drawer,
        cashIn: (drawer.cashIn || 0) + pendingOrder.total,
      });

      // Guest spend updated
      await update('guests', guest.id, {
        totalSpend: (guest.totalSpend || 0) + pendingOrder.total,
        lastVisit: nowIso,
      });

      const updatedOrder = (getAll('orders') || []).find(o => o.id === pendingOrder.id);
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.paymentMethod).toBe('Cash');
      expect(updatedOrder.settledAt).toBe(nowIso);

      const updatedDrawer = getAll('cash_drawer');
      expect(updatedDrawer.cashIn).toBe(400);

      const updatedGuest = (getAll('guests') || []).find(g => g.id === guest.id);
      expect(updatedGuest.totalSpend).toBe(1900); // 1500 + 400
    });

    it('settles a pending bill via Digital Wallet balance deduction', async () => {
      const guest = await insert('guests', {
        name: 'Neha Kapoor',
        phone: '9833445566',
        walletBalance: 1000,
        visitCount: 3,
        totalSpend: 2000,
      });

      const pendingOrder = await createOrder(
        'T-6',
        [{ id: 'i-1', name: 'Pasta', price: 350, qty: 1 }],
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          settledAt: null,
        }
      );

      // Redeem wallet credit
      const redeemRes = await redeemGiftCardCredit({
        guestPhone: guest.phone,
        guestId: guest.id,
        amount: pendingOrder.total,
        orderId: pendingOrder.id,
        billNo: pendingOrder.billNo,
        staffName: 'Cashier',
        notes: `Pending bill ${pendingOrder.billNo} settled from profile`,
      });

      expect(redeemRes).toBeDefined();
      expect(redeemRes.amountRedeemed).toBe(350);
      expect(redeemRes.guest.walletBalance).toBe(650);

      // Settle order
      const nowIso = new Date().toISOString();
      await update('orders', pendingOrder.id, {
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: 'Wallet',
        settledAt: nowIso,
        paidAt: nowIso,
      });

      const updatedGuest = (getAll('guests') || []).find(g => g.id === guest.id);
      expect(updatedGuest.walletBalance).toBe(650);

      const updatedOrder = (getAll('orders') || []).find(o => o.id === pendingOrder.id);
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.paymentMethod).toBe('Wallet');
    });

    it('settles a pending bill when wallet balance is less than total (partial wallet + UPI/Cash split)', async () => {
      // Exactly the user scenario: Bill is ₹620, wallet has ₹460
      const guest = await insert('guests', {
        name: 'Kumar Amiya',
        phone: '9876500000',
        walletBalance: 460,
        visitCount: 10,
        totalSpend: 8000,
      });

      const pendingOrder = await createOrder(
        'T-1',
        [{ id: 'i-1', name: 'Special Platter', price: 620, qty: 1 }],
        'Pay Later',
        {
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          guestId: guest.id,
          settledAt: null,
        }
      );

      const totalAmount = pendingOrder.total; // 620
      const walletBalance = guest.walletBalance; // 460
      const walletToApply = Math.min(walletBalance, totalAmount); // 460
      const remainingAmount = totalAmount - walletToApply; // 160
      const remainingMethod = 'UPI';

      // 1. Redeem wallet portion
      const redeemRes = await redeemGiftCardCredit({
        guestPhone: guest.phone,
        guestId: guest.id,
        amount: walletToApply,
        orderId: pendingOrder.id,
        billNo: pendingOrder.billNo,
        staffName: 'Cashier',
        notes: `Pending bill ${pendingOrder.billNo} settled from profile`,
      });

      expect(redeemRes).toBeDefined();
      expect(redeemRes.amountRedeemed).toBe(460);
      expect(redeemRes.guest.walletBalance).toBe(0);

      // 2. Settle order as split
      const nowIso = new Date().toISOString();
      const finalMethod = `Split (${remainingMethod}: ₹${remainingAmount.toFixed(0)}, Wallet: ₹${walletToApply.toFixed(0)})`;
      const splits = [
        { method: 'Wallet', amount: walletToApply },
        { method: remainingMethod, amount: remainingAmount },
      ];

      await update('orders', pendingOrder.id, {
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: finalMethod,
        paymentSplits: splits,
        walletRedeemed: walletToApply,
        settledAt: nowIso,
        paidAt: nowIso,
        settledBy: 'Cashier',
      });

      // 3. Update guest spend
      await update('guests', guest.id, {
        totalSpend: guest.totalSpend + totalAmount,
        lastVisit: nowIso,
      });

      const updatedOrder = (getAll('orders') || []).find(o => o.id === pendingOrder.id);
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.paymentMethod).toContain('Wallet: ₹460');
      expect(updatedOrder.paymentMethod).toContain('UPI: ₹160');
      expect(updatedOrder.paymentSplits.length).toBe(2);
      expect(updatedOrder.walletRedeemed).toBe(460);

      const updatedGuest = (getAll('guests') || []).find(g => g.id === guest.id);
      expect(updatedGuest.walletBalance).toBe(0);
      expect(updatedGuest.totalSpend).toBe(8620);
    });

    it('settles all pending bills at once (Batch Settlement)', async () => {
      const guest = await insert('guests', {
        name: 'Rajesh Singhal',
        phone: '9899001122',
        visitCount: 5,
        totalSpend: 5000,
      });

      const o1 = await createOrder('T-1', [{ id: '1', name: 'Tea', price: 50, qty: 2 }], 'Pay Later', {
        status: 'pending_payment', guestId: guest.id, settledAt: null,
      });
      const o2 = await createOrder('T-2', [{ id: '2', name: 'Coffee', price: 100, qty: 1 }], 'Pay Later', {
        status: 'pending_payment', guestId: guest.id, settledAt: null,
      });
      const o3 = await createOrder('T-3', [{ id: '3', name: 'Sandwich', price: 150, qty: 1 }], 'Pay Later', {
        status: 'pending_payment', guestId: guest.id, settledAt: null,
      });

      const pendingOrders = [o1, o2, o3];
      const totalAmount = pendingOrders.reduce((s, o) => s + o.total, 0); // 100 + 100 + 150 = 350
      expect(totalAmount).toBe(350);

      const nowIso = new Date().toISOString();
      for (const order of pendingOrders) {
        await update('orders', order.id, {
          status: 'paid',
          paymentStatus: 'paid',
          paymentMethod: 'UPI',
          settledAt: nowIso,
          paidAt: nowIso,
        });
      }

      await update('guests', guest.id, {
        totalSpend: (guest.totalSpend || 0) + totalAmount,
        lastVisit: nowIso,
      });

      const allGuestOrders = (getAll('orders') || []).filter(o => o.guestId === guest.id);
      expect(allGuestOrders.every(o => o.status === 'paid')).toBe(true);
      expect(allGuestOrders.every(o => o.paymentMethod === 'UPI')).toBe(true);

      const updatedGuest = (getAll('guests') || []).find(g => g.id === guest.id);
      expect(updatedGuest.totalSpend).toBe(5350); // 5000 + 350
    });
  });
});
