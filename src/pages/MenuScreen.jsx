import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Save, ToggleLeft, ToggleRight, Search } from 'lucide-react';
import { useApp } from '../db/AppContext';

const CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Beverages', 'Breads', 'Salads'];

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

const MenuScreen = () => {
  const { menu, addMenuItem, editMenuItem, deleteMenuItem, toggleMenuItemAvailability } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', price: '', category: 'Starters', type: 'Veg', active: true, description: '', preparationTime: '' });

  const allCategories = ['All', ...CATEGORIES];

  const filtered = menu.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterCat === 'All' || i.category === filterCat)
  );

  const openAdd = () => {
    setForm({ name: '', price: '', category: 'Starters', type: 'Veg', active: true, description: '', preparationTime: '' });
    setAddModal(true);
  };

  const openEdit = (item) => {
    setForm({ name: item.name, price: item.price, category: item.category, type: item.type, active: item.active, description: item.description || '', preparationTime: item.preparationTime || '' });
    setEditModal(item);
  };

  const handleSaveNew = () => {
    if (!form.name.trim() || !form.price) return;
    addMenuItem({ ...form, preparationTime: parseInt(form.preparationTime) || 15 });
    setAddModal(false);
  };

  const handleSaveEdit = () => {
    editMenuItem(editModal.id, { ...form, preparationTime: parseInt(form.preparationTime) || 15 });
    setEditModal(null);
  };

  const ItemForm = ({ onSave, saveLabel }) => (
    <>
      <div className="modal-body">
        <div className="input-group">
          <label className="input-label">Item Name</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Butter Chicken" />
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <input className="input-field" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="input-group">
            <label className="input-label">Price (₹)</label>
            <input className="input-field" type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="input-group">
            <label className="input-label">Prep Time (mins)</label>
            <input className="input-field" type="number" min="1" value={form.preparationTime} onChange={e => setForm(f => ({ ...f, preparationTime: e.target.value }))} placeholder="15" />
          </div>
          <div className="input-group">
            <label className="input-label">Category</label>
            <select className="input-field" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Dietary Type</label>
            <select className="input-field" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option>Veg</option>
              <option>Non-Veg</option>
              <option>Vegan</option>
            </select>
          </div>
          <div className="input-group" style={{ gridColumn: '1/-1' }}>
            <label className="input-label">Availability</label>
            <select className="input-field" value={form.active ? 'available' : 'unavailable'} onChange={e => setForm(f => ({ ...f, active: e.target.value === 'available' }))}>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => { setAddModal(false); setEditModal(null); }}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave}><Save size={14} /> {saveLabel}</button>
      </div>
    </>
  );

  return (
    <div className="animate-fade-up">
      <div className="page-title-row">
        <h1 className="page-title">Menu Catalog</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {menu.filter(i => i.active).length} available · {menu.length} total
          </span>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '340px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input-field" style={{ paddingLeft: '36px' }} placeholder="Search menu..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {allCategories.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={filterCat === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'center' }}>Prep</th>
                <th style={{ textAlign: 'center' }}>Available</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>No items found.</td></tr>
              )}
              {filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>
                    {item.name}
                    {item.description && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>{item.description}</div>}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.category}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                        background: item.type === 'Veg' ? 'var(--success)' : item.type === 'Vegan' ? '#22c55e' : 'var(--danger)',
                      }} />
                      {item.type}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>₹{Number(item.price).toFixed(2)}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.preparationTime || '—'} min</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleMenuItemAvailability(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.active ? 'var(--success)' : 'var(--text-muted)' }}>
                      {item.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(item)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteConfirm(item)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addModal && <Modal title="Add Menu Item" onClose={() => setAddModal(false)}><ItemForm onSave={handleSaveNew} saveLabel="Add Item" /></Modal>}
      {editModal && <Modal title={`Edit — ${editModal.name}`} onClose={() => setEditModal(null)}><ItemForm onSave={handleSaveEdit} saveLabel="Save Changes" /></Modal>}

      {deleteConfirm && (
        <Modal title="Delete Item" onClose={() => setDeleteConfirm(null)}>
          <div className="modal-body">
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteMenuItem(deleteConfirm.id); setDeleteConfirm(null); }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MenuScreen;
