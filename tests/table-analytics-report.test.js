import { describe, it, expect } from 'vitest';
import { localDayStr } from '../shared/dates.js';

// Table Analytics computation matching TableAnalyticsTab in Reports.jsx
function computeTableAnalytics({
  orders = [],
  floorPlans = { tables: [] },
  posTables = [],
  kdsTickets = [],
  range = 'Today',
  dateFrom = '',
  dateTo = '',
  sectionFilter = 'All',
  capacityFilter = 'All',
  searchQuery = '',
}) {
  const now = new Date();
  const today = localDayStr(now);

  const filteredOrders = (orders || []).filter(item => {
    if (!item) return false;
    const val = item.createdAt || item.date || item.timestamp || item.timestamps?.ordered;
    if (!val) return false;
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    const day = localDayStr(val);
    switch (range) {
      case 'Today': return day === today;
      case 'Yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return day === localDayStr(y);
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

  // Index KDS tickets
  const byOrder = new Map();
  const byTable = new Map();
  (kdsTickets || []).forEach(ticket => {
    if (ticket.orderId) {
      if (!byOrder.has(ticket.orderId)) byOrder.set(ticket.orderId, []);
      byOrder.get(ticket.orderId).push(ticket);
    }
    if (ticket.tableId !== undefined && ticket.tableId !== null) {
      const rawTid = String(ticket.tableId).trim();
      const bareTid = rawTid.replace(/^T-?|^tab_/i, '');
      [rawTid, bareTid, `T-${bareTid}`, `tab_${bareTid}`].forEach(k => {
        if (!byTable.has(k)) byTable.set(k, []);
        byTable.get(k).push(ticket);
      });
    }
  });

  // Enrich orders
  const enrichedOrders = (filteredOrders || []).filter(o => {
    if (!o) return false;
    const type = (o.orderType || '').toLowerCase();
    return Boolean(o.tableId || o.tableName || type === 'dine-in');
  }).map(o => {
    const orderPaidIso = o.paidAt || o.closedAt || o.settledAt || o.timestamps?.paid || (o.status === 'paid' ? o.createdAt : null);
    const orderPaidTime = orderPaidIso ? new Date(orderPaidIso).getTime() : null;

    let matchedTickets = byOrder.get(o.id) || [];
    if (matchedTickets.length === 0 && o.tableId !== undefined) {
      matchedTickets = byTable.get(String(o.tableId)) || [];
    }

    let foodBumpedTime = null;
    if (matchedTickets.length > 0) {
      const bumpTimes = matchedTickets.map(t => t.bumpedAt ? new Date(t.bumpedAt).getTime() : 0).filter(Boolean);
      if (bumpTimes.length > 0) foodBumpedTime = Math.max(...bumpTimes);
    }
    if (!foodBumpedTime && o.foodBumpedAt) foodBumpedTime = new Date(o.foodBumpedAt).getTime();

    let placedTime = null;
    if (o.seatedAt) placedTime = new Date(o.seatedAt).getTime();
    else if (o.orderPlacedAt) placedTime = new Date(o.orderPlacedAt).getTime();
    else if (o.createdAt) placedTime = new Date(o.createdAt).getTime();

    let durationMs = null;
    if (orderPaidTime && placedTime && orderPaidTime >= placedTime) {
      durationMs = Math.max(60000, orderPaidTime - placedTime);
    } else if (foodBumpedTime && placedTime && foodBumpedTime >= placedTime) {
      durationMs = Math.max(60000, (foodBumpedTime - placedTime) + 15 * 60 * 1000);
    }

    let covers = Number(o.guestCount || o.covers || o.guests || 0);
    if (!covers || covers <= 0) {
      const itemCount = (o.items || []).reduce((s, it) => s + (it.quantity || 1), 0);
      covers = Math.max(1, Math.min(8, Math.ceil(itemCount / 2)));
    }

    return {
      ...o,
      placedTime,
      foodBumpedTime,
      paidTime: orderPaidTime,
      durationMs,
      covers,
      revenue: Number(o.total || 0),
    };
  });

  // Table map
  const tableMap = new Map();
  const addTable = (raw) => {
    if (!raw) return;
    const id = String(raw.id || raw.number || '').trim();
    if (!id) return;
    const num = raw.number || id;
    const numStr = String(num).replace(/^T-?|^Table\s*/i, '').trim();
    const key = numStr || id;
    if (!tableMap.has(key)) {
      tableMap.set(key, {
        id: raw.id || id,
        number: num,
        numStr,
        displayName: raw.name || (String(num).toLowerCase().startsWith('table') ? num : `Table ${num}`),
        seats: Number(raw.seats || raw.capacity || 4),
        section: raw.section || 'Main Dining',
      });
    }
  };

  (posTables || []).forEach(addTable);
  ((floorPlans && floorPlans.tables) || []).forEach(addTable);

  const tableList = Array.from(tableMap.values());

  const matchesOrderToTable = (o, t) => {
    const oTid = String(o.tableId || '').trim();
    const oTname = String(o.tableName || '').trim().toLowerCase();
    const tNumStr = String(t.numStr || '').trim();
    const tId = String(t.id || '').trim();
    const tName = String(t.displayName || '').trim().toLowerCase();

    if (oTid && (oTid === tId || oTid === tNumStr || oTid === `T-${tNumStr}` || oTid === `tab_${tId}`)) return true;
    if (oTname && (oTname === tName || oTname === `table ${tNumStr}`.toLowerCase() || oTname === tNumStr.toLowerCase())) return true;
    return false;
  };

  const totalOperatingHours = 12; // 1 day
  const totalOperatingMs = totalOperatingHours * 3600 * 1000;

  const tableAnalytics = tableList.map(t => {
    const ordersForTable = enrichedOrders.filter(o => matchesOrderToTable(o, t));
    const turns = ordersForTable.length;
    const totalRevenue = ordersForTable.reduce((s, o) => s + o.revenue, 0);
    const totalCovers = ordersForTable.reduce((s, o) => s + o.covers, 0);
    const avgPartySize = turns > 0 ? totalCovers / turns : 0;
    const avgCheck = turns > 0 ? totalRevenue / turns : 0;
    const avgSpendPerCover = totalCovers > 0 ? totalRevenue / totalCovers : 0;

    const validDurations = ordersForTable.map(o => o.durationMs).filter(d => d !== null && d > 0);
    const totalOccupiedMs = validDurations.reduce((s, d) => s + d, 0);
    const avgTurnTimeMs = validDurations.length > 0 ? totalOccupiedMs / validDurations.length : null;

    const occupancyRatePct = totalOperatingMs > 0 ? Math.min(100, (totalOccupiedMs / totalOperatingMs) * 100) : 0;
    const seatCapacity = t.seats || 4;
    const seatUtilizationPct = seatCapacity > 0 && turns > 0 ? Math.min(100, (avgPartySize / seatCapacity) * 100) : 0;

    const availableSeatHours = seatCapacity * totalOperatingHours;
    const revPash = availableSeatHours > 0 ? totalRevenue / availableSeatHours : 0;

    return {
      ...t,
      orders: ordersForTable,
      turns,
      totalRevenue,
      totalCovers,
      avgPartySize,
      avgCheck,
      avgSpendPerCover,
      totalOccupiedMs,
      avgTurnTimeMs,
      occupancyRatePct,
      seatCapacity,
      seatUtilizationPct,
      revPash,
    };
  });

  // Filter tables by section, capacity, search
  let filteredTableAnalytics = tableAnalytics;
  if (sectionFilter !== 'All') {
    filteredTableAnalytics = filteredTableAnalytics.filter(t => t.section === sectionFilter);
  }
  if (capacityFilter !== 'All') {
    const cap = parseInt(capacityFilter);
    if (capacityFilter === '8+') {
      filteredTableAnalytics = filteredTableAnalytics.filter(t => t.seatCapacity >= 8);
    } else if (!isNaN(cap)) {
      filteredTableAnalytics = filteredTableAnalytics.filter(t => t.seatCapacity === cap);
    }
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filteredTableAnalytics = filteredTableAnalytics.filter(t =>
      t.displayName.toLowerCase().includes(q) ||
      (t.section && t.section.toLowerCase().includes(q))
    );
  }

  // Summary KPIs for the Filtered Selection
  const totalTables = filteredTableAnalytics.length;
  const activeTables = filteredTableAnalytics.filter(t => t.turns > 0);
  const tableOccupancyPct = totalTables > 0 ? (activeTables.length / totalTables * 100) : 0;
  const totalRevenue = filteredTableAnalytics.reduce((s, t) => s + t.totalRevenue, 0);
  const totalTurns = filteredTableAnalytics.reduce((s, t) => s + t.turns, 0);

  const floorSummary = {
    totalTables,
    activeTableCount: activeTables.length,
    tableOccupancyPct,
    totalRevenue,
    totalTurns,
  };

  return { tableAnalytics, filteredTableAnalytics, floorSummary, enrichedOrders };
}

describe('Table Analytics & Occupancy Report', () => {
  const mockTables = [
    { id: '1', number: 1, seats: 4, section: 'Main Dining' },
    { id: '2', number: 2, seats: 2, section: 'Main Dining' },
    { id: '3', number: 3, seats: 6, section: 'Patio' },
    { id: '4', number: 4, seats: 4, section: 'Bar' },
  ];

  const nowIso = new Date().toISOString();

  it('aggregates table turns, revenue, and timing correctly', () => {
    const t1Seated = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const t1Paid = new Date().toISOString();

    const orders = [
      {
        id: 'ord-101',
        tableId: '1',
        tableName: 'Table 1',
        orderType: 'dine-in',
        seatedAt: t1Seated,
        paidAt: t1Paid,
        total: 1200,
        covers: 3,
        createdAt: nowIso,
      },
      {
        id: 'ord-102',
        tableId: '1',
        tableName: 'Table 1',
        orderType: 'dine-in',
        seatedAt: new Date(Date.now() - 100 * 60 * 1000).toISOString(),
        paidAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
        total: 1800,
        covers: 4,
        createdAt: nowIso,
      },
    ];

    const { tableAnalytics } = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Today',
    });

    const t1 = tableAnalytics.find(t => t.id === '1');
    expect(t1).toBeDefined();
    expect(t1.turns).toBe(2);
    expect(t1.totalRevenue).toBe(3000);
    expect(t1.avgCheck).toBe(1500);
    expect(t1.totalCovers).toBe(7);
    expect(t1.avgPartySize).toBe(3.5);
    expect(t1.avgSpendPerCover).toBeCloseTo(3000 / 7, 1);
    expect(t1.totalOccupiedMs).toBeGreaterThan(0);
    expect(t1.avgTurnTimeMs).toBeGreaterThan(30 * 60 * 1000);
  });

  it('correctly reports idle tables with 0 turns and 0% occupancy', () => {
    const { tableAnalytics } = computeTableAnalytics({
      posTables: mockTables,
      orders: [],
      range: 'Today',
    });

    expect(tableAnalytics.length).toBe(4);
    tableAnalytics.forEach(t => {
      expect(t.turns).toBe(0);
      expect(t.totalRevenue).toBe(0);
      expect(t.totalOccupiedMs).toBe(0);
      expect(t.avgTurnTimeMs).toBeNull();
      expect(t.occupancyRatePct).toBe(0);
      expect(t.revPash).toBe(0);
    });
  });

  it('calculates RevPASH (Revenue Per Available Seat-Hour) correctly', () => {
    // Table 2 has 2 seats, operating hours = 12h -> available seat hours = 24 seat-hours
    // If total sales = 2400 -> RevPASH = 2400 / 24 = 100
    const orders = [
      {
        id: 'ord-201',
        tableId: '2',
        tableName: 'Table 2',
        orderType: 'dine-in',
        seatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        paidAt: new Date().toISOString(),
        total: 2400,
        covers: 2,
        createdAt: nowIso,
      },
    ];

    const { tableAnalytics } = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Today',
    });

    const t2 = tableAnalytics.find(t => t.id === '2');
    expect(t2.totalRevenue).toBe(2400);
    expect(t2.revPash).toBe(100);
  });

  it('calculates Seat Efficiency % based on party size vs table capacity', () => {
    // Table 3 has 6 seats, party size is 3 -> seat utilization = 50%
    const orders = [
      {
        id: 'ord-301',
        tableId: '3',
        tableName: 'Table 3',
        orderType: 'dine-in',
        seatedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
        paidAt: new Date().toISOString(),
        total: 3500,
        covers: 3,
        createdAt: nowIso,
      },
    ];

    const { tableAnalytics } = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Today',
    });

    const t3 = tableAnalytics.find(t => t.id === '3');
    expect(t3.seatCapacity).toBe(6);
    expect(t3.avgPartySize).toBe(3);
    expect(t3.seatUtilizationPct).toBe(50);
  });

  it('matches orders with various table naming conventions (T-1, tab_1, Table 1)', () => {
    const orders = [
      { id: 'o-1', tableId: 'T-1', orderType: 'dine-in', total: 500, createdAt: nowIso },
      { id: 'o-2', tableId: 'tab_2', orderType: 'dine-in', total: 600, createdAt: nowIso },
      { id: 'o-3', tableName: 'Table 3', orderType: 'dine-in', total: 700, createdAt: nowIso },
    ];

    const { tableAnalytics } = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Today',
    });

    const t1 = tableAnalytics.find(t => t.id === '1');
    const t2 = tableAnalytics.find(t => t.id === '2');
    const t3 = tableAnalytics.find(t => t.id === '3');

    expect(t1.turns).toBe(1);
    expect(t1.totalRevenue).toBe(500);

    expect(t2.turns).toBe(1);
    expect(t2.totalRevenue).toBe(600);

    expect(t3.turns).toBe(1);
    expect(t3.totalRevenue).toBe(700);
  });

  it('updates table occupancy rate and summary metrics when section filter is changed', () => {
    // 2 tables in Main Dining (Table 1, Table 2)
    // 1 table in Patio (Table 3)
    // 1 table in Bar (Table 4)
    // Orders on Table 1 and Table 3
    const orders = [
      { id: 'o-1', tableId: '1', orderType: 'dine-in', total: 1000, createdAt: nowIso },
      { id: 'o-3', tableId: '3', orderType: 'dine-in', total: 1500, createdAt: nowIso },
    ];

    // All sections: 2 active out of 4 tables -> 50%
    const all = computeTableAnalytics({
      posTables: mockTables,
      orders,
      sectionFilter: 'All',
    });
    expect(all.floorSummary.totalTables).toBe(4);
    expect(all.floorSummary.activeTableCount).toBe(2);
    expect(all.floorSummary.tableOccupancyPct).toBe(50);
    expect(all.floorSummary.totalRevenue).toBe(2500);

    // Filter by Patio: only Table 3 -> 1 active out of 1 table -> 100%
    const patio = computeTableAnalytics({
      posTables: mockTables,
      orders,
      sectionFilter: 'Patio',
    });
    expect(patio.floorSummary.totalTables).toBe(1);
    expect(patio.floorSummary.activeTableCount).toBe(1);
    expect(patio.floorSummary.tableOccupancyPct).toBe(100);
    expect(patio.floorSummary.totalRevenue).toBe(1500);

    // Filter by Bar: only Table 4 -> 0 active out of 1 table -> 0%
    const bar = computeTableAnalytics({
      posTables: mockTables,
      orders,
      sectionFilter: 'Bar',
    });
    expect(bar.floorSummary.totalTables).toBe(1);
    expect(bar.floorSummary.activeTableCount).toBe(0);
    expect(bar.floorSummary.tableOccupancyPct).toBe(0);
    expect(bar.floorSummary.totalRevenue).toBe(0);
  });

  it('updates table occupancy rate and summary metrics when capacity filter is changed', () => {
    // Orders on Table 2 (2 seats) and Table 3 (6 seats)
    const orders = [
      { id: 'o-2', tableId: '2', orderType: 'dine-in', total: 800, createdAt: nowIso },
      { id: 'o-3', tableId: '3', orderType: 'dine-in', total: 1200, createdAt: nowIso },
    ];

    // Filter by 2-tops: only Table 2 (2 seats) -> 1 active of 1 table -> 100%
    const twoTops = computeTableAnalytics({
      posTables: mockTables,
      orders,
      capacityFilter: '2',
    });
    expect(twoTops.floorSummary.totalTables).toBe(1);
    expect(twoTops.floorSummary.activeTableCount).toBe(1);
    expect(twoTops.floorSummary.tableOccupancyPct).toBe(100);

    // Filter by 4-tops: Table 1 and Table 4 -> 0 active of 2 tables -> 0%
    const fourTops = computeTableAnalytics({
      posTables: mockTables,
      orders,
      capacityFilter: '4',
    });
    expect(fourTops.floorSummary.totalTables).toBe(2);
    expect(fourTops.floorSummary.activeTableCount).toBe(0);
    expect(fourTops.floorSummary.tableOccupancyPct).toBe(0);
  });

  it('updates table occupancy when date range filter is changed', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    const orders = [
      { id: 'today-1', tableId: '1', orderType: 'dine-in', total: 900, createdAt: nowIso },
      { id: 'yesterday-1', tableId: '2', orderType: 'dine-in', total: 1100, createdAt: yesterdayIso },
    ];

    const todayReport = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Today',
    });
    expect(todayReport.floorSummary.activeTableCount).toBe(1);
    expect(todayReport.floorSummary.tableOccupancyPct).toBe(25);
    expect(todayReport.floorSummary.totalRevenue).toBe(900);

    const yesterdayReport = computeTableAnalytics({
      posTables: mockTables,
      orders,
      range: 'Yesterday',
    });
    expect(yesterdayReport.floorSummary.activeTableCount).toBe(1);
    expect(yesterdayReport.floorSummary.tableOccupancyPct).toBe(25);
    expect(yesterdayReport.floorSummary.totalRevenue).toBe(1100);
  });
});
