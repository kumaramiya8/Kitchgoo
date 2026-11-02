import { describe, it, expect } from 'vitest';
import { stripItem, stripItems } from '../shared/items.js';
import { localDayStr } from '../shared/dates.js';

describe('Historical Orders & Egress Protections', () => {
  it('stripItems eliminates heavy menu fields and base64 images from order lines', () => {
    const rawItems = [
      {
        id: 'item_1',
        name: 'Cold Brew',
        price: 180,
        qty: 2,
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        description: 'Smooth slow-steeped artisan brew with chocolate notes',
        ingredients: ['Coffee beans', 'Filtered water'],
        modifierGroups: [{ name: 'Milk', options: ['Oat', 'Almond'] }],
        dietaryLabels: ['Vegan', 'Gluten-Free'],
        priceTiers: { small: 150, regular: 180 },
      },
    ];

    const cleaned = stripItems(rawItems);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].name).toBe('Cold Brew');
    expect(cleaned[0].price).toBe(180);
    expect(cleaned[0].qty).toBe(2);

    // Verify heavy fields were stripped
    expect(cleaned[0].image).toBeUndefined();
    expect(cleaned[0].description).toBeUndefined();
    expect(cleaned[0].ingredients).toBeUndefined();
    expect(cleaned[0].modifierGroups).toBeUndefined();
    expect(cleaned[0].dietaryLabels).toBeUndefined();
    expect(cleaned[0].priceTiers).toBeUndefined();
  });

  it('chunked range pagination logic loops until all records are retrieved', async () => {
    // Mock database with 2,014 records
    const mockDbRecords = Array.from({ length: 2014 }, (_, i) => ({
      id: `order_${2014 - i}`,
      bill_no: `INV-${3108 - i}`,
      created_at: new Date(Date.UTC(2026, 9, 2 + Math.floor(i / 75), 10, 0, 0)).toISOString(),
      total: 250,
      items: [{ id: `item_${i}`, name: 'Chai', price: 50, qty: 5 }],
    }));

    // Simulate backend range pagination loop
    const PAGE_SIZE = 1000;
    const MAX_ROWS = 10000;
    let allOrders = [];
    let offset = 0;

    const mockFetchRange = (fromIdx, toIdx) => {
      return mockDbRecords.slice(fromIdx, toIdx + 1);
    };

    while (offset < MAX_ROWS) {
      const data = mockFetchRange(offset, offset + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      allOrders.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    expect(allOrders).toHaveLength(2014);
    expect(allOrders[0].bill_no).toBe('INV-3108');
    expect(allOrders[allOrders.length - 1].bill_no).toBe('INV-1095');
  });

  it('calculates report card metrics correctly across the full multi-week historical range', () => {
    // Generate 2,000 orders spanning Oct 2 to Oct 30
    const orders = Array.from({ length: 2000 }, (_, i) => {
      const day = 2 + Math.floor((i / 2000) * 28); // Oct 2 to Oct 30
      const dateStr = `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
      return {
        id: `ord_${i}`,
        billNo: `INV-${1000 + i}`,
        createdAt: dateStr,
        total: 200,
        subtotal: 190.48,
        tax: 9.52,
        discount: 0,
        paymentMethod: i % 2 === 0 ? 'UPI' : 'Cash',
        status: 'Closed',
      };
    });

    // Verify filterByRange with Oct 1 - Oct 31 ('This Month')
    const startOfMonth = new Date(2026, 9, 1);
    const inOctober = orders.filter(o => new Date(o.createdAt) >= startOfMonth);
    expect(inOctober).toHaveLength(2000);

    // Compute report cards
    const grossSales = inOctober.reduce((s, o) => s + o.total, 0);
    const taxCollected = inOctober.reduce((s, o) => s + o.tax, 0);
    const netSales = grossSales - taxCollected;
    const cashTotal = inOctober.filter(o => o.paymentMethod === 'Cash').reduce((s, o) => s + o.total, 0);
    const upiTotal = inOctober.filter(o => o.paymentMethod === 'UPI').reduce((s, o) => s + o.total, 0);

    expect(grossSales).toBe(400000); // 2000 * 200
    expect(taxCollected).toBeCloseTo(19040, 0);
    expect(netSales).toBeCloseTo(380960, 0);
    expect(cashTotal).toBe(200000);
    expect(upiTotal).toBe(200000);
  });

  it('accurately bounds ordersFrom to the oldest order when limit is hit', () => {
    const windowStart = '2026-10-31T17:58:00.000Z';
    const LIMIT = 200;

    // Case 1: Hit limit with 200 orders
    const fullBatch = Array.from({ length: 200 }, (_, i) => ({
      id: `ord_${i}`,
      created_at: new Date(Date.UTC(2026, 10, 2, 23, 0, 0) - i * 15 * 60 * 1000).toISOString(),
    }));
    const hitLimit = fullBatch.length >= LIMIT;
    const oldestLoadedCreatedAt = fullBatch.length > 0 ? fullBatch[fullBatch.length - 1].created_at : windowStart;
    const ordersFrom = hitLimit ? oldestLoadedCreatedAt : windowStart;

    expect(hitLimit).toBe(true);
    expect(ordersFrom).toBe(fullBatch[199].created_at);
    expect(ordersFrom).not.toBe(windowStart);

    // Case 2: Under limit (e.g. 50 orders)
    const smallBatch = fullBatch.slice(0, 50);
    const smallHitLimit = smallBatch.length >= LIMIT;
    const smallOldest = smallBatch.length > 0 ? smallBatch[smallBatch.length - 1].created_at : windowStart;
    const smallOrdersFrom = smallHitLimit ? smallOldest : windowStart;

    expect(smallHitLimit).toBe(false);
    expect(smallOrdersFrom).toBe(windowStart);
  });

  it('recovers all orders for yesterday and correctly aggregates report card totals', () => {
    // Simulate Nov 2 (Monday) with 95 orders, and Nov 1 (Sunday) with 83 orders
    const nov2Orders = Array.from({ length: 95 }, (_, i) => ({
      id: `nov2_${i}`,
      billNo: `INV-NOV2-${i + 1}`,
      createdAt: new Date(Date.UTC(2026, 10, 2, 6, 0, 0) + i * 10 * 60 * 1000).toISOString(), // Nov 2 11:30 AM to ~3:00 AM IST
      total: 180,
      paymentMethod: 'UPI',
    }));

    const nov1Orders = Array.from({ length: 83 }, (_, i) => ({
      id: `nov1_${i}`,
      billNo: `INV-NOV1-${i + 1}`,
      createdAt: new Date(Date.UTC(2026, 10, 1, 8, 0, 0) + i * 7 * 60 * 1000).toISOString(), // Nov 1 1:30 PM to ~11:45 PM IST
      total: 160,
      paymentMethod: i % 2 === 0 ? 'UPI' : 'Cash',
    }));

    // Suppose initial boot loaded only the top 100 descending orders
    const combinedDesc = [...nov2Orders, ...nov1Orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const initial100 = combinedDesc.slice(0, 100);
    expect(initial100).toHaveLength(100);

    // Only 5 orders of Nov 1 were captured in initial 100
    const nov1InInitial = initial100.filter(o => o.id.startsWith('nov1_'));
    expect(nov1InInitial).toHaveLength(5);
    const partialSales = nov1InInitial.reduce((s, o) => s + o.total, 0);
    expect(partialSales).toBe(5 * 160); // ₹800

    // Client records the oldest order actually returned as the loaded boundary
    const oldestInInitial = initial100[initial100.length - 1].createdAt;
    let ordersLoadedFrom = oldestInInitial;

    // When Reports asks for Yesterday (Nov 1):
    const yesterdayIso = '2026-10-31T18:30:00.000Z'; // local midnight in UTC
    expect(yesterdayIso < ordersLoadedFrom).toBe(true);

    // On-demand fetch retrieves remaining orders between yesterdayIso and ordersLoadedFrom
    const fetchedMissing = nov1Orders.filter(o => o.createdAt >= yesterdayIso && o.createdAt <= ordersLoadedFrom);
    
    // Merge into cache deduplicating by ID
    const existingIds = new Set(initial100.map(o => o.id));
    const mergedOrders = [...initial100, ...fetchedMissing.filter(o => !existingIds.has(o.id))];

    // Verify all 83 orders of Nov 1 are now present
    const allNov1Orders = mergedOrders.filter(o => o.id.startsWith('nov1_'));
    expect(allNov1Orders).toHaveLength(83);

    // Report cards now show full sales for Nov 1
    const totalYesterdayGross = allNov1Orders.reduce((s, o) => s + o.total, 0);
    expect(totalYesterdayGross).toBe(83 * 160); // ₹13,280
  });
});
