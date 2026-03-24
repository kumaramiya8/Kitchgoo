import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  ShoppingCart, Printer, Split, Bookmark, X, CheckCircle,
  ChevronLeft, User, Clock, Phone, Search, Star, History
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { getAll, insert, getById } from '../db/database';
import { printReceipt } from '../utils/printReceipt';

const CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Beverages'];
const INITIAL_TABLES = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  baseStatus: [1, 3, 5, 8, 10, 14].includes(i + 1) ? 'occupied' : 'available',
}));

// Modal renders as a React Portal at document.body to escape overflow stacking contexts
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


// ── Guest Check-in Modal ────────────────────────────────────────────
const GuestModal = ({ tableId, onConfirm, onClose }) => {
  const [tab, setTab] = useState('search'); // 'search' | 'new'
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  const allGuests = getAll('guests') || [];
  const filteredGuests = query.trim()
    ? allGuests.filter(g =>
        g.name.toLowerCase().includes(query.toLowerCase()) ||
        (g.phone || '').includes(query)
      )
    : allGuests.slice(-10).reverse(); // show recent 10

  const getGuestHistory = (guestId) => {
    return getAll('orders').filter(o => o.guestId === guestId).reverse();
  };

  const handleWalkIn = () => {
    onConfirm({ name: 'Walk-in Guest', isWalkIn: true });
  };

  const handleSelect = (guest) => {
    setSelected(guest);
  };

  const handleConfirmGuest = () => {
    if (selected) {
      onConfirm({ ...selected, isExisting: true });
    }
  };

  const handleCreateNew = () => {
    if (!form.name.trim()) return;
    const newGuest = insert('guests', {
      name: form.name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      visitCount: 0,
      totalSpend: 0,
    });
    onConfirm({ ...newGuest, isNew: true });
  };

  const history = selected ? getGuestHistory(selected.id) : [];

  return (
    <Modal title={`Guest Check-in — Table ${tableId}`} onClose={onClose} wide>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        {['search', 'new'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 500, fontSize: '0.85rem',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>
            {t === 'search' ? '🔍 Find Guest' : '+ New Guest'}
          </button>
        ))}
      </div>

      <div className="modal-body">
        {tab === 'search' ? (
          <div style={{ display: selected ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Left: Search */}
            <div>
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 36 }}
                  placeholder="Search by name or phone..."
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(null); }}
                  autoFocus
                />
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredGuests.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px 0' }}>No guests found. Try "New Guest" tab.</p>
                ) : filteredGuests.map(g => (
                  <button key={g.id} onClick={() => handleSelect(g)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                      borderRadius: '12px', border: `1.5px solid ${selected?.id === g.id ? 'rgba(124,58,237,0.4)' : 'var(--border-subtle)'}`,
                      background: selected?.id === g.id ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
                      {g.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {g.phone && `${g.phone} · `}{g.visitCount || 0} visit{g.visitCount !== 1 ? 's' : ''} · ₹{(g.totalSpend || 0).toLocaleString()} spent
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Guest history */}
            {selected && (
              <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={16} /> {selected.name}'s History
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(124,58,237,0.06)', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>{selected.visitCount || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Visits</div>
                  </div>
                  <div style={{ flex: 1, padding: '10px', background: 'rgba(34,197,94,0.06)', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>₹{(selected.totalSpend || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Spent</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Past Orders</div>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {history.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No past orders found.</p>
                  ) : history.slice(0, 6).map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{o.billNo}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(o.createdAt).toLocaleDateString('en-IN')} · {o.items?.length} items</div>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)' }}>₹{o.total?.toFixed(0)}</div>
                    </div>
                  ))}
                </div>
                {selected.notes && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', fontSize: '0.75rem', color: '#92400e' }}>
                    📝 {selected.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* New Guest Form */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Full Name *</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rahul Sharma" autoFocus />
              </div>
              <div className="input-group">
                <label className="input-label">Phone Number</label>
                <input className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" type="tel" />
              </div>
              <div className="input-group">
                <label className="input-label">Email</label>
                <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="guest@email.com" type="email" />
              </div>
              <div className="input-group" style={{ gridColumn: '1/-1' }}>
                <label className="input-label">Notes / Preferences</label>
                <input className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Nut allergy, prefers window seat..." />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={handleWalkIn}>Walk-in (No Profile)</button>
        {tab === 'search' && selected && (
          <button className="btn btn-primary" onClick={handleConfirmGuest}>
            <CheckCircle size={15} /> Check In {selected.name}
          </button>
        )}
        {tab === 'new' && (
          <button className="btn btn-primary" onClick={handleCreateNew} disabled={!form.name.trim()}>
            <User size={15} /> Create & Check In
          </button>
        )}
      </div>
    </Modal>
  );
};

// ── Main POS Component ──────────────────────────────────────────────
const POS = () => {
  const { menu, settings, placeOrder } = useApp();
  const [tables, setTables] = useState(() =>
    INITIAL_TABLES.map(t => ({ ...t, status: t.baseStatus, guestName: null, guestId: null }))
  );
  const [view, setView] = useState('tables');
  const [activeTable, setActiveTable] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Starters');
  const [cart, setCart] = useState([]);
  const [savedOrders, setSavedOrders] = useState({});
  const [splitModal, setSplitModal] = useState(false);
  const [billModal, setBillModal] = useState(false);
  const [guestModal, setGuestModal] = useState(null); // tableId being opened
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [successMsg, setSuccessMsg] = useState('');

  // Derive menu items from DB, fall back to static if DB is empty
  const menuItems = useMemo(() => {
    if (menu && menu.length > 0) return menu.filter(i => i.active);
    return [
      { id: 1, name: 'Paneer Tikka', price: 250, category: 'Starters' },
      { id: 2, name: 'Chicken Wings', price: 300, category: 'Starters' },
      { id: 3, name: 'Crispy Nachos', price: 180, category: 'Starters' },
      { id: 5, name: 'Butter Chicken', price: 450, category: 'Main Course' },
      { id: 6, name: 'Garlic Naan', price: 60, category: 'Main Course' },
      { id: 7, name: 'Dal Makhani', price: 350, category: 'Main Course' },
      { id: 9, name: 'Gulab Jamun', price: 120, category: 'Desserts' },
      { id: 11, name: 'Fresh Lime Soda', price: 90, category: 'Beverages' },
      { id: 12, name: 'Cold Coffee', price: 150, category: 'Beverages' },
    ];
  }, [menu]);

  const gstRate = settings?.billing?.gstRate ?? 5;
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = cartTotal * (gstRate / 100);
  const grandTotal = cartTotal + tax;

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Step 1: Click table → open guest modal
  const handleTableClick = (table) => {
    if (table.status === 'occupied') {
      // Already has a session — go straight to order
      setActiveTable(table);
      setCart(savedOrders[table.id] || []);
      setView('order');
    } else {
      setGuestModal(table.id);
    }
  };

  // Step 2: Guest confirmed → open order view
  const handleGuestConfirmed = (guest) => {
    const tableId = guestModal;
    setTables(prev => prev.map(t => t.id === tableId
      ? { ...t, status: 'occupied', guestName: guest.name, guestId: guest.id || null }
      : t
    ));
    const table = tables.find(t => t.id === tableId);
    setActiveTable({ ...table, status: 'occupied', guestName: guest.name, guestId: guest.id });
    setCart(savedOrders[tableId] || []);
    setGuestModal(null);
    setView('order');
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0));
  };

  const handleSaveKOT = () => {
    if (cart.length === 0) return;
    setSavedOrders(prev => ({ ...prev, [activeTable.id]: cart }));
    showSuccess('KOT saved! Kitchen notified.');
  };

  const handleConfirmPayment = () => {
    if (cart.length === 0) return;

    // 1. Create order in database
    const order = placeOrder(activeTable.id, cart, paymentMethod);

    // 2. Update guest history if linked to a profile
    if (activeTable.guestId) {
      const guests = getAll('guests');
      const guest = guests.find(g => g.id === activeTable.guestId);
      if (guest) {
        const updatedGuests = guests.map(g => g.id === activeTable.guestId
          ? { ...g, visitCount: (g.visitCount || 0) + 1, totalSpend: (g.totalSpend || 0) + order.total }
          : g
        );
        localStorage.setItem('kitchgoo_guests', JSON.stringify(updatedGuests));
      }
    }

    // 3. Print receipt
    printReceipt({
      order: { ...order, items: cart },
      settings,
      tableId: activeTable.id,
      guestName: activeTable.guestName,
    });

    // 4. Clear table ← THE BUG FIX
    setSavedOrders(prev => {
      const next = { ...prev };
      delete next[activeTable.id];
      return next;
    });
    setTables(prev => prev.map(t => t.id === activeTable.id
      ? { ...t, status: 'available', guestName: null, guestId: null }
      : t
    ));

    // 5. Return to tables
    setCart([]);
    setBillModal(false);
    setView('tables');
    showSuccess(`Bill settled! ₹${order.total.toFixed(2)} via ${paymentMethod}.`);
  };

  // ── Tables View ──
  if (view === 'tables') {
    return (
      <div className="animate-fade-up">
        {successMsg && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white', padding: '12px 20px', borderRadius: '12px', zIndex: 999, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, boxShadow: '0 8px 24px rgba(34,197,94,0.35)', fontSize: '0.88rem' }}>
            <CheckCircle size={17} /> {successMsg}
          </div>
        )}

        <div className="page-title-row">
          <h1 className="page-title">POS & Billing</h1>
          <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} /> Available
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} /> Occupied
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '12px' }}>
          {tables.map(table => (
            <button key={table.id} onClick={() => handleTableClick(table)}
              style={{
                padding: '18px 14px', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(20px)',
                border: `2px solid ${table.status === 'occupied' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(0,0,0,0.1)'; }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: table.status === 'occupied' ? 'var(--danger)' : 'var(--success)', boxShadow: `0 0 8px ${table.status === 'occupied' ? 'rgba(239,68,68,0.6)' : 'rgba(34,197,94,0.6)'}`, marginBottom: '10px' }} />
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Table {table.id}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {table.status === 'occupied'
                  ? <><User size={10} style={{ display: 'inline', marginRight: 3 }} />{table.guestName || 'Guest'}{savedOrders[table.id] ? ' · KOT' : ''}</>
                  : 'Tap to seat guest'}
              </div>
            </button>
          ))}
        </div>

        {/* Guest Check-in Modal */}
        {guestModal && (
          <GuestModal
            tableId={guestModal}
            onConfirm={handleGuestConfirmed}
            onClose={() => setGuestModal(null)}
          />
        )}
      </div>
    );
  }

  // ── Order View ──
  const currentGuest = activeTable?.guestName;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 100px)', gap: '14px', overflow: 'hidden' }}>
      {successMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white', padding: '12px 20px', borderRadius: '12px', zIndex: 999, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, boxShadow: '0 8px 24px rgba(34,197,94,0.35)', fontSize: '0.88rem' }}>
          <CheckCircle size={17} /> {successMsg}
        </div>
      )}

      {/* Left — Menu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('tables')}>
              <ChevronLeft size={15} /> Tables
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Table {activeTable?.id}
                {currentGuest && <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.85rem' }}> — {currentGuest}</span>}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cart.length} item type{cart.length !== 1 ? 's' : ''} in cart</div>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={activeCategory === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ whiteSpace: 'nowrap' }}
            >{cat}</button>
          ))}
        </div>

        {/* Items Grid */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', alignContent: 'start' }}>
          {menuItems.filter(i => i.category === activeCategory).map(item => {
            const inCart = cart.find(c => c.id === item.id);
            return (
              <button key={item.id} onClick={() => addToCart(item)}
                style={{
                  padding: '14px', textAlign: 'left', borderRadius: '14px', cursor: 'pointer',
                  background: inCart ? 'rgba(124,58,237,0.07)' : 'rgba(255,255,255,0.65)',
                  backdropFilter: 'blur(16px)',
                  border: `1.5px solid ${inCart ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.7)'}`,
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '6px' }}>{item.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>₹{item.price}</span>
                  {inCart && <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'var(--primary)', color: 'white', borderRadius: '12px', padding: '2px 7px' }}>×{inCart.qty}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right — Cart */}
      <div style={{
        width: '310px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Order — Table {activeTable?.id}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {currentGuest && <><User size={11} /> {currentGuest} · </>}{cart.length} item{cart.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {cart.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
              <ShoppingCart size={32} strokeWidth={1.2} />
              <p style={{ fontSize: '0.82rem' }}>Add items from the menu</p>
            </div>
          ) : cart.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: '10px', border: '1px solid var(--border-subtle)', marginBottom: '5px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>₹{item.price} each</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button onClick={() => updateQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'white', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ width: 20, textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} style={{ width: 22, height: 22, borderRadius: '6px', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.07)', cursor: 'pointer', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', width: '48px', textAlign: 'right', flexShrink: 0 }}>₹{item.price * item.qty}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ fontWeight: 600 }}>₹{cartTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>GST ({gstRate}%)</span>
            <span style={{ fontWeight: 600 }}>₹{tax.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingTop: '10px', borderTop: '1.5px dashed var(--border-subtle)' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary)' }}>₹{grandTotal.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '8px' }} onClick={handleSaveKOT} disabled={cart.length === 0}>
              <Bookmark size={14} /> KOT
            </button>
            <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.78rem', padding: '8px' }} onClick={() => cart.length > 0 && setSplitModal(true)} disabled={cart.length === 0}>
              <Split size={14} /> Split
            </button>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => cart.length > 0 && setBillModal(true)} disabled={cart.length === 0}>
            <Printer size={15} /> Print Bill & Settle
          </button>
        </div>
      </div>

      {/* Split Bill Modal */}
      {splitModal && (
        <Modal title="Split Bill" onClose={() => setSplitModal(false)}>
          <div className="modal-body">
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Total: <strong>₹{grandTotal.toFixed(2)}</strong> — Select split:
            </p>
            {[2, 3, 4].map(n => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '10px', marginBottom: '8px', background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Split {n} ways</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>₹{(grandTotal / n).toFixed(2)} / person</span>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setSplitModal(false)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Bill Confirmation Modal */}
      {billModal && (
        <Modal title="Confirm & Print Bill" onClose={() => setBillModal(false)}>
          <div className="modal-body">
            <div style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Table {activeTable?.id}{currentGuest ? ` — ${currentGuest}` : ''}</span>
              </div>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.name} ×{item.qty}</span>
                  <span style={{ fontWeight: 600 }}>₹{item.price * item.qty}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed var(--border-subtle)', marginTop: '8px', paddingTop: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{cartTotal.toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>GST ({gstRate}%)</span><span>₹{tax.toFixed(2)}</span></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1rem', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', marginTop: '4px' }}>
                <span>TOTAL</span>
                <span style={{ color: 'var(--primary)' }}>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Payment Method</label>
              <select className="input-field" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {['Cash', 'UPI / QR', 'Card', 'Wallet'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setBillModal(false)}>Cancel</button>
            <button className="btn btn-success" onClick={handleConfirmPayment}>
              <Printer size={15} /> Print & Settle ₹{grandTotal.toFixed(2)}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default POS;
