import { describe, it, expect, beforeEach } from 'vitest';
import {
  createOrder,
  createKDSTicket,
  transferKDSTickets,
  setLocalCollection,
  getAll,
  insert,
  update,
} from '../src/db/database';
import { printReceipt, printKOT } from '../src/utils/printReceipt';

describe('Unassigned Dine-In Orders & Floating Tabs (Order First, Choose Table Later)', () => {
  beforeEach(() => {
    setLocalCollection('orders', []);
    setLocalCollection('kds_tickets', []);
  });

  describe('Unassigned Tab Creation & Token Auto-incrementation', () => {
    it('generates sequential token numbers and supports custom buzzer numbers', () => {
      const getNextTokenNumber = (activeMeta = {}, completedOrders = []) => {
        const activeTokens = Object.values(activeMeta)
          .map(t => parseInt(t.tokenNumber, 10))
          .filter(n => !isNaN(n));

        const completedTokens = completedOrders
          .map(o => parseInt(o.tokenNumber, 10))
          .filter(n => !isNaN(n));

        const allTokens = [...activeTokens, ...completedTokens];
        if (allTokens.length === 0) return 1;
        return Math.max(...allTokens) + 1;
      };

      // Initial token when empty
      expect(getNextTokenNumber({}, [])).toBe(1);

      // Next token with active floating tabs
      const activeTabs = {
        tab_1: { id: 'tab_1', tokenNumber: '1', guestName: 'John' },
        tab_2: { id: 'tab_2', tokenNumber: '2', guestName: 'Alice' },
      };
      expect(getNextTokenNumber(activeTabs, [])).toBe(3);

      // Accounts for completed orders from earlier today
      const completedOrders = [
        { id: 'ord-1', tokenNumber: '3' },
        { id: 'ord-2', tokenNumber: '4' },
      ];
      expect(getNextTokenNumber(activeTabs, completedOrders)).toBe(5);

      // Custom alphanumeric buzzer identifier is preserved as string
      const customBuzzerTab = {
        id: 'tab_custom',
        tokenNumber: 'B-12',
        guestName: 'VIP Table Waiting',
        partySize: 4,
      };
      expect(customBuzzerTab.tokenNumber).toBe('B-12');
      expect(customBuzzerTab.partySize).toBe(4);
    });
  });

  describe('KOT Firing Without Table Number', () => {
    it('creates active KDS ticket tagged with tokenNumber and unassigned tableId', async () => {
      const ticket = await createKDSTicket(
        'TOK-1-9876',
        [
          { id: 'item-1', name: 'Cold Brew Coffee', price: 180, qty: 2, station: 'bar' },
          { id: 'item-2', name: 'Avocado Toast', price: 320, qty: 1, station: 'kitchen' },
        ],
        'tab_1001',
        'dine-in',
        { tokenNumber: '1', guestName: 'Sneha' }
      );

      expect(ticket.id).toBeDefined();
      expect(ticket.tableId).toBe('tab_1001');
      expect(ticket.tokenNumber).toBe('1');
      expect(ticket.guestName).toBe('Sneha');
      expect(ticket.orderType).toBe('dine-in');
      expect(ticket.status).toBe('active');
      expect(ticket.items).toHaveLength(2);
      expect(ticket.items[0].status).toBe('pending');
    });

    it('formats KOT printout correctly for unassigned table orders', () => {
      const mockSettings = { restaurant: { name: 'Kiko Cafe' }, printer: { paperSize: '80mm' } };
      const kotHtml = printKOT({
        orderId: 'TOK-1-1001',
        items: [{ name: 'Espresso', qty: 2 }],
        tableId: 'tab_1001',
        tableName: 'Token #1 (Unassigned Table)',
        serverName: 'Staff',
        orderType: 'dine-in',
        settings: mockSettings,
      });

      expect(kotHtml).toContain('KITCHEN ORDER TICKET (KOT)');
      expect(kotHtml).toContain('Token #1 (Unassigned Table)');
      expect(kotHtml).toContain('Espresso');
    });
  });

  describe('Table Assignment & State Migration', () => {
    it('migrates cart items from floating tab to chosen table and clears floating tab metadata', () => {
      const tabId = 'tab_guest_42';
      const initialSavedOrders = {
        [tabId]: [
          { _cartKey: 'k1', id: 'croissant', name: 'Almond Croissant', price: 160, qty: 2 },
          { _cartKey: 'k2', id: 'latte', name: 'Oat Milk Latte', price: 220, qty: 2 },
        ],
        __tabs_meta__: {
          guest_42: {
            id: 'guest_42',
            tokenNumber: '7',
            guestName: 'Rohan Sharma',
            partySize: 2,
            createdAt: '2026-10-03T08:00:00.000Z',
          },
        },
      };

      const initialTables = [
        { id: 'table-5', number: 5, status: 'available', guestName: null, partySize: null },
      ];

      // Simulate handleAssignTableToTab logic
      const targetTableId = 'table-5';
      const tab = initialSavedOrders.__tabs_meta__.guest_42;
      const tabItems = initialSavedOrders[tabId];

      const nextSavedOrders = { ...initialSavedOrders };
      nextSavedOrders[targetTableId] = tabItems;
      delete nextSavedOrders[tabId];
      const nextMeta = { ...nextSavedOrders.__tabs_meta__ };
      delete nextMeta.guest_42;
      nextSavedOrders.__tabs_meta__ = nextMeta;

      const updatedTables = initialTables.map(t =>
        t.id === targetTableId
          ? {
              ...t,
              status: 'ordered',
              guestName: tab.guestName,
              partySize: tab.partySize,
            }
          : t
      );

      // Floating tab cleared
      expect(nextSavedOrders[tabId]).toBeUndefined();
      expect(nextSavedOrders.__tabs_meta__.guest_42).toBeUndefined();

      // Target table populated
      expect(nextSavedOrders['table-5']).toHaveLength(2);
      expect(nextSavedOrders['table-5'][0].name).toBe('Almond Croissant');

      // Table status updated
      const t5 = updatedTables.find(t => t.id === 'table-5');
      expect(t5.status).toBe('ordered');
      expect(t5.guestName).toBe('Rohan Sharma');
      expect(t5.partySize).toBe(2);
    });

    it('transfers active KDS tickets from Token to chosen Table and notes previous token', async () => {
      // 1. Kitchen received ticket under Token #7
      const ticket = await createKDSTicket(
        'TOK-7-5555',
        [{ id: 'item-1', name: 'Pancakes', qty: 1 }],
        'tab_guest_42',
        'dine-in',
        { tokenNumber: '7', guestName: 'Rohan' }
      );

      expect(ticket.tableId).toBe('tab_guest_42');

      // 2. Guest seated at Table 5 -> transfer KDS tickets
      const transferredCount = await transferKDSTickets(
        'tab_guest_42',
        'table-5',
        'Token #7',
        '5'
      );

      expect(transferredCount).toBe(1);

      const allTickets = getAll('kds_tickets');
      const updatedTicket = allTickets.find(t => t.id === ticket.id);
      expect(updatedTicket.tableId).toBe('table-5');
      expect(updatedTicket.tableShiftedFrom).toBe('Token #7');
      expect(updatedTicket.tableShiftedTo).toBe('5');
    });
  });

  describe('Pre-pay at Counter vs Table Post-pay Settlement', () => {
    it('creates paid order with tokenNumber for counter pre-payment', async () => {
      const items = [
        { id: 'pizza-1', name: 'Margherita Pizza', price: 400, qty: 1 },
        { id: 'drink-1', name: 'Fresh Lime Soda', price: 100, qty: 2 },
      ];

      // Pre-pay at counter before choosing table
      const order = await createOrder(null, items, 'UPI', {
        orderType: 'dine-in',
        tokenNumber: '14',
        guestName: 'Vikram',
      });

      expect(order.id).toBeDefined();
      expect(order.tableId).toBeNull();
      expect(order.orderType).toBe('dine-in');
      expect(order.tokenNumber).toBe('14');
      expect(order.guestName).toBe('Vikram');
      expect(order.total).toBe(600); // 400 + 200
      expect(order.status).toBe('paid');
    });

    it('prints receipt clearly identifying Token / Dine-In without table', () => {
      const order = {
        billNo: 'INV-DEMO-1099',
        total: 600,
        createdAt: new Date().toISOString(),
        orderType: 'dine-in',
        tokenNumber: '14',
        paymentMethod: 'UPI',
        items: [{ name: 'Margherita Pizza', price: 400, qty: 1 }],
      };

      const receiptHtml = printReceipt({
        order,
        settings: { restaurant: { name: 'Kiko Cafe' } },
        tableId: null,
        guestName: 'Vikram',
      });

      expect(receiptHtml).toContain('Token #14 (Dine-In)');
      expect(receiptHtml).toContain('Vikram');
      expect(receiptHtml).toContain('Margherita Pizza');
    });
  });

  describe('Tab Resilience & Direct Settle Bill', () => {
    it('persists self-contained tab in pos_saved_orders without losing items or metadata', () => {
      const tabId = 'tab_guest_99';
      const selfContainedTab = {
        id: 'guest_99',
        tokenNumber: '3',
        guestName: 'Ananya',
        partySize: 2,
        createdAt: '2026-10-03T09:00:00.000Z',
        orderType: 'dine-in',
        items: [
          { id: 'coffee', name: 'Cappuccino', price: 150, qty: 2 },
          { id: 'pastry', name: 'Blueberry Muffin', price: 120, qty: 1 },
        ],
      };

      const savedOrders = {
        [tabId]: selfContainedTab,
      };

      // Simulates floatingTabs resolution across page refresh / KDS navigation
      const resolvedTabs = Object.entries(savedOrders)
        .filter(([k, v]) => k.startsWith('tab_') && v)
        .map(([k, v]) => ({
          ...v,
          items: v.items || [],
        }));

      expect(resolvedTabs).toHaveLength(1);
      expect(resolvedTabs[0].tokenNumber).toBe('3');
      expect(resolvedTabs[0].guestName).toBe('Ananya');
      expect(resolvedTabs[0].items).toHaveLength(2);
      expect(resolvedTabs[0].items[0].name).toBe('Cappuccino');
    });

    it('identifies when KDS ticket for an unassigned tab has been bumped as Food Ready', async () => {
      const ticket = await createKDSTicket(
        'TOK-3-1234',
        [{ id: 'item-1', name: 'Cold Brew', qty: 2 }],
        'tab_guest_99',
        'dine-in',
        { tokenNumber: '3', guestName: 'Ananya' }
      );

      const allTickets = getAll('kds_tickets');
      // Cook bumps order in KDS
      const updatedTickets = allTickets.map(t =>
        t.id === ticket.id ? { ...t, status: 'completed' } : t
      );

      // POS checks KDS ticket status for the tab
      const tabTickets = updatedTickets.filter(t => t.tableId === 'tab_guest_99');
      const isFoodReady = tabTickets.length > 0 && tabTickets.every(t => t.status === 'completed');

      expect(isFoodReady).toBe(true);
    });
  });
});
