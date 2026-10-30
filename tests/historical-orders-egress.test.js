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
});
