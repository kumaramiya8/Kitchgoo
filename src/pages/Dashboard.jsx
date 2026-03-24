import React, { useMemo } from 'react';
import {
  CheckCircle, Clock, CreditCard, ShoppingBag,
  ChevronRight, ArrowUpRight, TrendingUp
} from 'lucide-react';
import { useApp } from '../db/AppContext';

const StatCard = ({ label, value, subLabel, icon: Icon, changeValue, changeUp }) => (
  <div className="stat-card animate-fade-up">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {subLabel && (
      <div className="stat-sub" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', fontSize: '0.78rem' }}>
        {subLabel}
      </div>
    )}
    {changeValue && (
      <div className={`stat-change ${changeUp ? 'up' : 'down'}`}>
        {changeUp ? <ArrowUpRight size={13} /> : null}
        {changeValue}
      </div>
    )}
    {Icon && (
      <div className="stat-icon">
        <Icon size={40} strokeWidth={1} />
      </div>
    )}
  </div>
);

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString();
};

const fmt = (n) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${n.toLocaleString()}`;
};

const Dashboard = () => {
  const { todayStats, orders, deliveryOrders, inventory } = useApp();

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [orders]);

  const topItems = useMemo(() => {
    const itemMap = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.name;
        if (!itemMap[key]) itemMap[key] = { name: item.name, orders: 0, revenue: 0 };
        itemMap[key].orders += item.qty || 1;
        itemMap[key].revenue += (item.price || 0) * (item.qty || 1);
      });
    });
    return Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);
  }, [orders]);

  const activeDeliveries = deliveryOrders.filter(o => o.status !== 'delivered').length;
  const lowStockCount = inventory.filter(i => i.status !== 'good').length;

  // Weekly revenue bars: last 7 days
  const weekBars = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const result = [];
    let maxRev = 1;
    const dayRevenues = {};
    for (let d = 6; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const rev = orders
        .filter(o => o.createdAt && o.createdAt.startsWith(dateStr))
        .reduce((s, o) => s + (o.total || 0), 0);
      dayRevenues[dateStr] = { day: days[date.getDay()], rev };
      if (rev > maxRev) maxRev = rev;
    }
    Object.values(dayRevenues).forEach(d => {
      result.push({ ...d, pct: Math.round((d.rev / maxRev) * 100) });
    });
    return result;
  }, [orders]);

  return (
    <div>
      <div className="page-title-row">
        <h1 className="page-title">Dashboard</h1>
        <nav className="breadcrumb">
          <span>Home</span>
          <ChevronRight size={13} />
          <span className="breadcrumb-active">Dashboard</span>
        </nav>
      </div>

      {/* Stat Cards */}
      <div className="dashboard-grid">
        <StatCard
          label="Today's Revenue"
          value={fmt(todayStats.gross)}
          subLabel={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          changeValue={todayStats.orderCount > 0 ? `${todayStats.orderCount} orders today` : 'No orders yet'}
          changeUp={todayStats.gross > 0}
          icon={CreditCard}
        />
        <StatCard
          label="Orders Today"
          value={todayStats.orderCount.toLocaleString()}
          subLabel={todayStats.avg > 0 ? `Avg ₹${Math.round(todayStats.avg)}` : 'No orders yet'}
          changeValue={orders.length > 0 ? `${orders.length} all time` : 'No orders yet'}
          changeUp={true}
          icon={CheckCircle}
        />
        <StatCard
          label="Active Deliveries"
          value={activeDeliveries}
          subLabel={`${deliveryOrders.length} total delivery orders`}
          changeValue={activeDeliveries > 0 ? `${activeDeliveries} in progress` : 'All fulfilled'}
          changeUp={false}
          icon={Clock}
        />
        <StatCard
          label="Low Stock Alerts"
          value={lowStockCount}
          subLabel={`${inventory.length} items tracked`}
          changeValue={lowStockCount > 0 ? `${lowStockCount} need attention` : 'All stock OK'}
          changeUp={lowStockCount === 0}
          icon={ShoppingBag}
        />
      </div>

      {/* Charts Row */}
      <div className="dashboard-charts">
        {/* Revenue Chart */}
        <div className="card" style={{ minHeight: '280px' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Revenue — Last 7 Days</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={13} /> Live
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {weekBars.map(({ day, rev, pct }) => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '28px', textAlign: 'right', flexShrink: 0 }}>{day}</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(124,58,237,0.08)' }}>
                  <div style={{
                    width: `${pct || 2}%`,
                    height: '100%',
                    borderRadius: '4px',
                    background: pct > 0 ? 'linear-gradient(90deg, #7c3aed, #a855f7)' : 'rgba(124,58,237,0.15)',
                    transition: 'width 0.5s',
                  }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '56px', textAlign: 'right', flexShrink: 0 }}>
                  {rev > 0 ? fmt(rev) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Table Occupancy (static visual — POS tracks live state locally) */}
        <div className="card" style={{ minHeight: '280px' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Table Layout</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {todayStats.orderCount} served today
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {Array.from({ length: 20 }, (_, i) => {
              // Highlight tables that had orders today
              const tableNum = i + 1;
              const hadOrder = todayStats.orders && todayStats.orders.some(o => o.tableId === tableNum || o.tableId === `T${tableNum}`);
              return (
                <div key={i} style={{
                  aspectRatio: '1',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: hadOrder ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'rgba(255,255,255,0.6)',
                  color: hadOrder ? 'white' : 'var(--text-muted)',
                  border: `1px solid ${hadOrder ? 'transparent' : 'rgba(226,232,240,0.7)'}`,
                }}>
                  {tableNum}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }} />
              Served Today
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(226,232,240,0.8)', border: '1px solid rgba(226,232,240,0.7)' }} />
              Available
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid-2">
        {/* Latest Orders */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Latest Orders</h3>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {orders.length} total
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {recentOrders.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
                No orders yet. Use POS to place your first order.
              </p>
            )}
            {recentOrders.map((order) => (
              <div key={order.id} style={{
                display: 'flex', alignItems: 'center', padding: '10px 12px',
                borderRadius: '10px', transition: 'background 150ms', cursor: 'default',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.55)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {order.tableId ? `Table ${order.tableId}` : 'Order'} — {order.items?.length || 0} items
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{order.billNo} · {timeAgo(order.createdAt)}</div>
                </div>
                <span className="badge badge-success" style={{ marginRight: '12px' }}>Paid</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: '64px', textAlign: 'right' }}>
                  ₹{Number(order.total || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Top Selling Items</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>All time</span>
          </div>
          {topItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
              No sales data yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {topItems.map((item, idx) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(124,58,237,0.1)', color: 'var(--primary)',
                    fontSize: '0.8rem', fontWeight: 800,
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ marginTop: '4px', height: '5px', borderRadius: '3px', background: 'rgba(124,58,237,0.1)' }}>
                      <div style={{
                        width: `${100 - idx * 18}%`,
                        height: '100%', borderRadius: '3px',
                        background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>₹{item.revenue.toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.orders} orders</div>
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

export default Dashboard;
