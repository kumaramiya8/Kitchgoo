import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, UserCheck, UserX, Clock, Plus, X, Edit2, Trash2, Save,
  Phone, Calendar, Shield, Star, AlertTriangle, Search, ChevronDown,
  DollarSign, Award, TrendingUp, BarChart3, Lock, Eye, EyeOff,
  CheckCircle, XCircle, Coffee, FileText, Download, Hash,
  ArrowRight, Briefcase, IndianRupee, Timer, PieChart, Zap
} from 'lucide-react';
import { useApp } from '../db/AppContext';

// ─── Constants ──────────────────────────────────────────────
const ROLES = ['Manager', 'Chef', 'Cashier', 'Waiter', 'Delivery Boy', 'Host'];
const SHIFTS = ['Morning', 'Evening', 'Night', 'Split'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

const ROLE_COLORS = {
  Manager: '#7c3aed', Chef: '#ef4444', Cashier: '#22c55e',
  Waiter: '#3b82f6', 'Delivery Boy': '#f59e0b', Host: '#ec4899',
};

const ALL_PERMISSIONS = [
  'pos', 'inventory', 'staff', 'reports', 'menu', 'delivery', 'kds',
  'reservations', 'guests', 'settings.view', 'settings.edit',
  'reports.export', 'comp.small', 'comp.large', 'void', 'discount',
];

const DEFAULT_ROLE_PERMS = {
  Manager: ALL_PERMISSIONS,
  Chef: ['kds', 'inventory', 'menu'],
  Cashier: ['pos', 'comp.small', 'discount'],
  Waiter: ['pos', 'reservations', 'guests', 'comp.small'],
  'Delivery Boy': ['delivery'],
  Host: ['reservations', 'guests'],
};

const DEFAULT_TIP_RULES = {
  Waiter: 40, Chef: 20, Cashier: 15, Host: 10, 'Delivery Boy': 10, Manager: 5,
};

const TABS = [
  { key: 'team', label: 'Team', icon: Users },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'attendance', label: 'Time & Attendance', icon: Clock },
  { key: 'tips', label: 'Tip Management', icon: DollarSign },
  { key: 'permissions', label: 'Permissions', icon: Shield },
  { key: 'performance', label: 'Performance', icon: TrendingUp },
];

// ─── Helpers ────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return '\u20B90';
  if (n >= 10000000) return `\u20B9${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `\u20B9${(n / 100000).toFixed(1)}L`;
  return `\u20B9${Math.round(n).toLocaleString('en-IN')}`;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--';
const genLocalId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().split('T')[0];

// ─── Shared UI Components ───────────────────────────────────
const Modal = ({ title, onClose, children, wide }) =>
  createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={wide ? { maxWidth: 780, width: '95vw' } : {}}>
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

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="card" style={{ flex: 1, minWidth: 150, padding: '16px 18px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Badge = ({ children, color }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
    borderRadius: 20, fontSize: 12, fontWeight: 600, background: `${color}18`, color,
  }}>{children}</span>
);

const ToggleSwitch = ({ on, onToggle }) => (
  <button onClick={onToggle} style={{
    width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
    background: on ? 'var(--primary)' : 'var(--border-subtle)', position: 'relative',
    transition: 'background 0.2s',
  }}>
    <div style={{
      width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute',
      top: 3, left: on ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    }} />
  </button>
);

// ═════════════════════════════════════════════════════════════
// ═══ MAIN COMPONENT ═════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
const Staff = () => {
  const {
    staff, schedules, tipPools, orders, settings, todayStats,
    addStaff, editStaff, deleteStaff, toggleStaffStatus, checkInOut, getStaffAttendance,
    addSchedule, editSchedule, deleteSchedule,
    updateTipPools, updateSettingsSection,
  } = useApp();

  const [activeTab, setActiveTab] = useState('team');
  const [search, setSearch] = useState('');

  // ═══════════════════════════════════════════════════════════
  // ═══ TEAM TAB ═════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const TeamTab = () => {
    const [addModal, setAddModal] = useState(false);
    const [editModal, setEditModal] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showPin, setShowPin] = useState({});

    const emptyForm = {
      name: '', role: 'Waiter', phone: '', shift: 'Morning', salary: '',
      pin: '', joinDate: today(), emergencyContact: '', emergencyPhone: '',
      documents: [], wageHistory: [],
    };
    const [form, setForm] = useState(emptyForm);

    const filtered = useMemo(() => {
      const q = search.toLowerCase();
      return staff.filter(s =>
        s.name?.toLowerCase().includes(q) || s.role?.toLowerCase().includes(q) || s.phone?.includes(q)
      );
    }, [staff, search]);

    const activeCount = staff.filter(s => s.status === 'active').length;
    const offCount = staff.filter(s => s.status !== 'active').length;

    // Simulated weekly hours (in real app would come from attendance)
    const getWeeklyHours = (member) => {
      const attendance = getStaffAttendance(member.id) || [];
      let totalMs = 0;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekLogs = attendance.filter(a => new Date(a.time).getTime() > weekAgo);
      for (let i = 0; i < weekLogs.length - 1; i += 2) {
        if (weekLogs[i].type === 'IN' && weekLogs[i + 1]?.type === 'OUT') {
          totalMs += new Date(weekLogs[i + 1].time) - new Date(weekLogs[i].time);
        }
      }
      return Math.round(totalMs / (1000 * 60 * 60) * 10) / 10 || Math.floor(Math.random() * 20 + 25);
    };

    const approachingOT = staff.filter(s => s.status === 'active' && getWeeklyHours(s) > 38).length;

    const openAdd = () => { setForm(emptyForm); setAddModal(true); };
    const openEdit = (m) => {
      setForm({
        name: m.name || '', role: m.role || 'Waiter', phone: m.phone || '',
        shift: m.shift || 'Morning', salary: m.salary || '',
        pin: m.pin || '', joinDate: m.joinDate || today(),
        emergencyContact: m.emergencyContact || '', emergencyPhone: m.emergencyPhone || '',
        documents: m.documents || [], wageHistory: m.wageHistory || [],
      });
      setEditModal(m);
    };

    const handleSave = (isEdit) => {
      if (!form.name.trim()) return;
      const data = { ...form, salary: parseFloat(form.salary) || 0 };
      if (isEdit) {
        editStaff(editModal.id, data);
        setEditModal(null);
      } else {
        addStaff({ ...data, status: 'active' });
        setAddModal(false);
      }
    };

    const StaffForm = ({ isEdit }) => (
      <>
        <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="input-label">Full Name *</label>
              <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ravi Singh" />
            </div>
            <div className="input-group">
              <label className="input-label">Role</label>
              <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Shift</label>
              <select className="input-field" value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))}>
                {SHIFTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Phone</label>
              <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" />
            </div>
            <div className="input-group">
              <label className="input-label">Salary (per month)</label>
              <input className="input-field" type="number" min="0" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder="0" />
            </div>
            <div className="input-group">
              <label className="input-label">4-Digit PIN</label>
              <input className="input-field" value={form.pin} maxLength={4} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="1234" />
            </div>
            <div className="input-group">
              <label className="input-label">Join Date</label>
              <input className="input-field" type="date" value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Emergency Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Contact Name</label>
                <input className="input-field" value={form.emergencyContact} onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} placeholder="Name" />
              </div>
              <div className="input-group">
                <label className="input-label">Contact Phone</label>
                <input className="input-field" value={form.emergencyPhone} onChange={e => setForm(f => ({ ...f, emergencyPhone: e.target.value }))} placeholder="Phone" />
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Documents</div>
            <div style={{
              border: '2px dashed var(--border-subtle)', borderRadius: 10, padding: '20px',
              textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            }}>
              <FileText size={20} style={{ marginBottom: 4 }} /><br />
              Click to upload ID, certificates, etc.
            </div>
          </div>
          {isEdit && (form.wageHistory || []).length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '16px 0', paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Wage History</div>
              {form.wageHistory.map((w, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                  <span>{fmtDate(w.date)}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(w.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => { setAddModal(false); setEditModal(null); }}>Cancel</button>
          <button className="btn btn-primary" onClick={() => handleSave(isEdit)}>
            <Save size={16} /> {isEdit ? 'Update' : 'Add Member'}
          </button>
        </div>
      </>
    );

    return (
      <>
        {/* Stats Row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard icon={Users} label="Total Staff" value={staff.length} color="var(--primary)" />
          <StatCard icon={UserCheck} label="Active" value={activeCount} color="var(--success)" />
          <StatCard icon={UserX} label="Off-Duty" value={offCount} color="var(--text-muted)" />
          <StatCard icon={AlertTriangle} label="Approaching OT" value={approachingOT} color="var(--warning)" />
        </div>

        {/* Actions Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input-field" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 36, margin: 0 }} />
          </div>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Member</button>
        </div>

        {/* Table */}
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                {['Name', 'Role', 'Phone', 'Shift', 'Status', 'PIN', 'Salary', 'Join Date', 'Hrs/Week', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No staff members found.</td></tr>
              )}
              {filtered.map(m => {
                const hrs = getWeeklyHours(m);
                const otWarning = hrs > 38;
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: `linear-gradient(135deg, ${ROLE_COLORS[m.role] || 'var(--primary)'}, ${ROLE_COLORS[m.role] || 'var(--primary)'}88)`,
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700,
                        }}>{m.name?.charAt(0)}</div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}><Badge color={ROLE_COLORS[m.role] || '#7c3aed'}>{m.role}</Badge></td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.phone || '--'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.shift || '--'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button onClick={() => toggleStaffStatus(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <Badge color={m.status === 'active' ? 'var(--success)' : 'var(--text-muted)'}>
                          {m.status === 'active' ? <><CheckCircle size={12} /> Active</> : <><XCircle size={12} /> Off-Duty</>}
                        </Badge>
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', letterSpacing: 1 }}>
                          {showPin[m.id] ? (m.pin || '----') : '****'}
                        </span>
                        <button onClick={() => setShowPin(p => ({ ...p, [m.id]: !p[m.id] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                          {showPin[m.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(m.salary)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(m.joinDate)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, color: otWarning ? 'var(--warning)' : 'var(--text-primary)' }}>{hrs}h</span>
                        {otWarning && <AlertTriangle size={14} color="var(--warning)" />}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(m)} style={{ padding: '4px 8px' }}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(m)} style={{ padding: '4px 8px' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Modals */}
        {addModal && <Modal title="Add Team Member" onClose={() => setAddModal(false)} wide><StaffForm isEdit={false} /></Modal>}
        {editModal && <Modal title={`Edit - ${editModal.name}`} onClose={() => setEditModal(null)} wide><StaffForm isEdit={true} /></Modal>}
        {deleteConfirm && (
          <Modal title="Confirm Delete" onClose={() => setDeleteConfirm(null)}>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to remove <strong>{deleteConfirm.name}</strong> from the team? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { deleteStaff(deleteConfirm.id); setDeleteConfirm(null); }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </Modal>
        )}
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ SCHEDULE TAB ═════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const ScheduleTab = () => {
    const [addModal, setAddModal] = useState(false);
    const [shiftForm, setShiftForm] = useState({ staffId: '', day: 'Mon', startTime: '09:00', endTime: '17:00', role: '' });

    const activeStaff = staff.filter(s => s.status === 'active');

    // Predicted busy hours
    const busyHours = { Mon: [11, 12, 13, 19, 20], Tue: [12, 13, 19, 20], Wed: [12, 13, 19, 20, 21],
      Thu: [12, 13, 19, 20, 21], Fri: [12, 13, 18, 19, 20, 21, 22], Sat: [11, 12, 13, 14, 18, 19, 20, 21, 22],
      Sun: [11, 12, 13, 14, 18, 19, 20, 21] };

    const getShiftsForCell = (staffId, day) => {
      return (schedules || []).filter(s => s.staffId === staffId && s.day === day);
    };

    const handleAddShift = () => {
      if (!shiftForm.staffId) return;
      const member = staff.find(s => s.id === shiftForm.staffId);
      addSchedule({
        staffId: shiftForm.staffId,
        staffName: member?.name || '',
        day: shiftForm.day,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        role: shiftForm.role || member?.role || 'Waiter',
      });
      setAddModal(false);
    };

    const handleCellClick = (staffId, day) => {
      const member = staff.find(s => s.id === staffId);
      setShiftForm({
        staffId, day, startTime: '09:00', endTime: '17:00',
        role: member?.role || 'Waiter',
      });
      setAddModal(true);
    };

    const timeSlots = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

    return (
      <>
        {/* Coverage Prediction */}
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>
            <Zap size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Predicted Coverage Needs
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(day => (
              <div key={day} style={{ flex: 1, minWidth: 70, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{day}</div>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {(busyHours[day] || []).map(h => (
                    <span key={h} style={{
                      fontSize: 10, padding: '2px 5px', borderRadius: 4,
                      background: h >= 18 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: h >= 18 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600,
                    }}>{h}:00</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule Grid */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: 'var(--primary-light)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 130, position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1 }}>Staff</th>
                  {DAYS.map(d => (
                    <th key={d} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 100 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeStaff.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No active staff. Add team members first.</td></tr>
                )}
                {activeStaff.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8, background: `${ROLE_COLORS[m.role] || '#7c3aed'}22`,
                          color: ROLE_COLORS[m.role] || '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>{m.name?.charAt(0)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{m.name}</div>
                          <div style={{ fontSize: 10, color: ROLE_COLORS[m.role] || 'var(--primary)' }}>{m.role}</div>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const shifts = getShiftsForCell(m.id, day);
                      return (
                        <td key={day} style={{ padding: '4px 6px', verticalAlign: 'top', cursor: 'pointer', minHeight: 40 }}
                          onClick={() => handleCellClick(m.id, day)}>
                          {shifts.length === 0 ? (
                            <div style={{
                              height: 36, borderRadius: 6, border: '1px dashed var(--border-subtle)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--text-muted)', fontSize: 16, opacity: 0.5,
                            }}>+</div>
                          ) : shifts.map((sh, i) => (
                            <div key={sh.id || i} style={{
                              padding: '4px 6px', borderRadius: 6, marginBottom: 3, fontSize: 10,
                              background: `${ROLE_COLORS[sh.role] || '#7c3aed'}15`,
                              borderLeft: `3px solid ${ROLE_COLORS[sh.role] || '#7c3aed'}`,
                              position: 'relative',
                            }}>
                              <div style={{ fontWeight: 600 }}>{sh.startTime} - {sh.endTime}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{sh.role}</div>
                              <button onClick={(e) => { e.stopPropagation(); deleteSchedule(sh.id); }}
                                style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 1, lineHeight: 1 }}>
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Shift Button */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => { setShiftForm({ staffId: activeStaff[0]?.id || '', day: 'Mon', startTime: '09:00', endTime: '17:00', role: '' }); setAddModal(true); }}>
            <Plus size={16} /> Add Shift
          </button>
        </div>

        {/* Add Shift Modal */}
        {addModal && (
          <Modal title="Add Shift" onClose={() => setAddModal(false)}>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Staff Member</label>
                <select className="input-field" value={shiftForm.staffId} onChange={e => {
                  const mem = staff.find(s => s.id === e.target.value);
                  setShiftForm(f => ({ ...f, staffId: e.target.value, role: mem?.role || f.role }));
                }}>
                  <option value="">Select...</option>
                  {activeStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="input-group">
                  <label className="input-label">Day</label>
                  <select className="input-field" value={shiftForm.day} onChange={e => setShiftForm(f => ({ ...f, day: e.target.value }))}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Start</label>
                  <input className="input-field" type="time" value={shiftForm.startTime} onChange={e => setShiftForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label className="input-label">End</label>
                  <input className="input-field" type="time" value={shiftForm.endTime} onChange={e => setShiftForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select className="input-field" value={shiftForm.role} onChange={e => setShiftForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddShift}><Plus size={16} /> Add Shift</button>
            </div>
          </Modal>
        )}
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ TIME & ATTENDANCE TAB ════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const AttendanceTab = () => {
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [pinSuccess, setPinSuccess] = useState('');
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [breakTracking, setBreakTracking] = useState({});

    const handlePinSubmit = () => {
      const member = staff.find(s => s.pin === pin);
      if (!member) {
        setPinError('Invalid PIN. Try again.');
        setPinSuccess('');
        return;
      }
      setPinError('');
      const attendance = getStaffAttendance(member.id) || [];
      const lastLog = attendance[attendance.length - 1];
      const isIn = lastLog?.type === 'IN';

      if (isIn) {
        checkInOut(member.id, 'OUT');
        setPinSuccess(`${member.name} clocked OUT at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      } else {
        checkInOut(member.id, 'IN');
        setPinSuccess(`${member.name} clocked IN at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      }
      setPin('');
      setTimeout(() => setPinSuccess(''), 4000);
    };

    const toggleBreak = (staffId) => {
      setBreakTracking(prev => {
        const curr = prev[staffId];
        if (curr && !curr.end) {
          return { ...prev, [staffId]: { ...curr, end: new Date().toISOString(), paid: false } };
        }
        return { ...prev, [staffId]: { start: new Date().toISOString(), end: null, paid: false } };
      });
    };

    // Weekly hours per staff
    const weeklyHours = useMemo(() => {
      const result = {};
      staff.forEach(m => {
        const attendance = getStaffAttendance(m.id) || [];
        let total = 0;
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const weekLogs = attendance.filter(a => new Date(a.time).getTime() > weekAgo);
        for (let i = 0; i < weekLogs.length - 1; i += 2) {
          if (weekLogs[i].type === 'IN' && weekLogs[i + 1]?.type === 'OUT') {
            total += new Date(weekLogs[i + 1].time) - new Date(weekLogs[i].time);
          }
        }
        result[m.id] = Math.round(total / (1000 * 60 * 60) * 10) / 10;
      });
      return result;
    }, [staff]);

    // Today's log
    const todayLog = useMemo(() => {
      const logs = [];
      const todayStr = today();
      staff.forEach(m => {
        const attendance = getStaffAttendance(m.id) || [];
        attendance.filter(a => a.time?.startsWith(todayStr)).forEach(a => {
          logs.push({ ...a, staffName: m.name, staffRole: m.role, staffId: m.id });
        });
      });
      return logs.sort((a, b) => new Date(b.time) - new Date(a.time));
    }, [staff]);

    // Labor law warnings
    const warnings = useMemo(() => {
      const w = [];
      staff.forEach(m => {
        const hrs = weeklyHours[m.id] || 0;
        if (hrs > 40) w.push({ name: m.name, msg: `${hrs}h this week - overtime exceeded`, severity: 'danger' });
        else if (hrs > 36) w.push({ name: m.name, msg: `${hrs}h this week - approaching overtime`, severity: 'warning' });
        if (m.role === 'Host' && hrs > 30) w.push({ name: m.name, msg: 'Possible minor restriction - check age', severity: 'warning' });
      });
      return w;
    }, [staff, weeklyHours]);

    return (
      <>
        {/* PIN Clock In/Out */}
        <div className="card" style={{ marginBottom: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            <Lock size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            PIN Clock In / Out
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Enter your 4-digit PIN to clock in or out</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', maxWidth: 320, margin: '0 auto' }}>
            <input className="input-field" type="password" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              placeholder="* * * *"
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: 700, maxWidth: 180, margin: 0 }} />
            <button className="btn btn-primary" onClick={handlePinSubmit} style={{ height: 44 }}>
              <ArrowRight size={18} />
            </button>
          </div>
          {pinError && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8, fontWeight: 500 }}>{pinError}</div>}
          {pinSuccess && <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8, fontWeight: 600 }}>{pinSuccess}</div>}
        </div>

        {/* Labor Law Warnings */}
        {warnings.length > 0 && (
          <div className="card" style={{ marginBottom: 16, padding: 14, background: 'rgba(245,158,11,0.06)', borderLeft: '3px solid var(--warning)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', marginBottom: 8 }}>
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Labor Warnings
            </div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: w.severity === 'danger' ? 'var(--danger)' : 'var(--warning)', padding: '3px 0' }}>
                <strong>{w.name}:</strong> {w.msg}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Today's Log */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
              <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Today's Clock Log
            </div>
            {todayLog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No entries today.</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {todayLog.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <Badge color={log.type === 'IN' ? 'var(--success)' : 'var(--danger)'}>{log.type}</Badge>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{log.staffName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.staffRole}</div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{fmtTime(log.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Break Tracking & Weekly Hours */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Break Tracking */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                <Coffee size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Break Tracking
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {staff.filter(s => s.status === 'active').map(m => {
                  const brk = breakTracking[m.id];
                  const onBreak = brk && !brk.end;
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{m.name}</span>
                      {brk?.end && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {fmtTime(brk.start)} - {fmtTime(brk.end)} <Badge color="var(--text-muted)">Unpaid</Badge>
                        </span>
                      )}
                      <button className={`btn btn-sm ${onBreak ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggleBreak(m.id)}
                        style={{ fontSize: 11, padding: '3px 8px' }}>
                        {onBreak ? 'End Break' : 'Start Break'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Weekly Hours Summary */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                <Timer size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Weekly Hours Summary
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {staff.map(m => {
                  const hrs = weeklyHours[m.id] || 0;
                  const pct = Math.min((hrs / 40) * 100, 100);
                  return (
                    <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: hrs > 40 ? 'var(--danger)' : hrs > 36 ? 'var(--warning)' : 'var(--text-primary)' }}>{hrs}h / 40h</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: hrs > 40 ? 'var(--danger)' : hrs > 36 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ TIP MANAGEMENT TAB ═══════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const TipTab = () => {
    const currentRules = useMemo(() => {
      if (Array.isArray(tipPools) && tipPools.length > 0) {
        const rulesObj = {};
        tipPools.forEach(tp => { rulesObj[tp.role] = tp.share; });
        return rulesObj;
      }
      return { ...DEFAULT_TIP_RULES };
    }, [tipPools]);

    const [editingRules, setEditingRules] = useState(false);
    const [rules, setRules] = useState(currentRules);

    const handleSaveRules = () => {
      const arr = Object.entries(rules).map(([role, share]) => ({ role, share: parseFloat(share) || 0 }));
      updateTipPools(arr);
      setEditingRules(false);
    };

    // Calculate today's tips from orders
    const tipCalc = useMemo(() => {
      const todayOrders = (orders || []).filter(o => o.createdAt?.startsWith(today()));
      const totalTips = todayOrders.reduce((sum, o) => sum + (o.tip || 0), 0);
      const totalShare = Object.values(currentRules).reduce((s, v) => s + v, 0) || 100;

      const distribution = {};
      staff.filter(s => s.status === 'active').forEach(m => {
        const roleShare = currentRules[m.role] || 0;
        distribution[m.id] = {
          name: m.name,
          role: m.role,
          share: roleShare,
          amount: totalTips > 0 ? (totalTips * (roleShare / totalShare)) / Math.max(1, staff.filter(s => s.status === 'active' && s.role === m.role).length) : 0,
        };
      });
      return { totalTips, distribution };
    }, [orders, staff, currentRules]);

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Tip Pool Rules */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                <PieChart size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Tip Pool Rules
              </div>
              <button className={`btn btn-sm ${editingRules ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => editingRules ? handleSaveRules() : (setRules(currentRules), setEditingRules(true))}>
                {editingRules ? <><Save size={13} /> Save</> : <><Edit2 size={13} /> Edit</>}
              </button>
            </div>
            {ROLES.map(role => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <Badge color={ROLE_COLORS[role] || '#7c3aed'}>{role}</Badge>
                <div style={{ flex: 1 }} />
                {editingRules ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input className="input-field" type="number" min={0} max={100}
                      value={rules[role] || 0} onChange={e => setRules(r => ({ ...r, [role]: e.target.value }))}
                      style={{ width: 60, textAlign: 'center', padding: '4px 6px', margin: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>%</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{currentRules[role] || 0}%</span>
                )}
              </div>
            ))}
            {editingRules && (
              <div style={{ marginTop: 10, fontSize: 12, color: Object.values(rules).reduce((s, v) => s + (parseFloat(v) || 0), 0) === 100 ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                Total: {Object.values(rules).reduce((s, v) => s + (parseFloat(v) || 0), 0)}%
                {Object.values(rules).reduce((s, v) => s + (parseFloat(v) || 0), 0) !== 100 && ' (should be 100%)'}
              </div>
            )}
          </div>

          {/* Today's Tip Calculation */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              <DollarSign size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Today's Tip Distribution
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', marginBottom: 16 }}>
              {fmt(tipCalc.totalTips)}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>total collected</span>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {Object.values(tipCalc.distribution).map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.role} ({d.share}%)</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>{fmt(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Export Button */}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => {
            const csv = ['Name,Role,Share %,Amount'];
            Object.values(tipCalc.distribution).forEach(d => csv.push(`${d.name},${d.role},${d.share},${d.amount.toFixed(2)}`));
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `tip-report-${today()}.csv`; a.click();
            URL.revokeObjectURL(url);
          }}>
            <Download size={16} /> Export Tip Report
          </button>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ PERMISSIONS TAB (RBAC) ═══════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const PermissionsTab = () => {
    const [perms, setPerms] = useState(() => {
      const stored = settings?.rolePermissions || {};
      const result = {};
      ROLES.forEach(r => { result[r] = stored[r] || DEFAULT_ROLE_PERMS[r] || []; });
      return result;
    });
    const [dirty, setDirty] = useState(false);

    const togglePerm = (role, perm) => {
      setPerms(prev => {
        const arr = prev[role] || [];
        const next = arr.includes(perm) ? arr.filter(p => p !== perm) : [...arr, perm];
        return { ...prev, [role]: next };
      });
      setDirty(true);
    };

    const handleSave = () => {
      updateSettingsSection('rolePermissions', perms);
      setDirty(false);
    };

    const permLabels = {
      pos: 'POS', inventory: 'Inventory', staff: 'Staff', reports: 'Reports',
      menu: 'Menu', delivery: 'Delivery', kds: 'KDS', reservations: 'Reservations',
      guests: 'Guests', 'settings.view': 'Settings (View)', 'settings.edit': 'Settings (Edit)',
      'reports.export': 'Reports Export', 'comp.small': 'Comp (Small)', 'comp.large': 'Comp (Large)',
      void: 'Void', discount: 'Discount',
    };

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Role-Based Access Control</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toggle permissions for each role across the system</div>
          </div>
          {dirty && <button className="btn btn-success" onClick={handleSave}><Save size={16} /> Save Changes</button>}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--primary-light)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1, minWidth: 120 }}>Role</th>
                  {ALL_PERMISSIONS.map(p => (
                    <th key={p} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11, minWidth: 60 }}>
                      <div style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>
                        {permLabels[p] || p}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map(role => (
                  <tr key={role} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 1 }}>
                      <Badge color={ROLE_COLORS[role] || '#7c3aed'}>{role}</Badge>
                    </td>
                    {ALL_PERMISSIONS.map(p => (
                      <td key={p} style={{ padding: '6px', textAlign: 'center' }}>
                        <ToggleSwitch on={(perms[role] || []).includes(p)} onToggle={() => togglePerm(role, p)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Current Role Definitions */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Current Role Definitions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {ROLES.map(role => (
              <div key={role} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${ROLE_COLORS[role]}18`, color: ROLE_COLORS[role], fontWeight: 700, fontSize: 14,
                  }}>{role.charAt(0)}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{role}</div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {(perms[role] || []).length} permissions
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(perms[role] || []).map(p => (
                    <span key={p} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 500 }}>
                      {permLabels[p] || p}
                    </span>
                  ))}
                  {(perms[role] || []).length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No permissions</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ PERFORMANCE TAB ══════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const PerformanceTab = () => {
    const kpis = useMemo(() => {
      const result = {};
      staff.forEach(m => {
        result[m.id] = { name: m.name, role: m.role, orders: 0, totalSales: 0, totalItems: 0, tips: 0, ratings: [], upsells: 0 };
      });

      (orders || []).forEach(o => {
        const sId = o.serverId || o.staffId;
        const sName = o.serverName || o.staffName;
        let entry = sId ? result[sId] : null;
        if (!entry && sName) {
          const match = staff.find(s => s.name === sName);
          if (match) entry = result[match.id];
        }
        if (!entry) return;
        entry.orders += 1;
        entry.totalSales += (o.total || o.grandTotal || 0);
        entry.totalItems += (o.items?.length || 0);
        entry.tips += (o.tip || 0);
        if (o.rating) entry.ratings.push(o.rating);
        if (o.items?.some(it => it.isUpsell || it.modifier)) entry.upsells += 1;
      });

      return Object.values(result)
        .filter(k => k.orders > 0)
        .map(k => ({
          ...k,
          avgCheck: k.orders > 0 ? k.totalSales / k.orders : 0,
          perHead: k.totalItems > 0 ? k.totalSales / k.totalItems : 0,
          upsellRate: k.orders > 0 ? (k.upsells / k.orders * 100) : 0,
          avgRating: k.ratings.length > 0 ? k.ratings.reduce((a, b) => a + b, 0) / k.ratings.length : 0,
        }))
        .sort((a, b) => b.totalSales - a.totalSales);
    }, [staff, orders]);

    const topServer = kpis[0];
    const highestCheck = [...kpis].sort((a, b) => b.avgCheck - a.avgCheck)[0];
    const mostTips = [...kpis].sort((a, b) => b.tips - a.tips)[0];

    return (
      <>
        {/* Summary Cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard icon={Award} label="Top Server" value={topServer?.name || '--'} color="var(--primary)"
            sub={topServer ? `${fmt(topServer.totalSales)} in sales` : 'No data'} />
          <StatCard icon={TrendingUp} label="Highest Avg Check" value={highestCheck ? fmt(highestCheck.avgCheck) : '--'} color="var(--success)"
            sub={highestCheck?.name || ''} />
          <StatCard icon={DollarSign} label="Most Tips" value={mostTips ? fmt(mostTips.tips) : '--'} color="var(--warning)"
            sub={mostTips?.name || ''} />
        </div>

        {/* KPI Table */}
        <div className="table-wrapper">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                {['Name', 'Role', 'Orders Served', 'Avg Check', 'Per-Head Spend', 'Upsell Rate', 'Tips Earned', 'Rating'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpis.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No performance data yet. Complete orders to see KPIs.</td></tr>
              )}
              {kpis.map((k, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i === 0 && <Star size={14} color="var(--warning)" fill="var(--warning)" />}
                      <span style={{ fontWeight: 600 }}>{k.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}><Badge color={ROLE_COLORS[k.role] || '#7c3aed'}>{k.role}</Badge></td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{k.orders}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{fmt(k.avgCheck)}</td>
                  <td style={{ padding: '10px 12px' }}>{fmt(k.perHead)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 40, height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(k.upsellRate, 100)}%`, height: '100%', borderRadius: 3, background: 'var(--primary)' }} />
                      </div>
                      <span style={{ fontSize: 12 }}>{k.upsellRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--success)' }}>{fmt(k.tips)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {k.avgRating > 0 ? (
                        <>
                          <Star size={13} color="var(--warning)" fill="var(--warning)" />
                          <span style={{ fontWeight: 600 }}>{k.avgRating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>--</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ TAB RENDERER ═════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  const renderTab = () => {
    switch (activeTab) {
      case 'team': return <TeamTab />;
      case 'schedule': return <ScheduleTab />;
      case 'attendance': return <AttendanceTab />;
      case 'tips': return <TipTab />;
      case 'permissions': return <PermissionsTab />;
      case 'performance': return <PerformanceTab />;
      default: return <TeamTab />;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ═══ MAIN RENDER ══════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Staff & Workforce</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {staff.filter(s => s.status === 'active').length} active / {staff.length} total
        </span>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4,
        borderBottom: '2px solid var(--border-subtle)',
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                border: 'none', background: active ? 'var(--primary-light)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
                borderRadius: '8px 8px 0 0', transition: 'all 0.2s', whiteSpace: 'nowrap',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2,
              }}>
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      {renderTab()}
    </div>
  );
};

export default Staff;
