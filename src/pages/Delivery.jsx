import React, { useState } from 'react';
import { Clock, CheckCircle2, XCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { useApp } from '../db/AppContext';

const PLATFORM_COLORS = {
  Zomato: '#E23744',
  Swiggy: '#FC8019',
};

const STATUS_STYLE = {
  new: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'New Order', color: 'var(--danger)', dot: '#ef4444' },
  preparing: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Preparing', color: '#b45309', dot: '#f59e0b' },
  ready: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', label: 'Ready', color: 'var(--success)', dot: '#22c55e' },
  delivered: { bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.15)', label: 'Delivered', color: 'var(--text-muted)', dot: '#94a3b8' },
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const actionLabel = {
  new: 'Accept & Start Preparing',
  preparing: 'Mark as Ready',
  ready: 'Hand to Rider ✓',
};

const Delivery = () => {
  const { deliveryOrders, advanceDeliveryStatus, rejectDelivery, simulateNewDelivery } = useApp();
  const [activeTab, setActiveTab] = useState('active');

  const activeOrders = deliveryOrders.filter(o => o.status !== 'delivered');
  const pastOrders = deliveryOrders.filter(o => o.status === 'delivered');
  const displayed = activeTab === 'active' ? activeOrders : pastOrders;

  const zomatoRevenue = deliveryOrders.filter(o => o.platform === 'Zomato').reduce((s, o) => s + (o.total || 0), 0);
  const swiggyRevenue = deliveryOrders.filter(o => o.platform === 'Swiggy').reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Delivery Orders</h1>
        <button className="btn btn-secondary" onClick={simulateNewDelivery}>
          <RefreshCw size={15} /> Simulate New Order
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">Active Orders</div>
          <div className="stat-value" style={{ fontSize: '1.8rem', color: 'var(--primary)' }}>{activeOrders.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Zomato Revenue</div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#E23744' }}>₹{zomatoRevenue.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Swiggy Revenue</div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#FC8019' }}>₹{swiggyRevenue.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Orders</div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--success)' }}>{deliveryOrders.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: 'rgba(255,255,255,0.5)', padding: '4px', borderRadius: '12px', width: 'fit-content', border: '1px solid var(--border)' }}>
        {['active', 'past'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          >
            {tab === 'active' ? `Active (${activeOrders.length})` : `Past (${pastOrders.length})`}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {displayed.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {activeTab === 'active' ? 'No active orders. Use "Simulate New Order" to test.' : 'No past orders yet.'}
          </div>
        )}
        {displayed.map(order => {
          const ss = STATUS_STYLE[order.status] || STATUS_STYLE.new;
          const displayId = order.externalId || order.id;
          return (
            <div key={order.id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: ss.bg, borderColor: ss.border }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      background: PLATFORM_COLORS[order.platform] || '#888',
                      color: 'white', fontSize: '0.7rem', fontWeight: 800,
                      padding: '2px 8px', borderRadius: '4px',
                    }}>{order.platform}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{displayId}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> {timeAgo(order.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>₹{order.total}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{order.items} Items</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{order.customer}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ss.dot, display: 'inline-block' }} />
                  <span style={{ color: ss.color }}>{ss.label}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {order.status === 'new' && (
                  <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => rejectDelivery(order.id)}>
                    <XCircle size={14} /> Reject
                  </button>
                )}
                {order.status !== 'delivered' && (
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => advanceDeliveryStatus(order.id)}>
                    <ChevronRight size={14} /> {actionLabel[order.status]}
                  </button>
                )}
                {order.status === 'delivered' && (
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} disabled>
                    <CheckCircle2 size={14} /> Completed
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Delivery;
