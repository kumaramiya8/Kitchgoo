import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../db/AppContext';
import { initTenantDB } from '../db/database';
import { 
  Search, ShoppingCart, Plus, Minus, Check, ChevronRight, X, ArrowLeft, Utensils, Award
} from 'lucide-react';

const QRMenu = () => {
  const { tenantId } = useParams();
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table') || '';

  const { menu, settings, reload, posTables, setPosTables, posSavedOrders, setPosSavedOrders, fireToKDS } = useApp();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState({}); // { itemId: { item, qty, notes } }
  const [showCart, setShowCart] = useState(false);
  
  // Checkout form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [tableNumber, setTableNumber] = useState(tableParam);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Override global scroll lock styles from index.css for the public QR Menu page
  useEffect(() => {
    const origBodyOverflow = document.body.style.overflow;
    const origHtmlOverflow = document.documentElement.style.overflow;
    const origBodyHeight = document.body.style.height;
    const origHtmlHeight = document.documentElement.style.height;
    
    const rootEl = document.getElementById('root');
    const origRootHeight = rootEl ? rootEl.style.height : '';

    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    document.body.style.height = 'auto';
    document.documentElement.style.height = 'auto';
    if (rootEl) {
      rootEl.style.height = 'auto';
    }

    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origHtmlOverflow;
      document.body.style.height = origBodyHeight;
      document.documentElement.style.height = origHtmlHeight;
      if (rootEl) {
        rootEl.style.height = origRootHeight;
      }
    };
  }, []);

  // Lock background scroll when the cart drawer is open to prevent scroll leaks on mobile
  useEffect(() => {
    if (showCart) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    }
  }, [showCart]);

  useEffect(() => {
    async function load() {
      try {
        await initTenantDB(tenantId);
        await reload();
      } catch (err) {
        console.error('[QRMenu] Error loading tenant database:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  // Poll database every 15 seconds to fetch incoming POS table statuses and active orders
  useEffect(() => {
    const interval = setInterval(() => {
      reload();
    }, 15000);
    return () => clearInterval(interval);
  }, [reload]);

  // Prefill guest name if table is already occupied
  useEffect(() => {
    if (tableNumber && posTables) {
      const targetTable = posTables.find(t => String(t.number || t.id).trim().toLowerCase() === tableNumber.trim().toLowerCase());
      if (targetTable && targetTable.guestName) {
        setCustomerName(targetTable.guestName);
      }
    }
  }, [tableNumber, posTables]);

  // Sync guest table ID to sessionStorage for concurrency-safe database merging
  useEffect(() => {
    if (tableNumber && posTables) {
      const targetTable = posTables.find(t => String(t.number || t.id).trim().toLowerCase() === tableNumber.trim().toLowerCase());
      if (targetTable) {
        window.sessionStorage.setItem('kitchgoo_guest_table', targetTable.id);
      }
    }
  }, [tableNumber, posTables]);

  // Derived active menu items
  const menuItems = useMemo(() => {
    if (!menu) return [];
    return menu.filter(item => item.active !== false && !item.sold86);
  }, [menu]);

  // Categories list
  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return ['All', ...cats];
  }, [menuItems]);

  // Filtered menu list
  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    } else if (activeCategory !== 'All') {
      items = items.filter(i => i.category === activeCategory);
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  // Fetch active items on the table from posSavedOrders
  const guestTableOrder = useMemo(() => {
    if (!tableNumber) return null;
    const targetTable = (posTables || []).find(t => String(t.number || t.id).trim().toLowerCase() === tableNumber.trim().toLowerCase());
    if (targetTable && targetTable.status !== 'available') {
      return (posSavedOrders || {})[targetTable.id] || [];
    }
    return null;
  }, [posTables, posSavedOrders, tableNumber]);

  const billTotal = useMemo(() => {
    if (!guestTableOrder) return 0;
    return guestTableOrder.reduce((sum, item) => {
      const modPrice = (item.modifiers || []).reduce((ms, m) => ms + (m.price || 0), 0);
      return sum + (item.price + modPrice) * item.qty;
    }, 0);
  }, [guestTableOrder]);

  // Helper values
  const cartItemsCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, item) => sum + (item.item.price * item.qty), 0);

  const handleAddToCart = (item) => {
    setCart(prev => {
      const existing = prev[item.id];
      if (existing) {
        return {
          ...prev,
          [item.id]: { ...existing, qty: existing.qty + 1 }
        };
      } else {
        return {
          ...prev,
          [item.id]: { item, qty: 1, notes: '' }
        };
      }
    });
  };

  const handleRemoveFromCart = (itemId) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      } else {
        return {
          ...prev,
          [itemId]: { ...existing, qty: existing.qty - 1 }
        };
      }
    });
  };

  const handleUpdateNotes = (itemId, noteText) => {
    setCart(prev => {
      if (!prev[itemId]) return prev;
      return {
        ...prev,
        [itemId]: { ...prev[itemId], notes: noteText }
      };
    });
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !tableNumber.trim()) {
      alert('Please fill out your Name and Table Number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetTable = (posTables || []).find(
        t => String(t.number || t.id).trim().toLowerCase() === tableNumber.trim().toLowerCase()
      );

      if (!targetTable) {
        alert(`Table "${tableNumber}" was not found in the restaurant layout.`);
        setIsSubmitting(false);
        return;
      }

      const newItems = Object.values(cart).map(c => {
        const itemId = c.item.id || `item_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: itemId,
          name: c.item.name,
          price: c.item.price,
          qty: c.qty,
          _cartKey: `${itemId}_`,
          modifiers: [],
          specialInstructions: c.notes || '',
          modifierGroups: c.item.modifierGroups || [],
          course: 1,
          seat: 1,
        };
      });

      const existingItems = (posSavedOrders || {})[targetTable.id] || [];
      const mergedItems = [...existingItems];
      newItems.forEach(newItem => {
        const idx = mergedItems.findIndex(i => (i._cartKey || i.id) === (newItem._cartKey || newItem.id));
        if (idx >= 0) {
          mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + newItem.qty };
        } else {
          mergedItems.push(newItem);
        }
      });

      // Occupy table
      setPosTables(prev => prev.map(t => String(t.id) === String(targetTable.id) ? {
        ...t,
        status: 'ordered',
        guestName: customerName.trim(),
        seatedAt: t.seatedAt || new Date().toISOString()
      } : t));

      // Update active table cart items
      setPosSavedOrders(prev => ({
        ...(prev || {}),
        [targetTable.id]: mergedItems
      }));

      // Fire only the newly added items to KDS immediately
      const kdsOrderId = `QR-${targetTable.number || targetTable.id}-${Date.now().toString().slice(-4)}`;
      await fireToKDS(kdsOrderId, newItems, targetTable.id, 'dine-in');

      setOrderSuccess(true);
      setCart({});
      setShowCart(false);
    } catch (err) {
      console.error('[QRMenu] Error placing order:', err);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: '#f8fafc', 
        color: 'var(--text-secondary)' 
      }}>
        <Utensils className="animate-spin" size={32} style={{ color: 'var(--primary)', marginBottom: 12 }} />
        <p style={{ fontWeight: 600 }}>Loading digital menu...</p>
      </div>
    );
  }

  const restaurantName = settings?.restaurant?.name || tenantId || 'Kitchgoo';

  if (orderSuccess) {
    return (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: '#f8fafc', 
        padding: 24, 
        textAlign: 'center' 
      }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Check size={40} strokeWidth={3} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e1b4b', marginBottom: 8 }}>Order Placed Successfully!</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 300, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
          Your order has been sent directly to the kitchen. Please sit back and relax while we prepare your food!
        </p>
        <button className="btn btn-primary" onClick={() => setOrderSuccess(false)}>
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#f8fafc', 
      paddingBottom: cartItemsCount > 0 ? 100 : 40, 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {/* Premium Cover Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--primary), #a855f7)', 
        color: 'white', 
        padding: '30px 20px 24px 20px', 
        borderBottomLeftRadius: 24, 
        borderBottomRightRadius: 24,
        boxShadow: '0 4px 20px rgba(124, 58, 237, 0.15)',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.9, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
              <Award size={13} /> Digital QR Menu
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px', margin: 0 }}>{restaurantName}</h1>
            <p style={{ fontSize: '0.82rem', opacity: 0.85, marginTop: 4, marginBottom: 0 }}>Welcome! Scan, order, and enjoy.</p>
          </div>
          {tableNumber && (
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: 12, fontWeight: 800, fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)' }}>
              Table {tableNumber}
            </div>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        
        {guestTableOrder && guestTableOrder.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
            borderRadius: 20,
            padding: 16,
            marginBottom: 20,
            border: '1px solid rgba(124, 58, 237, 0.15)',
            boxShadow: '0 8px 30px rgba(124, 58, 237, 0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Utensils size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e1b4b' }}>Active Table Order</span>
              </div>
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: 700, 
                color: '#d97706', 
                background: 'rgba(217, 119, 6, 0.08)', 
                padding: '4px 10px', 
                borderRadius: 20,
                border: '1px solid rgba(217, 119, 6, 0.15)'
              }}>
                PAYMENT PENDING
              </span>
            </div>

            {/* List of items already ordered */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
              {guestTableOrder.map((item, idx) => {
                const modPrice = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                const itemTotal = (item.price + modPrice) * item.qty;
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.82rem', borderBottom: '1px dashed rgba(0,0,0,0.04)', paddingBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: 'var(--primary)', marginRight: 6 }}>{item.qty}x</span>
                      <span style={{ fontWeight: 600, color: '#374151' }}>{item.name}</span>
                      {item.specialInstructions && (
                        <div style={{ fontSize: '0.72rem', color: '#b45309', fontStyle: 'italic', marginTop: 2 }}>
                          Note: {item.specialInstructions}
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: '#1e1b4b' }}>
                      ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '12px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Current Bill (Subtotal):</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--primary)' }}>
                ₹{billTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
              You can add more items to this order by selecting from the menu below.
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search delicious dishes..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '12px 16px 12px 40px', 
              borderRadius: 16, 
              border: '1.5px solid var(--border-subtle)', 
              background: '#fff', 
              fontSize: '0.9rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              outline: 'none',
              transition: 'border-color var(--t-fast)'
            }} 
          />
          {searchQuery && (
            <X 
              size={16} 
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}
              onClick={() => setSearchQuery('')}
            />
          )}
        </div>

        {/* Categories Scroller */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, margin: '0 -16px 8px -16px', paddingLeft: 16, paddingRight: 16 }} className="scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: '0.82rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: 'none',
                background: activeCategory === cat ? 'var(--primary)' : '#fff',
                color: activeCategory === cat ? 'white' : 'var(--text-secondary)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                transition: 'all var(--t-fast)'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.map(item => {
            const cartQty = cart[item.id]?.qty || 0;
            return (
              <div 
                key={item.id} 
                className="card" 
                style={{ 
                  padding: 12, 
                  display: 'flex', 
                  gap: 12, 
                  alignItems: 'center', 
                  background: '#fff', 
                  borderRadius: 16,
                  border: '1px solid var(--border-subtle)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}
              >
                {/* Item Thumbnail Crop */}
                <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', background: 'rgba(124,58,237,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ fontSize: '1.8rem', opacity: 0.2 }}>🍔</div>
                  )}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 3px 0', color: '#1e1b4b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.name}</h3>
                  {item.description && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 6px 0', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>
                      ₹{item.price.toLocaleString('en-IN')}
                    </span>

                    {/* Quantity controller */}
                    {cartQty > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--primary-light)', padding: '2px 4px', borderRadius: 8 }}>
                        <button 
                          onClick={() => handleRemoveFromCart(item.id)}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <Minus size={13} strokeWidth={2.5} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', minWidth: 14, textAlign: 'center' }}>{cartQty}</span>
                        <button 
                          onClick={() => handleAddToCart(item)}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <Plus size={13} strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleAddToCart(item)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 12px', fontSize: '0.78rem', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Plus size={12} /> Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
              <Utensils size={32} style={{ strokeWidth: 1.5, margin: '0 auto 12px auto', opacity: 0.5 }} />
              <p style={{ fontSize: '0.88rem' }}>No items match your search.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Cart Bar */}
      {cartItemsCount > 0 && (
        <div style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          background: 'rgba(255,255,255,0.9)', 
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border-subtle)', 
          padding: '12px 16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          zIndex: 10,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.05)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{cartItemsCount} item{cartItemsCount > 1 ? 's' : ''} added</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>₹{cartSubtotal.toLocaleString('en-IN')}</div>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowCart(true)}
            style={{ padding: '10px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShoppingCart size={15} /> View Cart <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {showCart && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(30,27,75,0.5)', 
          zIndex: 99, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'flex-end' 
        }}>
          {/* Dismiss overlay click */}
          <div style={{ flex: 1 }} onClick={() => setShowCart(false)} />
          
          {/* Drawer content */}
          <div style={{ 
            background: '#fff', 
            borderTopLeftRadius: 24, 
            borderTopRightRadius: 24, 
            maxHeight: '85vh', 
            display: 'flex', 
            flexDirection: 'column',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
            animation: 'slideUp 0.3s ease-out'
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e1b4b', margin: 0 }}>Your Cart</h2>
              <button 
                onClick={() => setShowCart(false)} 
                style={{ border: 'none', background: 'rgba(0,0,0,0.04)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              
              {/* Cart Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {Object.entries(cart).map(([itemId, cartItem]) => (
                  <div key={itemId} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e1b4b' }}>{cartItem.item.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>₹{cartItem.item.price} each</div>
                      </div>
                      
                      {/* Qty selectors */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary-light)', padding: '2px 4px', borderRadius: 8 }}>
                        <button 
                          onClick={() => handleRemoveFromCart(itemId)}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 4 }}
                        >
                          <Minus size={12} strokeWidth={2.5} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)', minWidth: 12, textAlign: 'center' }}>{cartItem.qty}</span>
                        <button 
                          onClick={() => handleAddToCart(cartItem.item)}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 4 }}
                        >
                          <Plus size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>

                    {/* Special instruction for item */}
                    <input 
                      type="text" 
                      placeholder="Add preparation notes (e.g. less spice, no onion)..."
                      value={cartItem.notes || ''}
                      onChange={e => handleUpdateNotes(itemId, e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '6px 10px', 
                        borderRadius: 8, 
                        border: '1px solid var(--border-subtle)', 
                        fontSize: '0.72rem', 
                        background: '#f8fafc',
                        outline: 'none'
                      }} 
                    />
                  </div>
                ))}
              </div>

              {/* Checkout Form */}
              <form onSubmit={handlePlaceOrder} style={{ borderTop: '2px dashed var(--border-subtle)', paddingTop: 16 }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e1b4b', marginBottom: 12 }}>Guest Details</h3>
                
                <div className="input-group" style={{ marginBottom: 12 }}>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Your Name *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Enter payee/customer name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="input-field" 
                    style={{ margin: 0, padding: 10, fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10, marginBottom: 12 }}>
                  <div className="input-group">
                    <label className="input-label" style={{ fontSize: '0.75rem' }}>Phone Number (Optional)</label>
                    <input 
                      type="tel" 
                      placeholder="e.g. +91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="input-field" 
                      style={{ margin: 0, padding: 10, fontSize: '0.85rem' }}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label" style={{ fontSize: '0.75rem' }}>Table No. *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. 5"
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      className="input-field" 
                      style={{ margin: 0, padding: 10, fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div className="input-group" style={{ marginBottom: 20 }}>
                  <label className="input-label" style={{ fontSize: '0.75rem' }}>Additional Remarks / Instructions (Optional)</label>
                  <textarea 
                    placeholder="Any general instruction for the kitchen..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="input-field" 
                    rows={2}
                    style={{ margin: 0, padding: 10, fontSize: '0.85rem', resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Amount</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)' }}>₹{cartSubtotal.toLocaleString('en-IN')}</span>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '12px', borderRadius: 12, fontWeight: 700 }}
                >
                  {isSubmitting ? 'Sending Order...' : 'Send Order to Kitchen'}
                </button>
              </form>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRMenu;
