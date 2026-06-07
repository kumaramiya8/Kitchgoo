import React, { useMemo } from 'react';
import {
  CheckCircle, Clock, CreditCard, ShoppingBag,
  ChevronRight, ArrowUpRight, TrendingUp, Users, Utensils,
  AlertTriangle, Truck, Star, DollarSign, BarChart3, Percent
} from 'lucide-react';
import { useApp } from '../db/AppContext';

const StatCard = ({ label, value, subLabel, icon: Icon, changeValue, changeUp, color }) => (
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
      <div className="stat-icon" style={color ? { color } : {}}>
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
  const {
    todayStats, orders, deliveryOrders, inventory, staff, guests,
    kdsTickets, reservations, waitlist, menu, wasteLog, settings,
  } = useApp();

  const recentOrders = useMemo(() => {
    return [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
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
    return Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orders]);

  const activeDeliveries = deliveryOrders.filter(o => o.status !== 'delivered').length;
  const lowStockCount = inventory.filter(i => i.status !== 'good').length;
  const activeKDSCount = (kdsTickets || []).filter(t => t.status === 'active').length;
  const todayReservations = (reservations || []).filter(r => {
    const today = new Date().toISOString().split('T')[0];
    return r.date === today && r.status !== 'cancelled';
  }).length;
  const waitlistCount = (waitlist || []).filter(w => w.status === 'waiting').length;
  const activeStaff = staff.filter(s => s.status === 'active').length;
  const totalGuests = (guests || []).length;
  const vipGuests = (guests || []).filter(g => g.loyaltyTier === 'VIP').length;

  // Revenue by order type
  const revenueByType = useMemo(() => {
    const types = { 'dine-in': 0, takeout: 0, delivery: 0 };
    todayStats.orders.forEach(o => {
      const t = o.orderType || 'dine-in';
      types[t] = (types[t] || 0) + o.total;
    });
    return types;
  }, [todayStats]);

  const totalByTypeSum = Object.values(revenueByType).reduce((s, v) => s + v, 0) || 1;

  // Hourly heatmap
  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0);
    todayStats.orders.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hours[h] += o.total || 0;
    });
    return hours;
  }, [todayStats]);
  const maxHourly = Math.max(...hourlyData, 1);

  // Weekly revenue bars
  const weekBars = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const result = [];
    let maxRev = 1;
    for (let d = 6; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const rev = orders
        .filter(o => o.createdAt && o.createdAt.startsWith(dateStr))
        .reduce((s, o) => s + (o.total || 0), 0);
      if (rev > maxRev) maxRev = rev;
      result.push({ day: days[date.getDay()], rev, dateStr });
    }
    return result.map(d => ({ ...d, pct: Math.round((d.rev / maxRev) * 100) }));
  }, [orders]);

  // Labor cost (simplified)
  const totalLabor = staff.reduce((s, m) => s + (m.salary || 0), 0);
  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0) || 1;
  const laborPct = ((totalLabor / totalRevenue) * 100).toFixed(1);

  // Today's waste
  const todayStr = new Date().toISOString().split('T')[0];
  const todayWaste = (wasteLog || [])
    .filter(w => w.timestamp && w.timestamp.startsWith(todayStr))
    .reduce((s, w) => s + (w.costImpact || 0), 0);

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

      {/* Primary Stats */}
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
          changeValue={orders.length > 0 ? `${orders.length} all time` : 'Start selling!'}
          changeUp={true}
          icon={CheckCircle}
        />
        <StatCard
          label="Active Deliveries"
          value={activeDeliveries}
          subLabel={`${deliveryOrders.length} total delivery orders`}
          changeValue={activeDeliveries > 0 ? `${activeDeliveries} in progress` : 'All fulfilled'}
          changeUp={false}
          icon={Truck}
        />
        <StatCard
          label="Low Stock Alerts"
          value={lowStockCount}
          subLabel={`${inventory.length} items tracked`}
          changeValue={lowStockCount > 0 ? `${lowStockCount} need attention` : 'All stock OK'}
          changeUp={lowStockCount === 0}
          icon={ShoppingBag}
          color={lowStockCount > 0 ? 'var(--danger)' : undefined}
        />
      </div>

      {/* Secondary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'KDS Active', value: activeKDSCount, icon: Utensils, color: activeKDSCount > 0 ? 'var(--warning)' : 'var(--success)' },
          { label: 'Reservations', value: todayReservations, icon: Clock, color: 'var(--accent-blue)' },
          { label: 'Waitlist', value: waitlistCount, icon: Users, color: waitlistCount > 0 ? 'var(--warning)' : 'var(--text-muted)' },
          { label: 'Staff On Duty', value: activeStaff, icon: Users, color: 'var(--primary)' },
          { label: 'Total Guests', value: totalGuests, icon: Star, color: 'var(--primary)' },
          { label: 'VIP Guests', value: vipGuests, icon: Star, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card animate-fade-up" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}>
              <s.icon size={18} />
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
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
                    width: `${pct || 2}%`, height: '100%', borderRadius: '4px',
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

        {/* Revenue by Order Type + Hourly Heatmap */}
        <div className="card" style={{ minHeight: '280px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '14px' }}>Revenue by Channel</h3>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Dine-in', value: revenueByType['dine-in'], color: '#7c3aed' },
              { label: 'Takeout', value: revenueByType.takeout, color: '#f59e0b' },
              { label: 'Delivery', value: revenueByType.delivery, color: '#22c55e' },
            ].map(c => (
              <div key={c.label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: c.color }}>{fmt(c.value)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.label}</div>
                <div style={{ height: 4, borderRadius: 2, background: `${c.color}20`, marginTop: 6 }}>
                  <div style={{ width: `${(c.value / totalByTypeSum) * 100}%`, height: '100%', borderRadius: 2, background: c.color, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>

          <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Hourly Sales Heatmap</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '3px' }}>
            {hourlyData.slice(8, 24).map((val, i) => {
              const intensity = val / maxHourly;
              return (
                <div key={i} title={`${i + 8}:00 — ${fmt(val)}`} style={{
                  aspectRatio: '1', borderRadius: '4px',
                  background: intensity > 0.7 ? '#7c3aed' : intensity > 0.3 ? 'rgba(124,58,237,0.4)' : intensity > 0 ? 'rgba(124,58,237,0.15)' : 'rgba(226,232,240,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.55rem', fontWeight: 600,
                  color: intensity > 0.5 ? 'white' : 'var(--text-muted)',
                }}>
                  {i + 8}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>8am</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>11pm</span>
          </div>
        </div>
      </div>

      {/* Quick Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', margin: '20px 0' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <Percent size={20} style={{ color: 'var(--primary)', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{laborPct}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Labor Cost %</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <DollarSign size={20} style={{ color: todayStats.tips > 0 ? 'var(--success)' : 'var(--text-muted)', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>{fmt(todayStats.tips || 0)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tips Today</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <AlertTriangle size={20} style={{ color: todayWaste > 0 ? 'var(--danger)' : 'var(--text-muted)', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: todayWaste > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmt(todayWaste)}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Waste Today</div>
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
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {order.tableId ? `Table ${order.tableId}` : 'Order'} — {order.items?.length || 0} items
                    {order.orderType && order.orderType !== 'dine-in' && (
                      <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '8px', background: order.orderType === 'delivery' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: order.orderType === 'delivery' ? 'var(--success)' : 'var(--warning)', fontWeight: 700, textTransform: 'uppercase' }}>
                        {order.orderType}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {order.billNo} · {timeAgo(order.createdAt)}
                    {order.serverName && ` · ${order.serverName}`}
                  </div>
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
                    background: idx === 0 ? 'linear-gradient(135deg, #f59e0b, #f97316)' : 'rgba(124,58,237,0.1)',
                    color: idx === 0 ? 'white' : 'var(--primary)',
                    fontSize: '0.8rem', fontWeight: 800,
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ marginTop: '4px', height: '5px', borderRadius: '3px', background: 'rgba(124,58,237,0.1)' }}>
                      <div style={{
                        width: `${Math.max(10, 100 - idx * 18)}%`,
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
