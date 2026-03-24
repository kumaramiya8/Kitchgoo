import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Download } from 'lucide-react';
import { useApp } from '../db/AppContext';

const RANGES = ['Today', 'This Week', 'This Month', 'Year'];

const CATEGORY_COLORS = ['#7c3aed', '#a855f7', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899'];

const filterByRange = (orders, range) => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  switch (range) {
    case 'Today':
      return orders.filter(o => o.createdAt && o.createdAt.startsWith(todayStr));
    case 'This Week': {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return orders.filter(o => o.createdAt && new Date(o.createdAt) >= weekAgo);
    }
    case 'This Month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return orders.filter(o => o.createdAt && new Date(o.createdAt) >= monthStart);
    }
    case 'Year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return orders.filter(o => o.createdAt && new Date(o.createdAt) >= yearStart);
    }
    default:
      return orders;
  }
};

const fmt = (n) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString()}`;
};

const Reports = () => {
  const { orders } = useApp();
  const [timeRange, setTimeRange] = useState('Today');

  const filteredOrders = useMemo(() => filterByRange(orders, timeRange), [orders, timeRange]);

  const stats = useMemo(() => {
    const gross = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
    const taxTotal = filteredOrders.reduce((s, o) => s + (o.tax || 0) + (o.serviceCharge || 0), 0);
    const net = gross - taxTotal;
    const count = filteredOrders.length;
    const avg = count > 0 ? gross / count : 0;
    return { gross, net, count, avg };
  }, [filteredOrders]);

  const topItems = useMemo(() => {
    const itemMap = {};
    filteredOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.name;
        if (!itemMap[key]) itemMap[key] = { name: item.name, category: item.category || '—', qty: 0, revenue: 0 };
        itemMap[key].qty += item.qty || 1;
        itemMap[key].revenue += (item.price || 0) * (item.qty || 1);
      });
    });
    return Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredOrders]);

  const categorySales = useMemo(() => {
    const catMap = {};
    filteredOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const cat = item.category || 'Other';
        if (!catMap[cat]) catMap[cat] = { name: cat, revenue: 0 };
        catMap[cat].revenue += (item.price || 0) * (item.qty || 1);
      });
    });
    const cats = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);
    const maxRev = cats[0]?.revenue || 1;
    return cats.map((c, i) => ({ ...c, pct: Math.round((c.revenue / maxRev) * 100), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [filteredOrders]);

  const handleExport = () => {
    const rows = [
      'Metric,Value',
      `Gross Sales,${stats.gross}`,
      `Net (after tax),${stats.net}`,
      `Total Orders,${stats.count}`,
      `Avg Order Value,${Math.round(stats.avg)}`,
      '',
      'Item,Category,Qty Sold,Revenue',
      ...topItems.map(i => `${i.name},${i.category},${i.qty},${i.revenue}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${timeRange.replace(/\s/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Analytics & Reports</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.55)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            {RANGES.map(r => (
              <button key={r} onClick={() => setTimeRange(r)}
                className={timeRange === r ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">Gross Sales</div>
          <div className="stat-value" style={{ fontSize: '1.7rem' }}>{fmt(stats.gross)}</div>
          {stats.gross > 0
            ? <div className="stat-change up"><TrendingUp size={13} /> {stats.count} orders</div>
            : <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No data for this period</div>
          }
        </div>
        <div className="stat-card">
          <div className="stat-label">Net (After Tax)</div>
          <div className="stat-value" style={{ fontSize: '1.7rem' }}>{fmt(stats.net)}</div>
          {stats.gross > 0 && (
            <div className="stat-change up"><TrendingUp size={13} /> {Math.round((stats.net / stats.gross) * 100)}% margin</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Orders</div>
          <div className="stat-value" style={{ fontSize: '1.7rem' }}>{stats.count.toLocaleString()}</div>
          {stats.count > 0
            ? <div className="stat-change up"><TrendingUp size={13} /> {timeRange}</div>
            : <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No orders in this period</div>
          }
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Order Value</div>
          <div className="stat-value" style={{ fontSize: '1.7rem' }}>{stats.avg > 0 ? `₹${Math.round(stats.avg)}` : '—'}</div>
          {stats.avg > 0 && <div className="stat-change up"><TrendingUp size={13} /> per order</div>}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid-2">
        {/* Sales by Category */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Sales by Category</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeRange}</span>
          </div>
          {categorySales.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
              No sales data for this period.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categorySales.map(cat => (
                <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', width: '90px', flexShrink: 0 }}>{cat.name}</span>
                  <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(226,232,240,0.5)' }}>
                    <div style={{ width: `${cat.pct}%`, height: '100%', borderRadius: '4px', background: cat.color, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', width: '64px', textAlign: 'right', flexShrink: 0 }}>
                    {fmt(cat.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Selling Items */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Top Selling Items</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{timeRange}</span>
          </div>
          {topItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
              No sales data for this period.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topItems.map((item, idx) => (
                <div key={item.name} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.4)', border: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(124,58,237,0.1)', color: 'var(--primary)',
                    fontSize: '0.8rem', fontWeight: 800,
                  }}>{idx + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.category} · {item.qty} sold</div>
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                    {fmt(item.revenue)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
