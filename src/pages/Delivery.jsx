import React, { useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Truck, Clock, CheckCircle2, XCircle, RefreshCw, ChevronRight, X,
  Package, MapPin, Phone, User, Star, TrendingUp, DollarSign,
  Wifi, WifiOff, Zap, Send, Navigation, Plus, Edit2, Trash2,
  Globe, ShoppingBag, Settings as SettingsIcon, Eye, AlertCircle,
  ChefHat, ArrowRight, ExternalLink, MessageSquare, CalendarClock,
  CircleDot, ToggleLeft, ToggleRight, Hash, Layers, Map, Route,
  CreditCard, Timer, Users, Activity, Store, Bike, Copy
} from 'lucide-react';
import { useApp } from '../db/AppContext';

/* ── Constants ──────────────────────────────────────────── */
const TABS = [
  { key: 'live', label: 'Live Orders', icon: Activity },
  { key: 'thirdparty', label: 'Third-Party', icon: Layers },
  { key: 'online', label: 'Online Ordering', icon: Globe },
  { key: 'dispatch', label: 'Driver Dispatch', icon: Bike },
  { key: 'zones', label: 'Delivery Zones', icon: Map },
];

const PLATFORMS = {
  Zomato:   { color: '#E23744', bg: 'rgba(226,55,68,0.10)' },
  Swiggy:   { color: '#FC8019', bg: 'rgba(252,128,25,0.10)' },
  UberEats: { color: '#06C167', bg: 'rgba(6,193,103,0.10)' },
  DoorDash: { color: '#FF3008', bg: 'rgba(255,48,8,0.10)' },
  Grubhub:  { color: '#F63440', bg: 'rgba(246,52,64,0.10)' },
  Direct:   { color: 'var(--primary)', bg: 'var(--primary-light)' },
};

const STATUS_COLUMNS = [
  { key: 'new', label: 'New', color: 'var(--danger)', dot: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
  { key: 'preparing', label: 'Preparing', color: '#b45309', dot: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  { key: 'ready', label: 'Ready', color: 'var(--success)', dot: '#22c55e', bg: 'rgba(34,197,94,0.06)' },
  { key: 'out-for-delivery', label: 'Out for Delivery', color: 'var(--accent-blue)', dot: '#3b82f6', bg: 'rgba(59,130,246,0.06)' },
  { key: 'delivered', label: 'Delivered', color: 'var(--text-muted)', dot: '#94a3b8', bg: 'rgba(100,116,139,0.04)' },
];

const DRIVER_STATUSES = ['Available', 'On Delivery', 'Off Duty'];

const timeAgo = (iso) => {
  if (!iso) return '--';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const timeElapsedMin = (iso) => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
};

const genId = () => `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ── Portal Modal ───────────────────────────────────────── */
const Modal = ({ title, onClose, children, wide }) =>
  ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal animate-fade-up"
        style={wide ? { maxWidth: '700px', width: '95%' } : {}}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );

/* ── Shared Inline Style Helpers ────────────────────────── */
const s = {
  badge: (color, bg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: bg || 'rgba(124,58,237,0.1)', color: color || 'var(--primary)',
    fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
  }),
  platformBadge: (platform) => {
    const p = PLATFORMS[platform] || PLATFORMS.Direct;
    return {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: p.color, color: '#fff',
      fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.02em',
    };
  },
  statCard: {
    flex: '1 1 180px', background: 'var(--card-bg)', backdropFilter: 'blur(12px)',
    borderRadius: 14, padding: '16px 20px',
    border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4,
  },
  sectionHeader: {
    fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: 10,
  },
  toggleTrack: (on) => ({
    width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
    background: on ? 'var(--success)' : '#cbd5e1', transition: 'background 0.2s',
    position: 'relative', display: 'inline-block', flexShrink: 0,
  }),
  toggleKnob: (on) => ({
    width: 16, height: 16, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  }),
};

/* ── Toggle Component ───────────────────────────────────── */
const Toggle = ({ value, onChange }) => (
  <div style={s.toggleTrack(value)} onClick={() => onChange(!value)}>
    <div style={s.toggleKnob(value)} />
  </div>
);

/* ── Stat Card Component ────────────────────────────────── */
const StatCard = ({ label, value, color, icon: Icon, sub }) => (
  <div style={s.statCard}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {Icon && <Icon size={16} style={{ color: color || 'var(--text-muted)' }} />}
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
const Delivery = () => {
  const {
    deliveryOrders, onlineOrders, staff, menu, settings,
    addDelivery, advanceDeliveryStatus, rejectDelivery, simulateNewDelivery,
    addOnlineOrder, editOnlineOrder,
  } = useApp();

  const [tab, setTab] = useState('live');
  const [detailOrder, setDetailOrder] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [zoneModal, setZoneModal] = useState(null);
  const [onlineDetailModal, setOnlineDetailModal] = useState(null);
  const [trackingSent, setTrackingSent] = useState({});

  /* ── Local state for features not backed by context ──── */
  const [platformConnections, setPlatformConnections] = useState({
    Zomato: true, Swiggy: true, UberEats: false, DoorDash: false, Grubhub: false,
  });
  const [driverStatuses, setDriverStatuses] = useState({});
  const [deliveryZones, setDeliveryZones] = useState([
    { id: 'dz1', name: 'Zone A - Downtown', description: 'Within 3 km radius', fee: 30, minOrder: 200, estTime: '20-30 min', active: true },
    { id: 'dz2', name: 'Zone B - Suburbs', description: '3-7 km radius', fee: 50, minOrder: 350, estTime: '30-45 min', active: true },
    { id: 'dz3', name: 'Zone C - Outer Ring', description: '7-12 km radius', fee: 80, minOrder: 500, estTime: '45-60 min', active: false },
  ]);
  const [feeTiers] = useState([
    { range: '0 - 3 km', fee: 30 },
    { range: '3 - 7 km', fee: 50 },
    { range: '7 - 12 km', fee: 80 },
    { range: '12+ km', fee: 120 },
  ]);
  const [onlineSettings, setOnlineSettings] = useState({
    acceptingOrders: true, deliveryFee: 40, minOrder: 200,
    brandColor: '#7c3aed', brandName: settings?.restaurantName || 'Kitchgoo Kitchen',
  });

  /* ── Derived data ───────────────────────────────────────── */
  const allOrders = useMemo(() => {
    const mapped = (onlineOrders || []).map(o => ({
      ...o, platform: o.platform || 'Direct', source: 'online',
    }));
    const delivMapped = (deliveryOrders || []).map(o => ({ ...o, source: 'delivery' }));
    return [...delivMapped, ...mapped].sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [deliveryOrders, onlineOrders]);

  const activeOrders = useMemo(() => allOrders.filter(o => o.status !== 'delivered'), [allOrders]);

  const todayRevenue = useMemo(() =>
    allOrders.filter(o => {
      const d = new Date(o.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).reduce((sum, o) => sum + (o.total || 0), 0)
  , [allOrders]);

  const avgPrepTime = useMemo(() => {
    const preparing = allOrders.filter(o => o.status === 'preparing');
    if (!preparing.length) return 0;
    return Math.round(preparing.reduce((sum, o) => sum + timeElapsedMin(o.createdAt), 0) / preparing.length);
  }, [allOrders]);

  const drivers = useMemo(() =>
    (staff || []).filter(s => s.role === 'Delivery Boy' || s.role === 'delivery' || s.role === 'driver')
  , [staff]);

  const platformStats = useMemo(() => {
    const stats = {};
    Object.keys(PLATFORMS).forEach(p => {
      if (p === 'Direct') return;
      const pOrders = allOrders.filter(o => o.platform === p);
      const today = pOrders.filter(o => {
        const d = new Date(o.createdAt);
        return d.toDateString() === new Date().toDateString();
      });
      stats[p] = {
        totalOrders: today.length,
        revenue: today.reduce((s, o) => s + (o.total || 0), 0),
        avgRating: (3.8 + Math.random() * 1.1).toFixed(1),
      };
    });
    return stats;
  }, [allOrders]);

  /* ── Handlers ───────────────────────────────────────────── */
  const handleAdvance = useCallback((order) => {
    if (order.source === 'online') {
      const FLOW = { new: 'preparing', preparing: 'ready', ready: 'out-for-delivery', 'out-for-delivery': 'delivered' };
      if (FLOW[order.status]) {
        editOnlineOrder(order.id, { status: FLOW[order.status] });
      }
    } else {
      advanceDeliveryStatus(order.id);
    }
  }, [advanceDeliveryStatus, editOnlineOrder]);

  const handleReject = useCallback((order) => {
    if (order.source === 'online') {
      editOnlineOrder(order.id, { status: 'cancelled' });
    } else {
      rejectDelivery(order.id);
    }
  }, [rejectDelivery, editOnlineOrder]);

  const handleSimulateOnlineOrder = useCallback(() => {
    const names = ['Ravi S.', 'Anita P.', 'John D.', 'Lisa W.', 'Karan M.'];
    const items = Math.floor(Math.random() * 5) + 1;
    const total = Math.floor(Math.random() * 1200) + 250;
    addOnlineOrder({
      id: genId(),
      platform: 'Direct',
      status: 'new',
      customer: names[Math.floor(Math.random() * names.length)],
      items,
      total,
      address: '45 Park Avenue, Mumbai',
      phone: '+91 99887 00000',
      specialInstructions: Math.random() > 0.5 ? 'Extra spicy, no onions' : '',
      isPreOrder: Math.random() > 0.7,
      isCatering: Math.random() > 0.85,
      createdAt: new Date().toISOString(),
    });
  }, [addOnlineOrder]);

  const handleAssignDriver = useCallback((orderId, driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    // For delivery orders, we track assignment locally
    const order = allOrders.find(o => o.id === orderId);
    if (order?.source === 'online') {
      editOnlineOrder(orderId, { assignedDriver: driver.name });
    }
    // Close modal
    setAssignModal(null);
  }, [drivers, allOrders, editOnlineOrder]);

  const handleSendTracking = useCallback((orderId) => {
    setTrackingSent(prev => ({ ...prev, [orderId]: true }));
    setTimeout(() => setTrackingSent(prev => ({ ...prev, [orderId]: false })), 3000);
  }, []);

  const handleSaveZone = useCallback((zone) => {
    setDeliveryZones(prev => {
      const idx = prev.findIndex(z => z.id === zone.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = zone;
        return updated;
      }
      return [...prev, { ...zone, id: genId() }];
    });
    setZoneModal(null);
  }, []);

  const handleDeleteZone = useCallback((id) => {
    setDeliveryZones(prev => prev.filter(z => z.id !== id));
  }, []);

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Delivery & Online Ordering</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={simulateNewDelivery}>
            <RefreshCw size={15} /> Simulate 3P Order
          </button>
          <button className="btn btn-primary" onClick={handleSimulateOnlineOrder}>
            <Plus size={15} /> Simulate Direct Order
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 18,
        background: 'rgba(255,255,255,0.5)', padding: 4, borderRadius: 12,
        width: 'fit-content', border: '1px solid var(--border-subtle)',
      }}>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={tab === t.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB: Live Orders ──────────────────────────────── */}
      {tab === 'live' && <LiveOrdersTab
        allOrders={allOrders}
        activeOrders={activeOrders}
        todayRevenue={todayRevenue}
        avgPrepTime={avgPrepTime}
        onAdvance={handleAdvance}
        onReject={handleReject}
        onDetail={setDetailOrder}
      />}

      {/* ── TAB: Third-Party ──────────────────────────────── */}
      {tab === 'thirdparty' && <ThirdPartyTab
        platformConnections={platformConnections}
        setPlatformConnections={setPlatformConnections}
        platformStats={platformStats}
        allOrders={allOrders}
        simulateNewDelivery={simulateNewDelivery}
      />}

      {/* ── TAB: Online Ordering ──────────────────────────── */}
      {tab === 'online' && <OnlineOrderingTab
        onlineOrders={onlineOrders || []}
        onlineSettings={onlineSettings}
        setOnlineSettings={setOnlineSettings}
        onDetail={setOnlineDetailModal}
        menu={menu}
      />}

      {/* ── TAB: Driver Dispatch ──────────────────────────── */}
      {tab === 'dispatch' && <DriverDispatchTab
        drivers={drivers}
        allOrders={allOrders}
        driverStatuses={driverStatuses}
        setDriverStatuses={setDriverStatuses}
        onAssign={setAssignModal}
        trackingSent={trackingSent}
        onSendTracking={handleSendTracking}
      />}

      {/* ── TAB: Delivery Zones ───────────────────────────── */}
      {tab === 'zones' && <DeliveryZonesTab
        zones={deliveryZones}
        feeTiers={feeTiers}
        onEdit={(zone) => setZoneModal(zone)}
        onAdd={() => setZoneModal({ id: '', name: '', description: '', fee: 0, minOrder: 0, estTime: '', active: true })}
        onDelete={handleDeleteZone}
        onToggle={(id) => setDeliveryZones(prev => prev.map(z => z.id === id ? { ...z, active: !z.active } : z))}
      />}

      {/* ── Modals ────────────────────────────────────────── */}
      {detailOrder && (
        <Modal title={`Order ${detailOrder.externalId || detailOrder.id}`} onClose={() => setDetailOrder(null)} wide>
          <OrderDetailContent order={detailOrder} onAdvance={handleAdvance} onReject={handleReject} onClose={() => setDetailOrder(null)} />
        </Modal>
      )}

      {onlineDetailModal && (
        <Modal title={`Online Order ${onlineDetailModal.id?.slice(0, 8)}`} onClose={() => setOnlineDetailModal(null)} wide>
          <OrderDetailContent order={{ ...onlineDetailModal, platform: 'Direct' }} onAdvance={handleAdvance} onReject={handleReject} onClose={() => setOnlineDetailModal(null)} />
        </Modal>
      )}

      {assignModal && (
        <Modal title="Assign Driver" onClose={() => setAssignModal(null)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Select a driver for order <strong>{assignModal.externalId || assignModal.id?.slice(0, 8)}</strong>
            </p>
            {drivers.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No delivery drivers found. Add staff with "Delivery Boy" role.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {drivers.map(d => (
                <button key={d.id} className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', gap: 10 }}
                  onClick={() => handleAssignDriver(assignModal.id, d.id)}
                >
                  <User size={16} />
                  <span style={{ fontWeight: 600 }}>{d.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {d.status === 'active' ? 'Available' : 'Off Duty'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {zoneModal && (
        <Modal title={zoneModal.id ? 'Edit Delivery Zone' : 'Add Delivery Zone'} onClose={() => setZoneModal(null)}>
          <ZoneForm zone={zoneModal} onSave={handleSaveZone} onClose={() => setZoneModal(null)} />
        </Modal>
      )}
    </div>
  );
};

/* ============================================================
   TAB: Live Orders (Kanban)
   ============================================================ */
const LiveOrdersTab = ({ allOrders, activeOrders, todayRevenue, avgPrepTime, onAdvance, onReject, onDetail }) => {
  const ordersByStatus = useMemo(() => {
    const map = {};
    STATUS_COLUMNS.forEach(c => { map[c.key] = []; });
    allOrders.forEach(o => {
      if (map[o.status]) map[o.status].push(o);
    });
    return map;
  }, [allOrders]);

  return (
    <>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <StatCard label="Active Orders" value={activeOrders.length} color="var(--primary)" icon={Package} />
        <StatCard label="Avg Prep Time" value={`${avgPrepTime}m`} color="var(--warning)" icon={Timer} />
        <StatCard label="Revenue Today" value={`₹${todayRevenue.toLocaleString()}`} color="var(--success)" icon={DollarSign} />
        <StatCard label="Total Orders" value={allOrders.length} color="var(--accent-blue)" icon={TrendingUp} />
      </div>

      {/* Kanban columns */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${STATUS_COLUMNS.length}, 1fr)`, gap: 10,
        overflowX: 'auto',
      }}>
        {STATUS_COLUMNS.map(col => (
          <div key={col.key} style={{
            background: col.bg, borderRadius: 14, padding: 12,
            border: '1px solid var(--border-subtle)', minWidth: 220,
          }}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: col.color }}>{col.label}</span>
              </div>
              <span style={{
                background: col.color, color: '#fff', fontSize: '0.68rem', fontWeight: 800,
                padding: '1px 7px', borderRadius: 8, minWidth: 20, textAlign: 'center',
              }}>
                {(ordersByStatus[col.key] || []).length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(ordersByStatus[col.key] || []).map(order => (
                <KanbanCard key={order.id} order={order} col={col}
                  onAdvance={onAdvance} onReject={onReject} onDetail={onDetail}
                />
              ))}
              {(ordersByStatus[col.key] || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  No orders
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

/* ── Kanban Card ────────────────────────────────────────── */
const KanbanCard = ({ order, col, onAdvance, onReject, onDetail }) => {
  const displayId = order.externalId || order.id?.slice(0, 8);
  const platform = order.platform || 'Direct';
  const actionLabels = {
    new: 'Accept',
    preparing: 'Ready',
    ready: 'Dispatch',
    'out-for-delivery': 'Delivered',
  };

  return (
    <div className="card" style={{
      padding: 12, cursor: 'pointer',
      background: 'var(--card-bg)', backdropFilter: 'blur(8px)',
      border: '1px solid var(--border-subtle)', borderRadius: 10,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onClick={() => onDetail(order)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={s.platformBadge(platform)}>{platform}</span>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 4, color: 'var(--text-primary)' }}>#{displayId}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            ₹{(order.total || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{order.items || 0} items</div>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <User size={12} /> {order.customer || 'Guest'}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <MapPin size={11} /> {(order.address || '').slice(0, 30)}{(order.address || '').length > 30 ? '...' : ''}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <Clock size={11} /> {timeAgo(order.createdAt)}
      </div>

      {order.status !== 'delivered' && (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          {order.status === 'new' && (
            <button className="btn btn-danger btn-sm" style={{ flex: 1, fontSize: '0.7rem' }} onClick={() => onReject(order)}>
              <XCircle size={12} /> Reject
            </button>
          )}
          {actionLabels[order.status] && (
            <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: '0.7rem' }} onClick={() => onAdvance(order)}>
              <ChevronRight size={12} /> {actionLabels[order.status]}
            </button>
          )}
        </div>
      )}
      {order.status === 'delivered' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--success)', fontWeight: 600 }}>
          <CheckCircle2 size={13} /> Completed
        </div>
      )}
    </div>
  );
};

/* ============================================================
   TAB: Third-Party Platforms
   ============================================================ */
const ThirdPartyTab = ({ platformConnections, setPlatformConnections, platformStats, allOrders, simulateNewDelivery }) => {
  const togglePlatform = (name) => {
    setPlatformConnections(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      {/* POS Injection indicator */}
      <div className="card" style={{
        padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)',
      }}>
        <Zap size={18} style={{ color: 'var(--success)' }} />
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Direct POS Injection Active</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Third-party orders automatically fire to KDS and appear in the POS queue.
          </div>
        </div>
        <CheckCircle2 size={20} style={{ color: 'var(--success)', marginLeft: 'auto' }} />
      </div>

      {/* Platform cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {Object.keys(PLATFORMS).filter(p => p !== 'Direct').map(name => {
          const p = PLATFORMS[name];
          const connected = platformConnections[name];
          const stats = platformStats[name] || { totalOrders: 0, revenue: 0, avgRating: '4.0' };

          return (
            <div key={name} className="card" style={{
              padding: 20, position: 'relative', overflow: 'hidden',
              borderLeft: `4px solid ${p.color}`,
              opacity: connected ? 1 : 0.6, transition: 'opacity 0.2s',
            }}>
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: p.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: '0.85rem', color: p.color,
                  }}>
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                      {connected
                        ? <><Wifi size={11} style={{ color: 'var(--success)' }} /> <span style={{ color: 'var(--success)', fontWeight: 600 }}>Connected</span></>
                        : <><WifiOff size={11} style={{ color: 'var(--text-muted)' }} /> <span style={{ color: 'var(--text-muted)' }}>Disconnected</span></>
                      }
                    </div>
                  </div>
                </div>
                <Toggle value={connected} onChange={() => togglePlatform(name)} />
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Today's Orders</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{stats.totalOrders}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Revenue</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: p.color }}>₹{stats.revenue.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>Avg Rating</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Star size={13} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{stats.avgRating}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }}
                  onClick={simulateNewDelivery} disabled={!connected}
                >
                  <RefreshCw size={12} /> Simulate Order
                </button>
                <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} disabled={!connected}>
                  <SettingsIcon size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue breakdown */}
      <div style={{ marginTop: 20 }}>
        <div style={s.sectionHeader}>Platform Revenue Breakdown</div>
        <div className="card" style={{ padding: 16 }}>
          {Object.keys(PLATFORMS).filter(p => p !== 'Direct').map(name => {
            const p = PLATFORMS[name];
            const stats = platformStats[name] || { revenue: 0, totalOrders: 0 };
            const totalRev = Object.values(platformStats).reduce((s, v) => s + (v.revenue || 0), 0) || 1;
            const pct = Math.round((stats.revenue / totalRev) * 100);
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', width: 80, color: p.color }}>{name}</span>
                <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: p.color, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.8rem', minWidth: 60, textAlign: 'right' }}>₹{stats.revenue.toLocaleString()}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: 36 }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

/* ============================================================
   TAB: Online Ordering (First-Party)
   ============================================================ */
const OnlineOrderingTab = ({ onlineOrders, onlineSettings, setOnlineSettings, onDetail, menu }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Left: Portal Preview + Settings */}
      <div>
        {/* White-labeled Portal Preview */}
        <div style={s.sectionHeader}>Ordering Portal Preview</div>
        <div className="card" style={{
          padding: 0, overflow: 'hidden', marginBottom: 16,
          border: `2px solid ${onlineSettings.brandColor}20`,
        }}>
          {/* Header mockup */}
          <div style={{
            background: onlineSettings.brandColor, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Store size={20} style={{ color: '#fff' }} />
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{onlineSettings.brandName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShoppingBag size={16} style={{ color: '#fff' }} />
              <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>Cart (0)</span>
            </div>
          </div>
          {/* Menu preview */}
          <div style={{ padding: 16, background: 'rgba(248,250,252,0.8)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Popular Items</div>
            {(menu || []).slice(0, 3).map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: '#fff', borderRadius: 8, marginBottom: 6,
                border: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.category || 'Main Course'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>₹{item.price}</span>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem', padding: '2px 10px' }}>Add</button>
                </div>
              </div>
            ))}
            {(menu || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Add menu items to preview your ordering portal
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Powered by Kitchgoo</span>
            </div>
          </div>
        </div>

        {/* Online Settings */}
        <div style={s.sectionHeader}>Portal Settings</div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Accepting Orders</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Toggle to pause incoming online orders</div>
            </div>
            <Toggle value={onlineSettings.acceptingOrders}
              onChange={(v) => setOnlineSettings(p => ({ ...p, acceptingOrders: v }))} />
          </div>

          <div className="input-group" style={{ marginBottom: 12 }}>
            <label className="input-label">Brand Name</label>
            <input className="input-field" value={onlineSettings.brandName}
              onChange={e => setOnlineSettings(p => ({ ...p, brandName: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="input-group">
              <label className="input-label">Delivery Fee (₹)</label>
              <input className="input-field" type="number" value={onlineSettings.deliveryFee}
                onChange={e => setOnlineSettings(p => ({ ...p, deliveryFee: Number(e.target.value) }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Min Order (₹)</label>
              <input className="input-field" type="number" value={onlineSettings.minOrder}
                onChange={e => setOnlineSettings(p => ({ ...p, minOrder: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Brand Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={onlineSettings.brandColor}
                onChange={e => setOnlineSettings(p => ({ ...p, brandColor: e.target.value }))}
                style={{ width: 36, height: 30, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 6 }}
              />
              <input className="input-field" value={onlineSettings.brandColor} readOnly style={{ flex: 1 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Online Orders List */}
      <div>
        <div style={s.sectionHeader}>Direct Orders ({onlineOrders.length})</div>
        {onlineOrders.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No direct online orders yet. Use "Simulate Direct Order" to test.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '70vh', overflowY: 'auto' }}>
          {onlineOrders.map(order => {
            const statusColor = STATUS_COLUMNS.find(c => c.key === order.status)?.color || 'var(--text-muted)';
            const statusLabel = STATUS_COLUMNS.find(c => c.key === order.status)?.label || order.status;
            return (
              <div key={order.id} className="card" style={{ padding: 14, cursor: 'pointer' }}
                onClick={() => onDetail(order)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={s.platformBadge('Direct')}>Direct</span>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>#{order.id?.slice(0, 8)}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <User size={11} style={{ verticalAlign: -1 }} /> {order.customer || 'Guest'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>₹{(order.total || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: statusColor, fontWeight: 700 }}>{statusLabel}</div>
                  </div>
                </div>

                {/* Indicators */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {order.isPreOrder && (
                    <span style={s.badge('var(--accent-blue)', 'rgba(59,130,246,0.1)')}>
                      <CalendarClock size={10} /> Pre-Order
                    </span>
                  )}
                  {order.isCatering && (
                    <span style={s.badge('#b45309', 'rgba(245,158,11,0.1)')}>
                      <ChefHat size={10} /> Catering
                    </span>
                  )}
                  {order.specialInstructions && (
                    <span style={s.badge('var(--danger)', 'rgba(239,68,68,0.08)')}>
                      <AlertCircle size={10} /> Special Note
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    <Clock size={10} style={{ verticalAlign: -1 }} /> {timeAgo(order.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   TAB: Driver Dispatch
   ============================================================ */
const DriverDispatchTab = ({ drivers, allOrders, driverStatuses, setDriverStatuses, onAssign, trackingSent, onSendTracking }) => {
  const activeDeliveryOrders = useMemo(
    () => allOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled'),
    [allOrders]
  );

  const getDriverStatus = (d) => driverStatuses[d.id] || (d.status === 'active' ? 'Available' : 'Off Duty');

  const getDriverActiveOrders = (driverName) =>
    allOrders.filter(o => o.assignedDriver === driverName && o.status !== 'delivered');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* Left: Drivers */}
      <div>
        <div style={s.sectionHeader}>Drivers ({drivers.length})</div>
        {drivers.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No delivery staff found. Add staff with "Delivery Boy" role in the Staff page.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drivers.map(d => {
            const status = getDriverStatus(d);
            const activeCount = getDriverActiveOrders(d.name).length;
            const statusColors = {
              Available: 'var(--success)',
              'On Delivery': 'var(--warning)',
              'Off Duty': 'var(--text-muted)',
            };
            return (
              <div key={d.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'var(--primary-light)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.85rem', color: 'var(--primary)',
                    }}>
                      {d.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{d.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.phone || 'No phone'}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={s.badge(statusColors[status], status === 'Available' ? 'rgba(34,197,94,0.1)' : status === 'On Delivery' ? 'rgba(245,158,11,0.1)' : 'rgba(100,116,139,0.1)')}>
                      <CircleDot size={9} /> {status}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Active deliveries: <strong>{activeCount}</strong>
                  </span>
                  <select
                    className="input-field"
                    style={{ width: 'auto', padding: '3px 8px', fontSize: '0.72rem' }}
                    value={status}
                    onChange={e => setDriverStatuses(prev => ({ ...prev, [d.id]: e.target.value }))}
                  >
                    {DRIVER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Route info placeholder */}
        <div style={{ marginTop: 16 }}>
          <div style={s.sectionHeader}>Route Information</div>
          <div className="card" style={{
            padding: 24, textAlign: 'center', color: 'var(--text-muted)',
            background: 'rgba(59,130,246,0.04)',
          }}>
            <Route size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Route Optimization</div>
            <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
              Map integration coming soon. Routes will auto-optimize based on active deliveries.
            </div>
          </div>
        </div>
      </div>

      {/* Right: Active deliveries & assignment */}
      <div>
        <div style={s.sectionHeader}>Active Deliveries ({activeDeliveryOrders.length})</div>
        {activeDeliveryOrders.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No active delivery orders right now.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '70vh', overflowY: 'auto' }}>
          {activeDeliveryOrders.map(order => {
            const statusCol = STATUS_COLUMNS.find(c => c.key === order.status) || STATUS_COLUMNS[0];
            const sent = trackingSent[order.id];
            return (
              <div key={order.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={s.platformBadge(order.platform || 'Direct')}>{order.platform || 'Direct'}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>#{(order.externalId || order.id)?.slice(0, 10)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                      {order.customer || 'Guest'} - {order.items || 0} items
                    </div>
                  </div>
                  <span style={s.badge(statusCol.color, statusCol.bg)}>
                    <CircleDot size={9} /> {statusCol.label}
                  </span>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  <MapPin size={11} style={{ verticalAlign: -1 }} /> {order.address || 'No address'}
                </div>

                {order.assignedDriver && (
                  <div style={{ fontSize: '0.75rem', marginBottom: 8, padding: '6px 10px', background: 'rgba(124,58,237,0.06)', borderRadius: 6 }}>
                    <Bike size={12} style={{ verticalAlign: -2, color: 'var(--primary)' }} />
                    {' '}Driver: <strong>{order.assignedDriver}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }}
                    onClick={() => onAssign(order)}
                  >
                    <User size={12} /> {order.assignedDriver ? 'Reassign' : 'Assign Driver'}
                  </button>
                  <button
                    className={sent ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => onSendTracking(order.id)}
                    disabled={sent}
                  >
                    {sent ? <><CheckCircle2 size={12} /> Sent</> : <><Send size={12} /> Track Link</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   TAB: Delivery Zones
   ============================================================ */
const DeliveryZonesTab = ({ zones, feeTiers, onEdit, onAdd, onDelete, onToggle }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
    {/* Left: Zones list */}
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={s.sectionHeader}>Delivery Zones ({zones.length})</div>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>
          <Plus size={14} /> Add Zone
        </button>
      </div>

      {zones.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No delivery zones configured. Add your first zone.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {zones.map(zone => (
          <div key={zone.id} className="card" style={{
            padding: 16, opacity: zone.active ? 1 : 0.55, transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Map size={16} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{zone.name}</span>
                  {!zone.active && <span style={s.badge('var(--text-muted)', 'rgba(100,116,139,0.1)')}>Inactive</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{zone.description}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem' }}>
                  <span><strong style={{ color: 'var(--text-primary)' }}>₹{zone.fee}</strong> <span style={{ color: 'var(--text-muted)' }}>delivery fee</span></span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>₹{zone.minOrder}</strong> <span style={{ color: 'var(--text-muted)' }}>min order</span></span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>{zone.estTime}</strong> <span style={{ color: 'var(--text-muted)' }}>est. time</span></span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                <Toggle value={zone.active} onChange={() => onToggle(zone.id)} />
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(zone)}>
                  <Edit2 size={13} />
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(zone.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Right: Fee Tiers */}
    <div>
      <div style={s.sectionHeader}>Distance-Based Fee Tiers</div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {feeTiers.map((tier, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', background: i % 2 === 0 ? 'rgba(124,58,237,0.04)' : 'transparent',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Navigation size={13} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{tier.range}</span>
              </div>
              <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.88rem' }}>₹{tier.fee}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map placeholder */}
      <div style={{ marginTop: 14 }}>
        <div style={s.sectionHeader}>Zone Map Preview</div>
        <div className="card" style={{
          padding: 32, textAlign: 'center', color: 'var(--text-muted)',
          background: 'rgba(124,58,237,0.03)', minHeight: 180,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <Map size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Map Integration</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
            Visualize delivery zones on an interactive map. Coming soon.
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ============================================================
   Zone Form (Modal Body)
   ============================================================ */
const ZoneForm = ({ zone, onSave, onClose }) => {
  const [form, setForm] = useState({ ...zone });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <>
      <div className="modal-body">
        <div className="input-group" style={{ marginBottom: 12 }}>
          <label className="input-label">Zone Name</label>
          <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Zone A - Downtown" />
        </div>
        <div className="input-group" style={{ marginBottom: 12 }}>
          <label className="input-label">Description / Area</label>
          <input className="input-field" value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Within 3 km radius" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div className="input-group">
            <label className="input-label">Delivery Fee (₹)</label>
            <input className="input-field" type="number" value={form.fee} onChange={e => set('fee', Number(e.target.value))} />
          </div>
          <div className="input-group">
            <label className="input-label">Min Order (₹)</label>
            <input className="input-field" type="number" value={form.minOrder} onChange={e => set('minOrder', Number(e.target.value))} />
          </div>
        </div>
        <div className="input-group" style={{ marginBottom: 12 }}>
          <label className="input-label">Estimated Delivery Time</label>
          <input className="input-field" value={form.estTime} onChange={e => set('estTime', e.target.value)} placeholder="e.g. 20-30 min" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle value={form.active} onChange={v => set('active', v)} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Zone Active</span>
        </div>
      </div>
      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={!form.name.trim()}>
          {zone.id ? 'Save Changes' : 'Add Zone'}
        </button>
      </div>
    </>
  );
};

/* ============================================================
   Order Detail Modal Content
   ============================================================ */
const OrderDetailContent = ({ order, onAdvance, onReject, onClose }) => {
  const statusCol = STATUS_COLUMNS.find(c => c.key === order.status) || STATUS_COLUMNS[0];
  const platform = order.platform || 'Direct';
  const actionLabels = {
    new: 'Accept & Start Preparing',
    preparing: 'Mark as Ready',
    ready: 'Hand to Driver',
    'out-for-delivery': 'Mark Delivered',
  };

  return (
    <>
      <div className="modal-body" style={{ padding: 20 }}>
        {/* Status banner */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: statusCol.bg, border: `1px solid ${statusCol.color}20`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusCol.dot }} />
            <span style={{ fontWeight: 700, color: statusCol.color, fontSize: '0.88rem' }}>{statusCol.label}</span>
          </div>
          <span style={s.platformBadge(platform)}>{platform}</span>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Customer</div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{order.customer || 'Guest'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Order Total</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>₹{(order.total || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Phone</div>
            <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Phone size={13} /> {order.phone || 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Items</div>
            <div style={{ fontSize: '0.85rem' }}>{order.items || 0} items</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Delivery Address</div>
            <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {order.address || 'No address provided'}
            </div>
          </div>
          {order.assignedDriver && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Assigned Driver</div>
              <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bike size={14} /> {order.assignedDriver}
              </div>
            </div>
          )}
          {order.specialInstructions && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Special Instructions</div>
              <div style={{
                fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(239,68,68,0.06)',
                borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)', color: 'var(--danger)',
              }}>
                {order.specialInstructions}
              </div>
            </div>
          )}
          {order.driverInstructions && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Driver Instructions</div>
              <div style={{ fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(59,130,246,0.06)', borderRadius: 8 }}>
                {order.driverInstructions}
              </div>
            </div>
          )}
        </div>

        {/* Indicators */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {order.isPreOrder && (
            <span style={s.badge('var(--accent-blue)', 'rgba(59,130,246,0.1)')}>
              <CalendarClock size={11} /> Pre-Order
            </span>
          )}
          {order.isCatering && (
            <span style={s.badge('#b45309', 'rgba(245,158,11,0.1)')}>
              <ChefHat size={11} /> Catering Order
            </span>
          )}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <Clock size={11} style={{ verticalAlign: -1 }} /> Placed {timeAgo(order.createdAt)}
          </span>
        </div>

        {/* Timeline */}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>Order Timeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
          {STATUS_COLUMNS.slice(0, -1).map((col, i) => {
            const reached = STATUS_COLUMNS.findIndex(c => c.key === order.status) >= i;
            return (
              <React.Fragment key={col.key}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: reached ? col.dot : 'rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {reached && <CheckCircle2 size={14} style={{ color: '#fff' }} />}
                </div>
                {i < STATUS_COLUMNS.length - 2 && (
                  <div style={{ flex: 1, height: 3, background: reached ? col.dot : 'rgba(0,0,0,0.06)', borderRadius: 2 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          {STATUS_COLUMNS.slice(0, -1).map(col => (
            <span key={col.key}>{col.label}</span>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
        {order.status === 'new' && (
          <button className="btn btn-danger" onClick={() => { onReject(order); onClose(); }}>
            <XCircle size={15} /> Reject Order
          </button>
        )}
        {actionLabels[order.status] && (
          <button className="btn btn-primary" onClick={() => { onAdvance(order); onClose(); }}>
            <ChevronRight size={15} /> {actionLabels[order.status]}
          </button>
        )}
        {order.status === 'delivered' && (
          <button className="btn btn-success" disabled>
            <CheckCircle2 size={15} /> Order Completed
          </button>
        )}
      </div>
    </>
  );
};

export default Delivery;
