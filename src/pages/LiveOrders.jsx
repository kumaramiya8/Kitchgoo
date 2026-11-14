import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  UtensilsCrossed, Clock, RefreshCw, Search, Check, Copy, Maximize,
  Minimize, Users, AlertCircle, ChevronDown, ChevronUp,
  Table as TableIcon, Share2, Sparkles
} from 'lucide-react';
import { calculateTableBill, resolveTableSavedOrder } from '../utils/tableOrders';

const STATUS_CONFIG = {
  available: { label: 'Available', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  occupied: { label: 'Occupied', color: '#d97706', bg: 'rgba(217, 119, 6, 0.14)' },
  ordered: { label: 'Active Order', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.14)' },
  billing: { label: 'Billing', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.14)' },
  paying: { label: 'Paying', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.14)' },
  'needs-bussing': { label: 'Bussing', color: '#64748b', bg: 'rgba(100, 116, 139, 0.14)' },
  reserved: { label: 'Reserved', color: '#db2777', bg: 'rgba(219, 39, 119, 0.14)' },
};

export default function LiveOrders({ defaultTenant = 'Kiko Cafe' }) {
  const params = useParams();
  const [searchParams] = useSearchParams();

  // Tenant priority: route param -> query param (?restaurant= or ?tenant=) -> defaultTenant ('Kiko Cafe')
  const tenantName = (
    params.tenantId ||
    searchParams.get('restaurant') ||
    searchParams.get('tenant') ||
    defaultTenant
  ).trim();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // ETag reference to achieve near-zero database & network egress (HTTP 304)
  const lastEtagRef = useRef(null);

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'waiting' | 'all' | 'available'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTableId, setCopiedTableId] = useState(null);
  const [sharedTableId, setSharedTableId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedChits, setExpandedChits] = useState({});

  // Fetch live orders with ETag conditional request
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else if (!data) setLoading(true);

    try {
      const headers = {};
      if (lastEtagRef.current) {
        headers['If-None-Match'] = lastEtagRef.current;
      }

      const res = await fetch(`/api/public/orders/${encodeURIComponent(tenantName)}`, { headers });

      // 304 Not Modified: Data is identical on server! Zero DB queries, zero network egress!
      if (res.status === 304) {
        setLastUpdated(Date.now());
        setSecondsAgo(0);
        setError(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load orders (${res.status})`);
      }

      const etag = res.headers.get('ETag');
      if (etag) lastEtagRef.current = etag;

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to load live orders');
      }

      setData(json);
      setLastUpdated(Date.now());
      setSecondsAgo(0);
      setError(null);
    } catch (err) {
      console.error('[LiveOrders] Fetch error:', err);
      setError(err.message || 'Unable to connect to live orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantName, data]);

  // Initial load
  useEffect(() => {
    fetchOrders(false);
  }, [tenantName]);

  // Background auto-refresh polling every 8s (stops immediately when phone screen locks / tab is hidden)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchOrders(true);
    }, 8000);

    return () => clearInterval(timer);
  }, [fetchOrders]);

  // Instant refresh when user returns to tab or unlocks phone
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchOrders(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchOrders]);

  // "Seconds ago" ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  // Fullscreen toggle handler for floor tablets/phones
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedChits(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  // Process and compute table orders & bill breakdowns
  const processedTables = useMemo(() => {
    if (!data?.tables) return [];
    const tables = data.tables || [];
    const savedOrders = data.savedOrders || {};
    const settings = data.settings || {};

    return tables.map(table => {
      const items = resolveTableSavedOrder(savedOrders, table);
      const bill = calculateTableBill({
        items,
        settings,
        partySize: table.partySize || table.seats || 1,
        orderType: 'dine-in',
      });

      // Seated elapsed time calculation
      let elapsedMins = 0;
      if (table.seatedAt) {
        elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(table.seatedAt).getTime()) / 60000));
      }

      const hasOrder = bill.hasOrder;
      let statusKey = table.status || 'available';
      if (hasOrder && (statusKey === 'available' || !statusKey)) {
        statusKey = 'ordered';
      }

      return {
        ...table,
        items,
        bill,
        hasOrder,
        statusKey,
        statusInfo: STATUS_CONFIG[statusKey] || STATUS_CONFIG.available,
        elapsedMins,
      };
    });
  }, [data]);

  // Floating tabs (Orders waiting for a table)
  const floatingTabs = useMemo(() => {
    if (!data?.floatingTabs) return [];
    const settings = data.settings || {};
    return (data.floatingTabs || []).map(tab => {
      const items = Array.isArray(tab.items) ? tab.items : [];
      const bill = calculateTableBill({
        items,
        settings,
        partySize: tab.partySize || 1,
        orderType: 'dine-in',
      });
      const elapsedMins = tab.createdAt
        ? Math.max(0, Math.floor((Date.now() - new Date(tab.createdAt).getTime()) / 60000))
        : 0;

      return {
        ...tab,
        items,
        bill,
        elapsedMins,
      };
    });
  }, [data]);

  // Aggregate statistics across active tables
  const stats = useMemo(() => {
    const activeTables = processedTables.filter(t => t.hasOrder || t.statusKey === 'occupied');
    const totalRevenue = activeTables.reduce((sum, t) => sum + (t.bill?.grandTotal || 0), 0);
    const totalItems = activeTables.reduce((sum, t) => sum + (t.bill?.itemCount || 0), 0);
    const totalGuests = activeTables.reduce((sum, t) => sum + (t.partySize || t.seats || 2), 0);

    return {
      activeTableCount: activeTables.length,
      totalRevenue,
      totalItems,
      totalGuests,
      waitingCount: floatingTabs.length,
      allCount: processedTables.length,
      availableCount: processedTables.filter(t => !t.hasOrder && t.statusKey === 'available').length,
    };
  }, [processedTables, floatingTabs]);

  // Filtered tables list based on active tab and search query
  const filteredTables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return processedTables.filter(t => {
      // Tab filter
      if (activeTab === 'active' && !t.hasOrder && t.statusKey !== 'occupied') return false;
      if (activeTab === 'available' && (t.hasOrder || t.statusKey !== 'available')) return false;

      // Search filter
      if (q) {
        const matchesNum = String(t.number || '').toLowerCase().includes(q) || `table ${t.number}`.includes(q) || `t${t.number}`.includes(q);
        const matchesName = String(t.name || '').toLowerCase().includes(q);
        const matchesGuest = String(t.guestName || '').toLowerCase().includes(q);
        const matchesSection = String(t.section || '').toLowerCase().includes(q);
        const matchesItem = (t.items || []).some(item => String(item.name || '').toLowerCase().includes(q));

        if (!matchesNum && !matchesName && !matchesGuest && !matchesSection && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [processedTables, activeTab, searchQuery]);

  // Build plain text receipt for copying or sharing
  const generateBillText = (table) => {
    return [
      `🧾 ${data?.restaurantName || tenantName}`,
      `Table: ${table.number || table.id}${table.section ? ` (${table.section})` : ''}`,
      table.guestName ? `Guest: ${table.guestName}` : null,
      `Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      '────────────────────────────',
      ...(table.items || []).map(i => {
        const qty = Number(i.qty || i.quantity) || 1;
        const price = Number(i.price) || 0;
        const modSum = (i.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
        return `${qty}x ${i.name} — ₹${((price + modSum) * qty).toLocaleString('en-IN')}`;
      }),
      '────────────────────────────',
      `Subtotal: ₹${table.bill.subtotal.toLocaleString('en-IN')}`,
      table.bill.tax > 0 ? `GST: ₹${table.bill.tax.toLocaleString('en-IN')}` : null,
      table.bill.serviceCharge > 0 ? `Service Charge: ₹${table.bill.serviceCharge.toLocaleString('en-IN')}` : null,
      `TOTAL BILL: ₹${table.bill.grandTotal.toLocaleString('en-IN')}`,
    ].filter(Boolean).join('\n');
  };

  // Copy receipt to clipboard
  const handleCopyReceipt = (table) => {
    const text = generateBillText(table);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedTableId(table.id);
        setTimeout(() => setCopiedTableId(null), 2000);
      }).catch(() => {});
    }
  };

  // Native mobile share sheet (WhatsApp, Messages, etc.)
  const handleShareReceipt = (table) => {
    const text = generateBillText(table);
    if (navigator.share) {
      navigator.share({
        title: `Bill - Table ${table.number || table.id}`,
        text,
      }).then(() => {
        setSharedTableId(table.id);
        setTimeout(() => setSharedTableId(null), 2000);
      }).catch(() => {});
    } else {
      handleCopyReceipt(table);
    }
  };

  const restaurantDisplayName = data?.restaurantName || tenantName;

  return (
    <div className="live-orders-app" style={{
      minHeight: '100dvh',
      background: '#f4f6f3',
      color: '#1a221e',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 16px))',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {/* ── Global Mobile Touch & Animation CSS ──────────────────── */}
      <style>{`
        .live-orders-app * {
          box-sizing: border-box;
        }
        .live-orders-app button,
        .live-orders-app [role="button"] {
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        }
        .live-orders-app button:active {
          transform: scale(0.97);
        }
        .live-orders-app input {
          font-size: 16px !important; /* Prevents auto-zoom in iOS Safari */
        }
        @keyframes pulse-live {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.92); }
        }
        @keyframes spin-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── Top Pass Color Bar ───────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, #1e5e4a 0%, #10b981 70%, #f59e0b 100%)',
        zIndex: 1100,
      }} />

      {/* ── Mobile-First Header ─────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e5e8e3',
        paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))',
        paddingBottom: 8,
        paddingLeft: 14,
        paddingRight: 14,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          maxWidth: 900, margin: '0 auto', gap: 8,
        }}>
          {/* Brand & Live status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: '#1e5e4a', color: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, boxShadow: '0 2px 6px rgba(30, 94, 74, 0.25)',
            }}>
              <UtensilsCrossed size={17} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{
                  fontSize: '1rem', fontWeight: 800, margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: '#1a221e',
                }}>
                  {restaurantDisplayName}
                </h1>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 9999,
                  background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a',
                  fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.04em',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#16a34a',
                    boxShadow: '0 0 6px rgba(22, 163, 74, 0.8)',
                    animation: 'pulse-live 1.8s infinite ease-in-out',
                  }} />
                  LIVE
                </span>
              </div>
              <div style={{
                fontSize: '0.68rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1,
              }}>
                <Clock size={11} />
                <span>{secondsAgo < 4 ? 'Just now' : `${secondsAgo}s ago`} · Floor Orders</span>
              </div>
            </div>
          </div>

          {/* Quick Header Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fetchOrders(true)}
              disabled={refreshing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 36, padding: '0 10px', borderRadius: 9,
                background: refreshing ? 'rgba(30, 94, 74, 0.1)' : '#ffffff',
                border: '1px solid #d1d5db', color: '#1e5e4a',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease-out',
              }}
              title="Refresh live orders"
            >
              <RefreshCw size={13} style={{
                animation: refreshing ? 'spin-cw 0.7s linear infinite' : 'none',
              }} />
              <span>{refreshing ? 'Updating…' : 'Sync'}</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 9,
                background: '#ffffff', border: '1px solid #d1d5db',
                color: '#4b5563', cursor: 'pointer',
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Mobile Container ───────────────────────────────── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '12px 14px' }}>

        {/* Network / Error Notice Banner */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#b91c1c', fontSize: '0.8rem', marginBottom: 12,
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{error}</span>
            <button
              type="button"
              onClick={() => fetchOrders(false)}
              style={{
                background: '#b91c1c', color: '#ffffff', border: 'none',
                padding: '4px 10px', borderRadius: 6, fontSize: '0.75rem',
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Compact Floor Summary Ribbon ────────────────────────── */}
        <section style={{
          display: 'grid', gridTemplateColumns: stats.waitingCount > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
          gap: 8, marginBottom: 12,
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 12, padding: '9px 10px',
            border: '1px solid #e5e8e3', textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>
              Active
            </div>
            <div style={{
              fontSize: '1.25rem', fontWeight: 900, color: '#1e5e4a',
              marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              {stats.activeTableCount}
              <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500, marginLeft: 2 }}>
                /{stats.allCount}
              </span>
            </div>
          </div>

          <div style={{
            background: '#ffffff', borderRadius: 12, padding: '9px 10px',
            border: '1px solid #e5e8e3', textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>
              Items
            </div>
            <div style={{
              fontSize: '1.25rem', fontWeight: 900, color: '#b45309',
              marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              {stats.totalItems}
            </div>
          </div>

          <div style={{
            background: '#ffffff', borderRadius: 12, padding: '9px 10px',
            border: '1px solid #e5e8e3', textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>
              Floor Bill
            </div>
            <div style={{
              fontSize: '1.25rem', fontWeight: 900, color: '#1e5e4a',
              marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              ₹{stats.totalRevenue.toLocaleString('en-IN')}
            </div>
          </div>

          {stats.waitingCount > 0 && (
            <div style={{
              background: '#fef3c7', borderRadius: 12, padding: '9px 10px',
              border: '1px solid #f59e0b', textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#92400e', fontWeight: 800, textTransform: 'uppercase' }}>
                Waiting
              </div>
              <div style={{
                fontSize: '1.25rem', fontWeight: 900, color: '#b45309',
                marginTop: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}>
                {stats.waitingCount}
              </div>
            </div>
          )}
        </section>

        {/* ── Search & Filter Bar (Optimized for Thumb Access) ──────── */}
        <section style={{
          background: '#ffffff', borderRadius: 14, padding: '10px 12px',
          border: '1px solid #e5e8e3', marginBottom: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {/* Mobile Search Box with 16px font-size to prevent iOS zoom */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: '#9ca3af', pointerEvents: 'none',
            }} />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Search table #, item, or guest…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '9px 34px 9px 36px',
                borderRadius: 9, border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: '#111827',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.1)', border: 'none',
                  color: '#4b5563', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 800,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Horizontal Scrollable Thumb Filters */}
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
            WebkitOverflowScrolling: 'touch', touchAction: 'pan-x',
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              style={{
                height: 34, padding: '0 12px', borderRadius: 9999, border: 'none',
                background: activeTab === 'active' ? '#1e5e4a' : '#f3f4f6',
                color: activeTab === 'active' ? '#ffffff' : '#4b5563',
                fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                flexShrink: 0,
              }}
            >
              <span>Active Orders</span>
              <span style={{
                background: activeTab === 'active' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                padding: '1px 6px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 800,
              }}>
                {stats.activeTableCount}
              </span>
            </button>

            {floatingTabs.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('waiting')}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 9999, border: 'none',
                  background: activeTab === 'waiting' ? '#b45309' : '#fef3c7',
                  color: activeTab === 'waiting' ? '#ffffff' : '#92400e',
                  fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                  flexShrink: 0,
                }}
              >
                <span>Waiting List</span>
                <span style={{
                  background: activeTab === 'waiting' ? 'rgba(255,255,255,0.25)' : '#fde68a',
                  padding: '1px 6px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 800,
                }}>
                  {floatingTabs.length}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                height: 34, padding: '0 12px', borderRadius: 9999, border: 'none',
                background: activeTab === 'all' ? '#1e5e4a' : '#f3f4f6',
                color: activeTab === 'all' ? '#ffffff' : '#4b5563',
                fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                flexShrink: 0,
              }}
            >
              <span>All Tables</span>
              <span style={{
                background: activeTab === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                padding: '1px 6px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 800,
              }}>
                {stats.allCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('available')}
              style={{
                height: 34, padding: '0 12px', borderRadius: 9999, border: 'none',
                background: activeTab === 'available' ? '#1e5e4a' : '#f3f4f6',
                color: activeTab === 'available' ? '#ffffff' : '#4b5563',
                fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
                flexShrink: 0,
              }}
            >
              <span>Available</span>
              <span style={{
                background: activeTab === 'available' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                padding: '1px 6px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 800,
              }}>
                {stats.availableCount}
              </span>
            </button>
          </div>
        </section>

        {/* ── Initial Loading Indicator ────────────────────────────── */}
        {loading && !data && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 240, gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              border: '3px solid rgba(30, 94, 74, 0.2)',
              borderTopColor: '#1e5e4a',
              animation: 'spin-cw 0.7s linear infinite',
            }} />
            <div style={{ fontSize: '0.86rem', color: '#6b7280', fontWeight: 600 }}>
              Connecting to live orders for {restaurantDisplayName}…
            </div>
          </div>
        )}

        {/* ── Waiting for Table Section ───────────────────────────── */}
        {(activeTab === 'waiting' || (activeTab === 'all' && floatingTabs.length > 0)) && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              fontWeight: 800, fontSize: '0.88rem', color: '#92400e',
            }}>
              <span style={{
                background: '#f59e0b', color: '#fff', width: 20, height: 20,
                borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900,
              }}>
                {floatingTabs.length}
              </span>
              <span>Orders Waiting for Table</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {floatingTabs.map(tab => (
                <div key={tab.id} style={{
                  background: '#ffffff', borderRadius: 14,
                  border: '1.5px solid #f59e0b', padding: '14px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <span style={{
                        background: '#f59e0b', color: '#ffffff',
                        padding: '2px 8px', borderRadius: 6,
                        fontWeight: 900, fontSize: '0.8rem',
                      }}>
                        Token #{tab.tokenNumber}
                      </span>
                      <div style={{ fontWeight: 800, fontSize: '0.96rem', marginTop: 5, color: '#111827' }}>
                        {tab.guestName || 'Walk-in Guest'}
                        {tab.partySize > 1 && (
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, marginLeft: 4 }}>
                            · {tab.partySize} guests
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1 }}>
                        Ordered {tab.elapsedMins}m ago
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '1.15rem', fontWeight: 900, color: '#1e5e4a',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}>
                        ₹{tab.bill.grandTotal.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                        {tab.bill.itemCount} items
                      </div>
                    </div>
                  </div>

                  {/* Tab Items */}
                  <div style={{
                    background: '#fafafa', borderRadius: 8, padding: '8px 10px',
                    display: 'flex', flexDirection: 'column', gap: 5,
                  }}>
                    {(tab.items || []).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600 }}>
                          <span style={{ color: '#1e5e4a', fontWeight: 800, marginRight: 6 }}>{item.qty || 1}x</span>
                          {item.name}
                        </span>
                        <span style={{ color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
                          ₹{((item.price || 0) * (item.qty || 1)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Table Orders List (Mobile-Optimized Cards) ───────────── */}
        {activeTab !== 'waiting' && (
          <div>
            {filteredTables.length === 0 ? (
              <div style={{
                background: '#ffffff', borderRadius: 16,
                padding: '40px 20px', textAlign: 'center',
                border: '1px solid #e5e8e3',
                color: '#6b7280',
              }}>
                <TableIcon size={34} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', marginBottom: 4 }}>
                  {activeTab === 'active' ? 'No Active Table Orders' : 'No Tables Found'}
                </h3>
                <p style={{ fontSize: '0.8rem', maxWidth: 360, margin: '0 auto', lineHeight: 1.4 }}>
                  {activeTab === 'active'
                    ? 'All tables are currently free. When guests place orders via QR Menu or POS, they will show up here live.'
                    : 'Try selecting another tab or clearing your search.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredTables.map(table => {
                  const isExpanded = expandedChits[table.id] ?? true;
                  const isCopied = copiedTableId === table.id;
                  const isShared = sharedTableId === table.id;

                  return (
                    <article
                      key={table.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: 16,
                        border: table.hasOrder
                          ? '1.5px solid rgba(30, 94, 74, 0.3)'
                          : '1px solid #e5e8e3',
                        boxShadow: table.hasOrder
                          ? '0 3px 12px rgba(30, 94, 74, 0.06)'
                          : '0 1px 3px rgba(0,0,0,0.02)',
                        overflow: 'hidden',
                        transition: 'transform 0.15s ease-out',
                      }}
                    >
                      {/* Top Header of Table Card */}
                      <div style={{
                        padding: '12px 14px',
                        background: table.hasOrder
                          ? 'linear-gradient(180deg, rgba(30, 94, 74, 0.05), transparent)'
                          : 'transparent',
                        borderBottom: '1px solid #f0f2ee',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10,
                              background: table.hasOrder ? '#1e5e4a' : '#f3f4f6',
                              color: table.hasOrder ? '#ffffff' : '#4b5563',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 900, fontSize: '0.95rem',
                              fontFamily: 'ui-monospace, monospace', flexShrink: 0,
                            }}>
                              T{table.number || table.id}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#111827' }}>
                                Table {table.number || table.id}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                {table.seats} seats {table.section ? `· ${table.section}` : ''}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 800,
                              textTransform: 'uppercase', letterSpacing: '0.03em',
                              padding: '3px 8px', borderRadius: 9999,
                              background: table.statusInfo.bg,
                              color: table.statusInfo.color,
                            }}>
                              {table.statusInfo.label}
                            </span>
                          </div>
                        </div>

                        {/* Guest & Turn Timer Info */}
                        {(table.guestName || table.elapsedMins > 0 || table.hasOrder) && (
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginTop: 8, paddingTop: 6, borderTop: '1px dashed #f0f2ee',
                            fontSize: '0.72rem', color: '#4b5563',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Users size={12} />
                              <span style={{ fontWeight: 600 }}>{table.guestName || 'Guest'}</span>
                              {table.partySize && table.partySize > 1 && (
                                <span style={{ color: '#9ca3af' }}>({table.partySize}p)</span>
                              )}
                            </div>
                            {table.elapsedMins > 0 && (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                color: table.elapsedMins > 45 ? '#b45309' : '#6b7280',
                                fontWeight: table.elapsedMins > 45 ? 700 : 500,
                              }}>
                                <Clock size={11} />
                                <span>{table.elapsedMins}m seated</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Items List Body */}
                      <div style={{ padding: '12px 14px' }}>
                        {!table.hasOrder ? (
                          <div style={{
                            padding: '16px 0', textAlign: 'center',
                            color: '#9ca3af', fontSize: '0.78rem',
                          }}>
                            No active items on this table.
                          </div>
                        ) : (
                          <div>
                            {/* Collapse / Expand Toggle */}
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              marginBottom: 8,
                            }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase' }}>
                                Ordered Items ({table.bill.itemCount})
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleExpand(table.id)}
                                style={{
                                  background: 'none', border: 'none', color: '#6b7280',
                                  fontSize: '0.72rem', cursor: 'pointer', display: 'flex',
                                  alignItems: 'center', gap: 2, padding: 0,
                                }}
                              >
                                {isExpanded ? 'Collapse' : 'Expand'}
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </div>

                            {/* Itemized List */}
                            {isExpanded && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                                {table.items.map((item, idx) => {
                                  const itemQty = Number(item.qty || item.quantity) || 1;
                                  const itemPrice = Number(item.price) || 0;
                                  const modPrice = (item.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
                                  const lineTotal = (itemPrice + modPrice) * itemQty;

                                  return (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'flex', alignItems: 'flex-start',
                                        justifyContent: 'space-between', gap: 8,
                                        fontSize: '0.84rem',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <span style={{
                                          background: 'rgba(30, 94, 74, 0.1)', color: '#1e5e4a',
                                          fontWeight: 800, fontSize: '0.75rem',
                                          padding: '1px 6px', borderRadius: 4,
                                          fontFamily: 'ui-monospace, monospace',
                                          marginTop: 1, flexShrink: 0,
                                        }}>
                                          {itemQty}x
                                        </span>
                                        <div>
                                          <div style={{ fontWeight: 700, color: '#111827' }}>
                                            {item.name}
                                          </div>
                                          {item.notes && (
                                            <div style={{ fontSize: '0.7rem', color: '#b45309', fontStyle: 'italic', marginTop: 1 }}>
                                              Note: {item.notes}
                                            </div>
                                          )}
                                          {(item.modifiers || []).length > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1 }}>
                                              {item.modifiers.map(m => `+ ${m.name}`).join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{
                                        fontWeight: 800,
                                        fontFamily: 'ui-monospace, monospace',
                                        color: '#111827',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        ₹{lineTotal.toLocaleString('en-IN')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Receipt / Bill Breakdown Box */}
                            <div style={{
                              background: '#f8faf7',
                              border: '1px solid #e2e8df',
                              borderRadius: 12, padding: '10px 12px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6b7280', marginBottom: 2 }}>
                                <span>Subtotal</span>
                                <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                                  ₹{table.bill.subtotal.toLocaleString('en-IN')}
                                </span>
                              </div>

                              {table.bill.tax > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6b7280', marginBottom: 2 }}>
                                  <span>GST / Taxes</span>
                                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    ₹{table.bill.tax.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              )}

                              {table.bill.serviceCharge > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6b7280', marginBottom: 2 }}>
                                  <span>Service Charge</span>
                                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                                    ₹{table.bill.serviceCharge.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              )}

                              <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginTop: 6, paddingTop: 6, borderTop: '1px dashed #d1d5db',
                              }}>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#111827' }}>
                                  Current Bill
                                </span>
                                <span style={{
                                  fontWeight: 900, fontSize: '1.25rem',
                                  color: '#1e5e4a',
                                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}>
                                  ₹{table.bill.grandTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Mobile Footer: Copy / Share Actions */}
                      {table.hasOrder && (
                        <div style={{
                          padding: '8px 14px',
                          background: '#fafafa',
                          borderTop: '1px solid #f0f2ee',
                          display: 'flex', justifyContent: 'flex-end', gap: 6,
                        }}>
                          <button
                            type="button"
                            onClick={() => handleCopyReceipt(table)}
                            style={{
                              height: 34, padding: '0 12px', borderRadius: 8,
                              background: isCopied ? '#16a34a' : '#ffffff',
                              border: isCopied ? '1px solid #16a34a' : '1px solid #d1d5db',
                              color: isCopied ? '#ffffff' : '#374151',
                              fontSize: '0.74rem', fontWeight: 700,
                              cursor: 'pointer', display: 'inline-flex',
                              alignItems: 'center', gap: 5,
                            }}
                          >
                            {isCopied ? <Check size={13} /> : <Copy size={13} />}
                            <span>{isCopied ? 'Copied' : 'Copy Bill'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShareReceipt(table)}
                            style={{
                              height: 34, padding: '0 12px', borderRadius: 8,
                              background: isShared ? '#16a34a' : '#ffffff',
                              border: isShared ? '1px solid #16a34a' : '1px solid #d1d5db',
                              color: isShared ? '#ffffff' : '#374151',
                              fontSize: '0.74rem', fontWeight: 700,
                              cursor: 'pointer', display: 'inline-flex',
                              alignItems: 'center', gap: 5,
                            }}
                          >
                            <Share2 size={13} />
                            <span>Share</span>
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Fixed Sticky Bottom Floor Bar (Mobile Floor Bar) ──────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #e5e8e3',
        paddingTop: 8,
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 8px))',
        paddingLeft: 14,
        paddingRight: 14,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.04)',
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>
              Live Floor Total
            </div>
            <div style={{
              fontSize: '1rem', fontWeight: 900, color: '#1e5e4a',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              ₹{stats.totalRevenue.toLocaleString('en-IN')}
              <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500, marginLeft: 6 }}>
                ({stats.activeTableCount} active tables)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              fetchOrders(true);
            }}
            style={{
              height: 38, padding: '0 14px', borderRadius: 10,
              background: '#1e5e4a', border: 'none', color: '#ffffff',
              fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(30, 94, 74, 0.3)',
            }}
          >
            <RefreshCw size={13} style={{
              animation: refreshing ? 'spin-cw 0.7s linear infinite' : 'none',
            }} />
            <span>{refreshing ? 'Syncing…' : 'Sync Floor'}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
