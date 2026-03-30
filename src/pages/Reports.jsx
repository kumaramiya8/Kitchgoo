import React, { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Download, BarChart2, Package,
  Users, Grid, Filter, ChevronDown, Search, Calendar,
  ShoppingBag, CreditCard, IndianRupee, Clock, CheckCircle,
  AlertTriangle, XCircle, ArrowUpRight, Layers, FileText,
  Zap, Timer, ChefHat, PieChart, Activity, Eye, X,
  Printer, DollarSign, Gauge, LayoutDashboard, Receipt,
  Utensils, Boxes, Star, HelpCircle, Award, Target
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll } from '../db/database';

// ─── Helpers ────────────────────────────────────────────────

const fmt = (n) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const fmtNum = (n) => (n || 0).toLocaleString('en-IN');

const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDateTime = (iso) => iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—';

const fmtMinSec = (ms) => {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
};

const formatHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
};

const RANGES = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Quarter', 'Custom'];

function getDateRange(range, dateFrom, dateTo) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  switch (range) {
    case 'Today': return { start: today, end: today };
    case 'Yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split('T')[0];
      return { start: ys, end: ys };
    }
    case 'This Week': {
      const w = new Date(now); w.setDate(w.getDate() - 7);
      return { start: w.toISOString().split('T')[0], end: today };
    }
    case 'This Month': {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], end: today };
    }
    case 'This Quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qm, 1).toISOString().split('T')[0], end: today };
    }
    case 'Custom': return { start: dateFrom || today, end: dateTo || today };
    default: return { start: today, end: today };
  }
}

function filterByRange(list, range, dateFrom, dateTo, key = 'createdAt') {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  return list.filter(item => {
    const val = item[key];
    if (!val) return false;
    const d = new Date(val);
    switch (range) {
      case 'Today':     return val.startsWith(today);
      case 'Yesterday': {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return val.startsWith(y.toISOString().split('T')[0]);
      }
      case 'This Week': {
        const w = new Date(now); w.setDate(w.getDate() - 7);
        return d >= w;
      }
      case 'This Month': return d >= new Date(now.getFullYear(), now.getMonth(), 1);
      case 'This Quarter': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        return d >= new Date(now.getFullYear(), qm, 1);
      }
      case 'Custom': {
        const from = dateFrom ? new Date(dateFrom) : null;
        const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
      }
      default: return true;
    }
  });
}

// ─── Shared UI pieces ───────────────────────────────────────

const StatCard = ({ label, value, sub, color = '#7c3aed', icon: Icon }) => (
  <div className="stat-card" style={{ flex: 1 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ fontSize: '1.55rem', color }}>{value}</div>
        {sub && <div className="stat-change up" style={{ marginTop: 4 }}>{sub}</div>}
      </div>
      {Icon && (
        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      )}
    </div>
  </div>
);

const Bar = ({ pct, color }) => (
  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(226,232,240,0.5)', overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.5s' }} />
  </div>
);

const SectionTitle = ({ children }) => (
  <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{children}</h3>
);

const Badge = ({ label, color }) => (
  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: `${color}18`, color }}>{label}</span>
);

const TableWrap = ({ children, style }) => (
  <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid var(--border-subtle)', ...style }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>{children}</table>
  </div>
);

const Th = ({ children, right }) => (
  <th style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: 600, fontSize: '0.73rem', color: 'var(--text-muted)', background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{children}</th>
);

const Td = ({ children, right, bold, muted, style: extraStyle }) => (
  <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : 400, color: muted ? 'var(--text-muted)' : 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', ...extraStyle }}>{children}</td>
);

const TdSummary = ({ children, right, bold }) => (
  <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 800 : 700, color: 'var(--primary)', borderTop: '2px solid var(--primary)', background: 'rgba(124,58,237,0.04)', whiteSpace: 'nowrap', fontSize: '0.83rem' }}>{children}</td>
);

const FilterBar = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, padding: '12px 16px', background: 'rgba(248,250,252,0.8)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
    <Filter size={14} color="var(--text-muted)" />
    {children}
  </div>
);

const Select = ({ value, onChange, children, style }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'white', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer', ...style }}>
    {children}
  </select>
);

const DateInput = ({ value, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
    {label}
    <input type="date" value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'white', fontSize: '0.78rem', color: 'var(--text-primary)' }} />
  </label>
);

const ExportBtn = ({ onClick }) => (
  <button className="btn btn-secondary" onClick={onClick} style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
    <Download size={14} /> Export CSV
  </button>
);

function downloadCSV(filename, rows) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const COLORS = ['#7c3aed', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#14b8a6'];

const Empty = ({ text = 'No data for this period.' }) => (
  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
    <BarChart2 size={36} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
    <p style={{ fontSize: '0.85rem' }}>{text}</p>
  </div>
);

// ─── TIME RANGE PICKER ───────────────────────────────────────

const RangePicker = ({ range, setRange, dateFrom, setDateFrom, dateTo, setDateTo }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
    <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.6)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
      {RANGES.map(r => (
        <button key={r} onClick={() => setRange(r)}
          style={{
            padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
            background: range === r ? 'var(--primary)' : 'transparent',
            color: range === r ? 'white' : 'var(--text-muted)',
          }}>{r}</button>
      ))}
    </div>
    {range === 'Custom' && (
      <>
        <DateInput label="From" value={dateFrom} onChange={setDateFrom} />
        <DateInput label="To"   value={dateTo}   onChange={setDateTo} />
      </>
    )}
  </div>
);

// ─── Modal Component ─────────────────────────────────────────

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 18, padding: '24px 28px',
        maxWidth: wide ? 800 : 560, width: '92vw', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Gauge Component ─────────────────────────────────────────

const GaugeChart = ({ value, max = 100, label, color = '#7c3aed', size = 110 }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const r = (size - 12) / 2;
  const circ = Math.PI * r;
  const offset = circ - (circ * pct / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path d={`M 6 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none" stroke="rgba(226,232,240,0.6)" strokeWidth={10} strokeLinecap="round" />
        <path d={`M 6 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" fontSize="1.1rem" fontWeight="800" fill={color}>
          {fmtPct(value)}
        </text>
      </svg>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    </div>
  );
};


// =================================================================
// TAB 1 -- DASHBOARD
// =================================================================

const DashboardTab = ({ orders, inventory, staff, menu, kdsTickets, deliveryOrders, floorPlans, settings }) => {
  const [range, setRange]       = useState('Today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const todayOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return orders.filter(o => o.createdAt && o.createdAt.startsWith(today));
  }, [orders]);

  const liveGross = useMemo(() => todayOrders.reduce((s, o) => s + (o.total || 0), 0), [todayOrders]);
  const liveTax = useMemo(() => todayOrders.reduce((s, o) => s + (o.tax || 0) + (o.serviceCharge || 0), 0), [todayOrders]);
  const liveNet = liveGross - liveTax;

  const yesterdayGross = useMemo(() => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yd = y.toISOString().split('T')[0];
    return orders.filter(o => o.createdAt && o.createdAt.startsWith(yd)).reduce((s, o) => s + (o.total || 0), 0);
  }, [orders]);

  const trendPct = yesterdayGross > 0 ? ((liveGross - yesterdayGross) / yesterdayGross * 100) : 0;
  const trendUp = trendPct >= 0;

  const orderCount = filtered.length;
  const avgCheck = orderCount > 0 ? filtered.reduce((s, o) => s + (o.total || 0), 0) / orderCount : 0;

  const voidsComps = useMemo(() => {
    return filtered.reduce((s, o) => s + (o.voidAmount || 0) + (o.compAmount || 0), 0);
  }, [filtered]);

  // Top 5 selling items
  const topItems = useMemo(() => {
    const map = {};
    filtered.forEach(o => (o.items || []).forEach(i => {
      const k = i.name;
      if (!map[k]) map[k] = { name: k, qty: 0, revenue: 0 };
      map[k].qty += i.qty || 1;
      map[k].revenue += (i.price || 0) * (i.qty || 1);
    }));
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [filtered]);
  const topItemMax = topItems[0]?.qty || 1;

  // Revenue by order type
  const orderTypeBreakdown = useMemo(() => {
    const map = { 'Dine-in': 0, 'Takeout': 0, 'Delivery': 0 };
    filtered.forEach(o => {
      const type = o.orderType || (o.tableId ? 'Dine-in' : 'Takeout');
      map[type] = (map[type] || 0) + (o.total || 0);
    });
    (deliveryOrders || []).forEach(o => {
      if (o.createdAt) {
        const inRange = filterByRange([o], range, dateFrom, dateTo);
        if (inRange.length) map['Delivery'] += o.total || 0;
      }
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map).map(([type, rev], i) => ({
      type, rev, pct: Math.round((rev / total) * 100), color: COLORS[i]
    }));
  }, [filtered, deliveryOrders, range, dateFrom, dateTo]);

  // Hourly sales heatmap
  const hourlyHeat = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, revenue: 0 }));
    filtered.forEach(o => {
      if (o.createdAt) {
        const h = new Date(o.createdAt).getHours();
        hours[h].revenue += o.total || 0;
      }
    });
    const max = Math.max(...hours.map(h => h.revenue), 1);
    return hours.map(h => ({ ...h, intensity: h.revenue / max }));
  }, [filtered]);

  // Labor cost
  const attendance = useMemo(() => getAll('attendance'), []);
  const laborCost = useMemo(() => {
    const staffMap = {};
    staff.forEach(s => { staffMap[s.id] = s; });
    let totalPay = 0;
    const today = new Date().toISOString().split('T')[0];
    const sorted = [...attendance].filter(a => a.timestamp && a.timestamp.startsWith(today)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const byStaff = {};
    sorted.forEach(rec => {
      if (!byStaff[rec.staffId]) byStaff[rec.staffId] = { ins: [], outs: [] };
      if (rec.type === 'IN') byStaff[rec.staffId].ins.push(new Date(rec.timestamp));
      if (rec.type === 'OUT') byStaff[rec.staffId].outs.push(new Date(rec.timestamp));
    });
    Object.entries(byStaff).forEach(([id, { ins, outs }]) => {
      const pairs = Math.min(ins.length, outs.length);
      let hours = 0;
      for (let i = 0; i < pairs; i++) { hours += Math.max(0, outs[i] - ins[i]) / 3600000; }
      const member = staffMap[id];
      const hourlyRate = member?.salary ? member.salary / 30 / 8 : 0;
      totalPay += hours * hourlyRate;
    });
    return totalPay;
  }, [attendance, staff]);

  const laborPct = liveGross > 0 ? (laborCost / liveGross * 100) : 0;

  // Active tables
  const totalTables = (floorPlans?.tables || []).length || 20;
  const activeTables = useMemo(() => {
    const activeIds = new Set();
    todayOrders.forEach(o => { if (o.tableId && !o.closedAt) activeIds.add(o.tableId); });
    return activeIds.size;
  }, [todayOrders]);
  const occupancyRate = totalTables > 0 ? (activeTables / totalTables * 100) : 0;

  const handleExport = () => {
    const rows = [
      'Metric,Value',
      `Gross Sales,${liveGross.toFixed(2)}`,
      `Net Sales,${liveNet.toFixed(2)}`,
      `Order Count,${orderCount}`,
      `Avg Check,${avgCheck.toFixed(2)}`,
      `Voids/Comps,${voidsComps.toFixed(2)}`,
      `Labor Cost %,${laborPct.toFixed(1)}`,
      `Occupancy Rate %,${occupancyRate.toFixed(1)}`,
    ];
    downloadCSV('dashboard_summary.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      {/* Widget Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        {/* Live Sales */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>Live Sales</span>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IndianRupee size={16} color="var(--primary)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1 }}>{fmt(liveGross)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Net: {fmt(liveNet)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: '0.73rem', fontWeight: 700, color: trendUp ? 'var(--success)' : 'var(--danger)' }}>
            {trendUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}% vs yesterday
          </div>
        </div>

        {/* Order Count */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>Order Count</span>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingBag size={16} color="var(--accent-blue)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-blue)', lineHeight: 1.1 }}>{fmtNum(orderCount)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Avg check: {fmt(avgCheck)}</div>
        </div>

        {/* Voids/Comps */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>Voids / Comps</span>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={16} color="var(--danger)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)', lineHeight: 1.1 }}>{fmt(voidsComps)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {orderCount > 0 ? fmtPct(voidsComps / (filtered.reduce((s, o) => s + (o.total || 0), 0) || 1) * 100) : '0%'} of sales
          </div>
        </div>

        {/* Labor Cost Gauge */}
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <GaugeChart value={laborPct} max={100} label="Labor Cost %" color={laborPct > 35 ? '#ef4444' : laborPct > 25 ? '#f59e0b' : '#22c55e'} size={100} />
        </div>
      </div>

      {/* Second row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Top 5 Selling Items */}
        <div className="card">
          <SectionTitle>Top 5 Selling Items</SectionTitle>
          {topItems.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topItems.map((item, idx) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', width: 20 }}>{idx + 1}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <div style={{ flex: 1, height: 20, borderRadius: 6, background: 'rgba(226,232,240,0.4)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${(item.qty / topItemMax) * 100}%`, height: '100%', borderRadius: 6, background: `${COLORS[idx]}30`, position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, background: COLORS[idx], opacity: 0.7, borderRadius: 6 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 40, textAlign: 'right', flexShrink: 0 }}>{item.qty}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 60, textAlign: 'right', flexShrink: 0 }}>{fmt(item.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue by Order Type */}
        <div className="card">
          <SectionTitle>Revenue by Order Type</SectionTitle>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* Pie-like display */}
            <div style={{ width: 110, height: 110, borderRadius: '50%', position: 'relative', flexShrink: 0,
              background: `conic-gradient(${orderTypeBreakdown.map((t, i) => {
                const startPct = orderTypeBreakdown.slice(0, i).reduce((s, x) => s + x.pct, 0);
                return `${t.color} ${startPct}% ${startPct + t.pct}%`;
              }).join(', ')})` }}>
              <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>Order<br/>Types</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orderTypeBreakdown.map(t => (
                <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', flex: 1 }}>{t.type}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{fmt(t.rev)}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Third row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        {/* Hourly Sales Heatmap */}
        <div className="card">
          <SectionTitle>Hourly Sales Heatmap</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {hourlyHeat.map(h => {
              const intensity = h.intensity;
              const bg = intensity > 0.8 ? 'rgba(239,68,68,0.8)'
                       : intensity > 0.6 ? 'rgba(245,158,11,0.7)'
                       : intensity > 0.3 ? 'rgba(124,58,237,0.5)'
                       : intensity > 0 ? 'rgba(124,58,237,0.15)'
                       : 'rgba(226,232,240,0.3)';
              return (
                <div key={h.hour} title={`${formatHour(h.hour)}: ${fmt(h.revenue)}`}
                  style={{ aspectRatio: '1', borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', transition: 'background 0.3s' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, color: intensity > 0.5 ? 'white' : 'var(--text-muted)' }}>{formatHour(h.hour)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(124,58,237,0.15)' }} /> Low</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(124,58,237,0.5)' }} /> Medium</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.7)' }} /> Busy</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.8)' }} /> Peak</span>
          </div>
        </div>

        {/* Active Tables / Occupancy */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <SectionTitle>Table Occupancy</SectionTitle>
          <GaugeChart value={occupancyRate} max={100} label={`${activeTables} / ${totalTables} tables`} color={occupancyRate > 80 ? '#ef4444' : occupancyRate > 50 ? '#f59e0b' : '#22c55e'} size={130} />
        </div>
      </div>

      {/* Role-specific callout */}
      <div className="card" style={{ marginTop: 16, background: 'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(59,130,246,0.06) 100%)', border: '1px solid rgba(124,58,237,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} color="var(--primary)" />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>Manager Insight</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {laborPct > 30
                ? `Labor cost is at ${fmtPct(laborPct)} -- consider optimizing shift schedules.`
                : orderCount === 0
                ? 'No orders recorded for this period yet.'
                : trendUp
                ? `Sales trending up ${trendPct.toFixed(1)}% vs yesterday. Keep momentum going!`
                : `Sales are down ${Math.abs(trendPct).toFixed(1)}% vs yesterday. Review promotions or staffing.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// =================================================================
// TAB 2 -- SALES ACCRUAL REPORT
// =================================================================

const SalesReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [grouping, setGrouping] = useState('Daily');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const d = new Date(o.createdAt);
      let key;
      if (grouping === 'Daily') key = (o.createdAt || '').split('T')[0];
      else if (grouping === 'Weekly') {
        const start = new Date(d);
        start.setDate(start.getDate() - start.getDay());
        key = `W ${start.toISOString().split('T')[0]}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!map[key]) map[key] = { date: key, gross: 0, net: 0, compsVoids: 0, discounts: 0, tax: 0, tips: 0, serviceCharge: 0, total: 0 };
      const gross = o.total || 0;
      const tax = o.tax || 0;
      const sc = o.serviceCharge || 0;
      const tip = o.tip || 0;
      const disc = o.discount || 0;
      const cv = (o.voidAmount || 0) + (o.compAmount || 0);
      map[key].gross += gross;
      map[key].net += gross - tax - sc - tip;
      map[key].compsVoids += cv;
      map[key].discounts += disc;
      map[key].tax += tax;
      map[key].tips += tip;
      map[key].serviceCharge += sc;
      map[key].total += gross;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered, grouping]);

  const summary = useMemo(() => {
    return grouped.reduce((s, r) => ({
      gross: s.gross + r.gross,
      net: s.net + r.net,
      compsVoids: s.compsVoids + r.compsVoids,
      discounts: s.discounts + r.discounts,
      tax: s.tax + r.tax,
      tips: s.tips + r.tips,
      serviceCharge: s.serviceCharge + r.serviceCharge,
      total: s.total + r.total,
    }), { gross: 0, net: 0, compsVoids: 0, discounts: 0, tax: 0, tips: 0, serviceCharge: 0, total: 0 });
  }, [grouped]);

  const handleExport = () => {
    const rows = [
      'Date,Gross Sales,Net Sales,Comps/Voids,Discounts,Tax,Tips,Service Charge,Total Accrued',
      ...grouped.map(r =>
        `"${r.date}",${r.gross.toFixed(2)},${r.net.toFixed(2)},${r.compsVoids.toFixed(2)},${r.discounts.toFixed(2)},${r.tax.toFixed(2)},${r.tips.toFixed(2)},${r.serviceCharge.toFixed(2)},${r.total.toFixed(2)}`
      ),
    ];
    downloadCSV(`sales_accrual_${grouping.toLowerCase()}.csv`, rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Group by:</span>
        <Select value={grouping} onChange={setGrouping}>
          {['Daily', 'Weekly', 'Monthly'].map(g => <option key={g}>{g}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Gross Sales" value={fmt(summary.gross)} color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Net Sales" value={fmt(summary.net)} sub={`${summary.gross > 0 ? Math.round(summary.net / summary.gross * 100) : 0}% of gross`} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Tax Collected" value={fmt(summary.tax)} color="#f59e0b" icon={Receipt} />
        <StatCard label="Tips Collected" value={fmt(summary.tips)} color="#0ea5e9" icon={Award} />
      </div>

      <div className="card">
        <SectionTitle>Sales Accrual ({grouping})</SectionTitle>
        {grouped.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th><Th right>Gross Sales</Th><Th right>Net Sales</Th>
                <Th right>Comps/Voids</Th><Th right>Discounts</Th>
                <Th right>Taxes</Th><Th right>Tips</Th>
                <Th right>Service Charge</Th><Th right>Total Accrued</Th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(r => (
                <tr key={r.date}>
                  <Td bold>{r.date}</Td>
                  <Td right>{fmt(r.gross)}</Td>
                  <Td right>{fmt(r.net)}</Td>
                  <Td right muted>{fmt(r.compsVoids)}</Td>
                  <Td right muted>{fmt(r.discounts)}</Td>
                  <Td right>{fmt(r.tax)}</Td>
                  <Td right>{fmt(r.tips)}</Td>
                  <Td right muted>{fmt(r.serviceCharge)}</Td>
                  <Td right bold>{fmt(r.total)}</Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary right bold>{fmt(summary.gross)}</TdSummary>
                <TdSummary right bold>{fmt(summary.net)}</TdSummary>
                <TdSummary right>{fmt(summary.compsVoids)}</TdSummary>
                <TdSummary right>{fmt(summary.discounts)}</TdSummary>
                <TdSummary right bold>{fmt(summary.tax)}</TdSummary>
                <TdSummary right bold>{fmt(summary.tips)}</TdSummary>
                <TdSummary right>{fmt(summary.serviceCharge)}</TdSummary>
                <TdSummary right bold>{fmt(summary.total)}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};


// =================================================================
// TAB 3 -- TAX REPORT
// =================================================================

const TaxReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const taxData = useMemo(() => {
    const groups = {
      'Food GST': { taxable: 0, nonTaxable: 0, rate: 5, collected: 0, exemptions: 0 },
      'Beverage GST': { taxable: 0, nonTaxable: 0, rate: 12, collected: 0, exemptions: 0 },
      'Alcohol Tax': { taxable: 0, nonTaxable: 0, rate: 18, collected: 0, exemptions: 0 },
      'Takeout GST': { taxable: 0, nonTaxable: 0, rate: 5, collected: 0, exemptions: 0 },
    };

    filtered.forEach(o => {
      const isTakeout = !o.tableId || o.orderType === 'Takeout' || o.orderType === 'Delivery';
      (o.items || []).forEach(item => {
        const cat = (item.category || '').toLowerCase();
        const revenue = (item.price || 0) * (item.qty || 1);
        const isAlcohol = cat.includes('alcohol') || cat.includes('bar') || cat.includes('drink') || cat.includes('beer') || cat.includes('wine');
        const isBev = cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee') || cat.includes('tea');

        let groupKey;
        if (isAlcohol) groupKey = 'Alcohol Tax';
        else if (isTakeout) groupKey = 'Takeout GST';
        else if (isBev) groupKey = 'Beverage GST';
        else groupKey = 'Food GST';

        if (item.taxExempt) {
          groups[groupKey].nonTaxable += revenue;
          groups[groupKey].exemptions += revenue;
        } else {
          groups[groupKey].taxable += revenue;
          groups[groupKey].collected += revenue * (groups[groupKey].rate / 100);
        }
      });
    });

    return Object.entries(groups).map(([name, data]) => ({ name, ...data }));
  }, [filtered]);

  const totals = useMemo(() => {
    return taxData.reduce((s, t) => ({
      taxable: s.taxable + t.taxable,
      nonTaxable: s.nonTaxable + t.nonTaxable,
      collected: s.collected + t.collected,
      exemptions: s.exemptions + t.exemptions,
    }), { taxable: 0, nonTaxable: 0, collected: 0, exemptions: 0 });
  }, [taxData]);

  const effectiveRate = totals.taxable > 0 ? (totals.collected / totals.taxable * 100) : 0;

  const handleExport = () => {
    const rows = [
      'Tax Authority,Taxable Sales,Non-Taxable Sales,Tax Rate %,Tax Collected,Exemptions',
      ...taxData.map(t =>
        `"${t.name}",${t.taxable.toFixed(2)},${t.nonTaxable.toFixed(2)},${t.rate},${t.collected.toFixed(2)},${t.exemptions.toFixed(2)}`
      ),
    ];
    downloadCSV('tax_report.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Taxable" value={fmt(totals.taxable)} color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Tax Collected" value={fmt(totals.collected)} color="#22c55e" icon={Receipt} />
        <StatCard label="Effective Rate" value={fmtPct(effectiveRate)} color="#f59e0b" icon={Target} />
        <StatCard label="Exemptions" value={fmt(totals.exemptions)} color="#0ea5e9" icon={FileText} />
      </div>

      <div className="card">
        <SectionTitle>Tax Breakdown by Group</SectionTitle>
        {taxData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tax Authority / Name</Th><Th right>Taxable Sales</Th><Th right>Non-Taxable Sales</Th>
                <Th right>Tax Rate (%)</Th><Th right>Tax Collected</Th><Th right>Exemptions</Th>
              </tr>
            </thead>
            <tbody>
              {taxData.map(t => (
                <tr key={t.name}>
                  <Td bold>{t.name}</Td>
                  <Td right>{fmt(t.taxable)}</Td>
                  <Td right muted>{fmt(t.nonTaxable)}</Td>
                  <Td right>{t.rate}%</Td>
                  <Td right bold>{fmt(t.collected)}</Td>
                  <Td right muted>{fmt(t.exemptions)}</Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary right bold>{fmt(totals.taxable)}</TdSummary>
                <TdSummary right>{fmt(totals.nonTaxable)}</TdSummary>
                <TdSummary right bold>{fmtPct(effectiveRate)}</TdSummary>
                <TdSummary right bold>{fmt(totals.collected)}</TdSummary>
                <TdSummary right>{fmt(totals.exemptions)}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};


// =================================================================
// TAB 4 -- INVOICE DETAIL
// =================================================================

const InvoiceDetail = ({ orders, staff: staffList }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');
  const [payFilter, setPayFilter]     = useState('All');
  const [typeFilter, setTypeFilter]   = useState('All');
  const [serverFilter, setServerFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const filtered = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);
    if (payFilter !== 'All') arr = arr.filter(o => o.paymentMethod === payFilter);
    if (typeFilter !== 'All') arr = arr.filter(o => (o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')) === typeFilter);
    if (serverFilter !== 'All') arr = arr.filter(o => o.serverId === serverFilter || o.serverName === serverFilter);
    if (statusFilter !== 'All') arr = arr.filter(o => (o.status || 'Closed') === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(o =>
        (o.billNo || o.id || '').toLowerCase().includes(q) ||
        (o.serverName || '').toLowerCase().includes(q) ||
        (o.guestName || '').toLowerCase().includes(q) ||
        String(o.tableId || '').includes(q)
      );
    }
    return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, range, dateFrom, dateTo, payFilter, typeFilter, serverFilter, statusFilter, search]);

  const servers = useMemo(() => ['All', ...new Set(orders.map(o => o.serverName).filter(Boolean))], [orders]);

  const handleExport = () => {
    const rows = [
      'Invoice ID,Date/Time,Order Type,Table/Guest,Server,Subtotal,Discounts,Tax,Tip,Total,Payment Method,Status',
      ...filtered.map(o =>
        `"${o.billNo || o.id}","${fmtDateTime(o.createdAt)}","${o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')}","${o.tableId ? 'T-' + o.tableId : ''}${o.guestName ? ' ' + o.guestName : ''}","${o.serverName || ''}",${(o.subtotal || 0).toFixed(2)},${(o.discount || 0).toFixed(2)},${(o.tax || 0).toFixed(2)},${(o.tip || 0).toFixed(2)},${(o.total || 0).toFixed(2)},"${o.paymentMethod || ''}","${o.status || 'Closed'}"`
      ),
    ];
    downloadCSV('invoice_detail.csv', rows);
  };

  const handlePrintInvoice = (order) => {
    const w = window.open('', '_blank', 'width=400,height=600');
    const items = (order.items || []).map(i =>
      `<tr><td>${i.name}</td><td style="text-align:center">${i.qty || 1}</td><td style="text-align:right">₹${((i.price || 0) * (i.qty || 1)).toFixed(2)}</td></tr>`
    ).join('');
    w.document.write(`<html><head><title>Invoice ${order.billNo || order.id}</title>
      <style>body{font-family:monospace;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}td,th{padding:4px;border-bottom:1px dashed #ccc}h2{text-align:center}</style></head>
      <body><h2>Kitchgoo</h2><p>Invoice: ${order.billNo || order.id}<br/>Date: ${fmtDateTime(order.createdAt)}<br/>Table: ${order.tableId || 'N/A'}<br/>Server: ${order.serverName || 'N/A'}</p>
      <table><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr>${items}
      <tr><td colspan="2"><strong>Subtotal</strong></td><td style="text-align:right">₹${(order.subtotal || 0).toFixed(2)}</td></tr>
      <tr><td colspan="2">Tax</td><td style="text-align:right">₹${(order.tax || 0).toFixed(2)}</td></tr>
      ${order.tip ? `<tr><td colspan="2">Tip</td><td style="text-align:right">₹${(order.tip || 0).toFixed(2)}</td></tr>` : ''}
      ${order.serviceCharge ? `<tr><td colspan="2">Service Charge</td><td style="text-align:right">₹${(order.serviceCharge || 0).toFixed(2)}</td></tr>` : ''}
      <tr><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:right"><strong>₹${(order.total || 0).toFixed(2)}</strong></td></tr>
      </table><p style="text-align:center;margin-top:16px">Payment: ${order.paymentMethod || 'N/A'}<br/>Thank you!</p>
      <script>window.print();</script></body></html>`);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <Select value={payFilter} onChange={setPayFilter}>
          {['All', 'Cash', 'UPI', 'Card', 'Wallet'].map(p => <option key={p} value={p}>{p === 'All' ? 'Payment: All' : p}</option>)}
        </Select>
        <Select value={typeFilter} onChange={setTypeFilter}>
          {['All', 'Dine-in', 'Takeout', 'Delivery'].map(t => <option key={t} value={t}>{t === 'All' ? 'Type: All' : t}</option>)}
        </Select>
        <Select value={serverFilter} onChange={setServerFilter}>
          {servers.map(s => <option key={s} value={s}>{s === 'All' ? 'Server: All' : s}</option>)}
        </Select>
        <Select value={statusFilter} onChange={setStatusFilter}>
          {['All', 'Closed', 'Refunded', 'Voided'].map(s => <option key={s} value={s}>{s === 'All' ? 'Status: All' : s}</option>)}
        </Select>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 26, padding: '5px 8px 5px 24px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.78rem', width: 160, outline: 'none', background: 'white', color: 'var(--text-primary)' }} />
        </div>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div className="card">
        <SectionTitle>Invoice Audit Trail ({filtered.length} transactions)</SectionTitle>
        {filtered.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice ID</Th><Th>Date / Time</Th><Th>Type</Th><Th>Table / Guest</Th>
                <Th>Server</Th><Th right>Subtotal</Th><Th right>Disc.</Th><Th right>Tax</Th>
                <Th right>Tip</Th><Th right>Total</Th><Th>Payment</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(o => {
                const status = o.status || 'Closed';
                const statusColor = status === 'Closed' ? '#22c55e' : status === 'Refunded' ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                    <Td bold>{o.billNo || o.id?.slice(0, 8)}</Td>
                    <Td style={{ fontSize: '0.75rem' }}>{fmtDateTime(o.createdAt)}</Td>
                    <Td><Badge label={o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')} color="#7c3aed" /></Td>
                    <Td muted>{o.tableId ? `T-${o.tableId}` : ''}{o.guestName ? ` ${o.guestName}` : ''}</Td>
                    <Td muted>{o.serverName || '—'}</Td>
                    <Td right>{fmt(o.subtotal || 0)}</Td>
                    <Td right muted>{fmt(o.discount || 0)}</Td>
                    <Td right>{fmt(o.tax || 0)}</Td>
                    <Td right muted>{fmt(o.tip || 0)}</Td>
                    <Td right bold>{fmt(o.total || 0)}</Td>
                    <Td><Badge label={o.paymentMethod || '—'} color="#0ea5e9" /></Td>
                    <Td><Badge label={status} color={statusColor} /></Td>
                    <Td>
                      <button onClick={e => { e.stopPropagation(); handlePrintInvoice(o); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Printer size={14} color="var(--text-muted)" />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Receipt Modal */}
      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Invoice: ${selectedOrder?.billNo || selectedOrder?.id?.slice(0, 8) || ''}`} wide>
        {selectedOrder && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: '0.82rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Date: </span><strong>{fmtDateTime(selectedOrder.createdAt)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Type: </span><strong>{selectedOrder.orderType || (selectedOrder.tableId ? 'Dine-in' : 'Takeout')}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Table: </span><strong>{selectedOrder.tableId ? `T-${selectedOrder.tableId}` : 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Server: </span><strong>{selectedOrder.serverName || 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Payment: </span><strong>{selectedOrder.paymentMethod || 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Status: </span><Badge label={selectedOrder.status || 'Closed'} color={selectedOrder.status === 'Voided' ? '#ef4444' : '#22c55e'} /></div>
            </div>
            <TableWrap style={{ marginBottom: 16 }}>
              <thead>
                <tr><Th>#</Th><Th>Item</Th><Th>Category</Th><Th right>Qty</Th><Th right>Price</Th><Th right>Total</Th></tr>
              </thead>
              <tbody>
                {(selectedOrder.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <Td muted>{idx + 1}</Td>
                    <Td bold>{item.name}</Td>
                    <Td muted>{item.category || '—'}</Td>
                    <Td right>{item.qty || 1}</Td>
                    <Td right>₹{(item.price || 0).toFixed(2)}</Td>
                    <Td right bold>₹{((item.price || 0) * (item.qty || 1)).toFixed(2)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-muted)', marginRight: 16 }}>Subtotal:</span> ₹{(selectedOrder.subtotal || 0).toFixed(2)}</div>
              {(selectedOrder.discount || 0) > 0 && <div><span style={{ color: 'var(--text-muted)', marginRight: 16 }}>Discount:</span> -₹{(selectedOrder.discount || 0).toFixed(2)}</div>}
              <div><span style={{ color: 'var(--text-muted)', marginRight: 16 }}>Tax:</span> ₹{(selectedOrder.tax || 0).toFixed(2)}</div>
              {(selectedOrder.serviceCharge || 0) > 0 && <div><span style={{ color: 'var(--text-muted)', marginRight: 16 }}>Service Charge:</span> ₹{(selectedOrder.serviceCharge || 0).toFixed(2)}</div>}
              {(selectedOrder.tip || 0) > 0 && <div><span style={{ color: 'var(--text-muted)', marginRight: 16 }}>Tip:</span> ₹{(selectedOrder.tip || 0).toFixed(2)}</div>}
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary)', paddingTop: 6, borderTop: '2px solid var(--primary)' }}>
                Total: ₹{(selectedOrder.total || 0).toFixed(2)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => handlePrintInvoice(selectedOrder)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <Printer size={14} /> Print Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};


// =================================================================
// TAB 5 -- SPEED OF SERVICE
// =================================================================

const SpeedOfService = ({ orders, kdsTickets }) => {
  const [range, setRange]       = useState('Today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const filteredOrders = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const serviceData = useMemo(() => {
    return filteredOrders.map(o => {
      const ticket = kdsTickets.find(t => t.orderId === o.id);
      const orderPlaced = o.createdAt ? new Date(o.createdAt).getTime() : null;
      const ticketPrinted = ticket?.createdAt ? new Date(ticket.createdAt).getTime() : orderPlaced;
      const foodBumped = ticket?.bumpedAt ? new Date(ticket.bumpedAt).getTime() : (ticket?.completedAt ? new Date(ticket.completedAt).getTime() : null);
      const checkPaid = o.paidAt ? new Date(o.paidAt).getTime() : (o.closedAt ? new Date(o.closedAt).getTime() : null);

      const orderToTicket = ticketPrinted && orderPlaced ? ticketPrinted - orderPlaced : null;
      const ticketToFood = foodBumped && ticketPrinted ? foodBumped - ticketPrinted : null;
      const foodToPaid = checkPaid && foodBumped ? checkPaid - foodBumped : null;
      const totalTime = checkPaid && orderPlaced ? checkPaid - orderPlaced : null;

      return {
        id: o.billNo || o.id?.slice(0, 8),
        orderId: o.id,
        table: o.tableId ? `T-${o.tableId}` : '—',
        orderPlaced: o.createdAt,
        ticketPrinted: ticket?.createdAt || o.createdAt,
        foodBumped: ticket?.bumpedAt || ticket?.completedAt,
        checkPaid: o.paidAt || o.closedAt,
        orderToTicket,
        ticketToFood,
        foodToPaid,
        totalTime,
      };
    }).filter(d => d.orderPlaced);
  }, [filteredOrders, kdsTickets]);

  const averages = useMemo(() => {
    const valid = (arr) => arr.filter(v => v !== null && v > 0);
    const avg = (arr) => { const v = valid(arr); return v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : 0; };
    return {
      orderToTicket: avg(serviceData.map(d => d.orderToTicket)),
      ticketToFood: avg(serviceData.map(d => d.ticketToFood)),
      foodToPaid: avg(serviceData.map(d => d.foodToPaid)),
      totalTime: avg(serviceData.map(d => d.totalTime)),
    };
  }, [serviceData]);

  const handleExport = () => {
    const rows = [
      'Order ID,Table,Order Placed,Ticket Printed,Food Bumped,Check Paid,Total Time (s)',
      ...serviceData.map(d =>
        `"${d.id}","${d.table}","${fmtDateTime(d.orderPlaced)}","${fmtDateTime(d.ticketPrinted)}","${d.foodBumped ? fmtDateTime(d.foodBumped) : ''}","${d.checkPaid ? fmtDateTime(d.checkPaid) : ''}",${d.totalTime ? Math.round(d.totalTime / 1000) : ''}`
      ),
    ];
    downloadCSV('speed_of_service.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Avg Order-to-Ticket" value={fmtMinSec(averages.orderToTicket)} color="#7c3aed" icon={Timer} />
        <StatCard label="Avg Kitchen Time" value={fmtMinSec(averages.ticketToFood)} color="#f59e0b" icon={Utensils} />
        <StatCard label="Avg Food-to-Paid" value={fmtMinSec(averages.foodToPaid)} color="#0ea5e9" icon={CreditCard} />
        <StatCard label="Avg Total Time" value={fmtMinSec(averages.totalTime)} color="#22c55e" icon={Clock} />
      </div>

      <div className="card">
        <SectionTitle>Order Speed Timeline ({serviceData.length} orders)</SectionTitle>
        {serviceData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Order ID</Th><Th>Table</Th><Th>Order Placed</Th><Th>Ticket Printed</Th>
                <Th>Food Bumped</Th><Th>Check Paid</Th><Th right>Total Time</Th><Th>Timeline</Th>
              </tr>
            </thead>
            <tbody>
              {serviceData.slice(0, 50).map(d => {
                const maxTime = averages.totalTime * 2 || 600000;
                const phases = [];
                if (d.orderToTicket > 0) phases.push({ pct: Math.min((d.orderToTicket / maxTime) * 100, 33), color: '#7c3aed', label: 'Queue' });
                if (d.ticketToFood > 0) phases.push({ pct: Math.min((d.ticketToFood / maxTime) * 100, 33), color: '#f59e0b', label: 'Kitchen' });
                if (d.foodToPaid > 0) phases.push({ pct: Math.min((d.foodToPaid / maxTime) * 100, 33), color: '#22c55e', label: 'Service' });

                return (
                  <tr key={d.orderId}>
                    <Td bold>{d.id}</Td>
                    <Td muted>{d.table}</Td>
                    <Td style={{ fontSize: '0.73rem' }}>{fmtTime(d.orderPlaced)}</Td>
                    <Td style={{ fontSize: '0.73rem' }}>{fmtTime(d.ticketPrinted)}</Td>
                    <Td style={{ fontSize: '0.73rem' }}>{d.foodBumped ? fmtTime(d.foodBumped) : '—'}</Td>
                    <Td style={{ fontSize: '0.73rem' }}>{d.checkPaid ? fmtTime(d.checkPaid) : '—'}</Td>
                    <Td right bold>{fmtMinSec(d.totalTime)}</Td>
                    <Td>
                      <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', minWidth: 100, background: 'rgba(226,232,240,0.3)' }}>
                        {phases.map((p, i) => (
                          <div key={i} title={`${p.label}: ${fmtMinSec(p.pct * maxTime / 100)}`}
                            style={{ width: `${Math.max(p.pct, 3)}%`, height: '100%', background: p.color, transition: 'width 0.4s' }} />
                        ))}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {serviceData.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#7c3aed' }} /> Queue</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} /> Kitchen</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Service</span>
          </div>
        )}
      </div>
    </div>
  );
};


// =================================================================
// TAB 6 -- LABOR REPORT
// =================================================================

const LaborReport = ({ orders, staff: staffList }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const attendance = useMemo(() => getAll('attendance'), []);
  const filteredAttendance = useMemo(() => filterByRange(attendance, range, dateFrom, dateTo, 'timestamp'), [attendance, range, dateFrom, dateTo]);
  const filteredOrders = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const totalRevenue = useMemo(() => filteredOrders.reduce((s, o) => s + (o.total || 0), 0), [filteredOrders]);

  const laborData = useMemo(() => {
    const staffMap = {};
    staffList.forEach(s => { staffMap[s.id] = s; });

    const byStaff = {};
    const sorted = [...filteredAttendance].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    sorted.forEach(rec => {
      if (!byStaff[rec.staffId]) byStaff[rec.staffId] = { ins: [], outs: [] };
      if (rec.type === 'IN') byStaff[rec.staffId].ins.push(new Date(rec.timestamp));
      if (rec.type === 'OUT') byStaff[rec.staffId].outs.push(new Date(rec.timestamp));
    });

    return staffList.map(s => {
      const att = byStaff[s.id] || { ins: [], outs: [] };
      const pairs = Math.min(att.ins.length, att.outs.length);
      let totalHours = 0;
      for (let i = 0; i < pairs; i++) {
        totalHours += Math.max(0, att.outs[i] - att.ins[i]) / 3600000;
      }
      totalHours = Math.round(totalHours * 10) / 10;
      const hourlyRate = s.salary ? Math.round(s.salary / 30 / 8) : 0;
      const totalPay = totalHours * hourlyRate;
      const overtime = Math.max(0, totalHours - 8 * Math.ceil(totalHours / 8));
      const revenuePerHour = totalHours > 0 ? totalRevenue / totalHours : 0;

      return {
        id: s.id,
        name: s.name,
        role: s.role || '—',
        hours: totalHours,
        rate: hourlyRate,
        totalPay,
        overtime,
        revenuePerHour,
      };
    }).filter(d => d.hours > 0).sort((a, b) => b.totalPay - a.totalPay);
  }, [staffList, filteredAttendance, totalRevenue]);

  const totalLaborCost = useMemo(() => laborData.reduce((s, d) => s + d.totalPay, 0), [laborData]);
  const laborPct = totalRevenue > 0 ? (totalLaborCost / totalRevenue * 100) : 0;
  const totalHours = laborData.reduce((s, d) => s + d.hours, 0);

  // Daily labor vs revenue chart
  const dailyChart = useMemo(() => {
    const revMap = {};
    const laborMap = {};
    filteredOrders.forEach(o => {
      const d = (o.createdAt || '').split('T')[0];
      revMap[d] = (revMap[d] || 0) + (o.total || 0);
    });
    const staffMap = {};
    staffList.forEach(s => { staffMap[s.id] = s; });
    const sorted = [...filteredAttendance].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const byDay = {};
    sorted.forEach(rec => {
      const d = (rec.timestamp || '').split('T')[0];
      if (!byDay[d]) byDay[d] = {};
      if (!byDay[d][rec.staffId]) byDay[d][rec.staffId] = { ins: [], outs: [] };
      if (rec.type === 'IN') byDay[d][rec.staffId].ins.push(new Date(rec.timestamp));
      if (rec.type === 'OUT') byDay[d][rec.staffId].outs.push(new Date(rec.timestamp));
    });
    Object.entries(byDay).forEach(([day, staffData]) => {
      let dayCost = 0;
      Object.entries(staffData).forEach(([id, { ins, outs }]) => {
        const pairs = Math.min(ins.length, outs.length);
        let hours = 0;
        for (let i = 0; i < pairs; i++) hours += Math.max(0, outs[i] - ins[i]) / 3600000;
        const member = staffMap[id];
        const rate = member?.salary ? member.salary / 30 / 8 : 0;
        dayCost += hours * rate;
      });
      laborMap[day] = dayCost;
    });

    const allDays = [...new Set([...Object.keys(revMap), ...Object.keys(laborMap)])].sort();
    const max = Math.max(...allDays.map(d => revMap[d] || 0), 1);
    return allDays.map(d => ({
      date: d,
      revenue: revMap[d] || 0,
      labor: laborMap[d] || 0,
      revPct: Math.round(((revMap[d] || 0) / max) * 100),
      labPct: Math.round(((laborMap[d] || 0) / max) * 100),
    }));
  }, [filteredOrders, filteredAttendance, staffList]);

  const handleExport = () => {
    const rows = [
      'Name,Role,Hours Worked,Rate (₹/hr),Total Pay,Overtime Hours,Revenue Per Labor Hour',
      ...laborData.map(d =>
        `"${d.name}","${d.role}",${d.hours},${d.rate},${d.totalPay.toFixed(2)},${d.overtime.toFixed(1)},${d.revenuePerHour.toFixed(2)}`
      ),
    ];
    downloadCSV('labor_report.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Labor Cost" value={fmt(totalLaborCost)} color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Labor Cost %" value={fmtPct(laborPct)} sub={laborPct > 30 ? 'Above target' : 'Within target'} color={laborPct > 30 ? '#ef4444' : '#22c55e'} icon={Gauge} />
        <StatCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} color="#0ea5e9" icon={Clock} />
        <StatCard label="Total Revenue" value={fmt(totalRevenue)} color="#f59e0b" icon={TrendingUp} />
      </div>

      {/* Daily Labor vs Revenue Chart */}
      {dailyChart.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle>Daily Labor Cost vs Revenue</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '0 4px' }}>
            {dailyChart.slice(-14).map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', width: '100%', height: 80 }}>
                  <div title={`Revenue: ${fmt(d.revenue)}`}
                    style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'rgba(124,58,237,0.6)', height: `${Math.max(d.revPct * 0.72, 2)}px`, transition: 'height 0.4s' }} />
                  <div title={`Labor: ${fmt(d.labor)}`}
                    style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'rgba(239,68,68,0.5)', height: `${Math.max(d.labPct * 0.72, 2)}px`, transition: 'height 0.4s' }} />
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(124,58,237,0.6)' }} /> Revenue</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.5)' }} /> Labor Cost</span>
          </div>
        </div>
      )}

      <div className="card">
        <SectionTitle>Staff Hours Breakdown ({laborData.length} staff)</SectionTitle>
        {laborData.length === 0 ? <Empty text="No attendance data for this period." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th><Th>Role</Th><Th right>Hours Worked</Th><Th right>Rate (₹/hr)</Th>
                <Th right>Total Pay</Th><Th right>Overtime</Th><Th right>Rev / Labor Hour</Th>
              </tr>
            </thead>
            <tbody>
              {laborData.map(d => (
                <tr key={d.id}>
                  <Td bold>{d.name}</Td>
                  <Td><Badge label={d.role} color="#7c3aed" /></Td>
                  <Td right>{d.hours.toFixed(1)}h</Td>
                  <Td right muted>₹{d.rate}</Td>
                  <Td right bold>{fmt(d.totalPay)}</Td>
                  <Td right>
                    {d.overtime > 0
                      ? <Badge label={`${d.overtime.toFixed(1)}h OT`} color="#ef4444" />
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </Td>
                  <Td right muted>{fmt(d.revenuePerHour)}</Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary />
                <TdSummary right bold>{totalHours.toFixed(1)}h</TdSummary>
                <TdSummary right />
                <TdSummary right bold>{fmt(totalLaborCost)}</TdSummary>
                <TdSummary right>{laborData.reduce((s, d) => s + d.overtime, 0).toFixed(1)}h</TdSummary>
                <TdSummary right>{totalHours > 0 ? fmt(totalRevenue / totalHours) : '—'}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};


// =================================================================
// TAB 7 -- MENU ENGINEERING
// =================================================================

const QUAD_COLORS = { Star: '#22c55e', Puzzle: '#f59e0b', Plowhorse: '#3b82f6', Dog: '#ef4444' };
const QUAD_ICONS = { Star: Star, Puzzle: HelpCircle, Plowhorse: Utensils, Dog: XCircle };
const QUAD_DESC = {
  Star: 'High profit, high popularity',
  Puzzle: 'High profit, low popularity',
  Plowhorse: 'Low profit, high popularity',
  Dog: 'Low profit, low popularity',
};

const MenuEngineering = ({ orders, menu }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const menuData = useMemo(() => {
    const salesMap = {};
    filtered.forEach(o => (o.items || []).forEach(i => {
      const k = i.name;
      if (!salesMap[k]) salesMap[k] = { qty: 0, revenue: 0 };
      salesMap[k].qty += i.qty || 1;
      salesMap[k].revenue += (i.price || 0) * (i.qty || 1);
    }));

    const items = menu.map(m => {
      const sold = salesMap[m.name] || { qty: 0, revenue: 0 };
      const cost = (m.cost || m.foodCost || 0) * sold.qty;
      const profit = sold.revenue - cost;
      const margin = sold.revenue > 0 ? (profit / sold.revenue * 100) : 0;
      return {
        id: m.id,
        name: m.name,
        category: m.category || '—',
        sold: sold.qty,
        revenue: sold.revenue,
        cost,
        profit,
        margin,
      };
    });

    const avgQty = items.length > 0 ? items.reduce((s, i) => s + i.sold, 0) / items.length : 0;
    const avgMargin = items.length > 0 ? items.reduce((s, i) => s + i.margin, 0) / items.length : 0;

    const classified = items.map((item, idx) => {
      const highPop = item.sold >= avgQty;
      const highProfit = item.margin >= avgMargin;
      let classification;
      if (highPop && highProfit) classification = 'Star';
      else if (!highPop && highProfit) classification = 'Puzzle';
      else if (highPop && !highProfit) classification = 'Plowhorse';
      else classification = 'Dog';
      return { ...item, classification, rank: idx + 1 };
    });

    classified.sort((a, b) => b.revenue - a.revenue);
    classified.forEach((item, i) => { item.rank = i + 1; });

    return classified;
  }, [filtered, menu]);

  const quadrantCounts = useMemo(() => {
    const counts = { Star: 0, Puzzle: 0, Plowhorse: 0, Dog: 0 };
    menuData.forEach(d => { counts[d.classification]++; });
    return counts;
  }, [menuData]);

  const handleExport = () => {
    const rows = [
      'Item,Category,Sold Count,Revenue,Cost,Profit,Margin%,Popularity Rank,Classification',
      ...menuData.map(d =>
        `"${d.name}","${d.category}",${d.sold},${d.revenue.toFixed(2)},${d.cost.toFixed(2)},${d.profit.toFixed(2)},${d.margin.toFixed(1)},${d.rank},"${d.classification}"`
      ),
    ];
    downloadCSV('menu_engineering.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      {/* Quadrant Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {Object.entries(quadrantCounts).map(([quad, count]) => {
          const QIcon = QUAD_ICONS[quad];
          return (
            <StatCard key={quad} label={`${quad}s`} value={count} sub={QUAD_DESC[quad]} color={QUAD_COLORS[quad]} icon={QIcon} />
          );
        })}
      </div>

      {/* Quadrant Visualization */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Menu Engineering Matrix</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, height: 260 }}>
          {[
            { quad: 'Star', label: 'Stars', pos: 'top-right', desc: 'High Profit + High Pop' },
            { quad: 'Plowhorse', label: 'Plowhorses', pos: 'top-left', desc: 'Low Profit + High Pop' },
            { quad: 'Puzzle', label: 'Puzzles', pos: 'bottom-right', desc: 'High Profit + Low Pop' },
            { quad: 'Dog', label: 'Dogs', pos: 'bottom-left', desc: 'Low Profit + Low Pop' },
          ].map(({ quad, label, desc }) => {
            const items = menuData.filter(d => d.classification === quad);
            return (
              <div key={quad} style={{
                background: `${QUAD_COLORS[quad]}08`, border: `1px solid ${QUAD_COLORS[quad]}25`,
                borderRadius: 12, padding: 12, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: QUAD_COLORS[quad] }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: QUAD_COLORS[quad] }}>{label} ({items.length})</span>
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 6 }}>{desc}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {items.slice(0, 8).map(item => (
                    <span key={item.id} style={{
                      padding: '2px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600,
                      background: `${QUAD_COLORS[quad]}15`, color: QUAD_COLORS[quad],
                    }}>{item.name}</span>
                  ))}
                  {items.length > 8 && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+{items.length - 8} more</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>← Low Profit</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Profit Margin →</span>
          <span>↑ Popularity</span>
        </div>
      </div>

      {/* Full Table */}
      <div className="card">
        <SectionTitle>Menu Item Analysis ({menuData.length} items)</SectionTitle>
        {menuData.length === 0 ? <Empty text="No menu items or order data." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>#</Th><Th>Item</Th><Th>Category</Th><Th right>Sold</Th><Th right>Revenue</Th>
                <Th right>Cost</Th><Th right>Profit</Th><Th right>Margin %</Th><Th>Classification</Th>
              </tr>
            </thead>
            <tbody>
              {menuData.map(d => (
                <tr key={d.id}>
                  <Td muted>{d.rank}</Td>
                  <Td bold>{d.name}</Td>
                  <Td muted>{d.category}</Td>
                  <Td right>{d.sold}</Td>
                  <Td right bold>{fmt(d.revenue)}</Td>
                  <Td right muted>{fmt(d.cost)}</Td>
                  <Td right>{fmt(d.profit)}</Td>
                  <Td right>{fmtPct(d.margin)}</Td>
                  <Td><Badge label={d.classification} color={QUAD_COLORS[d.classification]} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};


// =================================================================
// TAB 8 -- INVENTORY REPORT
// =================================================================

const InventoryReport = ({ inventory, wasteLog, orders, menu }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const filteredOrders = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);
  const filteredWaste = useMemo(() => filterByRange(wasteLog || [], range, dateFrom, dateTo, 'date'), [wasteLog, range, dateFrom, dateTo]);

  // Stock value summary
  const stockSummary = useMemo(() => {
    const totalValue = inventory.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
    const critical = inventory.filter(i => i.status === 'critical').length;
    const low = inventory.filter(i => i.status === 'low').length;
    return { totalValue, critical, low, totalItems: inventory.length };
  }, [inventory]);

  // Waste summary
  const wasteSummary = useMemo(() => {
    const totalCost = filteredWaste.reduce((s, w) => s + (w.cost || 0) * (w.qty || 0), 0);
    const totalItems = filteredWaste.length;
    return { totalCost, totalItems };
  }, [filteredWaste]);

  // Top waste items
  const topWaste = useMemo(() => {
    const map = {};
    filteredWaste.forEach(w => {
      const k = w.item || w.name || 'Unknown';
      if (!map[k]) map[k] = { name: k, qty: 0, cost: 0 };
      map[k].qty += w.qty || 0;
      map[k].cost += (w.cost || 0) * (w.qty || 0);
    });
    return Object.values(map).sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [filteredWaste]);
  const maxWasteCost = topWaste[0]?.cost || 1;

  // Actual vs Theoretical variance
  const varianceData = useMemo(() => {
    const theoreticalUsage = {};
    filteredOrders.forEach(o => (o.items || []).forEach(item => {
      const menuItem = menu.find(m => m.name === item.name);
      if (menuItem?.ingredients) {
        menuItem.ingredients.forEach(ing => {
          const k = ing.name || ing.item;
          if (!theoreticalUsage[k]) theoreticalUsage[k] = 0;
          theoreticalUsage[k] += (ing.qty || 0) * (item.qty || 1);
        });
      }
    }));

    return inventory.map(inv => {
      const theoretical = theoreticalUsage[inv.name] || 0;
      const actual = Math.max(0, (inv.initialStock || inv.stock + theoretical) - (inv.stock || 0));
      const variance = actual - theoretical;
      const variancePct = theoretical > 0 ? (variance / theoretical * 100) : 0;
      return {
        id: inv.id,
        name: inv.name,
        theoretical: Math.round(theoretical * 10) / 10,
        actual: Math.round(actual * 10) / 10,
        currentStock: inv.stock || 0,
        variance: Math.round(variance * 10) / 10,
        variancePct: Math.round(variancePct * 10) / 10,
        unit: inv.unit || '',
      };
    }).filter(d => d.theoretical > 0 || d.actual > 0).sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
  }, [inventory, filteredOrders, menu]);

  const handleExport = () => {
    const rows = [
      'Item,Theoretical Usage,Actual Usage,Variance,Variance %,Current Stock,Unit',
      ...varianceData.map(d =>
        `"${d.name}",${d.theoretical},${d.actual},${d.variance},${d.variancePct}%,${d.currentStock},"${d.unit}"`
      ),
    ];
    downloadCSV('inventory_report.csv', rows);
  };

  const statusColor = { good: '#22c55e', low: '#f59e0b', critical: '#ef4444' };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Stock Value" value={fmt(stockSummary.totalValue)} color="#7c3aed" icon={Boxes} />
        <StatCard label="Low / Critical" value={`${stockSummary.low} / ${stockSummary.critical}`} sub={`of ${stockSummary.totalItems} items`} color="#f59e0b" icon={AlertTriangle} />
        <StatCard label="Waste Entries" value={wasteSummary.totalItems} color="#ef4444" icon={XCircle} />
        <StatCard label="Waste Cost" value={fmt(wasteSummary.totalCost)} color="#ef4444" icon={IndianRupee} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Stock Value by Status */}
        <div className="card">
          <SectionTitle>Stock Status Overview</SectionTitle>
          {(['good', 'low', 'critical']).map(s => {
            const items = inventory.filter(i => i.status === s);
            const value = items.reduce((sum, i) => sum + (i.stock || 0) * (i.cost || 0), 0);
            const pct = inventory.length > 0 ? Math.round((items.length / inventory.length) * 100) : 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 34, textAlign: 'center' }}>
                  {s === 'good' ? <CheckCircle size={18} color={statusColor[s]} /> : s === 'low' ? <AlertTriangle size={18} color={statusColor[s]} /> : <XCircle size={18} color={statusColor[s]} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>{s}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{items.length} items ({pct}%) -- {fmt(value)}</span>
                  </div>
                  <Bar pct={pct} color={statusColor[s]} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Top Waste Items */}
        <div className="card">
          <SectionTitle>Top Waste Items</SectionTitle>
          {topWaste.length === 0 ? <Empty text="No waste recorded." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topWaste.map((w, i) => (
                <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <Bar pct={Math.round((w.cost / maxWasteCost) * 100)} color={COLORS[i % COLORS.length]} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 60, textAlign: 'right', flexShrink: 0 }}>{fmt(w.cost)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 40, textAlign: 'right', flexShrink: 0 }}>{w.qty} qty</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actual vs Theoretical Variance */}
      <div className="card">
        <SectionTitle>Actual vs Theoretical Usage Variance ({varianceData.length} items)</SectionTitle>
        {varianceData.length === 0 ? <Empty text="No recipe data to compute theoretical usage. Add recipes to menu items for variance tracking." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th><Th right>Theoretical</Th><Th right>Actual</Th>
                <Th right>Variance</Th><Th right>Variance %</Th><Th right>Current Stock</Th><Th>Unit</Th>
              </tr>
            </thead>
            <tbody>
              {varianceData.map(d => {
                const varColor = Math.abs(d.variancePct) > 10 ? '#ef4444' : Math.abs(d.variancePct) > 5 ? '#f59e0b' : '#22c55e';
                return (
                  <tr key={d.id}>
                    <Td bold>{d.name}</Td>
                    <Td right>{d.theoretical}</Td>
                    <Td right>{d.actual}</Td>
                    <Td right style={{ color: varColor, fontWeight: 700 }}>
                      {d.variance > 0 ? '+' : ''}{d.variance}
                    </Td>
                    <Td right>
                      <Badge label={`${d.variancePct > 0 ? '+' : ''}${d.variancePct}%`} color={varColor} />
                    </Td>
                    <Td right bold>{d.currentStock}</Td>
                    <Td muted>{d.unit}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};


// =================================================================
// MAIN REPORTS PAGE
// =================================================================

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { id: 'sales',      label: 'Sales',             icon: TrendingUp },
  { id: 'tax',        label: 'Tax Report',        icon: Receipt },
  { id: 'invoices',   label: 'Invoice Detail',    icon: FileText },
  { id: 'speed',      label: 'Speed of Service',  icon: Zap },
  { id: 'labor',      label: 'Labor',             icon: Users },
  { id: 'menueng',    label: 'Menu Engineering',  icon: Utensils },
  { id: 'inventory',  label: 'Inventory',         icon: Boxes },
];

const Reports = () => {
  const { orders, inventory, staff, menu, kdsTickets, deliveryOrders, settings, wasteLog, floorPlans } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="animate-fade-up">
      {/* Page Header */}
      <div className="page-title-row" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Full business intelligence -- dashboard, sales, tax, invoices, speed, labor, menu engineering &amp; inventory
          </p>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 20, background: 'rgba(255,255,255,0.55)', padding: 5, borderRadius: 14, border: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
                border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: active ? 700 : 500,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab orders={orders} inventory={inventory} staff={staff} menu={menu} kdsTickets={kdsTickets} deliveryOrders={deliveryOrders} floorPlans={floorPlans} settings={settings} />}
      {activeTab === 'sales'     && <SalesReport orders={orders} />}
      {activeTab === 'tax'       && <TaxReport orders={orders} />}
      {activeTab === 'invoices'  && <InvoiceDetail orders={orders} staff={staff} />}
      {activeTab === 'speed'     && <SpeedOfService orders={orders} kdsTickets={kdsTickets} />}
      {activeTab === 'labor'     && <LaborReport orders={orders} staff={staff} />}
      {activeTab === 'menueng'   && <MenuEngineering orders={orders} menu={menu} />}
      {activeTab === 'inventory' && <InventoryReport inventory={inventory} wasteLog={wasteLog} orders={orders} menu={menu} />}
    </div>
  );
};

export default Reports;
