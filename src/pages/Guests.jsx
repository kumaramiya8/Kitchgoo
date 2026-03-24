import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Search, Phone, Mail, Star, History, Plus, Trash2,
  X, ChevronRight, ShoppingBag, Edit2, Check, StickyNote
} from 'lucide-react';
import { getAll, insert, update, remove } from '../db/database';
import ReactDOM from 'react-dom';

// ── Modal via Portal ────────────────────────────────────────
const Modal = ({ title, onClose, children, wide }) => ReactDOM.createPortal(
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" style={wide ? { maxWidth: '640px', width: '95%' } : {}} onClick={e => e.stopPropagation()}>
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

// ── Guest Avatar ─────────────────────────────────────────────
const Avatar = ({ name, size = 42 }) => (
  <div style={{
    width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: size * 0.38,
  }}>
    {name?.charAt(0)?.toUpperCase() || '?'}
  </div>
);

// ── Guest Profile Modal ──────────────────────────────────────
const GuestProfileModal = ({ guest, onClose, onSave }) => {
  const [form, setForm] = useState({ ...guest });
  const [tab, setTab] = useState('profile');
  const orders = (getAll('orders') || []).filter(o => o.guestId === guest.id).reverse();

  const handleSave = async () => {
    await onSave(form);
    onClose();
  };

  const inp = (field, type = 'text', placeholder = '') => (
    <input
      className="input-field"
      value={form[field] || ''}
      type={type}
      placeholder={placeholder}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
    />
  );

  return (
    <Modal title={`Guest Profile — ${guest.name}`} onClose={onClose} wide>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        {['profile', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 500, fontSize: '0.85rem',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px', textTransform: 'capitalize',
          }}>
            {t === 'profile' ? '👤 Edit Profile' : '📋 Order History'}
          </button>
        ))}
      </div>

      <div className="modal-body">
        {tab === 'profile' ? (
          <div>
            {/* Profile picture + stats header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '14px', background: 'rgba(124,58,237,0.04)', borderRadius: '14px' }}>
              <Avatar name={form.name} size={54} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{form.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {form.phone && <span><Phone size={10} style={{ display: 'inline', marginRight: 3 }} />{form.phone}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(124,58,237,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>{form.visitCount || 0}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Visits</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--success)' }}>₹{(form.totalSpend || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Spent</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Full Name *</label>
                {inp('name', 'text', 'Guest name')}
              </div>
              <div className="input-group">
                <label className="input-label">Phone</label>
                {inp('phone', 'tel', '+91 XXXXX XXXXX')}
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                {inp('email', 'email', 'email@example.com')}
              </div>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Notes / Preferences</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Dietary restrictions, seating preferences, allergies..."
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Order history tab */
          <div>
            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <ShoppingBag size={40} strokeWidth={1} style={{ marginBottom: 10, opacity: 0.4 }} />
                <p style={{ fontSize: '0.88rem' }}>No order history found for this guest.</p>
              </div>
            ) : orders.map(o => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(255,255,255,0.6)', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{o.billNo}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {o.items?.length || 0} items · {o.paymentMethod}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>₹{o.total?.toFixed(2)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600 }}>Paid</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {tab === 'profile' && (
          <button className="btn btn-primary" onClick={handleSave}>
            <Check size={15} /> Save Profile
          </button>
        )}
      </div>
    </Modal>
  );
};

// ── New Guest Modal ──────────────────────────────────────────
const NewGuestModal = ({ onSave, onClose }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const g = await insert('guests', { ...form, visitCount: 0, totalSpend: 0 });
    onSave(g);
    onClose();
  };

  return (
    <Modal title="New Guest Profile" onClose={onClose}>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Full Name *</label>
            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rahul Sharma" autoFocus />
          </div>
          <div className="input-group">
            <label className="input-label">Phone</label>
            <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" type="tel" />
          </div>
          <div className="input-group">
            <label className="input-label">Email</label>
            <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" type="email" />
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Notes / Preferences</label>
            <textarea className="input-field" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Dietary restrictions, allergies, seating preference..." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
          <Plus size={15} /> Add Guest
        </button>
      </div>
    </Modal>
  );
};

// ── Main Guests Page ─────────────────────────────────────────
const Guests = () => {
  const [query, setQuery] = useState('');
  const [guests, setGuests] = useState(getAll('guests') || []);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshGuests = () => setGuests(getAll('guests') || []);

  const filtered = guests.filter(g =>
    !query.trim() ||
    g.name.toLowerCase().includes(query.toLowerCase()) ||
    (g.phone || '').includes(query) ||
    (g.email || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleSaveProfile = async (form) => {
    await update('guests', form.id, form);
    refreshGuests();
  };

  const handleDelete = async (id) => {
    await remove('guests', id);
    setConfirmDelete(null);
    refreshGuests();
  };

  const handleNewSave = () => {
    refreshGuests();
  };

  // Sort: most visits first
  const sorted = [...filtered].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));

  return (
    <div className="animate-fade-up">
      {/* Header Row */}
      <div className="page-title-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">Guest Profiles</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {guests.length} guest{guests.length !== 1 ? 's' : ''} · Manage loyalty, history & preferences
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={15} /> Add Guest
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Total Guests', value: guests.length, color: '#7c3aed' },
          { label: 'Total Visits', value: guests.reduce((s, g) => s + (g.visitCount || 0), 0), color: '#0ea5e9' },
          { label: 'Total Revenue', value: '₹' + guests.reduce((s, g) => s + (g.totalSpend || 0), 0).toLocaleString(), color: '#22c55e' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          className="input-field"
          style={{ paddingLeft: 40, maxWidth: '400px' }}
          placeholder="Search by name, phone or email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Guest cards */}
      {sorted.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <User size={44} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>No guests found</div>
          <div style={{ fontSize: '0.82rem' }}>Add your first guest profile to start tracking visits and orders.</div>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowNew(true)}>
            <Plus size={15} /> Add First Guest
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {sorted.map(guest => (
            <div key={guest.id} className="card" style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.15s', position: 'relative' }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              onClick={() => setSelected(guest)}>

              {/* Top row: avatar + name + actions */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <Avatar name={guest.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>{guest.name}</div>
                  {guest.phone && (
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Phone size={10} /> {guest.phone}
                    </div>
                  )}
                  {guest.email && (
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Mail size={10} /> {guest.email}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setSelected(guest)} style={{ width: 28, height: 28, borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'rgba(124,58,237,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setConfirmDelete(guest)} style={{ width: 28, height: 28, borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div style={{ padding: '8px 10px', background: 'rgba(124,58,237,0.05)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1rem' }}>{guest.visitCount || 0}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Visits</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.05)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.9rem' }}>₹{(guest.totalSpend || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Spent</div>
                </div>
              </div>

              {/* Notes */}
              {guest.notes && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '8px 10px', background: 'rgba(245,158,11,0.05)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <StickyNote size={12} style={{ color: '#d97706', marginTop: '1px', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.72rem', color: '#92400e', lineHeight: 1.4 }}>{guest.notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Guest Profile Edit Modal */}
      {selected && (
        <GuestProfileModal
          guest={selected}
          onClose={() => setSelected(null)}
          onSave={handleSaveProfile}
        />
      )}

      {/* New Guest Modal */}
      {showNew && (
        <NewGuestModal
          onSave={handleNewSave}
          onClose={() => setShowNew(false)}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <Modal title="Remove Guest" onClose={() => setConfirmDelete(null)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Are you sure you want to remove <strong>{confirmDelete.name}</strong>'s profile? Their visit history and spend data will also be deleted.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete.id)}>
              <Trash2 size={15} /> Remove Guest
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Guests;
