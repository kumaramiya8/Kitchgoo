import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Smartphone, ShoppingBag, UtensilsCrossed, Monitor, Clock, Check,
  CheckCircle2, AlertCircle, Plus, Minus, Trash2, Search, X, QrCode,
  CreditCard, Banknote, Split, Wallet, ArrowRight, ChevronRight,
  Sparkles, ChefHat, RotateCcw, AlertTriangle, User, Phone, Flame,
  FileText, Printer, CheckCircle, Bell, ArrowLeft, Filter, Tag, Hash,
  Volume2, VolumeX, ShieldAlert, Coffee
} from 'lucide-react';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { calculateTableBill } from '../utils/tableOrders';
import { printReceipt, printKOT } from '../utils/printReceipt';
import { saveTableOrder, saveTableState, getAll, insert } from '../db/database';
import { isModuleEnabled } from '../../shared/seeds';

// ── Sound chime for Waiter ready orders ───────────────────────
let _waiterAudioCtx = null;
function playWaiterChime() {
  try {
    if (!_waiterAudioCtx) _waiterAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_waiterAudioCtx.state === 'suspended') _waiterAudioCtx.resume();
    const ctx = _waiterAudioCtx;
    const t = ctx.currentTime;
    [[659.25, 0], [880, 0.15], [1046.5, 0.3]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.45);
      osc.start(t + delay);
      osc.stop(t + delay + 0.5);
    });
  } catch {}
}

const COMMON_NOTES = [
  '🌶️ Extra Spicy', '🍃 Mild / No Spicy', '🧅 No Onion / Garlic',
  '🧀 Extra Cheese', '🧊 Less Ice', '🌱 Jain Prep', '⚡ Serve Fast',
  '🧂 Less Salt', '🍽️ Extra Plates'
];

export default function WaiterView() {
  const { user } = useAuth();
  const {
    menu, settings, posTables, setPosTables, posSavedOrders, setPosSavedOrders,
    kdsTickets, setKdsTickets, fireToKDS, placeOrder, guests, redeemWalletCredit,
    broadcastOrderCreated, bumpKDSTicketAction
  } = useApp();

  // ── Tab State: 'order' (Take Order) | 'kds' (Kitchen Status) ──
  const [activeTab, setActiveTab] = useState('order');

  // ── Active Table Selection ──────────────────────────────────
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [directMode, setDirectMode] = useState(false);
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'free' | 'occupied'

  // ── Cart State ──────────────────────────────────────────────
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState(2);

  // ── Menu Filter & Search ────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);

  // ── Modals / Sheets ─────────────────────────────────────────
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [noteItem, setNoteItem] = useState(null); // item to add notes to
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(null); // order success data
  const [kitchenFilter, setKitchenFilter] = useState('all'); // 'all' | 'mine'

  // ── Payment Modal States ────────────────────────────────────
  const [payMethod, setPayMethod] = useState('Cash'); // 'Cash' | 'UPI' | 'Card' | 'Split'
  const [cashTendered, setCashTendered] = useState('');
  const [walletRedeemed, setWalletRedeemed] = useState(0);
  const [splitMode, setSplitMode] = useState('even'); // 'even' | 'custom'
  const [splitCount, setSplitCount] = useState(2);
  const [splitPaidParts, setSplitPaidParts] = useState({});
  const [customSplits, setCustomSplits] = useState([
    { method: 'Cash', amount: '' },
    { method: 'UPI', amount: '' },
  ]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // ── Notification badge for KDS Ready ────────────────────────
  const [dismissedReadyTickets, setDismissedReadyTickets] = useState(new Set());
  const prevReadyCountRef = useRef(0);

  // Extract active table object
  const activeTable = useMemo(() => {
    if (directMode || !selectedTableId) return null;
    return (posTables || []).find(t => String(t.id) === String(selectedTableId) || String(t.number) === String(selectedTableId)) || null;
  }, [posTables, selectedTableId, directMode]);

  // Sync Cart with active table's saved order
  useEffect(() => {
    if (activeTable) {
      const saved = posSavedOrders?.[activeTable.id] || posSavedOrders?.[activeTable.number];
      if (Array.isArray(saved)) {
        setCart(saved);
      } else {
        setCart([]);
      }
      setCustomerName(activeTable.guestName || '');
      setCustomerPhone(activeTable.guestPhone || '');
      setPartySize(activeTable.partySize || activeTable.seats || 2);
    } else if (directMode) {
      // Direct order starts with current cart
    } else {
      setCart([]);
    }
  }, [activeTable, posSavedOrders, directMode]);

  // Categories
  const categories = useMemo(() => {
    const set = new Set();
    (menu || []).forEach(m => {
      if (m.category) set.add(m.category);
    });
    return ['All', ...Array.from(set)];
  }, [menu]);

  // Filtered Menu
  const filteredMenu = useMemo(() => {
    return (menu || []).filter(item => {
      if (item.available === false || item.isAvailable === false || item.status === 'out_of_stock') {
        return false;
      }
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      if (vegOnly && !item.isVeg && item.dietary !== 'veg' && item.dietary !== 'vegan') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.name || '').toLowerCase().includes(q);
        const matchesCat = (item.category || '').toLowerCase().includes(q);
        const matchesCode = (item.code || item.shortCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCat && !matchesCode) return false;
      }
      return true;
    });
  }, [menu, selectedCategory, vegOnly, searchQuery]);

  // Bill Calculations
  const billDetails = useMemo(() => {
    return calculateTableBill({
      items: cart,
      settings,
      partySize,
      orderType: directMode ? 'takeout' : 'dine-in',
    });
  }, [cart, settings, partySize, directMode]);

  // ── Table filtering ─────────────────────────────────────────
  const filteredTables = useMemo(() => {
    return (posTables || []).filter(t => {
      const hasOrder = Boolean(posSavedOrders?.[t.id]?.length || posSavedOrders?.[t.number]?.length);
      const isOccupied = t.status === 'occupied' || t.status === 'ordered' || t.status === 'eating' || hasOrder;
      const isBussing = t.status === 'needs-bussing';
      const isFree = !isOccupied && !isBussing;

      if (tableFilter === 'free') return isFree;
      if (tableFilter === 'occupied') return isOccupied;
      if (tableFilter === 'bussing') return isBussing;
      return true;
    });
  }, [posTables, posSavedOrders, tableFilter]);

  // ── Cart Operations ─────────────────────────────────────────
  const addToCart = useCallback((item) => {
    setCart(prev => {
      const idx = prev.findIndex(i => (i.id || i.itemId) === item.id);
      let updated;
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = { ...updated[idx], qty: (updated[idx].qty || 1) + 1 };
      } else {
        updated = [...prev, {
          id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          category: item.category || 'Mains',
          isVeg: item.isVeg ?? (item.dietary === 'veg' || item.dietary === 'vegan'),
          qty: 1,
          notes: '',
        }];
      }
      // Auto save to active table
      if (activeTable) {
        saveTableOrder(activeTable.id, updated).catch(() => {});
        setPosSavedOrders(s => ({ ...s, [activeTable.id]: updated }));
      }
      return updated;
    });
  }, [activeTable, setPosSavedOrders]);

  const updateCartQty = useCallback((itemId, delta) => {
    setCart(prev => {
      const idx = prev.findIndex(i => (i.id || i.itemId) === itemId);
      if (idx < 0) return prev;
      let updated;
      const newQty = (prev[idx].qty || 1) + delta;
      if (newQty <= 0) {
        updated = prev.filter((_, i) => i !== idx);
      } else {
        updated = [...prev];
        updated[idx] = { ...updated[idx], qty: newQty };
      }
      if (activeTable) {
        saveTableOrder(activeTable.id, updated).catch(() => {});
        setPosSavedOrders(s => ({ ...s, [activeTable.id]: updated }));
      }
      return updated;
    });
  }, [activeTable, setPosSavedOrders]);

  const updateItemNote = useCallback((itemId, noteText) => {
    setCart(prev => {
      const updated = prev.map(i => (i.id || i.itemId) === itemId ? { ...i, notes: noteText } : i);
      if (activeTable) {
        saveTableOrder(activeTable.id, updated).catch(() => {});
        setPosSavedOrders(s => ({ ...s, [activeTable.id]: updated }));
      }
      return updated;
    });
  }, [activeTable, setPosSavedOrders]);

  // Clean / Clear Table from needs-bussing to available
  const handleCleanTable = async (table) => {
    const updated = { ...table, status: 'available', guestName: null, guestId: null, seatedAt: null };
    setPosTables(prev => prev.map(t => String(t.id) === String(table.id) ? updated : t));
    await saveTableState(table.id, updated);
    await saveTableOrder(table.id, null);
    setPosSavedOrders(prev => {
      const next = { ...prev };
      delete next[table.id];
      delete next[table.number];
      return next;
    });
  };

  // ── Fire KOT Action ─────────────────────────────────────────
  const handleFireKOT = async () => {
    if (cart.length === 0) {
      alert('Please add items to cart before firing KOT.');
      return;
    }
    const orderId = activeTable ? `T${activeTable.number || activeTable.id}-${Date.now().toString().slice(-4)}` : `DIR-${Date.now().toString().slice(-4)}`;
    const tableId = activeTable ? activeTable.id : null;
    const orderType = directMode ? 'takeout' : 'dine-in';

    try {
      await fireToKDS(orderId, cart, tableId, orderType, {
        tableName: activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Direct Order',
        waiterName: user?.name || 'Waiter',
        guestName: customerName || null,
      });

      if (activeTable) {
        const updatedTable = {
          ...activeTable,
          status: 'ordered',
          guestName: customerName || activeTable.guestName || 'Dine-In Guest',
          guestPhone: customerPhone || null,
          partySize,
          seatedAt: activeTable.seatedAt || new Date().toISOString(),
        };
        setPosTables(prev => prev.map(t => String(t.id) === String(activeTable.id) ? updatedTable : t));
        await saveTableState(activeTable.id, updatedTable);
        await saveTableOrder(activeTable.id, cart);
      }

      broadcastOrderCreated(tableId, orderId);

      // Print KOT if configured
      if (settings?.printer?.autoPrintKOT || settings?.operations?.autoKOT) {
        try {
          printKOT({
            orderId,
            items: cart,
            tableId: activeTable?.id,
            tableName: activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Direct',
            serverName: user?.name || 'Waiter',
            settings,
          });
        } catch {}
      }

      playWaiterChime();
      alert(`🔥 KOT Fired successfully for ${activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Order'}!`);
      setShowCartDrawer(false);
    } catch (err) {
      console.error('[WaiterView] Failed to fire KOT:', err);
      alert('Failed to send KOT to kitchen. Please notify kitchen staff.');
    }
  };

  // ── Customer Wallet Matching ────────────────────────────────
  const matchedGuest = useMemo(() => {
    if (!customerPhone || customerPhone.length < 5) return null;
    const clean = customerPhone.replace(/\D/g, '');
    return (guests || []).find(g => (g.phone || '').replace(/\D/g, '').includes(clean));
  }, [guests, customerPhone]);

  const guestWalletBalance = Number(matchedGuest?.walletBalance || matchedGuest?.credit || 0);

  // Remaining payable after wallet
  const remainingPayable = Math.max(0, billDetails.grandTotal - walletRedeemed);

  // ── Cash Change Calculation ─────────────────────────────────
  const cashChange = useMemo(() => {
    if (payMethod !== 'Cash' || !cashTendered) return 0;
    const tendered = parseFloat(cashTendered) || 0;
    return Math.max(0, tendered - remainingPayable);
  }, [payMethod, cashTendered, remainingPayable]);

  // ── Complete Settlement Action ──────────────────────────────
  const handleCompletePayment = async () => {
    if (cart.length === 0) return;
    setIsSubmittingOrder(true);

    try {
      const tableId = activeTable ? activeTable.id : null;
      let effectiveMethod = payMethod;
      let extraSplits = null;

      if (payMethod === 'Split') {
        if (splitMode === 'even') {
          const perPerson = Math.round((remainingPayable / splitCount) * 100) / 100;
          extraSplits = Array.from({ length: splitCount }, (_, i) => ({
            method: splitPaidParts[i] || 'Cash',
            amount: perPerson,
          }));
          effectiveMethod = 'Split';
        } else {
          extraSplits = customSplits.filter(s => parseFloat(s.amount) > 0);
          effectiveMethod = 'Split';
        }
      }

      const extra = {
        waiterName: user?.name || 'Waiter',
        customerName: customerName || matchedGuest?.name || (activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Direct Guest'),
        customerPhone: customerPhone || matchedGuest?.phone || null,
        partySize,
        subtotal: billDetails.subtotal,
        tax: billDetails.tax,
        serviceCharge: billDetails.serviceCharge,
        grandTotal: billDetails.grandTotal,
        walletRedeemed: walletRedeemed > 0 ? walletRedeemed : 0,
        amountTendered: payMethod === 'Cash' ? (parseFloat(cashTendered) || remainingPayable) : remainingPayable,
        changeReturned: cashChange,
        paymentSplits: extraSplits,
        status: 'paid',
      };

      const placedOrder = await placeOrder(tableId, cart, effectiveMethod, extra);

      // Redeem wallet credit if applied
      if (walletRedeemed > 0 && customerPhone) {
        try {
          await redeemWalletCredit({
            guestPhone: customerPhone,
            guestId: matchedGuest?.id,
            amount: walletRedeemed,
            orderId: placedOrder?.id,
            billNo: placedOrder?.billNo,
          });
        } catch (wErr) {
          console.error('[WaiterView] Wallet redemption error:', wErr);
        }
      }

      // Free / Bus table
      if (activeTable) {
        const updatedTable = {
          ...activeTable,
          status: settings?.operations?.autoBussing ? 'needs-bussing' : 'available',
          guestName: null,
          guestPhone: null,
          guestId: null,
          seatedAt: null,
        };
        setPosTables(prev => prev.map(t => String(t.id) === String(activeTable.id) ? updatedTable : t));
        await saveTableState(activeTable.id, updatedTable);
        await saveTableOrder(activeTable.id, null);
        setPosSavedOrders(prev => {
          const next = { ...prev };
          delete next[activeTable.id];
          delete next[activeTable.number];
          return next;
        });
        broadcastOrderCreated(activeTable.id, placedOrder?.id);
      }

      // Reset
      setShowPaymentSheet(false);
      setShowCartDrawer(false);
      setShowSuccessModal({
        order: placedOrder,
        table: activeTable,
        total: billDetails.grandTotal,
        method: effectiveMethod,
      });

      // Clear local active selection
      setCart([]);
      setSelectedTableId(null);
      setDirectMode(false);
      setWalletRedeemed(0);
      setCashTendered('');
    } catch (err) {
      console.error('[WaiterView] Settlement failed:', err);
      alert('Failed to settle bill: ' + (err.message || 'Please try again.'));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // ── KDS Tickets for Waiter Tab ──────────────────────────────
  const readyTickets = useMemo(() => {
    return (kdsTickets || []).filter(t => {
      if (dismissedReadyTickets.has(t.id)) return false;
      const isCompleted = t.status === 'completed';
      const hasBumpedItems = (t.items || []).some(i => i.status === 'bumped');
      return isCompleted || hasBumpedItems;
    });
  }, [kdsTickets, dismissedReadyTickets]);

  const cookingTickets = useMemo(() => {
    return (kdsTickets || []).filter(t => {
      return (t.status === 'active' || t.status === 'pending' || !t.status) && t.status !== 'completed' && t.status !== 'cancelled';
    });
  }, [kdsTickets]);

  // Audio / Visual Alert when new ready tickets appear
  useEffect(() => {
    if (readyTickets.length > prevReadyCountRef.current) {
      playWaiterChime();
    }
    prevReadyCountRef.current = readyTickets.length;
  }, [readyTickets.length]);

  const handleDismissReady = async (ticketId) => {
    setDismissedReadyTickets(prev => new Set([...prev, ticketId]));
    try {
      await bumpKDSTicketAction(ticketId);
    } catch (e) {
      console.warn('[WaiterView] Failed to bump ticket:', e);
    }
  };

  // UPI QR Code URL builder
  const upiQrUrl = useMemo(() => {
    const upiId = settings?.payments?.upiId || 'kitchgoo@upi';
    const payeeName = settings?.restaurant?.name || 'Kitchgoo';
    const amount = remainingPayable.toFixed(2);
    const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiString)}`;
  }, [settings, remainingPayable]);

  return (
    <div className="waiter-view-container">

      {/* ── Top Bar: Waiter Profile & Table Summary ── */}
      <div style={{
        background: 'var(--header-bg, #ffffff)',
        borderBottom: '1px solid var(--border, #e2e6e0)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #1e5e4a, #2e7d5b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 800, fontSize: '0.9rem'
          }}>
            {user?.name?.charAt(0).toUpperCase() || 'W'}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1c2420' }}>
              {user?.name || 'Waiter'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #87938c)' }}>
              {activeTable ? `Serving Table ${activeTable.number || activeTable.id}` : (directMode ? 'Direct Order Pad' : 'Select a Table')}
            </div>
          </div>
        </div>

        {/* Tab 2 Notification Pill (if ready tickets exist) */}
        {readyTickets.length > 0 && activeTab !== 'kds' && (
          <button
            onClick={() => setActiveTab('kds')}
            className="animate-pulse"
            style={{
              background: '#10b981', color: 'white',
              border: 'none', borderRadius: 20,
              padding: '6px 12px', fontSize: '0.78rem',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
            }}
          >
            <Bell size={14} /> {readyTickets.length} Ready to Serve!
          </button>
        )}
      </div>

      {/* ── Persistent 2-Tab Segmented Switcher ── */}
      <div style={{
        padding: '8px 16px',
        background: 'var(--header-bg, #ffffff)',
        borderBottom: '1px solid var(--border, #e2e6e0)',
        display: 'flex',
        gap: 8,
        position: 'sticky',
        top: 60,
        zIndex: 99,
      }}>
        <button
          onClick={() => setActiveTab('order')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeTab === 'order' ? '#1e5e4a' : 'rgba(30, 94, 74, 0.08)',
            color: activeTab === 'order' ? 'white' : '#1e5e4a',
            boxShadow: activeTab === 'order' ? '0 4px 12px rgba(30, 94, 74, 0.25)' : 'none',
          }}
        >
          <ShoppingBag size={18} />
          Take Order {cart.length > 0 ? `(${cart.reduce((s, i) => s + (i.qty || 1), 0)})` : ''}
        </button>

        <button
          onClick={() => setActiveTab('kds')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeTab === 'kds' ? '#1e5e4a' : 'rgba(30, 94, 74, 0.08)',
            color: activeTab === 'kds' ? 'white' : '#1e5e4a',
            boxShadow: activeTab === 'kds' ? '0 4px 12px rgba(30, 94, 74, 0.25)' : 'none',
            position: 'relative'
          }}
        >
          <Monitor size={18} />
          Kitchen Status
          {readyTickets.length > 0 && (
            <span style={{
              background: '#ef4444', color: 'white',
              fontSize: '0.65rem', fontWeight: 800,
              padding: '2px 6px', borderRadius: 10,
              marginLeft: 2
            }}>
              {readyTickets.length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: TAKE ORDER (Fast Ordering & Table-Side Settle) ─ */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'order' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px' }}>

          {/* Table Selector Rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #87938c)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Select Table or Walk-In
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'free', 'occupied'].map(f => (
                  <button
                    key={f}
                    onClick={() => setTableFilter(f)}
                    style={{
                      background: tableFilter === f ? '#1e5e4a' : 'transparent',
                      color: tableFilter === f ? 'white' : 'var(--text-muted, #87938c)',
                      border: 'none', borderRadius: 8,
                      fontSize: '0.68rem', fontWeight: 600, padding: '3px 8px',
                      cursor: 'pointer', textTransform: 'capitalize'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6,
              scrollbarWidth: 'none', msOverflowStyle: 'none'
            }}>
              {/* Direct Order Chip */}
              <button
                onClick={() => { setDirectMode(true); setSelectedTableId(null); }}
                style={{
                  flexShrink: 0,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: directMode ? '2px solid #1e5e4a' : '1px solid var(--border, #e2e6e0)',
                  background: directMode ? 'rgba(30, 94, 74, 0.08)' : 'var(--card-bg, #ffffff)',
                  color: directMode ? '#1e5e4a' : 'var(--text-primary)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  cursor: 'pointer', minWidth: 84
                }}
              >
                <ShoppingBag size={18} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Direct</span>
              </button>

              {/* Table Chips */}
              {filteredTables.map(t => {
                const hasOrder = Boolean(posSavedOrders?.[t.id]?.length || posSavedOrders?.[t.number]?.length);
                const isSelected = !directMode && (String(selectedTableId) === String(t.id) || String(selectedTableId) === String(t.number));
                const isBussing = t.status === 'needs-bussing';
                const isOccupied = t.status === 'occupied' || t.status === 'ordered' || t.status === 'eating' || hasOrder;

                let badgeColor = '#10b981'; // Green available
                let badgeText = 'Free';
                if (isBussing) { badgeColor = '#a855f7'; badgeText = 'Bussing'; }
                else if (isOccupied) { badgeColor = '#f59e0b'; badgeText = 'Active'; }

                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setDirectMode(false);
                      setSelectedTableId(t.id);
                    }}
                    style={{
                      flexShrink: 0,
                      padding: '8px 12px',
                      borderRadius: 12,
                      border: isSelected ? '2px solid #1e5e4a' : '1px solid var(--border, #e2e6e0)',
                      background: isSelected ? 'rgba(30, 94, 74, 0.08)' : 'var(--card-bg, #ffffff)',
                      color: isSelected ? '#1e5e4a' : 'var(--text-primary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                      cursor: 'pointer', minWidth: 92, textAlign: 'left',
                      boxShadow: isSelected ? '0 4px 12px rgba(30, 94, 74, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>
                        {t.number ? `T-${t.number}` : (t.label || t.name || `T-${t.id}`)}
                      </span>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: badgeColor, display: 'inline-block'
                      }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {badgeText}
                      </span>
                      {isBussing && (
                        <span
                          onClick={(e) => { e.stopPropagation(); handleCleanTable(t); }}
                          style={{
                            fontSize: '0.62rem', fontWeight: 700, color: '#a855f7',
                            textDecoration: 'underline', cursor: 'pointer'
                          }}
                        >
                          Clean
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Table Details Strip */}
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: 14,
            padding: '10px 14px',
            border: '1px solid var(--border, #e2e6e0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                background: '#1e5e4a', color: 'white', borderRadius: 8,
                padding: '6px 10px', fontSize: '0.82rem', fontWeight: 800
              }}>
                {activeTable ? `Table ${activeTable.number || activeTable.id}` : (directMode ? 'Direct' : 'No Table')}
              </div>
              <input
                type="text"
                placeholder="Guest Name (opt)"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{
                  border: 'none', borderBottom: '1px dashed var(--border)',
                  background: 'transparent', fontSize: '0.82rem', padding: '4px 6px',
                  width: 120, outline: 'none', color: 'var(--text-primary)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setPartySize(p => Math.max(1, p - 1))}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Minus size={14} />
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 32, textAlign: 'center' }}>
                {partySize}p
              </span>
              <button
                onClick={() => setPartySize(p => p + 1)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Menu Search & Category Rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                flex: 1, position: 'relative', display: 'flex', alignItems: 'center',
                background: 'var(--card-bg, #ffffff)', borderRadius: 12, border: '1px solid var(--border, #e2e6e0)',
                padding: '0 12px'
              }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search dish or beverage..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    padding: '10px 8px', fontSize: '0.85rem', outline: 'none',
                    color: 'var(--text-primary)'
                  }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={15} color="var(--text-muted)" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setVegOnly(v => !v)}
                style={{
                  borderRadius: 12, border: vegOnly ? '2px solid #10b981' : '1px solid var(--border)',
                  background: vegOnly ? 'rgba(16, 185, 129, 0.1)' : 'var(--card-bg, #ffffff)',
                  color: vegOnly ? '#059669' : 'var(--text-muted)',
                  padding: '0 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4
                }}
              >
                🟢 Veg
              </button>
            </div>

            {/* Horizontal Category Switcher */}
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
              scrollbarWidth: 'none', msOverflowStyle: 'none'
            }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: selectedCategory === cat ? '#1e5e4a' : 'var(--card-bg, #ffffff)',
                    color: selectedCategory === cat ? 'white' : 'var(--text-secondary)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Items Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 10,
          }}>
            {filteredMenu.map(item => {
              const inCartItem = cart.find(i => (i.id || i.itemId) === item.id);
              const qty = inCartItem?.qty || 0;
              const isVeg = item.isVeg ?? (item.dietary === 'veg' || item.dietary === 'vegan');

              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--card-bg, #ffffff)',
                    borderRadius: 14,
                    padding: '12px',
                    border: qty > 0 ? '2px solid #1e5e4a' : '1px solid var(--border, #e2e6e0)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 110,
                    position: 'relative',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s'
                  }}
                >
                  {/* Veg Indicator & Category */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{
                        width: 14, height: 14, border: `1.5px solid ${isVeg ? '#10b981' : '#ef4444'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isVeg ? '#10b981' : '#ef4444' }} />
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {item.category}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.25, marginBottom: 4 }}>
                      {item.name}
                    </div>
                  </div>

                  {/* Price & Add / Stepper Controls */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e5e4a', marginBottom: 6 }}>
                      {settings?.billing?.currency || '₹'}{item.price}
                    </div>

                    {qty > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: '#1e5e4a', borderRadius: 8, padding: '2px', color: 'white'
                        }}>
                          <button
                            onClick={() => updateCartQty(item.id, -1)}
                            style={{
                              background: 'transparent', border: 'none', color: 'white',
                              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <Minus size={14} />
                          </button>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{qty}</span>
                          <button
                            onClick={() => updateCartQty(item.id, 1)}
                            style={{
                              background: 'transparent', border: 'none', color: 'white',
                              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Note Prompt */}
                        <button
                          onClick={() => setNoteItem(inCartItem)}
                          style={{
                            background: 'none', border: 'none', color: '#1e5e4a',
                            fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                            padding: '2px 0'
                          }}
                        >
                          {inCartItem.notes ? `📝 ${inCartItem.notes.slice(0, 14)}...` : '+ Add note'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        style={{
                          width: '100%',
                          background: 'rgba(30, 94, 74, 0.08)',
                          color: '#1e5e4a',
                          border: 'none',
                          borderRadius: 8,
                          padding: '7px 0',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4
                        }}
                      >
                        <Plus size={14} /> Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Cart Bar (Thumb Zone) */}
          {cart.length > 0 && (
            <div className="waiter-cart-bar">
              {/* Order summary toggle */}
              <div
                onClick={() => setShowCartDrawer(true)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              >
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Direct'} • {cart.reduce((s, i) => s + (i.qty || 1), 0)} Items
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e5e4a' }}>
                  {settings?.billing?.currency || '₹'}{billDetails.grandTotal}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleFireKOT}
                  style={{
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 16px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.3)'
                  }}
                >
                  <Flame size={16} /> Fire KOT
                </button>

                <button
                  onClick={() => setShowPaymentSheet(true)}
                  style={{
                    background: '#1e5e4a',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    padding: '12px 18px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(30, 94, 74, 0.3)'
                  }}
                >
                  <CreditCard size={16} /> Pay & Settle
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: KITCHEN STATUS (Live KDS for Waiters) ───────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === 'kds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px' }}>

          {/* Section 1: Ready to Serve (Alert Box) */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 800, color: '#10b981',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8
            }}>
              <CheckCircle2 size={16} /> Ready to Serve ({readyTickets.length})
            </div>

            {readyTickets.length === 0 ? (
              <div style={{
                background: 'var(--card-bg, #ffffff)', borderRadius: 14,
                padding: '24px 16px', textAlign: 'center', border: '1px dashed var(--border)',
                color: 'var(--text-muted)'
              }}>
                <Coffee size={28} style={{ opacity: 0.5, marginBottom: 6 }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No food waiting for pickup right now</div>
                <div style={{ fontSize: '0.72rem', marginTop: 2 }}>Kitchen is actively preparing active orders</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {readyTickets.map(ticket => {
                  const itemsList = ticket.items || [];
                  return (
                    <div
                      key={ticket.id}
                      className="animate-fade-up"
                      style={{
                        background: '#ffffff',
                        border: '2px solid #10b981',
                        borderRadius: 16,
                        padding: '14px 16px',
                        boxShadow: '0 4px 16px rgba(16,185,129,0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            background: '#10b981', color: 'white',
                            fontSize: '0.88rem', fontWeight: 900,
                            padding: '4px 10px', borderRadius: 8
                          }}>
                            {ticket.tableName || (ticket.tableId ? `Table ${ticket.tableId}` : 'Takeout')}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            KOT #{ticket.orderId || ticket.id.slice(-4)}
                          </span>
                        </div>

                        <span style={{
                          background: 'rgba(16,185,129,0.12)', color: '#059669',
                          fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6
                        }}>
                          Ready
                        </span>
                      </div>

                      {/* Items Ready */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {itemsList.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                            <span style={{ fontWeight: 600 }}>
                              {item.name} <span style={{ color: '#10b981', fontWeight: 800 }}>×{item.qty || 1}</span>
                            </span>
                            {item.notes && (
                              <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontStyle: 'italic' }}>
                                Note: {item.notes}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Mark Served CTA */}
                      <button
                        onClick={() => handleDismissReady(ticket.id)}
                        style={{
                          width: '100%',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: 10,
                          padding: '10px 0',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Check size={16} /> Mark as Served to Table
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: In Kitchen / Cooking */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 800, color: '#f59e0b',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8
            }}>
              <Flame size={16} /> Cooking in Kitchen ({cookingTickets.length})
            </div>

            {cookingTickets.length === 0 ? (
              <div style={{
                background: 'var(--card-bg, #ffffff)', borderRadius: 14,
                padding: '20px 16px', textAlign: 'center', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: '0.82rem'
              }}>
                No active cooking tickets at this moment.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cookingTickets.map(ticket => {
                  const elapsedMins = Math.floor((Date.now() - new Date(ticket.createdAt || ticket.firedAt || Date.now()).getTime()) / 60000);
                  const isDelayed = elapsedMins >= 15;

                  return (
                    <div
                      key={ticket.id}
                      style={{
                        background: 'var(--card-bg, #ffffff)',
                        border: isDelayed ? '1.5px solid #ef4444' : '1px solid var(--border, #e2e6e0)',
                        borderRadius: 14,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                            {ticket.tableName || (ticket.tableId ? `Table ${ticket.tableId}` : 'Takeout')}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {ticket.guestName ? `(${ticket.guestName})` : ''}
                          </span>
                        </div>

                        <span style={{
                          background: isDelayed ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                          color: isDelayed ? '#ef4444' : '#d97706',
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          display: 'flex', alignItems: 'center', gap: 4
                        }}>
                          <Clock size={12} /> {elapsedMins}m in prep
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.82rem' }}>
                        {(ticket.items || []).map((i, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                            <span>{i.name} ×{i.qty || 1}</span>
                            {i.notes && <span style={{ color: '#f59e0b', fontSize: '0.7rem' }}>{i.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: Full Itemized Cart Drawer ─────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showCartDrawer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }}>
          <div style={{
            background: 'var(--modal-bg, #ffffff)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: '16px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                Order for {activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Direct'}
              </div>
              <button onClick={() => setShowCartDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: '50vh' }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {settings?.billing?.currency || '₹'}{item.price} each {item.notes ? `• Note: ${item.notes}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => updateCartQty(item.id, -1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{item.qty}</span>
                    <button
                      onClick={() => updateCartQty(item.id, 1)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(30, 94, 74,0.06)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>Subtotal</span>
                <span>{settings?.billing?.currency || '₹'}{billDetails.subtotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                <span>GST / Taxes</span>
                <span>{settings?.billing?.currency || '₹'}{billDetails.tax}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: '#1e5e4a' }}>
                <span>Total Amount</span>
                <span>{settings?.billing?.currency || '₹'}{billDetails.grandTotal}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleFireKOT}
                style={{
                  flex: 1, background: '#f59e0b', color: 'white', border: 'none',
                  borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                }}
              >
                🔥 Fire KOT
              </button>
              <button
                onClick={() => { setShowCartDrawer(false); setShowPaymentSheet(true); }}
                style={{
                  flex: 1, background: '#1e5e4a', color: 'white', border: 'none',
                  borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                }}
              >
                💳 Settle Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: Item Kitchen Note Sheet ───────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {noteItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }}>
          <div style={{
            background: 'var(--modal-bg, #ffffff)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: '16px', display: 'flex', flexDirection: 'column', gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                Kitchen Note: {noteItem.name}
              </div>
              <button onClick={() => setNoteItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Quick chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMMON_NOTES.map(chip => (
                <button
                  key={chip}
                  onClick={() => updateItemNote(noteItem.id, chip)}
                  style={{
                    background: noteItem.notes === chip ? '#1e5e4a' : 'rgba(30, 94, 74, 0.08)',
                    color: noteItem.notes === chip ? 'white' : '#1e5e4a',
                    border: 'none', borderRadius: 8, padding: '6px 10px',
                    fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Or enter custom instruction..."
              value={noteItem.notes || ''}
              onChange={e => updateItemNote(noteItem.id, e.target.value)}
              style={{
                border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 12px', fontSize: '0.84rem', outline: 'none'
              }}
            />

            <button
              onClick={() => setNoteItem(null)}
              style={{
                background: '#1e5e4a', color: 'white', border: 'none',
                borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 3: In-Hand Table Payment & Split Settle Sheet ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showPaymentSheet && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }}>
          <div style={{
            background: 'var(--modal-bg, #ffffff)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '20px 16px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.25)'
          }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  Settle {activeTable ? `Table ${activeTable.number || activeTable.id}` : 'Order'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Total Bill: {settings?.billing?.currency || '₹'}{billDetails.grandTotal}
                </div>
              </div>
              <button onClick={() => setShowPaymentSheet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {/* Guest Phone & Wallet Redemption */}
            <div style={{
              background: 'rgba(30, 94, 74, 0.05)', borderRadius: 14,
              padding: '12px', border: '1px solid rgba(30, 94, 74, 0.15)',
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e5e4a' }}>
                  Customer Phone / Wallet Lookup
                </span>
                {matchedGuest && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981' }}>
                    ✓ {matchedGuest.name || 'Registered Guest'}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid var(--border)', borderRadius: 10,
                    padding: '8px 12px', fontSize: '0.84rem', outline: 'none', background: 'white'
                  }}
                />
              </div>

              {/* Digital Wallet Card if customer has balance */}
              {guestWalletBalance > 0 && (
                <div style={{
                  background: 'white', borderRadius: 10, padding: '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: '1px dashed #10b981'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wallet size={16} color="#10b981" />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>Guest Wallet Balance</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {settings?.billing?.currency || '₹'}{guestWalletBalance} available
                      </div>
                    </div>
                  </div>

                  {walletRedeemed > 0 ? (
                    <button
                      onClick={() => setWalletRedeemed(0)}
                      style={{
                        background: '#ef4444', color: 'white', border: 'none',
                        borderRadius: 8, padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => setWalletRedeemed(Math.min(guestWalletBalance, billDetails.grandTotal))}
                      style={{
                        background: '#10b981', color: 'white', border: 'none',
                        borderRadius: 8, padding: '5px 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      Apply Credit
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bill Summary Strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--canvas)', borderRadius: 12, padding: '10px 14px' }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Bill: {settings?.billing?.currency || '₹'}{billDetails.grandTotal}</span>
                {walletRedeemed > 0 && (
                  <span style={{ fontSize: '0.74rem', color: '#10b981', marginLeft: 8 }}>
                    - Wallet: {settings?.billing?.currency || '₹'}{walletRedeemed}
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 900, fontSize: '1rem', color: '#1e5e4a' }}>
                Remaining: {settings?.billing?.currency || '₹'}{remainingPayable}
              </div>
            </div>

            {/* Payment Method Switcher */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Select Payment Method
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { id: 'Cash', label: 'Cash', icon: Banknote },
                  { id: 'UPI', label: 'UPI QR', icon: QrCode },
                  { id: 'Card', label: 'Card', icon: CreditCard },
                  { id: 'Split', label: 'Split Bill', icon: Split },
                ].map(m => {
                  const Icon = m.icon;
                  const isSel = payMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      style={{
                        padding: '10px 4px',
                        borderRadius: 12,
                        border: isSel ? '2px solid #1e5e4a' : '1px solid var(--border)',
                        background: isSel ? 'rgba(30, 94, 74, 0.08)' : 'var(--card-bg, #ffffff)',
                        color: isSel ? '#1e5e4a' : 'var(--text-primary)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem'
                      }}
                    >
                      <Icon size={18} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Sub-view: CASH ── */}
            {payMethod === 'Cash' && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Quick Cash Tender</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[remainingPayable, 500, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashTendered(String(amt))}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'transparent', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {settings?.billing?.currency || '₹'}{amt}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    placeholder="Enter cash received"
                    value={cashTendered}
                    onChange={e => setCashTendered(e.target.value)}
                    style={{
                      flex: 1, border: '1px solid var(--border)', borderRadius: 10,
                      padding: '10px', fontSize: '0.88rem', outline: 'none'
                    }}
                  />
                </div>

                {cashChange > 0 && (
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#10b981' }}>
                    Change to Return: {settings?.billing?.currency || '₹'}{cashChange}
                  </div>
                )}
              </div>
            )}

            {/* ── Sub-view: UPI DYNAMIC QR ── */}
            {payMethod === 'UPI' && (
              <div style={{
                background: 'var(--card-bg)', borderRadius: 14, padding: '14px', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e5e4a' }}>
                  Customer Scans Waiter's Phone to Pay
                </div>
                <img
                  src={upiQrUrl}
                  alt="UPI QR Code"
                  style={{ width: 140, height: 140, borderRadius: 10, border: '1px solid var(--border)' }}
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Payable: <strong>{settings?.billing?.currency || '₹'}{remainingPayable}</strong> • Scan via GPay / PhonePe / Paytm
                </div>
              </div>
            )}

            {/* ── Sub-view: CARD ── */}
            {payMethod === 'Card' && (
              <div style={{
                background: 'var(--card-bg)', borderRadius: 14, padding: '16px', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center'
              }}>
                <CreditCard size={32} color="#1e5e4a" />
                <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>Swipe / Tap on Handheld Card EDC</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  Charge {settings?.billing?.currency || '₹'}{remainingPayable} on EDC machine and confirm below
                </div>
              </div>
            )}

            {/* ── Sub-view: SPLIT BILL ── */}
            {payMethod === 'Split' && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 14, padding: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setSplitMode('even')}
                    style={{
                      flex: 1, padding: '6px', borderRadius: 8, border: 'none',
                      background: splitMode === 'even' ? '#1e5e4a' : 'rgba(30, 94, 74, 0.08)',
                      color: splitMode === 'even' ? 'white' : '#1e5e4a', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
                    }}
                  >
                    Split Evenly
                  </button>
                  <button
                    onClick={() => setSplitMode('custom')}
                    style={{
                      flex: 1, padding: '6px', borderRadius: 8, border: 'none',
                      background: splitMode === 'custom' ? '#1e5e4a' : 'rgba(30, 94, 74, 0.08)',
                      color: splitMode === 'custom' ? 'white' : '#1e5e4a', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer'
                    }}
                  >
                    Custom Amounts
                  </button>
                </div>

                {splitMode === 'even' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Split into:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {[2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setSplitCount(n)}
                            style={{
                              width: 30, height: 30, borderRadius: 8, border: splitCount === n ? '2px solid #1e5e4a' : '1px solid var(--border)',
                              background: splitCount === n ? 'rgba(30,94,74,0.1)' : 'transparent',
                              fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer'
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e5e4a' }}>
                      {settings?.billing?.currency || '₹'}{Math.round((remainingPayable / splitCount) * 100) / 100} / person ({splitCount} people)
                    </div>

                    {/* Method tags for each person */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Array.from({ length: splitCount }, (_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', borderBottom: '1px dashed var(--border)', paddingBottom: 4 }}>
                          <span>Person {i + 1} ({settings?.billing?.currency || '₹'}{Math.round((remainingPayable / splitCount) * 100) / 100})</span>
                          <select
                            value={splitPaidParts[i] || 'Cash'}
                            onChange={e => setSplitPaidParts(p => ({ ...p, [i]: e.target.value }))}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                          >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Card">Card</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {customSplits.map((cs, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6 }}>
                        <select
                          value={cs.method}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomSplits(prev => prev.map((item, i) => i === idx ? { ...item, method: val } : item));
                          }}
                          style={{ padding: '6px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem' }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Card">Card</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Amount"
                          value={cs.amount}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomSplits(prev => prev.map((item, i) => i === idx ? { ...item, amount: val } : item));
                          }}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem' }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Complete Payment Button */}
            <button
              onClick={handleCompletePayment}
              disabled={isSubmittingOrder}
              style={{
                width: '100%',
                background: '#1e5e4a',
                color: 'white',
                border: 'none',
                borderRadius: 14,
                padding: '14px 0',
                fontSize: '0.94rem',
                fontWeight: 800,
                cursor: isSubmittingOrder ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(30, 94, 74, 0.35)',
                opacity: isSubmittingOrder ? 0.7 : 1
              }}
            >
              <CheckCircle2 size={18} />
              {isSubmittingOrder ? 'Processing Settlement...' : `Complete Payment (${settings?.billing?.currency || '₹'}${remainingPayable})`}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 4: Payment Success & Receipt ─────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1300,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: '24px 20px', maxWidth: 360, width: '100%',
            textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#dcfce7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a'
            }}>
              <CheckCircle size={32} />
            </div>

            <div>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#1c2420' }}>
                Payment Settled!
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Bill No: {showSuccessModal.order?.billNo || 'Paid'} • {showSuccessModal.table ? `Table ${showSuccessModal.table.number || showSuccessModal.table.id}` : 'Direct'}
              </div>
            </div>

            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e5e4a' }}>
              {settings?.billing?.currency || '₹'}{showSuccessModal.total}
            </div>

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                onClick={() => {
                  try {
                    printReceipt({
                      order: showSuccessModal.order,
                      settings,
                      tableId: showSuccessModal.table?.id,
                      guestName: showSuccessModal.table?.guestName || showSuccessModal.order?.customerName,
                    });
                  } catch (e) {
                    console.error(e);
                  }
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                <Printer size={16} /> Print
              </button>

              <button
                onClick={() => setShowSuccessModal(null)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: '#1e5e4a', color: 'white', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
                }}
              >
                Take Next Order
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
