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
    let matchedTickets = [];
    if (ticketsByOrderId.has(o.id)) {
      matchedTickets = ticketsByOrderId.get(o.id);
    } else if (o.billNo && ticketsByOrderId.has(o.billNo)) {
      matchedTickets = ticketsByOrderId.get(o.billNo);
    } else if (o.kdsTicketId || (Array.isArray(o.kdsTicketIds) && o.kdsTicketIds.length > 0)) {
      const targetIds = new Set(Array.isArray(o.kdsTicketIds) ? o.kdsTicketIds : [o.kdsTicketId]);
      matchedTickets = (kdsTickets || []).filter(t => targetIds.has(t.id));
    }

    const orderPaidIso = o.paidAt || o.closedAt || o.settledAt || o.timestamps?.paid || (o.status === 'paid' ? o.createdAt : null);
    const orderPaidTime = orderPaidIso ? new Date(orderPaidIso).getTime() : (o.createdAt ? new Date(o.createdAt).getTime() : Date.now());

    if (matchedTickets.length === 0) {
      let candidates = [];
      if (o.tableId !== undefined && o.tableId !== null) {
        const rawId = String(o.tableId);
        candidates = ticketsByTableId.get(rawId) || [];
      } else if (o.tokenNumber) {
        candidates = ticketsByToken.get(String(o.tokenNumber)) || [];
      }

      if (candidates.length > 0) {
        const validCandidates = candidates.filter(t => {
          const ticketTime = new Date(t.firedAt || t.createdAt).getTime();
          return ticketTime <= orderPaidTime + 5 * 60 * 1000 && ticketTime >= orderPaidTime - 6 * 60 * 60 * 1000;
        });
        validCandidates.sort((a, b) => new Date(b.firedAt || b.createdAt) - new Date(a.firedAt || a.createdAt));
        matchedTickets = validCandidates;
      }
    }

    const checkPaid = orderPaidIso ? new Date(orderPaidIso).getTime() : null;

    let ticketPrintedTime = null;
    if (matchedTickets.length > 0) {
      const ticketTimes = matchedTickets.map(t => new Date(t.firedAt || t.createdAt).getTime()).filter(Boolean);
      if (ticketTimes.length > 0) ticketPrintedTime = Math.min(...ticketTimes);
    }
    if (!ticketPrintedTime && o.timestamps?.ticketPrinted) {
      ticketPrintedTime = new Date(o.timestamps.ticketPrinted).getTime();
    }
    if (!ticketPrintedTime && o.ticketPrintedAt) {
      ticketPrintedTime = new Date(o.ticketPrintedAt).getTime();
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
      foodBumpedTime = new Date(o.timestamps.foodBumped).getTime();
    }
    if (!foodBumpedTime && o.foodBumpedAt) {
      foodBumpedTime = new Date(o.foodBumpedAt).getTime();
    }

    let orderPlacedTime = null;
    if (o.orderPlacedAt) orderPlacedTime = new Date(o.orderPlacedAt).getTime();
    else if (o.seatedAt) orderPlacedTime = new Date(o.seatedAt).getTime();
    else if (o.timestamps?.ordered) orderPlacedTime = new Date(o.timestamps.ordered).getTime();

    if (ticketPrintedTime && (!orderPlacedTime || orderPlacedTime >= checkPaid || orderPlacedTime > ticketPrintedTime)) {
      orderPlacedTime = ticketPrintedTime;
    }
    if (!orderPlacedTime && o.createdAt) {
      orderPlacedTime = new Date(o.createdAt).getTime();
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
  });
});
