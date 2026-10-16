import { describe, it, expect } from 'vitest';
import { isRestaurantOpen, sortAndFilterMenuItems, computeHighMarginItems } from '../src/pages/QRMenu';
import { SEEDS } from '../shared/seeds';

describe('QR Menu Settings & AI Ordering Strategies', () => {
  describe('Operating Hours Synchronization (isRestaurantOpen)', () => {
    it('returns true when current time is strictly within standard daytime shift', () => {
      const operations = {
        openingTime: '09:00',
        closingTime: '23:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      };

      // Monday at 14:30
      const openTime = new Date('2026-10-12T14:30:00');
      expect(isRestaurantOpen(operations, openTime)).toBe(true);

      // Exact opening boundary at 09:00
      const atOpen = new Date('2026-10-12T09:00:00');
      expect(isRestaurantOpen(operations, atOpen)).toBe(true);

      // Exact closing boundary at 23:00
      const atClose = new Date('2026-10-12T23:00:00');
      expect(isRestaurantOpen(operations, atClose)).toBe(true);
    });

    it('returns false when current time is outside operating hours (before open or after close)', () => {
      const operations = {
        openingTime: '09:00',
        closingTime: '22:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      };

      // Morning before opening (08:30)
      const earlyMorning = new Date('2026-10-12T08:30:00');
      expect(isRestaurantOpen(operations, earlyMorning)).toBe(false);

      // Night after closing (22:30)
      const lateNight = new Date('2026-10-12T22:30:00');
      expect(isRestaurantOpen(operations, lateNight)).toBe(false);

      // Midnight (03:00)
      const midnight = new Date('2026-10-12T03:00:00');
      expect(isRestaurantOpen(operations, midnight)).toBe(false);
    });

    it('returns false when current day is not in workingDays even if time matches', () => {
      const operations = {
        openingTime: '09:00',
        closingTime: '22:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], // Closed on weekends
      };

      // Sunday at 14:00 (2026-10-11 is Sunday)
      const sundayAfternoon = new Date('2026-10-11T14:00:00');
      expect(isRestaurantOpen(operations, sundayAfternoon)).toBe(false);

      // Saturday at 14:00 (2026-10-10 is Saturday)
      const saturdayAfternoon = new Date('2026-10-10T14:00:00');
      expect(isRestaurantOpen(operations, saturdayAfternoon)).toBe(false);

      // Monday at 14:00 (2026-10-12 is Monday)
      const mondayAfternoon = new Date('2026-10-12T14:00:00');
      expect(isRestaurantOpen(operations, mondayAfternoon)).toBe(true);
    });

    it('handles overnight restaurant shifts (e.g. 18:00 to 02:00)', () => {
      const operations = {
        openingTime: '18:00',
        closingTime: '02:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      };

      // Night before midnight (23:30)
      const nightTime = new Date('2026-10-12T23:30:00');
      expect(isRestaurantOpen(operations, nightTime)).toBe(true);

      // Early hours after midnight (01:15)
      const postMidnight = new Date('2026-10-12T01:15:00');
      expect(isRestaurantOpen(operations, postMidnight)).toBe(true);

      // Morning after closing (04:00)
      const closedMorning = new Date('2026-10-12T04:00:00');
      expect(isRestaurantOpen(operations, closedMorning)).toBe(false);

      // Afternoon before opening (15:00)
      const closedAfternoon = new Date('2026-10-12T15:00:00');
      expect(isRestaurantOpen(operations, closedAfternoon)).toBe(false);
    });

    it('uses fallback defaults safely if operations object is missing or empty', () => {
      // 14:00 on Sunday should be open under default 09:00 - 23:00 all days
      const afternoon = new Date('2026-10-11T14:00:00');
      expect(isRestaurantOpen({}, afternoon)).toBe(true);
      expect(isRestaurantOpen(null, afternoon)).toBe(true);
    });
  });

  describe('Item Visibility in QR Menu (sortAndFilterMenuItems)', () => {
    const mockMenu = [
      { id: 'item-1', name: 'Butter Chicken', category: 'Main Course', price: 350, active: true },
      { id: 'item-2', name: 'Paneer Tikka', category: 'Starters', price: 260, active: true },
      { id: 'item-3', name: 'Garlic Naan', category: 'Breads', price: 60, active: true },
      { id: 'item-4', name: 'Gulab Jamun', category: 'Desserts', price: 120, active: true },
      { id: 'item-5', name: '86ed Soup', category: 'Starters', price: 150, active: true, sold86: true },
      { id: 'item-6', name: 'Inactive Drink', category: 'Beverages', price: 90, active: false },
    ];

    it('hides items that are in hiddenItemIds from the QR menu', () => {
      const result = sortAndFilterMenuItems(mockMenu, {
        hiddenItemIds: ['item-3', 'item-4'],
      });

      const ids = result.map(i => i.id);
      expect(ids).toContain('item-1');
      expect(ids).toContain('item-2');
      expect(ids).not.toContain('item-3');
      expect(ids).not.toContain('item-4');
    });

    it('filters out inactive and 86ed items even if not in hiddenItemIds', () => {
      const result = sortAndFilterMenuItems(mockMenu, {
        hiddenItemIds: [],
      });

      const ids = result.map(i => i.id);
      expect(ids).not.toContain('item-5'); // 86ed
      expect(ids).not.toContain('item-6'); // inactive
    });

    it('respects category and search query filters while preserving hidden item exclusion', () => {
      const starters = sortAndFilterMenuItems(mockMenu, {
        hiddenItemIds: ['item-2'],
        category: 'Starters',
      });
      // Paneer Tikka is hidden, 86ed Soup is 86ed, so 0 starters remain
      expect(starters).toHaveLength(0);

      const searchResult = sortAndFilterMenuItems(mockMenu, {
        hiddenItemIds: [],
        searchQuery: 'Chicken',
      });
      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].name).toBe('Butter Chicken');
    });
  });

  describe('Menu Sorting & Pinned Items Priority', () => {
    const mockItems = [
      { id: 'item-a', name: 'Standard Tea', price: 30, active: true },
      { id: 'item-b', name: 'Best-Selling Biryani', price: 250, active: true },
      { id: 'item-c', name: 'Chef Signature Salmon', price: 500, active: true },
      { id: 'item-d', name: 'Popular Burger', price: 180, active: true },
    ];

    const salesMap = {
      'item-a': 10,
      'item-b': 500, // Top seller
      'item-c': 5,   // Few sales, but chef special
      'item-d': 200,
    };

    it('sorts by sales volume when sortBySales is true', () => {
      const result = sortAndFilterMenuItems(mockItems, {
        sortBySales: true,
        salesMap,
      });

      expect(result[0].id).toBe('item-b'); // 500 sold
      expect(result[1].id).toBe('item-d'); // 200 sold
      expect(result[2].id).toBe('item-a'); // 10 sold
      expect(result[3].id).toBe('item-c'); // 5 sold
    });

    it('ALWAYS keeps pinned items on top regardless of sortBySales and sales volume', () => {
      // Pin the Salmon (which only has 5 sales)
      const result = sortAndFilterMenuItems(mockItems, {
        pinnedItemIds: ['item-c'],
        sortBySales: true,
        salesMap,
      });

      // item-c MUST be index 0 despite having least sales!
      expect(result[0].id).toBe('item-c');
      // Remaining items are sorted by sales descending
      expect(result[1].id).toBe('item-b'); // 500 sold
      expect(result[2].id).toBe('item-d'); // 200 sold
      expect(result[3].id).toBe('item-a'); // 10 sold
    });

    it('preserves multiple pinned items at the very top of the menu', () => {
      const result = sortAndFilterMenuItems(mockItems, {
        pinnedItemIds: ['item-c', 'item-a'],
        sortBySales: true,
        salesMap,
      });

      const topTwoIds = [result[0].id, result[1].id];
      expect(topTwoIds).toContain('item-c');
      expect(topTwoIds).toContain('item-a');

      // The unpinned items follow in sales order
      expect(result[2].id).toBe('item-b'); // 500 sold
      expect(result[3].id).toBe('item-d'); // 200 sold
    });

    it('keeps pinned items on top even when sortBySales is false', () => {
      const result = sortAndFilterMenuItems(mockItems, {
        pinnedItemIds: ['item-c'],
        sortBySales: false,
      });

      expect(result[0].id).toBe('item-c');
    });

    it('sorts all items from most sold to least sold across all categories when All is selected', () => {
      const multiCatItems = [
        { id: '1', name: 'Starter Soup', category: 'Starters', salesCount: 15, active: true },
        { id: '2', name: 'Main Biryani', category: 'Main Course', salesCount: 150, active: true },
        { id: '3', name: 'Dessert Brownie', category: 'Desserts', salesCount: 80, active: true },
        { id: '4', name: 'Starter Wings', category: 'Starters', salesCount: 45, active: true },
      ];

      const result = sortAndFilterMenuItems(multiCatItems, {
        category: 'All',
        sortBySales: true,
      });

      expect(result.map(i => i.id)).toEqual(['2', '3', '4', '1']);
    });

    it('sorts according to selected category from most sold to least sold', () => {
      const multiCatItems = [
        { id: '1', name: 'Starter Soup', category: 'Starters', salesCount: 15, active: true },
        { id: '2', name: 'Main Biryani', category: 'Main Course', salesCount: 150, active: true },
        { id: '3', name: 'Dessert Brownie', category: 'Desserts', salesCount: 80, active: true },
        { id: '4', name: 'Starter Wings', category: 'Starters', salesCount: 45, active: true },
        { id: '5', name: 'Starter Spring Roll', category: 'Starters', salesCount: 5, active: true },
      ];

      const result = sortAndFilterMenuItems(multiCatItems, {
        category: 'Starters',
        sortBySales: true,
      });

      expect(result.map(i => i.id)).toEqual(['4', '1', '5']);
    });

    it('keeps pinned items on top within category while sorting remaining by sales', () => {
      const multiCatItems = [
        { id: '1', name: 'Starter Soup', category: 'Starters', salesCount: 15, active: true },
        { id: '4', name: 'Starter Wings', category: 'Starters', salesCount: 45, active: true },
        { id: '5', name: 'Starter Spring Roll', category: 'Starters', salesCount: 5, active: true },
      ];

      // Pin the lowest-selling Spring Roll
      const result = sortAndFilterMenuItems(multiCatItems, {
        category: 'Starters',
        pinnedItemIds: ['5'],
        sortBySales: true,
      });

      expect(result[0].id).toBe('5'); // Pinned Spring Roll on top
      expect(result[1].id).toBe('4'); // 45 sales
      expect(result[2].id).toBe('1'); // 15 sales
    });
  });

  describe('High-Margin Suggestion Strategy (computeHighMarginItems)', () => {
    const dishes = [
      { id: '1', name: 'Truffle Pasta', price: 400, costPrice: 120 }, // 70% margin
      { id: '2', name: 'Plain Rice', price: 80, costPrice: 60 },      // 25% margin
      { id: '3', name: 'House Cocktail', price: 350, cost: 90 },       // 74% margin
      { id: '4', name: 'Chef Special Dessert', price: 200, chefSpecial: true }, // tagged special
    ];

    it('identifies items with margin >= 40% and chef specials', () => {
      const highMargin = computeHighMarginItems(dishes);
      const names = highMargin.map(h => h.name);

      expect(names).toContain('Truffle Pasta');
      expect(names).toContain('House Cocktail');
      expect(names).toContain('Chef Special Dessert');
      expect(names).not.toContain('Plain Rice'); // 25% margin excluded
    });
  });

  describe('Settings Schema & Public API Whitelist', () => {
    it('defines qrMenu default configuration block in SEEDS.settings', () => {
      const qrConfig = SEEDS.settings.qrMenu;
      expect(qrConfig).toBeDefined();
      expect(qrConfig.syncTimings).toBe(true);
      expect(qrConfig.sortBySales).toBe(false);
      expect(Array.isArray(qrConfig.pinnedItemIds)).toBe(true);
      expect(Array.isArray(qrConfig.hiddenItemIds)).toBe(true);
      expect(qrConfig.aiPromoteHighMargin).toBe(true);
      expect(typeof qrConfig.closedMessage).toBe('string');
      expect(qrConfig.pinnedTagLabel).toBe("Pinned");
      expect(qrConfig.chefsPickTagLabel).toBe("Chef's Pick");
      expect(qrConfig.mostOrderedTagLabel).toBe("Most Ordered");
      expect(Array.isArray(qrConfig.chefsPickItemIds)).toBe(true);
      expect(Array.isArray(qrConfig.mostOrderedItemIds)).toBe(true);
      expect(typeof qrConfig.itemCustomTags).toBe('object');
      expect(qrConfig.showTrending).toBe(true);
      expect(qrConfig.trendingTitle).toBe("Trending Hits");
      expect(Array.isArray(qrConfig.trendingItemIds)).toBe(true);
      expect(qrConfig.showStaffService).toBe(true);
      expect(qrConfig.aiButtonText).toBe("Ask AI Copilot");
      expect(qrConfig.aiButtonColor).toBe("#7c3aed");
    });
  });

  describe('Supabase Egress Optimizations', () => {
    it('ensures FLEX_COLLECTIONS excludes kds_tickets_archive to prevent historical bloat on sync', async () => {
      const { FLEX_COLLECTIONS } = await import('../shared/seeds.js');
      expect(FLEX_COLLECTIONS).not.toContain('kds_tickets_archive');
    });

    it('exports invalidateItemSalesCache for cache eviction on order submission', async () => {
      const { invalidateItemSalesCache } = await import('../api/public.js');
      expect(typeof invalidateItemSalesCache).toBe('function');
      expect(() => invalidateItemSalesCache('Kiko Cafe')).not.toThrow();
      expect(() => invalidateItemSalesCache(null)).not.toThrow();
    }, 15000);

    it('exports recordItemSales and updates sales counts incrementally without invalidation', async () => {
      const { recordItemSales } = await import('../api/public.js');
      expect(typeof recordItemSales).toBe('function');
      expect(() => recordItemSales('Kiko Cafe', [{ id: 'item_1', qty: 2 }])).not.toThrow();
    });

    it('caches and invalidates static QR menu data (menu, settings, floor plans) to prevent DB hammering', async () => {
      const { getQrStaticCache, setQrStaticCache, invalidateQrStaticCache } = await import('../api/_lib/core.js');
      expect(typeof getQrStaticCache).toBe('function');
      expect(typeof setQrStaticCache).toBe('function');
      expect(typeof invalidateQrStaticCache).toBe('function');

      const dummy = { menuRows: [{ id: 'm1' }], settingsRows: [], floorPlans: {}, modifiers: [] };
      setQrStaticCache('Kiko Cafe', dummy);
      expect(getQrStaticCache('Kiko Cafe')).toEqual(dummy);
      expect(getQrStaticCache('kiko cafe')).toEqual(dummy);

      invalidateQrStaticCache('Kiko Cafe');
      expect(getQrStaticCache('Kiko Cafe')).toBeNull();
    });

    it('bounds live orders window to 2 days and 200 orders to avoid full-history sync egress', async () => {
      const { ORDERS_WINDOW_DAYS, ORDERS_WINDOW_LIMIT } = await import('../api/_lib/core.js');
      expect(ORDERS_WINDOW_DAYS).toBeLessThanOrEqual(2);
      expect(ORDERS_WINDOW_LIMIT).toBeLessThanOrEqual(200);
    });
  });
});
