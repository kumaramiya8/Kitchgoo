import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Download, BarChart2, Package,
  Users, Filter, Search, ShoppingBag, CreditCard, IndianRupee,
  Clock, CheckCircle, AlertTriangle, XCircle, FileText, Zap,
  Timer, Utensils, Boxes, Star, HelpCircle, Award, Target,
  Printer, X, Gauge, LayoutDashboard, Receipt, CalendarCheck,
  TableProperties, Armchair, Eye, Layers, History, ShieldCheck,
  Building2, FileSpreadsheet, Flame, Gift, Wallet, Phone, Banknote
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll } from '../db/database';
import { localDayStr } from '../../shared/dates';
import AttendanceCalendar from '../components/AttendanceCalendar';
import InvoiceHistoryModal from '../components/InvoiceHistoryModal';
import {
  localDay as attLocalDay, daysAgo, recordDay, recordTs, fmtTime as attFmtTime,
  fmtDate as attFmtDate, pairSessions, totalHours, activeDays,
} from '../lib/attendance';

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
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec === 0) return '< 1m';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
};

const fmtDuration = (ms) => {
  if (ms === null || ms === undefined || isNaN(ms) || ms <= 0) return '—';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1m';
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const formatHour = (h) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
};

const RANGES = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Quarter', 'Custom'];

function filterByRange(list, range, dateFrom, dateTo, key = 'createdAt') {
  // All boundaries are LOCAL calendar days — timestamps are stored in UTC,
  // so comparing UTC date-prefixes shifts every report by the tz offset.
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
        // Calendar week, Monday 00:00 local
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
        // Date-input values are local days; span them fully, local midnight to midnight
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

// The cache only holds the recent orders window; when a tab's period
// reaches further back, pull the missing history once from the backend.
function useHistoricalOrders(range, dateFrom) {
  const { loadOlderOrders } = useApp();
  useEffect(() => {
    let from = null;
    const now = new Date();
    if (dateFrom) {
      from = dateFrom;
    } else if (range === 'Yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = localDayStr(y);
    } else if (range === 'This Week') {
      const w = new Date(now);
      w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
      from = localDayStr(w);
    } else if (range === 'This Month') {
      from = localDayStr(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (range === 'This Quarter') {
      from = localDayStr(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    }
    if (from && typeof loadOlderOrders === 'function') {
      loadOlderOrders(from);
    }
  }, [range, dateFrom, loadOlderOrders]);
}

// ─── Payment Split & Filter Helpers ─────────────────────────

export function getOrderPaymentSplits(order) {
  if (!order) return null;
  const rawSplits = order.paymentSplits || order.timestamps?.paymentSplits;
  if (Array.isArray(rawSplits) && rawSplits.length > 0) return rawSplits;
  const pm = order.paymentMethod || '';
  if (typeof pm === 'string' && pm.toLowerCase().startsWith('split')) {
    const match = pm.match(/\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',');
      const parsed = parts.map(part => {
        const [method, amtStr] = part.split(':');
        const cleanAmt = parseFloat((amtStr || '').replace(/[^0-9.]/g, '')) || 0;
        return { method: (method || '').trim(), amount: cleanAmt };
      }).filter(sp => sp.amount > 0);
      if (parsed.length > 0) return parsed;
    }
  }
  return null;
}

export function orderMatchesPaymentType(order, filter) {
  if (!order || !filter || filter === 'All') return true;
  const pm = (order.paymentMethod || '').toLowerCase();
  const splits = getOrderPaymentSplits(order);
  const target = filter.toLowerCase();

  if (target === 'wallet') {
    if (pm === 'wallet' || pm.includes('wallet')) return true;
    if (parseFloat(order.walletRedeemed || 0) > 0) return true;
    if (Array.isArray(splits) && splits.some(s => (s.method || '').toLowerCase().includes('wallet'))) return true;
    return false;
  }
  if (target === 'split') {
    return pm.startsWith('split') || (Array.isArray(splits) && splits.length > 1);
  }
  if (pm === target) return true;
  if (Array.isArray(splits) && splits.length > 0) {
    return splits.some(s => {
      const sm = (s.method || '').toLowerCase();
      return sm === target || sm.includes(target);
    });
  }
  return false;
}

export function getOrderPaymentAmount(order, method) {
  if (!order) return 0;
  const total = parseFloat(order.total || 0);
  if (!method || method === 'All') return total;
  const target = method.toLowerCase();
  if (target === 'wallet') {
    if (parseFloat(order.walletRedeemed || 0) > 0) {
      return parseFloat(order.walletRedeemed || 0);
    }
  }
  const splits = getOrderPaymentSplits(order);
  if (Array.isArray(splits) && splits.length > 0) {
    return splits
      .filter(s => {
        const sm = (s.method || '').toLowerCase();
        return sm === target || sm.includes(target);
      })
      .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }
  const pm = (order.paymentMethod || '').toLowerCase();
  if (pm === target || pm.includes(target)) {
    return total;
  }
  return 0;
}

// ─── Shared UI pieces ───────────────────────────────────────

const StatCard = ({ label, value, sub, color = '#1e5e4a', icon: Icon }) => (
  <div className="stat-card" style={{ flex: 1 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ fontSize: '1.45rem', color }}>{value}</div>
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

// ─── Sorting Helpers ────────────────────────────────────────
const useSort = (initialField, initialDirection = 'asc') => {
  const [sortField, setSortField] = useState(initialField);
  const [sortDirection, setSortDirection] = useState(initialDirection);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return { sortField, sortDirection, handleSort };
};

const sortData = (data, field, direction, customGetters = {}) => {
  if (!field) return data;
  return [...data].sort((a, b) => {
    let valA = customGetters[field] ? customGetters[field](a) : a[field];
    let valB = customGetters[field] ? customGetters[field](b) : b[field];
    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (typeof valA === 'string' && typeof valB === 'string') {
      return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return direction === 'asc' ? valA - valB : valB - valA;
    }
  });
};

const Th = ({ children, right, sortField, currentField, sortDirection, onSort }) => {
  const isSorted = sortField && currentField && sortField === currentField;
  const cursorStyle = onSort && currentField ? 'pointer' : 'default';
  return (
    <th
      onClick={() => onSort && currentField && onSort(currentField)}
      style={{
        padding: '10px 14px',
        textAlign: right ? 'right' : 'left',
        fontWeight: 600,
        fontSize: '0.73rem',
        color: isSorted ? 'var(--primary)' : 'var(--text-muted)',
        background: 'rgba(248,250,252,0.8)',
        borderBottom: '1px solid var(--border-subtle)',
        whiteSpace: 'nowrap',
        cursor: cursorStyle,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start', width: '100%' }}>
        {children}
        {onSort && currentField && (
          <span style={{ fontSize: '0.62rem', opacity: isSorted ? 1 : 0.35 }}>
            {isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
          </span>
        )}
      </div>
    </th>
  );
};

const Td = ({ children, right, bold, muted, style: extraStyle, ...rest }) => (
  <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : 400, color: muted ? 'var(--text-muted)' : 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', ...extraStyle }} {...rest}>{children}</td>
);

const TdSummary = ({ children, right, bold, colSpan, style: extraStyle, ...rest }) => (
  <td colSpan={colSpan} style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 800 : 700, color: 'var(--primary)', borderTop: '2px solid var(--primary)', background: 'rgba(30, 94, 74,0.04)', whiteSpace: 'nowrap', fontSize: '0.83rem', ...extraStyle }} {...rest}>{children}</td>
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

const COLORS = ['#1e5e4a', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#f97316', '#14b8a6'];

const Empty = ({ text = 'No data for this period.' }) => (
  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
    <BarChart2 size={36} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
    <p style={{ fontSize: '0.85rem' }}>{text}</p>
  </div>
);

const RangePicker = ({ range, setRange, dateFrom, setDateFrom, dateTo, setDateTo }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', background: 'var(--card-bg)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
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

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return ReactDOM.createPortal(
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
    </div>,
    document.body
  );
};

const GaugeChart = ({ value, max = 100, label, color = '#1e5e4a', size = 110 }) => {
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
// TAB 1 -- OVERVIEW DASHBOARD
// =================================================================

const DashboardTab = ({ orders, inventory, staff, floorPlans, posTables }) => {
  const [range, setRange]       = useState('Today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const periodGross = useMemo(() => filtered.reduce((s, o) => s + (o.total || 0), 0), [filtered]);
  const periodTax = useMemo(() => filtered.reduce((s, o) => s + (o.tax || 0) + (o.serviceCharge || 0), 0), [filtered]);
  const periodNet = periodGross - periodTax;

  const yesterdayGross = useMemo(() => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yd = localDayStr(y);
    return orders.filter(o => o.createdAt && localDayStr(o.createdAt) === yd).reduce((s, o) => s + (o.total || 0), 0);
  }, [orders]);

  const twoDaysAgoGross = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    const dd = localDayStr(d);
    return orders.filter(o => o.createdAt && localDayStr(o.createdAt) === dd).reduce((s, o) => s + (o.total || 0), 0);
  }, [orders]);

  const trendInfo = useMemo(() => {
    if (range === 'Today') {
      const pct = yesterdayGross > 0 ? ((periodGross - yesterdayGross) / yesterdayGross * 100) : 0;
      return { pct, up: pct >= 0, label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs yesterday` };
    }
    if (range === 'Yesterday') {
      const pct = twoDaysAgoGross > 0 ? ((periodGross - twoDaysAgoGross) / twoDaysAgoGross * 100) : 0;
      return { pct, up: pct >= 0, label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs previous day` };
    }
    return { pct: null, up: true, label: `Tax & fees: ${fmt(periodTax)}` };
  }, [range, periodGross, yesterdayGross, twoDaysAgoGross, periodTax]);

  const orderCount = filtered.length;
  const avgCheck = orderCount > 0 ? filtered.reduce((s, o) => s + (o.total || 0), 0) / orderCount : 0;

  const voidsComps = useMemo(() => {
    return filtered.reduce((s, o) => s + (o.voidAmount || 0) + (o.compAmount || 0), 0);
  }, [filtered]);

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

  const orderTypeBreakdown = useMemo(() => {
    const map = { 'Dine-in': 0, 'Takeout': 0, 'Delivery': 0 };
    filtered.forEach(o => {
      let rawType = o.orderType || (o.tableId ? 'dine-in' : 'takeout');
      rawType = rawType.toLowerCase();
      let type = 'Takeout';
      if (rawType === 'dine-in') type = 'Dine-in';
      else if (rawType === 'delivery') type = 'Delivery';
      
      map[type] = (map[type] || 0) + (o.total || 0);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(map).map(([type, rev], i) => ({
      type, rev, pct: Math.round((rev / total) * 100), color: COLORS[i % COLORS.length]
    }));
  }, [filtered]);

  const totalTables = useMemo(() => {
    if (posTables && posTables.length > 0) return posTables.length;
    if (floorPlans?.tables && floorPlans.tables.length > 0) return floorPlans.tables.length;
    return 20;
  }, [posTables, floorPlans]);

  const activeTables = useMemo(() => {
    const activeIds = new Set();
    filtered.forEach(o => {
      const tid = o.tableId !== undefined && o.tableId !== null ? String(o.tableId).trim() : '';
      const tname = o.tableName ? String(o.tableName).trim() : '';
      if (tid || tname) {
        activeIds.add(tid || tname);
      } else if (o.orderType && o.orderType.toLowerCase() === 'dine-in' && o.tokenNumber) {
        activeIds.add(`token_${o.tokenNumber}`);
      }
    });
    return activeIds.size;
  }, [filtered]);
  const occupancyRate = totalTables > 0 ? (activeTables / totalTables * 100) : 0;

  const handleExport = () => {
    const rows = [
      'Metric,Value',
      `Period,${range}${range === 'Custom' ? ` (${dateFrom || 'start'} to ${dateTo || 'end'})` : ''}`,
      `Gross Sales,${periodGross.toFixed(2)}`,
      `Net Sales,${periodNet.toFixed(2)}`,
      `Tax & Surcharge,${periodTax.toFixed(2)}`,
      `Order Count,${orderCount}`,
      `Avg Check,${avgCheck.toFixed(2)}`,
      `Voids/Comps,${voidsComps.toFixed(2)}`,
      `Active Tables,${activeTables} of ${totalTables}`,
      `Occupancy Rate %,${occupancyRate.toFixed(1)}`,
    ];
    downloadCSV(`dashboard_summary_${range.toLowerCase().replace(/\s+/g, '_')}.csv`, rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {range === 'Today' ? 'Live Sales' : 'Total Sales'}
            </span>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(30, 94, 74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IndianRupee size={16} color="var(--primary)" />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1 }}>{fmt(periodGross)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Net: {fmt(periodNet)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: '0.73rem', fontWeight: 700, color: trendInfo.pct !== null ? (trendInfo.up ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)' }}>
            {trendInfo.pct !== null && (trendInfo.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
            {trendInfo.label}
          </div>
        </div>

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

        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <GaugeChart value={occupancyRate} max={100} label="Table Occupancy" color={occupancyRate > 80 ? '#ef4444' : occupancyRate > 50 ? '#f59e0b' : '#22c55e'} size={100} />
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
            {activeTables} of {totalTables} tables active
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <SectionTitle>Top 5 Selling Items</SectionTitle>
          {topItems.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topItems.map((item, idx) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)', width: 20 }}>{idx + 1}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <div style={{ flex: 1, height: 20, borderRadius: 6, background: 'rgba(226,232,240,0.4)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${(item.qty / topItemMax) * 100}%`, height: '100%', borderRadius: 6, background: `${COLORS[idx % COLORS.length]}30`, position: 'relative' }}>
                      <div style={{ position: 'absolute', inset: 0, background: COLORS[idx % COLORS.length], opacity: 0.7, borderRadius: 6 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 40, textAlign: 'right', flexShrink: 0 }}>{item.qty}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 60, textAlign: 'right', flexShrink: 0 }}>{fmt(item.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <SectionTitle>Revenue by Order Type</SectionTitle>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
    </div>
  );
};

// =================================================================
// TAB 2 -- SALES & INVOICING REPORT
// =================================================================

const DailySalesSummaryReport = ({ orders, settings }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [terminalFilter, setTerminalFilter] = useState('All');
  const [shiftFilter, setShiftFilter]       = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('date', 'desc');

  const processed = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);

    return arr.map(o => {
      const date = new Date(o.createdAt);
      const hour = date.getHours();
      
      let terminal = 'Terminal 1';
      const typeLower = (o.orderType || '').toLowerCase();
      if (typeLower.includes('qr') || (o.tableId && o.guestName && !o.serverName)) {
        terminal = 'QR Menu';
      } else if (String(o.serverId || o.id).charCodeAt(0) % 2 === 0) {
        terminal = 'Terminal 2';
      }

      let shift = 'Night Shift';
      if (hour >= 6 && hour < 14) {
        shift = 'Morning Shift';
      } else if (hour >= 14 && hour < 22) {
        shift = 'Evening Shift';
      }

      return { ...o, terminal, shift };
    });
  }, [orders, range, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let arr = processed;
    if (terminalFilter !== 'All') {
      arr = arr.filter(o => o.terminal === terminalFilter);
    }
    if (shiftFilter !== 'All') {
      arr = arr.filter(o => o.shift === shiftFilter);
    }
    return arr;
  }, [processed, terminalFilter, shiftFilter]);

  const dailyData = useMemo(() => {
    const globalPricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;
    const map = {};
    filtered.forEach(o => {
      // Exclude voided and cancelled orders from daily realized sales & breakdown
      const s = (o.status || '').toLowerCase();
      if (s === 'voided' || s === 'cancelled') return;

      const dateKey = localDayStr(o.createdAt || o.date);
      if (!map[dateKey]) {
        map[dateKey] = {
          date: dateKey,
          ordersCount: 0,
          gross: 0,
          discounts: 0,
          tax: 0,
          cash: 0,
          card: 0,
          upi: 0,
          wallet: 0,
          online: 0,
          other: 0
        };
      }
      const day = map[dateKey];
      day.ordersCount += 1;
      
      const disc = parseFloat(o.discount || o.discountAmount || 0);
      day.discounts += disc;
      
      const totalAmount = parseFloat(o.total || 0);
      const taxAmount = parseFloat(o.tax || 0);
      day.tax += taxAmount;
      
      const orderPricesIncludeGst = o.pricesIncludeGst !== undefined ? o.pricesIncludeGst : globalPricesIncludeGst;
      
      const itemsTotal = (o.items && o.items.length > 0)
        ? o.items.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0)
        : (totalAmount + disc);

      // Reconstructed taxable gross sales before discounts and taxes
      const grossSales = orderPricesIncludeGst
        ? (itemsTotal - taxAmount)
        : itemsTotal;

      day.gross += grossSales;

      const splits = getOrderPaymentSplits(o);
      if (Array.isArray(splits) && splits.length > 0) {
        splits.forEach(sp => {
          const pm = (sp.method || '').toLowerCase();
          const amt = parseFloat(sp.amount || 0);
          if (pm.includes('cash')) day.cash += amt;
          else if (pm.includes('card')) day.card += amt;
          else if (pm.includes('upi')) day.upi += amt;
          else if (pm.includes('wallet')) day.wallet = (day.wallet || 0) + amt;
          else if (pm.includes('online')) day.online = (day.online || 0) + amt;
          else day.other = (day.other || 0) + amt;
        });
      } else {
        const pMethod = (o.paymentMethod || '').toLowerCase();
        if (pMethod.includes('cash')) day.cash += totalAmount;
        else if (pMethod.includes('card')) day.card += totalAmount;
        else if (pMethod.includes('upi')) day.upi += totalAmount;
        else if (pMethod.includes('wallet')) day.wallet = (day.wallet || 0) + totalAmount;
        else if (pMethod.includes('online')) day.online = (day.online || 0) + totalAmount;
        else if (pMethod) day.other = (day.other || 0) + totalAmount;
      }
    });

    return Object.values(map);
  }, [filtered, settings]);

  const sortedDailyData = useMemo(() => {
    return sortData(dailyData, sortField, sortDirection, {
      net: r => r.gross - r.discounts
    });
  }, [dailyData, sortField, sortDirection]);

  const totals = useMemo(() => {
    return dailyData.reduce((s, r) => ({
      ordersCount: s.ordersCount + r.ordersCount,
      gross: s.gross + r.gross,
      discounts: s.discounts + r.discounts,
      tax: s.tax + r.tax,
      cash: s.cash + r.cash,
      card: s.card + r.card,
      upi: s.upi + r.upi,
      wallet: (s.wallet || 0) + (r.wallet || 0),
      online: (s.online || 0) + (r.online || 0),
      other: (s.other || 0) + (r.other || 0)
    }), { ordersCount: 0, gross: 0, discounts: 0, tax: 0, cash: 0, card: 0, upi: 0, wallet: 0, online: 0, other: 0 });
  }, [dailyData]);

  const handleExport = () => {
    const rows = [
      'Date,Total Orders,Gross Sales,Discounts Applied,Net Sales,Tax Collected,Cash Totals,Card Totals,UPI Totals,Wallet Totals,Online Totals,Other Totals',
      ...sortedDailyData.map(r =>
        `"${r.date}",${r.ordersCount},${r.gross.toFixed(2)},${r.discounts.toFixed(2)},${(r.gross - r.discounts).toFixed(2)},${r.tax.toFixed(2)},${r.cash.toFixed(2)},${r.card.toFixed(2)},${r.upi.toFixed(2)},${(r.wallet || 0).toFixed(2)},${(r.online || 0).toFixed(2)},${(r.other || 0).toFixed(2)}`
      ),
    ];
    downloadCSV('daily_sales_summary.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Register:</span>
        <Select value={terminalFilter} onChange={setTerminalFilter}>
          <option value="All">All Registers</option>
          <option value="Terminal 1">Register 1 (Terminal 1)</option>
          <option value="Terminal 2">Register 2 (Terminal 2)</option>
          <option value="QR Menu">QR Menu</option>
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Shift:</span>
        <Select value={shiftFilter} onChange={setShiftFilter}>
          <option value="All">All Shifts</option>
          <option value="Morning Shift">Morning Shift (06 AM - 02 PM)</option>
          <option value="Evening Shift">Evening Shift (02 PM - 10 PM)</option>
          <option value="Night Shift">Night Shift (10 PM - 06 AM)</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Gross Sales" value={fmt(totals.gross)} color="#1e5e4a" icon={IndianRupee} />
        <StatCard label="Discounts Applied" value={fmt(totals.discounts)} color="#ef4444" icon={TrendingDown} />
        <StatCard label="Net Sales" value={fmt(totals.gross - totals.discounts)} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Tax Collected" value={fmt(totals.tax)} color="#f59e0b" icon={Receipt} />
      </div>

      <div className="card">
        <SectionTitle>Daily Sales Summary</SectionTitle>
        {sortedDailyData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="date" sortDirection={sortDirection} onSort={handleSort}>Date</Th>
                <Th right sortField={sortField} currentField="ordersCount" sortDirection={sortDirection} onSort={handleSort}>Total Orders</Th>
                <Th right sortField={sortField} currentField="gross" sortDirection={sortDirection} onSort={handleSort}>Gross Sales</Th>
                <Th right sortField={sortField} currentField="discounts" sortDirection={sortDirection} onSort={handleSort}>Discounts Applied</Th>
                <Th right sortField={sortField} currentField="net" sortDirection={sortDirection} onSort={handleSort}>Net Sales</Th>
                <Th right sortField={sortField} currentField="tax" sortDirection={sortDirection} onSort={handleSort}>Tax Collected</Th>
                <Th>Payment Method Breakdown</Th>
              </tr>
            </thead>
            <tbody>
              {sortedDailyData.map(r => (
                <tr key={r.date}>
                  <Td bold>{fmtDate(r.date)}</Td>
                  <Td right>{r.ordersCount}</Td>
                  <Td right>{fmt(r.gross)}</Td>
                  <Td right muted>{fmt(r.discounts)}</Td>
                  <Td right bold>{fmt(r.gross - r.discounts)}</Td>
                  <Td right>{fmt(r.tax)}</Td>
                  <Td style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Cash:</span> {fmt(r.cash)} | <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Card:</span> {fmt(r.card)} | <span style={{ color: 'var(--primary)', fontWeight: 600 }}>UPI:</span> {fmt(r.upi)}
                    {r.wallet > 0 && <> | <span style={{ color: '#d97706', fontWeight: 600 }}>Wallet:</span> {fmt(r.wallet)}</>}
                    {r.online > 0 && <> | <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Online:</span> {fmt(r.online)}</>}
                    {r.other > 0 && <> | <span style={{ color: '#64748b', fontWeight: 600 }}>Other:</span> {fmt(r.other)}</>}
                  </Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary right bold>{totals.ordersCount}</TdSummary>
                <TdSummary right bold>{fmt(totals.gross)}</TdSummary>
                <TdSummary right>{fmt(totals.discounts)}</TdSummary>
                <TdSummary right bold>{fmt(totals.gross - totals.discounts)}</TdSummary>
                <TdSummary right bold>{fmt(totals.tax)}</TdSummary>
                <TdSummary bold>
                  Cash: {fmt(totals.cash)} | Card: {fmt(totals.card)} | UPI: {fmt(totals.upi)}
                  {totals.wallet > 0 && <> | Wallet: {fmt(totals.wallet)}</>}
                  {totals.online > 0 && <> | Online: {fmt(totals.online)}</>}
                  {totals.other > 0 && <> | Other: {fmt(totals.other)}</>}
                </TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

const DetailedInvoiceRegisterReport = ({ orders, settings }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [dateFilter, setDateFilter] = useState('');
  useHistoricalOrders(range, dateFilter || dateFrom);
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('All');
  const [cashierFilter, setCashierFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoiceHistoryOrder, setInvoiceHistoryOrder] = useState(null);

  const { sortField, sortDirection, handleSort } = useSort('createdAt', 'desc');

  const filtered = useMemo(() => {
    let arr = orders || [];
    if (dateFilter) {
      arr = arr.filter(item => {
        if (!item) return false;
        const val = item.createdAt || item.date || item.timestamp || item.timestamps?.ordered;
        if (!val) return false;
        return localDayStr(val) === dateFilter;
      });
    } else {
      arr = filterByRange(orders, range, dateFrom, dateTo);
    }
    if (statusFilter !== 'All') {
      const sf = statusFilter.toLowerCase();
      if (sf === 'closed' || sf === 'paid') {
        arr = arr.filter(o => {
          const s = (o.status || 'paid').toLowerCase();
          return s === 'closed' || s === 'completed' || s === 'paid';
        });
      } else if (sf === 'voided') {
        arr = arr.filter(o => {
          const s = (o.status || '').toLowerCase();
          return s === 'voided' || s === 'cancelled';
        });
      } else {
        arr = arr.filter(o => (o.status || 'paid').toLowerCase() === sf);
      }
    }
    if (paymentTypeFilter !== 'All') {
      arr = arr.filter(o => orderMatchesPaymentType(o, paymentTypeFilter));
    }
    if (cashierFilter !== 'All') {
      arr = arr.filter(o => o.serverName === cashierFilter || o.serverId === cashierFilter);
    }
    return arr;
  }, [orders, range, dateFrom, dateTo, dateFilter, statusFilter, paymentTypeFilter, cashierFilter]);

  const sortedInvoices = useMemo(() => {
    return sortData(filtered, sortField, sortDirection, {
      billNo: o => o.billNo || o.id,
      orderType: o => o.orderType || (o.tableId ? 'Dine-in' : 'Takeout'),
      paymentMethod: o => o.paymentMethod || ''
    });
  }, [filtered, sortField, sortDirection]);

  const totals = useMemo(() => {
    const isExplicitVoided = statusFilter.toLowerCase() === 'voided';
    const validOrders = isExplicitVoided
      ? sortedInvoices
      : sortedInvoices.filter(o => {
          const s = (o.status || '').toLowerCase();
          return s !== 'voided' && s !== 'cancelled';
        });
    const totalAmount = validOrders.reduce((sum, o) => {
      if (paymentTypeFilter !== 'All' && paymentTypeFilter !== 'Split') {
        return sum + getOrderPaymentAmount(o, paymentTypeFilter);
      }
      return sum + (parseFloat(o.total) || 0);
    }, 0);
    const count = validOrders.length;
    const voidedCount = isExplicitVoided ? 0 : sortedInvoices.length - count;
    return {
      totalAmount,
      count,
      voidedCount,
      isExplicitVoided
    };
  }, [sortedInvoices, paymentTypeFilter, statusFilter]);

  const cashiers = useMemo(() => ['All', ...new Set(orders.map(o => o.serverName).filter(Boolean))], [orders]);

  const paymentMethods = useMemo(() => {
    const standard = ['All', 'Cash', 'Card', 'UPI', 'Split', 'Wallet'];
    const extra = new Set();
    orders.forEach(o => {
      if (o.paymentMethod && !standard.map(s => s.toLowerCase()).includes(o.paymentMethod.toLowerCase())) {
        extra.add(o.paymentMethod);
      }
      const splits = getOrderPaymentSplits(o);
      if (Array.isArray(splits)) {
        splits.forEach(s => {
          if (s.method && !standard.map(std => std.toLowerCase()).includes(s.method.toLowerCase())) {
            extra.add(s.method);
          }
        });
      }
    });
    return [...standard, ...Array.from(extra)];
  }, [orders]);

  const handleExport = () => {
    const rows = [
      'Invoice Number,Timestamp,Order Type,Total Amount,Payment Type,Status,Handled By',
      ...sortedInvoices.map(o =>
        `"${o.billNo || o.id}","${fmtDateTime(o.createdAt)}","${o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')}",${(o.total || 0).toFixed(2)},"${o.paymentMethod || '—'}","${o.status || 'Closed'}","${o.serverName || ''}"`
      ),
      `"TOTAL (${totals.count} Invoices)","","",${totals.totalAmount.toFixed(2)},"","",""`
    ];
    downloadCSV('detailed_invoice_register.csv', rows);
  };

  const handlePrintInvoice = (order) => {
    const isInclusive = order.pricesIncludeGst !== undefined
      ? order.pricesIncludeGst
      : (settings?.billing?.pricesIncludeGst !== false);
    const taxRate = order.taxRate || settings?.billing?.gstRate || 5;

    const w = window.open('', '_blank', 'width=400,height=600');
    const items = (order.items || []).map(i =>
      `<tr><td>${i.name}</td><td style="text-align:center">${i.qty || 1}</td><td style="text-align:right">₹${((i.price || 0) * (i.qty || 1)).toFixed(2)}</td></tr>`
    ).join('');
    w.document.write(`<html><head><title>Invoice ${order.billNo || order.id}</title>
      <style>body{font-family:monospace;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}td,th{padding:4px;border-bottom:1px dashed #ccc}h2{text-align:center}</style></head>
      <body><h2>Kitchgoo</h2><p>Invoice: ${order.billNo || order.id}<br/>Date: ${fmtDateTime(order.createdAt)}<br/>Table: ${order.tableId || 'N/A'}<br/>Server: ${order.serverName || 'N/A'}</p>
      <table><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Amount</th></tr>${items}
      <tr><td colspan="2"><strong>${isInclusive ? 'Taxable Amount' : 'Subtotal'}</strong></td><td style="text-align:right">₹${(order.subtotal || 0).toFixed(2)}</td></tr>
      <tr><td colspan="2">GST (${taxRate}%${isInclusive ? ' incl.' : ''})</td><td style="text-align:right">₹${(order.tax || 0).toFixed(2)}</td></tr>
      ${order.tip ? `<tr><td colspan="2">Tip</td><td style="text-align:right">₹${(order.tip || 0).toFixed(2)}</td></tr>` : ''}
      ${order.serviceCharge ? `<tr><td colspan="2">Service Charge</td><td style="text-align:right">₹${(order.serviceCharge || 0).toFixed(2)}</td></tr>` : ''}
      <tr><td colspan="2"><strong>TOTAL ${isInclusive ? '(INCL. GST)' : ''}</strong></td><td style="text-align:right"><strong>₹${(order.total || 0).toFixed(2)}</strong></td></tr>
      ${(() => {
        const splits = order.paymentSplits || order.timestamps?.paymentSplits;
        if (Array.isArray(splits) && splits.length > 0) {
          return splits.map(sp => `<tr><td colspan="2" style="font-size:11px;color:#555;padding-left:12px;">&bull; Paid via ${sp.method}</td><td style="text-align:right;font-size:11px;color:#555;">₹${parseFloat(sp.amount || 0).toFixed(2)}</td></tr>`).join('');
        }
        return '';
      })()}
      </table><p style="text-align:center;margin-top:16px">Payment: ${order.paymentMethod || 'N/A'}<br/>Thank you!</p>
      <script>window.print();</script></body></html>`);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker
          range={range}
          setRange={r => { setRange(r); setDateFilter(''); }}
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
        />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Date:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              border: dateFilter ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              background: dateFilter ? 'rgba(30, 94, 74, 0.05)' : 'white',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              title="Clear date filter"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                padding: '2px 4px',
                fontWeight: 700
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="All">All Statuses</option>
          <option value="Closed">Paid / Completed</option>
          <option value="Voided">Voided</option>
          <option value="Refunded">Refunded</option>
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment Type:</span>
        <Select value={paymentTypeFilter} onChange={setPaymentTypeFilter}>
          {paymentMethods.map(pm => (
            <option key={pm} value={pm}>{pm === 'All' ? 'All Types' : pm}</option>
          ))}
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cashier:</span>
        <Select value={cashierFilter} onChange={setCashierFilter}>
          {cashiers.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cashiers' : c}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div className="card">
        <SectionTitle>Detailed Invoice Register ({sortedInvoices.length} Invoices)</SectionTitle>
        {sortedInvoices.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="billNo" sortDirection={sortDirection} onSort={handleSort}>Invoice Number</Th>
                <Th sortField={sortField} currentField="createdAt" sortDirection={sortDirection} onSort={handleSort}>Timestamp</Th>
                <Th sortField={sortField} currentField="orderType" sortDirection={sortDirection} onSort={handleSort}>Order Type</Th>
                <Th right sortField={sortField} currentField="total" sortDirection={sortDirection} onSort={handleSort}>Total Amount</Th>
                <Th sortField={sortField} currentField="paymentMethod" sortDirection={sortDirection} onSort={handleSort}>Payment Type</Th>
                <Th sortField={sortField} currentField="status" sortDirection={sortDirection} onSort={handleSort}>Status</Th>
                <Th sortField={sortField} currentField="serverName" sortDirection={sortDirection} onSort={handleSort}>Handled By</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map(o => {
                const status = o.status || 'Closed';
                const statusColor = status === 'Closed' || status === 'Completed' ? '#22c55e' : status === 'Refunded' ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                    <Td bold>{o.billNo || o.id?.slice(0, 8)}</Td>
                    <Td>{fmtDateTime(o.createdAt)}</Td>
                    <Td><Badge label={o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')} color="#1e5e4a" /></Td>
                    <Td right bold>
                      {paymentTypeFilter !== 'All' && paymentTypeFilter !== 'Split' && getOrderPaymentSplits(o) ? (
                        <div>
                          <div>{fmt(o.total || 0)}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>
                            ({paymentTypeFilter}: {fmt(getOrderPaymentAmount(o, paymentTypeFilter))})
                          </div>
                        </div>
                      ) : (
                        fmt(o.total || 0)
                      )}
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge label={o.paymentMethod || '—'} color="#6366f1" />
                        {parseFloat(o.walletRedeemed || 0) > 0 && (
                          <Badge label={`Redeemed ₹${parseFloat(o.walletRedeemed).toFixed(0)}`} color="#10b981" />
                        )}
                        {parseFloat(o.walletCredited || 0) > 0 && (
                          <Badge label={`Credited ₹${parseFloat(o.walletCredited).toFixed(0)}`} color="#f59e0b" />
                        )}
                      </div>
                    </Td>
                    <Td><Badge label={status} color={statusColor} /></Td>
                    <Td muted>{o.serverName || '—'}</Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setInvoiceHistoryOrder(o); }}
                          title="View Invoice Audit History"
                          style={{
                            background: 'rgba(30, 94, 74, 0.08)',
                            border: '1px solid rgba(30, 94, 74, 0.2)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            padding: '3px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            color: 'var(--primary)',
                            fontSize: '0.72rem',
                            fontWeight: 600
                          }}
                        >
                          <History size={12} /> History
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handlePrintInvoice(o); }}
                          title="Print Invoice"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                        >
                          <Printer size={14} color="var(--text-muted)" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              <tr>
                <TdSummary colSpan={3} bold>
                  TOTAL ({totals.count} {totals.count === 1 ? 'Invoice' : 'Invoices'}{totals.isExplicitVoided ? ' • Voided Invoices' : totals.voidedCount > 0 ? ` • ${totals.voidedCount} voided excluded` : ''}{paymentTypeFilter !== 'All' && paymentTypeFilter !== 'Split' ? ` • ${paymentTypeFilter} Total` : ''})
                </TdSummary>
                <TdSummary right bold>{fmt(totals.totalAmount)}</TdSummary>
                <TdSummary colSpan={4} />
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>

      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Invoice Details: ${selectedOrder?.billNo || selectedOrder?.id?.slice(0, 8) || ''}`} wide>
        {selectedOrder && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: '0.82rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Date: </span><strong>{fmtDateTime(selectedOrder.createdAt)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Type: </span><strong>{selectedOrder.orderType || (selectedOrder.tableId ? 'Dine-in' : 'Takeout')}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Table: </span><strong>{selectedOrder.tableId ? `T-${selectedOrder.tableId}` : 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Server: </span><strong>{selectedOrder.serverName || 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Payment: </span><strong>{selectedOrder.paymentMethod || 'N/A'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Status: </span><Badge label={selectedOrder.status || 'Closed'} color={selectedOrder.status === 'Voided' || selectedOrder.status === 'voided' ? '#ef4444' : '#22c55e'} /></div>
              {(selectedOrder.paymentSplits || selectedOrder.timestamps?.paymentSplits)?.length > 0 && (
                <div style={{ gridColumn: 'span 2', padding: '8px 12px', background: 'rgba(30, 94, 74, 0.05)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(30, 94, 74, 0.15)' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: 4 }}>Split Payment Breakdown:</span>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(selectedOrder.paymentSplits || selectedOrder.timestamps?.paymentSplits).map((sp, i) => (
                      <span key={i} style={{ fontSize: '0.78rem' }}>
                        <strong>{sp.method}:</strong> {fmt(sp.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInvoiceHistoryOrder(selectedOrder)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--primary)' }}
              >
                <History size={14} /> View Audit History
              </button>
              <button className="btn btn-secondary" onClick={() => handlePrintInvoice(selectedOrder)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <Printer size={14} /> Print Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>

      {invoiceHistoryOrder && (
        <InvoiceHistoryModal
          order={invoiceHistoryOrder}
          onClose={() => setInvoiceHistoryOrder(null)}
        />
      )}
    </div>
  );
};

const DENOM_LABELS = {
  2000: '₹2,000 Note',
  500: '₹500 Note',
  200: '₹200 Note',
  100: '₹100 Note',
  50: '₹50 Note',
  20: '₹20 Note',
  10: '₹10 Note',
  5: '₹5 Coin/Note',
  2: '₹2 Coin',
  1: '₹1 Coin'
};

const RegisterClosuresReport = () => {
  const { registerClosures, updateRegisterClosure, orders } = useApp();
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [editClosure, setEditClosure] = useState(null);
  const [viewClosure, setViewClosure] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit Form state
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [depositNotes, setDepositNotes] = useState('');

  const { sortField, sortDirection, handleSort } = useSort('shiftEnd', 'desc');

  // Enrich closures with chronological previous closure dates and payment method aggregates from orders
  const enrichedClosures = useMemo(() => {
    const sorted = [...(registerClosures || [])].sort((a, b) => new Date(a.shiftEnd) - new Date(b.shiftEnd));
    
    const mapped = sorted.map((c, i) => {
      const prev = i > 0 ? sorted[i-1] : null;
      const prevDate = prev ? prev.shiftEnd : null;

      const start = c.shiftStart ? new Date(c.shiftStart) : null;
      const end = c.shiftEnd ? new Date(c.shiftEnd) : null;

      let cardSales = 0;
      let upiSales = 0;
      let cashTips = 0;
      let cardTips = 0;
      let upiTips = 0;

      if (start && end) {
        orders.forEach(o => {
          if (!o.createdAt) return;
          const t = new Date(o.createdAt);
          if (t >= start && t <= end) {
            const method = (o.paymentMethod || '').toLowerCase();
            const total = o.total || 0;
            const tip = o.tip || 0;
            
            const splits = getOrderPaymentSplits(o);
            if (Array.isArray(splits) && splits.length > 0) {
              splits.forEach(sp => {
                const m = (sp.method || '').toLowerCase();
                const amt = parseFloat(sp.amount || 0);
                if (m.includes('card')) {
                  cardSales += amt;
                } else if (m.includes('upi') || m.includes('custom') || m.includes('wallet')) {
                  upiSales += amt;
                }
              });
              if (tip > 0 && total > 0) {
                splits.forEach(sp => {
                  const m = (sp.method || '').toLowerCase();
                  const share = (parseFloat(sp.amount || 0) / total) * tip;
                  if (m.includes('card')) cardTips += share;
                  else if (m.includes('upi') || m.includes('custom') || m.includes('wallet')) upiTips += share;
                  else if (m.includes('cash')) cashTips += share;
                });
              }
            } else {
              if (method.includes('card')) {
                cardSales += total;
                cardTips += tip;
              } else if (method.includes('upi') || method.includes('custom') || method.includes('wallet')) {
                upiSales += total;
                upiTips += tip;
              } else if (method.includes('cash')) {
                cashTips += tip;
              }
            }
          }
        });
      }

      return {
        ...c,
        previousClosureDate: prevDate,
        cardSales,
        upiSales,
        cashTips,
        cardTips,
        upiTips
      };
    });

    return mapped;
  }, [registerClosures, orders]);

  const filtered = useMemo(() => {
    let result = filterByRange(enrichedClosures, range, dateFrom, dateTo, 'shiftEnd');
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        (c.closedBy || '').toLowerCase().includes(q) || 
        (c.notes || '').toLowerCase().includes(q) ||
        (c.bankName || '').toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [enrichedClosures, range, dateFrom, dateTo, searchQuery]);

  const sortedClosures = useMemo(() => {
    return sortData(filtered, sortField, sortDirection);
  }, [filtered, sortField, sortDirection]);

  const handleEditClick = (c) => {
    setEditClosure(c);
    setOpeningBalance(c.openingBalance || 0);
    setActualCash(c.actualCash || 0);
    setNotes(c.notes || '');
    setDepositAmount(c.depositAmount || 0);
    setBankName(c.bankName || '');
    setDepositNotes(c.depositNotes || '');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editClosure) return;
    await updateRegisterClosure(editClosure.id, {
      openingBalance: parseFloat(openingBalance) || 0,
      actualCash: parseFloat(actualCash) || 0,
      notes,
      depositAmount: parseFloat(depositAmount) || 0,
      bankName,
      depositNotes
    });
    setEditClosure(null);
  };

  const totals = useMemo(() => {
    return filtered.reduce((s, c) => ({
      cashCollected: s.cashCollected + (c.cashIn || 0),
      cashPaid: s.cashPaid + (c.cashOut || 0) + (c.drops || []).reduce((sum, d) => sum + d.amount, 0),
      cashDeposited: s.cashDeposited + (c.depositAmount || 0),
      variance: s.variance + (c.variance || 0)
    }), { cashCollected: 0, cashPaid: 0, cashDeposited: 0, variance: 0 });
  }, [filtered]);

  const handleExport = () => {
    const rows = [
      'Center Name,Register Name,Closure Date,Previous Closure Date,Opening Balance,Closing Balance,Cash Collected,Cash Paid,Cash Deposited,Cash Adjustments,Card,Custom,Cash Tips,Card Tips,Submitted By,Notes',
      ...sortedClosures.map(c => {
        const closingBalance = (c.actualCash || 0) - (c.depositAmount || 0);
        const cashPaid = (c.cashOut || 0) + (c.drops || []).reduce((sum, d) => sum + d.amount, 0);
        return `"Main Center","Register 1","${fmtDateTime(c.shiftEnd)}","${fmtDateTime(c.previousClosureDate)}",${c.openingBalance},${closingBalance},${c.cashIn || 0},${cashPaid},${c.depositAmount || 0},${c.variance || 0},${c.cardSales || 0},${c.upiSales || 0},${c.cashTips || 0},${c.cardTips || 0},"${c.closedBy || ''}","${c.notes || ''}"`;
      }),
    ];
    downloadCSV('register_closure_report_v2.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-light)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', marginLeft: 8 }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by notes or staff..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', outline: 'none', color: 'var(--text-primary)', width: 180 }}
          />
        </div>

        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Cash Collected" value={fmt(totals.cashCollected)} color="#1e5e4a" icon={IndianRupee} />
        <StatCard label="Total Cash Payouts" value={fmt(totals.cashPaid)} color="#ef4444" icon={TrendingDown} />
        <StatCard label="Total Cash Deposited" value={fmt(totals.cashDeposited)} color="#22c55e" icon={Receipt} />
        <StatCard 
          label="Net Cash Variance" 
          value={(totals.variance >= 0 ? '+' : '') + fmt(totals.variance)} 
          color={totals.variance >= 0 ? '#22c55e' : '#ef4444'} 
          icon={totals.variance >= 0 ? CheckCircle : AlertTriangle} 
        />
      </div>

      <div className="card">
        <SectionTitle>Register Closure Audit Log (v2)</SectionTitle>
        {sortedClosures.length === 0 ? <Empty text="No register closures logged for this period." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="center" sortDirection={sortDirection} onSort={handleSort}>Center Name</Th>
                <Th sortField={sortField} currentField="register" sortDirection={sortDirection} onSort={handleSort}>Register Name</Th>
                <Th sortField={sortField} currentField="shiftEnd" sortDirection={sortDirection} onSort={handleSort}>Closure Date</Th>
                <Th sortField={sortField} currentField="previousClosureDate" sortDirection={sortDirection} onSort={handleSort}>Prev Closure Date</Th>
                <Th right sortField={sortField} currentField="openingBalance" sortDirection={sortDirection} onSort={handleSort}>Opening Float</Th>
                <Th right sortField={sortField} currentField="closingBalance" sortDirection={sortDirection} onSort={handleSort}>Closing Balance</Th>
                <Th right sortField={sortField} currentField="cashIn" sortDirection={sortDirection} onSort={handleSort}>Cash Collected</Th>
                <Th right sortField={sortField} currentField="cashOut" sortDirection={sortDirection} onSort={handleSort}>Cash Paid</Th>
                <Th right sortField={sortField} currentField="depositAmount" sortDirection={sortDirection} onSort={handleSort}>Cash Deposited</Th>
                <Th right sortField={sortField} currentField="variance" sortDirection={sortDirection} onSort={handleSort}>Cash Adjustments</Th>
                <Th right sortField={sortField} currentField="cardSales" sortDirection={sortDirection} onSort={handleSort}>Card</Th>
                <Th right sortField={sortField} currentField="upiSales" sortDirection={sortDirection} onSort={handleSort}>Custom (UPI)</Th>
                <Th right sortField={sortField} currentField="cashTips" sortDirection={sortDirection} onSort={handleSort}>Cash Tips</Th>
                <Th right sortField={sortField} currentField="cardTips" sortDirection={sortDirection} onSort={handleSort}>Card Tips</Th>
                <Th sortField={sortField} currentField="closedBy" sortDirection={sortDirection} onSort={handleSort}>Submitted By</Th>
                <Th sortField={sortField} currentField="notes" sortDirection={sortDirection} onSort={handleSort}>Notes</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {sortedClosures.map(c => {
                const varColor = c.variance === 0 ? 'var(--text-primary)' : c.variance > 0 ? 'var(--success)' : 'var(--danger)';
                const closingBalance = (c.actualCash || 0) - (c.depositAmount || 0);
                const cashPaid = (c.cashOut || 0) + (c.drops || []).reduce((sum, d) => sum + d.amount, 0);
                return (
                  <tr key={c.id}>
                    <Td muted>Main Center</Td>
                    <Td bold>
                      <button 
                        style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 700, padding: 0, textDecoration: 'underline', cursor: 'pointer' }}
                        onClick={() => setViewClosure(c)}
                      >
                        Register 1
                      </button>
                    </Td>
                    <Td>{fmtDateTime(c.shiftEnd)}</Td>
                    <Td muted>{fmtDateTime(c.previousClosureDate)}</Td>
                    <Td right>{fmt(c.openingBalance)}</Td>
                    <Td right bold>{fmt(closingBalance)}</Td>
                    <Td right>{fmt(c.cashIn || 0)}</Td>
                    <Td right>{fmt(cashPaid)}</Td>
                    <Td right>{fmt(c.depositAmount || 0)}</Td>
                    <Td right bold style={{ color: varColor }}>
                      {c.variance > 0 ? '+' : ''}{fmt(c.variance)}
                    </Td>
                    <Td right>{fmt(c.cardSales || 0)}</Td>
                    <Td right>{fmt(c.upiSales || 0)}</Td>
                    <Td right>{fmt(c.cashTips || 0)}</Td>
                    <Td right>{fmt(c.cardTips || 0)}</Td>
                    <Td bold>{c.closedBy || 'Manager'}</Td>
                    <Td muted style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.notes}>{c.notes || '—'}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary" onClick={() => handleEditClick(c)} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                          Edit
                        </button>
                        <button className="btn btn-secondary" onClick={() => setViewClosure(c)} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                          Details
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Edit closure details Modal */}
      <Modal open={!!editClosure} onClose={() => setEditClosure(null)} title="Edit Register Closure details">
        {editClosure && (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Opening Cash Float (₹)
                </label>
                <input
                  className="input-field"
                  type="number"
                  required
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Actual Cash Counted (₹)
                </label>
                <input
                  className="input-field"
                  type="number"
                  required
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Bank Deposit Amount (₹)
                </label>
                <input
                  className="input-field"
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Bank Name
                </label>
                <input
                  className="input-field"
                  type="text"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Deposit Notes / Reference
              </label>
              <input
                className="input-field"
                type="text"
                value={depositNotes}
                onChange={e => setDepositNotes(e.target.value)}
                placeholder="e.g. Challan #9872"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Closure Notes / Adjustments Reason
              </label>
              <textarea
                className="input-field"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditClosure(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        )}
      </Modal>

      {/* View detailed cash counts Modal */}
      <Modal open={!!viewClosure} onClose={() => setViewClosure(null)} title="Register Cash Count details" wide>
        {viewClosure && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shift Period</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmtDateTime(viewClosure.shiftStart)} - {fmtDateTime(viewClosure.shiftEnd)}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Closed By</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{viewClosure.closedBy}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Register Name</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Register 1 (Main Center)</span>
              </div>
            </div>

            {/* Reconciliation table */}
            <div>
              <SectionTitle>Shift Reconciliation</SectionTitle>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Item Description</Th>
                    <Th right>Expected (₹)</Th>
                    <Th right>Actual Counted (₹)</Th>
                    <Th right>Variance (₹)</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td bold>Opening Float</Td>
                    <Td right>{fmt(viewClosure.openingBalance)}</Td>
                    <Td right>{fmt(viewClosure.openingBalance)}</Td>
                    <Td right>₹0.00</Td>
                  </tr>
                  <tr>
                    <Td bold>Cash Collected (Sales)</Td>
                    <Td right>{fmt(viewClosure.cashIn || 0)}</Td>
                    <Td right>{fmt(viewClosure.cashIn || 0)}</Td>
                    <Td right>₹0.00</Td>
                  </tr>
                  <tr>
                    <Td bold>Cash Paid Out (Payouts & drops)</Td>
                    <Td right>{fmt((viewClosure.cashOut || 0) + (viewClosure.drops || []).reduce((s, d) => s + d.amount, 0))}</Td>
                    <Td right>{fmt((viewClosure.cashOut || 0) + (viewClosure.drops || []).reduce((s, d) => s + d.amount, 0))}</Td>
                    <Td right>₹0.00</Td>
                  </tr>
                  <tr style={{ background: 'rgba(30, 94, 74, 0.04)', fontWeight: 700 }}>
                    <Td>Net Drawer Cash</Td>
                    <Td right>{fmt(viewClosure.expectedBalance)}</Td>
                    <Td right>{fmt(viewClosure.actualCash)}</Td>
                    <Td right style={{ color: viewClosure.variance === 0 ? 'var(--text-primary)' : viewClosure.variance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {viewClosure.variance > 0 ? '+' : ''}{fmt(viewClosure.variance)}
                    </Td>
                  </tr>
                </tbody>
              </TableWrap>
            </div>

            {/* Denominations counts */}
            {viewClosure.denominations && Object.keys(viewClosure.denominations).length > 0 && (
              <div>
                <SectionTitle>Closing Cash Denomination Breakdown</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', margin: '12px 0' }}>
                  {[2000, 500, 200, 100, 50, 20, 10, 5, 2, 1].map(v => {
                    const count = viewClosure.denominations[v] || 0;
                    return (
                      <div key={v} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(30, 94, 74, 0.02)', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{DENOM_LABELS[v]}</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{count} pcs</span>
                        {count > 0 && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                            ₹{(count * v).toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mid-day drops */}
            {viewClosure.drops && viewClosure.drops.length > 0 && (
              <div>
                <SectionTitle>Mid-day Drops / Cash Payouts</SectionTitle>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Time</Th>
                      <Th>Type</Th>
                      <Th right>Amount (₹)</Th>
                      <Th>Reason / Note</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewClosure.drops.map((d, index) => (
                      <tr key={index}>
                        <Td>{fmtDateTime(d.timestamp || d.time)}</Td>
                        <Td bold>Cash Drop</Td>
                        <Td right bold style={{ color: 'var(--danger)' }}>{fmt(d.amount)}</Td>
                        <Td muted>{d.reason || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )}

            {/* Bank Deposit details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'rgba(30, 94, 74, 0.04)', padding: 12, borderRadius: 10 }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bank Deposit Details</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Bank: {viewClosure.bankName || 'Not deposited'}</span>
                {viewClosure.depositNotes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Note: {viewClosure.depositNotes}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amounts</span>
                <div style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Deposited:</span> <strong>{fmt(viewClosure.depositAmount || 0)}</strong></div>
                <div style={{ fontSize: '0.85rem', marginTop: 2 }}><span style={{ color: 'var(--text-muted)' }}>Leftover Float:</span> <strong>{fmt((viewClosure.actualCash || 0) - (viewClosure.depositAmount || 0))}</strong></div>
              </div>
            </div>

            {viewClosure.notes && (
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Notes</span>
                <p style={{ fontSize: '0.8rem', background: 'var(--bg-light)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle)', margin: 0 }}>
                  {viewClosure.notes}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-secondary" onClick={() => setViewClosure(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const SalesAccrualReport = ({ orders, settings }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('date', 'desc');

  // Itemized Accrual Apportionment Logic
  const processed = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);
    const globalPricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;

    if (statusFilter !== 'All') {
      if (statusFilter === 'Closed') {
        arr = arr.filter(o => o.status === 'Closed' || o.status === 'Completed' || o.status === 'paid');
      } else if (statusFilter === 'Open') {
        arr = arr.filter(o => o.status !== 'Closed' && o.status !== 'Completed' && o.status !== 'paid');
      }
    }

    arr = arr.filter(o => {
      const s = (o.status || '').toLowerCase();
      return s !== 'voided' && s !== 'cancelled';
    });

    if (paymentTypeFilter !== 'All') {
      arr = arr.filter(o => orderMatchesPaymentType(o, paymentTypeFilter));
    }

    const itemized = [];

    arr.forEach(o => {
      const isClosed = o.status === 'Closed' || o.status === 'Completed' || o.status === 'paid';
      const orderPricesIncludeGst = o.pricesIncludeGst !== undefined ? o.pricesIncludeGst : globalPricesIncludeGst;

      const orderDiscount = parseFloat(o.discount || o.discountAmount || 0);
      const orderTax = parseFloat(o.tax || 0);
      const itemsTotal = (o.items && o.items.length > 0)
        ? o.items.reduce((sum, i) => sum + (parseFloat(i.price || 0) * (i.qty || 1)), 0)
        : parseFloat(o.subtotal || o.total || 0);

      let methodRatio = 1;
      if (paymentTypeFilter !== 'All' && paymentTypeFilter !== 'Split') {
        const orderTotal = parseFloat(o.total || 0);
        const methodAmt = getOrderPaymentAmount(o, paymentTypeFilter);
        if (orderTotal > 0) {
          methodRatio = Math.min(1, methodAmt / orderTotal);
        }
      }

      const itemList = (o.items && o.items.length > 0)
        ? o.items
        : [{ name: 'Order #' + (o.billNo || o.id?.slice(0, 8)), price: itemsTotal, qty: 1 }];

      itemList.forEach(item => {
        const itemQty = item.qty || 1;
        const itemRaw = parseFloat(item.price || 0) * itemQty;
        
        // Apportionment ratio
        const ratio = itemsTotal > 0 ? (itemRaw / itemsTotal) : 0;
        
        const apportionedDiscount = ratio * orderDiscount * methodRatio;
        const apportionedTax = ratio * orderTax * methodRatio;
        
        let salesExcTax = 0;
        let salesIncTax = 0;

        if (orderPricesIncludeGst) {
          salesIncTax = (itemRaw * methodRatio) - apportionedDiscount;
          salesExcTax = salesIncTax - apportionedTax;
        } else {
          salesExcTax = (itemRaw * methodRatio) - apportionedDiscount;
          salesIncTax = salesExcTax + apportionedTax;
        }

        const collected = isClosed ? salesIncTax : 0;
        const due = isClosed ? 0 : salesIncTax;

        itemized.push({
          id: `${o.id}_${item.name}`,
          date: o.createdAt,
          billNo: o.billNo || o.id?.slice(0, 8),
          guestName: o.guestName || 'Walk-in',
          itemName: item.name,
          category: item.category || 'Uncategorized',
          qty: itemQty,
          salesExcTax,
          tax: apportionedTax,
          salesIncTax,
          discount: apportionedDiscount,
          collected,
          due,
          paymentMethod: o.paymentMethod || 'N/A',
          status: o.status || 'paid'
        });
      });
    });

    return itemized;
  }, [orders, range, dateFrom, dateTo, statusFilter, paymentTypeFilter, settings]);

  const sortedData = useMemo(() => {
    return sortData(processed, sortField, sortDirection);
  }, [processed, sortField, sortDirection]);

  const totals = useMemo(() => {
    return sortedData.reduce((s, r) => ({
      qty: s.qty + r.qty,
      salesExcTax: s.salesExcTax + r.salesExcTax,
      tax: s.tax + r.tax,
      salesIncTax: s.salesIncTax + r.salesIncTax,
      discount: s.discount + r.discount,
      collected: s.collected + r.collected,
      due: s.due + r.due
    }), { qty: 0, salesExcTax: 0, tax: 0, salesIncTax: 0, discount: 0, collected: 0, due: 0 });
  }, [sortedData]);

  const handleExport = () => {
    const rows = [
      'Sale Date,Invoice#,Guest Name,Item Name,Category,Qty,Sales (Exc. Tax),Tax,Sales (Inc. Tax),Discount,Collected,Due,Payment Type,Status',
      ...sortedData.map(r =>
        `"${fmtDateTime(r.date)}","${r.billNo}","${r.guestName}","${r.itemName}","${r.category}",${r.qty},${r.salesExcTax.toFixed(2)},${r.tax.toFixed(2)},${r.salesIncTax.toFixed(2)},${r.discount.toFixed(2)},${r.collected.toFixed(2)},${r.due.toFixed(2)},"${r.paymentMethod}","${r.status}"`
      ),
    ];
    downloadCSV('sales_accrual_report.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="All">All Invoices</option>
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
        </Select>

        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment:</span>
        <Select value={paymentTypeFilter} onChange={setPaymentTypeFilter}>
          <option value="All">All Types</option>
          <option value="Cash">Cash</option>
          <option value="Card">Card</option>
          <option value="UPI">UPI</option>
          <option value="Split">Split</option>
          <option value="Wallet">Wallet</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div className="card">
        <SectionTitle>Sales Accrual Report</SectionTitle>
        {sortedData.length === 0 ? <Empty text="No items sold during this period." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="date" sortDirection={sortDirection} onSort={handleSort}>Sale Date</Th>
                <Th sortField={sortField} currentField="billNo" sortDirection={sortDirection} onSort={handleSort}>Invoice#</Th>
                <Th sortField={sortField} currentField="guestName" sortDirection={sortDirection} onSort={handleSort}>Guest Name</Th>
                <Th sortField={sortField} currentField="itemName" sortDirection={sortDirection} onSort={handleSort}>Item Name</Th>
                <Th sortField={sortField} currentField="category" sortDirection={sortDirection} onSort={handleSort}>Category</Th>
                <Th right sortField={sortField} currentField="qty" sortDirection={sortDirection} onSort={handleSort}>Qty</Th>
                <Th right sortField={sortField} currentField="salesExcTax" sortDirection={sortDirection} onSort={handleSort}>Sales (Exc. Tax)</Th>
                <Th right sortField={sortField} currentField="tax" sortDirection={sortDirection} onSort={handleSort}>Tax</Th>
                <Th right sortField={sortField} currentField="salesIncTax" sortDirection={sortDirection} onSort={handleSort}>Sales (Inc. Tax)</Th>
                <Th right sortField={sortField} currentField="collected" sortDirection={sortDirection} onSort={handleSort}>Collected</Th>
                <Th right sortField={sortField} currentField="due" sortDirection={sortDirection} onSort={handleSort}>Due</Th>
                <Th sortField={sortField} currentField="status" sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(r => (
                <tr key={r.id}>
                  <Td>{fmtDateTime(r.date)}</Td>
                  <Td bold>{r.billNo}</Td>
                  <Td>{r.guestName}</Td>
                  <Td bold>{r.itemName}</Td>
                  <Td muted>{r.category}</Td>
                  <Td right>{r.qty}</Td>
                  <Td right>{fmt(r.salesExcTax)}</Td>
                  <Td right muted>{fmt(r.tax)}</Td>
                  <Td right bold>{fmt(r.salesIncTax)}</Td>
                  <Td right style={{ color: r.collected > 0 ? 'var(--success)' : 'inherit' }}>{fmt(r.collected)}</Td>
                  <Td right style={{ color: r.due > 0 ? 'var(--danger)' : 'inherit' }}>{fmt(r.due)}</Td>
                  <Td><Badge label={r.status} color={r.status === 'Closed' || r.status === 'Completed' ? '#22c55e' : '#ef4444'} /></Td>
                </tr>
              ))}
              <tr>
                <TdSummary colSpan={5} bold>TOTAL</TdSummary>
                <TdSummary right bold>{totals.qty}</TdSummary>
                <TdSummary right bold>{fmt(totals.salesExcTax)}</TdSummary>
                <TdSummary right bold>{fmt(totals.tax)}</TdSummary>
                <TdSummary right bold>{fmt(totals.salesIncTax)}</TdSummary>
                <TdSummary right bold>{fmt(totals.collected)}</TdSummary>
                <TdSummary right bold>{fmt(totals.due)}</TdSummary>
                <TdSummary />
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

const SalesInvoicingTab = ({ orders, settings }) => {
  const [subTab, setSubTab] = useState('daily');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`btn ${subTab === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('daily')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Daily Sales Summary
        </button>
        <button className={`btn ${subTab === 'register' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('register')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Detailed Invoice Register
        </button>
        <button className={`btn ${subTab === 'closures' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('closures')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Register Closures
        </button>
        <button className={`btn ${subTab === 'accrual' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('accrual')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Sales Accrual
        </button>
      </div>

      {subTab === 'daily' ? (
        <DailySalesSummaryReport orders={orders} settings={settings} />
      ) : subTab === 'register' ? (
        <DetailedInvoiceRegisterReport orders={orders} settings={settings} />
      ) : subTab === 'closures' ? (
        <RegisterClosuresReport />
      ) : (
        <SalesAccrualReport orders={orders} settings={settings} />
      )}
    </div>
  );
};

// =================================================================
// TAB 3 -- TAX FILING & COMPLIANCE
// =================================================================

const TaxComplianceTab = ({ orders, settings }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [taxTypeFilter, setTaxTypeFilter] = useState('All');
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'invoices'
  const [searchQuery, setSearchQuery] = useState('');

  const { sortField, sortDirection, handleSort } = useSort('name', 'asc');
  const {
    sortField: invSortField,
    sortDirection: invSortDirection,
    handleSort: handleInvSort
  } = useSort('date', 'desc');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  // Exclude voided and cancelled orders from tax liability
  const { validOrders, voidedOrders, voidedTaxAmount } = useMemo(() => {
    const valid = [];
    const voided = [];
    let voidedTax = 0;
    (filtered || []).forEach(o => {
      const s = (o.status || '').toLowerCase();
      const p = (o.paymentMethod || '').toLowerCase();
      if (s === 'voided' || s === 'cancelled' || p === 'voided') {
        voided.push(o);
        voidedTax += parseFloat(o.tax || 0);
      } else {
        valid.push(o);
      }
    });
    return { validOrders: valid, voidedOrders: voided, voidedTaxAmount: voidedTax };
  }, [filtered]);

  const defaultGst = parseFloat(settings?.billing?.gstRate ?? 5) || 5;
  const globalPricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;
  const gstin = settings?.restaurant?.gstin || '';
  const fssai = settings?.restaurant?.fssai || '';
  const restaurantName = settings?.restaurant?.name || 'Restaurant';

  // Tax Slabs & Liability Aggregation
  const taxData = useMemo(() => {
    const slabs = {
      'Food Tax': {
        key: 'Food Tax',
        name: `${defaultGst}% Restaurant Food GST`,
        rate: defaultGst,
        type: 'GST',
        desc: 'Standard dining & prepared food (CGST + SGST)',
        taxable: 0,
        cgst: 0,
        sgst: 0,
        vat: 0,
        collected: 0,
        ordersCount: 0,
      },
      'Takeout GST': {
        key: 'Takeout GST',
        name: `${defaultGst}% Takeout & Delivery GST`,
        rate: defaultGst,
        type: 'GST',
        desc: 'Takeout, off-premise & delivery orders (CGST + SGST)',
        taxable: 0,
        cgst: 0,
        sgst: 0,
        vat: 0,
        collected: 0,
        ordersCount: 0,
      },
      'Beverage Tax': {
        key: 'Beverage Tax',
        name: '12% Beverage GST',
        rate: 12,
        type: 'GST',
        desc: 'Carbonated & packaged beverages (CGST + SGST)',
        taxable: 0,
        cgst: 0,
        sgst: 0,
        vat: 0,
        collected: 0,
        ordersCount: 0,
      },
      'Alcohol Tax': {
        key: 'Alcohol Tax',
        name: '18% Liquor / Alcohol VAT',
        rate: 18,
        type: 'VAT',
        desc: 'State VAT on alcoholic beverages & bar sales',
        taxable: 0,
        cgst: 0,
        sgst: 0,
        vat: 0,
        collected: 0,
        ordersCount: 0,
      },
    };

    const slabOrderSets = {
      'Food Tax': new Set(),
      'Takeout GST': new Set(),
      'Beverage Tax': new Set(),
      'Alcohol Tax': new Set(),
    };

    validOrders.forEach(o => {
      const isTakeout = !o.tableId || (o.orderType || '').toLowerCase() === 'takeout' || (o.orderType || '').toLowerCase() === 'delivery';
      const orderPricesIncludeGst = o.pricesIncludeGst !== undefined ? o.pricesIncludeGst : globalPricesIncludeGst;
      const orderItems = o.items || [];
      const orderDiscount = parseFloat(o.discount || o.discountAmount || 0);

      // If order has no items list (e.g. legacy/third-party), categorize via order totals
      if (orderItems.length === 0) {
        const orderTax = parseFloat(o.tax || 0);
        const orderSubtotal = parseFloat(o.subtotal || 0) || (orderPricesIncludeGst ? (parseFloat(o.total || 0) - orderTax) : parseFloat(o.total || 0));
        const targetSlab = isTakeout ? 'Takeout GST' : 'Food Tax';
        slabs[targetSlab].taxable += orderSubtotal;
        slabs[targetSlab].collected += orderTax;
        slabs[targetSlab].cgst += orderTax / 2;
        slabs[targetSlab].sgst += orderTax / 2;
        slabOrderSets[targetSlab].add(o.id || o.billNo);
        return;
      }

      const rawItemsSum = orderItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1), 0);
      const discountRatio = (rawItemsSum > 0 && orderDiscount > 0) ? Math.max(0, 1 - (orderDiscount / rawItemsSum)) : 1;

      orderItems.forEach(item => {
        const cat = (item.category || '').toLowerCase();
        const tg = (item.taxGroup || '').toLowerCase();
        const isAlcohol = tg === 'alcohol' || cat.includes('alcohol') || cat.includes('bar') || cat.includes('liquor') || cat.includes('beer') || cat.includes('wine');
        const isBev = cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee') || cat.includes('tea') || cat.includes('shake');

        let slabKey;
        if (isAlcohol) slabKey = 'Alcohol Tax';
        else if (isTakeout) slabKey = 'Takeout GST';
        else if (isBev) slabKey = 'Beverage Tax';
        else slabKey = 'Food Tax';

        const rate = slabs[slabKey].rate;
        const grossRevenue = (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1);
        const netRevenue = grossRevenue * discountRatio;

        if (!item.taxExempt) {
          let taxable = 0;
          let taxCollected = 0;

          if (orderPricesIncludeGst) {
            taxCollected = rate > 0 ? netRevenue - (netRevenue / (1 + rate / 100)) : 0;
            taxable = netRevenue - taxCollected;
          } else {
            taxable = netRevenue;
            taxCollected = taxable * (rate / 100);
          }

          slabs[slabKey].taxable += taxable;
          slabs[slabKey].collected += taxCollected;

          if (slabs[slabKey].type === 'GST') {
            slabs[slabKey].cgst += taxCollected / 2;
            slabs[slabKey].sgst += taxCollected / 2;
          } else {
            slabs[slabKey].vat += taxCollected;
          }

          slabOrderSets[slabKey].add(o.id || o.billNo);
        }
      });
    });

    Object.keys(slabs).forEach(k => {
      slabs[k].ordersCount = slabOrderSets[k].size;
    });

    let result = Object.values(slabs);
    if (taxTypeFilter !== 'All') {
      result = result.filter(r => r.type === taxTypeFilter);
    }
    return result;
  }, [validOrders, taxTypeFilter, defaultGst, globalPricesIncludeGst]);

  const sortedTaxData = useMemo(() => {
    return sortData(taxData || [], sortField, sortDirection, {
      totalValue: t => (t.taxable || 0) + (t.collected || 0)
    });
  }, [taxData, sortField, sortDirection]);

  const totals = useMemo(() => {
    return (taxData || []).reduce((s, r) => ({
      taxable: s.taxable + (r.taxable || 0),
      cgst: s.cgst + (r.cgst || 0),
      sgst: s.sgst + (r.sgst || 0),
      vat: s.vat + (r.vat || 0),
      collected: s.collected + (r.collected || 0),
      totalValue: s.totalValue + ((r.taxable || 0) + (r.collected || 0))
    }), { taxable: 0, cgst: 0, sgst: 0, vat: 0, collected: 0, totalValue: 0 });
  }, [taxData]);

  // Invoice-Level Tax Register (B2C Audit)
  const invoiceTaxList = useMemo(() => {
    return validOrders.map(o => {
      const orderPricesIncludeGst = o.pricesIncludeGst !== undefined ? o.pricesIncludeGst : globalPricesIncludeGst;
      const orderItems = o.items || [];
      const orderDiscount = parseFloat(o.discount || o.discountAmount || 0);
      const rawItemsSum = orderItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1), 0);
      const discountRatio = (rawItemsSum > 0 && orderDiscount > 0) ? Math.max(0, 1 - (orderDiscount / rawItemsSum)) : 1;

      let orderTaxable = 0;
      let orderCgst = 0;
      let orderSgst = 0;
      let orderVat = 0;
      let orderTaxCollected = 0;

      if (orderItems.length === 0) {
        orderTaxCollected = parseFloat(o.tax || 0);
        orderTaxable = parseFloat(o.subtotal || 0) || (orderPricesIncludeGst ? (parseFloat(o.total || 0) - orderTaxCollected) : parseFloat(o.total || 0));
        orderCgst = orderTaxCollected / 2;
        orderSgst = orderTaxCollected / 2;
      } else {
        const isTakeout = !o.tableId || (o.orderType || '').toLowerCase() === 'takeout' || (o.orderType || '').toLowerCase() === 'delivery';
        orderItems.forEach(item => {
          if (item.taxExempt) {
            orderTaxable += (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1) * discountRatio;
            return;
          }
          const cat = (item.category || '').toLowerCase();
          const tg = (item.taxGroup || '').toLowerCase();
          const isAlcohol = tg === 'alcohol' || cat.includes('alcohol') || cat.includes('bar') || cat.includes('liquor') || cat.includes('beer') || cat.includes('wine');
          const isBev = cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee') || cat.includes('tea') || cat.includes('shake');

          let rate = defaultGst;
          let isVat = false;
          if (isAlcohol) { rate = 18; isVat = true; }
          else if (isTakeout) { rate = defaultGst; }
          else if (isBev) { rate = 12; }
          else { rate = defaultGst; }

          const netRev = (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1) * discountRatio;
          let taxCol = 0;
          let taxBase = 0;

          if (orderPricesIncludeGst) {
            taxCol = rate > 0 ? netRev - (netRev / (1 + rate / 100)) : 0;
            taxBase = netRev - taxCol;
          } else {
            taxBase = netRev;
            taxCol = taxBase * (rate / 100);
          }

          orderTaxable += taxBase;
          orderTaxCollected += taxCol;
          if (isVat) {
            orderVat += taxCol;
          } else {
            orderCgst += taxCol / 2;
            orderSgst += taxCol / 2;
          }
        });
      }

      return {
        id: o.id,
        billNo: o.billNo || `INV-${String(o.id).slice(0, 5)}`,
        date: o.createdAt || o.date || o.settledAt,
        orderType: o.orderType || (o.tableId ? 'Dine-in' : 'Takeout'),
        paymentMethod: o.paymentMethod || 'Cash',
        itemsCount: orderItems.reduce((s, i) => s + (parseFloat(i.qty || i.quantity) || 1), 0),
        gross: rawItemsSum || parseFloat(o.total || 0),
        discount: orderDiscount,
        taxable: orderTaxable,
        cgst: orderCgst,
        sgst: orderSgst,
        vat: orderVat,
        tax: orderTaxCollected,
        total: parseFloat(o.total || (orderTaxable + orderTaxCollected)),
      };
    });
  }, [validOrders, defaultGst, globalPricesIncludeGst]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return invoiceTaxList;
    const q = searchQuery.toLowerCase().trim();
    return invoiceTaxList.filter(inv =>
      (inv.billNo || '').toLowerCase().includes(q) ||
      (inv.orderType || '').toLowerCase().includes(q) ||
      (inv.paymentMethod || '').toLowerCase().includes(q)
    );
  }, [invoiceTaxList, searchQuery]);

  const sortedInvoices = useMemo(() => {
    return sortData(filteredInvoices, invSortField, invSortDirection, {
      date: inv => new Date(inv.date || 0).getTime()
    });
  }, [filteredInvoices, invSortField, invSortDirection]);

  const invoiceTotals = useMemo(() => {
    return filteredInvoices.reduce((s, inv) => ({
      taxable: s.taxable + inv.taxable,
      cgst: s.cgst + inv.cgst,
      sgst: s.sgst + inv.sgst,
      vat: s.vat + inv.vat,
      tax: s.tax + inv.tax,
      total: s.total + inv.total,
    }), { taxable: 0, cgst: 0, sgst: 0, vat: 0, tax: 0, total: 0 });
  }, [filteredInvoices]);

  const handleExport = () => {
    if (viewMode === 'invoices') {
      const rows = [
        'Invoice No,Date & Time,Order Type,Payment Method,Items Count,Gross Amount,Discount,Net Taxable,CGST,SGST,State VAT,Total Tax,Total Amount',
        ...sortedInvoices.map(inv =>
          `"${inv.billNo}","${fmtDateTime(inv.date)}","${inv.orderType}","${inv.paymentMethod}",${inv.itemsCount},${inv.gross.toFixed(2)},${inv.discount.toFixed(2)},${inv.taxable.toFixed(2)},${inv.cgst.toFixed(2)},${inv.sgst.toFixed(2)},${inv.vat.toFixed(2)},${inv.tax.toFixed(2)},${inv.total.toFixed(2)}`
        ),
        `"TOTAL","${range}","All","All",${filteredInvoices.reduce((s, i) => s + i.itemsCount, 0)},-,${filteredInvoices.reduce((s, i) => s + i.discount, 0).toFixed(2)},${invoiceTotals.taxable.toFixed(2)},${invoiceTotals.cgst.toFixed(2)},${invoiceTotals.sgst.toFixed(2)},${invoiceTotals.vat.toFixed(2)},${invoiceTotals.tax.toFixed(2)},${invoiceTotals.total.toFixed(2)}`
      ];
      downloadCSV(`tax_invoice_register_${range.toLowerCase().replace(/\s+/g, '_')}.csv`, rows);
    } else {
      const rows = [
        'Tax Name / Slab,Tax Type,Rate %,Gross Taxable Amount,CGST (Central Tax),SGST (State Tax),State VAT (Liquor),Total Tax Collected,Total Invoiced Value,Invoices Count',
        ...sortedTaxData.map(r =>
          `"${r.name}","${r.type}",${r.rate}%,${r.taxable.toFixed(2)},${r.cgst.toFixed(2)},${r.sgst.toFixed(2)},${r.vat.toFixed(2)},${r.collected.toFixed(2)},${((r.taxable || 0) + (r.collected || 0)).toFixed(2)},${r.ordersCount || 0}`
        ),
        `"TOTAL","All",-,${totals.taxable.toFixed(2)},${totals.cgst.toFixed(2)},${totals.sgst.toFixed(2)},${totals.vat.toFixed(2)},${totals.collected.toFixed(2)},${totals.totalValue.toFixed(2)},${validOrders.length}`
      ];
      downloadCSV(`tax_liability_summary_${range.toLowerCase().replace(/\s+/g, '_')}.csv`, rows);
    }
  };

  return (
    <div>
      {/* ── Statutory & Business Compliance Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        padding: '14px 18px', background: 'linear-gradient(135deg, rgba(30, 94, 74, 0.08), rgba(34, 197, 94, 0.05))',
        border: '1px solid rgba(30, 94, 74, 0.2)', borderRadius: 14, marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)' }}>{restaurantName}</span>
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(34, 197, 94, 0.15)', color: '#15803d' }}>
                TAX COMPLIANCE &amp; FILING
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: 16, marginTop: 3, flexWrap: 'wrap' }}>
              <span>GSTIN: <strong style={{ color: gstin ? 'var(--text-primary)' : 'var(--text-muted)' }}>{gstin || 'Not configured'}</strong></span>
              <span>FSSAI: <strong style={{ color: fssai ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fssai || 'Not configured'}</strong></span>
              <span>Billing Model: <strong style={{ color: 'var(--text-primary)' }}>{globalPricesIncludeGst ? 'Tax-Inclusive (Extracted)' : 'Tax-Exclusive (Added)'}</strong></span>
              <span>Standard GST: <strong style={{ color: 'var(--text-primary)' }}>{defaultGst}% (CGST {(defaultGst / 2).toFixed(1)}% + SGST {(defaultGst / 2).toFixed(1)}%)</strong></span>
            </div>
          </div>
        </div>

        {voidedOrders.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.73rem', color: '#b45309', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(245, 158, 11, 0.25)' }}>
            <AlertTriangle size={13} color="#f59e0b" />
            <span><strong>{voidedOrders.length} voided orders</strong> ({fmt(voidedOrders.reduce((s, o) => s + (o.total || 0), 0))}) excluded from liability</span>
          </div>
        )}
      </div>

      {/* ── Filter Bar & View Toggle ── */}
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />

        {/* View mode toggle */}
        <div style={{ display: 'flex', background: 'white', padding: 2, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setViewMode('summary')}
            style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
              background: viewMode === 'summary' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'summary' ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <Receipt size={13} /> Slabs Summary
          </button>
          <button
            onClick={() => setViewMode('invoices')}
            style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
              background: viewMode === 'invoices' ? 'var(--primary)' : 'transparent',
              color: viewMode === 'invoices' ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <FileSpreadsheet size={13} /> Invoice Register ({validOrders.length})
          </button>
        </div>

        {viewMode === 'summary' && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tax Type:</span>
            <Select value={taxTypeFilter} onChange={setTaxTypeFilter}>
              <option value="All">All Taxes</option>
              <option value="GST">GST (Goods &amp; Services Tax)</option>
              <option value="VAT">VAT (Value Added Tax)</option>
            </Select>
          </>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <ExportBtn onClick={handleExport} />
        </div>
      </FilterBar>

      {/* ── KPI Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard
          label="Net Taxable Turnover"
          value={fmt(totals.taxable)}
          sub={`${validOrders.length} settled orders`}
          color="#1e5e4a"
          icon={IndianRupee}
        />
        <StatCard
          label="Central GST (CGST)"
          value={fmt(totals.cgst)}
          sub="Central tax liability"
          color="#2563eb"
          icon={Receipt}
        />
        <StatCard
          label="State GST (SGST)"
          value={fmt(totals.sgst)}
          sub="State / UT tax liability"
          color="#7c3aed"
          icon={Receipt}
        />
        <StatCard
          label="Total Tax Collected"
          value={fmt(totals.collected)}
          sub={totals.vat > 0 ? `GST + ${fmt(totals.vat)} VAT` : 'Output tax liability'}
          color="#22c55e"
          icon={Receipt}
        />
        <StatCard
          label="Total Invoiced Value"
          value={fmt(totals.totalValue)}
          sub="Taxable + tax collected"
          color="#f59e0b"
          icon={TrendingUp}
        />
      </div>

      {/* ── View 1: Tax Slabs Summary ── */}
      {viewMode === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionTitle>Tax Liability Summary by Slabs</SectionTitle>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Period: <strong>{range}</strong>
              </span>
            </div>

            {sortedTaxData.length === 0 ? <Empty text="No taxable transactions found for this period." /> : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th sortField={sortField} currentField="name" sortDirection={sortDirection} onSort={handleSort}>Tax Name / Slab</Th>
                    <Th sortField={sortField} currentField="type" sortDirection={sortDirection} onSort={handleSort}>Type</Th>
                    <Th right sortField={sortField} currentField="rate" sortDirection={sortDirection} onSort={handleSort}>Rate %</Th>
                    <Th right sortField={sortField} currentField="taxable" sortDirection={sortDirection} onSort={handleSort}>Gross Taxable Amount</Th>
                    <Th right sortField={sortField} currentField="cgst" sortDirection={sortDirection} onSort={handleSort}>CGST (Central)</Th>
                    <Th right sortField={sortField} currentField="sgst" sortDirection={sortDirection} onSort={handleSort}>SGST (State)</Th>
                    <Th right sortField={sortField} currentField="vat" sortDirection={sortDirection} onSort={handleSort}>State VAT</Th>
                    <Th right sortField={sortField} currentField="collected" sortDirection={sortDirection} onSort={handleSort}>Tax Collected</Th>
                    <Th right sortField={sortField} currentField="totalValue" sortDirection={sortDirection} onSort={handleSort}>Total Invoice Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTaxData.map(t => (
                    <tr key={t.name}>
                      <Td bold>
                        <div>{t.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>{t.desc}</div>
                      </Td>
                      <Td>
                        <Badge label={t.type} color={t.type === 'GST' ? '#2563eb' : '#f59e0b'} />
                      </Td>
                      <Td right bold>{t.rate}%</Td>
                      <Td right>{fmt(t.taxable)}</Td>
                      <Td right style={{ color: '#2563eb' }}>{t.type === 'GST' ? fmt(t.cgst) : '—'}</Td>
                      <Td right style={{ color: '#7c3aed' }}>{t.type === 'GST' ? fmt(t.sgst) : '—'}</Td>
                      <Td right style={{ color: '#f59e0b' }}>{t.type === 'VAT' ? fmt(t.vat) : '—'}</Td>
                      <Td right bold style={{ color: 'var(--primary)' }}>{fmt(t.collected)}</Td>
                      <Td right bold>{fmt((t.taxable || 0) + (t.collected || 0))}</Td>
                    </tr>
                  ))}
                  <tr>
                    <TdSummary bold colSpan={3}>TOTAL LIABILITIES</TdSummary>
                    <TdSummary right bold>{fmt(totals.taxable)}</TdSummary>
                    <TdSummary right bold style={{ color: '#2563eb' }}>{fmt(totals.cgst)}</TdSummary>
                    <TdSummary right bold style={{ color: '#7c3aed' }}>{fmt(totals.sgst)}</TdSummary>
                    <TdSummary right bold style={{ color: '#f59e0b' }}>{fmt(totals.vat)}</TdSummary>
                    <TdSummary right bold>{fmt(totals.collected)}</TdSummary>
                    <TdSummary right bold>{fmt(totals.totalValue)}</TdSummary>
                  </tr>
                </tbody>
              </TableWrap>
            )}
          </div>

          {/* ── Statutory GSTR-3B Return Summary Card ── */}
          <div className="card" style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Building2 size={16} color="var(--primary)" />
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Statutory Return Breakdown (GSTR-3B Ready)
              </h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div style={{ background: 'white', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Table 3.1(a) Outward Taxable Supplies</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>{fmt(totals.taxable)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Total taxable sales turnover net of discounts</div>
              </div>
              <div style={{ background: 'white', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Central Tax Liability (CGST)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{fmt(totals.cgst)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>50% statutory share to Central Government</div>
              </div>
              <div style={{ background: 'white', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>State / UT Tax Liability (SGST)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{fmt(totals.sgst)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>50% statutory share to State Government</div>
              </div>
              {totals.vat > 0 && (
                <div style={{ background: 'white', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Non-GST / State VAT (Alcohol)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>{fmt(totals.vat)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Separate liquor VAT filing with Excise Dept</div>
                </div>
              )}
              <div style={{ background: 'white', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.04)' }}>
                <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700 }}>Total Output Tax Payable</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d', marginTop: 4 }}>{fmt(totals.collected)}</div>
                <div style={{ fontSize: '0.68rem', color: '#15803d', marginTop: 2 }}>Total tax collected for remittance</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View 2: Invoice Tax Register (Audit Trail) ── */}
      {viewMode === 'invoices' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <SectionTitle>Invoice-Level Tax Register</SectionTitle>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Itemized statutory tax breakdown for every settled bill in this period.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', minWidth: 220 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter by bill #, type, tender..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 10px 6px 30px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                    fontSize: '0.78rem', width: '100%', background: 'white', color: 'var(--text-primary)'
                  }}
                />
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ padding: '4px 8px', fontSize: '0.72rem', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {sortedInvoices.length === 0 ? <Empty text="No matching invoices found in this period." /> : (
            <TableWrap>
              <thead>
                <tr>
                  <Th sortField={invSortField} currentField="date" sortDirection={invSortDirection} onSort={handleInvSort}>Date &amp; Time</Th>
                  <Th sortField={invSortField} currentField="billNo" sortDirection={invSortDirection} onSort={handleInvSort}>Invoice #</Th>
                  <Th sortField={invSortField} currentField="orderType" sortDirection={invSortDirection} onSort={handleInvSort}>Type</Th>
                  <Th sortField={invSortField} currentField="paymentMethod" sortDirection={invSortDirection} onSort={handleInvSort}>Tender</Th>
                  <Th right sortField={invSortField} currentField="itemsCount" sortDirection={invSortDirection} onSort={handleInvSort}>Items</Th>
                  <Th right sortField={invSortField} currentField="gross" sortDirection={invSortDirection} onSort={handleInvSort}>Gross</Th>
                  <Th right sortField={invSortField} currentField="discount" sortDirection={invSortDirection} onSort={handleInvSort}>Disc.</Th>
                  <Th right sortField={invSortField} currentField="taxable" sortDirection={invSortDirection} onSort={handleInvSort}>Taxable</Th>
                  <Th right sortField={invSortField} currentField="cgst" sortDirection={invSortDirection} onSort={handleInvSort}>CGST</Th>
                  <Th right sortField={invSortField} currentField="sgst" sortDirection={invSortDirection} onSort={handleInvSort}>SGST</Th>
                  <Th right sortField={invSortField} currentField="vat" sortDirection={invSortDirection} onSort={handleInvSort}>VAT</Th>
                  <Th right sortField={invSortField} currentField="tax" sortDirection={invSortDirection} onSort={handleInvSort}>Total Tax</Th>
                  <Th right sortField={invSortField} currentField="total" sortDirection={invSortDirection} onSort={handleInvSort}>Bill Total</Th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map(inv => (
                  <tr key={inv.id || inv.billNo}>
                    <Td muted>{fmtDateTime(inv.date)}</Td>
                    <Td bold>{inv.billNo}</Td>
                    <Td>
                      <Badge
                        label={inv.orderType}
                        color={inv.orderType.toLowerCase().includes('dine') ? '#2563eb' : inv.orderType.toLowerCase().includes('take') ? '#f59e0b' : '#16a34a'}
                      />
                    </Td>
                    <Td muted>{inv.paymentMethod}</Td>
                    <Td right>{inv.itemsCount}</Td>
                    <Td right muted>{fmt(inv.gross)}</Td>
                    <Td right style={{ color: inv.discount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {inv.discount > 0 ? `-${fmt(inv.discount)}` : '—'}
                    </Td>
                    <Td right bold>{fmt(inv.taxable)}</Td>
                    <Td right style={{ color: '#2563eb' }}>{inv.cgst > 0 ? fmt(inv.cgst) : '—'}</Td>
                    <Td right style={{ color: '#7c3aed' }}>{inv.sgst > 0 ? fmt(inv.sgst) : '—'}</Td>
                    <Td right style={{ color: '#f59e0b' }}>{inv.vat > 0 ? fmt(inv.vat) : '—'}</Td>
                    <Td right bold style={{ color: 'var(--primary)' }}>{fmt(inv.tax)}</Td>
                    <Td right bold>{fmt(inv.total)}</Td>
                  </tr>
                ))}
                <tr>
                  <TdSummary bold colSpan={4}>TOTAL ({filteredInvoices.length} Invoices)</TdSummary>
                  <TdSummary right bold>{filteredInvoices.reduce((s, i) => s + i.itemsCount, 0)}</TdSummary>
                  <TdSummary right bold>{fmt(filteredInvoices.reduce((s, i) => s + i.gross, 0))}</TdSummary>
                  <TdSummary right bold style={{ color: 'var(--danger)' }}>
                    {fmt(filteredInvoices.reduce((s, i) => s + i.discount, 0))}
                  </TdSummary>
                  <TdSummary right bold>{fmt(invoiceTotals.taxable)}</TdSummary>
                  <TdSummary right bold style={{ color: '#2563eb' }}>{fmt(invoiceTotals.cgst)}</TdSummary>
                  <TdSummary right bold style={{ color: '#7c3aed' }}>{fmt(invoiceTotals.sgst)}</TdSummary>
                  <TdSummary right bold style={{ color: '#f59e0b' }}>{fmt(invoiceTotals.vat)}</TdSummary>
                  <TdSummary right bold>{fmt(invoiceTotals.tax)}</TdSummary>
                  <TdSummary right bold>{fmt(invoiceTotals.total)}</TdSummary>
                </tr>
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
    </div>
  );
};

// =================================================================
// TAB 4 -- INVENTORY MANAGEMENT
// =================================================================

const StockStatusReorderReport = ({ inventory }) => {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('name', 'asc');

  const categories = useMemo(() => ['All', ...new Set(inventory.map(i => i.category).filter(Boolean))], [inventory]);

  const processed = useMemo(() => {
    return inventory.map(item => {
      const stock = item.stock || 0;
      const min = item.min || 0;
      let statusLabel = 'Healthy';
      if (stock <= 0) {
        statusLabel = 'Out of Stock';
      } else if (stock <= min) {
        statusLabel = 'Low Stock';
      }
      return { ...item, statusLabel };
    });
  }, [inventory]);

  const filtered = useMemo(() => {
    let arr = processed;
    if (categoryFilter !== 'All') {
      arr = arr.filter(i => i.category === categoryFilter);
    }
    if (statusFilter !== 'All') {
      arr = arr.filter(i => i.statusLabel === statusFilter);
    }
    return arr;
  }, [processed, categoryFilter, statusFilter]);

  const sortedInventory = useMemo(() => {
    return sortData(filtered, sortField, sortDirection, {
      assetValue: i => (i.stock || 0) * (i.cost || 0)
    });
  }, [filtered, sortField, sortDirection]);

  const totals = useMemo(() => {
    const totalAssetVal = filtered.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
    const lowCount = filtered.filter(i => i.statusLabel === 'Low Stock').length;
    const outCount = filtered.filter(i => i.statusLabel === 'Out of Stock').length;
    return { totalAssetVal, lowCount, outCount };
  }, [filtered]);

  const handleExport = () => {
    const rows = [
      'Item Name,Unit of Measurement,Current Stock,Reorder Level,Unit Cost,Total Asset Value',
      ...sortedInventory.map(i =>
        `"${i.name}","${i.unit || ''}",${i.stock},${i.min},${(i.cost || 0).toFixed(2)},${((i.stock || 0) * (i.cost || 0)).toFixed(2)}`
      ),
    ];
    downloadCSV('stock_status_reorder_report.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category:</span>
        <Select value={categoryFilter} onChange={setCategoryFilter}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Stock Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="All">All Statuses</option>
          <option value="Healthy">Healthy</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Asset Value" value={fmt(totals.totalAssetVal)} color="#1e5e4a" icon={Boxes} />
        <StatCard label="Low Stock Items" value={totals.lowCount} color="#f59e0b" icon={AlertTriangle} />
        <StatCard label="Out of Stock Items" value={totals.outCount} color="#ef4444" icon={XCircle} />
      </div>

      <div className="card">
        <SectionTitle>Stock Status &amp; Reorder Report</SectionTitle>
        {sortedInventory.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="name" sortDirection={sortDirection} onSort={handleSort}>Item Name</Th>
                <Th sortField={sortField} currentField="unit" sortDirection={sortDirection} onSort={handleSort}>Unit of Measurement</Th>
                <Th right sortField={sortField} currentField="stock" sortDirection={sortDirection} onSort={handleSort}>Current Stock</Th>
                <Th right sortField={sortField} currentField="min" sortDirection={sortDirection} onSort={handleSort}>Reorder Level (Par)</Th>
                <Th right sortField={sortField} currentField="cost" sortDirection={sortDirection} onSort={handleSort}>Unit Cost</Th>
                <Th right sortField={sortField} currentField="assetValue" sortDirection={sortDirection} onSort={handleSort}>Total Asset Value</Th>
                <Th sortField={sortField} currentField="statusLabel" sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              </tr>
            </thead>
            <tbody>
              {sortedInventory.map(i => {
                const statusColor = i.statusLabel === 'Healthy' ? '#22c55e' : i.statusLabel === 'Low Stock' ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={i.id}>
                    <Td bold>{i.name}</Td>
                    <Td>{i.unit || 'pcs'}</Td>
                    <Td right bold style={{ color: i.stock <= i.min ? 'var(--danger)' : 'inherit' }}>{i.stock}</Td>
                    <Td right muted>{i.min}</Td>
                    <Td right>{fmt(i.cost || 0)}</Td>
                    <Td right bold>{fmt((i.stock || 0) * (i.cost || 0))}</Td>
                    <Td><Badge label={i.statusLabel} color={statusColor} /></Td>
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

const WastageVarianceLogReport = ({ wasteLog }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [reasonFilter, setReasonFilter] = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('createdAt', 'desc');

  const filtered = useMemo(() => {
    let arr = filterByRange(wasteLog || [], range, dateFrom, dateTo, 'createdAt');
    if (reasonFilter !== 'All') {
      arr = arr.filter(w => w.reason === reasonFilter);
    }
    return arr;
  }, [wasteLog, range, dateFrom, dateTo, reasonFilter]);

  const sortedWastage = useMemo(() => {
    return sortData(filtered, sortField, sortDirection);
  }, [filtered, sortField, sortDirection]);

  const totalCost = useMemo(() => filtered.reduce((s, w) => s + (w.costImpact || 0), 0), [filtered]);

  const handleExport = () => {
    const rows = [
      'Date Logged,Item Name,Quantity,Reason,Cost Impact',
      ...sortedWastage.map(w =>
        `"${fmtDateTime(w.createdAt)}","${w.itemName}",${w.qty} ${w.unit || ''},"${w.reason}",${(w.costImpact || 0).toFixed(2)}`
      ),
    ];
    downloadCSV('wastage_variance_log.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Reason:</span>
        <Select value={reasonFilter} onChange={setReasonFilter}>
          <option value="All">All Reasons</option>
          <option value="Expired">Expired</option>
          <option value="Spilled">Spilled</option>
          <option value="Staff Meal">Staff Meal</option>
          <option value="Other">Other</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Wastage Entries" value={filtered.length} color="#1e5e4a" icon={Boxes} />
        <StatCard label="Total Cost Impact" value={fmt(totalCost)} color="#ef4444" icon={IndianRupee} />
        <StatCard label="Average Loss / Entry" value={filtered.length > 0 ? fmt(totalCost / filtered.length) : '₹0'} color="#f59e0b" icon={TrendingUp} />
      </div>

      <div className="card">
        <SectionTitle>Wastage and Variance Log</SectionTitle>
        {sortedWastage.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="createdAt" sortDirection={sortDirection} onSort={handleSort}>Date Logged</Th>
                <Th sortField={sortField} currentField="itemName" sortDirection={sortDirection} onSort={handleSort}>Item Name</Th>
                <Th right sortField={sortField} currentField="qty" sortDirection={sortDirection} onSort={handleSort}>Quantity</Th>
                <Th sortField={sortField} currentField="reason" sortDirection={sortDirection} onSort={handleSort}>Reason</Th>
                <Th right sortField={sortField} currentField="costImpact" sortDirection={sortDirection} onSort={handleSort}>Cost Impact</Th>
                <Th sortField={sortField} currentField="notes" sortDirection={sortDirection} onSort={handleSort}>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {sortedWastage.map((w, idx) => (
                <tr key={w.id || idx}>
                  <Td>{fmtDateTime(w.createdAt)}</Td>
                  <Td bold>{w.itemName}</Td>
                  <Td right>{w.qty} {w.unit || 'pcs'}</Td>
                  <Td><Badge label={w.reason} color="#ef4444" /></Td>
                  <Td right bold style={{ color: 'var(--danger)' }}>{fmt(w.costImpact || 0)}</Td>
                  <Td muted>{w.notes || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

const InventoryMgmtTab = ({ inventory, wasteLog, orders, menu }) => {
  const [subTab, setSubTab] = useState('stock');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`btn ${subTab === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('stock')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Stock Status &amp; Reorder Report
        </button>
        <button className={`btn ${subTab === 'waste' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('waste')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Wastage &amp; Variance Log
        </button>
      </div>

      {subTab === 'stock' ? (
        <StockStatusReorderReport inventory={inventory} />
      ) : (
        <WastageVarianceLogReport wasteLog={wasteLog} />
      )}
    </div>
  );
};

// =================================================================
// TAB 5 -- MENU MANAGEMENT
// =================================================================

const MenuManagementTab = ({ orders, menu }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [categoryFilter, setCategoryFilter] = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('qtySold', 'desc');

  const filteredOrders = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const categories = useMemo(() => ['All', ...new Set(menu.map(m => m.category).filter(Boolean))], [menu]);

  const performanceData = useMemo(() => {
    const sales = {};
    filteredOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const k = item.name;
        if (!sales[k]) {
          sales[k] = { qty: 0, revenue: 0 };
        }
        sales[k].qty += item.qty || 1;
        sales[k].revenue += (item.price || 0) * (item.qty || 1);
      });
    });

    const list = menu.map(m => {
      const sold = sales[m.name] || { qty: 0, revenue: 0 };
      
      const unitCost = m.cost || m.foodCost || (m.price * 0.3);
      const cogs = sold.qty * unitCost;
      const profit = sold.revenue - cogs;
      const margin = sold.revenue > 0 ? (profit / sold.revenue * 100) : 0;

      return {
        id: m.id,
        name: m.name,
        category: m.category || 'Uncategorized',
        qtySold: sold.qty,
        revenue: sold.revenue,
        cogs,
        margin
      };
    });

    let result = list;
    if (categoryFilter !== 'All') {
      result = result.filter(i => i.category === categoryFilter);
    }

    return result;
  }, [filteredOrders, menu, categoryFilter]);

  const sortedPerformanceData = useMemo(() => {
    return sortData(performanceData, sortField, sortDirection);
  }, [performanceData, sortField, sortDirection]);

  const totals = useMemo(() => {
    return performanceData.reduce((s, r) => ({
      qtySold: s.qtySold + r.qtySold,
      revenue: s.revenue + r.revenue,
      cogs: s.cogs + r.cogs
    }), { qtySold: 0, revenue: 0, cogs: 0 });
  }, [performanceData]);

  const avgMargin = useMemo(() => {
    const revenue = totals.revenue;
    const profit = revenue - totals.cogs;
    return revenue > 0 ? (profit / revenue * 100) : 0;
  }, [totals]);

  const handleExport = () => {
    const rows = [
      'Item Name,Quantity Sold,Total Revenue,Cost of Goods Sold (COGS),Gross Margin %',
      ...sortedPerformanceData.map(d =>
        `"${d.name}",${d.qtySold},${d.revenue.toFixed(2)},${d.cogs.toFixed(2)},${d.margin.toFixed(1)}%`
      ),
    ];
    downloadCSV('item_performance_analysis.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Menu Category:</span>
        <Select value={categoryFilter} onChange={setCategoryFilter}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Quantity Sold" value={totals.qtySold} color="#1e5e4a" icon={ShoppingBag} />
        <StatCard label="Total Revenue" value={fmt(totals.revenue)} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Cost of Goods Sold (COGS)" value={fmt(totals.cogs)} color="#ef4444" icon={TrendingDown} />
        <StatCard label="Gross Margin" value={fmtPct(avgMargin)} color="#f59e0b" icon={Target} />
      </div>

      <div className="card">
        <SectionTitle>Item Performance Analysis</SectionTitle>
        {sortedPerformanceData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="name" sortDirection={sortDirection} onSort={handleSort}>Item Name</Th>
                <Th sortField={sortField} currentField="category" sortDirection={sortDirection} onSort={handleSort}>Menu Category</Th>
                <Th right sortField={sortField} currentField="qtySold" sortDirection={sortDirection} onSort={handleSort}>Quantity Sold</Th>
                <Th right sortField={sortField} currentField="revenue" sortDirection={sortDirection} onSort={handleSort}>Total Revenue</Th>
                <Th right sortField={sortField} currentField="cogs" sortDirection={sortDirection} onSort={handleSort}>Cost of Goods Sold (COGS)</Th>
                <Th right sortField={sortField} currentField="margin" sortDirection={sortDirection} onSort={handleSort}>Gross Margin</Th>
              </tr>
            </thead>
            <tbody>
              {sortedPerformanceData.map(d => (
                <tr key={d.id}>
                  <Td bold>{d.name}</Td>
                  <Td><Badge label={d.category} color="#1e5e4a" /></Td>
                  <Td right bold>{d.qtySold}</Td>
                  <Td right>{fmt(d.revenue)}</Td>
                  <Td right muted>{fmt(d.cogs)}</Td>
                  <Td right bold style={{ color: d.margin >= 50 ? 'var(--success)' : d.margin >= 30 ? 'var(--warning)' : 'var(--danger)' }}>
                    {fmtPct(d.margin)}
                  </Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary />
                <TdSummary right bold>{totals.qtySold}</TdSummary>
                <TdSummary right bold>{fmt(totals.revenue)}</TdSummary>
                <TdSummary right bold>{fmt(totals.cogs)}</TdSummary>
                <TdSummary right bold>{fmtPct(avgMargin)}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

// =================================================================
// TAB 6 -- OPERATIONAL EFFICIENCY
// =================================================================

const OperationalEfficiencyTab = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);
  const [dayFilter, setDayFilter] = useState('All');

  const { sortField, sortDirection, handleSort } = useSort('hour', 'asc');

  const filtered = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);
    if (dayFilter !== 'All') {
      const targetDay = parseInt(dayFilter);
      arr = arr.filter(o => new Date(o.createdAt).getDay() === targetDay);
    }
    return arr;
  }, [orders, range, dateFrom, dateTo, dayFilter]);

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      const nextHour = (i + 1) % 12 || 12;
      const nextAmpm = (i + 1) >= 12 && (i + 1) < 24 ? 'PM' : 'AM';
      const slotLabel = `${String(displayHour).padStart(2, '0')}:00 ${ampm} to ${String(nextHour).padStart(2, '0')}:00 ${nextAmpm}`;
      
      return {
        hour: i,
        slot: slotLabel,
        volume: 0,
        revenue: 0
      };
    });

    filtered.forEach(o => {
      if (o.createdAt) {
        const hour = new Date(o.createdAt).getHours();
        hours[hour].volume += 1;
        hours[hour].revenue += o.total || 0;
      }
    });

    return hours;
  }, [filtered]);

  const sortedHourlyData = useMemo(() => {
    return sortData(hourlyData, sortField, sortDirection, {
      avgTicket: h => h.volume > 0 ? h.revenue / h.volume : 0
    });
  }, [hourlyData, sortField, sortDirection]);

  const totals = useMemo(() => {
    return hourlyData.reduce((s, r) => ({
      volume: s.volume + r.volume,
      revenue: s.revenue + r.revenue
    }), { volume: 0, revenue: 0 });
  }, [hourlyData]);

  const maxRevenue = useMemo(() => {
    return Math.max(...hourlyData.map(h => h.revenue), 1);
  }, [hourlyData]);

  const handleExport = () => {
    const rows = [
      'Time Slot,Order Volume,Revenue Generated,Average Ticket Size',
      ...sortedHourlyData.map(h =>
        `"${h.slot}",${h.volume},${h.revenue.toFixed(2)},${h.volume > 0 ? (h.revenue / h.volume).toFixed(2) : 0}`
      ),
    ];
    downloadCSV('hourly_sales_heatmap.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Day of Week:</span>
        <Select value={dayFilter} onChange={setDayFilter}>
          <option value="All">All Days</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
          <option value="0">Sunday</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Hourly Heatmap (Sales by Hour)</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8, padding: '10px 0' }}>
          {hourlyData.map(h => {
            const ratio = h.revenue / maxRevenue;
            const bg = ratio > 0.8 ? 'rgba(239,68,68,0.85)' 
                     : ratio > 0.5 ? 'rgba(245,158,11,0.8)' 
                     : ratio > 0.2 ? 'rgba(30, 94, 74,0.6)' 
                     : ratio > 0 ? 'rgba(30, 94, 74,0.18)'  
                     : 'rgba(226,232,240,0.3)';             
            
            const briefLabel = `${h.hour % 12 || 12}${h.hour >= 12 ? 'PM' : 'AM'}`;

            return (
              <div key={h.hour} title={`${h.slot}\nOrders: ${h.volume}\nRevenue: ${fmt(h.revenue)}`}
                style={{
                  aspectRatio: '1', borderRadius: 8, background: bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default', transition: 'all 0.2s', border: '1px solid var(--border-subtle)'
                }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: ratio > 0.4 ? 'white' : 'var(--text-secondary)' }}>{briefLabel}</span>
                {h.volume > 0 && <span style={{ fontSize: '0.52rem', opacity: 0.8, color: ratio > 0.4 ? 'white' : 'var(--text-muted)' }}>{h.volume}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(226,232,240,0.3)' }} /> Idle</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(30, 94, 74,0.18)' }} /> Low Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(30, 94, 74,0.6)' }} /> Medium Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.8)' }} /> High Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.85)' }} /> Peak Traffic</span>
        </div>
      </div>

      <div className="card">
        <SectionTitle>Hourly Traffic &amp; Sales Performance</SectionTitle>
        {sortedHourlyData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="slot" sortDirection={sortDirection} onSort={handleSort}>Time Slot</Th>
                <Th right sortField={sortField} currentField="volume" sortDirection={sortDirection} onSort={handleSort}>Order Volume</Th>
                <Th right sortField={sortField} currentField="revenue" sortDirection={sortDirection} onSort={handleSort}>Revenue Generated</Th>
                <Th right sortField={sortField} currentField="avgTicket" sortDirection={sortDirection} onSort={handleSort}>Average Ticket Size</Th>
              </tr>
            </thead>
            <tbody>
              {sortedHourlyData.map(h => {
                const avgTicket = h.volume > 0 ? h.revenue / h.volume : 0;
                return (
                  <tr key={h.hour} style={{ background: h.volume > 0 ? 'inherit' : 'rgba(248,250,252,0.3)' }}>
                    <Td bold>{h.slot}</Td>
                    <Td right bold={h.volume > 0}>{h.volume}</Td>
                    <Td right style={{ color: h.revenue > 0 ? 'var(--primary)' : 'inherit', fontWeight: h.revenue > 0 ? 600 : 400 }}>{fmt(h.revenue)}</Td>
                    <Td right bold={avgTicket > 0}>{fmt(avgTicket)}</Td>
                  </tr>
                );
              })}
              <tr>
                <TdSummary bold>TOTAL / AVERAGE</TdSummary>
                <TdSummary right bold>{totals.volume}</TdSummary>
                <TdSummary right bold>{fmt(totals.revenue)}</TdSummary>
                <TdSummary right bold>{totals.volume > 0 ? fmt(totals.revenue / totals.volume) : '₹0'}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

// =================================================================
// TAB 7 -- SPEED OF SERVICE (Retained from original layout)
// =================================================================

const SpeedOfService = ({ orders, kdsTickets = [], menu = [] }) => {
  const [activeSpeedTab, setActiveSpeedTab] = useState('invoices'); // 'invoices' | 'tickets' | 'items'
  const [range, setRange]                   = useState('Today');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [showAll, setShowAll]               = useState(false);
  const [itemViewMode, setItemViewMode]     = useState('summary'); // 'summary' | 'log'

  useHistoricalOrders(range, dateFrom);

  // Sorting hooks for each sub-report
  const invoiceSort = useSort('orderPlaced', 'desc');
  const ticketSort  = useSort('firedAt', 'desc');
  const itemSort    = useSort('avgPrepMs', 'desc');
  const itemLogSort = useSort('bumpedAt', 'desc');

  // Filter orders and KDS tickets by selected period range
  const filteredOrders = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);
  const filteredTickets = useMemo(() => filterByRange(kdsTickets, range, dateFrom, dateTo, 'firedAt'), [kdsTickets, range, dateFrom, dateTo]);

  // ── 1. INVOICE-LEVEL SPEED DATA ─────────────────────────────
  const serviceData = useMemo(() => {
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

    return filteredOrders.map(o => {
      const orderCreationIso = o.createdAt || o.date || o.timestamps?.ordered || o.orderPlacedAt || null;
      const orderCreatedTime = orderCreationIso ? new Date(orderCreationIso).getTime() : Date.now();

      const orderPaidIso = o.paidAt || o.closedAt || o.settledAt || o.timestamps?.paid || (o.status === 'paid' ? o.createdAt : null);
      const orderPaidTime = orderPaidIso ? new Date(orderPaidIso).getTime() : orderCreatedTime;
      const checkPaid = orderPaidIso ? new Date(orderPaidIso).getTime() : null;

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

      if (foodBumpedTime && ticketPrintedTime && (foodBumpedTime - ticketPrintedTime > 3 * 60 * 60 * 1000)) {
        foodBumpedTime = null;
      }

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
        checkPaid: checkPaid,
        orderToTicket,
        ticketToFood,
        foodToPaid,
        totalTime,
      };
    }).filter(d => d.orderPlaced || d.checkPaid);
  }, [filteredOrders, kdsTickets]);

  const filteredServiceData = useMemo(() => {
    if (!searchQuery.trim()) return serviceData;
    const q = searchQuery.toLowerCase();
    return serviceData.filter(d =>
      String(d.id || '').toLowerCase().includes(q) ||
      String(d.table || '').toLowerCase().includes(q)
    );
  }, [serviceData, searchQuery]);

  const sortedServiceData = useMemo(() => {
    return sortData(filteredServiceData, invoiceSort.sortField, invoiceSort.sortDirection);
  }, [filteredServiceData, invoiceSort.sortField, invoiceSort.sortDirection]);

  const invoiceAverages = useMemo(() => {
    const valid = (arr) => arr.filter(v => v !== null && v !== undefined && !isNaN(v) && v >= 0);
    const avg = (arr) => { const v = valid(arr); return v.length > 0 ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    return {
      orderToTicket: avg(serviceData.filter(d => d.ticketPrinted !== null).map(d => d.orderToTicket)),
      ticketToFood: avg(serviceData.filter(d => d.ticketToFood !== null).map(d => d.ticketToFood)),
      foodToPaid: avg(serviceData.filter(d => d.foodToPaid !== null).map(d => d.foodToPaid)),
      totalTime: avg(serviceData.filter(d => d.totalTime !== null).map(d => d.totalTime)),
    };
  }, [serviceData]);

  // ── 2. KDS TICKET-LEVEL SPEED DATA ──────────────────────────
  const ticketSpeedData = useMemo(() => {
    return (filteredTickets || []).map(t => {
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
      let isBumpAnomaly = false;
      if (firedMs && bumpedMs && bumpedMs >= firedMs) {
        const raw = bumpedMs - firedMs;
        if (raw <= 3 * 60 * 60 * 1000) {
          prepMs = raw;
        } else {
          isBumpAnomaly = true;
        }
      }

      const tableDisplay = t.tableName
        ? t.tableName
        : (t.tableId ? (String(t.tableId).startsWith('T-') ? t.tableId : `T-${t.tableId}`) : (t.tokenNumber ? `Token #${t.tokenNumber}` : (t.orderType === 'takeout' ? 'Takeout' : (t.orderType === 'delivery' ? 'Delivery' : 'Direct'))));

      const itemsSummary = (t.items || []).map(i => `${i.name || 'Item'}${i.qty && i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ') || '—';
      const itemsCount = (t.items || []).reduce((s, i) => s + (i.qty || 1), 0);
      const status = bumpedMs ? 'completed' : (t.status || 'active');

      return {
        id: t.orderId || (t.id ? t.id.slice(0, 8) : '—'),
        ticketId: t.id,
        table: tableDisplay,
        orderType: t.orderType || 'dine-in',
        itemsSummary,
        itemsCount,
        firedAt: firedMs,
        bumpedAt: bumpedMs,
        prepMs,
        status,
        isBumpAnomaly,
      };
    });
  }, [filteredTickets]);

  const filteredTicketData = useMemo(() => {
    if (!searchQuery.trim()) return ticketSpeedData;
    const q = searchQuery.toLowerCase();
    return ticketSpeedData.filter(t =>
      String(t.id || '').toLowerCase().includes(q) ||
      String(t.table || '').toLowerCase().includes(q) ||
      String(t.itemsSummary || '').toLowerCase().includes(q) ||
      String(t.orderType || '').toLowerCase().includes(q)
    );
  }, [ticketSpeedData, searchQuery]);

  const sortedTicketData = useMemo(() => {
    return sortData(filteredTicketData, ticketSort.sortField, ticketSort.sortDirection);
  }, [filteredTicketData, ticketSort.sortField, ticketSort.sortDirection]);

  const ticketStats = useMemo(() => {
    const total = ticketSpeedData.length;
    const bumped = ticketSpeedData.filter(t => t.prepMs !== null);
    const avgPrep = bumped.length > 0 ? bumped.reduce((s, t) => s + t.prepMs, 0) / bumped.length : null;
    const fastest = bumped.length > 0 ? Math.min(...bumped.map(t => t.prepMs)) : null;
    const under15m = bumped.length > 0 ? Math.round((bumped.filter(t => t.prepMs <= 15 * 60 * 1000).length / bumped.length) * 100) : 0;
    return { total, bumpedCount: bumped.length, avgPrep, fastest, under15m };
  }, [ticketSpeedData]);

  // ── 3. MENU ITEM-LEVEL PREPARATION DATA ─────────────────────
  const itemPrepData = useMemo(() => {
    const itemMap = new Map();
    const itemLogs = [];

    (filteredTickets || []).forEach(t => {
      const ticketFired = t.firedAt || t.createdAt;
      const firedMs = ticketFired ? new Date(ticketFired).getTime() : null;
      if (!firedMs) return;

      const ticketTable = t.tableName
        ? t.tableName
        : (t.tableId ? (String(t.tableId).startsWith('T-') ? t.tableId : `T-${t.tableId}`) : (t.tokenNumber ? `Token #${t.tokenNumber}` : '—'));

      const ticketId = t.orderId || (t.id ? t.id.slice(0, 8) : '—');

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
          if (raw <= 3 * 60 * 60 * 1000) {
            prepMs = raw;
          }
        }

        const menuItem = (menu || []).find(m => m.name?.toLowerCase() === itemName.toLowerCase());
        const category = menuItem?.category || item.category || 'General';

        itemLogs.push({
          id: `${t.id}-${idx}`,
          ticketId,
          table: ticketTable,
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
  }, [filteredTickets, menu]);

  const filteredAggregatedItems = useMemo(() => {
    if (!searchQuery.trim()) return itemPrepData.aggregated;
    const q = searchQuery.toLowerCase();
    return itemPrepData.aggregated.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  }, [itemPrepData.aggregated, searchQuery]);

  const sortedAggregatedItems = useMemo(() => {
    return sortData(filteredAggregatedItems, itemSort.sortField, itemSort.sortDirection);
  }, [filteredAggregatedItems, itemSort.sortField, itemSort.sortDirection]);

  const filteredItemLogs = useMemo(() => {
    if (!searchQuery.trim()) return itemPrepData.itemLogs;
    const q = searchQuery.toLowerCase();
    return itemPrepData.itemLogs.filter(it =>
      it.name.toLowerCase().includes(q) ||
      it.table.toLowerCase().includes(q) ||
      it.ticketId.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  }, [itemPrepData.itemLogs, searchQuery]);

  const sortedItemLogs = useMemo(() => {
    return sortData(filteredItemLogs, itemLogSort.sortField, itemLogSort.sortDirection);
  }, [filteredItemLogs, itemLogSort.sortField, itemLogSort.sortDirection]);

  const itemStats = useMemo(() => {
    const totalBumped = itemPrepData.aggregated.reduce((s, it) => s + it.bumpedQty, 0);
    const withTimes = itemPrepData.aggregated.filter(it => it.avgPrepMs !== null);
    const allPrep = itemPrepData.itemLogs.map(it => it.prepMs).filter(p => p !== null);
    const overallAvg = allPrep.length > 0 ? allPrep.reduce((s, x) => s + x, 0) / allPrep.length : null;

    let fastest = null;
    let slowest = null;
    if (withTimes.length > 0) {
      const sortedByAvg = [...withTimes].sort((a, b) => a.avgPrepMs - b.avgPrepMs);
      fastest = sortedByAvg[0];
      slowest = sortedByAvg[sortedByAvg.length - 1];
    }
    return { totalBumped, overallAvg, fastest, slowest };
  }, [itemPrepData]);

  // ── CSV EXPORT ──────────────────────────────────────────────
  const handleExport = () => {
    if (activeSpeedTab === 'invoices') {
      const rows = [
        'Order ID,Table,Order Placed,Ticket Printed,Food Bumped,Check Paid,Total Time (s)',
        ...sortedServiceData.map(d =>
          `"${d.id}","${d.table}","${fmtDateTime(d.orderPlaced)}","${fmtDateTime(d.ticketPrinted)}","${d.foodBumped ? fmtDateTime(d.foodBumped) : ''}","${d.checkPaid ? fmtDateTime(d.checkPaid) : ''}",${d.totalTime ? Math.round(d.totalTime / 1000) : ''}`
        ),
      ];
      downloadCSV('speed_of_service_invoices.csv', rows);
    } else if (activeSpeedTab === 'tickets') {
      const rows = [
        'KOT ID,Table,Order Type,Items,Fired At,Bumped At,Prep Time (s),Status',
        ...sortedTicketData.map(t =>
          `"${t.id}","${t.table}","${t.orderType}","${t.itemsSummary.replace(/"/g, '""')}","${fmtDateTime(t.firedAt)}","${t.bumpedAt ? fmtDateTime(t.bumpedAt) : ''}",${t.prepMs ? Math.round(t.prepMs / 1000) : ''},"${t.status}"`
        ),
      ];
      downloadCSV('kds_ticket_speed.csv', rows);
    } else if (itemViewMode === 'summary') {
      const rows = [
        'Menu Item,Category,Qty Prepared,Orders,Avg Prep Time (s),Min Prep Time (s),Max Prep Time (s)',
        ...sortedAggregatedItems.map(it =>
          `"${it.name}","${it.category}",${it.bumpedQty},${it.ticketCount},${it.avgPrepMs ? Math.round(it.avgPrepMs / 1000) : ''},${it.minPrepMs ? Math.round(it.minPrepMs / 1000) : ''},${it.maxPrepMs ? Math.round(it.maxPrepMs / 1000) : ''}`
        ),
      ];
      downloadCSV('menu_item_prep_averages.csv', rows);
    } else {
      const rows = [
        'Menu Item,Category,KOT ID,Table,Qty,Fired At,Bumped At,Prep Time (s),Status',
        ...sortedItemLogs.map(it =>
          `"${it.name}","${it.category}","${it.ticketId}","${it.table}",${it.qty},"${fmtDateTime(it.firedAt)}","${it.bumpedAt ? fmtDateTime(it.bumpedAt) : ''}",${it.prepMs ? Math.round(it.prepMs / 1000) : ''},"${it.status}"`
        ),
      ];
      downloadCSV('menu_item_bump_log.csv', rows);
    }
  };

  const displayedInvoices = showAll ? sortedServiceData : sortedServiceData.slice(0, 50);
  const displayedTickets = showAll ? sortedTicketData : sortedTicketData.slice(0, 50);
  const displayedItems = showAll ? sortedAggregatedItems : sortedAggregatedItems.slice(0, 50);
  const displayedItemLogs = showAll ? sortedItemLogs : sortedItemLogs.slice(0, 50);

  return (
    <div>
      {/* Sub-tab Selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${activeSpeedTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSpeedTab('invoices')}
          style={{ fontSize: '0.8rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Clock size={15} /> Order Speed (Invoices)
        </button>
        <button
          type="button"
          className={`btn ${activeSpeedTab === 'tickets' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSpeedTab('tickets')}
          style={{ fontSize: '0.8rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Utensils size={15} /> KDS Ticket Speed (KOT)
        </button>
        <button
          type="button"
          className={`btn ${activeSpeedTab === 'items' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSpeedTab('items')}
          style={{ fontSize: '0.8rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Flame size={15} /> Menu Item Prep Time
        </button>
      </div>

      {/* Filter & Search Bar */}
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />

        <div style={{ position: 'relative', minWidth: 200, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={
              activeSpeedTab === 'invoices' ? "Filter Invoice / Table..." :
              activeSpeedTab === 'tickets' ? "Filter KOT / Table / Item..." :
              "Filter Dish / Category..."
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="form-control"
            style={{ paddingLeft: 30, fontSize: '0.76rem', height: 32, borderRadius: 8 }}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {activeSpeedTab === 'items' && (
            <div style={{ display: 'flex', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
              <button
                type="button"
                onClick={() => setItemViewMode('summary')}
                style={{
                  border: 'none',
                  background: itemViewMode === 'summary' ? 'var(--primary)' : 'transparent',
                  color: itemViewMode === 'summary' ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Dish Averages
              </button>
              <button
                type="button"
                onClick={() => setItemViewMode('log')}
                style={{
                  border: 'none',
                  background: itemViewMode === 'log' ? 'var(--primary)' : 'transparent',
                  color: itemViewMode === 'log' ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Item Bump Log
              </button>
            </div>
          )}
          <ExportBtn onClick={handleExport} />
        </div>
      </FilterBar>

      {/* ── 1. VIEW: INVOICES SPEED REPORT ────────────────────────── */}
      {activeSpeedTab === 'invoices' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="Avg Order-to-Ticket" value={fmtMinSec(invoiceAverages.orderToTicket)} color="#1e5e4a" icon={Timer} />
            <StatCard label="Avg Kitchen Time" value={fmtMinSec(invoiceAverages.ticketToFood)} color="#f59e0b" icon={Utensils} />
            <StatCard label="Avg Food-to-Paid" value={fmtMinSec(invoiceAverages.foodToPaid)} color="#0ea5e9" icon={CreditCard} />
            <StatCard label="Avg Total Turnaround" value={fmtMinSec(invoiceAverages.totalTime)} color="#22c55e" icon={Clock} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionTitle style={{ marginBottom: 0 }}>
                Order Speed Timeline ({sortedServiceData.length} invoices)
              </SectionTitle>
              {sortedServiceData.length > 50 && (
                <button
                  type="button"
                  onClick={() => setShowAll(prev => !prev)}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--primary)',
                    fontWeight: 600,
                  }}
                >
                  {showAll ? 'Show First 50' : `Show All (${sortedServiceData.length})`}
                </button>
              )}
            </div>
            {sortedServiceData.length === 0 ? <Empty /> : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th sortField={invoiceSort.sortField} currentField="id" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Order ID</Th>
                    <Th sortField={invoiceSort.sortField} currentField="table" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Table</Th>
                    <Th sortField={invoiceSort.sortField} currentField="orderPlaced" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Order Placed</Th>
                    <Th sortField={invoiceSort.sortField} currentField="ticketPrinted" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Ticket Printed</Th>
                    <Th sortField={invoiceSort.sortField} currentField="foodBumped" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Food Bumped</Th>
                    <Th sortField={invoiceSort.sortField} currentField="checkPaid" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Check Paid</Th>
                    <Th right sortField={invoiceSort.sortField} currentField="totalTime" sortDirection={invoiceSort.sortDirection} onSort={invoiceSort.handleSort}>Total Time</Th>
                    <Th>Timeline</Th>
                  </tr>
                </thead>
                <tbody>
                  {displayedInvoices.map(d => {
                    const maxTime = (invoiceAverages.totalTime && invoiceAverages.totalTime > 0) ? invoiceAverages.totalTime * 2 : 600000;
                    const phases = [];
                    if (d.orderToTicket > 0) {
                      phases.push({ pct: Math.min((d.orderToTicket / maxTime) * 100, 33), duration: d.orderToTicket, color: '#1e5e4a', label: 'Queue' });
                    }
                    if (d.ticketToFood > 0) {
                      phases.push({ pct: Math.min((d.ticketToFood / maxTime) * 100, 50), duration: d.ticketToFood, color: '#f59e0b', label: 'Kitchen' });
                    }
                    if (d.foodToPaid > 0) {
                      phases.push({ pct: Math.min((d.foodToPaid / maxTime) * 100, 50), duration: d.foodToPaid, color: '#0ea5e9', label: 'Service' });
                    }
                    if (phases.length === 0 && d.totalTime !== null && d.totalTime > 0) {
                      phases.push({ pct: Math.min((d.totalTime / maxTime) * 100, 100), duration: d.totalTime, color: '#22c55e', label: 'Turnaround' });
                    }

                    return (
                      <tr key={d.orderId}>
                        <Td bold>{d.id}</Td>
                        <Td muted>{d.table}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{fmtTime(d.orderPlaced)}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{d.ticketPrinted ? fmtTime(d.ticketPrinted) : '—'}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{d.foodBumped ? fmtTime(d.foodBumped) : '—'}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{d.checkPaid ? fmtTime(d.checkPaid) : '—'}</Td>
                        <Td right bold>{fmtMinSec(d.totalTime)}</Td>
                        <Td>
                          <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', minWidth: 100, background: 'rgba(226,232,240,0.3)' }}>
                            {phases.map((p, i) => (
                              <div key={i} title={`${p.label}: ${fmtMinSec(p.duration || (p.pct * maxTime / 100))}`}
                                style={{ width: `${Math.max(p.pct, 4)}%`, height: '100%', background: p.color, transition: 'width 0.4s' }} />
                            ))}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </div>
        </>
      )}

      {/* ── 2. VIEW: KDS TICKET SPEED REPORT ──────────────────────── */}
      {activeSpeedTab === 'tickets' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total KOTs / Tickets" value={ticketStats.total} color="#1e5e4a" icon={FileText} />
            <StatCard label="Avg Ticket Cook Time" value={fmtMinSec(ticketStats.avgPrep)} color="#f59e0b" icon={Utensils} />
            <StatCard label="Fastest Ticket Prep" value={fmtMinSec(ticketStats.fastest)} color="#0ea5e9" icon={Zap} />
            <StatCard label="< 15m Compliance" value={`${ticketStats.under15m}%`} color="#22c55e" icon={CheckCircle} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionTitle style={{ marginBottom: 0 }}>
                KDS Ticket Speed ({sortedTicketData.length} kitchen tickets)
              </SectionTitle>
              {sortedTicketData.length > 50 && (
                <button
                  type="button"
                  onClick={() => setShowAll(prev => !prev)}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--primary)',
                    fontWeight: 600,
                  }}
                >
                  {showAll ? 'Show First 50' : `Show All (${sortedTicketData.length})`}
                </button>
              )}
            </div>
            {sortedTicketData.length === 0 ? <Empty /> : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th sortField={ticketSort.sortField} currentField="id" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>KOT / Ticket #</Th>
                    <Th sortField={ticketSort.sortField} currentField="table" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>Table / Tab</Th>
                    <Th sortField={ticketSort.sortField} currentField="orderType" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>Order Type</Th>
                    <Th>Items Ordered</Th>
                    <Th sortField={ticketSort.sortField} currentField="firedAt" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>Fired At</Th>
                    <Th sortField={ticketSort.sortField} currentField="bumpedAt" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>Bumped At</Th>
                    <Th right sortField={ticketSort.sortField} currentField="prepMs" sortDirection={ticketSort.sortDirection} onSort={ticketSort.handleSort}>Cook Duration</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTickets.map(t => (
                    <tr key={t.ticketId}>
                      <Td bold>{t.id}</Td>
                      <Td muted>{t.table}</Td>
                      <Td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                          background: t.orderType === 'dine-in' ? 'rgba(30,94,74,0.1)' : 'rgba(59,130,246,0.1)',
                          color: t.orderType === 'dine-in' ? 'var(--primary)' : '#0284c7',
                          textTransform: 'capitalize',
                        }}>
                          {t.orderType}
                        </span>
                      </Td>
                      <Td style={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.itemsSummary}>
                        {t.itemsSummary}
                      </Td>
                      <Td style={{ fontSize: '0.73rem' }}>{fmtTime(t.firedAt)}</Td>
                      <Td style={{ fontSize: '0.73rem' }}>{t.bumpedAt ? fmtTime(t.bumpedAt) : '—'}</Td>
                      <Td right bold style={{ color: t.prepMs && t.prepMs > 15 * 60 * 1000 ? '#e11d48' : 'inherit' }}>
                        {fmtMinSec(t.prepMs)}
                      </Td>
                      <Td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                          background: t.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                          color: t.status === 'completed' ? '#16a34a' : '#d97706',
                        }}>
                          {t.status === 'completed' ? 'Bumped' : 'In Kitchen'}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </>
      )}

      {/* ── 3. VIEW: MENU ITEM PREP TIME REPORT ───────────────────── */}
      {activeSpeedTab === 'items' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <StatCard label="Total Items Prepared" value={itemStats.totalBumped} color="#1e5e4a" icon={Package} />
            <StatCard label="Overall Avg Prep Time" value={fmtMinSec(itemStats.overallAvg)} color="#f59e0b" icon={Timer} />
            <StatCard
              label="Fastest Menu Item"
              value={itemStats.fastest ? `${itemStats.fastest.name} (${fmtMinSec(itemStats.fastest.avgPrepMs)})` : '—'}
              color="#0ea5e9"
              icon={Zap}
            />
            <StatCard
              label="Slowest Menu Item"
              value={itemStats.slowest ? `${itemStats.slowest.name} (${fmtMinSec(itemStats.slowest.avgPrepMs)})` : '—'}
              color="#ef4444"
              icon={Clock}
            />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SectionTitle style={{ marginBottom: 0 }}>
                {itemViewMode === 'summary'
                  ? `Menu Item Preparation Averages (${sortedAggregatedItems.length} dishes)`
                  : `Individual Item Bump Log (${sortedItemLogs.length} item preparations)`}
              </SectionTitle>
              {(itemViewMode === 'summary' ? sortedAggregatedItems.length : sortedItemLogs.length) > 50 && (
                <button
                  type="button"
                  onClick={() => setShowAll(prev => !prev)}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--primary)',
                    fontWeight: 600,
                  }}
                >
                  {showAll ? 'Show First 50' : `Show All`}
                </button>
              )}
            </div>

            {itemViewMode === 'summary' ? (
              sortedAggregatedItems.length === 0 ? <Empty /> : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th sortField={itemSort.sortField} currentField="name" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Menu Item</Th>
                      <Th sortField={itemSort.sortField} currentField="category" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Category</Th>
                      <Th right sortField={itemSort.sortField} currentField="bumpedQty" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Qty Prepared</Th>
                      <Th right sortField={itemSort.sortField} currentField="ticketCount" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Times Ordered</Th>
                      <Th right sortField={itemSort.sortField} currentField="avgPrepMs" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Avg Prep Time</Th>
                      <Th right sortField={itemSort.sortField} currentField="minPrepMs" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Fastest Prep</Th>
                      <Th right sortField={itemSort.sortField} currentField="maxPrepMs" sortDirection={itemSort.sortDirection} onSort={itemSort.handleSort}>Slowest Prep</Th>
                      <Th>Speed Rating</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map(it => {
                      const avgSec = it.avgPrepMs ? it.avgPrepMs / 1000 : null;
                      const speedTag = avgSec === null ? { text: 'In Prep', bg: 'rgba(245,158,11,0.15)', col: '#d97706' }
                        : avgSec < 300 ? { text: 'Fast (< 5m)', bg: 'rgba(34,197,94,0.15)', col: '#16a34a' }
                        : avgSec < 720 ? { text: 'Standard', bg: 'rgba(59,130,246,0.15)', col: '#0284c7' }
                        : { text: 'High Prep (> 12m)', bg: 'rgba(239,68,68,0.15)', col: '#e11d48' };

                      return (
                        <tr key={it.name}>
                          <Td bold>{it.name}</Td>
                          <Td muted>{it.category}</Td>
                          <Td right bold>{it.bumpedQty}</Td>
                          <Td right muted>{it.ticketCount}</Td>
                          <Td right bold style={{ color: it.avgPrepMs && it.avgPrepMs > 12 * 60 * 1000 ? '#e11d48' : 'inherit' }}>
                            {fmtMinSec(it.avgPrepMs)}
                          </Td>
                          <Td right style={{ fontSize: '0.78rem' }}>{fmtMinSec(it.minPrepMs)}</Td>
                          <Td right style={{ fontSize: '0.78rem' }}>{fmtMinSec(it.maxPrepMs)}</Td>
                          <Td>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                              background: speedTag.bg, color: speedTag.col,
                            }}>
                              {speedTag.text}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )
            ) : (
              sortedItemLogs.length === 0 ? <Empty /> : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th sortField={itemLogSort.sortField} currentField="name" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Menu Item</Th>
                      <Th sortField={itemLogSort.sortField} currentField="ticketId" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>KOT #</Th>
                      <Th sortField={itemLogSort.sortField} currentField="table" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Table</Th>
                      <Th right sortField={itemLogSort.sortField} currentField="qty" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Qty</Th>
                      <Th sortField={itemLogSort.sortField} currentField="firedAt" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Fired At</Th>
                      <Th sortField={itemLogSort.sortField} currentField="bumpedAt" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Bumped At</Th>
                      <Th right sortField={itemLogSort.sortField} currentField="prepMs" sortDirection={itemLogSort.sortDirection} onSort={itemLogSort.handleSort}>Prep Time</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItemLogs.map(log => (
                      <tr key={log.id}>
                        <Td bold>{log.name}</Td>
                        <Td muted>{log.ticketId}</Td>
                        <Td muted>{log.table}</Td>
                        <Td right bold>{log.qty}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{fmtTime(log.firedAt)}</Td>
                        <Td style={{ fontSize: '0.73rem' }}>{log.bumpedAt ? fmtTime(log.bumpedAt) : '—'}</Td>
                        <Td right bold style={{ color: log.prepMs && log.prepMs > 15 * 60 * 1000 ? '#e11d48' : 'inherit' }}>
                          {fmtMinSec(log.prepMs)}
                        </Td>
                        <Td>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                            background: log.status === 'bumped' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                            color: log.status === 'bumped' ? '#16a34a' : '#d97706',
                          }}>
                            {log.status === 'bumped' ? 'Bumped' : 'In Prep'}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
};

// =================================================================
// TAB 7 -- TABLE ANALYTICS & OCCUPANCY
// =================================================================

const TableAnalyticsTab = ({ orders = [], floorPlans = {}, posTables = [], kdsTickets = [], staff = [] }) => {
  const [range, setRange]                 = useState('Today');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [capacityFilter, setCapacityFilter] = useState('All');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedTableModal, setSelectedTableModal] = useState(null);
  const [showAllTables, setShowAllTables] = useState(false);

  useHistoricalOrders(range, dateFrom);

  const { sortField, sortDirection, handleSort } = useSort('totalRevenue', 'desc');

  // Filter orders by range
  const filteredOrders = useMemo(() => {
    return filterByRange(orders, range, dateFrom, dateTo);
  }, [orders, range, dateFrom, dateTo]);

  // Index KDS tickets for fast timing resolution
  const kdsIndex = useMemo(() => {
    const byOrder = new Map();
    const byTable = new Map();
    const byToken = new Map();

    (kdsTickets || []).forEach(ticket => {
      if (ticket.orderId) {
        if (!byOrder.has(ticket.orderId)) byOrder.set(ticket.orderId, []);
        byOrder.get(ticket.orderId).push(ticket);
      }
      if (ticket.billNo) {
        if (!byOrder.has(ticket.billNo)) byOrder.set(ticket.billNo, []);
        byOrder.get(ticket.billNo).push(ticket);
      }
      if (ticket.tableId !== undefined && ticket.tableId !== null) {
        const rawTid = String(ticket.tableId).trim();
        const bareTid = rawTid.replace(/^T-?|^tab_/i, '');
        [rawTid, bareTid, `T-${bareTid}`, `tab_${bareTid}`].forEach(k => {
          if (!byTable.has(k)) byTable.set(k, []);
          byTable.get(k).push(ticket);
        });
      }
      if (ticket.tokenNumber !== undefined && ticket.tokenNumber !== null) {
        const tok = String(ticket.tokenNumber).trim();
        if (!byToken.has(tok)) byToken.set(tok, []);
        byToken.get(tok).push(ticket);
      }
    });

    return { byOrder, byTable, byToken };
  }, [kdsTickets]);

  // Enrich dine-in / table orders with timing and items
  const enrichedOrders = useMemo(() => {
    return (filteredOrders || []).filter(o => {
      if (!o) return false;
      const type = (o.orderType || '').toLowerCase();
      return Boolean(o.tableId || o.tableName || type === 'dine-in');
    }).map(o => {
      const orderPaidIso = o.paidAt || o.closedAt || o.settledAt || o.timestamps?.paid || (o.status === 'paid' ? o.createdAt : null);
      const orderPaidTime = orderPaidIso ? new Date(orderPaidIso).getTime() : null;

      // Match tickets
      let matchedTickets = [];
      if (kdsIndex.byOrder.has(o.id)) {
        matchedTickets = kdsIndex.byOrder.get(o.id);
      } else if (o.billNo && kdsIndex.byOrder.has(o.billNo)) {
        matchedTickets = kdsIndex.byOrder.get(o.billNo);
      } else if (o.kdsTicketId || (Array.isArray(o.kdsTicketIds) && o.kdsTicketIds.length > 0)) {
        const targetIds = new Set(Array.isArray(o.kdsTicketIds) ? o.kdsTicketIds : [o.kdsTicketId]);
        matchedTickets = (kdsTickets || []).filter(t => targetIds.has(t.id));
      }

      if (matchedTickets.length === 0) {
        let candidates = [];
        if (o.tableId !== undefined && o.tableId !== null) {
          candidates = kdsIndex.byTable.get(String(o.tableId)) || [];
        } else if (o.tokenNumber) {
          candidates = kdsIndex.byToken.get(String(o.tokenNumber)) || [];
        }

        if (candidates.length > 0) {
          const refTime = orderPaidTime || (o.createdAt ? new Date(o.createdAt).getTime() : Date.now());
          const validCandidates = candidates.filter(t => {
            const ticketTime = new Date(t.firedAt || t.createdAt).getTime();
            return ticketTime <= refTime + 5 * 60 * 1000 && ticketTime >= refTime - 6 * 60 * 60 * 1000;
          });
          validCandidates.sort((a, b) => new Date(b.firedAt || b.createdAt) - new Date(a.firedAt || a.createdAt));
          matchedTickets = validCandidates;
        }
      }

      // Resolve food bumped
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

      // Resolve placed time (guard against stale seating from days ago)
      const orderCreatedTime = (o.createdAt ? new Date(o.createdAt).getTime() : null) || orderPaidTime || Date.now();
      let placedTime = orderCreatedTime;
      if (o.seatedAt) {
        const t = new Date(o.seatedAt).getTime();
        if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) placedTime = t;
      } else if (o.orderPlacedAt) {
        const t = new Date(o.orderPlacedAt).getTime();
        if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) placedTime = t;
      } else if (o.timestamps?.ordered) {
        const t = new Date(o.timestamps.ordered).getTime();
        if (t && Math.abs(orderCreatedTime - t) <= 4 * 60 * 60 * 1000) placedTime = t;
      }

      // Resolve duration (Turn Time)
      let durationMs = null;
      if (orderPaidTime && placedTime && orderPaidTime >= placedTime) {
        durationMs = Math.max(60000, orderPaidTime - placedTime);
      } else if (foodBumpedTime && placedTime && foodBumpedTime >= placedTime) {
        durationMs = Math.max(60000, (foodBumpedTime - placedTime) + 15 * 60 * 1000);
      } else if (placedTime) {
        durationMs = Math.max(60000, Date.now() - placedTime);
      }

      // Covers
      let covers = Number(o.guestCount || o.covers || o.guests || 0);
      if (!covers || isNaN(covers) || covers <= 0) {
        const itemCount = (o.items || []).reduce((s, it) => s + (it.quantity || 1), 0);
        covers = Math.max(1, Math.min(8, Math.ceil(itemCount / 2)));
      }

      // Server
      const server = o.serverName || (staff.find(s => s.id === o.serverId)?.name) || o.waiter || 'Staff';

      return {
        ...o,
        placedTime,
        foodBumpedTime,
        paidTime: orderPaidTime,
        durationMs,
        covers,
        server,
        revenue: Number(o.total || 0),
        billDisplay: o.billNo || (o.id ? o.id.slice(0, 8) : '—'),
      };
    });
  }, [filteredOrders, kdsIndex, kdsTickets, staff]);

  // Master Table Registry: merge posTables, floorPlans.tables, and dynamic tables from orders
  const { tableList, sectionOptions } = useMemo(() => {
    const tableMap = new Map();
    const sectionsSet = new Set();

    const addTable = (raw) => {
      if (!raw) return;
      const id = String(raw.id || raw.number || '').trim();
      if (!id) return;

      const num = raw.number || id;
      const numStr = String(num).replace(/^T-?|^Table\s*/i, '').trim();
      const key = numStr || id;

      if (!tableMap.has(key)) {
        const section = raw.section || raw.sectionName || 'Main Dining';
        sectionsSet.add(section);
        tableMap.set(key, {
          id: raw.id || id,
          number: num,
          numStr,
          displayName: raw.name || (String(num).toLowerCase().startsWith('table') ? num : `Table ${num}`),
          seats: Number(raw.seats || raw.capacity || 4),
          section,
          shape: raw.shape || 'square',
        });
      }
    };

    (posTables || []).forEach(addTable);
    ((floorPlans && floorPlans.tables) || []).forEach(addTable);

    enrichedOrders.forEach(o => {
      const rawId = o.tableId !== undefined && o.tableId !== null ? String(o.tableId).trim() : '';
      const rawName = o.tableName ? String(o.tableName).trim() : '';
      const candidate = rawName || rawId;
      if (!candidate) return;

      const numStr = candidate.replace(/^T-?|^Table\s*|^tab_/i, '').trim();
      const key = numStr || candidate;

      if (!tableMap.has(key)) {
        const displayName = rawName || (numStr ? `Table ${numStr}` : `Table ${rawId}`);
        const section = 'Main Dining';
        sectionsSet.add(section);
        tableMap.set(key, {
          id: rawId || key,
          number: numStr || key,
          numStr,
          displayName,
          seats: Math.max(4, o.covers || 4),
          section,
          shape: 'square',
        });
      }
    });

    const list = Array.from(tableMap.values());
    list.sort((a, b) => {
      const numA = parseInt(a.numStr);
      const numB = parseInt(b.numStr);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.displayName.localeCompare(b.displayName);
    });

    return {
      tableList: list,
      sectionOptions: ['All', ...Array.from(sectionsSet).sort()]
    };
  }, [posTables, floorPlans, enrichedOrders]);

  // Match order to table
  const matchesOrderToTable = (o, t) => {
    if (!o || !t) return false;
    const oTid = String(o.tableId || '').trim();
    const oTname = String(o.tableName || '').trim().toLowerCase();
    const tId = String(t.id || '').trim();
    const tNum = String(t.number || '').trim();
    const tNumStr = String(t.numStr || '').trim();
    const tName = String(t.displayName || '').trim().toLowerCase();

    if (oTid) {
      if (oTid === tId || oTid === tNum || oTid === tNumStr || oTid === `T-${tNumStr}` || oTid === `tab_${tId}` || oTid === `tab_${tNumStr}`) {
        return true;
      }
    }
    if (oTname) {
      if (
        oTname === tName ||
        oTname === `table ${tNumStr}`.toLowerCase() ||
        oTname === `table ${tNum}`.toLowerCase() ||
        oTname === `table ${tId}`.toLowerCase() ||
        oTname === `t-${tNumStr}`.toLowerCase() ||
        oTname === tNumStr.toLowerCase()
      ) {
        return true;
      }
    }
    if (t.tokenNumber && o.tokenNumber && String(t.tokenNumber) === String(o.tokenNumber)) {
      return true;
    }
    return false;
  };

  // Distinct operating days
  const distinctDays = useMemo(() => {
    const days = new Set((filteredOrders || []).map(o => localDayStr(o.createdAt || o.date || o.placedTime)).filter(Boolean));
    return Math.max(1, days.size);
  }, [filteredOrders]);

  const operatingHoursPerDay = 12;
  const totalOperatingHours = distinctDays * operatingHoursPerDay;
  const totalOperatingMs = totalOperatingHours * 60 * 60 * 1000;

  // Compute table analytics
  const tableAnalytics = useMemo(() => {
    return tableList.map(t => {
      const ordersForTable = enrichedOrders.filter(o => matchesOrderToTable(o, t));
      const turns = ordersForTable.length;
      const totalRevenue = ordersForTable.reduce((s, o) => s + o.revenue, 0);
      const totalCovers = ordersForTable.reduce((s, o) => s + o.covers, 0);
      const avgPartySize = turns > 0 ? (totalCovers / turns) : 0;
      const avgCheck = turns > 0 ? (totalRevenue / turns) : 0;
      const avgSpendPerCover = totalCovers > 0 ? (totalRevenue / totalCovers) : 0;

      const validDurations = ordersForTable.map(o => o.durationMs).filter(d => d !== null && d > 0);
      const totalOccupiedMs = validDurations.reduce((s, d) => s + d, 0);
      const avgTurnTimeMs = validDurations.length > 0 ? (totalOccupiedMs / validDurations.length) : null;

      const occupancyRatePct = totalOperatingMs > 0 ? Math.min(100, (totalOccupiedMs / totalOperatingMs) * 100) : 0;
      const seatCapacity = t.seats || 4;
      const seatUtilizationPct = seatCapacity > 0 && turns > 0 ? Math.min(100, (avgPartySize / seatCapacity) * 100) : 0;

      const availableSeatHours = seatCapacity * totalOperatingHours;
      const revPash = availableSeatHours > 0 ? (totalRevenue / availableSeatHours) : 0;

      let rating = 'Idle';
      let ratingColor = '#94a3b8';
      if (turns === 0) {
        rating = 'Idle';
        ratingColor = '#94a3b8';
      } else if (totalRevenue > 4000 && turns >= 3) {
        rating = '⭐ Star Table';
        ratingColor = '#1e5e4a';
      } else if (avgCheck > 1200) {
        rating = '💎 High Spend';
        ratingColor = '#0ea5e9';
      } else if (avgTurnTimeMs && avgTurnTimeMs < 35 * 60 * 1000 && turns >= 2) {
        rating = '⚡ Fast Turn';
        ratingColor = '#22c55e';
      } else if (avgTurnTimeMs && avgTurnTimeMs > 75 * 60 * 1000) {
        rating = '☕ Lingering';
        ratingColor = '#f59e0b';
      } else if (turns === 1) {
        rating = '⚠️ Low Turn';
        ratingColor = '#ec4899';
      } else {
        rating = 'Balanced';
        ratingColor = '#14b8a6';
      }

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
        rating,
        ratingColor,
      };
    });
  }, [tableList, enrichedOrders, totalOperatingMs, totalOperatingHours]);

  // Filtered & Sorted Table Analytics for main grid (responds to Section, Capacity, and Search filters)
  const filteredTableAnalytics = useMemo(() => {
    let result = tableAnalytics;

    if (sectionFilter !== 'All') {
      result = result.filter(t => t.section === sectionFilter);
    }

    if (capacityFilter !== 'All') {
      const cap = parseInt(capacityFilter);
      if (capacityFilter === '8+') {
        result = result.filter(t => t.seatCapacity >= 8);
      } else if (!isNaN(cap)) {
        result = result.filter(t => t.seatCapacity === cap);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        t.displayName.toLowerCase().includes(q) ||
        (t.section && t.section.toLowerCase().includes(q))
      );
    }

    return result;
  }, [tableAnalytics, sectionFilter, capacityFilter, searchQuery]);

  const sortedTableAnalytics = useMemo(() => {
    return sortData(filteredTableAnalytics, sortField, sortDirection);
  }, [filteredTableAnalytics, sortField, sortDirection]);

  // Summary KPIs for the Filtered Selection (updates dynamically when ANY filter changes)
  const floorSummary = useMemo(() => {
    const totalTables = filteredTableAnalytics.length;
    const activeTables = filteredTableAnalytics.filter(t => t.turns > 0);
    const totalCapacity = filteredTableAnalytics.reduce((s, t) => s + t.seatCapacity, 0);
    const totalTurns = filteredTableAnalytics.reduce((s, t) => s + t.turns, 0);
    const totalRevenue = filteredTableAnalytics.reduce((s, t) => s + t.totalRevenue, 0);
    const totalCovers = filteredTableAnalytics.reduce((s, t) => s + t.totalCovers, 0);
    const totalOccupiedMs = filteredTableAnalytics.reduce((s, t) => s + t.totalOccupiedMs, 0);
    const totalOccupiedHours = totalOccupiedMs / (3600 * 1000);

    const avgTurnTimeMs = totalTurns > 0 ? (totalOccupiedMs / totalTurns) : null;
    const avgCheck = totalTurns > 0 ? (totalRevenue / totalTurns) : 0;
    const avgSpendPerCover = totalCovers > 0 ? (totalRevenue / totalCovers) : 0;

    const floorAvailableSeatHours = totalCapacity * totalOperatingHours;
    const floorRevPash = floorAvailableSeatHours > 0 ? (totalRevenue / floorAvailableSeatHours) : 0;

    // Table Occupancy %: proportion of selected tables that had active parties
    const tableOccupancyPct = totalTables > 0 ? Math.min(100, (activeTables.length / totalTables) * 100) : 0;

    const avgSeatEff = activeTables.length > 0
      ? activeTables.reduce((s, t) => s + t.seatUtilizationPct, 0) / activeTables.length
      : 0;

    const sortedByRev = [...filteredTableAnalytics].sort((a, b) => b.totalRevenue - a.totalRevenue);
    const topRevTable = sortedByRev[0]?.totalRevenue > 0 ? sortedByRev[0] : null;

    const sortedByTurns = [...filteredTableAnalytics].sort((a, b) => b.turns - a.turns);
    const topTurnTable = sortedByTurns[0]?.turns > 0 ? sortedByTurns[0] : null;

    const activeWithTurnTime = activeTables.filter(t => t.avgTurnTimeMs !== null && t.turns >= 2);
    activeWithTurnTime.sort((a, b) => a.avgTurnTimeMs - b.avgTurnTimeMs);
    const fastestTurnTable = activeWithTurnTime[0] || null;

    return {
      totalTables,
      activeTableCount: activeTables.length,
      totalCapacity,
      totalTurns,
      totalRevenue,
      totalCovers,
      totalOccupiedMs,
      totalOccupiedHours,
      avgTurnTimeMs,
      avgCheck,
      avgSpendPerCover,
      floorRevPash,
      tableOccupancyPct,
      avgSeatEff,
      topRevTable,
      topTurnTable,
      fastestTurnTable,
      totalSections: sectionOptions.filter(s => s !== 'All').length,
    };
  }, [filteredTableAnalytics, totalOperatingHours, sectionOptions]);

  // Section Breakdown
  const sectionBreakdown = useMemo(() => {
    const secMap = {};
    tableAnalytics.forEach(t => {
      const sec = t.section || 'Main Dining';
      if (!secMap[sec]) {
        secMap[sec] = {
          section: sec,
          tablesCount: 0,
          totalCapacity: 0,
          totalRevenue: 0,
          totalTurns: 0,
          totalCovers: 0,
          totalOccupiedMs: 0,
        };
      }
      secMap[sec].tablesCount += 1;
      secMap[sec].totalCapacity += t.seatCapacity;
      secMap[sec].totalRevenue += t.totalRevenue;
      secMap[sec].totalTurns += t.turns;
      secMap[sec].totalCovers += t.totalCovers;
      secMap[sec].totalOccupiedMs += t.totalOccupiedMs;
    });

    return Object.values(secMap).map(s => {
      const avgTurnTimeMs = s.totalTurns > 0 ? (s.totalOccupiedMs / s.totalTurns) : null;
      const avgCheck = s.totalTurns > 0 ? (s.totalRevenue / s.totalTurns) : 0;
      const sharePct = floorSummary.totalRevenue > 0 ? (s.totalRevenue / floorSummary.totalRevenue * 100) : 0;
      const availSeatHours = s.totalCapacity * totalOperatingHours;
      const revPash = availSeatHours > 0 ? (s.totalRevenue / availSeatHours) : 0;

      return {
        ...s,
        avgTurnTimeMs,
        avgCheck,
        sharePct,
        revPash,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [tableAnalytics, floorSummary.totalRevenue, totalOperatingHours]);

  // Capacity Breakdown
  const capacityBreakdown = useMemo(() => {
    const tiers = [
      { label: '2-Top (1-2 Seats)', filter: s => s <= 2 },
      { label: '4-Top (3-4 Seats)', filter: s => s > 2 && s <= 4 },
      { label: '6-Top (5-6 Seats)', filter: s => s > 4 && s <= 6 },
      { label: '8+ Top (7+ Seats)', filter: s => s > 6 },
    ];

    return tiers.map(tier => {
      const matched = tableAnalytics.filter(t => tier.filter(t.seatCapacity));
      const tablesCount = matched.length;
      const totalTurns = matched.reduce((s, t) => s + t.turns, 0);
      const totalRevenue = matched.reduce((s, t) => s + t.totalRevenue, 0);
      const totalCovers = matched.reduce((s, t) => s + t.totalCovers, 0);
      const totalCapacity = matched.reduce((s, t) => s + t.seatCapacity, 0);
      const avgPartySize = totalTurns > 0 ? (totalCovers / totalTurns) : 0;
      const avgCheck = totalTurns > 0 ? (totalRevenue / totalTurns) : 0;
      const nominalCapacity = tablesCount > 0 ? totalCapacity / tablesCount : 4;
      const seatEffPct = nominalCapacity > 0 && totalTurns > 0 ? Math.min(100, (avgPartySize / nominalCapacity) * 100) : 0;

      return {
        label: tier.label,
        tablesCount,
        totalTurns,
        totalRevenue,
        avgPartySize,
        avgCheck,
        seatEffPct,
      };
    }).filter(tier => tier.tablesCount > 0);
  }, [tableAnalytics]);

  // Hourly Occupancy Timeline
  const hourlyOccupancy = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: formatHour(i),
      orderCount: 0,
      occupiedTables: new Set(),
      revenue: 0,
    }));

    enrichedOrders.forEach(o => {
      if (o.placedTime) {
        const startH = new Date(o.placedTime).getHours();
        const endH = o.paidTime ? new Date(o.paidTime).getHours() : startH;

        for (let h = startH; h <= Math.min(23, Math.max(startH, endH)); h++) {
          hours[h].occupiedTables.add(o.tableId || o.tableName || o.id);
        }
        hours[startH].orderCount += 1;
        hours[startH].revenue += o.revenue;
      }
    });

    const maxTables = Math.max(...hours.map(h => h.occupiedTables.size), 1);

    return hours.map(h => ({
      ...h,
      tablesActive: h.occupiedTables.size,
      intensityPct: Math.round((h.occupiedTables.size / maxTables) * 100),
    }));
  }, [enrichedOrders]);

  // CSV Export for Table Analytics
  const handleExportCSV = () => {
    const headers = [
      'Table Name',
      'Section',
      'Capacity (Seats)',
      'Total Turns',
      'Total Occupied Duration',
      'Avg Turn Time (Mins)',
      'Occupancy Rate %',
      'Total Revenue (INR)',
      'Avg Check per Turn (INR)',
      'Total Covers (Guests)',
      'Avg Spend per Cover (INR)',
      'Seat Utilization %',
      'RevPASH (INR/Seat-Hour)',
      'Performance Status'
    ];

    const rows = sortedTableAnalytics.map(t => [
      `"${t.displayName}"`,
      `"${t.section}"`,
      t.seatCapacity,
      t.turns,
      `"${fmtDuration(t.totalOccupiedMs)}"`,
      t.avgTurnTimeMs ? Math.round(t.avgTurnTimeMs / 60000) : 0,
      t.occupancyRatePct.toFixed(1),
      t.totalRevenue.toFixed(2),
      t.avgCheck.toFixed(2),
      t.totalCovers,
      t.avgSpendPerCover.toFixed(2),
      t.seatUtilizationPct.toFixed(1),
      t.revPash.toFixed(2),
      `"${t.rating}"`
    ].join(','));

    downloadCSV(`table_analytics_${range.toLowerCase().replace(/\s+/g, '_')}.csv`, [headers.join(','), ...rows]);
  };

  // CSV Export for individual table sessions
  const handleExportTableSessionsCSV = (table) => {
    if (!table || !table.orders || table.orders.length === 0) return;
    const headers = [
      'Order ID / Bill #',
      'Table',
      'Seated / Placed At',
      'Food Bumped At',
      'Paid At',
      'Duration (Mins)',
      'Covers / Guests',
      'Server',
      'Payment Method',
      'Total Amount (INR)',
      'Status'
    ];

    const rows = table.orders.map(o => [
      `"${o.billDisplay}"`,
      `"${table.displayName}"`,
      `"${fmtDateTime(o.placedTime)}"`,
      `"${o.foodBumpedTime ? fmtDateTime(o.foodBumpedTime) : '—'}"`,
      `"${o.paidTime ? fmtDateTime(o.paidTime) : '—'}"`,
      o.durationMs ? Math.round(o.durationMs / 60000) : 0,
      o.covers,
      `"${o.server}"`,
      `"${o.paymentMethod || '—'}"`,
      o.revenue.toFixed(2),
      `"${o.status}"`
    ].join(','));

    downloadCSV(`${table.displayName.toLowerCase().replace(/\s+/g, '_')}_sessions.csv`, [headers.join(','), ...rows]);
  };

  const displayedTables = showAllTables ? sortedTableAnalytics : sortedTableAnalytics.slice(0, 50);

  return (
    <div>
      {/* Filter Bar */}
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />

        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Section:</span>
        <Select value={sectionFilter} onChange={setSectionFilter}>
          {sectionOptions.map(sec => (
            <option key={sec} value={sec}>{sec === 'All' ? 'All Sections' : sec}</option>
          ))}
        </Select>

        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Size:</span>
        <Select value={capacityFilter} onChange={setCapacityFilter}>
          <option value="All">All Capacities</option>
          <option value="2">2-Tops (1-2 Seats)</option>
          <option value="4">4-Tops (3-4 Seats)</option>
          <option value="6">6-Tops (5-6 Seats)</option>
          <option value="8+">8+ Tops (Large)</option>
        </Select>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 8 }} />
          <input
            type="text"
            placeholder="Search table or area..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '5px 10px 5px 28px',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              fontSize: '0.78rem',
              outline: 'none',
              background: 'white',
              width: 150,
            }}
          />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <ExportBtn onClick={handleExportCSV} />
        </div>
      </FilterBar>

      {/* Top Level Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard
          label="Total Dine-In Revenue"
          value={fmt(floorSummary.totalRevenue)}
          sub={`${floorSummary.totalTurns} total parties seated`}
          color="#1e5e4a"
          icon={IndianRupee}
        />
        <StatCard
          label="Avg Table Turn Time"
          value={fmtDuration(floorSummary.avgTurnTimeMs)}
          sub={`${floorSummary.totalOccupiedHours.toFixed(1)} hrs occupied`}
          color="#0ea5e9"
          icon={Timer}
        />
        <StatCard
          label={sectionFilter !== 'All' ? `${sectionFilter} Occupancy` : (capacityFilter !== 'All' ? `${capacityFilter}-Top Occupancy` : "Table Occupancy Rate")}
          value={fmtPct(floorSummary.tableOccupancyPct)}
          sub={`${floorSummary.activeTableCount} of ${floorSummary.totalTables} tables active (${fmtDuration(floorSummary.totalOccupiedMs)} in use)`}
          color="#22c55e"
          icon={TableProperties}
        />
        <StatCard
          label="Floor RevPASH"
          value={`₹${Math.round(floorSummary.floorRevPash)} / hr`}
          sub={`Avg check ${fmt(floorSummary.avgCheck)}`}
          color="#f59e0b"
          icon={TrendingUp}
        />
      </div>

      {/* Highlights Bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16,
        padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(30, 94, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={16} color="#1e5e4a" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Top Revenue Table</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {floorSummary.topRevTable ? `${floorSummary.topRevTable.displayName} (${fmt(floorSummary.topRevTable.totalRevenue)})` : '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(14, 165, 233, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={16} color="#0ea5e9" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Most Turned Table</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {floorSummary.topTurnTable ? `${floorSummary.topTurnTable.displayName} (${floorSummary.topTurnTable.turns} turns)` : '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={16} color="#22c55e" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Fastest Turnover</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {floorSummary.fastestTurnTable ? `${floorSummary.fastestTurnTable.displayName} (${fmtDuration(floorSummary.fastestTurnTable.avgTurnTimeMs)})` : '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={16} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Covers (Guests)</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {floorSummary.totalCovers > 0 ? `${floorSummary.totalCovers} guests (${fmt(floorSummary.avgSpendPerCover)}/guest)` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table-by-Table Data Grid */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <SectionTitle style={{ marginBottom: 2 }}>Table Performance &amp; Utilization Matrix</SectionTitle>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Showing {displayedTables.length} of {tableAnalytics.length} tables · Click any row or &quot;View Sessions&quot; for complete guest timeline
            </span>
          </div>
          {sortedTableAnalytics.length > 50 && (
            <button
              onClick={() => setShowAllTables(prev => !prev)}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--primary)',
                fontWeight: 600,
              }}
            >
              {showAllTables ? 'Show First 50' : `Show All (${sortedTableAnalytics.length})`}
            </button>
          )}
        </div>

        {displayedTables.length === 0 ? <Empty text="No tables matched the current filters." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="displayName" sortDirection={sortDirection} onSort={handleSort}>Table</Th>
                <Th sortField={sortField} currentField="section" sortDirection={sortDirection} onSort={handleSort}>Section</Th>
                <Th right sortField={sortField} currentField="seatCapacity" sortDirection={sortDirection} onSort={handleSort}>Seats</Th>
                <Th right sortField={sortField} currentField="turns" sortDirection={sortDirection} onSort={handleSort}>Turns</Th>
                <Th right sortField={sortField} currentField="totalOccupiedMs" sortDirection={sortDirection} onSort={handleSort}>Occupied Time</Th>
                <Th right sortField={sortField} currentField="avgTurnTimeMs" sortDirection={sortDirection} onSort={handleSort}>Avg Turn</Th>
                <Th right sortField={sortField} currentField="occupancyRatePct" sortDirection={sortDirection} onSort={handleSort}>Occupancy %</Th>
                <Th right sortField={sortField} currentField="totalRevenue" sortDirection={sortDirection} onSort={handleSort}>Total Sales</Th>
                <Th right sortField={sortField} currentField="avgCheck" sortDirection={sortDirection} onSort={handleSort}>Avg Check</Th>
                <Th right sortField={sortField} currentField="totalCovers" sortDirection={sortDirection} onSort={handleSort}>Covers</Th>
                <Th right sortField={sortField} currentField="avgSpendPerCover" sortDirection={sortDirection} onSort={handleSort}>Spend/Guest</Th>
                <Th right sortField={sortField} currentField="seatUtilizationPct" sortDirection={sortDirection} onSort={handleSort}>Seat Eff. %</Th>
                <Th right sortField={sortField} currentField="revPash" sortDirection={sortDirection} onSort={handleSort}>RevPASH</Th>
                <Th>Status</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {displayedTables.map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTableModal(t)}
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.015)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Td bold>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Armchair size={13} color="var(--primary)" />
                      {t.displayName}
                    </div>
                  </Td>
                  <Td muted>{t.section}</Td>
                  <Td right>{t.seatCapacity}</Td>
                  <Td right bold style={{ color: t.turns > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {t.turns}
                  </Td>
                  <Td right muted>{fmtDuration(t.totalOccupiedMs)}</Td>
                  <Td right bold style={{ color: t.avgTurnTimeMs ? '#1e5e4a' : 'var(--text-muted)' }}>
                    {fmtDuration(t.avgTurnTimeMs)}
                  </Td>
                  <Td right>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: 80 }}>
                      <div style={{ width: 36, height: 6, borderRadius: 3, background: 'rgba(226,232,240,0.6)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, t.occupancyRatePct)}%`, height: '100%',
                          background: t.occupancyRatePct > 50 ? '#1e5e4a' : (t.occupancyRatePct > 20 ? '#0ea5e9' : '#94a3b8'),
                          borderRadius: 3
                        }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{fmtPct(t.occupancyRatePct)}</span>
                    </div>
                  </Td>
                  <Td right bold>{fmt(t.totalRevenue)}</Td>
                  <Td right>{fmt(t.avgCheck)}</Td>
                  <Td right muted>{t.totalCovers}</Td>
                  <Td right>{fmt(t.avgSpendPerCover)}</Td>
                  <Td right muted title="Avg Party Size vs Table Capacity">
                    {fmtPct(t.seatUtilizationPct)}
                  </Td>
                  <Td right bold style={{ color: '#0ea5e9' }}>
                    ₹{Math.round(t.revPash)}
                  </Td>
                  <Td>
                    <Badge label={t.rating} color={t.ratingColor} />
                  </Td>
                  <Td right>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTableModal(t);
                      }}
                      className="btn btn-secondary"
                      style={{
                        padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex',
                        alignItems: 'center', gap: 4, borderRadius: 6
                      }}
                    >
                      <Eye size={11} />
                      Sessions ({t.turns})
                    </button>
                  </Td>
                </tr>
              ))}

              {/* Summary Totals Row */}
              <tr>
                <TdSummary bold>Total Floor ({floorSummary.totalTables} Tables)</TdSummary>
                <TdSummary muted>{floorSummary.totalSections} Sections</TdSummary>
                <TdSummary right bold>{floorSummary.totalCapacity} Seats</TdSummary>
                <TdSummary right bold>{floorSummary.totalTurns}</TdSummary>
                <TdSummary right bold>{fmtDuration(floorSummary.totalOccupiedMs)}</TdSummary>
                <TdSummary right bold>{fmtDuration(floorSummary.avgTurnTimeMs)}</TdSummary>
                <TdSummary right bold>{fmtPct(floorSummary.tableOccupancyPct)}</TdSummary>
                <TdSummary right bold>{fmt(floorSummary.totalRevenue)}</TdSummary>
                <TdSummary right bold>{fmt(floorSummary.avgCheck)}</TdSummary>
                <TdSummary right bold>{floorSummary.totalCovers}</TdSummary>
                <TdSummary right bold>{fmt(floorSummary.avgSpendPerCover)}</TdSummary>
                <TdSummary right bold>{fmtPct(floorSummary.avgSeatEff)}</TdSummary>
                <TdSummary right bold>₹{Math.round(floorSummary.floorRevPash)}</TdSummary>
                <TdSummary />
                <TdSummary />
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Secondary Analytical Breakdowns (Section & Capacity) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
        {/* Section Performance */}
        <div className="card">
          <SectionTitle>Floor Area / Section Breakdown</SectionTitle>
          <TableWrap>
            <thead>
              <tr>
                <Th>Section Area</Th>
                <Th right>Tables</Th>
                <Th right>Seats</Th>
                <Th right>Turns</Th>
                <Th right>Sales</Th>
                <Th right>Share %</Th>
                <Th right>Avg Turn</Th>
                <Th right>RevPASH</Th>
              </tr>
            </thead>
            <tbody>
              {sectionBreakdown.map(s => (
                <tr key={s.section}>
                  <Td bold>{s.section}</Td>
                  <Td right muted>{s.tablesCount}</Td>
                  <Td right muted>{s.totalCapacity}</Td>
                  <Td right bold>{s.totalTurns}</Td>
                  <Td right bold>{fmt(s.totalRevenue)}</Td>
                  <Td right>{fmtPct(s.sharePct)}</Td>
                  <Td right muted>{fmtDuration(s.avgTurnTimeMs)}</Td>
                  <Td right bold style={{ color: '#0ea5e9' }}>₹{Math.round(s.revPash)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>

        {/* Table Size / Capacity Analysis */}
        <div className="card">
          <SectionTitle>Table Size &amp; Seating Capacity Analysis</SectionTitle>
          <TableWrap>
            <thead>
              <tr>
                <Th>Table Type</Th>
                <Th right>Tables</Th>
                <Th right>Turns</Th>
                <Th right>Sales</Th>
                <Th right>Avg Check</Th>
                <Th right>Avg Party</Th>
                <Th right>Seat Eff. %</Th>
              </tr>
            </thead>
            <tbody>
              {capacityBreakdown.map(c => (
                <tr key={c.label}>
                  <Td bold>{c.label}</Td>
                  <Td right muted>{c.tablesCount}</Td>
                  <Td right bold>{c.totalTurns}</Td>
                  <Td right bold>{fmt(c.totalRevenue)}</Td>
                  <Td right>{fmt(c.avgCheck)}</Td>
                  <Td right muted>{c.avgPartySize.toFixed(1)} guests</Td>
                  <Td right bold style={{ color: c.seatEffPct >= 70 ? '#1e5e4a' : '#f59e0b' }}>
                    {fmtPct(c.seatEffPct)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </div>

      {/* Hourly Table Occupancy Heatmap / Timeline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Hourly Table Occupancy &amp; Rush Distribution</SectionTitle>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Peak table demand across 24-hour cycle
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8, padding: '10px 0' }}>
          {hourlyOccupancy.map(h => {
            const ratio = h.intensityPct / 100;
            const bg = ratio > 0.8 ? 'rgba(239,68,68,0.85)'
                     : ratio > 0.5 ? 'rgba(245,158,11,0.8)'
                     : ratio > 0.2 ? 'rgba(30, 94, 74,0.6)'
                     : ratio > 0 ? 'rgba(30, 94, 74,0.18)'
                     : 'rgba(226,232,240,0.3)';

            return (
              <div
                key={h.hour}
                title={`${h.label}: ${h.tablesActive} tables occupied, ${h.orderCount} orders, Sales: ${fmt(h.revenue)}`}
                style={{
                  aspectRatio: '1', borderRadius: 8, background: bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default', transition: 'all 0.2s', border: '1px solid var(--border-subtle)'
                }}
              >
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: ratio > 0.4 ? 'white' : 'var(--text-secondary)' }}>
                  {h.label}
                </span>
                {h.tablesActive > 0 && (
                  <span style={{ fontSize: '0.52rem', opacity: 0.9, color: ratio > 0.4 ? 'white' : 'var(--text-muted)' }}>
                    {h.tablesActive} tbls
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(226,232,240,0.3)' }} /> Idle</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(30, 94, 74,0.18)' }} /> Low Active</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(30, 94, 74,0.6)' }} /> Moderate</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.8)' }} /> Busy Rush</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.85)' }} /> Peak Rush</span>
        </div>
      </div>

      {/* Table Session History Drill-down Modal */}
      {selectedTableModal && (
        <Modal
          open={Boolean(selectedTableModal)}
          onClose={() => setSelectedTableModal(null)}
          title={`${selectedTableModal.displayName} — Session & Order History`}
          wide
        >
          <div>
            {/* Modal Subheader */}
            <div style={{
              display: 'flex', gap: 16, alignItems: 'center', padding: '10px 14px',
              background: 'rgba(248,250,252,0.9)', borderRadius: 10, border: '1px solid var(--border-subtle)',
              marginBottom: 16, flexWrap: 'wrap'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Section: </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{selectedTableModal.section}</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Capacity: </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{selectedTableModal.seatCapacity} Seats</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Turns: </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)' }}>{selectedTableModal.turns}</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Revenue: </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e5e4a' }}>{fmt(selectedTableModal.totalRevenue)}</span>
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--border-subtle)' }} />
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Avg Turn Time: </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{fmtDuration(selectedTableModal.avgTurnTimeMs)}</span>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleExportTableSessionsCSV(selectedTableModal)}
                  style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Download size={12} /> Export Sessions
                </button>
              </div>
            </div>

            {/* Sessions Table */}
            {(!selectedTableModal.orders || selectedTableModal.orders.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                <Armchair size={32} strokeWidth={1} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: '0.82rem' }}>No orders recorded for {selectedTableModal.displayName} in this period.</p>
              </div>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Bill / Order #</Th>
                    <Th>Seated / Placed</Th>
                    <Th>Food Ready</Th>
                    <Th>Paid / Cleared</Th>
                    <Th right>Turn Time</Th>
                    <Th right>Covers</Th>
                    <Th>Server</Th>
                    <Th>Items Summary</Th>
                    <Th right>Total</Th>
                    <Th>Payment</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTableModal.orders.map(o => {
                    const dur = o.durationMs;
                    let durColor = '#1e5e4a';
                    if (dur) {
                      const mins = dur / 60000;
                      if (mins > 90) durColor = '#ec4899';
                      else if (mins > 60) durColor = '#f59e0b';
                      else if (mins > 30) durColor = '#0ea5e9';
                      else durColor = '#22c55e';
                    }

                    const itemsPreview = (o.items || [])
                      .map(it => `${it.name || it.itemName || 'Item'}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`)
                      .slice(0, 2)
                      .join(', ');
                    const extraItems = (o.items || []).length > 2 ? ` +${(o.items || []).length - 2} more` : '';

                    return (
                      <tr key={o.id || o.billNo}>
                        <Td bold>{o.billDisplay}</Td>
                        <Td style={{ fontSize: '0.72rem' }}>{fmtDateTime(o.placedTime)}</Td>
                        <Td style={{ fontSize: '0.72rem' }}>{o.foodBumpedTime ? fmtTime(o.foodBumpedTime) : '—'}</Td>
                        <Td style={{ fontSize: '0.72rem' }}>{o.paidTime ? fmtTime(o.paidTime) : '—'}</Td>
                        <Td right bold style={{ color: durColor }}>
                          {fmtDuration(dur)}
                        </Td>
                        <Td right muted>{o.covers}</Td>
                        <Td muted>{o.server}</Td>
                        <Td style={{ fontSize: '0.72rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={itemsPreview + extraItems}>
                          {itemsPreview ? `${itemsPreview}${extraItems}` : '—'}
                        </Td>
                        <Td right bold>{fmt(o.revenue)}</Td>
                        <Td muted style={{ fontSize: '0.72rem' }}>{o.paymentMethod || '—'}</Td>
                        <Td>
                          <Badge
                            label={o.status || 'paid'}
                            color={o.status === 'paid' ? '#1e5e4a' : (o.status === 'cancelled' ? '#ef4444' : '#f59e0b')}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// =================================================================
// TAB 8 -- LABOR & STAFFING REPORT (Retained from original layout)
// =================================================================

const LaborReport = ({ orders, staff: staffList }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  useHistoricalOrders(range, dateFrom);

  const { sortField, sortDirection, handleSort } = useSort('totalPay', 'desc');

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
    }).filter(d => d.hours > 0);
  }, [staffList, filteredAttendance, totalRevenue]);

  const sortedLaborData = useMemo(() => {
    return sortData(laborData, sortField, sortDirection);
  }, [laborData, sortField, sortDirection]);

  const totalLaborCost = useMemo(() => laborData.reduce((s, d) => s + d.totalPay, 0), [laborData]);
  const laborPct = totalRevenue > 0 ? (totalLaborCost / totalRevenue * 100) : 0;
  const totalHours = laborData.reduce((s, d) => s + d.hours, 0);

  const handleExport = () => {
    const rows = [
      'Name,Role,Hours Worked,Rate (₹/hr),Total Pay,Overtime Hours,Revenue Per Labor Hour',
      ...sortedLaborData.map(d =>
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
        <StatCard label="Total Labor Cost" value={fmt(totalLaborCost)} color="#1e5e4a" icon={IndianRupee} />
        <StatCard label="Labor Cost %" value={fmtPct(laborPct)} sub={laborPct > 30 ? 'Above target' : 'Within target'} color={laborPct > 30 ? '#ef4444' : '#22c55e'} icon={Gauge} />
        <StatCard label="Total Hours" value={`${totalHours.toFixed(1)}h`} color="#0ea5e9" icon={Clock} />
        <StatCard label="Total Revenue" value={fmt(totalRevenue)} color="#f59e0b" icon={TrendingUp} />
      </div>

      <div className="card">
        <SectionTitle>Staff Hours &amp; Labor Costs ({sortedLaborData.length} active staff)</SectionTitle>
        {sortedLaborData.length === 0 ? <Empty text="No labor or attendance data logged for this period." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th sortField={sortField} currentField="name" sortDirection={sortDirection} onSort={handleSort}>Name</Th>
                <Th sortField={sortField} currentField="role" sortDirection={sortDirection} onSort={handleSort}>Role</Th>
                <Th right sortField={sortField} currentField="hours" sortDirection={sortDirection} onSort={handleSort}>Hours Worked</Th>
                <Th right sortField={sortField} currentField="rate" sortDirection={sortDirection} onSort={handleSort}>Rate (₹/hr)</Th>
                <Th right sortField={sortField} currentField="totalPay" sortDirection={sortDirection} onSort={handleSort}>Total Pay</Th>
                <Th right sortField={sortField} currentField="overtime" sortDirection={sortDirection} onSort={handleSort}>Overtime</Th>
                <Th right sortField={sortField} currentField="revenuePerHour" sortDirection={sortDirection} onSort={handleSort}>Rev / Labor Hour</Th>
              </tr>
            </thead>
            <tbody>
              {sortedLaborData.map(d => (
                <tr key={d.id}>
                  <Td bold>{d.name}</Td>
                  <Td><Badge label={d.role} color="#1e5e4a" /></Td>
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
// ATTENDANCE TAB
// =================================================================

const AttendanceReportTab = ({ staff, attendance }) => {
  const [fromDate, setFromDate] = useState(daysAgo(29));
  const [toDate, setToDate] = useState(attLocalDay());
  const [roleFilter, setRoleFilter] = useState('All');

  const roles = useMemo(() => ['All', ...new Set(staff.map(s => s.role).filter(Boolean))], [staff]);

  // Per-staff summary over the selected range
  const summary = useMemo(() => {
    const inRange = (a) => {
      const d = recordDay(a);
      return d && d >= fromDate && d <= toDate;
    };
    return staff
      .filter(s => roleFilter === 'All' || s.role === roleFilter)
      .map(member => {
        const logs = attendance.filter(a => a.staffId === member.id && inRange(a));
        const hours = totalHours(logs);
        const days = activeDays(logs).size;
        const sorted = [...logs].sort((a, b) => new Date(recordTs(b)) - new Date(recordTs(a)));
        const lastPunch = sorted[0] || null;
        return {
          id: member.id, name: member.name, role: member.role,
          hours, days, punches: logs.length,
          avg: days ? hours / days : 0,
          lastPunch,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [staff, attendance, fromDate, toDate, roleFilter]);

  // Flat per-session rows (for the detail table + CSV)
  const rows = useMemo(() => {
    const inRange = (a) => {
      const d = recordDay(a);
      return d && d >= fromDate && d <= toDate;
    };
    const out = [];
    staff
      .filter(s => roleFilter === 'All' || s.role === roleFilter)
      .forEach(member => {
        const logs = attendance.filter(a => a.staffId === member.id && inRange(a));
        const byDate = {};
        logs.forEach(l => { const d = recordDay(l); (byDate[d] = byDate[d] || []).push(l); });
        Object.entries(byDate).forEach(([date, dayLogs]) => {
          pairSessions(dayLogs).forEach((s, i) => {
            const ms = s.in && s.out ? new Date(recordTs(s.out)) - new Date(recordTs(s.in)) : null;
            out.push({
              id: `${member.id}-${date}-${i}`,
              name: member.name, role: member.role, date,
              inTime: s.in ? attFmtTime(recordTs(s.in)) : '--',
              outTime: s.out ? attFmtTime(recordTs(s.out)) : 'Active',
              hours: ms !== null ? (ms / 36e5).toFixed(1) : '--',
              active: !s.out,
            });
          });
        });
      });
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }, [staff, attendance, fromDate, toDate, roleFilter]);

  const totals = useMemo(() => {
    // Count "clocked in now" straight from punches so it matches the dashboard
    // even for people (e.g. an owner) who have no staff row.
    const byStaff = {};
    (attendance || []).forEach(a => { (byStaff[a.staffId] = byStaff[a.staffId] || []).push(a); });
    const clockedNow = Object.values(byStaff).filter(logs => {
      const sorted = [...logs].sort((a, b) => new Date(recordTs(a)) - new Date(recordTs(b)));
      return sorted[sorted.length - 1]?.type === 'IN';
    }).length;
    return {
      hours: summary.reduce((s, r) => s + r.hours, 0),
      present: summary.filter(r => r.punches > 0).length,
      clockedNow,
    };
  }, [summary, attendance]);

  const exportCSV = () => {
    const header = 'Name,Role,Date,Clock In,Clock Out,Hours';
    const body = rows.map(r => `${r.name},${r.role},${r.date},${r.inTime},${r.outTime},${r.hours}`);
    downloadCSV(`attendance-${fromDate}-to-${toDate}.csv`, [header, ...body]);
  };

  return (
    <div className="animate-fade-up">
      <FilterBar>
        <DateInput label="From" value={fromDate} onChange={setFromDate} />
        <DateInput label="To" value={toDate} onChange={setToDate} />
        <Select value={roleFilter} onChange={setRoleFilter}>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={exportCSV} /></div>
      </FilterBar>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Clocked In Now" value={totals.clockedNow} color="#22c55e" icon={CheckCircle} />
        <StatCard label="Staff With Activity" value={totals.present} color="#1e5e4a" icon={Users} />
        <StatCard label="Total Hours" value={`${totals.hours.toFixed(1)}h`} color="#0ea5e9" icon={Clock} />
        <StatCard label="Days In Range" value={activeDaysBetween(fromDate, toDate)} color="#f59e0b" icon={CalendarCheck} />
      </div>

      {/* Calendar overview */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionTitle>Team Attendance Calendar</SectionTitle>
        <div style={{ maxWidth: 460, margin: '12px auto 0' }}>
          <AttendanceCalendar attendance={attendance} />
        </div>
      </div>

      {/* Per-staff summary */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionTitle>Hours by Staff</SectionTitle>
        {summary.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Staff</Th><Th>Role</Th><Th right>Days Present</Th>
                <Th right>Total Hours</Th><Th right>Avg / Day</Th><Th>Last Punch</Th>
              </tr>
            </thead>
            <tbody>
              {summary.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Td bold>{r.name}</Td>
                  <Td muted>{r.role}</Td>
                  <Td right>{r.days}</Td>
                  <Td right bold>{r.hours.toFixed(1)}h</Td>
                  <Td right>{r.avg.toFixed(1)}h</Td>
                  <Td muted>{r.lastPunch ? `${attFmtDate(recordDay(r.lastPunch))} · ${r.lastPunch.type}` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Session detail */}
      <div className="card" style={{ padding: 20 }}>
        <SectionTitle>Session Detail</SectionTitle>
        {rows.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Staff</Th><Th>Role</Th><Th>Date</Th><Th>Clock In</Th><Th>Clock Out</Th><Th right>Hours</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Td bold>{r.name}</Td>
                  <Td muted>{r.role}</Td>
                  <Td muted>{attFmtDate(r.date)}</Td>
                  <Td><span style={{ color: 'var(--success)', fontWeight: 600 }}>{r.inTime}</span></Td>
                  <Td><span style={{ color: r.active ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>{r.outTime}</span></Td>
                  <Td right bold>{r.hours !== '--' ? `${r.hours}h` : '--'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

// Inclusive day count between two yyyy-mm-dd strings
function activeDaysBetween(from, to) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

// =================================================================
// GIFT CARDS & DIGITAL WALLET REPORT
// =================================================================

const GiftCardWalletReport = ({ giftCards = [], guests = [], orders = [] }) => {
  const [range, setRange] = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [subView, setSubView] = useState('ledger'); // 'ledger' | 'customers'
  const [typeFilter, setTypeFilter] = useState('All'); // 'All' | 'issue' | 'redeem'
  const [searchQuery, setSearchQuery] = useState('');
  const [invoiceHistoryOrder, setInvoiceHistoryOrder] = useState(null);

  const { sortField, sortDirection, handleSort } = useSort('createdAt', 'desc');

  // Filter gift card transactions by range
  const rangedTransactions = useMemo(() => {
    return filterByRange(giftCards, range, dateFrom, dateTo, 'createdAt');
  }, [giftCards, range, dateFrom, dateTo]);

  // Apply type and search query filters to ledger transactions
  const filteredTransactions = useMemo(() => {
    let list = rangedTransactions;

    if (typeFilter !== 'All') {
      list = list.filter(t => t.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t =>
        (t.guestName || '').toLowerCase().includes(q) ||
        (t.guestPhone || '').toLowerCase().includes(q) ||
        (t.billNo || '').toLowerCase().includes(q) ||
        (t.orderId || '').toLowerCase().includes(q) ||
        (t.staffName || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [rangedTransactions, typeFilter, searchQuery]);

  const sortedTransactions = useMemo(() => {
    return sortData(filteredTransactions, sortField, sortDirection, {
      guestName: t => t.guestName || '',
      amount: t => parseFloat(t.amount || 0),
      balanceAfter: t => parseFloat(t.balanceAfter || 0),
      createdAt: t => t.createdAt || ''
    });
  }, [filteredTransactions, sortField, sortDirection]);

  // KPI Metrics
  const stats = useMemo(() => {
    // Current total outstanding liability across all guests
    const totalLiability = (guests || []).reduce((sum, g) => sum + (parseFloat(g.walletBalance || 0)), 0);
    const activeWalletUsers = (guests || []).filter(g => parseFloat(g.walletBalance || 0) > 0).length;

    // Period metrics from rangedTransactions
    const issuedTxs = rangedTransactions.filter(t => t.type === 'issue');
    const redeemedTxs = rangedTransactions.filter(t => t.type === 'redeem');

    const totalIssued = issuedTxs.reduce((sum, t) => sum + (parseFloat(t.amount || 0)), 0);
    const totalRedeemed = redeemedTxs.reduce((sum, t) => sum + (parseFloat(t.amount || 0)), 0);

    return {
      totalLiability,
      activeWalletUsers,
      totalIssued,
      issuedCount: issuedTxs.length,
      totalRedeemed,
      redeemedCount: redeemedTxs.length,
    };
  }, [guests, rangedTransactions]);

  // Filtered customers directory
  const customerList = useMemo(() => {
    let list = (guests || []).filter(g => (parseFloat(g.walletBalance || 0) > 0) || (g.totalVisits > 0));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(g =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.phone || '').toLowerCase().includes(q)
      );
    }

    // Sort by walletBalance desc
    return [...list].sort((a, b) => (parseFloat(b.walletBalance || 0) - parseFloat(a.walletBalance || 0)));
  }, [guests, searchQuery]);

  const handleExportCSV = () => {
    if (subView === 'ledger') {
      const rows = [
        'Date & Time,Type,Guest Name,Guest Mobile,Bill / Invoice,Amount,Balance After,Staff,Notes',
        ...sortedTransactions.map(t => {
          const typeStr = t.type === 'issue' ? 'Credit Issued (Extra Cash)' : 'Credit Redeemed (Bill Payment)';
          const amtStr = `${t.type === 'issue' ? '+' : '-'}${parseFloat(t.amount || 0).toFixed(2)}`;
          return `"${fmtDateTime(t.createdAt)}","${typeStr}","${t.guestName || 'Guest'}","${t.guestPhone || ''}","${t.billNo || t.orderId || ''}",${amtStr},${(parseFloat(t.balanceAfter || 0)).toFixed(2)},"${t.staffName || ''}","${(t.notes || '').replace(/"/g, '""')}"`;
        })
      ];
      downloadCSV(`gift_cards_wallet_ledger_${range.toLowerCase().replace(/\s+/g, '_')}.csv`, rows);
    } else {
      const rows = [
        'Guest Name,Mobile Number,Wallet Balance,Total Visits,Total Spend,Last Visit',
        ...customerList.map(g =>
          `"${g.name || 'Guest'}","${g.phone || ''}",${(parseFloat(g.walletBalance || 0)).toFixed(2)},${g.totalVisits || 0},${(parseFloat(g.totalSpend || 0)).toFixed(2)},"${fmtDateTime(g.lastVisit)}"`
        )
      ];
      downloadCSV('customer_wallet_balances.csv', rows);
    }
  };

  return (
    <div className="animate-fade-up">
      {/* Sub-Tabs / Mode Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${subView === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubView('ledger')}
          style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Receipt size={14} /> Audit Ledger &amp; Extra Cash
        </button>
        <button
          className={`btn ${subView === 'customers' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubView('customers')}
          style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Users size={14} /> Customer Wallet Balances ({stats.activeWalletUsers})
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard
          label="Total Active Wallet Liability"
          value={fmt(stats.totalLiability)}
          sub={`${stats.activeWalletUsers} customer${stats.activeWalletUsers === 1 ? '' : 's'} hold credit`}
          color="#10b981"
          icon={Wallet}
        />
        <StatCard
          label="Credit Issued (In Period)"
          value={fmt(stats.totalIssued)}
          sub={`${stats.issuedCount} deposit${stats.issuedCount === 1 ? '' : 's'} / extra cash`}
          color="#3b82f6"
          icon={Gift}
        />
        <StatCard
          label="Credit Redeemed (In Period)"
          value={fmt(stats.totalRedeemed)}
          sub={`${stats.redeemedCount} bill settlement${stats.redeemedCount === 1 ? '' : 's'}`}
          color="#8b5cf6"
          icon={IndianRupee}
        />
        <StatCard
          label="Active Wallet Customers"
          value={stats.activeWalletUsers}
          sub="Phone-linked profiles"
          color="#f59e0b"
          icon={Users}
        />
      </div>

      {/* Filter Bar */}
      <FilterBar>
        {subView === 'ledger' && (
          <>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
            <RangePicker
              range={range}
              setRange={setRange}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
            <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Type:</span>
            <Select value={typeFilter} onChange={setTypeFilter}>
              <option value="All">All Transactions</option>
              <option value="issue">Credit Issued (Extra Cash / Deposit)</option>
              <option value="redeem">Credit Redeemed (Paid with Wallet)</option>
            </Select>
          </>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 8 }} />
          <input
            type="text"
            placeholder={subView === 'ledger' ? "Search guest, mobile, invoice..." : "Search guest or mobile..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '5px 10px 5px 28px',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              width: 210,
              background: 'white'
            }}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ExportBtn onClick={handleExportCSV} />
        </div>
      </FilterBar>

      {/* Main Content View */}
      {subView === 'ledger' ? (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <SectionTitle>Wallet Transaction Audit Ledger</SectionTitle>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Chronological log tracking who gave extra money, change converted to digital store credit, and bill redemptions.
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {sortedTransactions.length} transaction{sortedTransactions.length === 1 ? '' : 's'}
            </span>
          </div>

          {sortedTransactions.length === 0 ? (
            <Empty text="No wallet transactions found for this period." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th currentField="createdAt" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Date &amp; Time</Th>
                  <Th>Type</Th>
                  <Th currentField="guestName" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Guest / Mobile</Th>
                  <Th>Invoice / Extra Cash Context</Th>
                  <Th right currentField="amount" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Amount</Th>
                  <Th right currentField="balanceAfter" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Balance After</Th>
                  <Th>Handled By</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map(t => {
                  const isIssue = t.type === 'issue';
                  const relatedOrder = (orders || []).find(o => o.id === t.orderId || o.billNo === t.billNo);

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <Td>{fmtDateTime(t.createdAt)}</Td>
                      <Td>
                        {isIssue ? (
                          <Badge label="+ Issued (Store Credit)" color="#10b981" />
                        ) : (
                          <Badge label="- Redeemed on Bill" color="#8b5cf6" />
                        )}
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.guestName || 'Guest'}</span>
                          {t.guestPhone && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <Phone size={11} /> {t.guestPhone}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            {t.billNo || (t.orderId ? t.orderId.slice(0, 8) : '—')}
                          </span>
                          {t.cashTendered > t.billTotal && (
                            <span style={{ fontSize: '0.72rem', color: '#059669', marginTop: 2 }}>
                              Cash Tendered: ₹{t.cashTendered} on ₹{t.billTotal} bill (+₹{t.amount} change saved)
                            </span>
                          )}
                          {t.notes && !t.cashTendered && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {t.notes}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td right bold style={{ color: isIssue ? '#10b981' : '#8b5cf6', fontSize: '0.88rem' }}>
                        {isIssue ? `+₹${parseFloat(t.amount || 0).toFixed(2)}` : `-₹${parseFloat(t.amount || 0).toFixed(2)}`}
                      </Td>
                      <Td right bold>
                        ₹{parseFloat(t.balanceAfter || 0).toFixed(2)}
                      </Td>
                      <Td muted>{t.staffName || 'Cashier'}</Td>
                      <Td>
                        {relatedOrder ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => setInvoiceHistoryOrder(relatedOrder)}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                            title="View Invoice History & Settlement Details"
                          >
                            <Eye size={12} /> Invoice
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <SectionTitle>Customer Wallet Balances Directory</SectionTitle>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Registered customers with phone-linked digital store credit and their current available balances.
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {customerList.length} customer{customerList.length === 1 ? '' : 's'}
            </span>
          </div>

          {customerList.length === 0 ? (
            <Empty text="No customer wallet balances found." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Guest Name</Th>
                  <Th>Mobile Number</Th>
                  <Th right>Wallet Balance</Th>
                  <Th right>Total Visits</Th>
                  <Th right>Total Spend</Th>
                  <Th>Last Visit</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {customerList.map(g => {
                  const bal = parseFloat(g.walletBalance || 0);
                  return (
                    <tr key={g.id || g.phone} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <Td bold>{g.name || 'Guest'}</Td>
                      <Td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                          <Phone size={12} /> {g.phone || '—'}
                        </span>
                      </Td>
                      <Td right bold>
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: 20,
                          fontSize: '0.8rem',
                          background: bal > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: bal > 0 ? '#059669' : 'var(--text-muted)',
                          fontWeight: 700
                        }}>
                          ₹{bal.toFixed(2)}
                        </span>
                      </Td>
                      <Td right>{g.totalVisits || 1}</Td>
                      <Td right>{fmt(g.totalSpend || 0)}</Td>
                      <Td muted>{fmtDateTime(g.lastVisit)}</Td>
                      <Td>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setSubView('ledger');
                            setSearchQuery(g.phone || g.name || '');
                          }}
                          style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <History size={12} /> View Ledger
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {/* Invoice History Modal if opened */}
      {invoiceHistoryOrder && (
        <InvoiceHistoryModal
          order={invoiceHistoryOrder}
          onClose={() => setInvoiceHistoryOrder(null)}
        />
      )}
    </div>
  );
};

// =================================================================
// MAIN REPORTS COMPONENT
// =================================================================

const TABS = [
  { id: 'dashboard',         label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'sales_invoicing',   label: 'Sales & Invoicing',    icon: TrendingUp },
  { id: 'tax_compliance',    label: 'Tax & Compliance',     icon: Receipt },
  { id: 'inventory_mgmt',    label: 'Inventory Mgmt',       icon: Boxes },
  { id: 'menu_mgmt',         label: 'Menu Management',      icon: Utensils },
  { id: 'table_analytics',   label: 'Table Analytics',      icon: TableProperties },
  { id: 'operational_eff',   label: 'Operational Efficiency', icon: Clock },
  { id: 'speed',             label: 'Speed of Service',     icon: Zap },
  { id: 'labor',             label: 'Labor & Staffing',     icon: Users },
  { id: 'attendance',        label: 'Attendance',           icon: CalendarCheck },
  { id: 'gift_cards',        label: 'Gift Cards & Wallet',  icon: Gift },
  { id: 'register_closure',  label: 'Register Closure',     icon: CreditCard },
];

const Reports = () => {
  const { orders, settings, inventory, staff, menu, kdsTickets, wasteLog, floorPlans, posTables, attendance, registerClosures, guests, giftCards } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  const activeTab = tabParam || 'dashboard';
  
  const setActiveTab = (newTab) => {
    setSearchParams({ tab: newTab });
  };

  return (
    <div className="animate-fade-up">
      {/* Page Header */}
      <div className="page-title-row" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Real-time business intelligence: Sales, Tax compliance, Inventory performance, Menu engineering &amp; Operational efficiency.
          </p>
        </div>
      </div>

      {/* Tab Nav — wraps on small screens so no tab is hidden/cut off */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 20, background: 'var(--card-bg)', padding: 5, borderRadius: 14, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
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
      {activeTab === 'dashboard'        && <DashboardTab orders={orders} inventory={inventory} staff={staff} floorPlans={floorPlans} posTables={posTables} />}
      {activeTab === 'sales_invoicing'  && <SalesInvoicingTab orders={orders} settings={settings} />}
      {activeTab === 'tax_compliance'   && <TaxComplianceTab orders={orders} settings={settings} />}
      {activeTab === 'inventory_mgmt'   && <InventoryMgmtTab inventory={inventory} wasteLog={wasteLog} orders={orders} menu={menu} />}
      {activeTab === 'menu_mgmt'        && <MenuManagementTab orders={orders} menu={menu} />}
      {activeTab === 'table_analytics'  && <TableAnalyticsTab orders={orders} floorPlans={floorPlans} posTables={posTables} kdsTickets={kdsTickets} staff={staff} />}
      {activeTab === 'operational_eff'  && <OperationalEfficiencyTab orders={orders} />}
      {activeTab === 'speed'            && <SpeedOfService orders={orders} kdsTickets={kdsTickets} menu={menu} />}
      {activeTab === 'labor'            && <LaborReport orders={orders} staff={staff} />}
      {activeTab === 'attendance'       && <AttendanceReportTab staff={staff} attendance={attendance} />}
      {activeTab === 'gift_cards'       && <GiftCardWalletReport giftCards={giftCards} guests={guests} orders={orders} />}
      {activeTab === 'register_closure' && <RegisterClosuresReport />}
    </div>
  );
};

export default Reports;
