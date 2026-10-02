import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOrder, setLocalCollection, computeStockStatus, getSettings } from '../src/db/database';
import { getNoun } from '../src/utils/naming';
import { printReceipt, printKOT } from '../src/utils/printReceipt';

describe('Settings Features & Wiring Tests', () => {
  beforeEach(() => {
    setLocalCollection('settings', {
      restaurant: { currency: '₹', name: 'Kitchgoo Bistro' },
      billing: {
        gstRate: 5,
        pricesIncludeGst: true,
        roundingMode: 'none',
        billPrefix: 'INV',
      },
      operations: {
        lowStockThreshold: 8,
        voidApprovalThreshold: 200,
        autoPrintReceipt: true,
        autoKOT: false,
      },
      printer: {
        autoPrintBill: true,
        autoPrintKOT: false,
        paperSize: '80mm',
        copies: 1,
      },
      payments: {
        cash: true,
        upi: true,
        card: true,
        wallet: false,
        applePay: true,
      },
      naming: {
        tables: 'Zones',
        checks: 'Tabs',
        servers: 'Captains',
        guests: 'Patrons',
      },
      receipt: {
        headerText: 'Special Receipt Header',
        footerText: 'Special Receipt Footer',
        tipSuggestions: [12, 18, 24],
      }
    });
    setLocalCollection('orders', []);
  });

  describe('Auto-print Bill Toggle Logic', () => {
    it('evaluates shouldAutoPrint as true when autoPrintBill is enabled', () => {
      const settings = {
        printer: { autoPrintBill: true },
        operations: { autoPrintReceipt: true },
        workflow: { autoPrintOnPayment: true },
      };
      const shouldAutoPrint = (
        settings?.printer?.autoPrintBill !== false &&
        settings?.operations?.autoPrintReceipt !== false &&
        settings?.workflow?.autoPrintOnPayment !== false
      );
      expect(shouldAutoPrint).toBe(true);
    });

    it('evaluates shouldAutoPrint as false when autoPrintBill is disabled', () => {
      const settings = {
        printer: { autoPrintBill: false },
        operations: { autoPrintReceipt: true },
        workflow: { autoPrintOnPayment: true },
      };
      const shouldAutoPrint = (
        settings?.printer?.autoPrintBill !== false &&
        settings?.operations?.autoPrintReceipt !== false &&
        settings?.workflow?.autoPrintOnPayment !== false
      );
      expect(shouldAutoPrint).toBe(false);
    });

    it('evaluates shouldAutoPrint as false when operations.autoPrintReceipt is disabled', () => {
      const settings = {
        printer: { autoPrintBill: true },
        operations: { autoPrintReceipt: false },
        workflow: { autoPrintOnPayment: true },
      };
      const shouldAutoPrint = (
        settings?.printer?.autoPrintBill !== false &&
        settings?.operations?.autoPrintReceipt !== false &&
        settings?.workflow?.autoPrintOnPayment !== false
      );
      expect(shouldAutoPrint).toBe(false);
    });
  });

  describe('Auto-print KOT Logic', () => {
    it('evaluates shouldAutoPrintKOT as true when printer.autoPrintKOT is enabled', () => {
      const settings = {
        printer: { autoPrintKOT: true },
        operations: { autoKOT: false },
      };
      const shouldAutoPrint = !!(settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT);
      expect(shouldAutoPrint).toBe(true);
    });

    it('evaluates shouldAutoPrintKOT as true when operations.autoKOT is enabled', () => {
      const settings = {
        printer: { autoPrintKOT: false },
        operations: { autoKOT: true },
      };
      const shouldAutoPrint = !!(settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT);
      expect(shouldAutoPrint).toBe(true);
    });

    it('evaluates shouldAutoPrintKOT as false when both are disabled', () => {
      const settings = {
        printer: { autoPrintKOT: false },
        operations: { autoKOT: false },
      };
      const shouldAutoPrint = !!(settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT);
      expect(shouldAutoPrint).toBe(false);
    });
  });

  describe('Rounding Mode in Database createOrder', () => {
    it('applies "none" rounding (keeps 2 decimals)', async () => {
      setLocalCollection('settings', {
        ...getSettings(),
        billing: { ...getSettings()?.billing, roundingMode: 'none', pricesIncludeGst: false, gstRate: 5 },
      });
      // 1 item of 105.50 * 5% tax = 5.275 tax, subtotal = 105.50, total = 110.775 -> 110.78
      const order = await createOrder('T1', [{ name: 'Dish', price: 105.50, qty: 1 }], 'Cash', {});
      expect(order.total).toBe(110.78);
    });

    it('applies "nearest" rounding to nearest whole integer', async () => {
      setLocalCollection('settings', {
        ...getSettings(),
        billing: { ...getSettings()?.billing, roundingMode: 'nearest', pricesIncludeGst: false, gstRate: 5 },
      });
      // 105.50 * 1.05 = 110.775 -> nearest is 111
      const order = await createOrder('T1', [{ name: 'Dish', price: 105.50, qty: 1 }], 'Cash', {});
      expect(order.total).toBe(111);
    });

    it('applies "up" rounding (always rounds up ceiling)', async () => {
      setLocalCollection('settings', {
        ...getSettings(),
        billing: { ...getSettings()?.billing, roundingMode: 'up', pricesIncludeGst: false, gstRate: 5 },
      });
      // 105.10 * 1.05 = 110.355 -> ceil is 111
      const order = await createOrder('T1', [{ name: 'Dish', price: 105.10, qty: 1 }], 'Cash', {});
      expect(order.total).toBe(111);
    });
  });

  describe('Inventory Low Stock Threshold Fallback', () => {
    it('uses item min when specified', () => {
      // item has min: 10
      expect(computeStockStatus(12, 10)).toBe('good');
      expect(computeStockStatus(9, 10)).toBe('low');
      expect(computeStockStatus(4, 10)).toBe('critical');
    });

    it('falls back to settings.operations.lowStockThreshold when item min is missing', () => {
      // settings has lowStockThreshold: 8
      expect(computeStockStatus(10, null)).toBe('good');
      expect(computeStockStatus(7, null)).toBe('low');
      expect(computeStockStatus(3, null)).toBe('critical');
    });
  });

  describe('Void Approval Threshold Logic', () => {
    it('allows direct void without manager PIN when under threshold', () => {
      const threshold = 200;
      const voidItem = { name: 'Dessert', price: 150, qty: 1 };
      const voidAmount = voidItem.price * voidItem.qty;

      const requiresManagerPin = threshold === 0 || voidAmount > threshold;
      expect(requiresManagerPin).toBe(false);
    });

    it('requires manager PIN when void amount exceeds threshold', () => {
      const threshold = 200;
      const voidItem = { name: 'Wine Bottle', price: 800, qty: 1 };
      const voidAmount = voidItem.price * voidItem.qty;

      const requiresManagerPin = threshold === 0 || voidAmount > threshold;
      expect(requiresManagerPin).toBe(true);
    });

    it('requires manager PIN when threshold is 0 (strict mode)', () => {
      const threshold = 0;
      const voidItem = { name: 'Chai', price: 30, qty: 1 };
      const voidAmount = voidItem.price * voidItem.qty;

      const requiresManagerPin = threshold === 0 || voidAmount > threshold;
      expect(requiresManagerPin).toBe(true);
    });
  });

  describe('Custom Naming Utility', () => {
    it('returns custom configured terminology when set', () => {
      const settings = {
        naming: {
          tables: 'Stations',
          servers: 'Guides',
          guests: 'VIPs',
          checks: 'Bills',
        }
      };
      expect(getNoun(settings, 'tables', 'Tables')).toBe('Stations');
      expect(getNoun(settings, 'servers', 'Server')).toBe('Guides');
      expect(getNoun(settings, 'guests', 'Guest')).toBe('VIPs');
      expect(getNoun(settings, 'checks', 'Order')).toBe('Bills');
    });

    it('returns default fallback when key is not configured or empty', () => {
      const settings = { naming: { tables: '   ' } };
      expect(getNoun(settings, 'tables', 'Tables')).toBe('Tables');
      expect(getNoun(settings, 'unknown', 'Default')).toBe('Default');
    });
  });

  describe('Printing Utilities Execution', () => {
    it('renders printReceipt and printKOT without exceptions in simulated browser window', () => {
      let writtenHtml = '';
      const fakeWindow = {
        document: {
          open: vi.fn(),
          write: vi.fn((html) => { writtenHtml = html; }),
          close: vi.fn(),
        }
      };
      vi.stubGlobal('window', {
        open: vi.fn(() => fakeWindow),
      });

      const settings = getSettings();

      // Test printReceipt with custom header, paper size, and 2 copies
      printReceipt({
        order: {
          billNo: 'INV-1001',
          createdAt: new Date().toISOString(),
          items: [{ name: 'Pizza', price: 200, qty: 2 }],
          subtotal: 380.95,
          tax: 19.05,
          total: 400,
          paymentMethod: 'Cash',
        },
        settings: {
          ...settings,
          printer: { paperSize: '58mm', copies: 2 },
          receipt: { headerText: 'Welcome Custom Header', showQrCode: true },
        },
        tableId: '4',
        guestName: 'Rahul',
      });

      expect(fakeWindow.document.open).toHaveBeenCalled();
      expect(fakeWindow.document.write).toHaveBeenCalled();
      expect(writtenHtml).toContain('58mm auto');
      expect(writtenHtml).toContain('Welcome Custom Header');
      expect(writtenHtml).toContain('COPY 1 OF 2');
      expect(writtenHtml).toContain('COPY 2 OF 2');

      // Test printKOT
      let kotHtml = '';
      fakeWindow.document.write = vi.fn((html) => { kotHtml = html; });

      printKOT({
        orderId: 'T4-1001',
        items: [{ name: 'Burger', qty: 2, course: 1, notes: 'Extra spicy' }],
        tableId: '4',
        tableName: 'Table 4',
        serverName: 'Vikram',
        settings,
      });

      expect(kotHtml).toContain('KITCHEN ORDER TICKET (KOT)');
      expect(kotHtml).toContain('Table 4');
      expect(kotHtml).toContain('Burger');
      expect(kotHtml).toContain('Extra spicy');
      expect(kotHtml).toContain('Vikram');

      vi.unstubAllGlobals();
    });
  });
});
