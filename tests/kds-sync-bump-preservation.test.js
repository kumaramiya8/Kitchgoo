import { describe, it, expect } from 'vitest';
import { mergeKDSTickets } from '../src/db/database.js';

describe('KDS sync & bump preservation (mergeKDSTickets)', () => {
  it('preserves locally bumped item when stale server snapshot arrives with status pending', () => {
    const bumpTime = new Date('2026-10-11T01:40:00.000Z').toISOString();
    const localTickets = [
      {
        id: 't_1',
        orderId: '101',
        status: 'active',
        items: [
          { name: 'Paneer Tikka', qty: 1, status: 'bumped', bumpedAt: bumpTime },
          { name: 'Butter Naan', qty: 2, status: 'pending' },
        ],
      },
    ];

    // Server snapshot from 3.5s background poll that predates the item bump
    const serverTickets = [
      {
        id: 't_1',
        orderId: '101',
        status: 'active',
        items: [
          { name: 'Paneer Tikka', qty: 1, status: 'pending' },
          { name: 'Butter Naan', qty: 2, status: 'pending' },
        ],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged).toHaveLength(1);
    expect(merged[0].items[0].status).toBe('bumped');
    expect(merged[0].items[0].bumpedAt).toBe(bumpTime);
    expect(merged[0].items[1].status).toBe('pending');
  });

  it('preserves completed ticket when stale server snapshot arrives with status active', () => {
    const bumpTime = new Date('2026-10-11T01:40:05.000Z').toISOString();
    const localTickets = [
      {
        id: 't_2',
        orderId: '102',
        status: 'completed',
        bumpedAt: bumpTime,
        completedAt: bumpTime,
        items: [
          { name: 'Dal Makhani', qty: 1, status: 'bumped', bumpedAt: bumpTime },
        ],
      },
    ];

    // Server returns the ticket still active
    const serverTickets = [
      {
        id: 't_2',
        orderId: '102',
        status: 'active',
        items: [
          { name: 'Dal Makhani', qty: 1, status: 'pending' },
        ],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].bumpedAt).toBe(bumpTime);
    expect(merged[0].items[0].status).toBe('bumped');
  });

  it('preserves cancelled ticket when server snapshot still has active', () => {
    const cancelTime = new Date('2026-10-11T01:40:10.000Z').toISOString();
    const localTickets = [
      {
        id: 't_3',
        orderId: '103',
        status: 'cancelled',
        cancelledAt: cancelTime,
        items: [{ name: 'Lassi', qty: 1 }],
      },
    ];

    const serverTickets = [
      {
        id: 't_3',
        orderId: '103',
        status: 'active',
        items: [{ name: 'Lassi', qty: 1 }],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged[0].status).toBe('cancelled');
  });

  it('allows ticket recall when server has newer updatedAt and status active', () => {
    const oldBumpTime = new Date('2026-10-11T01:30:00.000Z').toISOString();
    const recallTime = new Date('2026-10-11T01:35:00.000Z').toISOString();

    const localTickets = [
      {
        id: 't_4',
        orderId: '104',
        status: 'completed',
        bumpedAt: oldBumpTime,
        items: [{ name: 'Biryani', qty: 1, status: 'bumped', bumpedAt: oldBumpTime }],
      },
    ];

    // Another station or user explicitly recalled the ticket at a later time
    const serverTickets = [
      {
        id: 't_4',
        orderId: '104',
        status: 'active',
        bumpedAt: null,
        completedAt: null,
        updatedAt: recallTime,
        items: [{ name: 'Biryani', qty: 1, status: 'pending' }],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged[0].status).toBe('active');
    expect(merged[0].items[0].status).toBe('pending');
  });

  it('seamlessly incorporates new incoming tickets from POS or QR menu orders', () => {
    const localTickets = [
      {
        id: 't_1',
        orderId: '101',
        status: 'active',
        items: [{ name: 'Chai', qty: 2, status: 'pending' }],
      },
    ];

    const serverTickets = [
      {
        id: 't_1',
        orderId: '101',
        status: 'active',
        items: [{ name: 'Chai', qty: 2, status: 'pending' }],
      },
      {
        id: 't_new',
        orderId: '102',
        status: 'active',
        items: [{ name: 'Samosa', qty: 3, status: 'pending' }],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged).toHaveLength(2);
    expect(merged.find(t => t.id === 't_new')).toBeDefined();
    expect(merged.find(t => t.id === 't_new').items[0].name).toBe('Samosa');
  });

  it('preserves freshly created local tickets not yet reflected on the server', () => {
    const now = new Date().toISOString();
    const localTickets = [
      {
        id: 't_local_fresh',
        orderId: '105',
        status: 'active',
        createdAt: now,
        items: [{ name: 'Coffee', qty: 1 }],
      },
    ];

    // Server snapshot that has not received the fresh local ticket yet
    const serverTickets = [];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('t_local_fresh');
  });

  it('updates table and payment metadata from server while preserving item bump status', () => {
    const bumpTime = new Date('2026-10-11T01:40:00.000Z').toISOString();
    const localTickets = [
      {
        id: 't_meta',
        orderId: '106',
        tableId: '2',
        isPaid: false,
        items: [
          { name: 'Dosa', qty: 1, status: 'bumped', bumpedAt: bumpTime },
        ],
      },
    ];

    // Server updates table to Table 5 (shifted) and isPaid to true
    const serverTickets = [
      {
        id: 't_meta',
        orderId: '106',
        tableId: '5',
        tableShiftedFrom: '2',
        tableShiftedTo: '5',
        isPaid: true,
        items: [
          { name: 'Dosa', qty: 1, status: 'pending' },
        ],
      },
    ];

    const merged = mergeKDSTickets(localTickets, serverTickets);
    expect(merged).toHaveLength(1);
    expect(merged[0].tableId).toBe('5');
    expect(merged[0].isPaid).toBe(true);
    expect(merged[0].tableShiftedFrom).toBe('2');
    // Bump status preserved:
    expect(merged[0].items[0].status).toBe('bumped');
    expect(merged[0].items[0].bumpedAt).toBe(bumpTime);
  });
});
