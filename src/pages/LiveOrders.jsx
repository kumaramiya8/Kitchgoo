import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  UtensilsCrossed, Clock, RefreshCw, Search, Sparkles, Check, Copy, Maximize,
  Minimize, Users, AlertCircle, ShoppingBag, Receipt, ChevronDown, ChevronUp,
  Table as TableIcon, Flame, Coffee, ArrowLeft
} from 'lucide-react';
import { calculateTableBill, resolveTableSavedOrder } from '../utils/tableOrders';

const STATUS_CONFIG = {
  available: { label: 'Available', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  occupied: { label: 'Occupied', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' },
  ordered: { label: 'Active Order', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.14)' },
  billing: { label: 'Billing', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.14)' },
  paying: { label: 'Paying', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.14)' },
  'needs-bussing': { label: 'Bussing', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)' },
  reserved: { label: 'Reserved', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.14)' },
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

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'all' | 'waiting' | 'available'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTableId, setCopiedTableId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedChits, setExpandedChits] = useState({});

  // Fetch live orders from backend
  const fetchOrders = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else if (!data) setLoading(true);

    try {
      const res = await fetch(`/api/public/orders/${encodeURIComponent(tenantName)}`);
      if (!res.ok) {
        throw new Error(`Failed to load orders (${res.status})`);
      }
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

  // Background auto-refresh polling every 6 seconds (pauses when tab is hidden)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchOrders(true);
    }, 6000);

    return () => clearInterval(timer);
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

  // Fullscreen toggle handler
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
    setExpandedChits(prev => ({ ...prev, [id]: !prev[id] }));
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

      // Elapsed time calculation
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
        const matchesNum = String(t.number || '').toLowerCase().includes(q) || `table ${t.number}`.includes(q);
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

  // Copy plain text receipt to clipboard
  const handleCopyReceipt = (table) => {
    const lines = [
      `🧾 ${data?.restaurantName || tenantName} — Table ${table.number || table.id}`,
      table.guestName ? `Guest: ${table.guestName}` : null,
      `Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      '--------------------------------',
      ...(table.items || []).map(i => `${i.qty || 1}x ${i.name} — ₹${((i.price || 0) * (i.qty || 1)).toLocaleString('en-IN')}`),
      '--------------------------------',
      `Subtotal: ₹${table.bill.subtotal.toLocaleString('en-IN')}`,
      table.bill.tax > 0 ? `GST: ₹${table.bill.tax.toLocaleString('en-IN')}` : null,
      table.bill.serviceCharge > 0 ? `Service Charge: ₹${table.bill.serviceCharge.toLocaleString('en-IN')}` : null,
      `TOTAL BILL: ₹${table.bill.grandTotal.toLocaleString('en-IN')}`,
    ].filter(Boolean).join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(lines).then(() => {
        setCopiedTableId(table.id);
        setTimeout(() => setCopiedTableId(null), 2200);
      }).catch(() => {});
    }
  };

  const restaurantDisplayName = data?.restaurantName || tenantName;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--canvas, #f1f3ef)',
      color: 'var(--text-primary, #1c2420)',
      fontFamily: "var(--font-body, 'Hanken Grotesk', system-ui, sans-serif)",
      paddingBottom: '40px',
    }}>
      {/* ── Top Pass Rail ───────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, #1e5e4a 0%, #1e5e4a 62%, #b77e23 100%)',
        zIndex: 1000,
      }} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--header-bg, #fbfcfa)',
        borderBottom: '1px solid var(--border, #e2e6e0)',
        padding: '12px 18px',
        position: 'sticky',
        top: 0,
        zIndex: 900,
        boxShadow: '0 2px 8px rgba(28, 36, 32, 0.04)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: '#1e5e4a', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(30, 94, 74, 0.25)',
            }}>
              <UtensilsCrossed size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{
                  fontSize: '1.15rem', fontWeight: 800, margin: 0,
                  fontFamily: "'Young Serif', Georgia, serif", color: 'var(--text-primary, #1c2420)',
                }}>
                  {restaurantDisplayName}
                </h1>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px', borderRadius: 9999,
                  background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a',
                  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#16a34a',
                    boxShadow: '0 0 6px rgba(22, 163, 74, 0.8)',
                  }} className="animate-pulse" />
                  LIVE
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #87938c)', marginTop: 1 }}>
                Waiter Live Table Orders & Bills
              </div>
            </div>
          </div>

          {/* Header Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontSize: '0.74rem', color: 'var(--text-muted, #87938c)',
              display: 'flex', alignItems: 'center', gap: 4, marginRight: 4,
            }}>
              <Clock size={12} />
              <span>{secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}</span>
            </div>

            <button
              type="button"
              onClick={() => fetchOrders(true)}
              disabled={refreshing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border, #e2e6e0)',
                color: 'var(--text-primary, #1c2420)', fontSize: '0.78rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              title="Refresh live orders now"
            >
              <RefreshCw size={13} style={{
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              }} />
              <span>{refreshing ? 'Updating…' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8,
                background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border, #e2e6e0)',
                color: 'var(--text-secondary, #56635c)', cursor: 'pointer',
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ──────────────────────────────────────── */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px' }}>

        {/* Error banner if network fails */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#b91c1c', fontSize: '0.82rem', marginBottom: 16,
          }}>
            <AlertCircle size={16} />
            <span style={{ flex: 1 }}>{error} — Will retry automatically.</span>
            <button
              onClick={() => fetchOrders(false)}
              style={{
                background: 'none', border: 'underline', color: '#b91c1c',
                fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.82rem',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Live KPI Stats Bar ─────────────────────────────────── */}
        <section style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12, marginBottom: 16,
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: 12, padding: '12px 14px',
            border: '1px solid var(--border, #e2e6e0)',
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28, 36, 32, 0.05))',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #87938c)', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Tables
            </div>
            <div style={{
              fontSize: '1.45rem', fontWeight: 800, color: '#1e5e4a',
              fontFamily: 'var(--font-mono, monospace)', marginTop: 2,
            }}>
              {stats.activeTableCount}
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
                / {stats.allCount}
              </span>
            </div>
          </div>

          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: 12, padding: '12px 14px',
            border: '1px solid var(--border, #e2e6e0)',
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28, 36, 32, 0.05))',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #87938c)', fontWeight: 600, textTransform: 'uppercase' }}>
              Items on Floor
            </div>
            <div style={{
              fontSize: '1.45rem', fontWeight: 800, color: '#b77e23',
              fontFamily: 'var(--font-mono, monospace)', marginTop: 2,
            }}>
              {stats.totalItems}
            </div>
          </div>

          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: 12, padding: '12px 14px',
            border: '1px solid var(--border, #e2e6e0)',
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28, 36, 32, 0.05))',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #87938c)', fontWeight: 600, textTransform: 'uppercase' }}>
              Live Total Bill
            </div>
            <div style={{
              fontSize: '1.45rem', fontWeight: 800, color: '#1e5e4a',
              fontFamily: 'var(--font-mono, monospace)', marginTop: 2,
            }}>
              ₹{stats.totalRevenue.toLocaleString('en-IN')}
            </div>
          </div>

          {stats.waitingCount > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.7), rgba(253, 230, 138, 0.4))',
              borderRadius: 12, padding: '12px 14px',
              border: '1.5px solid rgba(245, 158, 11, 0.4)',
            }}>
              <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>
                Waiting for Table
              </div>
              <div style={{
                fontSize: '1.45rem', fontWeight: 900, color: '#b45309',
                fontFamily: 'var(--font-mono, monospace)', marginTop: 2,
              }}>
                {stats.waitingCount} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>token{stats.waitingCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          )}
        </section>

        {/* ── Search & Filter Controls ────────────────────────────── */}
        <section style={{
          background: 'var(--card-bg, #ffffff)',
          borderRadius: 14, padding: '12px 14px',
          border: '1px solid var(--border, #e2e6e0)',
          marginBottom: 18,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Search box */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted, #87938c)',
            }} />
            <input
              type="text"
              placeholder="Search table #, item name, or guest…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '9px 14px 9px 36px',
                borderRadius: 8, border: '1px solid var(--border, #e2e6e0)',
                background: 'var(--input-bg, #ffffff)',
                fontSize: '0.88rem', color: 'var(--text-primary, #1c2420)',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              style={{
                padding: '6px 14px', borderRadius: 9999, border: 'none',
                background: activeTab === 'active' ? '#1e5e4a' : 'rgba(0,0,0,0.05)',
                color: activeTab === 'active' ? '#ffffff' : 'var(--text-secondary, #56635c)',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>Active Orders</span>
              <span style={{
                background: activeTab === 'active' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)',
                padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem',
              }}>
                {stats.activeTableCount}
              </span>
            </button>

            {floatingTabs.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('waiting')}
                style={{
                  padding: '6px 14px', borderRadius: 9999, border: 'none',
                  background: activeTab === 'waiting' ? '#b45309' : 'rgba(245, 158, 11, 0.15)',
                  color: activeTab === 'waiting' ? '#ffffff' : '#92400e',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>Waiting for Table</span>
                <span style={{
                  background: activeTab === 'waiting' ? 'rgba(255,255,255,0.25)' : 'rgba(180, 83, 9, 0.2)',
                  padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem',
                }}>
                  {floatingTabs.length}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                padding: '6px 14px', borderRadius: 9999, border: 'none',
                background: activeTab === 'all' ? '#1e5e4a' : 'rgba(0,0,0,0.05)',
                color: activeTab === 'all' ? '#ffffff' : 'var(--text-secondary, #56635c)',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>All Tables</span>
              <span style={{
                background: activeTab === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)',
                padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem',
              }}>
                {stats.allCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('available')}
              style={{
                padding: '6px 14px', borderRadius: 9999, border: 'none',
                background: activeTab === 'available' ? '#1e5e4a' : 'rgba(0,0,0,0.05)',
                color: activeTab === 'available' ? '#ffffff' : 'var(--text-secondary, #56635c)',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>Free Tables</span>
              <span style={{
                background: activeTab === 'available' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)',
                padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem',
              }}>
                {stats.availableCount}
              </span>
            </button>
          </div>
        </section>

        {/* ── Initial Loading State ───────────────────────────────── */}
        {loading && !data && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 280, gap: 14,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              border: '3px solid rgba(30, 94, 74, 0.2)',
              borderTopColor: '#1e5e4a',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted, #87938c)', fontWeight: 600 }}>
              Connecting to live orders for {restaurantDisplayName}…
            </div>
          </div>
        )}

        {/* ── Waiting for Table Section (if tab selected or active filter) ── */}
        {(activeTab === 'waiting' || (activeTab === 'all' && floatingTabs.length > 0)) && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              fontWeight: 800, fontSize: '0.95rem', color: '#92400e',
            }}>
              <span style={{
                background: '#f59e0b', color: '#fff', width: 22, height: 22,
                borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900,
              }}>
                {floatingTabs.length}
              </span>
              <span>Orders Waiting for Table</span>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14,
            }}>
              {floatingTabs.map(tab => (
                <div key={tab.id} style={{
                  background: '#ffffff', borderRadius: 14,
                  border: '1.5px solid rgba(245, 158, 11, 0.4)',
                  padding: '16px', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.08)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'inline-block', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 900, fontSize: '0.85rem' }}>
                          Token #{tab.tokenNumber}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', marginTop: 6, color: 'var(--text-primary)' }}>
                          {tab.guestName || 'Walk-in Guest'}
                          {tab.partySize > 1 && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}> · {tab.partySize} guests</span>}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Ordered {tab.elapsedMins} mins ago
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e5e4a', fontFamily: 'var(--font-mono, monospace)' }}>
                          ₹{tab.bill.grandTotal.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {tab.bill.itemCount} items
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div style={{
                      marginTop: 12, background: 'rgba(0,0,0,0.02)',
                      borderRadius: 8, padding: '8px 10px',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {(tab.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 600 }}>
                            <span style={{ color: '#1e5e4a', fontWeight: 800, marginRight: 6 }}>{item.qty || 1}x</span>
                            {item.name}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                            ₹{((item.price || 0) * (item.qty || 1)).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Table Orders Grid ───────────────────────────────────── */}
        {activeTab !== 'waiting' && (
          <div>
            {filteredTables.length === 0 ? (
              <div style={{
                background: 'var(--card-bg, #ffffff)', borderRadius: 16,
                padding: '48px 20px', textAlign: 'center',
                border: '1px solid var(--border, #e2e6e0)',
                color: 'var(--text-muted, #87938c)',
              }}>
                <TableIcon size={36} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {activeTab === 'active' ? 'No Active Table Orders' : 'No Tables Found'}
                </h3>
                <p style={{ fontSize: '0.84rem', maxWidth: 420, margin: '0 auto', lineHeight: 1.5 }}>
                  {activeTab === 'active'
                    ? 'All tables are currently free. When an order is placed via POS or QR Menu, it will automatically show up here.'
                    : 'Try selecting a different filter or clearing your search.'}
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 16,
              }}>
                {filteredTables.map(table => {
                  const isExpanded = expandedChits[table.id] ?? true;
                  const isCopied = copiedTableId === table.id;

                  return (
                    <div
                      key={table.id}
                      style={{
                        background: 'var(--card-bg, #ffffff)',
                        borderRadius: 16,
                        border: table.hasOrder
                          ? '1.5px solid rgba(30, 94, 74, 0.28)'
                          : '1px solid var(--border, #e2e6e0)',
                        boxShadow: table.hasOrder
                          ? '0 4px 16px rgba(30, 94, 74, 0.08)'
                          : 'var(--shadow-sm, 0 1px 2px rgba(28, 36, 32, 0.05))',
                        overflow: 'hidden',
                        display: 'flex', flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                      }}
                    >
                      {/* Top Header of Table Card */}
                      <div style={{
                        padding: '14px 16px',
                        background: table.hasOrder
                          ? 'linear-gradient(180deg, rgba(30, 94, 74, 0.04), transparent)'
                          : 'transparent',
                        borderBottom: '1px solid var(--border-subtle, #eaede8)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10,
                              background: table.hasOrder ? '#1e5e4a' : 'rgba(0,0,0,0.06)',
                              color: table.hasOrder ? '#ffffff' : 'var(--text-secondary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 900, fontSize: '0.95rem',
                              fontFamily: 'var(--font-mono, monospace)',
                            }}>
                              T{table.number || table.id}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-primary)' }}>
                                Table {table.number || table.id}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {table.seats} seats {table.section ? `· ${table.section}` : ''}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 800,
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
                            marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border-subtle, #eaede8)',
                            fontSize: '0.75rem', color: 'var(--text-secondary, #56635c)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Users size={12} />
                              <span style={{ fontWeight: 600 }}>{table.guestName || 'Guest'}</span>
                              {table.partySize && table.partySize > 1 && (
                                <span style={{ color: 'var(--text-muted)' }}>({table.partySize}p)</span>
                              )}
                            </div>
                            {table.elapsedMins > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                                <Clock size={12} />
                                <span>{table.elapsedMins}m seated</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Items List Body */}
                      <div style={{ padding: '12px 16px', flex: 1 }}>
                        {!table.hasOrder ? (
                          <div style={{
                            padding: '24px 0', textAlign: 'center',
                            color: 'var(--text-muted, #87938c)', fontSize: '0.8rem',
                          }}>
                            No active items on this table.
                          </div>
                        ) : (
                          <div>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              marginBottom: 8,
                            }}>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Ordered Items ({table.bill.itemCount})
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleExpand(table.id)}
                                style={{
                                  background: 'none', border: 'none', color: 'var(--text-muted)',
                                  fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
                                }}
                              >
                                {isExpanded ? 'Collapse' : 'Expand'}
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </div>

                            {isExpanded && (
                              <div style={{
                                display: 'flex', flexDirection: 'column', gap: 8,
                                marginBottom: 12,
                              }}>
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
                                          fontFamily: 'var(--font-mono, monospace)',
                                          marginTop: 1, flexShrink: 0,
                                        }}>
                                          {itemQty}x
                                        </span>
                                        <div>
                                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {item.name}
                                          </div>
                                          {item.notes && (
                                            <div style={{ fontSize: '0.72rem', color: '#b45309', fontStyle: 'italic' }}>
                                              Note: {item.notes}
                                            </div>
                                          )}
                                          {(item.modifiers || []).length > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                              {item.modifiers.map(m => `+ ${m.name}`).join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{
                                        fontWeight: 700,
                                        fontFamily: 'var(--font-mono, monospace)',
                                        color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        ₹{lineTotal.toLocaleString('en-IN')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Bill Calculation Chit Box */}
                            <div style={{
                              background: 'rgba(0, 0, 0, 0.02)',
                              border: '1px solid var(--border-subtle, #eaede8)',
                              borderRadius: 12, padding: '10px 14px',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                                <span>Subtotal</span>
                                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                  ₹{table.bill.subtotal.toLocaleString('en-IN')}
                                </span>
                              </div>

                              {table.bill.tax > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                                  <span>GST / Taxes</span>
                                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                    ₹{table.bill.tax.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              )}

                              {table.bill.serviceCharge > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                                  <span>Service Charge</span>
                                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                    ₹{table.bill.serviceCharge.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              )}

                              <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border, #e2e6e0)',
                              }}>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                  Current Bill Total
                                </span>
                                <span style={{
                                  fontWeight: 900, fontSize: '1.25rem',
                                  color: '#1e5e4a',
                                  fontFamily: 'var(--font-mono, monospace)',
                                  letterSpacing: '-0.02em',
                                }}>
                                  ₹{table.bill.grandTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Quick Copy / Action */}
                      {table.hasOrder && (
                        <div style={{
                          padding: '10px 16px',
                          background: 'rgba(0,0,0,0.015)',
                          borderTop: '1px solid var(--border-subtle, #eaede8)',
                          display: 'flex', justifyContent: 'flex-end', gap: 8,
                        }}>
                          <button
                            type="button"
                            onClick={() => handleCopyReceipt(table)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '6px 12px', borderRadius: 8,
                              background: isCopied ? '#16a34a' : 'var(--card-bg, #ffffff)',
                              border: isCopied ? '1px solid #16a34a' : '1px solid var(--border, #e2e6e0)',
                              color: isCopied ? '#ffffff' : 'var(--text-secondary, #56635c)',
                              fontSize: '0.75rem', fontWeight: 700,
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            title="Copy bill details to clipboard"
                          >
                            {isCopied ? <Check size={13} /> : <Copy size={13} />}
                            <span>{isCopied ? 'Copied Bill!' : 'Copy Bill'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
