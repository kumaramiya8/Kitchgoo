import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin, CheckCircle, XCircle, Clock, AlertTriangle,
  Navigation, Loader2, Calendar as CalIcon,
  LogIn, LogOut, User, Shield,
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { usePermissions } from '../db/usePermissions';
import AttendanceCalendar from '../components/AttendanceCalendar';
import {
  haversine, localDay, recordDay, recordTs, fmtTime,
  pairSessions, totalHours, isClockedIn as calcClockedIn,
} from '../lib/attendance';

// ── Geo status pill ─────────────────────────────────────────
const GeoPill = ({ state, distance, radius }) => {
  const map = {
    idle:      { icon: <Navigation size={13} />, label: 'Location will be checked on tap', color: 'var(--text-muted)', bg: 'var(--border-subtle)' },
    loading:   { icon: <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />, label: 'Detecting location…', color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
    inside:    { icon: <CheckCircle size={13} />, label: `${Math.round(distance)} m away — within range`, color: 'var(--success)', bg: 'rgba(34,197,94,0.08)' },
    outside:   { icon: <XCircle size={13} />, label: `${Math.round(distance)} m away — outside ${radius} m`, color: 'var(--danger)', bg: 'rgba(239,68,68,0.08)' },
    disabled:  { icon: <MapPin size={13} />, label: 'Open access — no geofence', color: 'var(--text-muted)', bg: 'var(--border-subtle)' },
    denied:    { icon: <AlertTriangle size={13} />, label: 'Location access denied', color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)' },
  };
  const { icon, label, color, bg } = map[state] || map.idle;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: bg, color, fontSize: 12, fontWeight: 500, margin: '8px auto', maxWidth: '100%' }}>
      {icon} {label}
    </div>
  );
};

// ── Personal check-in/out ───────────────────────────────────
const PersonalCard = ({ staffMember, attendanceSettings, checkInOut, myLogs }) => {
  const [geoState, setGeoState] = useState('idle');
  const [distance, setDistance] = useState(0);
  const [busy, setBusy] = useState(false);

  const geofenceOn = !!(attendanceSettings?.geofenceEnabled && attendanceSettings?.lat && attendanceSettings?.lng);
  const radius = Number(attendanceSettings?.radius) || 100;

  const todayLogs = useMemo(
    () => myLogs.filter(a => recordDay(a) === localDay())
      .sort((a, b) => new Date(recordTs(a)) - new Date(recordTs(b))),
    [myLogs],
  );

  const clockedIn = calcClockedIn(myLogs);
  const todayHours = useMemo(() => totalHours(todayLogs), [todayLogs]);

  // Resolves to { ok, coords } — coords captured for the audit trail when available.
  const checkLocation = useCallback(() => new Promise((resolve) => {
    if (!geofenceOn) { resolve({ ok: true, coords: null }); return; }
    if (!navigator.geolocation) { setGeoState('denied'); resolve({ ok: false }); return; }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const d = haversine(
          Number(attendanceSettings.lat), Number(attendanceSettings.lng),
          coords.lat, coords.lng,
        );
        setDistance(d);
        const inside = d <= radius;
        setGeoState(inside ? 'inside' : 'outside');
        resolve({ ok: inside, coords });
      },
      () => { setGeoState('denied'); resolve({ ok: false }); },
      { timeout: 10000, maximumAge: 0, enableHighAccuracy: true },
    );
  }), [geofenceOn, attendanceSettings, radius]);

  const handleAction = async () => {
    setBusy(true);
    const { ok, coords } = await checkLocation();
    if (!ok) { setBusy(false); return; }
    await checkInOut(staffMember.id, clockedIn ? 'OUT' : 'IN', {
      name: staffMember.name,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    });
    setBusy(false);
  };

  useEffect(() => { if (!geofenceOn) setGeoState('disabled'); }, [geofenceOn]);

  const roleColor = { Owner: '#1e1b4b', Manager: '#1e5e4a', Chef: '#ef4444', Cashier: '#22c55e', Waiter: '#3b82f6', 'Delivery Boy': '#f59e0b', Host: '#ec4899' };
  const rc = roleColor[staffMember.role] || '#1e5e4a';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero */}
      <div className="card" style={{ padding: '28px 20px', textAlign: 'center', background: clockedIn ? 'linear-gradient(135deg,rgba(34,197,94,0.06),rgba(34,197,94,0.02))' : 'linear-gradient(135deg,rgba(239,68,68,0.05),rgba(239,68,68,0.01))' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: `${rc}18`, color: rc, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 26, fontWeight: 800 }}>
          {staffMember.name?.charAt(0).toUpperCase()}
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>{staffMember.name}</div>
        <div style={{ fontSize: 12, color: rc, fontWeight: 600, marginBottom: 6 }}>{staffMember.role}</div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 20, background: clockedIn ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)', color: clockedIn ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          {clockedIn ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {clockedIn ? 'Clocked In' : 'Clocked Out'}
        </div>

        {todayHours > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {todayHours.toFixed(1)}h worked today
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GeoPill state={geoState} distance={distance} radius={radius} />
        </div>

        <button
          onClick={handleAction}
          disabled={busy || geoState === 'loading' || geoState === 'outside'}
          className={clockedIn ? 'btn btn-danger' : 'btn btn-success'}
          style={{ width: '100%', maxWidth: 280, margin: '16px auto 0', height: 52, fontSize: 16, fontWeight: 700, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          {busy ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : clockedIn ? <><LogOut size={20} /> Clock Out</> : <><LogIn size={20} /> Clock In</>}
        </button>
        {geoState === 'outside' && (
          <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>Move closer to the restaurant to clock {clockedIn ? 'out' : 'in'}.</p>
        )}
        {geoState === 'denied' && (
          <p style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>Enable location permission in your browser to clock in.</p>
        )}
      </div>

      {/* Today's log */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalIcon size={15} /> Today's Log
        </div>
        {todayLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>No entries yet today.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayLogs.map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: log.type === 'IN' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.05)' }}>
                {log.type === 'IN' ? <LogIn size={15} color="var(--success)" /> : <LogOut size={15} color="var(--danger)" />}
                <span style={{ fontWeight: 600, fontSize: 13, color: log.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>{log.type === 'IN' ? 'Clocked In' : 'Clocked Out'}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(recordTs(log))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My calendar */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalIcon size={15} /> My Attendance
        </div>
        <AttendanceCalendar attendance={myLogs} staffId={staffMember.id} />
      </div>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────
const Attendance = () => {
  const { staff, settings, checkInOut, attendance } = useApp();
  const { user } = useAuth();
  const can = usePermissions();

  const isManager = user?.role === 'Owner' || user?.role === 'Manager' || can('staff');
  const attendanceSettings = settings?.attendance || {};

  // Match the logged-in user to a staff record by email; otherwise fall back
  // to their auth identity so EVERY logged-in user can clock in.
  const myStaffRecord = useMemo(() => {
    const byEmail = staff.find(
      s => s.email && user?.email && s.email.toLowerCase() === user.email.toLowerCase(),
    );
    return byEmail || (user ? { id: user.id, name: user.name, role: user.role, email: user.email } : null);
  }, [staff, user]);

  const myLogs = useMemo(
    () => (myStaffRecord ? attendance.filter(a => a.staffId === myStaffRecord.id) : []),
    [attendance, myStaffRecord],
  );

  return (
    <div className="animate-fade-up" style={{ maxWidth: 680, margin: '0 auto', padding: '0 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Attendance</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {myStaffRecord?.name ? `Logged in as ${myStaffRecord.name}` : 'Loading…'}
          </div>
        </div>
        {isManager && (
          <a href="/reports?tab=attendance" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>
            <Shield size={13} /> Team Report
          </a>
        )}
      </div>

      {myStaffRecord ? (
        <PersonalCard
          staffMember={myStaffRecord}
          attendanceSettings={attendanceSettings}
          checkInOut={checkInOut}
          myLogs={myLogs}
        />
      ) : (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          <User size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>Not logged in</div>
          <div style={{ fontSize: 13 }}>Please refresh the page.</div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
