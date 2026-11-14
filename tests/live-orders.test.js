import { describe, it, expect } from 'vitest';
import { getTableKeys, resolveTableSavedOrder, calculateTableBill } from '../src/utils/tableOrders';

describe('Live Orders & Waiter View Helper Functions', () => {
  describe('getTableKeys', () => {
    it('generates comprehensive table aliases for numeric ID', () => {
      const keys = getTableKeys(1);
      expect(keys).toContain(1);
      expect(keys).toContain('1');
      expect(keys).toContain('tbl_1');
      expect(keys).toContain('table_1');
    });

    it('generates table aliases for string ID object', () => {
      const keys = getTableKeys({ id: 't4', number: 4 });
      expect(keys).toContain('t4');
      expect(keys).toContain(4);
      expect(keys).toContain('4');
      expect(keys).toContain('tbl_4');
      expect(keys).toContain('table_4');
    });

    it('handles leading zeros and special OCR keys like 1o / 10', () => {
      const keys = getTableKeys('05');
      expect(keys).toContain('5');
      expect(keys).toContain('tbl_5');

      const keys10 = getTableKeys('10');
      expect(keys10).toContain('tbl_1o');
      expect(keys10).toContain('1o');
    });

    it('returns empty array for null/undefined', () => {
      expect(getTableKeys(null)).toEqual([]);
      expect(getTableKeys(undefined)).toEqual([]);
    });
  });

  describe('resolveTableSavedOrder', () => {
    it('resolves direct array under number key', () => {
      const savedOrders = {
        '1': [{ id: 'burger', name: 'Veg Burger', price: 150, qty: 2 }],
      };
      const items = resolveTableSavedOrder(savedOrders, { id: 't1', number: 1 });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Veg Burger');
    });

    it('resolves items array from object format under tbl_ prefix', () => {
      const savedOrders = {
        'tbl_3': { items: [{ id: 'pizza', name: 'Margherita', price: 300, qty: 1 }] },
      };
      const items = resolveTableSavedOrder(savedOrders, { id: '3', number: 3 });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Margherita');
    });

    it('returns empty array when table has no saved order', () => {
      const savedOrders = {
        '2': [{ id: 'fries', name: 'French Fries', price: 100, qty: 1 }],
      };
      const items = resolveTableSavedOrder(savedOrders, { id: '5', number: 5 });
      expect(items).toEqual([]);
    });
  });

  describe('calculateTableBill', () => {
    const defaultSettings = {
      billing: {
        gstRate: 5,
        pricesIncludeGst: false,
        enableServiceCharge: true,
        serviceCharge: 10,
        roundingMode: 'nearest',
      },
    };

    it('calculates bill with tax and service charge (exclusive)', () => {
      const items = [
        { id: '1', name: 'Cold Coffee', price: 150, qty: 2 }, // 300
        { id: '2', name: 'Brownie', price: 120, qty: 1, modifiers: [{ name: 'Ice Cream', price: 40 }] }, // 160
      ]; // subtotal = 460

      const bill = calculateTableBill({
        items,
        settings: defaultSettings,
        partySize: 2,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(true);
      expect(bill.itemCount).toBe(3); // 2 + 1
      expect(bill.subtotal).toBe(460);
      expect(bill.serviceCharge).toBe(46); // 10% of 460
      // Tax: 5% of 460 = 23
      expect(bill.tax).toBe(23);
      // Total = 460 + 23 + 46 = 529
      expect(bill.grandTotal).toBe(529);
    });

    it('handles tax inclusive pricing properly', () => {
      const inclusiveSettings = {
        billing: {
          gstRate: 5,
          pricesIncludeGst: true,
          enableServiceCharge: false,
          roundingMode: 'nearest',
        },
      };

      const items = [
        { id: '1', name: 'Club Sandwich', price: 210, qty: 1 },
      ];

      const bill = calculateTableBill({
        items,
        settings: inclusiveSettings,
        partySize: 1,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(true);
      expect(bill.grandTotal).toBe(210);
      expect(bill.subtotal).toBe(210);
      expect(bill.subtotalNet).toBeLessThan(210);
      expect(bill.subtotalNet + bill.tax).toBeCloseTo(210, 0);
    });

    it('returns zeroes when items list is empty', () => {
      const bill = calculateTableBill({
        items: [],
        settings: defaultSettings,
        partySize: 1,
        orderType: 'dine-in',
      });

      expect(bill.hasOrder).toBe(false);
      expect(bill.itemCount).toBe(0);
      expect(bill.subtotal).toBe(0);
      expect(bill.tax).toBe(0);
      expect(bill.serviceCharge).toBe(0);
      expect(bill.grandTotal).toBe(0);
    });
  });

  describe('Floating Tabs Extraction (Unassigned Orders)', () => {
    it('correctly filters and extracts tab_ entries from savedOrders map', () => {
      const savedOrders = {
        '1': [{ id: 'tea', name: 'Masala Tea', price: 40, qty: 2 }],
        'tab_101': {
          id: '101',
          tokenNumber: '101',
          guestName: 'Rahul',
          partySize: 2,
          items: [{ id: 'sandwich', name: 'Paneer Sandwich', price: 180, qty: 1 }],
        },
        'tab_102': [{ id: 'juice', name: 'Orange Juice', price: 120, qty: 2 }],
      };

      const floatingTabs = [];
      Object.entries(savedOrders).forEach(([key, val]) => {
        if (!key.startsWith('tab_') || !val) return;
        const tabId = key.replace(/^tab_/, '');
        if (typeof val === 'object' && !Array.isArray(val) && val.tokenNumber) {
          floatingTabs.push({ ...val, id: val.id || tabId });
        } else {
          const items = Array.isArray(val) ? val : (val.items || []);
          floatingTabs.push({ id: tabId, tokenNumber: tabId, items });
        }
      });

      expect(floatingTabs).toHaveLength(2);
      expect(floatingTabs[0].tokenNumber).toBe('101');
      expect(floatingTabs[0].guestName).toBe('Rahul');
      expect(floatingTabs[1].tokenNumber).toBe('102');
      expect(floatingTabs[1].items).toHaveLength(1);
    });
  });

  describe('Minimal Egress & Low Payload Item Stripping', () => {
    function stripOrderItem(item) {
      if (!item) return item;
      return {
        id: item.id || item._cartKey || '',
        name: item.name || '',
        price: Number(item.price) || 0,
        qty: Number(item.qty || item.quantity) || 1,
        notes: item.notes || '',
        modifiers: Array.isArray(item.modifiers)
          ? item.modifiers.map(m => ({
              name: m.name || '',
              price: Number(m.price) || 0,
            }))
          : [],
      };
    }

    it('strips heavy blobs and images while preserving order and pricing fields', () => {
      const heavyItem = {
        id: 'cappuccino-1',
        _cartKey: 'cappuccino-1_mod1',
        name: 'Cappuccino',
        price: 180,
        qty: 2,
        notes: 'Extra froth',
        description: 'Rich dark espresso with steamed whole milk and velvety microfoam...',
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        imageUrl: 'https://cdn.restaurant.com/images/highres_4k_coffee.jpg',
        recipeDetails: { beans: 'Arabica', origin: 'Ethiopia', roast: 'Medium' },
        modifiers: [
          { id: 'm1', name: 'Oat Milk', price: 30, supplier: 'Oatly Corp', sku: 'OAT-99' },
        ],
      };

      const stripped = stripOrderItem(heavyItem);

      expect(stripped.id).toBe('cappuccino-1');
      expect(stripped.name).toBe('Cappuccino');
      expect(stripped.price).toBe(180);
      expect(stripped.qty).toBe(2);
      expect(stripped.notes).toBe('Extra froth');
      expect(stripped.modifiers).toEqual([{ name: 'Oat Milk', price: 30 }]);
      expect(stripped.imageBase64).toBeUndefined();
      expect(stripped.imageUrl).toBeUndefined();
      expect(stripped.description).toBeUndefined();
      expect(stripped.recipeDetails).toBeUndefined();
    });
  });

  describe('Resilient Settings Rows Parsing (No 500 error)', () => {
    it('safely handles array, object, or undefined settings responses without throwing TypeError', () => {
      const parseSettings = (settingsRows) => {
        const settings = {};
        ['restaurant', 'billing', 'operations'].forEach(s => { settings[s] = {}; });
        (Array.isArray(settingsRows) ? settingsRows : []).forEach(row => {
          if (row && row.section_name) settings[row.section_name] = row.value;
        });
        return settings;
      };

      // Case 1: PostgREST response object accidentally passed (the bug that caused 500)
      const objResponse = { data: [{ section_name: 'restaurant', value: { name: 'Kiko Cafe' } }] };
      expect(() => parseSettings(objResponse)).not.toThrow();

      // Case 2: Clean array of rows
      const arrayRows = [{ section_name: 'billing', value: { gstRate: 5 } }];
      const parsed = parseSettings(arrayRows);
      expect(parsed.billing.gstRate).toBe(5);

      // Case 3: null or undefined
      expect(() => parseSettings(null)).not.toThrow();
      expect(() => parseSettings(undefined)).not.toThrow();
    });
  });

  describe('PWA Manifest & Home Screen Shortcut Configuration', () => {
    it('verifies manifest-orders.json has start_url /orders and display standalone', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const manifestPath = path.resolve(__dirname, '../public/manifest-orders.json');
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      expect(manifest.start_url).toBe('/orders');
      expect(manifest.display).toBe('standalone');
      expect(manifest.scope).toBe('/orders');
      expect(manifest.icons).toHaveLength(2);
    });

    it('verifies root manifest.json includes shortcuts for Live Table Orders', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const manifestPath = path.resolve(__dirname, '../public/manifest.json');
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);

      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      const ordersShortcut = manifest.shortcuts.find(s => s.url === '/orders');
      expect(ordersShortcut).toBeDefined();
      expect(ordersShortcut.name).toBe('Live Table Orders');
    });

    it('generates dynamic tenant manifest with encoded start_url', () => {
      const generateTenantManifest = (tenant) => {
        const cleanTenant = (tenant || 'Kiko Cafe').trim();
        return {
          name: `${cleanTenant} — Live Orders`,
          short_name: 'Orders',
          start_url: `/orders/${encodeURIComponent(cleanTenant)}`,
          scope: '/orders',
          display: 'standalone',
        };
      };

      const kikoManifest = generateTenantManifest('Kiko Cafe');
      expect(kikoManifest.start_url).toBe('/orders/Kiko%20Cafe');
      expect(kikoManifest.name).toBe('Kiko Cafe — Live Orders');
      expect(kikoManifest.display).toBe('standalone');
    });
  });

  describe('Component Render Smoke Test', () => {
    it('renders LiveOrders component without throwing ReferenceError', async () => {
      const React = await import('react');
      const { renderToString } = await import('react-dom/server');
      const { MemoryRouter } = await import('react-router-dom');
      const LiveOrders = (await import('../src/pages/LiveOrders')).default;

      let html = '';
      expect(() => {
        html = renderToString(
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/orders/Kiko%20Cafe'] },
            React.createElement(LiveOrders, { defaultTenant: 'Kiko Cafe' })
          )
        );
      }).not.toThrow();

      expect(html).toContain('Kiko Cafe');
      expect(html).toContain('LIVE');
    });
  });
});


