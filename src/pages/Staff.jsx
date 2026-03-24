import React, { useState } from 'react';
import { X, Users, Phone, Clock, Edit2, Calendar, Trash2 } from 'lucide-react';
import { useApp } from '../db/AppContext';

const ROLES = ['Manager', 'Chef', 'Cashier', 'Waiter', 'Delivery Boy'];
const SHIFTS = ['Morning', 'Evening', 'Night'];

const Modal = ({ title, onClose, children }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3 className="modal-title">{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Staff = () => {
  const { staff, addStaff, editStaff, deleteStaff, toggleStaffStatus, checkInOut, getStaffAttendance } = useApp();
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'Waiter', phone: '', shift: 'Morning', status: 'active', salary: '' });

  const openAdd = () => {
    setForm({ name: '', role: 'Waiter', phone: '', shift: 'Morning', status: 'active', salary: '' });
    setAddModal(true);
  };

  const openEdit = (member) => {
    setForm({ name: member.name, role: member.role, phone: member.phone, shift: member.shift, status: member.status, salary: member.salary || '' });
    setEditModal(member);
  };

  const openAttendance = (member) => {
    setAttendanceLogs(getStaffAttendance(member.id));
    setAttendanceModal(member);
  };

  const handleSaveNew = () => {
    if (!form.name.trim()) return;
    addStaff({ ...form, salary: parseFloat(form.salary) || 0, joinDate: new Date().toISOString().split('T')[0] });
    setAddModal(false);
  };

  const handleSaveEdit = () => {
    editStaff(editModal.id, { ...form, salary: parseFloat(form.salary) || 0 });
    setEditModal(null);
  };

  const handleCheckIn = (staffId) => {
    checkInOut(staffId, 'IN');
    setAttendanceLogs(getStaffAttendance(staffId));
  };

  const handleCheckOut = (staffId) => {
    checkInOut(staffId, 'OUT');
    setAttendanceLogs(getStaffAttendance(staffId));
  };

  const StaffForm = ({ onSave, saveLabel }) => (
    <>
      <div className="modal-body">
        <div className="input-group">
          <label className="input-label">Full Name</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ravi Singh" />
        </div>
        <div className="input-group">
          <label className="input-label">Phone Number</label>
          <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            <label className="input-label">Salary (₹/month)</label>
            <input className="input-field" type="number" min="0" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder="0" />
          </div>
          <div className="input-group">
            <label className="input-label">Status</label>
            <select className="input-field" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="off-duty">Off Duty</option>
            </select>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => { setAddModal(false); setEditModal(null); }}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
      </div>
    </>
  );

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Staff Management</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {staff.filter(s => s.status === 'active').length} active · {staff.length} total
          </span>
          <button className="btn btn-primary" onClick={openAdd}>
            <Users size={16} /> Add Member
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ paddingBottom: '16px' }}>
        {staff.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No staff members yet. Add your first team member.
          </div>
        )}
        {staff.map(member => (
          <div key={member.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', fontWeight: 800,
              }}>
                {member.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{member.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>{member.role}</div>
              </div>
              <button
                onClick={() => toggleStaffStatus(member.id)}
                className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-neutral'}`}
                style={{ cursor: 'pointer', border: 'none', flexShrink: 0 }}
                title="Click to toggle status"
              >
                {member.status === 'active' ? 'Active' : 'Off Duty'}
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.4)', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}><Phone size={13} /> Phone</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.phone || '—'}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.7)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={13} /> Shift</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.shift}</span>
              </div>
              {member.salary > 0 && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.7)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Salary</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{member.salary?.toLocaleString()}/mo</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '7px' }} onClick={() => openEdit(member)}>
                <Edit2 size={13} /> Edit
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '7px' }} onClick={() => openAttendance(member)}>
                <Calendar size={13} /> Attendance
              </button>
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteConfirm(member)} title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {addModal && (
        <Modal title="Add Team Member" onClose={() => setAddModal(false)}>
          <StaffForm onSave={handleSaveNew} saveLabel="Add Member" />
        </Modal>
      )}

      {editModal && (
        <Modal title={`Edit — ${editModal.name}`} onClose={() => setEditModal(null)}>
          <StaffForm onSave={handleSaveEdit} saveLabel="Save Changes" />
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Remove Staff Member" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Are you sure you want to remove <strong>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteStaff(deleteConfirm.id); setDeleteConfirm(null); }}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </Modal>
      )}

      {attendanceModal && (
        <Modal title={`Attendance — ${attendanceModal.name}`} onClose={() => setAttendanceModal(null)}>
          <div className="modal-body">
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button className="btn btn-success" style={{ flex: 1 }} onClick={() => handleCheckIn(attendanceModal.id)}>
                ✓ Check In
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleCheckOut(attendanceModal.id)}>
                ✗ Check Out
              </button>
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {attendanceLogs.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>No attendance recorded yet.</p>
              ) : (
                [...attendanceLogs].reverse().map((log, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                    borderRadius: '8px', fontSize: '0.82rem',
                    background: log.type === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${log.type === 'IN' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                  }}>
                    <span style={{ fontWeight: 700, color: log.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                      {log.type === 'IN' ? '● Check In' : '○ Check Out'}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {log.date} · {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setAttendanceModal(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Staff;
