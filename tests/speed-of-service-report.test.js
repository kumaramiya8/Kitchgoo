import { describe, it, expect } from 'vitest';
import { localDayStr } from '../shared/dates.js';

// Reusable helpers matching Reports.jsx logic
function fmtMinSec(ms) {
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec === 0) return '< 1m';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function filterByRange(list, range, dateFrom, dateTo, key = 'createdAt') {
  const now = new Date();
  const today = localDayStr(now);
  return (list || []).filter(item => {
    if (!item) return false;
    const val = item[key] || item.createdAt || item.date || item.timestamp || item.timestamps?.ordered;
    if (!val) return false;
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    const day = localDayStr(val);
    switch (range) {
      case 'Today':     return day === today;
      case 'Yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return day === localDayStr(y);
      }
      case 'This Week': {
        const w = new Date(now);
        w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
        w.setHours(0, 0, 0, 0);
        return d >= w;
      }
      case 'This Month': {
        const m = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        return d >= m;
      }
      case 'This Quarter': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        const q = new Date(now.getFullYear(), qm, 1, 0, 0, 0, 0);
        return d >= q;
      }
      case 'Custom': {
        const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
        const to   = dateTo   ? new Date(dateTo + 'T23:59:59.999') : null;
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
      }
      default: return true;
    }
  });
}

function processServiceData(orders, kdsTickets = []) {
  const ticketsByOrderId = new Map();
  const ticketsByTableId = new Map();
  const ticketsByToken = new Map();

  (kdsTickets || []).forEach(ticket => {
    if (ticket.orderId) {
      if (!ticketsByOrderId.has(ticket.orderId)) ticketsByOrderId.set(ticket.orderId, []);
      ticketsByOrderId.get(ticket.orderId).push(ticket);
    }
    if (ticket.billNo) {
      if (!ticketsByOrderId.has(ticket.billNo)) ticketsByOrderId.set(ticket.billNo, []);
      ticketsByOrderId.get(ticket.billNo).push(ticket);
    }
    if (ticket.tableId !== undefined && ticket.tableId !== null) {
      const rawTid = String(ticket.tableId).trim();
      const bareTid = rawTid.replace(/^T-?|^tab_/i, '');
      [rawTid, bareTid, `T-${bareTid}`, `tab_${bareTid}`].forEach(k => {
        if (!ticketsByTableId.has(k)) ticketsByTableId.set(k, []);
        ticketsByTableId.get(k).push(ticket);
      });
    }
    if (ticket.tokenNumber !== undefined && ticket.tokenNumber !== null) {
      const tok = String(ticket.tokenNumber).trim();
      if (!ticketsByToken.has(tok)) ticketsByToken.set(tok, []);
      ticketsByToken.get(tok).push(ticket);
    }
  });

  return (orders || []).map(o => {
    // Resolve order creation timestamp (always prioritize actual order creation time: createdAt)
    const orderCreationIso = o.createdAt || o.date || o.timestamps?.ordered || o.orderPlacedAt || null;
    const orderCreatedTime = orderCreationIso ? new Date(orderCreationIso).getTime() : Date.now();

    const orderPaidIso = o.paidAt || o.closedAt || o.settledAt || o.timestamps?.paid || (o.status === 'paid' ? o.createdAt : null);
    const orderPaidTime = orderPaidIso ? new Date(orderPaidIso).getTime() : orderCreatedTime;
    const checkPaid = orderPaidIso ? new Date(orderPaidIso).getTime() : null;

    // Session validator: ticket must belong to this dining session
    // (within realistic 4-hour window of order creation/payment, rejecting stale cross-day tickets)
    const isTicketInSession = (t) => {
      const tTime = new Date(t.firedAt || t.createdAt).getTime();
      if (!tTime || isNaN(tTime)) return false;
      const refTime = orderPaidTime || orderCreatedTime;
      const diffMs = refTime - tTime;
      return diffMs >= -5 * 60 * 1000 && diffMs <= 4 * 60 * 60 * 1000;
    };

    let matchedTickets = [];
    if (ticketsByOrderId.has(o.id)) {
      matchedTickets = (ticketsByOrderId.get(o.id) || []).filter(isTicketInSession);
    } else if (o.billNo && ticketsByOrderId.has(o.billNo)) {
      matchedTickets = (ticketsByOrderId.get(o.billNo) || []).filter(isTicketInSession);
    } else if (o.kdsTicketId || (Array.isArray(o.kdsTicketIds) && o.kdsTicketIds.length > 0)) {
      const targetIds = new Set(Array.isArray(o.kdsTicketIds) ? o.kdsTicketIds : [o.kdsTicketId]);
      matchedTickets = (kdsTickets || []).filter(t => targetIds.has(t.id) && isTicketInSession(t));
    }

    if (matchedTickets.length === 0) {
      let candidates = [];
      if (o.tableId !== undefined && o.tableId !== null) {
        const rawId = String(o.tableId);
        candidates = ticketsByTableId.get(rawId) || [];
      } else if (o.tokenNumber) {
        candidates = ticketsByToken.get(String(o.tokenNumber)) || [];
      }

      if (candidates.length > 0) {
        const validCandidates = candidates.filter(isTicketInSession);
        validCandidates.sort((a, b) => new Date(b.firedAt || b.createdAt) - new Date(a.firedAt || a.createdAt));
        matchedTickets = validCandidates;
      }
    }

    let ticketPrintedTime = null;
    if (matchedTickets.length > 0) {
      const ticketTimes = matchedTickets.map(t => new Date(t.firedAt || t.createdAt).getTime()).filter(Boolean);
      if (ticketTimes.length > 0) ticketPrintedTime = Math.min(...ticketTimes);
    }
    if (!ticketPrintedTime && o.timestamps?.ticketPrinted) {
      const t = new Date(o.timestamps.ticketPrinted).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) ticketPrintedTime = t;
    }
    if (!ticketPrintedTime && o.ticketPrintedAt) {
      const t = new Date(o.ticketPrintedAt).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) ticketPrintedTime = t;
    }

    let foodBumpedTime = null;
    if (matchedTickets.length > 0) {
      const bumpTimes = [];
      matchedTickets.forEach(t => {
        if (t.bumpedAt) bumpTimes.push(new Date(t.bumpedAt).getTime());
        else if (t.completedAt) bumpTimes.push(new Date(t.completedAt).getTime());
        else {
          const itemBumps = (t.items || []).map(i => i.bumpedAt ? new Date(i.bumpedAt).getTime() : 0).filter(Boolean);
          if (itemBumps.length > 0) bumpTimes.push(Math.max(...itemBumps));
          else if (t.status === 'completed' && t.updatedAt) bumpTimes.push(new Date(t.updatedAt).getTime());
        }
      });
      if (bumpTimes.length > 0) foodBumpedTime = Math.max(...bumpTimes);
    }
    if (!foodBumpedTime && o.timestamps?.foodBumped) {
      const t = new Date(o.timestamps.foodBumped).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) foodBumpedTime = t;
    }
    if (!foodBumpedTime && o.foodBumpedAt) {
      const t = new Date(o.foodBumpedAt).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) foodBumpedTime = t;
    }

    // Discard anomalous bump times (bumped > 3 hours after firing is an abandoned ticket cleanup)
    if (foodBumpedTime && ticketPrintedTime && (foodBumpedTime - ticketPrintedTime > 3 * 60 * 60 * 1000)) {
      foodBumpedTime = null;
    }

    // Resolve orderPlaced: ALWAYS use the order's actual creation time (createdAt)
    let orderPlacedTime = orderCreatedTime;

    if (o.orderPlacedAt) {
      const t = new Date(o.orderPlacedAt).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) orderPlacedTime = t;
    } else if (o.timestamps?.ordered) {
      const t = new Date(o.timestamps.ordered).getTime();
      if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) orderPlacedTime = t;
    }

    if (ticketPrintedTime && (!orderPlacedTime || orderPlacedTime >= checkPaid || orderPlacedTime > ticketPrintedTime)) {
      orderPlacedTime = ticketPrintedTime;
    }
    if (!ticketPrintedTime && orderPlacedTime) {
      ticketPrintedTime = orderPlacedTime;
    }

    const orderToTicket = (ticketPrintedTime && orderPlacedTime && ticketPrintedTime >= orderPlacedTime)
      ? ticketPrintedTime - orderPlacedTime
      : 0;

    const ticketToFood = (foodBumpedTime && ticketPrintedTime && foodBumpedTime >= ticketPrintedTime)
      ? foodBumpedTime - ticketPrintedTime
      : null;

    const foodToPaid = (checkPaid && foodBumpedTime && checkPaid >= foodBumpedTime)
      ? checkPaid - foodBumpedTime
      : null;

    let totalTime = (checkPaid && orderPlacedTime && checkPaid >= orderPlacedTime)
      ? checkPaid - orderPlacedTime
      : null;

    if (totalTime === null && foodBumpedTime && orderPlacedTime && foodBumpedTime >= orderPlacedTime) {
      totalTime = foodBumpedTime - orderPlacedTime;
    }

    const tableDisplay = o.tableName
      ? o.tableName
      : (o.tableId ? `T-${o.tableId}` : (o.tokenNumber ? `Token #${o.tokenNumber}` : (o.orderType === 'takeout' ? 'Takeout' : (o.orderType === 'delivery' ? 'Delivery' : '—'))));

    return {
      id: o.billNo || o.id?.slice(0, 8),
      orderId: o.id,
      table: tableDisplay,
      orderPlaced: orderPlacedTime,
      ticketPrinted: ticketPrintedTime,
      foodBumped: foodBumpedTime,
      checkPaid,
      orderToTicket,
      ticketToFood,
      foodToPaid,
      totalTime,
    };
  }).filter(d => d.orderPlaced || d.checkPaid);
}

describe('Speed of Service Report & Period Filter', () => {
  describe('fmtMinSec formatting', () => {
    it('returns "—" for missing, NaN, or negative values', () => {
      expect(fmtMinSec(null)).toBe('—');
      expect(fmtMinSec(undefined)).toBe('—');
      expect(fmtMinSec(NaN)).toBe('—');
      expect(fmtMinSec(-100)).toBe('—');
    });

    it('returns "< 1m" for 0 or sub-minute times instead of blank dashes', () => {
      expect(fmtMinSec(0)).toBe('< 1m');
      expect(fmtMinSec(400)).toBe('< 1m');
    });

    it('formats seconds and minutes properly', () => {
      expect(fmtMinSec(45000)).toBe('45s');
      expect(fmtMinSec(150000)).toBe('2m 30s');
      expect(fmtMinSec(3600000)).toBe('60m 0s');
    });
  });

  describe('Period filtering (filterByRange)', () => {
    const todayNoon = new Date();
    todayNoon.setHours(12, 0, 0, 0);

    const yesterdayNoon = new Date();
    yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
    yesterdayNoon.setHours(12, 0, 0, 0);

    const yesterdayStr = localDayStr(yesterdayNoon);

    const sampleOrders = [
      { id: '1', billNo: 'INV-1001', createdAt: todayNoon.toISOString() },
      { id: '2', billNo: 'INV-1002', createdAt: yesterdayNoon.toISOString() },
      { id: '3', billNo: 'INV-1003', date: yesterdayNoon.toISOString() }, // Uses date fallback
      { id: '4', billNo: 'INV-1004', timestamps: { ordered: todayNoon.toISOString() } }, // Uses timestamps fallback
    ];

    it('correctly filters for Today', () => {
      const filtered = filterByRange(sampleOrders, 'Today');
      expect(filtered.map(o => o.id)).toEqual(['1', '4']);
    });

    it('correctly filters for Yesterday', () => {
      const filtered = filterByRange(sampleOrders, 'Yesterday');
      expect(filtered.map(o => o.id)).toEqual(['2', '3']);
    });

    it('correctly filters for Custom date range', () => {
      const filtered = filterByRange(sampleOrders, 'Custom', yesterdayStr, yesterdayStr);
      expect(filtered.map(o => o.id)).toEqual(['2', '3']);
    });
  });

  describe('Speed of Service Data Resolution', () => {
    it('accurately resolves Check Paid for settled orders even when paidAt was not explicitly set', () => {
      const orders = [
        {
          id: 'ord_1280',
          billNo: 'INV-KIK6Y-1280',
          tableId: 6,
          status: 'paid',
          createdAt: '2026-10-04T16:45:00.000Z',
          timestamps: {
            ordered: '2026-10-04T16:45:00.000Z',
            paid: '2026-10-04T16:45:00.000Z',
          },
        },
      ];

      const data = processServiceData(orders, []);
      expect(data).toHaveLength(1);
      expect(data[0].checkPaid).toBe(new Date('2026-10-04T16:45:00.000Z').getTime());
      expect(data[0].table).toBe('T-6');
      expect(data[0].totalTime).toBe(0);
      expect(fmtMinSec(data[0].totalTime)).toBe('< 1m');
    });

    it('matches KDS tickets by table ID within dining session and calculates kitchen & service times', () => {
      const orders = [
        {
          id: 'ord_table_6',
          billNo: 'INV-KIK6Y-1280',
          tableId: 6,
          status: 'paid',
          createdAt: '2026-10-04T16:45:00.000Z', // Bill paid at 16:45
          timestamps: {
            ordered: '2026-10-04T16:45:00.000Z',
            paid: '2026-10-04T16:45:00.000Z',
          },
        },
      ];

      const kdsTickets = [
        {
          id: 't_kds_99',
          orderId: 'T6-4821', // Different generated orderId
          tableId: 6,
          status: 'completed',
          firedAt: '2026-10-04T16:15:00.000Z', // KOT fired at 16:15 (30 mins before payment)
          createdAt: '2026-10-04T16:15:00.000Z',
          bumpedAt: '2026-10-04T16:30:00.000Z', // Food bumped at 16:30 (15 min cook time)
          completedAt: '2026-10-04T16:30:00.000Z',
        },
      ];

      const data = processServiceData(orders, kdsTickets);
      expect(data).toHaveLength(1);

      const d = data[0];
      expect(d.table).toBe('T-6');
      expect(d.orderPlaced).toBe(new Date('2026-10-04T16:15:00.000Z').getTime());
      expect(d.ticketPrinted).toBe(new Date('2026-10-04T16:15:00.000Z').getTime());
      expect(d.foodBumped).toBe(new Date('2026-10-04T16:30:00.000Z').getTime());
      expect(d.checkPaid).toBe(new Date('2026-10-04T16:45:00.000Z').getTime());

      // Durations:
      // Kitchen time: 16:30 - 16:15 = 15 mins (900,000 ms)
      expect(d.ticketToFood).toBe(15 * 60 * 1000);
      expect(fmtMinSec(d.ticketToFood)).toBe('15m 0s');

      // Food to paid: 16:45 - 16:30 = 15 mins (900,000 ms)
      expect(d.foodToPaid).toBe(15 * 60 * 1000);
      expect(fmtMinSec(d.foodToPaid)).toBe('15m 0s');

      // Total turnaround: 16:45 - 16:15 = 30 mins (1,800,000 ms)
      expect(d.totalTime).toBe(30 * 60 * 1000);
      expect(fmtMinSec(d.totalTime)).toBe('30m 0s');
    });

    it('matches token tabs for unassigned table dine-in orders', () => {
      const orders = [
        {
          id: 'ord_tok_7',
          billNo: 'INV-1055',
          tokenNumber: 7,
          status: 'paid',
          paidAt: '2026-10-04T14:30:00.000Z',
        },
      ];

      const kdsTickets = [
        {
          id: 'ticket_tok_7',
          orderId: 'TOK-7-9102',
          tokenNumber: '7',
          status: 'completed',
          firedAt: '2026-10-04T14:10:00.000Z',
          bumpedAt: '2026-10-04T14:22:00.000Z',
        },
      ];

      const data = processServiceData(orders, kdsTickets);
      expect(data).toHaveLength(1);
      expect(data[0].table).toBe('Token #7');
      expect(data[0].ticketToFood).toBe(12 * 60 * 1000);
      expect(data[0].foodToPaid).toBe(8 * 60 * 1000);
      expect(data[0].totalTime).toBe(20 * 60 * 1000);
    });

    it('extracts item-level bumpedAt timestamps if ticket-level bumpedAt is missing', () => {
      const orders = [
        {
          id: 'ord_item_bump',
          billNo: 'INV-1090',
          tableId: 3,
          status: 'paid',
          createdAt: '2026-10-04T15:00:00.000Z',
        },
      ];

      const kdsTickets = [
        {
          id: 'ticket_3',
          tableId: '3',
          firedAt: '2026-10-04T14:35:00.000Z',
          status: 'completed',
          items: [
            { name: 'Burger', status: 'bumped', bumpedAt: '2026-10-04T14:45:00.000Z' },
            { name: 'Fries', status: 'bumped', bumpedAt: '2026-10-04T14:48:00.000Z' },
          ],
        },
      ];

      const data = processServiceData(orders, kdsTickets);
      expect(data).toHaveLength(1);
      // Food bump should be latest bumped item (14:48)
      expect(data[0].foodBumped).toBe(new Date('2026-10-04T14:48:00.000Z').getTime());
      expect(data[0].ticketToFood).toBe(13 * 60 * 1000);
    });

    it('ignores stale multi-day seatedAt / orderPlacedAt from days ago and uses order actual createdAt', () => {
      // Simulates real user scenario: Order created today on Oct 6 at 16:14,
      // but table had stale seatedAt / orderPlacedAt from Oct 2 at 18:49.
      const orders = [
        {
          id: 'ord_stale_table_1',
          billNo: 'INV-KIK6Y-1366',
          tableId: 1,
          status: 'paid',
          createdAt: '2026-10-06T16:14:00.000Z', // Billed today
          paidAt: '2026-10-06T16:14:00.000Z',
          orderPlacedAt: '2026-10-02T18:49:00.000Z', // Stale timestamp from 4 days ago
          seatedAt: '2026-10-02T18:49:00.000Z', // Stale table seating from 4 days ago
        },
      ];

      // KDS ticket from Oct 2 (4 days ago)
      const staleKdsTickets = [
        {
          id: 'ticket_oct2_stale',
          tableId: 1,
          firedAt: '2026-10-02T18:49:00.000Z',
          bumpedAt: '2026-10-06T16:14:00.000Z', // Batch cleared 4 days later
          status: 'completed',
        },
      ];

      const data = processServiceData(orders, staleKdsTickets);
      expect(data).toHaveLength(1);
      const d = data[0];

      // OrderPlaced MUST be today (o.createdAt), NOT Oct 2nd!
      expect(d.orderPlaced).toBe(new Date('2026-10-06T16:14:00.000Z').getTime());
      // The 4-day-old ticket must NOT be matched to today's order
      expect(d.ticketPrinted).toBe(new Date('2026-10-06T16:14:00.000Z').getTime());
      // Food bump from 4 days ago is disregarded
      expect(d.foodBumped).toBeNull();
      // Total time should NOT be 93 hours (336,305s), but 0 (< 1m)
      expect(d.totalTime).toBe(0);
      expect(fmtMinSec(d.totalTime)).toBe('< 1m');
    });

    it('rejects stale KDS tickets older than 4 hours from current order even if matched by ID', () => {
      const orders = [
        {
          id: 'ord_today',
          billNo: 'INV-1426',
          tableId: 5,
          status: 'paid',
          createdAt: '2026-10-06T21:43:00.000Z',
          paidAt: '2026-10-06T21:43:00.000Z',
          kdsTicketIds: ['ticket_old_t5'],
        },
      ];

      const staleTickets = [
        {
          id: 'ticket_old_t5',
          tableId: 5,
          firedAt: '2026-10-02T19:09:00.000Z', // 4 days ago
          bumpedAt: '2026-10-06T21:26:00.000Z',
        },
      ];

      const data = processServiceData(orders, staleTickets);
      expect(data).toHaveLength(1);
      expect(data[0].orderPlaced).toBe(new Date('2026-10-06T21:43:00.000Z').getTime());
      expect(data[0].ticketPrinted).toBe(new Date('2026-10-06T21:43:00.000Z').getTime());
      expect(data[0].foodBumped).toBeNull();
      expect(data[0].totalTime).toBe(0);
    });

    it('discards anomalous bump times where cook duration exceeds 3 hours', () => {
      const orders = [
        {
          id: 'ord_abandoned_bump',
          billNo: 'INV-999',
          tableId: 2,
          status: 'paid',
          createdAt: '2026-10-06T20:00:00.000Z',
          paidAt: '2026-10-06T20:00:00.000Z',
        },
      ];

      const kdsTickets = [
        {
          id: 'ticket_abandoned',
          orderId: 'ord_abandoned_bump',
          firedAt: '2026-10-06T18:00:00.000Z',
          bumpedAt: '2026-10-06T23:30:00.000Z', // 5.5 hours later (abandoned ticket cleanup)
          status: 'completed',
        },
      ];

      const data = processServiceData(orders, kdsTickets);
      expect(data).toHaveLength(1);
      // Food bump is ignored because > 3 hours
      expect(data[0].foodBumped).toBeNull();
      expect(data[0].ticketToFood).toBeNull();
    });
  });

  describe('KDS Ticket-Level Speed of Service', () => {
    it('accurately calculates individual ticket cook duration for each KOT', () => {
      // User scenario:
      // Round 1: Table 1, 2 Tea, bumped after 3 minutes (180,000 ms)
      // Round 2: Table 1, 1 Pasta, bumped after 5 minutes (300,000 ms)
      const tickets = [
        {
          id: 'kot_1',
          orderId: 'T1-1001',
          tableId: 1,
          firedAt: '2026-10-06T10:00:00.000Z',
          bumpedAt: '2026-10-06T10:03:00.000Z',
          status: 'completed',
          items: [{ name: 'Tea', qty: 2, status: 'bumped', bumpedAt: '2026-10-06T10:03:00.000Z' }],
        },
        {
          id: 'kot_2',
          orderId: 'T1-1002',
          tableId: 1,
          firedAt: '2026-10-06T10:10:00.000Z',
          bumpedAt: '2026-10-06T10:15:00.000Z',
          status: 'completed',
          items: [{ name: 'Pasta', qty: 1, status: 'bumped', bumpedAt: '2026-10-06T10:15:00.000Z' }],
        },
      ];

      const results = processTicketSpeedData(tickets);
      expect(results).toHaveLength(2);

      // Ticket 1: 3m 0s
      expect(results[0].id).toBe('T1-1001');
      expect(results[0].prepMs).toBe(3 * 60 * 1000);
      expect(fmtMinSec(results[0].prepMs)).toBe('3m 0s');
      expect(results[0].itemsSummary).toBe('Tea x2');

      // Ticket 2: 5m 0s
      expect(results[1].id).toBe('T1-1002');
      expect(results[1].prepMs).toBe(5 * 60 * 1000);
      expect(fmtMinSec(results[1].prepMs)).toBe('5m 0s');
      expect(results[1].itemsSummary).toBe('Pasta');
    });

    it('flags unbumped active tickets with null prep time', () => {
      const tickets = [
        {
          id: 'kot_active',
          orderId: 'T2-2001',
          tableId: 2,
          firedAt: '2026-10-06T10:00:00.000Z',
          status: 'active',
          items: [{ name: 'Burger', qty: 1, status: 'active' }],
        },
      ];

      const results = processTicketSpeedData(tickets);
      expect(results).toHaveLength(1);
      expect(results[0].prepMs).toBeNull();
      expect(results[0].status).toBe('active');
    });
  });

  describe('Menu Item Preparation Time Report', () => {
    it('aggregates preparation duration by menu item and computes averages, min, and max', () => {
      const menu = [
        { name: 'Tea', category: 'Beverages' },
        { name: 'Pasta', category: 'Main Course' },
      ];

      const tickets = [
        {
          id: 'kot_1',
          orderId: 'T1-1001',
          firedAt: '2026-10-06T10:00:00.000Z',
          bumpedAt: '2026-10-06T10:03:00.000Z', // 3 minutes
          status: 'completed',
          items: [{ name: 'Tea', qty: 2, status: 'bumped', bumpedAt: '2026-10-06T10:03:00.000Z' }],
        },
        {
          id: 'kot_2',
          orderId: 'T1-1002',
          firedAt: '2026-10-06T10:10:00.000Z',
          bumpedAt: '2026-10-06T10:15:00.000Z', // 5 minutes
          status: 'completed',
          items: [{ name: 'Pasta', qty: 1, status: 'bumped', bumpedAt: '2026-10-06T10:15:00.000Z' }],
        },
        {
          id: 'kot_3',
          orderId: 'T2-1003',
          firedAt: '2026-10-06T10:20:00.000Z',
          bumpedAt: '2026-10-06T10:25:00.000Z', // 5 minutes for Tea
          status: 'completed',
          items: [{ name: 'Tea', qty: 1, status: 'bumped', bumpedAt: '2026-10-06T10:25:00.000Z' }],
        },
      ];

      const { aggregated, itemLogs } = processItemPrepData(tickets, menu);

      // Check item logs
      expect(itemLogs).toHaveLength(3);

      // Check aggregated metrics
      const tea = aggregated.find(i => i.name === 'Tea');
      expect(tea).toBeDefined();
      expect(tea.category).toBe('Beverages');
      expect(tea.totalQty).toBe(3); // 2 + 1
      expect(tea.bumpedQty).toBe(3);
      expect(tea.ticketCount).toBe(2);
      // Average prep for Tea: (3m + 5m) / 2 = 4m (240,000 ms)
      expect(tea.avgPrepMs).toBe(4 * 60 * 1000);
      expect(fmtMinSec(tea.avgPrepMs)).toBe('4m 0s');
      expect(tea.minPrepMs).toBe(3 * 60 * 1000);
      expect(tea.maxPrepMs).toBe(5 * 60 * 1000);

      const pasta = aggregated.find(i => i.name === 'Pasta');
      expect(pasta).toBeDefined();
      expect(pasta.category).toBe('Main Course');
      expect(pasta.totalQty).toBe(1);
      expect(pasta.avgPrepMs).toBe(5 * 60 * 1000);
      expect(fmtMinSec(pasta.avgPrepMs)).toBe('5m 0s');
    });
  });
});

function processTicketSpeedData(kdsTickets = []) {
  return (kdsTickets || []).map(t => {
    const firedIso = t.firedAt || t.createdAt;
    const firedMs = firedIso ? new Date(firedIso).getTime() : null;

    let bumpedMs = null;
    if (t.bumpedAt) bumpedMs = new Date(t.bumpedAt).getTime();
    else if (t.completedAt) bumpedMs = new Date(t.completedAt).getTime();
    else {
      const itemBumps = (t.items || []).map(i => i.bumpedAt ? new Date(i.bumpedAt).getTime() : 0).filter(Boolean);
      if (itemBumps.length > 0) bumpedMs = Math.max(...itemBumps);
      else if (t.status === 'completed' && t.updatedAt) bumpedMs = new Date(t.updatedAt).getTime();
    }

    let prepMs = null;
    if (firedMs && bumpedMs && bumpedMs >= firedMs) {
      const raw = bumpedMs - firedMs;
      if (raw <= 3 * 60 * 60 * 1000) prepMs = raw;
    }

    const itemsSummary = (t.items || []).map(i => `${i.name || 'Item'}${i.qty && i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ') || '—';
    const itemsCount = (t.items || []).reduce((s, i) => s + (i.qty || 1), 0);
    const status = bumpedMs ? 'completed' : (t.status || 'active');

    return {
      id: t.orderId || (t.id ? t.id.slice(0, 8) : '—'),
      ticketId: t.id,
      table: t.tableName || (t.tableId ? `T-${t.tableId}` : (t.tokenNumber ? `Token #${t.tokenNumber}` : '—')),
      itemsSummary,
      itemsCount,
      firedAt: firedMs,
      bumpedAt: bumpedMs,
      prepMs,
      status,
    };
  });
}

function processItemPrepData(kdsTickets = [], menu = []) {
  const itemMap = new Map();
  const itemLogs = [];

  (kdsTickets || []).forEach(t => {
    const ticketFired = t.firedAt || t.createdAt;
    const firedMs = ticketFired ? new Date(ticketFired).getTime() : null;
    if (!firedMs) return;

    (t.items || []).forEach((item, idx) => {
      const itemName = (item.name || 'Unnamed Item').trim();
      const qty = Number(item.qty || item.quantity || 1);

      let itemBumpedMs = null;
      if (item.bumpedAt) itemBumpedMs = new Date(item.bumpedAt).getTime();
      else if (item.status === 'bumped') {
        itemBumpedMs = t.bumpedAt ? new Date(t.bumpedAt).getTime() : (t.completedAt ? new Date(t.completedAt).getTime() : null);
      } else if (t.status === 'completed') {
        itemBumpedMs = t.bumpedAt ? new Date(t.bumpedAt).getTime() : (t.completedAt ? new Date(t.completedAt).getTime() : null);
      }

      let prepMs = null;
      if (firedMs && itemBumpedMs && itemBumpedMs >= firedMs) {
        const raw = itemBumpedMs - firedMs;
        if (raw <= 3 * 60 * 60 * 1000) prepMs = raw;
      }

      const menuItem = (menu || []).find(m => m.name?.toLowerCase() === itemName.toLowerCase());
      const category = menuItem?.category || item.category || 'General';

      itemLogs.push({
        id: `${t.id}-${idx}`,
        ticketId: t.orderId || t.id,
        name: itemName,
        category,
        qty,
        firedAt: firedMs,
        bumpedAt: itemBumpedMs,
        prepMs,
        status: itemBumpedMs ? 'bumped' : (item.status || 'active'),
      });

      if (!itemMap.has(itemName)) {
        itemMap.set(itemName, {
          name: itemName,
          category,
          totalQty: 0,
          bumpedQty: 0,
          ticketCount: 0,
          prepTimes: [],
        });
      }

      const entry = itemMap.get(itemName);
      entry.totalQty += qty;
      entry.ticketCount += 1;
      if (prepMs !== null) {
        entry.bumpedQty += qty;
        entry.prepTimes.push(prepMs);
      }
    });
  });

  const aggregated = Array.from(itemMap.values()).map(e => {
    const valid = e.prepTimes;
    const avgPrepMs = valid.length > 0 ? valid.reduce((s, x) => s + x, 0) / valid.length : null;
    const minPrepMs = valid.length > 0 ? Math.min(...valid) : null;
    const maxPrepMs = valid.length > 0 ? Math.max(...valid) : null;
    return {
      name: e.name,
      category: e.category,
      totalQty: e.totalQty,
      bumpedQty: e.bumpedQty,
      ticketCount: e.ticketCount,
      avgPrepMs,
      minPrepMs,
      maxPrepMs,
    };
  });

  return { aggregated, itemLogs };
}
