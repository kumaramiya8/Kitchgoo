import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Download, BarChart2, Package,
  Users, Filter, Search, ShoppingBag, CreditCard, IndianRupee, 
  Clock, CheckCircle, AlertTriangle, XCircle, FileText, Zap, 
  Timer, Utensils, Boxes, Star, HelpCircle, Award, Target,
  Printer, X, Gauge, LayoutDashboard, Receipt
} from 'lucide-react';
import { useApp } from '../db/AppContext';

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
// TAB 1 -- OVERVIEW DASHBOARD
// =================================================================

const DashboardTab = ({ orders, inventory, staff, floorPlans }) => {
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
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

const DailySalesSummaryReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [terminalFilter, setTerminalFilter] = useState('All');
  const [shiftFilter, setShiftFilter]       = useState('All');

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
    const map = {};
    filtered.forEach(o => {
      const dateKey = (o.createdAt || '').split('T')[0];
      if (!map[dateKey]) {
        map[dateKey] = {
          date: dateKey,
          ordersCount: 0,
          gross: 0,
          discounts: 0,
          tax: 0,
          cash: 0,
          card: 0,
          upi: 0
        };
      }
      const day = map[dateKey];
      day.ordersCount += 1;
      
      const disc = parseFloat(o.discount || o.discountAmount || 0);
      day.discounts += disc;
      
      const totalAmount = parseFloat(o.total || 0);
      const taxAmount = parseFloat(o.tax || 0);
      day.tax += taxAmount;
      
      // Calculate gross sales (before discounts and taxes)
      day.gross += (totalAmount + disc - taxAmount);

      const pMethod = (o.paymentMethod || 'Cash').toLowerCase();
      if (pMethod.includes('cash')) day.cash += totalAmount;
      else if (pMethod.includes('card')) day.card += totalAmount;
      else day.upi += totalAmount; // UPI
    });

    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const totals = useMemo(() => {
    return dailyData.reduce((s, r) => ({
      ordersCount: s.ordersCount + r.ordersCount,
      gross: s.gross + r.gross,
      discounts: s.discounts + r.discounts,
      tax: s.tax + r.tax,
      cash: s.cash + r.cash,
      card: s.card + r.card,
      upi: s.upi + r.upi
    }), { ordersCount: 0, gross: 0, discounts: 0, tax: 0, cash: 0, card: 0, upi: 0 });
  }, [dailyData]);

  const handleExport = () => {
    const rows = [
      'Date,Total Orders,Gross Sales,Discounts Applied,Net Sales,Tax Collected,Cash Totals,Card Totals,UPI Totals',
      ...dailyData.map(r =>
        `"${r.date}",${r.ordersCount},${r.gross.toFixed(2)},${r.discounts.toFixed(2)},${(r.gross - r.discounts).toFixed(2)},${r.tax.toFixed(2)},${r.cash.toFixed(2)},${r.card.toFixed(2)},${r.upi.toFixed(2)}`
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
        <StatCard label="Gross Sales" value={fmt(totals.gross)} color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Discounts Applied" value={fmt(totals.discounts)} color="#ef4444" icon={TrendingDown} />
        <StatCard label="Net Sales" value={fmt(totals.gross - totals.discounts)} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Tax Collected" value={fmt(totals.tax)} color="#f59e0b" icon={Receipt} />
      </div>

      <div className="card">
        <SectionTitle>Daily Sales Summary</SectionTitle>
        {dailyData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th right>Total Orders</Th>
                <Th right>Gross Sales</Th>
                <Th right>Discounts Applied</Th>
                <Th right>Net Sales</Th>
                <Th right>Tax Collected</Th>
                <Th>Payment Method Breakdown</Th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map(r => (
                <tr key={r.date}>
                  <Td bold>{fmtDate(r.date)}</Td>
                  <Td right>{r.ordersCount}</Td>
                  <Td right>{fmt(r.gross)}</Td>
                  <Td right muted>{fmt(r.discounts)}</Td>
                  <Td right bold>{fmt(r.gross - r.discounts)}</Td>
                  <Td right>{fmt(r.tax)}</Td>
                  <Td style={{ fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Cash:</span> {fmt(r.cash)} | <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Card:</span> {fmt(r.card)} | <span style={{ color: 'var(--primary)', fontWeight: 600 }}>UPI:</span> {fmt(r.upi)}
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
                </TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

const DetailedInvoiceRegisterReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [cashierFilter, setCashierFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const filtered = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);
    if (statusFilter !== 'All') {
      arr = arr.filter(o => (o.status || 'Closed') === statusFilter);
    }
    if (cashierFilter !== 'All') {
      arr = arr.filter(o => o.serverName === cashierFilter || o.serverId === cashierFilter);
    }
    return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, range, dateFrom, dateTo, statusFilter, cashierFilter]);

  const cashiers = useMemo(() => ['All', ...new Set(orders.map(o => o.serverName).filter(Boolean))], [orders]);

  const handleExport = () => {
    const rows = [
      'Invoice Number,Timestamp,Order Type,Total Amount,Status,Handled By',
      ...filtered.map(o =>
        `"${o.billNo || o.id}","${fmtDateTime(o.createdAt)}","${o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')}",${(o.total || 0).toFixed(2)},"${o.status || 'Closed'}","${o.serverName || ''}"`
      ),
    ];
    downloadCSV('detailed_invoice_register.csv', rows);
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
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="All">All Statuses</option>
          <option value="Closed">Paid / Completed</option>
          <option value="Voided">Voided</option>
          <option value="Refunded">Refunded</option>
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cashier:</span>
        <Select value={cashierFilter} onChange={setCashierFilter}>
          {cashiers.map(c => <option key={c} value={c}>{c === 'All' ? 'All Cashiers' : c}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div className="card">
        <SectionTitle>Detailed Invoice Register ({filtered.length} Invoices)</SectionTitle>
        {filtered.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice Number</Th>
                <Th>Timestamp</Th>
                <Th>Order Type</Th>
                <Th right>Total Amount</Th>
                <Th>Status</Th>
                <Th>Handled By</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const status = o.status || 'Closed';
                const statusColor = status === 'Closed' || status === 'Completed' ? '#22c55e' : status === 'Refunded' ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOrder(o)}>
                    <Td bold>{o.billNo || o.id?.slice(0, 8)}</Td>
                    <Td>{fmtDateTime(o.createdAt)}</Td>
                    <Td><Badge label={o.orderType || (o.tableId ? 'Dine-in' : 'Takeout')} color="#7c3aed" /></Td>
                    <Td right bold>{fmt(o.total || 0)}</Td>
                    <Td><Badge label={status} color={statusColor} /></Td>
                    <Td muted>{o.serverName || '—'}</Td>
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

      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Invoice Details: ${selectedOrder?.billNo || selectedOrder?.id?.slice(0, 8) || ''}`} wide>
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

const SalesInvoicingTab = ({ orders }) => {
  const [subTab, setSubTab] = useState('daily');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${subTab === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('daily')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Daily Sales Summary
        </button>
        <button className={`btn ${subTab === 'register' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('register')} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Detailed Invoice Register
        </button>
      </div>

      {subTab === 'daily' ? <DailySalesSummaryReport orders={orders} /> : <DetailedInvoiceRegisterReport orders={orders} />}
    </div>
  );
};

// =================================================================
// TAB 3 -- TAX FILING & COMPLIANCE
// =================================================================

const TaxComplianceTab = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [taxTypeFilter, setTaxTypeFilter] = useState('All');

  const filtered = useMemo(() => filterByRange(orders, range, dateFrom, dateTo), [orders, range, dateFrom, dateTo]);

  const taxData = useMemo(() => {
    const slabs = {
      '5% Food Tax': { rate: 5, type: 'GST', name: '5% Food Tax' },
      '12% Beverage Tax': { rate: 12, type: 'GST', name: '12% Beverage Tax' },
      '18% Alcohol Tax': { rate: 18, type: 'VAT', name: '18% Alcohol Tax' },
      '5% Takeout GST': { rate: 5, type: 'GST', name: '5% Takeout GST' },
    };

    const aggregated = {};
    Object.keys(slabs).forEach(k => {
      aggregated[k] = { name: slabs[k].name, rate: slabs[k].rate, type: slabs[k].type, taxable: 0, collected: 0 };
    });

    filtered.forEach(o => {
      const isTakeout = !o.tableId || o.orderType === 'Takeout' || o.orderType === 'Delivery';
      (o.items || []).forEach(item => {
        const cat = (item.category || '').toLowerCase();
        const revenue = (item.price || 0) * (item.qty || 1);
        const isAlcohol = cat.includes('alcohol') || cat.includes('bar') || cat.includes('drink') || cat.includes('beer') || cat.includes('wine');
        const isBev = cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee') || cat.includes('tea');

        let slabKey;
        if (isAlcohol) slabKey = '18% Alcohol Tax';
        else if (isTakeout) slabKey = '5% Takeout GST';
        else if (isBev) slabKey = '12% Beverage Tax';
        else slabKey = '5% Food Tax';

        if (!item.taxExempt) {
          aggregated[slabKey].taxable += revenue;
          aggregated[slabKey].collected += revenue * (slabs[slabKey].rate / 100);
        }
      });
    });

    let result = Object.values(aggregated);
    if (taxTypeFilter !== 'All') {
      result = result.filter(r => r.type === taxTypeFilter);
    }
    return result;
  }, [filtered, taxTypeFilter]);

  const totals = useMemo(() => {
    return taxData.reduce((s, r) => ({
      taxable: s.taxable + r.taxable,
      collected: s.collected + r.collected
    }), { taxable: 0, collected: 0 });
  }, [taxData]);

  const handleExport = () => {
    const rows = [
      'Tax Name/Slab,Gross Taxable Amount,Tax Amount Collected,Total Invoice Value',
      ...taxData.map(r =>
        `"${r.name}",${r.taxable.toFixed(2)},${r.collected.toFixed(2)},${(r.taxable + r.collected).toFixed(2)}`
      ),
    ];
    downloadCSV('tax_liability_summary.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Tax Type:</span>
        <Select value={taxTypeFilter} onChange={setTaxTypeFilter}>
          <option value="All">All Taxes</option>
          <option value="GST">GST (Goods &amp; Services Tax)</option>
          <option value="VAT">VAT (Value Added Tax)</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Gross Taxable Amount" value={fmt(totals.taxable)} color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Tax Amount Collected" value={fmt(totals.collected)} color="#22c55e" icon={Receipt} />
        <StatCard label="Total Invoice Value" value={fmt(totals.taxable + totals.collected)} color="#f59e0b" icon={TrendingUp} />
      </div>

      <div className="card">
        <SectionTitle>Tax Liability Summary</SectionTitle>
        {taxData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tax Name / Slab</Th>
                <Th right>Gross Taxable Amount</Th>
                <Th right>Tax Amount Collected</Th>
                <Th right>Total Invoice Value</Th>
              </tr>
            </thead>
            <tbody>
              {taxData.map(t => (
                <tr key={t.name}>
                  <Td bold>{t.name}</Td>
                  <Td right>{fmt(t.taxable)}</Td>
                  <Td right bold style={{ color: 'var(--primary)' }}>{fmt(t.collected)}</Td>
                  <Td right bold>{fmt(t.taxable + t.collected)}</Td>
                </tr>
              ))}
              <tr>
                <TdSummary bold>TOTAL</TdSummary>
                <TdSummary right bold>{fmt(totals.taxable)}</TdSummary>
                <TdSummary right bold>{fmt(totals.collected)}</TdSummary>
                <TdSummary right bold>{fmt(totals.taxable + totals.collected)}</TdSummary>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

// =================================================================
// TAB 4 -- INVENTORY MANAGEMENT
// =================================================================

const StockStatusReorderReport = ({ inventory }) => {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

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

  const totals = useMemo(() => {
    const totalAssetVal = filtered.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
    const lowCount = filtered.filter(i => i.statusLabel === 'Low Stock').length;
    const outCount = filtered.filter(i => i.statusLabel === 'Out of Stock').length;
    return { totalAssetVal, lowCount, outCount };
  }, [filtered]);

  const handleExport = () => {
    const rows = [
      'Item Name,Unit of Measurement,Current Stock,Reorder Level,Unit Cost,Total Asset Value',
      ...filtered.map(i =>
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
        <StatCard label="Total Asset Value" value={fmt(totals.totalAssetVal)} color="#7c3aed" icon={Boxes} />
        <StatCard label="Low Stock Items" value={totals.lowCount} color="#f59e0b" icon={AlertTriangle} />
        <StatCard label="Out of Stock Items" value={totals.outCount} color="#ef4444" icon={XCircle} />
      </div>

      <div className="card">
        <SectionTitle>Stock Status &amp; Reorder Report</SectionTitle>
        {filtered.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item Name</Th>
                <Th>Unit of Measurement</Th>
                <Th right>Current Stock</Th>
                <Th right>Reorder Level (Par)</Th>
                <Th right>Unit Cost</Th>
                <Th right>Total Asset Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
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
  const [reasonFilter, setReasonFilter] = useState('All');

  const filtered = useMemo(() => {
    let arr = filterByRange(wasteLog || [], range, dateFrom, dateTo, 'createdAt');
    if (reasonFilter !== 'All') {
      arr = arr.filter(w => w.reason === reasonFilter);
    }
    return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [wasteLog, range, dateFrom, dateTo, reasonFilter]);

  const totalCost = useMemo(() => filtered.reduce((s, w) => s + (w.costImpact || 0), 0), [filtered]);

  const handleExport = () => {
    const rows = [
      'Date Logged,Item Name,Quantity,Reason,Cost Impact',
      ...filtered.map(w =>
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
        <StatCard label="Wastage Entries" value={filtered.length} color="#7c3aed" icon={Boxes} />
        <StatCard label="Total Cost Impact" value={fmt(totalCost)} color="#ef4444" icon={IndianRupee} />
        <StatCard label="Average Loss / Entry" value={filtered.length > 0 ? fmt(totalCost / filtered.length) : '₹0'} color="#f59e0b" icon={TrendingUp} />
      </div>

      <div className="card">
        <SectionTitle>Wastage and Variance Log</SectionTitle>
        {filtered.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Date Logged</Th>
                <Th>Item Name</Th>
                <Th right>Quantity</Th>
                <Th>Reason</Th>
                <Th right>Cost Impact</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w, idx) => (
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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
  const [categoryFilter, setCategoryFilter] = useState('All');

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

    return result.sort((a, b) => b.qtySold - a.qtySold);
  }, [filteredOrders, menu, categoryFilter]);

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
      ...performanceData.map(d =>
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
        <StatCard label="Quantity Sold" value={totals.qtySold} color="#7c3aed" icon={ShoppingBag} />
        <StatCard label="Total Revenue" value={fmt(totals.revenue)} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Cost of Goods Sold (COGS)" value={fmt(totals.cogs)} color="#ef4444" icon={TrendingDown} />
        <StatCard label="Gross Margin" value={fmtPct(avgMargin)} color="#f59e0b" icon={Target} />
      </div>

      <div className="card">
        <SectionTitle>Item Performance Analysis</SectionTitle>
        {performanceData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item Name</Th>
                <Th>Menu Category</Th>
                <Th right>Quantity Sold</Th>
                <Th right>Total Revenue</Th>
                <Th right>Cost of Goods Sold (COGS)</Th>
                <Th right>Gross Margin</Th>
              </tr>
            </thead>
            <tbody>
              {performanceData.map(d => (
                <tr key={d.id}>
                  <Td bold>{d.name}</Td>
                  <Td><Badge label={d.category} color="#7c3aed" /></Td>
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
  const [dayFilter, setDayFilter] = useState('All');

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
      ...hourlyData.map(h =>
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
                     : ratio > 0.2 ? 'rgba(124,58,237,0.6)' 
                     : ratio > 0 ? 'rgba(124,58,237,0.18)'  
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(124,58,237,0.18)' }} /> Low Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(124,58,237,0.6)' }} /> Medium Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.8)' }} /> High Traffic</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.85)' }} /> Peak Traffic</span>
        </div>
      </div>

      <div className="card">
        <SectionTitle>Hourly Traffic &amp; Sales Performance</SectionTitle>
        {hourlyData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Time Slot</Th>
                <Th right>Order Volume</Th>
                <Th right>Revenue Generated</Th>
                <Th right>Average Ticket Size</Th>
              </tr>
            </thead>
            <tbody>
              {hourlyData.map(h => {
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
      </div>
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

      <div className="card">
        <SectionTitle>Staff Hours &amp; Labor Costs ({laborData.length} active staff)</SectionTitle>
        {laborData.length === 0 ? <Empty text="No labor or attendance data logged for this period." /> : (
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
// MAIN REPORTS COMPONENT
// =================================================================

const TABS = [
  { id: 'dashboard',         label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'sales_invoicing',   label: 'Sales & Invoicing',    icon: TrendingUp },
  { id: 'tax_compliance',    label: 'Tax & Compliance',     icon: Receipt },
  { id: 'inventory_mgmt',    label: 'Inventory Mgmt',       icon: Boxes },
  { id: 'menu_mgmt',         label: 'Menu Management',      icon: Utensils },
  { id: 'operational_eff',   label: 'Operational Efficiency', icon: Clock },
  { id: 'speed',             label: 'Speed of Service',     icon: Zap },
  { id: 'labor',             label: 'Labor & Staffing',     icon: Users },
];

const Reports = () => {
  const { orders, inventory, staff, menu, kdsTickets, wasteLog, floorPlans } = useApp();
  const [activeTab, setActiveTab] = useState('dashboard');

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
      {activeTab === 'dashboard'        && <DashboardTab orders={orders} inventory={inventory} staff={staff} floorPlans={floorPlans} />}
      {activeTab === 'sales_invoicing'  && <SalesInvoicingTab orders={orders} />}
      {activeTab === 'tax_compliance'   && <TaxComplianceTab orders={orders} />}
      {activeTab === 'inventory_mgmt'   && <InventoryMgmtTab inventory={inventory} wasteLog={wasteLog} orders={orders} menu={menu} />}
      {activeTab === 'menu_mgmt'        && <MenuManagementTab orders={orders} menu={menu} />}
      {activeTab === 'operational_eff'  && <OperationalEfficiencyTab orders={orders} />}
      {activeTab === 'speed'            && <SpeedOfService orders={orders} kdsTickets={kdsTickets} />}
      {activeTab === 'labor'            && <LaborReport orders={orders} staff={staff} />}
    </div>
  );
};

export default Reports;
