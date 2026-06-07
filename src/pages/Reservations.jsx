import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  CalendarDays, Clock, Users, Plus, Search, X, Phone, Mail, Edit2,
  Check, AlertTriangle, MessageSquare, ChevronRight, ChevronLeft,
  UserPlus, Bell, Armchair, Trash2, Timer, TrendingUp, Settings2,
  PartyPopper, Briefcase, Heart, Gift, Send, Eye, CheckCircle2,
  XCircle, BarChart3, Wifi, WifiOff, Smartphone, ArrowRight, Star,
  Info, DollarSign, Ban, RefreshCw, MessageCircle, ChevronsUp
} from 'lucide-react';
import { useApp } from '../db/AppContext';

// ── Portal Modal ────────────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => ReactDOM.createPortal(
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" style={wide ? { maxWidth: 700, width: '95%' } : {}} onClick={e => e.stopPropagation()}>
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

// ── Helpers ─────────────────────────────────────────────────────
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime12 = t => { const [h, m] = t.split(':'); const hr = +h % 12 || 12; return `${hr}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };
const todayStr = () => new Date().toISOString().split('T')[0];
const genId = () => 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
const minutesSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

const STATUS_STYLES = {
  confirmed: { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.25)', label: 'Confirmed' },
  seated:    { bg: 'rgba(34,197,94,0.08)',  color: '#16a34a', border: 'rgba(34,197,94,0.25)',  label: 'Seated' },
  completed: { bg: 'rgba(100,116,139,0.06)', color: '#64748b', border: 'rgba(100,116,139,0.18)', label: 'Completed' },
  'no-show': { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'rgba(239,68,68,0.25)', label: 'No-Show' },
  cancelled: { bg: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)', label: 'Cancelled' },
};

const WAITLIST_STYLES = {
  waiting:  { bg: 'rgba(245,158,11,0.08)', color: '#b45309', border: 'rgba(245,158,11,0.25)', label: 'Waiting' },
  notified: { bg: 'rgba(59,130,246,0.08)', color: '#2563eb', border: 'rgba(59,130,246,0.25)', label: 'Notified' },
  seated:   { bg: 'rgba(34,197,94,0.08)',  color: '#16a34a', border: 'rgba(34,197,94,0.25)',  label: 'Seated' },
  left:     { bg: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)', label: 'Left' },
};

const OCCASIONS = [
  { value: '', label: 'None' },
  { value: 'birthday', label: 'Birthday', icon: Gift },
  { value: 'anniversary', label: 'Anniversary', icon: Heart },
  { value: 'business', label: 'Business', icon: Briefcase },
  { value: 'other', label: 'Other', icon: Star },
];

const SMS_STATUSES = ['sent', 'delivered', 'read'];

const HOURS = Array.from({ length: 13 }, (_, i) => i + 11); // 11am to 11pm

const StatusBadge = ({ status, styles }) => {
  const s = styles[status] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 99, fontSize: '0.72rem', fontWeight: 650,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, color = 'var(--primary)', sub }) => (
  <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
    <div style={{
      width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${color}14`, color,
    }}>
      <Icon size={20} />
    </div>
    <div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

const Avatar = ({ name, size = 36 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: size * 0.38,
  }}>
    {name?.charAt(0)?.toUpperCase() || '?'}
  </div>
);

const SmsIndicator = ({ status }) => {
  if (!status) return null;
  const colors = { sent: '#94a3b8', delivered: '#3b82f6', read: '#22c55e' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', color: colors[status] || '#94a3b8' }}>
      {status === 'read' ? <CheckCircle2 size={11} /> : status === 'delivered' ? <Check size={11} /> : <Send size={11} />}
      {status}
    </span>
  );
};

// ── Main Component ──────────────────────────────────────────────
const Reservations = () => {
  const {
    reservations, waitlist, floorPlans, guests, settings,
    addReservation, editReservation, cancelReservation,
    addWaitlistEntry, notifyWaitlist, seatWaitlist, removeWaitlist,
  } = useApp();

  const [activeTab, setActiveTab] = useState('reservations');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [showAddRes, setShowAddRes] = useState(false);
  const [editingRes, setEditingRes] = useState(null);
  const [showAddWait, setShowAddWait] = useState(false);
  const [seatModal, setSeatModal] = useState(null);
  const [smsThread, setSmsThread] = useState(null);
  const [removeModal, setRemoveModal] = useState(null);
  const [, setTick] = useState(0);

  // Live timer for waitlist
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const tables = useMemo(() => floorPlans?.tables || [], [floorPlans]);
  const totalSeats = useMemo(() => tables.reduce((s, t) => s + (t.seats || t.capacity || 4), 0), [tables]);

  // Reservation settings with defaults
  const resSets = useMemo(() => ({
    maxPartySize: settings?.reservationMaxParty || 20,
    advanceDays: settings?.reservationAdvanceDays || 30,
    slotDuration: settings?.reservationSlotDuration || 90,
    pacingLimit: settings?.reservationPacingLimit || 40,
    depositRequired: settings?.reservationDepositRequired || false,
    depositAmount: settings?.reservationDepositAmount || 50,
    cancellationPolicy: settings?.reservationCancellationPolicy || 'Cancellations must be made at least 24 hours in advance.',
    noShowFee: settings?.reservationNoShowFee || 25,
    smsConfirmation: settings?.smsConfirmation || 'Hi {name}, your reservation at Kitchgoo for {party} on {date} at {time} is confirmed!',
    smsReminder: settings?.smsReminder || 'Reminder: Your reservation at Kitchgoo is tomorrow at {time}. See you then!',
    smsReady: settings?.smsReady || 'Your table is ready at Kitchgoo! Please head to the host stand.',
  }), [settings]);

  // ── Reservations for selected date ──────────────────────────
  const dayReservations = useMemo(() => {
    return (reservations || [])
      .filter(r => r.date === selectedDate)
      .filter(r => !search || r.guestName?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }, [reservations, selectedDate, search]);

  const resStats = useMemo(() => {
    const day = dayReservations;
    return {
      total: day.length,
      upcoming: day.filter(r => r.status === 'confirmed').length,
      seated: day.filter(r => r.status === 'seated').length,
      noShows: day.filter(r => r.status === 'no-show').length,
    };
  }, [dayReservations]);

  // Capacity per hour slot
  const slotCapacity = useMemo(() => {
    const map = {};
    HOURS.forEach(h => {
      const hStr = String(h).padStart(2, '0');
      const seated = dayReservations.filter(r => {
        if (r.status === 'cancelled') return false;
        const [rh] = (r.time || '00:00').split(':');
        const dur = r.duration || resSets.slotDuration;
        const startH = +rh;
        const endH = startH + dur / 60;
        return h >= startH && h < endH;
      }).reduce((s, r) => s + (r.partySize || 2), 0);
      map[h] = { seated, total: totalSeats || 40, pacing: resSets.pacingLimit };
    });
    return map;
  }, [dayReservations, totalSeats, resSets]);

  // ── Waitlist ────────────────────────────────────────────────
  const activeWaitlist = useMemo(() => {
    return (waitlist || [])
      .filter(w => w.status === 'waiting' || w.status === 'notified')
      .sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
  }, [waitlist]);

  const allWaitlistToday = useMemo(() => {
    const today = todayStr();
    return (waitlist || []).filter(w => (w.addedAt || '').startsWith(today));
  }, [waitlist]);

  const waitStats = useMemo(() => {
    const waits = allWaitlistToday.filter(w => w.status === 'seated' && w.addedAt && w.seatedAt)
      .map(w => Math.floor((new Date(w.seatedAt) - new Date(w.addedAt)) / 60000));
    const avgWait = waits.length ? Math.round(waits.reduce((s, v) => s + v, 0) / waits.length) : 0;
    const longest = waits.length ? Math.max(...waits) : 0;
    const walkAways = allWaitlistToday.filter(w => w.status === 'left').length;
    const walkRate = allWaitlistToday.length ? Math.round((walkAways / allWaitlistToday.length) * 100) : 0;
    return { size: activeWaitlist.length, avgWait, longest, walkRate };
  }, [activeWaitlist, allWaitlistToday]);

  // Predictive wait time
  const predictWait = useCallback((partySize) => {
    const avgTurn = 55; // minutes avg turn time
    const tablesForSize = tables.filter(t => (t.seats || t.capacity || 4) >= partySize);
    const seatedOnThem = dayReservations.filter(r => r.status === 'seated' && tablesForSize.some(t => t.id === r.tableId));
    if (tablesForSize.length === 0) return avgTurn;
    const occupiedRatio = seatedOnThem.length / tablesForSize.length;
    const waitingAhead = activeWaitlist.filter(w => (w.partySize || 2) <= partySize).length;
    return Math.max(5, Math.round(avgTurn * occupiedRatio + waitingAhead * 12));
  }, [tables, dayReservations, activeWaitlist]);

  // ── Date nav ───────────────────────────────────────────────
  const shiftDate = (dir) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // ── Tabs ──────────────────────────────────────────────────
  const tabs = [
    { key: 'reservations', label: 'Reservations', icon: CalendarDays },
    { key: 'waitlist', label: 'Waitlist', icon: Users },
    { key: 'settings', label: 'Settings', icon: Settings2 },
  ];

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Reservations & Waitlist</h1>
        {activeTab === 'reservations' && (
          <button className="btn btn-primary" onClick={() => setShowAddRes(true)}>
            <Plus size={15} /> New Reservation
          </button>
        )}
        {activeTab === 'waitlist' && (
          <button className="btn btn-primary" onClick={() => setShowAddWait(true)}>
            <UserPlus size={15} /> Add to Waitlist
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-subtle)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === t.key ? 700 : 500, fontSize: '0.85rem',
            color: activeTab === t.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── RESERVATIONS TAB ───────────────────────────────── */}
      {activeTab === 'reservations' && (
        <div>
          {/* Date Picker & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => shiftDate(-1)}><ChevronLeft size={14} /></button>
              <input type="date" className="input-field" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                style={{ width: 160, padding: '6px 10px', fontSize: '0.82rem' }} />
              <button className="btn btn-secondary btn-sm" onClick={() => shiftDate(1)}><ChevronRight size={14} /></button>
              {selectedDate !== todayStr() && (
                <button className="btn btn-sm" onClick={() => setSelectedDate(todayStr())}
                  style={{ fontSize: '0.72rem', color: 'var(--primary)', background: 'var(--primary-light)', border: 'none' }}>
                  Today
                </button>
              )}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input-field" placeholder="Search guests..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 30, width: '100%' }} />
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard icon={CalendarDays} label="Total Reservations" value={resStats.total} color="var(--primary)" />
            <StatCard icon={Clock} label="Upcoming" value={resStats.upcoming} color="var(--accent-blue)" />
            <StatCard icon={Armchair} label="Seated" value={resStats.seated} color="var(--success)" />
            <StatCard icon={AlertTriangle} label="No-Shows" value={resStats.noShows} color="var(--danger)" />
          </div>

          {/* Timeline View */}
          <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Timeline View</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{fmtDate(selectedDate)}</span>
            </div>
            <div style={{ overflowX: 'auto', padding: '12px 0' }}>
              <div style={{ display: 'flex', minWidth: HOURS.length * 120 }}>
                {HOURS.map(h => {
                  const cap = slotCapacity[h] || { seated: 0, total: 40 };
                  const pct = cap.total > 0 ? Math.min(100, Math.round((cap.seated / cap.total) * 100)) : 0;
                  const slotRes = dayReservations.filter(r => {
                    const [rh] = (r.time || '00:00').split(':');
                    return +rh === h && r.status !== 'cancelled';
                  });
                  return (
                    <div key={h} style={{ flex: '0 0 120px', borderRight: '1px solid var(--border-subtle)', padding: '0 8px' }}>
                      <div style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        {h > 12 ? h - 12 : h}{h >= 12 ? 'PM' : 'AM'}
                      </div>
                      {/* Capacity bar */}
                      <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', marginBottom: 6 }}>
                        <div style={{
                          height: '100%', borderRadius: 2, transition: 'width 0.3s',
                          width: `${pct}%`,
                          background: pct > 85 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)',
                        }} />
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                        {cap.seated}/{cap.total} seats
                      </div>
                      {slotRes.map(r => (
                        <div key={r.id} onClick={() => setEditingRes(r)} style={{
                          padding: '6px 8px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                          background: STATUS_STYLES[r.status]?.bg || '#f1f5f9',
                          border: `1px solid ${STATUS_STYLES[r.status]?.border || '#e2e8f0'}`,
                          transition: 'transform 0.1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                            {r.guestName}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                            <Users size={9} /> {r.partySize}
                            <span style={{ margin: '0 2px' }}>|</span>
                            {r.tableId ? tables.find(t => t.id === r.tableId)?.label || r.tableId : 'No table'}
                          </div>
                          <div style={{ marginTop: 3 }}>
                            <StatusBadge status={r.status} styles={STATUS_STYLES} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Reservation Cards */}
          <div style={{ display: 'grid', gap: 10 }}>
            {dayReservations.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <CalendarDays size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600 }}>No reservations for {fmtDate(selectedDate)}</div>
              </div>
            )}
            {dayReservations.map(r => (
              <div key={r.id} className="card" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                borderLeft: `3px solid ${STATUS_STYLES[r.status]?.color || '#94a3b8'}`,
              }}>
                <Avatar name={r.guestName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{r.guestName}</span>
                    <StatusBadge status={r.status} styles={STATUS_STYLES} />
                    {r.occasion && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                        {OCCASIONS.find(o => o.value === r.occasion)?.label || r.occasion}
                      </span>
                    )}
                    {r.depositRequired && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <DollarSign size={10} /> Deposit ${r.depositAmount || resSets.depositAmount}
                        {r.status === 'no-show' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}> (No-show fee applies)</span>}
                      </span>
                    )}
                    <SmsIndicator status={r.smsStatus} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {r.partySize}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {fmtTime12(r.time || '12:00')}</span>
                    {r.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {r.phone}</span>}
                    {r.tableId && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Armchair size={12} /> {tables.find(t => t.id === r.tableId)?.label || `Table ${r.tableId}`}
                      </span>
                    )}
                    {r.duration && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.duration} min</span>}
                  </div>
                  {r.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{r.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {r.status === 'confirmed' && (
                    <button className="btn btn-success btn-sm" onClick={() => editReservation(r.id, { status: 'seated' })}>
                      <Armchair size={13} /> Seat
                    </button>
                  )}
                  {r.status === 'confirmed' && (
                    <button className="btn btn-sm" onClick={() => editReservation(r.id, { status: 'no-show' })}
                      style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <Ban size={13} />
                    </button>
                  )}
                  {r.status === 'seated' && (
                    <button className="btn btn-sm" onClick={() => editReservation(r.id, { status: 'completed' })}
                      style={{ background: 'rgba(100,116,139,0.08)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      <Check size={13} /> Complete
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingRes(r)}><Edit2 size={13} /></button>
                  {r.status !== 'cancelled' && r.status !== 'completed' && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancelReservation(r.id)}><X size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── WAITLIST TAB ───────────────────────────────────── */}
      {activeTab === 'waitlist' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard icon={Users} label="Current Waitlist" value={waitStats.size} color="var(--warning)" />
            <StatCard icon={Timer} label="Avg Wait Today" value={`${waitStats.avgWait}m`} color="var(--accent-blue)" />
            <StatCard icon={TrendingUp} label="Longest Wait" value={`${waitStats.longest}m`} color="var(--primary)" />
            <StatCard icon={AlertTriangle} label="Walk-Away Rate" value={`${waitStats.walkRate}%`} color="var(--danger)" />
          </div>

          {/* Active Queue */}
          <div style={{ display: 'grid', gap: 10 }}>
            {activeWaitlist.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Users size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div style={{ fontWeight: 600 }}>Waitlist is empty</div>
              </div>
            )}
            {activeWaitlist.map((w, idx) => {
              const waitMins = minutesSince(w.addedAt);
              const predicted = predictWait(w.partySize || 2);
              const overQuoted = w.quotedTime && waitMins > w.quotedTime;
              return (
                <div key={w.id} className="card" style={{
                  padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                  borderLeft: `3px solid ${WAITLIST_STYLES[w.status]?.color || '#f59e0b'}`,
                }}>
                  {/* Position */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'var(--primary-light)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.95rem',
                  }}>
                    #{idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{w.guestName}</span>
                      <StatusBadge status={w.status} styles={WAITLIST_STYLES} />
                      {w.smsStatus && <SmsIndicator status={w.smsStatus} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {w.partySize || 2}</span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        color: overQuoted ? 'var(--danger)' : undefined,
                        fontWeight: overQuoted ? 700 : undefined,
                      }}>
                        <Timer size={12} /> {waitMins}m waited
                        {overQuoted && <AlertTriangle size={10} />}
                      </span>
                      {w.quotedTime && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          (Quoted: {w.quotedTime}m)
                        </span>
                      )}
                      {w.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {w.phone}</span>}
                      <span style={{ fontSize: '0.68rem', color: 'var(--accent-blue)', fontStyle: 'italic' }}>
                        Est. {predicted}m
                      </span>
                    </div>
                    {w.seatingPreference && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>Pref: {w.seatingPreference}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    {w.status === 'waiting' && (
                      <button className="btn btn-sm" onClick={() => {
                        notifyWaitlist(w.id);
                      }} style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--accent-blue)', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <Bell size={13} /> Notify
                      </button>
                    )}
                    {(w.status === 'waiting' || w.status === 'notified') && (
                      <button className="btn btn-success btn-sm" onClick={() => setSeatModal(w)}>
                        <Armchair size={13} /> Seat
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={() => setSmsThread(w)}
                      style={{ background: 'rgba(124,58,237,0.08)', color: 'var(--primary)', border: '1px solid rgba(124,58,237,0.2)' }}>
                      <MessageCircle size={13} />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setRemoveModal(w)}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Past waitlist entries today */}
          {allWaitlistToday.filter(w => w.status === 'seated' || w.status === 'left').length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>Completed Today</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {allWaitlistToday.filter(w => w.status === 'seated' || w.status === 'left').map(w => (
                  <div key={w.id} className="card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.7 }}>
                    <Avatar name={w.guestName} size={28} />
                    <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>{w.guestName}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}><Users size={11} /> {w.partySize || 2}</span>
                    <StatusBadge status={w.status} styles={WAITLIST_STYLES} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB ──────────────────────────────────── */}
      {activeTab === 'settings' && <ReservationSettings settings={resSets} />}

      {/* ─── MODALS ─────────────────────────────────────────── */}
      {showAddRes && (
        <AddReservationModal
          onClose={() => setShowAddRes(false)}
          onSave={async (data) => { await addReservation(data); setShowAddRes(false); }}
          tables={tables}
          guests={guests}
          resSets={resSets}
        />
      )}
      {editingRes && (
        <EditReservationModal
          reservation={editingRes}
          onClose={() => setEditingRes(null)}
          onSave={async (data) => { await editReservation(editingRes.id, data); setEditingRes(null); }}
          onCancel={async () => { await cancelReservation(editingRes.id); setEditingRes(null); }}
          tables={tables}
          resSets={resSets}
        />
      )}
      {showAddWait && (
        <AddWaitlistModal
          onClose={() => setShowAddWait(false)}
          onSave={async (data) => { await addWaitlistEntry(data); setShowAddWait(false); }}
          predictWait={predictWait}
        />
      )}
      {seatModal && (
        <SeatWaitlistModal
          entry={seatModal}
          tables={tables}
          onClose={() => setSeatModal(null)}
          onSeat={async (tableId) => {
            await seatWaitlist(seatModal.id);
            setSeatModal(null);
          }}
        />
      )}
      {smsThread && (
        <SmsThreadModal entry={smsThread} onClose={() => setSmsThread(null)} resSets={resSets} />
      )}
      {removeModal && (
        <RemoveWaitlistModal
          entry={removeModal}
          onClose={() => setRemoveModal(null)}
          onRemove={async (reason) => { await removeWaitlist(removeModal.id); setRemoveModal(null); }}
        />
      )}
    </div>
  );
};

// ── Add Reservation Modal ───────────────────────────────────────
const AddReservationModal = ({ onClose, onSave, tables, guests, resSets }) => {
  const [form, setForm] = useState({
    guestName: '', phone: '', email: '', partySize: 2,
    date: todayStr(), time: '19:00', duration: resSets.slotDuration,
    tableId: '', notes: '', occasion: '', depositRequired: resSets.depositRequired,
    depositAmount: resSets.depositAmount,
  });
  const [guestSearch, setGuestSearch] = useState('');
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  const filteredGuests = useMemo(() => {
    if (!guestSearch) return [];
    return (guests || []).filter(g => g.name?.toLowerCase().includes(guestSearch.toLowerCase())).slice(0, 5);
  }, [guestSearch, guests]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.guestName || !form.date || !form.time) return;
    onSave({
      ...form,
      partySize: +form.partySize,
      duration: +form.duration,
      depositAmount: +form.depositAmount,
      status: 'confirmed',
      smsStatus: 'sent',
      createdAt: new Date().toISOString(),
    });
  };

  const inputStyle = { width: '100%' };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };

  return (
    <Modal title="New Reservation" onClose={onClose} wide>
      <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {/* Guest search */}
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <label style={labelStyle}>Guest Name *</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input-field" style={{ ...inputStyle, paddingLeft: 30 }}
              placeholder="Search existing guests or type new name..."
              value={guestSearch || form.guestName}
              onChange={e => { setGuestSearch(e.target.value); set('guestName', e.target.value); setShowGuestDropdown(true); }}
              onFocus={() => setShowGuestDropdown(true)}
            />
          </div>
          {showGuestDropdown && filteredGuests.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'white', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid var(--border-subtle)', maxHeight: 180, overflowY: 'auto',
            }}>
              {filteredGuests.map(g => (
                <div key={g.id} onClick={() => {
                  set('guestName', g.name);
                  set('phone', g.phone || '');
                  set('email', g.email || '');
                  setGuestSearch('');
                  setShowGuestDropdown(false);
                }} style={{
                  padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem',
                }} onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Avatar name={g.name} size={26} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    {g.phone && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{g.phone}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input className="input-field" style={inputStyle} placeholder="+1 (555) 123-4567" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input className="input-field" style={inputStyle} placeholder="guest@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Party Size *</label>
            <input className="input-field" style={inputStyle} type="number" min={1} max={resSets.maxPartySize}
              value={form.partySize} onChange={e => set('partySize', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input className="input-field" style={inputStyle} type="number" min={30} step={15}
              value={form.duration} onChange={e => set('duration', e.target.value)} />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input className="input-field" style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Time *</label>
            <input className="input-field" style={inputStyle} type="time" value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Table Preference</label>
          <select className="input-field" style={inputStyle} value={form.tableId} onChange={e => set('tableId', e.target.value)}>
            <option value="">Auto-assign</option>
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.label || t.name || `Table ${t.id}`} ({t.seats || t.capacity || 4} seats)</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Occasion</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {OCCASIONS.map(o => (
              <button key={o.value} onClick={() => set('occasion', o.value)} className="btn btn-sm" style={{
                background: form.occasion === o.value ? 'var(--primary-light)' : 'transparent',
                color: form.occasion === o.value ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${form.occasion === o.value ? 'var(--primary)' : 'var(--border-subtle)'}`,
                fontWeight: form.occasion === o.value ? 700 : 500,
              }}>
                {o.icon && <o.icon size={12} />} {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Special Requests</label>
          <textarea className="input-field" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            placeholder="Allergies, high chair, window seat..."
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        {/* Deposit */}
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 12,
          background: form.depositRequired ? 'rgba(245,158,11,0.06)' : '#f8fafc',
          border: `1px solid ${form.depositRequired ? 'rgba(245,158,11,0.2)' : 'var(--border-subtle)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={16} style={{ color: 'var(--warning)' }} />
              <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Require Deposit</span>
            </div>
            <label style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.depositRequired} onChange={e => set('depositRequired', e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              <div style={{
                width: 40, height: 22, borderRadius: 11, transition: 'background 0.2s',
                background: form.depositRequired ? 'var(--primary)' : '#cbd5e1',
                position: 'relative',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2, transition: 'left 0.2s',
                  left: form.depositRequired ? 20 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </label>
          </div>
          {form.depositRequired && (
            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>Deposit Amount ($)</label>
              <input className="input-field" type="number" style={{ width: 120 }}
                value={form.depositAmount} onChange={e => set('depositAmount', e.target.value)} />
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.guestName || !form.date || !form.time}>
          <CalendarDays size={14} /> Create Reservation
        </button>
      </div>
    </Modal>
  );
};

// ── Edit Reservation Modal ──────────────────────────────────────
const EditReservationModal = ({ reservation, onClose, onSave, onCancel, tables, resSets }) => {
  const [form, setForm] = useState({ ...reservation });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...form,
      partySize: +form.partySize,
      duration: +form.duration,
    });
  };

  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };

  return (
    <Modal title={`Edit Reservation - ${reservation.guestName}`} onClose={onClose} wide>
      <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
        {/* Status quick actions */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {['confirmed', 'seated', 'completed', 'no-show'].map(s => (
            <button key={s} className="btn btn-sm" onClick={() => set('status', s)} style={{
              background: form.status === s ? STATUS_STYLES[s]?.bg : 'transparent',
              color: form.status === s ? STATUS_STYLES[s]?.color : 'var(--text-muted)',
              border: `1px solid ${form.status === s ? STATUS_STYLES[s]?.border : 'var(--border-subtle)'}`,
              fontWeight: form.status === s ? 700 : 500,
            }}>
              {STATUS_STYLES[s]?.label}
            </button>
          ))}
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Guest Name</label>
            <input className="input-field" style={{ width: '100%' }} value={form.guestName || ''} onChange={e => set('guestName', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input className="input-field" style={{ width: '100%' }} value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Party Size</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={1} max={resSets.maxPartySize}
              value={form.partySize || 2} onChange={e => set('partySize', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={30} step={15}
              value={form.duration || resSets.slotDuration} onChange={e => set('duration', e.target.value)} />
          </div>
        </div>

        <div style={rowStyle}>
          <div>
            <label style={labelStyle}>Date</label>
            <input className="input-field" type="date" style={{ width: '100%' }} value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input className="input-field" type="time" style={{ width: '100%' }} value={form.time || ''} onChange={e => set('time', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Table</label>
          <select className="input-field" style={{ width: '100%' }} value={form.tableId || ''} onChange={e => set('tableId', e.target.value)}>
            <option value="">No table</option>
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.label || t.name || `Table ${t.id}`} ({t.seats || t.capacity || 4} seats)</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Occasion</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {OCCASIONS.map(o => (
              <button key={o.value} onClick={() => set('occasion', o.value)} className="btn btn-sm" style={{
                background: form.occasion === o.value ? 'var(--primary-light)' : 'transparent',
                color: form.occasion === o.value ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${form.occasion === o.value ? 'var(--primary)' : 'var(--border-subtle)'}`,
                fontWeight: form.occasion === o.value ? 700 : 500,
              }}>
                {o.icon && <o.icon size={12} />} {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea className="input-field" style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
            value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>

        {/* SMS Status */}
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border-subtle)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
            <MessageSquare size={14} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontWeight: 600 }}>SMS Status:</span>
            <SmsIndicator status={form.smsStatus || 'sent'} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {SMS_STATUSES.map(s => (
                <button key={s} className="btn btn-sm" onClick={() => set('smsStatus', s)} style={{
                  fontSize: '0.65rem', padding: '2px 8px',
                  background: form.smsStatus === s ? 'var(--primary-light)' : 'transparent',
                  color: form.smsStatus === s ? 'var(--primary)' : 'var(--text-muted)',
                  border: `1px solid ${form.smsStatus === s ? 'var(--primary)' : 'var(--border-subtle)'}`,
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deposit / No-show fee */}
        {form.depositRequired && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 12,
            background: form.status === 'no-show' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
            border: `1px solid ${form.status === 'no-show' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
              <DollarSign size={14} style={{ color: form.status === 'no-show' ? 'var(--danger)' : 'var(--warning)' }} />
              <span style={{ fontWeight: 600 }}>
                Deposit: ${form.depositAmount || resSets.depositAmount}
                {form.status === 'no-show' && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>No-show fee: ${resSets.noShowFee}</span>}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-danger" onClick={onCancel} disabled={form.status === 'cancelled'}>
          <X size={14} /> Cancel Reservation
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleSave}>
            <Check size={14} /> Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ── Add Waitlist Modal ──────────────────────────────────────────
const AddWaitlistModal = ({ onClose, onSave, predictWait }) => {
  const [form, setForm] = useState({
    guestName: '', phone: '', partySize: 2, seatingPreference: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const predicted = predictWait(+form.partySize || 2);

  const handleSubmit = () => {
    if (!form.guestName) return;
    onSave({
      ...form,
      partySize: +form.partySize,
      status: 'waiting',
      addedAt: new Date().toISOString(),
      quotedTime: predicted,
    });
  };

  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

  return (
    <Modal title="Add to Waitlist" onClose={onClose}>
      <div className="modal-body">
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Guest Name *</label>
          <input className="input-field" style={{ width: '100%' }} placeholder="Guest name"
            value={form.guestName} onChange={e => set('guestName', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input className="input-field" style={{ width: '100%' }} placeholder="+1 (555) 000-0000"
              value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Party Size</label>
            <input className="input-field" style={{ width: '100%' }} type="number" min={1} max={20}
              value={form.partySize} onChange={e => set('partySize', e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Seating Preference</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Any', 'Indoor', 'Outdoor', 'Bar', 'Booth', 'Window'].map(p => (
              <button key={p} className="btn btn-sm" onClick={() => set('seatingPreference', p === 'Any' ? '' : p)} style={{
                background: (form.seatingPreference === p || (p === 'Any' && !form.seatingPreference)) ? 'var(--primary-light)' : 'transparent',
                color: (form.seatingPreference === p || (p === 'Any' && !form.seatingPreference)) ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${(form.seatingPreference === p || (p === 'Any' && !form.seatingPreference)) ? 'var(--primary)' : 'var(--border-subtle)'}`,
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {/* Predicted wait */}
        <div style={{
          padding: '14px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Timer size={20} style={{ color: 'var(--accent-blue)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-blue)' }}>~{predicted} min</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Estimated wait for party of {form.partySize}</div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.guestName}>
          <UserPlus size={14} /> Add to Waitlist
        </button>
      </div>
    </Modal>
  );
};

// ── Seat Waitlist Modal ─────────────────────────────────────────
const SeatWaitlistModal = ({ entry, tables, onClose, onSeat }) => {
  const [selectedTable, setSelectedTable] = useState('');

  return (
    <Modal title={`Seat ${entry.guestName}`} onClose={onClose}>
      <div className="modal-body">
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <Users size={14} /> Party of {entry.partySize || 2}
            <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>|</span>
            <Timer size={14} /> Waited {minutesSince(entry.addedAt)}m
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Assign Table</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {tables.map(t => {
            const fits = (t.seats || t.capacity || 4) >= (entry.partySize || 2);
            return (
              <button key={t.id} onClick={() => setSelectedTable(t.id)} style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                background: selectedTable === t.id ? 'var(--primary-light)' : fits ? '#f8fafc' : '#fef2f2',
                border: `1.5px solid ${selectedTable === t.id ? 'var(--primary)' : fits ? 'var(--border-subtle)' : 'rgba(239,68,68,0.2)'}`,
                color: selectedTable === t.id ? 'var(--primary)' : fits ? 'var(--text-primary)' : 'var(--danger)',
                opacity: fits ? 1 : 0.5, transition: 'all 0.15s',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{t.label || t.name || `Table ${t.id}`}</div>
                <div style={{ fontSize: '0.68rem', color: 'inherit', opacity: 0.7 }}>{t.seats || t.capacity || 4} seats</div>
              </button>
            );
          })}
          {tables.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No tables configured. Guest will be seated without table assignment.
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-success" onClick={() => onSeat(selectedTable)}>
          <Armchair size={14} /> Seat Guest
        </button>
      </div>
    </Modal>
  );
};

// ── SMS Thread Modal ────────────────────────────────────────────
const SmsThreadModal = ({ entry, onClose, resSets }) => {
  const messages = [
    { from: 'system', text: resSets.smsReady.replace('{name}', entry.guestName), time: entry.notifiedAt || new Date().toISOString(), status: 'delivered' },
  ];
  if (entry.status === 'notified' || entry.status === 'seated') {
    messages.push({ from: 'guest', text: 'On our way!', time: new Date(new Date(entry.notifiedAt || Date.now()).getTime() + 120000).toISOString() });
  }
  if (entry.status === 'seated') {
    messages.push({ from: 'system', text: 'Great, see you soon!', time: new Date(new Date(entry.notifiedAt || Date.now()).getTime() + 180000).toISOString(), status: 'read' });
  }

  return (
    <Modal title={`SMS - ${entry.guestName}`} onClose={onClose}>
      <div className="modal-body">
        <div style={{ padding: '8px 0' }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: m.from === 'system' ? 'flex-end' : 'flex-start',
              marginBottom: 10,
            }}>
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                background: m.from === 'system' ? 'var(--primary)' : '#f1f5f9',
                color: m.from === 'system' ? '#fff' : 'var(--text-primary)',
                borderBottomRightRadius: m.from === 'system' ? 4 : 14,
                borderBottomLeftRadius: m.from === 'guest' ? 4 : 14,
              }}>
                <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>{m.text}</div>
                <div style={{
                  fontSize: '0.62rem', marginTop: 4, opacity: 0.7,
                  display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
                }}>
                  {new Date(m.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {m.status && <SmsIndicator status={m.status} />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          display: 'flex', gap: 8, padding: '12px 0 0', borderTop: '1px solid var(--border-subtle)',
        }}>
          <input className="input-field" style={{ flex: 1 }} placeholder="Type a message..." />
          <button className="btn btn-primary btn-sm"><Send size={14} /></button>
        </div>
      </div>
    </Modal>
  );
};

// ── Remove Waitlist Modal ───────────────────────────────────────
const RemoveWaitlistModal = ({ entry, onClose, onRemove }) => {
  const [reason, setReason] = useState('');
  const reasons = ['Left voluntarily', 'No answer', 'Too long wait', 'Found elsewhere', 'Other'];

  return (
    <Modal title={`Remove ${entry.guestName}`} onClose={onClose}>
      <div className="modal-body">
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
          Select a reason for removing this guest from the waitlist.
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {reasons.map(r => (
            <button key={r} onClick={() => setReason(r)} style={{
              padding: '10px 14px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
              background: reason === r ? 'rgba(239,68,68,0.06)' : '#f8fafc',
              border: `1.5px solid ${reason === r ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
              color: reason === r ? 'var(--danger)' : 'var(--text-primary)',
              fontWeight: reason === r ? 600 : 400, fontSize: '0.82rem',
              transition: 'all 0.15s',
            }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Keep on List</button>
        <button className="btn btn-danger" onClick={() => onRemove(reason)} disabled={!reason}>
          <Trash2 size={14} /> Remove
        </button>
      </div>
    </Modal>
  );
};

// ── Settings Tab Component ──────────────────────────────────────
const ReservationSettings = ({ settings: resSets }) => {
  const { settings, editReservation } = useApp();
  const [local, setLocal] = useState({
    maxPartySize: resSets.maxPartySize,
    advanceDays: resSets.advanceDays,
    slotDuration: resSets.slotDuration,
    pacingLimit: resSets.pacingLimit,
    depositRequired: resSets.depositRequired,
    depositAmount: resSets.depositAmount,
    cancellationPolicy: resSets.cancellationPolicy,
    noShowFee: resSets.noShowFee,
    smsConfirmation: resSets.smsConfirmation,
    smsReminder: resSets.smsReminder,
    smsReady: resSets.smsReady,
  });
  const set = (k, v) => setLocal(f => ({ ...f, [k]: v }));

  const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const sectionStyle = { marginBottom: 24 };
  const sectionTitleStyle = { fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 };

  return (
    <div>
      {/* Reservation Settings */}
      <div className="card" style={{ padding: '20px 22px', ...sectionStyle }}>
        <div style={sectionTitleStyle}><CalendarDays size={18} style={{ color: 'var(--primary)' }} /> Reservation Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={labelStyle}>Max Party Size</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={1} max={50}
              value={local.maxPartySize} onChange={e => set('maxPartySize', +e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Advance Booking (days)</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={1} max={365}
              value={local.advanceDays} onChange={e => set('advanceDays', +e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Slot Duration (min)</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={15} step={15}
              value={local.slotDuration} onChange={e => set('slotDuration', +e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Pacing Limit (covers/slot)</label>
            <input className="input-field" type="number" style={{ width: '100%' }} min={1}
              value={local.pacingLimit} onChange={e => set('pacingLimit', +e.target.value)} />
          </div>
        </div>
      </div>

      {/* Deposit Settings */}
      <div className="card" style={{ padding: '20px 22px', ...sectionStyle }}>
        <div style={sectionTitleStyle}><DollarSign size={18} style={{ color: 'var(--warning)' }} /> Deposit Settings</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>Require Deposit</span>
          <label style={{ position: 'relative', width: 40, height: 22, cursor: 'pointer' }}>
            <input type="checkbox" checked={local.depositRequired} onChange={e => set('depositRequired', e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{
              width: 40, height: 22, borderRadius: 11, transition: 'background 0.2s',
              background: local.depositRequired ? 'var(--primary)' : '#cbd5e1',
              position: 'relative',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 2, transition: 'left 0.2s',
                left: local.depositRequired ? 20 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </label>
        </div>
        {local.depositRequired && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Deposit Amount ($)</label>
              <input className="input-field" type="number" style={{ width: '100%' }} min={0}
                value={local.depositAmount} onChange={e => set('depositAmount', +e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>No-Show Fee ($)</label>
              <input className="input-field" type="number" style={{ width: '100%' }} min={0}
                value={local.noShowFee} onChange={e => set('noShowFee', +e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <label style={labelStyle}>Cancellation Policy</label>
          <textarea className="input-field" style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
            value={local.cancellationPolicy} onChange={e => set('cancellationPolicy', e.target.value)} />
        </div>
      </div>

      {/* SMS Templates */}
      <div className="card" style={{ padding: '20px 22px', ...sectionStyle }}>
        <div style={sectionTitleStyle}><MessageSquare size={18} style={{ color: 'var(--accent-blue)' }} /> SMS Templates</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
          Variables: {'{name}'}, {'{party}'}, {'{date}'}, {'{time}'}, {'{restaurant}'}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={labelStyle}>Confirmation Message</label>
            <textarea className="input-field" style={{ width: '100%', minHeight: 50, resize: 'vertical' }}
              value={local.smsConfirmation} onChange={e => set('smsConfirmation', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Day-Before Reminder</label>
            <textarea className="input-field" style={{ width: '100%', minHeight: 50, resize: 'vertical' }}
              value={local.smsReminder} onChange={e => set('smsReminder', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Table Ready Notification</label>
            <textarea className="input-field" style={{ width: '100%', minHeight: 50, resize: 'vertical' }}
              value={local.smsReady} onChange={e => set('smsReady', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Widget Preview */}
      <div className="card" style={{ padding: '20px 22px', ...sectionStyle }}>
        <div style={sectionTitleStyle}><Eye size={18} style={{ color: 'var(--success)' }} /> Booking Widget Preview</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          This is how the reservation widget would look on your restaurant website.
        </div>
        <div style={{
          maxWidth: 380, margin: '0 auto', padding: 24, borderRadius: 20,
          background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}>
          {/* Widget header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, margin: '0 auto 10px',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '1.1rem',
            }}>K</div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Reserve at Kitchgoo</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Book your perfect dining experience</div>
          </div>
          {/* Mock form */}
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Date</div>
              <div style={{
                padding: '10px 12px', borderRadius: 10, background: '#fff',
                border: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <CalendarDays size={14} style={{ color: 'var(--primary)' }} />
                {fmtDate(new Date())}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Time</div>
                <div style={{
                  padding: '10px 12px', borderRadius: 10, background: '#fff',
                  border: '1px solid var(--border-subtle)', fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Clock size={14} style={{ color: 'var(--primary)' }} /> 7:00 PM
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Guests</div>
                <div style={{
                  padding: '10px 12px', borderRadius: 10, background: '#fff',
                  border: '1px solid var(--border-subtle)', fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Users size={14} style={{ color: 'var(--primary)' }} /> 2 guests
                </div>
              </div>
            </div>
            {/* Available times mock */}
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Available Times</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM'].map((t, i) => (
                  <div key={t} style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
                    background: i === 1 ? 'var(--primary)' : '#fff', color: i === 1 ? '#fff' : 'var(--primary)',
                    border: `1px solid ${i === 1 ? 'var(--primary)' : 'rgba(124,58,237,0.25)'}`,
                    cursor: 'pointer',
                  }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <button style={{
              padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff', fontWeight: 700, fontSize: '0.88rem',
              boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
            }}>
              Confirm Reservation
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            Powered by Kitchgoo
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reservations;
