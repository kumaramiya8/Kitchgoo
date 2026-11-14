import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateOrderRow, ensureGuestOrders } from '../src/db/database.js';
import { stripItems } from '../shared/items.js';

describe('Guest Order History & CRM On-Demand Fetching', () => {
  it('hydrateOrderRow hydrates guestPhone and customerPhone from timestamps if omitted', () => {
    const rawRow = {
      id: 'order_123',
      bill_no: 'INV-001',
      guest_id: 'guest_456',
      total: 350,
      timestamps: {
        guestPhone: '9876543210',
        customerPhone: '9876543210',
        ordered: '2026-11-10T10:00:00Z',
      },
    };

    const hydrated = hydrateOrderRow(rawRow);
    expect(hydrated.id).toBe('order_123');
    expect(hydrated.guestId).toBe('guest_456');
    expect(hydrated.guestPhone).toBe('9876543210');
    expect(hydrated.customerPhone).toBe('9876543210');
  });

  it('hydrateOrderRow preserves existing guestPhone and customerPhone', () => {
    const rawRow = {
      id: 'order_124',
      bill_no: 'INV-002',
      guest_id: 'guest_456',
      guest_phone: '9123456789',
      customer_phone: '9123456789',
      timestamps: {},
    };

    const hydrated = hydrateOrderRow(rawRow);
    expect(hydrated.guestPhone).toBe('9123456789');
    expect(hydrated.customerPhone).toBe('9123456789');
  });

  it('stripItems ensures minimal egress for on-demand guest orders', () => {
    const mockOrderItems = [
      {
        id: 'menu_1',
        name: 'Cappuccino',
        price: 120,
        qty: 2,
        image: 'data:image/jpeg;base64,verylongimagebytes...',
        ingredients: ['Espresso', 'Steamed Milk'],
        modifierGroups: [{ name: 'Sugar', options: ['None', 'Brown'] }],
      },
    ];

    const stripped = stripItems(mockOrderItems);
    expect(stripped).toHaveLength(1);
    expect(stripped[0].name).toBe('Cappuccino');
    expect(stripped[0].price).toBe(120);
    expect(stripped[0].qty).toBe(2);
    expect(stripped[0].image).toBeUndefined();
    expect(stripped[0].ingredients).toBeUndefined();
    expect(stripped[0].modifierGroups).toBeUndefined();
  });

  it('guest order filtering correctly matches both guestId and formatted phone numbers', () => {
    const selectedGuest = {
      id: 'guest_mamta_123',
      name: 'Mamta',
      phone: '+91 95556 04867',
    };

    const cleanPhone = (selectedGuest.phone || '').trim().replace(/\D/g, '');

    const orders = [
      // 1. Matches by guestId
      { id: 'o1', billNo: 'B1', guestId: 'guest_mamta_123', total: 100 },
      // 2. Matches by guestPhone
      { id: 'o2', billNo: 'B2', guestId: null, guestPhone: '9555604867', total: 200 },
      // 3. Matches by customerPhone with country code
      { id: 'o3', billNo: 'B3', guestId: null, customerPhone: '+919555604867', total: 150 },
      // 4. Belongs to someone else
      { id: 'o4', billNo: 'B4', guestId: 'guest_other', guestPhone: '9999999999', total: 300 },
    ];

    const matched = orders.filter(o => {
      if (o.guestId && o.guestId === selectedGuest.id) return true;
      if (cleanPhone && cleanPhone.length >= 7) {
        const oPhone = (o.guestPhone || o.customerPhone || '').replace(/\D/g, '');
        if (oPhone && (oPhone === cleanPhone || oPhone.endsWith(cleanPhone) || cleanPhone.endsWith(oPhone))) return true;
      }
      return false;
    });

    expect(matched).toHaveLength(3);
    expect(matched.map(o => o.id)).toEqual(['o1', 'o2', 'o3']);
  });
});
