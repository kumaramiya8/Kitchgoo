import React, { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Download, BarChart2, Package,
  Users, Grid, Filter, ChevronDown, Search, Calendar,
  ShoppingBag, CreditCard, IndianRupee, Clock, CheckCircle,
  AlertTriangle, XCircle, ArrowUpRight, Layers
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll } from '../db/database';

// ─── Helpers ────────────────────────────────────────────────

const fmt = (n) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const fmtNum = (n) => n.toLocaleString('en-IN');

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const RANGES = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom'];

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
      case 'This Year':  return d >= new Date(now.getFullYear(), 0, 1);
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

const Td = ({ children, right, bold, muted }) => (
  <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : 400, color: muted ? 'var(--text-muted)' : 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>{children}</td>
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

// ═══════════════════════════════════════════════════════════
// TAB 1 — SALES REPORT
// ═══════════════════════════════════════════════════════════

const SalesReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [payFilter, setPayFilter]   = useState('All');
  const [catFilter, setCatFilter]   = useState('All');
  const [search, setSearch]         = useState('');

  const filtered = useMemo(() => {
    let arr = filterByRange(orders, range, dateFrom, dateTo);
    if (payFilter !== 'All') arr = arr.filter(o => o.paymentMethod === payFilter);
    return arr;
  }, [orders, range, dateFrom, dateTo, payFilter]);

  const stats = useMemo(() => {
    const gross    = filtered.reduce((s, o) => s + (o.total || 0), 0);
    const tax      = filtered.reduce((s, o) => s + (o.tax || 0), 0);
    const sc       = filtered.reduce((s, o) => s + (o.serviceCharge || 0), 0);
    const net      = gross - tax - sc;
    const count    = filtered.length;
    const avg      = count > 0 ? gross / count : 0;
    return { gross, tax, sc, net, count, avg };
  }, [filtered]);

  // Category filter applied only to item-level
  const allCategories = useMemo(() => {
    const cats = new Set();
    orders.forEach(o => (o.items || []).forEach(i => i.category && cats.add(i.category)));
    return ['All', ...cats];
  }, [orders]);

  const topItems = useMemo(() => {
    const map = {};
    filtered.forEach(o => (o.items || []).forEach(i => {
      if (catFilter !== 'All' && i.category !== catFilter) return;
      const k = i.name;
      if (!map[k]) map[k] = { name: i.name, category: i.category || '—', qty: 0, revenue: 0 };
      map[k].qty     += i.qty || 1;
      map[k].revenue += (i.price || 0) * (i.qty || 1);
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, catFilter]);

  const catSales = useMemo(() => {
    const map = {};
    filtered.forEach(o => (o.items || []).forEach(i => {
      const c = i.category || 'Other';
      if (!map[c]) map[c] = { name: c, revenue: 0, qty: 0 };
      map[c].revenue += (i.price || 0) * (i.qty || 1);
      map[c].qty     += i.qty || 1;
    }));
    const arr = Object.values(map).sort((a, b) => b.revenue - a.revenue);
    const max = arr[0]?.revenue || 1;
    return arr.map((c, i) => ({ ...c, pct: Math.round((c.revenue / max) * 100), color: COLORS[i % COLORS.length] }));
  }, [filtered]);

  const paymentBreakdown = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const m = o.paymentMethod || 'Unknown';
      if (!map[m]) map[m] = { method: m, count: 0, total: 0 };
      map[m].count++;
      map[m].total += o.total || 0;
    });
    const arr = Object.values(map).sort((a, b) => b.total - a.total);
    const max = arr[0]?.total || 1;
    return arr.map((p, i) => ({ ...p, pct: Math.round((p.total / max) * 100), color: COLORS[i % COLORS.length] }));
  }, [filtered]);

  // Daily revenue for trend chart
  const dailyData = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const d = (o.createdAt || '').split('T')[0];
      if (d) { map[d] = (map[d] || 0) + (o.total || 0); }
    });
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    const max = Math.max(...sorted.map(([, v]) => v), 1);
    return sorted.map(([date, total]) => ({ date, total, pct: Math.round((total / max) * 100) }));
  }, [filtered]);

  const searchedOrders = useMemo(() => {
    const q = search.toLowerCase();
    return filtered.filter(o =>
      !q || (o.billNo || '').toLowerCase().includes(q) ||
      (o.paymentMethod || '').toLowerCase().includes(q) ||
      String(o.tableId || '').includes(q)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [filtered, search]);

  const handleExport = () => {
    const rows = [
      'Bill No,Date,Time,Table,Payment,Items,Subtotal,Tax,Service,Total',
      ...searchedOrders.map(o =>
        `"${o.billNo}","${fmtDate(o.createdAt)}","${fmtTime(o.createdAt)}","${o.tableId || ''}","${o.paymentMethod || ''}",${(o.items||[]).length},${(o.subtotal||0).toFixed(2)},${(o.tax||0).toFixed(2)},${(o.serviceCharge||0).toFixed(2)},${(o.total||0).toFixed(2)}`
      ),
    ];
    downloadCSV(`sales_${range.replace(/\s/g, '_').toLowerCase()}.csv`, rows);
  };

  return (
    <div>
      {/* Filters */}
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Payment:</span>
        <Select value={payFilter} onChange={setPayFilter}>
          {['All', 'Cash', 'UPI', 'Card', 'Wallet'].map(p => <option key={p}>{p}</option>)}
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category:</span>
        <Select value={catFilter} onChange={setCatFilter}>
          {allCategories.map(c => <option key={c}>{c}</option>)}
        </Select>
        <div style={{ marginLeft: 'auto' }}>
          <ExportBtn onClick={handleExport} />
        </div>
      </FilterBar>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Gross Revenue"   value={fmt(stats.gross)} sub={`${fmtNum(stats.count)} orders`}    color="#7c3aed" icon={IndianRupee} />
        <StatCard label="Net Revenue"     value={fmt(stats.net)}   sub={`${stats.gross > 0 ? Math.round((stats.net/stats.gross)*100) : 0}% of gross`} color="#22c55e" icon={TrendingUp} />
        <StatCard label="Total Orders"    value={fmtNum(stats.count)} sub={range}                          color="#0ea5e9" icon={ShoppingBag} />
        <StatCard label="Avg Order Value" value={stats.avg > 0 ? `₹${Math.round(stats.avg).toLocaleString('en-IN')}` : '—'} color="#f59e0b" icon={ArrowUpRight} />
        <StatCard label="Tax Collected"   value={fmt(stats.tax + stats.sc)} sub={`GST + service`}          color="#ec4899" icon={CreditCard} />
      </div>

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Revenue by Category */}
        <div className="card">
          <SectionTitle>Revenue by Category</SectionTitle>
          {catSales.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {catSales.map(cat => (
                <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 100, flexShrink: 0 }}>{cat.name}</span>
                  <Bar pct={cat.pct} color={cat.color} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-primary)', width: 68, textAlign: 'right', flexShrink: 0 }}>{fmt(cat.revenue)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 50, textAlign: 'right', flexShrink: 0 }}>{cat.qty} sold</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Breakdown */}
        <div className="card">
          <SectionTitle>Payment Method Breakdown</SectionTitle>
          {paymentBreakdown.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {paymentBreakdown.map(p => (
                <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 70, flexShrink: 0 }}>{p.method}</span>
                  <Bar pct={p.pct} color={p.color} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-primary)', width: 68, textAlign: 'right', flexShrink: 0 }}>{fmt(p.total)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 50, textAlign: 'right', flexShrink: 0 }}>{p.count} orders</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Daily Revenue Trend */}
      {dailyData.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SectionTitle>Daily Revenue Trend</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '0 4px' }}>
            {dailyData.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <div title={`${d.date}: ${fmt(d.total)}`}
                  style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'rgba(124,58,237,0.7)', height: `${Math.max(d.pct * 0.72, 4)}px`, transition: 'height 0.4s' }} />
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap', transformOrigin: 'top left' }}>
                  {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Items Table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle>Top Selling Items</SectionTitle>
          {catFilter !== 'All' && <Badge label={catFilter} color="#7c3aed" />}
        </div>
        {topItems.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr><Th>#</Th><Th>Item</Th><Th>Category</Th><Th right>Qty Sold</Th><Th right>Revenue</Th><Th right>Avg Price</Th></tr>
            </thead>
            <tbody>
              {topItems.slice(0, 10).map((item, i) => (
                <tr key={item.name}>
                  <Td muted>{i + 1}</Td>
                  <Td bold>{item.name}</Td>
                  <Td muted>{item.category}</Td>
                  <Td right>{item.qty}</Td>
                  <Td right bold>{fmt(item.revenue)}</Td>
                  <Td right muted>₹{Math.round(item.revenue / item.qty).toLocaleString('en-IN')}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle>All Transactions ({searchedOrders.length})</SectionTitle>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input placeholder="Search bill, table, payment..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, paddingRight: 10, padding: '6px 10px 6px 28px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.78rem', width: 230, background: 'rgba(248,250,252,0.8)', outline: 'none', color: 'var(--text-primary)' }} />
          </div>
        </div>
        {searchedOrders.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr><Th>Bill No</Th><Th>Date</Th><Th>Time</Th><Th>Table</Th><Th>Items</Th><Th>Payment</Th><Th right>Subtotal</Th><Th right>Tax</Th><Th right>Total</Th></tr>
            </thead>
            <tbody>
              {searchedOrders.slice(0, 50).map(o => (
                <tr key={o.id}>
                  <Td bold>{o.billNo}</Td>
                  <Td>{fmtDate(o.createdAt)}</Td>
                  <Td muted>{fmtTime(o.createdAt)}</Td>
                  <Td muted>{o.tableId ? `T-${o.tableId}` : '—'}</Td>
                  <Td muted>{(o.items || []).length}</Td>
                  <Td><Badge label={o.paymentMethod || '—'} color="#7c3aed" /></Td>
                  <Td right>₹{(o.subtotal || 0).toFixed(2)}</Td>
                  <Td right muted>₹{((o.tax || 0) + (o.serviceCharge || 0)).toFixed(2)}</Td>
                  <Td right bold>₹{(o.total || 0).toFixed(2)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// TAB 2 — INVENTORY AUDIT
// ═══════════════════════════════════════════════════════════

const InventoryReport = ({ inventory }) => {
  const [statusFilter, setStatusFilter] = useState('All');
  const [catFilter, setCatFilter]       = useState('All');
  const [search, setSearch]             = useState('');

  const categories = useMemo(() => ['All', ...new Set(inventory.map(i => i.category).filter(Boolean))], [inventory]);

  const filtered = useMemo(() => {
    let arr = inventory;
    if (statusFilter !== 'All') arr = arr.filter(i => i.status === statusFilter);
    if (catFilter !== 'All')    arr = arr.filter(i => i.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(i => i.name.toLowerCase().includes(q) || (i.supplier || '').toLowerCase().includes(q));
    }
    return arr.sort((a, b) => {
      const order = { critical: 0, low: 1, good: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });
  }, [inventory, statusFilter, catFilter, search]);

  const summary = useMemo(() => {
    const totalValue = inventory.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
    const critical   = inventory.filter(i => i.status === 'critical').length;
    const low        = inventory.filter(i => i.status === 'low').length;
    const good       = inventory.filter(i => i.status === 'good').length;
    return { totalValue, critical, low, good };
  }, [inventory]);

  const catBreakdown = useMemo(() => {
    const map = {};
    inventory.forEach(i => {
      const c = i.category || 'Other';
      if (!map[c]) map[c] = { name: c, value: 0, items: 0 };
      map[c].value += (i.stock || 0) * (i.cost || 0);
      map[c].items++;
    });
    const arr = Object.values(map).sort((a, b) => b.value - a.value);
    const max = arr[0]?.value || 1;
    return arr.map((c, i) => ({ ...c, pct: Math.round((c.value / max) * 100), color: COLORS[i % COLORS.length] }));
  }, [inventory]);

  const handleExport = () => {
    const rows = [
      'Item,Category,Stock,Unit,Min Level,Status,Cost/Unit,Stock Value,Supplier,Last Updated',
      ...filtered.map(i =>
        `"${i.name}","${i.category || ''}",${i.stock || 0},"${i.unit || ''}",${i.min || 0},"${i.status || ''}",${i.cost || 0},${((i.stock || 0) * (i.cost || 0)).toFixed(2)},"${i.supplier || ''}","${fmtDate(i.lastUpdated)}"`
      ),
    ];
    downloadCSV('inventory_audit.csv', rows);
  };

  const statusColor = { good: '#22c55e', low: '#f59e0b', critical: '#ef4444' };
  const statusIcon  = { good: CheckCircle, low: AlertTriangle, critical: XCircle };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          {['All', 'good', 'low', 'critical'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category:</span>
        <Select value={catFilter} onChange={setCatFilter}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </Select>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 26, paddingRight: 8, padding: '5px 8px 5px 24px', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.78rem', width: 160, outline: 'none', background: 'white', color: 'var(--text-primary)' }} />
        </div>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Stock Value" value={fmt(summary.totalValue)} color="#7c3aed" icon={Layers} />
        <StatCard label="Good Stock"     value={summary.good}     sub="items in range"    color="#22c55e" icon={CheckCircle} />
        <StatCard label="Low Stock"      value={summary.low}      sub="need reordering"   color="#f59e0b" icon={AlertTriangle} />
        <StatCard label="Critical / OOS" value={summary.critical} sub="immediate action"  color="#ef4444" icon={XCircle} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Category value breakdown */}
        <div className="card">
          <SectionTitle>Stock Value by Category</SectionTitle>
          {catBreakdown.length === 0 ? <Empty text="No inventory data." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {catBreakdown.map(cat => (
                <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{cat.name}</span>
                  <Bar pct={cat.pct} color={cat.color} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-primary)', width: 68, textAlign: 'right', flexShrink: 0 }}>{fmt(cat.value)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 48, textAlign: 'right', flexShrink: 0 }}>{cat.items} items</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Overview */}
        <div className="card">
          <SectionTitle>Status Overview</SectionTitle>
          {(['good', 'low', 'critical']).map(s => {
            const Icon = statusIcon[s];
            const items = inventory.filter(i => i.status === s);
            const pct = inventory.length > 0 ? Math.round((items.length / inventory.length) * 100) : 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <Icon size={18} color={statusColor[s]} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>{s}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{items.length} items ({pct}%)</span>
                  </div>
                  <Bar pct={pct} color={statusColor[s]} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Inventory Table */}
      <div className="card">
        <SectionTitle>Inventory Audit Table ({filtered.length} items)</SectionTitle>
        {filtered.length === 0 ? <Empty text="No items match the filters." /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th><Th>Category</Th><Th right>Stock</Th><Th>Unit</Th>
                <Th right>Min Level</Th><Th>Status</Th><Th right>Cost/Unit</Th>
                <Th right>Stock Value</Th><Th>Supplier</Th><Th>Last Updated</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const Icon = statusIcon[item.status] || CheckCircle;
                const col  = statusColor[item.status] || '#22c55e';
                return (
                  <tr key={item.id}>
                    <Td bold>{item.name}</Td>
                    <Td muted>{item.category || '—'}</Td>
                    <Td right bold>{item.stock ?? '—'}</Td>
                    <Td muted>{item.unit || '—'}</Td>
                    <Td right muted>{item.min ?? '—'}</Td>
                    <Td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: col, fontSize: '0.78rem', fontWeight: 600 }}>
                        <Icon size={13} /> {(item.status || 'good').charAt(0).toUpperCase() + (item.status || 'good').slice(1)}
                      </span>
                    </Td>
                    <Td right>₹{(item.cost || 0).toLocaleString('en-IN')}</Td>
                    <Td right bold>{fmt((item.stock || 0) * (item.cost || 0))}</Td>
                    <Td muted>{item.supplier || '—'}</Td>
                    <Td muted>{fmtDate(item.lastUpdated)}</Td>
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

// ═══════════════════════════════════════════════════════════
// TAB 3 — STAFF REPORT
// ═══════════════════════════════════════════════════════════

const StaffReport = ({ staff }) => {
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const attendance = useMemo(() => getAll('attendance'), []);

  const roles   = useMemo(() => ['All', ...new Set(staff.map(s => s.role).filter(Boolean))], [staff]);

  const filteredStaff = useMemo(() => {
    let arr = staff;
    if (roleFilter !== 'All')   arr = arr.filter(s => s.role === roleFilter);
    if (statusFilter !== 'All') arr = arr.filter(s => s.status === statusFilter);
    return arr;
  }, [staff, roleFilter, statusFilter]);

  const filteredAttendance = useMemo(() =>
    filterByRange(attendance, range, dateFrom, dateTo, 'timestamp')
  , [attendance, range, dateFrom, dateTo]);

  // Compute hours per staff from attendance
  const hoursMap = useMemo(() => {
    const staffAtt = {};
    const sorted = [...filteredAttendance].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    sorted.forEach(rec => {
      if (!staffAtt[rec.staffId]) staffAtt[rec.staffId] = { ins: [], outs: [], records: [] };
      staffAtt[rec.staffId].records.push(rec);
      if (rec.type === 'IN')  staffAtt[rec.staffId].ins.push(new Date(rec.timestamp));
      if (rec.type === 'OUT') staffAtt[rec.staffId].outs.push(new Date(rec.timestamp));
    });
    const result = {};
    Object.entries(staffAtt).forEach(([id, { ins, outs }]) => {
      let total = 0;
      const pairs = Math.min(ins.length, outs.length);
      for (let i = 0; i < pairs; i++) {
        const diff = outs[i] - ins[i];
        if (diff > 0) total += diff;
      }
      result[id] = { hours: Math.round(total / 3600000 * 10) / 10, sessions: pairs };
    });
    return result;
  }, [filteredAttendance]);

  const roleBreakdown = useMemo(() => {
    const map = {};
    staff.forEach(s => {
      const r = s.role || 'Unknown';
      if (!map[r]) map[r] = { role: r, count: 0, active: 0, salary: 0 };
      map[r].count++;
      if (s.status === 'active') map[r].active++;
      map[r].salary += s.salary || 0;
    });
    const arr = Object.values(map).sort((a, b) => b.count - a.count);
    const max = arr[0]?.count || 1;
    return arr.map((r, i) => ({ ...r, pct: Math.round((r.count / max) * 100), color: COLORS[i % COLORS.length] }));
  }, [staff]);

  const totalSalaryBill = useMemo(() => filteredStaff.reduce((s, m) => s + (m.salary || 0), 0), [filteredStaff]);

  const recentLogs = useMemo(() =>
    [...filteredAttendance]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50)
  , [filteredAttendance]);

  const handleExport = () => {
    const rows = [
      'Name,Role,Status,Shift,Salary,Hours (period),Sessions (period)',
      ...filteredStaff.map(s => {
        const h = hoursMap[s.id];
        return `"${s.name}","${s.role || ''}","${s.status || ''}","${s.shift || ''}",${s.salary || 0},${h?.hours || 0},${h?.sessions || 0}`;
      }),
    ];
    downloadCSV('staff_report.csv', rows);
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Role:</span>
        <Select value={roleFilter} onChange={setRoleFilter}>
          {roles.map(r => <option key={r}>{r}</option>)}
        </Select>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option>All</option><option value="active">Active</option><option value="off-duty">Off Duty</option>
        </Select>
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Attendance period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Staff"   value={filteredStaff.length}                       color="#7c3aed" icon={Users} />
        <StatCard label="Active Now"    value={filteredStaff.filter(s => s.status === 'active').length} sub="on duty" color="#22c55e" icon={CheckCircle} />
        <StatCard label="Monthly Salary Bill" value={fmt(totalSalaryBill)} color="#f59e0b" icon={IndianRupee} />
        <StatCard label="Attendance Logs" value={fmtNum(filteredAttendance.length)} sub={range} color="#0ea5e9" icon={Clock} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Role Breakdown */}
        <div className="card">
          <SectionTitle>Staff by Role</SectionTitle>
          {roleBreakdown.length === 0 ? <Empty text="No staff data." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {roleBreakdown.map(r => (
                <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>{r.role}</span>
                  <Bar pct={r.pct} color={r.color} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0 }}>{r.count}</span>
                  <span style={{ fontSize: '0.68rem', color: '#22c55e', width: 56, textAlign: 'right', flexShrink: 0 }}>{r.active} active</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shift Distribution */}
        <div className="card">
          <SectionTitle>Shift Distribution</SectionTitle>
          {(() => {
            const shiftMap = {};
            filteredStaff.forEach(s => {
              const sh = s.shift || 'Unassigned';
              shiftMap[sh] = (shiftMap[sh] || 0) + 1;
            });
            const shifts = Object.entries(shiftMap).sort(([, a], [, b]) => b - a);
            const max = shifts[0]?.[1] || 1;
            return shifts.length === 0 ? <Empty text="No staff data." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {shifts.map(([shift, count], i) => (
                  <div key={shift} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{shift}</span>
                    <Bar pct={Math.round((count / max) * 100)} color={COLORS[i % COLORS.length]} />
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Staff Directory Table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle>Staff Directory ({filteredStaff.length})</SectionTitle>
        {filteredStaff.length === 0 ? <Empty text="No staff match the filters." /> : (
          <TableWrap>
            <thead>
              <tr><Th>Name</Th><Th>Role</Th><Th>Shift</Th><Th>Status</Th><Th>Phone</Th><Th>Join Date</Th><Th right>Salary</Th><Th right>Hours (period)</Th><Th right>Sessions</Th></tr>
            </thead>
            <tbody>
              {filteredStaff.map(s => {
                const h = hoursMap[s.id];
                return (
                  <tr key={s.id}>
                    <Td bold>{s.name}</Td>
                    <Td><Badge label={s.role || '—'} color="#7c3aed" /></Td>
                    <Td muted>{s.shift || '—'}</Td>
                    <Td>
                      <Badge label={s.status === 'active' ? 'Active' : 'Off Duty'}
                        color={s.status === 'active' ? '#22c55e' : '#94a3b8'} />
                    </Td>
                    <Td muted>{s.phone || '—'}</Td>
                    <Td muted>{s.joinDate || '—'}</Td>
                    <Td right>₹{(s.salary || 0).toLocaleString('en-IN')}</Td>
                    <Td right bold>{h?.hours ?? 0}h</Td>
                    <Td right muted>{h?.sessions ?? 0}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </div>

      {/* Attendance Log */}
      <div className="card">
        <SectionTitle>Attendance Log ({recentLogs.length})</SectionTitle>
        {recentLogs.length === 0 ? <Empty text="No attendance records for this period." /> : (
          <TableWrap>
            <thead>
              <tr><Th>Staff</Th><Th>Role</Th><Th>Type</Th><Th>Date</Th><Th>Time</Th></tr>
            </thead>
            <tbody>
              {recentLogs.map(log => {
                const member = staff.find(s => s.id === log.staffId);
                return (
                  <tr key={log.id}>
                    <Td bold>{member?.name || 'Unknown'}</Td>
                    <Td muted>{member?.role || '—'}</Td>
                    <Td>
                      <Badge label={log.type} color={log.type === 'IN' ? '#22c55e' : '#ef4444'} />
                    </Td>
                    <Td>{fmtDate(log.timestamp)}</Td>
                    <Td muted>{fmtTime(log.timestamp)}</Td>
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

// ═══════════════════════════════════════════════════════════
// TAB 4 — TABLE OCCUPANCY
// ═══════════════════════════════════════════════════════════

const TableReport = ({ orders }) => {
  const [range, setRange]       = useState('This Month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [sortBy, setSortBy]     = useState('revenue');

  const filtered = useMemo(() =>
    filterByRange(orders, range, dateFrom, dateTo)
  , [orders, range, dateFrom, dateTo]);

  const tableData = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      const t = o.tableId ? `T-${o.tableId}` : 'Takeaway';
      if (!map[t]) map[t] = { table: t, orders: 0, revenue: 0, avgOrder: 0 };
      map[t].orders++;
      map[t].revenue += o.total || 0;
    });
    return Object.values(map)
      .map(t => ({ ...t, avgOrder: t.orders > 0 ? t.revenue / t.orders : 0 }))
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [filtered, sortBy]);

  // Peak hours analysis
  const hourData = useMemo(() => {
    const map = {};
    for (let i = 0; i < 24; i++) map[i] = { hour: i, orders: 0, revenue: 0 };
    filtered.forEach(o => {
      if (o.createdAt) {
        const h = new Date(o.createdAt).getHours();
        map[h].orders++;
        map[h].revenue += o.total || 0;
      }
    });
    const arr = Object.values(map).filter(h => h.orders > 0);
    const max = Math.max(...arr.map(h => h.orders), 1);
    return Object.values(map).map(h => ({ ...h, pct: Math.round((h.orders / max) * 100) }));
  }, [filtered]);

  const peakHour = useMemo(() => {
    return hourData.reduce((best, h) => h.orders > (best?.orders || 0) ? h : best, null);
  }, [hourData]);

  const maxRevTable = tableData[0]?.revenue || 0;

  const handleExport = () => {
    const rows = [
      'Table,Orders,Total Revenue,Avg Order Value',
      ...tableData.map(t => `"${t.table}",${t.orders},${t.revenue.toFixed(2)},${t.avgOrder.toFixed(2)}`),
    ];
    downloadCSV(`table_occupancy_${range.replace(/\s/g, '_').toLowerCase()}.csv`, rows);
  };

  const formatHour = (h) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}${ampm}`;
  };

  return (
    <div>
      <FilterBar>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sort by:</span>
        <Select value={sortBy} onChange={setSortBy}>
          <option value="revenue">Revenue</option>
          <option value="orders">Orders</option>
          <option value="avgOrder">Avg Order</option>
        </Select>
        <div style={{ marginLeft: 'auto' }}><ExportBtn onClick={handleExport} /></div>
      </FilterBar>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Tables Used"   value={tableData.length}                           color="#7c3aed" icon={Grid} />
        <StatCard label="Total Orders"  value={fmtNum(filtered.length)} sub={range}        color="#0ea5e9" icon={ShoppingBag} />
        <StatCard label="Total Revenue" value={fmt(filtered.reduce((s, o) => s + (o.total || 0), 0))} color="#22c55e" icon={IndianRupee} />
        <StatCard label="Peak Hour"     value={peakHour ? formatHour(peakHour.hour) : '—'} sub={peakHour ? `${peakHour.orders} orders` : ''} color="#f59e0b" icon={Clock} />
      </div>

      {/* Table Revenue Chart + Hourly Heatmap */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <SectionTitle>Revenue by Table</SectionTitle>
          {tableData.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tableData.slice(0, 10).map(t => (
                <div key={t.table} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 68, flexShrink: 0 }}>{t.table}</span>
                  <Bar pct={maxRevTable > 0 ? Math.round((t.revenue / maxRevTable) * 100) : 0} color="#7c3aed" />
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, width: 68, textAlign: 'right', flexShrink: 0 }}>{fmt(t.revenue)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 48, textAlign: 'right', flexShrink: 0 }}>{t.orders} orders</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly Heatmap */}
        <div className="card">
          <SectionTitle>Peak Hours (Orders by Hour)</SectionTitle>
          {filtered.length === 0 ? <Empty /> : (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                {hourData.map(h => (
                  <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                    <div title={`${formatHour(h.hour)}: ${h.orders} orders`}
                      style={{
                        width: '100%', borderRadius: '3px 3px 0 0', transition: 'height 0.4s',
                        height: `${Math.max(h.pct * 0.72, h.orders > 0 ? 4 : 0)}px`,
                        background: h.pct >= 80 ? '#ef4444' : h.pct >= 50 ? '#f59e0b' : '#7c3aed',
                        opacity: h.orders === 0 ? 0.1 : 1,
                      }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                {[0, 6, 12, 18, 23].map(h => (
                  <span key={h} style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatHour(h)}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>🟣 Normal</span><span>🟡 Busy</span><span>🔴 Peak</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table Stats Table */}
      <div className="card">
        <SectionTitle>Per-Table Statistics</SectionTitle>
        {tableData.length === 0 ? <Empty /> : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Table</Th>
                <Th right>Orders</Th>
                <Th right>Total Revenue</Th>
                <Th right>Avg Order Value</Th>
                <Th right>Revenue Share</Th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((t, i) => {
                const totalRev = filtered.reduce((s, o) => s + (o.total || 0), 0);
                const share = totalRev > 0 ? Math.round((t.revenue / totalRev) * 100) : 0;
                return (
                  <tr key={t.table}>
                    <Td bold>{t.table}</Td>
                    <Td right>{t.orders}</Td>
                    <Td right bold>{fmt(t.revenue)}</Td>
                    <Td right>₹{Math.round(t.avgOrder).toLocaleString('en-IN')}</Td>
                    <Td right>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(226,232,240,0.6)', overflow: 'hidden' }}>
                          <div style={{ width: `${share}%`, height: '100%', borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: 32 }}>{share}%</span>
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

// ═══════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════════════

const TABS = [
  { id: 'sales',     label: 'Sales Report',      icon: TrendingUp  },
  { id: 'inventory', label: 'Inventory Audit',   icon: Package     },
  { id: 'staff',     label: 'Staff Report',      icon: Users       },
  { id: 'tables',    label: 'Table Occupancy',   icon: Grid        },
];

const Reports = () => {
  const { orders, inventory, staff } = useApp();
  const [activeTab, setActiveTab] = useState('sales');

  const tab = TABS.find(t => t.id === activeTab);

  return (
    <div className="animate-fade-up">
      {/* Page Header */}
      <div className="page-title-row" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Full business intelligence — sales, inventory, staff &amp; table occupancy
          </p>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.55)', padding: 5, borderRadius: 14, border: '1px solid var(--border)', width: 'fit-content' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10,
                border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 700 : 500,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'sales'     && <SalesReport     orders={orders} />}
      {activeTab === 'inventory' && <InventoryReport inventory={inventory} />}
      {activeTab === 'staff'     && <StaffReport     staff={staff} />}
      {activeTab === 'tables'    && <TableReport     orders={orders} />}
    </div>
  );
};

export default Reports;
