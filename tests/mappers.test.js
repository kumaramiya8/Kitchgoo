import { describe, it, expect } from 'vitest';
import {
  toSnakeCase,
  toCamelCase,
  sanitizeInsertPayload,
  sanitizeUpdatePayload,
} from '../shared/mappers.js';

describe('case mappers', () => {
  it('round-trips a typical order row', () => {
    const order = {
      id: 'x1',
      billNo: 'INV-1001',
      tableId: 3,
      taxRate: 5,
      serviceCharge: 0,
      paymentMethod: 'Cash',
      createdAt: '2026-07-09T00:05:00.000Z',
    };
    expect(toCamelCase(toSnakeCase(order))).toEqual(order);
  });

  it('maps sold86 to sold_86 and back', () => {
    expect(toSnakeCase({ sold86: true })).toEqual({ sold_86: true });
    expect(toCamelCase({ sold_86: true })).toEqual({ sold86: true });
  });

  it('leaves JSONB passthrough keys untouched', () => {
    const row = { items: [{ itemName: 'Chai', addOns: [{ extraShot: true }] }] };
    // Nested keys inside `items` must NOT be snake_cased — they are stored raw
    expect(toSnakeCase(row).items[0].itemName).toBe('Chai');
    expect(toSnakeCase(row).items[0].addOns[0].extraShot).toBe(true);
  });

  it('handles arrays and primitives', () => {
    expect(toSnakeCase([{ aB: 1 }])).toEqual([{ a_b: 1 }]);
    expect(toSnakeCase(null)).toBe(null);
    expect(toCamelCase(7)).toBe(7);
  });
});

describe('payload sanitizers', () => {
  it('drops unknown columns on insert', () => {
    const out = sanitizeInsertPayload('users', {
      id: 'u1', name: 'A', email: 'a@b.c', password: 'x',
      role: 'Owner', isImpersonated: true, restaurantName: 'Evil',
    });
    expect(out).not.toHaveProperty('is_impersonated');
    expect(out).not.toHaveProperty('restaurant_name');
    expect(out).toHaveProperty('email', 'a@b.c');
  });

  it('never allows id/accountId changes through updates', () => {
    const out = sanitizeUpdatePayload('menu', { id: 'evil', accountId: 'OtherTenant', price: 99 });
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('account_id');
    expect(out).toEqual({ price: 99 });
  });

  it('users update cannot move a user to another account', () => {
    const out = sanitizeUpdatePayload('users', { accountId: 'OtherTenant', name: 'B' });
    expect(out).toEqual({ name: 'B' });
  });
});
