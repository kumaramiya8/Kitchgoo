import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../db/AppContext';
import { useAuth } from '../db/AuthContext';
import { initGuestTenantDB, initTenantDB, exitGuestMode, saveTableState, saveTableOrder, getAll, setGuestTable, upsertGuestFromQR } from '../db/database';
import {
  Search, ShoppingCart, Plus, Minus, Check, ChevronRight, X, ArrowLeft, Utensils, Award,
  Sparkles, Send, Bot, Loader2, Pin, Clock, AlertTriangle, Flame, Leaf, Bell, Droplets,
  CreditCard, ChevronDown, ChevronUp, Star, MessageSquare, Eye
} from 'lucide-react';

export function isRestaurantOpen(operations = {}, now = new Date()) {
  const {
    openingTime = '09:00',
    closingTime = '23:00',
    workingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  } = operations || {};

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = daysOfWeek[now.getDay()];

  if (Array.isArray(workingDays) && workingDays.length > 0) {
    if (!workingDays.includes(currentDay)) {
      return false;
    }
  }

  const [openH, openM] = (openingTime || '00:00').split(':').map(Number);
  const [closeH, closeM] = (closingTime || '23:59').split(':').map(Number);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = (isNaN(openH) ? 0 : openH) * 60 + (isNaN(openM) ? 0 : openM);
  const closeMinutes = (isNaN(closeH) ? 23 : closeH) * 60 + (isNaN(closeM) ? 59 : closeM);

  if (openMinutes <= closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
  } else {
    // Overnight schedule (e.g. 18:00 to 02:00)
    return nowMinutes >= openMinutes || nowMinutes <= closeMinutes;
  }
}

export function sortAndFilterMenuItems(items = [], options = {}) {
  const {
    hiddenItemIds = [],
    pinnedItemIds = [],
    sortBySales = false,
    salesMap = {},
    category = 'All',
    searchQuery = '',
  } = options;

  const hiddenSet = new Set(hiddenItemIds || []);
  const pinnedSet = new Set(pinnedItemIds || []);

  // 1. Filter out inactive, 86'd, and hidden items
  let list = (items || []).filter(item => {
    if (!item) return false;
    if (item.active === false || item.sold86) return false;
    if (hiddenSet.has(item.id)) return false;
    return true;
  });

  // 2. Filter by search query or category
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(i =>
      (i.name && i.name.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.category && i.category.toLowerCase().includes(q))
    );
  } else if (category && category !== 'All') {
    list = list.filter(i => i.category === category);
  }

  // 3. Sort:
  // - Pinned items ALWAYS on top (regardless of any other setting)
  // - If both or neither pinned, sort by sales count descending if sortBySales is true
  list.sort((a, b) => {
    const aPinned = pinnedSet.has(a.id);
    const bPinned = pinnedSet.has(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    if (sortBySales) {
      const aSales = Number(salesMap[a.id] ?? (a.name ? salesMap[a.name] : undefined) ?? a.salesCount ?? 0);
      const bSales = Number(salesMap[b.id] ?? (b.name ? salesMap[b.name] : undefined) ?? b.salesCount ?? 0);
      if (bSales !== aSales) {
        return bSales - aSales;
      }
    }

    return 0;
  });

  return list;
}

export function computeHighMarginItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => {
    const price = Number(item.price) || 0;
    const cost = Number(item.costPrice ?? item.cost) || 0;
    if (price <= 0) return false;
    if (cost > 0) {
      const margin = (price - cost) / price;
      return margin >= 0.4;
    }
    return Boolean(item.chefSpecial || item.isSpecial || item.isPopular);
  });
}

export function cleanTableId(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim().toLowerCase();
  if (!s) return '';
  // Fix common typo of letter 'o' / 'O' instead of digit '0' (e.g. '1o' -> '10')
  s = s.replace(/(\d)o\b/gi, '$10').replace(/\bo(\d)/gi, '0$1');
  // Strip prefixes like 'table', 'tbl', 't', '#', and separators '_', '-'
  s = s.replace(/^(table|tbl|t|#|\s|-|_)+/i, '').trim();
  // Strip leading zeros if numeric (e.g. '01' -> '1', '05' -> '5')
  if (/^0+[1-9]\d*$/.test(s)) {
    s = s.replace(/^0+/, '');
  }
  return s;
}

export function matchTable(tables, query) {
  if (!tables || !query) return null;
  const q = String(query).trim().toLowerCase();
  if (!q) return null;

  // 1. Exact match on number, id, name, or label
  let found = tables.find(t =>
    String(t.number || '').trim().toLowerCase() === q ||
    String(t.id || '').trim().toLowerCase() === q ||
    String(t.name || '').trim().toLowerCase() === q ||
    String(t.label || '').trim().toLowerCase() === q
  );
  if (found) return found;

  // 2. Normalized clean match (strips prefixes, leading zeros, fixes 1o -> 10)
  const cleanQ = cleanTableId(q);
  if (cleanQ) {
    found = tables.find(t => {
      const cleanNum = cleanTableId(t.number);
      const cleanId = cleanTableId(t.id);
      const cleanName = cleanTableId(t.name);
      const cleanLabel = cleanTableId(t.label);
      return (cleanNum && cleanNum === cleanQ) ||
             (cleanId && cleanId === cleanQ) ||
             (cleanName && cleanName === cleanQ) ||
             (cleanLabel && cleanLabel === cleanQ);
    });
    if (found) return found;
  }

  return null;
}

const QRMenu = () => {
  const { tenantId } = useParams();
  const [searchParams] = useSearchParams();
  const tableParam = (searchParams.get('table') || '').replace(/\D/g, '');

  const { menu, settings, orders, reload, hydrateFromCache, posTables, setPosTables, posSavedOrders, setPosSavedOrders, fireToKDS, broadcastOrderCreated } = useApp();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [guestMenu, setGuestMenu] = useState(null);
  const [guestSettings, setGuestSettings] = useState(null);
  const [guestItemSales, setGuestItemSales] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState({}); // { itemId: { item, qty, notes } }
  const [showCart, setShowCart] = useState(false);
  const [serviceToast, setServiceToast] = useState(null);
  const [activeNoteItemId, setActiveNoteItemId] = useState(null);
  const [activeTableOrderExpanded, setActiveTableOrderExpanded] = useState(true);

  // Checkout form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [tableNumber, setTableNumber] = useState(tableParam);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // AI chat state
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiEndRef = useRef(null);
  const [pendingAiOrder, setPendingAiOrder] = useState(null);
  const [pendingAiStep, setPendingAiStep] = useState(null);

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

  // Re-init whenever tenant or tableParam changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setCart({});
      setShowCart(false);
      setOrderSuccess(false);
      setCustomerName('');
      setTableNumber(tableParam);
      try {
        const payload = await initGuestTenantDB(tenantId, tableParam);
        if (!cancelled && payload) {
          if (payload.menu) setGuestMenu(payload.menu);
          if (payload.settings) setGuestSettings(payload.settings);
          if (payload.itemSales) setGuestItemSales(payload.itemSales);
          hydrateFromCache();
        }
      } catch (err) {
        console.error('[QRMenu] Error loading tenant database:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tenantId, tableParam]);

  // Cleanup guest mode when navigating away
  const userRef = useRef(user);
  const reloadRef = useRef(reload);
  userRef.current = user;
  reloadRef.current = reload;
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/qrmenu/')) {
        return;
      }
      exitGuestMode();
      const u = userRef.current;
      if (u?.restaurantName) {
        initTenantDB(u.restaurantName).then(() => reloadRef.current?.()).catch(() => {});
      }
    };
  }, []);

  // Prefill guest name and phone only from this table's record
  useEffect(() => {
    if (tableNumber && posTables && posTables.length > 0) {
      const targetTable = matchTable(posTables, tableNumber);
      if (targetTable) {
        if (!customerName && targetTable.guestName) {
          setCustomerName(targetTable.guestName);
        }
        if (!phone && targetTable.guestPhone) {
          setPhone(targetTable.guestPhone);
        }
      }
    }
  }, [tableNumber, posTables, customerName, phone]);

  // Sync guest table ID to sessionStorage and db memory
  useEffect(() => {
    if (tableNumber && posTables && posTables.length > 0) {
      const targetTable = matchTable(posTables, tableNumber);
      if (targetTable) {
        setGuestTable(targetTable.id);
      }
    }
  }, [tableNumber, posTables]);

  const effectiveMenu = (guestMenu && guestMenu.length > 0) ? guestMenu : menu;
  const effectiveSettings = guestSettings || settings;

  const qrMenuSettings = effectiveSettings?.qrMenu || {};
  const allowOrdering = qrMenuSettings.allowOrdering !== false && qrMenuSettings.enableOrdering !== false;
  const orderingDisabledMessage = qrMenuSettings.orderingDisabledMessage || 'Digital menu for browsing only • Please place your order with our waitstaff.';
  const syncTimings = qrMenuSettings.syncTimings !== false;
  const closedMessage = qrMenuSettings.closedMessage || 'Our kitchen is currently closed for orders outside operating hours.';
  const headerBgImage = qrMenuSettings.headerBgImage || '';
  const sortBySalesSetting = qrMenuSettings.sortBySales === true;
  const pinnedItemIds = Array.isArray(qrMenuSettings.pinnedItemIds) ? qrMenuSettings.pinnedItemIds : [];
  const hiddenItemIds = Array.isArray(qrMenuSettings.hiddenItemIds) ? qrMenuSettings.hiddenItemIds : [];
  const aiPromoteHighMargin = qrMenuSettings.aiPromoteHighMargin !== false;
  const pinnedTagLabel = qrMenuSettings.pinnedTagLabel ?? 'Pinned';
  const chefsPickTagLabel = qrMenuSettings.chefsPickTagLabel || "Chef's Pick";
  const mostOrderedTagLabel = qrMenuSettings.mostOrderedTagLabel || 'Most Ordered';
  const chefsPickItemIds = Array.isArray(qrMenuSettings.chefsPickItemIds) ? qrMenuSettings.chefsPickItemIds : [];
  const mostOrderedItemIds = Array.isArray(qrMenuSettings.mostOrderedItemIds) ? qrMenuSettings.mostOrderedItemIds : [];
  const itemCustomTags = (qrMenuSettings.itemCustomTags && typeof qrMenuSettings.itemCustomTags === 'object') ? qrMenuSettings.itemCustomTags : {};
  const showTrending = qrMenuSettings.showTrending !== false;
  const trendingTitle = qrMenuSettings.trendingTitle || 'Trending Hits';
  const trendingItemIds = Array.isArray(qrMenuSettings.trendingItemIds) ? qrMenuSettings.trendingItemIds : [];
  const showStaffService = qrMenuSettings.showStaffService !== false;
  const aiButtonText = qrMenuSettings.aiButtonText || 'Ask AI Copilot';
  const aiButtonColor = qrMenuSettings.aiButtonColor || '#7c3aed';

  const isStoreOpen = useMemo(() => {
    if (!syncTimings) return true;
    return isRestaurantOpen(effectiveSettings?.operations);
  }, [syncTimings, effectiveSettings?.operations]);

  // All-time item sales counts: prefer server/guest itemSales, fallback to item.salesCount or orders
  const salesMap = useMemo(() => {
    const counts = { ...(guestItemSales || {}) };
    (effectiveMenu || []).forEach(it => {
      if (it && typeof it.salesCount === 'number') {
        if (it.id && counts[it.id] === undefined) counts[it.id] = it.salesCount;
        if (it.name && counts[it.name] === undefined) counts[it.name] = it.salesCount;
      }
    });
    (orders || []).forEach(o => {
      (o.items || []).forEach(it => {
        const key = it.id || it.itemId || it.name;
        counts[key] = (counts[key] || 0) + (Number(it.qty) || 1);
        if (it.name) counts[it.name] = (counts[it.name] || 0) + (Number(it.qty) || 1);
      });
    });
    return counts;
  }, [guestItemSales, effectiveMenu, orders]);

  // Base menu items
  const menuItems = useMemo(() => {
    if (!effectiveMenu) return [];
    return sortAndFilterMenuItems(effectiveMenu, {
      hiddenItemIds,
      pinnedItemIds,
      sortBySales: sortBySalesSetting,
      salesMap,
      category: 'All',
      searchQuery: '',
    });
  }, [effectiveMenu, hiddenItemIds, pinnedItemIds, sortBySalesSetting, salesMap]);

  // Categories list
  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    return ['All', ...cats];
  }, [menuItems]);

  // Filtered menu list (pinned items always on top, sorted according to category and settings)
  const filteredItems = useMemo(() => {
    return sortAndFilterMenuItems(menuItems, {
      hiddenItemIds,
      pinnedItemIds,
      sortBySales: sortBySalesSetting,
      salesMap,
      category: activeCategory,
      searchQuery,
    });
  }, [menuItems, hiddenItemIds, pinnedItemIds, sortBySalesSetting, salesMap, activeCategory, searchQuery]);

  // Curated dishes for Trending Hits section (ONLY dishes configured in settings)
  const trendingDishes = useMemo(() => {
    if (!showTrending || trendingItemIds.length === 0) return [];
    const hiddenSet = new Set(hiddenItemIds || []);
    return trendingItemIds
      .map(id => (effectiveMenu || []).find(m => m.id === id))
      .filter(item => item && item.active !== false && !item.sold86 && !hiddenSet.has(item.id));
  }, [showTrending, trendingItemIds, effectiveMenu, hiddenItemIds]);

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

  const cartItemsCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, item) => sum + (item.item.price * item.qty), 0);

  // Derive top-selling items from order history/salesMap
  const topSellers = useMemo(() => {
    const withCounts = menuItems.filter(m => (salesMap[m.id] || (m.name && salesMap[m.name]) || m.salesCount || 0) > 0);
    if (withCounts.length >= 2) {
      return withCounts.sort((a, b) => {
        const aCount = salesMap[a.id] || (a.name && salesMap[a.name]) || a.salesCount || 0;
        const bCount = salesMap[b.id] || (b.name && salesMap[b.name]) || b.salesCount || 0;
        return bCount - aCount;
      }).slice(0, 6);
    }
    return menuItems.slice(0, 4);
  }, [menuItems, salesMap]);

  const aiOrderingEnabled = effectiveSettings?.modules?.qrAiOrdering !== false;
  const pricesIncludeGst = effectiveSettings?.billing?.pricesIncludeGst !== false;

  const rawResName = effectiveSettings?.restaurant?.name;
  const isKitchgooFallback = rawResName && rawResName.toLowerCase() === 'kitchgoo' && tenantId && tenantId.toLowerCase() !== 'kitchgoo';
  const restaurantName = (!isKitchgooFallback && rawResName) ? rawResName : (tenantId || 'Kitchgoo');

  // AI Welcome message
  useEffect(() => {
    if (showAiChat && aiMessages.length === 0) {
      const restaurantLabel = restaurantName || 'our kitchen';
      const topNames = topSellers.slice(0, 2).map(i => i.name).join(' & ');
      setAiMessages([{
        role: 'assistant',
        text: `Hey there! 👋 I'm your AI Food Copilot at **${restaurantLabel}**.\n\nTell me what you're craving or your budget, and I'll recommend the best dishes and add them to your table!${topNames ? `\n\n🔥 Trending right now: ${topNames}` : ''}`,
      }]);
    }
  }, [showAiChat, restaurantName, topSellers]);

  useEffect(() => {
    if (showAiChat) aiEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, showAiChat]);

  // Core order placement
  const doPlaceOrder = useCallback(async (guestName, tableNum, cartItems, extra = {}) => {
    if (!allowOrdering) {
      return { ok: false, error: orderingDisabledMessage };
    }
    if (!isStoreOpen) {
      return { ok: false, error: closedMessage };
    }
    const resolvedName = (guestName && guestName.trim()) || 'Walk-in';
    const rawTable = (tableNum && String(tableNum).trim()) || (tableParam && String(tableParam).trim()) || '';
    const resolvedTable = cleanTableId(rawTable);
    if (!resolvedTable) return { ok: false, error: 'A valid numeric table number is required.' };

    let targetTable = matchTable(posTables || [], resolvedTable);
    if (!targetTable) {
      const safeId = `tbl_${resolvedTable.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      targetTable = {
        id: safeId,
        number: resolvedTable,
        name: `Table ${resolvedTable}`,
        status: 'available',
        seats: 4,
        shape: 'square',
      };
    }

    const orderNotes = (extra && extra.notes) || notes || '';
    const guestPhoneNum = (extra && extra.phone) || phone || '';

    const newItems = cartItems.map(c => {
      const itemId = c.item.id || `item_${Math.random().toString(36).substring(2, 9)}`;
      return {
        id: itemId,
        name: c.item.name,
        price: c.item.price,
        qty: c.qty,
        _cartKey: `${itemId}_`,
        modifiers: [],
        notes: c.notes || '',
        specialInstructions: c.notes || '',
        modifierGroups: c.item.modifierGroups || [],
        course: 1,
        seat: 1,
      };
    });

    const cachedOrders = getAll('pos_saved_orders') || {};
    const existingItems = ((posSavedOrders && (posSavedOrders[targetTable.id] || (targetTable.number && posSavedOrders[String(targetTable.number)]))) ||
                           cachedOrders[targetTable.id] ||
                           (targetTable.number && cachedOrders[String(targetTable.number)]) ||
                           []);

    const hasExistingItems = existingItems.length > 0;
    const isFreeOrBussing = !hasExistingItems && (!targetTable.status || targetTable.status === 'available' || targetTable.status === 'needs-bussing');
    const baseItems = hasExistingItems ? existingItems : [];
    const mergedItems = [...baseItems];
    newItems.forEach(newItem => {
      const idx = mergedItems.findIndex(i =>
        (i._cartKey && newItem._cartKey && i._cartKey === newItem._cartKey) ||
        (i.id === newItem.id && (i.notes || '') === (newItem.notes || ''))
      );
      if (idx >= 0) mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + newItem.qty };
      else mergedItems.push(newItem);
    });

    const updatedTable = {
      ...targetTable,
      status: 'ordered',
      guestName: resolvedName,
      guestPhone: guestPhoneNum || targetTable.guestPhone || null,
      notes: orderNotes || targetTable.notes || null,
      seatedAt: isFreeOrBussing ? new Date().toISOString() : (targetTable.seatedAt || new Date().toISOString()),
    };

    setGuestTable(targetTable.id);

    setPosTables(prev => {
      const exists = (prev || []).some(t => String(t.id) === String(targetTable.id));
      if (exists) {
        return prev.map(t => String(t.id) === String(targetTable.id) ? updatedTable : t);
      }
      return [...(prev || []), updatedTable];
    });
    setPosSavedOrders(prev => {
      const next = { ...(prev || {}) };
      next[targetTable.id] = mergedItems;
      if (targetTable.number) next[String(targetTable.number)] = mergedItems;
      return next;
    });

    try {
      await saveTableState(targetTable.id, updatedTable);
    } catch (err) {
      console.warn('[QRMenu] Error saving table state:', err);
    }

    try {
      await saveTableOrder(targetTable.id, mergedItems);
    } catch (err) {
      console.warn('[QRMenu] Error saving table order:', err);
    }

    if ((resolvedName && resolvedName.toLowerCase() !== 'walk-in') || guestPhoneNum) {
      try {
        await upsertGuestFromQR({
          name: resolvedName,
          phone: guestPhoneNum,
          notes: orderNotes,
        });
      } catch (err) {
        console.warn('[QRMenu] Non-fatal: error saving guest to CRM:', err);
      }
    }

    const kdsOrderId = `QR-${targetTable.number || targetTable.id}-${Date.now().toString().slice(-4)}`;
    try {
      await fireToKDS(kdsOrderId, newItems, targetTable.id, 'dine-in', {
        guestName: resolvedName || targetTable.guestName || null,
        tokenNumber: targetTable.number || null,
        notes: orderNotes || null,
      });
    } catch (kdsErr) {
      console.warn('[QRMenu] Error firing to KDS:', kdsErr);
    }

    try {
      await broadcastOrderCreated(targetTable.id, kdsOrderId);
    } catch (bErr) {
      console.warn('[QRMenu] Broadcast order error:', bErr);
    }

    window.dispatchEvent(new CustomEvent('kitchgoo_order_created', { detail: { tableId: targetTable.id, kdsOrderId } }));

    return { ok: true, tableId: targetTable.id, kdsOrderId };
  }, [posTables, posSavedOrders, setPosTables, setPosSavedOrders, fireToKDS, broadcastOrderCreated, tableParam, notes, phone, isStoreOpen, closedMessage, allowOrdering, orderingDisabledMessage]);

  const sendAiMessage = useCallback(async (text) => {
    if (!text.trim() || aiLoading) return;
    setAiInput('');

    if (pendingAiOrder) {
      const input = text.trim();
      setAiMessages(prev => [...prev, { role: 'user', text: input }]);

      if (pendingAiStep === 'table') {
        const digits = input.replace(/\D/g, '');
        if (!digits) {
          setAiMessages(prev => [...prev, { role: 'assistant', text: 'Please enter a valid table number using digits only (e.g. 5) 😊' }]);
          return;
        }
        const tableMatch = matchTable(posTables || [], digits);
        const resolvedTableStr = tableMatch ? String(tableMatch.number || tableMatch.id).replace(/\D/g, '') || digits : digits;
        setTableNumber(resolvedTableStr);
        if (!customerName.trim()) {
          setPendingAiStep('name');
          setAiMessages(prev => [...prev, { role: 'assistant', text: `Got Table ${resolvedTableStr}! What name should I put on the order? 😊` }]);
          return;
        }
        if (!phone.trim()) {
          setPendingAiStep('phone');
          setAiMessages(prev => [...prev, { role: 'assistant', text: `Got Table ${resolvedTableStr}! What's your phone number for order updates? 📱` }]);
          return;
        }
        setAiLoading(true);
        try {
          const result = await doPlaceOrder(customerName, resolvedTableStr, pendingAiOrder, { phone });
          if (result.ok) {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `✅ Order placed for Table ${resolvedTableStr}! The kitchen is on it. Enjoy! 🍽️` }]);
          } else {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `Sorry — ${result.error}` }]);
          }
        } catch {
          setAiMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please use the cart to place your order.' }]);
        } finally {
          setPendingAiOrder(null);
          setPendingAiStep(null);
          setAiLoading(false);
        }
        return;
      }

      if (pendingAiStep === 'name') {
        const name = input.trim();
        setCustomerName(name);
        if (!phone.trim()) {
          setPendingAiStep('phone');
          setAiMessages(prev => [...prev, { role: 'assistant', text: `Nice to meet you, ${name}! What's your phone number for updates? 📱` }]);
          return;
        }
        setAiLoading(true);
        try {
          const result = await doPlaceOrder(name, tableNumber, pendingAiOrder, { phone });
          if (result.ok) {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `✅ Got it, ${name}! Your order is fired to the kitchen. Enjoy! 🍽️` }]);
          } else {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `Sorry — ${result.error}` }]);
          }
        } catch {
          setAiMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please use the cart to place your order.' }]);
        } finally {
          setPendingAiOrder(null);
          setPendingAiStep(null);
          setAiLoading(false);
        }
        return;
      }

      if (pendingAiStep === 'phone') {
        const pInput = input.trim();
        const cleanDigits = pInput.replace(/\D/g, '');
        if (cleanDigits.length < 7) {
          setAiMessages(prev => [...prev, { role: 'assistant', text: 'Please enter a valid phone number (at least 7 digits) 😊' }]);
          return;
        }
        setPhone(pInput);
        setAiLoading(true);
        try {
          const result = await doPlaceOrder(customerName, tableNumber, pendingAiOrder, { phone: pInput });
          if (result.ok) {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `✅ Order placed for Table ${tableNumber}! The kitchen is preparing it. Enjoy! 🍽️` }]);
          } else {
            setAiMessages(prev => [...prev, { role: 'assistant', text: `Sorry — ${result.error}` }]);
          }
        } catch {
          setAiMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please use the cart to place your order.' }]);
        } finally {
          setPendingAiOrder(null);
          setPendingAiStep(null);
          setAiLoading(false);
        }
        return;
      }
    }

    setAiMessages(prev => [...prev, { role: 'user', text: text.trim() }]);
    setAiLoading(true);
    try {
      const res = await fetch('/api/qr-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          chatHistory: aiMessages.map(m => ({ role: m.role, text: m.text })),
          menuItems: menuItems.map(i => ({ id: i.id, name: i.name, price: i.price, category: i.category, description: i.description })),
          restaurantName: restaurantName || '',
          topSellers: topSellers.map(i => ({ name: i.name })),
          highMarginItems: computeHighMarginItems(menuItems).map(i => ({ name: i.name })),
          aiPromoteHighMargin,
          allowOrdering,
        }),
      });
      const data = await res.json();
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: data.text || 'Sorry, I had trouble with that. Try asking again.',
        addToCart: allowOrdering && data.add_to_cart?.length ? data.add_to_cart : null,
      }]);
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'Connection issue — please try again.' }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, aiMessages, menuItems, restaurantName, topSellers, aiPromoteHighMargin, pendingAiOrder, pendingAiStep, tableNumber, customerName, phone, posTables, doPlaceOrder, allowOrdering]);

  const handleAiOrder = useCallback(async (aiItems) => {
    if (!allowOrdering) {
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: `${orderingDisabledMessage} You can still ask me about our dishes, ingredients, or recommendations! 😊`
      }]);
      return;
    }
    if (!isStoreOpen) {
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        text: `Our kitchen is currently closed for orders outside operating hours. (${closedMessage}) You can still browse our dishes or ask me questions! 😊`
      }]);
      return;
    }

    const cartItems = aiItems.map(aiItem => {
      const match = menuItems.find(m => m.id === aiItem.id || m.name.toLowerCase() === aiItem.name.toLowerCase());
      return match ? { item: match, qty: aiItem.qty || 1, notes: '' } : null;
    }).filter(Boolean);
    if (!cartItems.length) return;

    if (!tableNumber.trim()) {
      setPendingAiOrder(cartItems);
      setPendingAiStep('table');
      setAiMessages(prev => [...prev, { role: 'assistant', text: "What's your table number? I'll fire the order straight to the kitchen! 🍽️" }]);
      return;
    }

    if (!customerName.trim()) {
      setPendingAiOrder(cartItems);
      setPendingAiStep('name');
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'Almost there! What name should I put on your order? 😊' }]);
      return;
    }

    if (!phone.trim()) {
      setPendingAiOrder(cartItems);
      setPendingAiStep('phone');
      setAiMessages(prev => [...prev, { role: 'assistant', text: "What's your phone number for order updates? 📱" }]);
      return;
    }

    setAiLoading(true);
    try {
      const result = await doPlaceOrder(customerName, tableNumber, cartItems, { phone });
      if (result.ok) {
        setAiMessages(prev => [...prev, { role: 'assistant', text: '✅ Order placed! The kitchen is preparing it now. Enjoy your meal! 🍽️' }]);
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', text: `Sorry — ${result.error}` }]);
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please use the cart below to place your order.' }]);
    } finally {
      setAiLoading(false);
    }
  }, [menuItems, tableNumber, customerName, phone, doPlaceOrder, isStoreOpen, closedMessage, allowOrdering, orderingDisabledMessage]);

  const handleAddToCart = (item) => {
    if (!allowOrdering) {
      alert(orderingDisabledMessage);
      return;
    }
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
    if (!allowOrdering) {
      alert(orderingDisabledMessage);
      return;
    }
    if (!isStoreOpen) {
      alert(closedMessage);
      return;
    }
    if (!customerName.trim() || !phone.trim() || !tableNumber.trim()) {
      alert('Please fill out your Name, Phone Number, and Table Number.');
      return;
    }
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 7) {
      alert('Please enter a valid Phone Number with at least 7 digits.');
      return;
    }
    const cleanTable = tableNumber.trim().replace(/\D/g, '');
    if (!cleanTable) {
      alert('Please enter a valid Table Number (numbers only).');
      return;
    }
    setIsSubmitting(true);
    try {
      const cartItems = Object.values(cart).map(c => ({ item: c.item, qty: c.qty, notes: c.notes || '' }));
      const result = await doPlaceOrder(customerName, cleanTable, cartItems, { notes, phone: phone.trim() });
      if (!result.ok) { alert(result.error); return; }
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

  const handleServiceCall = (type) => {
    const table = tableNumber || 'your table';
    let message = `🛎️ Waiter notified for Table ${table}! Someone is heading over.`;
    if (type === 'water') message = `💧 Water refill requested for Table ${table}! Server notified.`;
    if (type === 'bill') message = `💳 Bill requested for Table ${table}! Server is preparing it.`;
    setServiceToast({ type, text: message });
    setTimeout(() => setServiceToast(null), 3500);
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: '#64748b'
      }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(15, 23, 42, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Utensils className="animate-spin" size={28} style={{ color: '#0f172a' }} />
        </div>
        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', margin: 0 }}>Opening live menu...</p>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>Loading freshest items</span>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #f8fafc 0%, #edf2f7 100%)',
        padding: 24,
        textAlign: 'center'
      }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          boxShadow: '0 12px 28px rgba(16, 185, 129, 0.35)'
        }}>
          <Check size={44} strokeWidth={3} />
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 12px', borderRadius: 9999, marginBottom: 10 }}>
          Order Confirmed
        </span>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
          Sent to Kitchen! 🔥
        </h2>
        <p style={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 320, margin: '0 auto 20px auto', lineHeight: 1.5 }}>
          Your order is being prepped. Sit back, relax, and track items from this screen anytime!
        </p>

        {tableNumber && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '10px 20px', marginBottom: 24, boxShadow: '0 4px 14px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Assigned Table</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>Table {tableNumber}</div>
          </div>
        )}

        <button
          onClick={() => setOrderSuccess(false)}
          style={{
            background: '#0f172a',
            color: '#ffffff',
            border: 'none',
            padding: '14px 28px',
            borderRadius: 9999,
            fontWeight: 800,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <Utensils size={16} /> View & Add More Dishes
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f5f9',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      color: '#0f172a',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {/* Smartphone frame container */}
      <div style={{
        maxWidth: 500,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#ffffff',
        boxShadow: '0 0 50px rgba(0,0,0,0.06)',
        position: 'relative',
        paddingBottom: cartItemsCount > 0 ? 110 : 50,
      }}>

        {/* ── Toast Alert Banner ─────────────────────────────────── */}
        {serviceToast && (
          <div style={{
            position: 'fixed',
            top: 20,
            left: 20,
            right: 20,
            maxWidth: 460,
            margin: '0 auto',
            zIndex: 100,
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.84rem',
            fontWeight: 650,
            animation: 'slideDown 0.25s ease-out',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <span>{serviceToast.text}</span>
            <button onClick={() => setServiceToast(null)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* ── 1. Immersive Hero Header (Editorial Cover Style) ─── */}
        <div style={{
          position: 'relative',
          minHeight: 180,
          background: headerBgImage
            ? `linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0.85) 100%), url("${headerBgImage}") center/cover no-repeat`
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          padding: '24px 20px 24px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          {/* Top Status Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              padding: '5px 12px',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.4px',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: !allowOrdering ? '#f59e0b' : (isStoreOpen ? '#22c55e' : '#ef4444'), display: 'inline-block' }} />
              {!allowOrdering ? 'VIEW ONLY MENU' : (isStoreOpen ? 'KITCHEN OPEN' : 'ORDERS CLOSED')}
            </div>

            {tableNumber && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(8px)',
                padding: '5px 14px',
                borderRadius: 9999,
                fontWeight: 800,
                fontSize: '0.82rem',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}>
                📍 Table {tableNumber}
              </div>
            )}
          </div>

          {/* Restaurant Identity */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.85, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>
              <Award size={13} /> Digital Table Experience
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px', lineHeight: 1.15 }}>
              {restaurantName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: '0.8rem', opacity: 0.9 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: '#fbbf24' }}>
                <Star size={13} fill="#fbbf24" strokeWidth={0} /> 4.9
              </span>
              <span>•</span>
              <span>{allowOrdering ? 'Fast in-seat ordering' : 'View-only digital menu'}</span>
            </div>
          </div>
        </div>

        {/* ── View-Only Menu Banner Notice (Ordering Disabled) ─── */}
        {!allowOrdering && (
          <div style={{
            margin: '14px 16px 0 16px',
            padding: '12px 14px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1.5px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#92400e',
          }}>
            <Eye size={20} style={{ flexShrink: 0, color: '#d97706' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>Digital Menu (View-Only)</div>
              <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: 2, lineHeight: 1.3 }}>
                {orderingDisabledMessage}
              </div>
            </div>
          </div>
        )}

        {/* ── Closed Kitchen Banner Notice ──────────────────────── */}
        {!isStoreOpen && allowOrdering && (
          <div style={{
            margin: '14px 16px 0 16px',
            padding: '12px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#991b1b',
          }}>
            <Clock size={20} style={{ flexShrink: 0, color: '#dc2626' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800 }}>Kitchen Currently Closed for New Orders</div>
              <div style={{ fontSize: '0.75rem', color: '#7f1d1d', marginTop: 2, lineHeight: 1.3 }}>
                {closedMessage}
              </div>
            </div>
          </div>
        )}

        {/* ── Table Service Companion Bar (In-Seat Assistance) ─── */}
        {showStaffService && (
          <div style={{ padding: '14px 16px 0 16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              borderRadius: 16,
              padding: '8px 12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Bell size={13} color="#ea580c" /> Staff Service
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => handleServiceCall('waiter')}
                  style={{ fontSize: '0.7rem', fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer' }}
                >
                  🛎️ Call Waiter
                </button>
                <button
                  onClick={() => handleServiceCall('water')}
                  style={{ fontSize: '0.7rem', fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer' }}
                >
                  💧 Water
                </button>
                <button
                  onClick={() => handleServiceCall('bill')}
                  style={{ fontSize: '0.7rem', fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer' }}
                >
                  💳 Bill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Active Table Order Tracker (if dining and order exists) ── */}
        {guestTableOrder && guestTableOrder.length > 0 && (
          <div style={{ padding: '14px 16px 0 16px' }}>
            <div style={{
              background: '#f0fdf4',
              borderRadius: 18,
              padding: 14,
              border: '1px solid #bbf7d0',
              boxShadow: '0 4px 14px rgba(22, 101, 52, 0.05)'
            }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setActiveTableOrderExpanded(!activeTableOrderExpanded)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Utensils size={15} style={{ color: '#16a34a' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#14532d' }}>Active Table Order</div>
                    <div style={{ fontSize: '0.72rem', color: '#166534' }}>{guestTableOrder.length} item{guestTableOrder.length > 1 ? 's' : ''} in kitchen</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#14532d' }}>
                    ₹{billTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  {activeTableOrderExpanded ? <ChevronUp size={16} color="#166534" /> : <ChevronDown size={16} color="#166534" />}
                </div>
              </div>

              {activeTableOrderExpanded && (
                <div style={{ marginTop: 12, borderTop: '1px dashed #86efac', paddingTop: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                    {guestTableOrder.map((item, idx) => {
                      const modPrice = (item.modifiers || []).reduce((s, m) => s + (m.price || 0), 0);
                      const itemTotal = (item.price + modPrice) * item.qty;
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                          <span style={{ color: '#166534', fontWeight: 600 }}>
                            <strong style={{ color: '#14532d' }}>{item.qty}×</strong> {item.name}
                          </span>
                          <span style={{ fontWeight: 700, color: '#14532d' }}>₹{itemTotal.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#15803d', marginTop: 8, textAlign: 'center', fontWeight: 600 }}>
                    You can add more dishes anytime from the menu below!
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 2. "Trending Hits" Curated Carousel ── */}
        {trendingDishes.length > 0 && !searchQuery && activeCategory === 'All' && (
          <div style={{ marginTop: 18, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>🔥 {trendingTitle}</span>
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Swipe →</span>
            </div>

            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 18px 12px 18px', scrollSnapType: 'x mandatory' }} className="scrollbar-hide">
              {trendingDishes.map(item => {
                const cartQty = cart[item.id]?.qty || 0;
                return (
                  <div
                    key={`trending-${item.id}`}
                    style={{
                      width: 140,
                      minWidth: 140,
                      background: '#ffffff',
                      borderRadius: 18,
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
                      overflow: 'hidden',
                      scrollSnapAlign: 'start',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative'
                    }}
                  >
                    <div style={{ width: '100%', height: 96, position: 'relative', background: '#f8fafc' }}>
                      {item.image ? (
                        typeof item.image === 'string' && item.image.trim().startsWith('<svg') ? (
                          <div className="svg-img-container" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: item.image }} />
                        ) : (
                          <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🍽️</div>
                      )}
                    </div>

                    <div style={{ padding: '8px 10px 10px 10px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                          ₹{item.price.toLocaleString('en-IN')}
                        </div>
                      </div>

                      {allowOrdering && (
                        <div style={{ marginTop: 8 }}>
                          {cartQty > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', color: '#fff', borderRadius: 9999, padding: '3px 8px' }}>
                              <button onClick={() => handleRemoveFromCart(item.id)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex' }}>
                                <Minus size={11} strokeWidth={3} />
                              </button>
                              <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{cartQty}</span>
                              <button onClick={() => { if (!isStoreOpen) { alert(closedMessage); return; } handleAddToCart(item); }} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex' }}>
                                <Plus size={11} strokeWidth={3} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (!isStoreOpen) { alert(closedMessage); return; }
                                handleAddToCart(item);
                              }}
                              style={{
                                width: '100%',
                                padding: '5px 0',
                                borderRadius: 9999,
                                border: '1.5px solid #e2e8f0',
                                background: '#fff',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                color: '#0f172a',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 4
                              }}
                            >
                              <Plus size={11} strokeWidth={3} /> ADD
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 3. Sticky Filter & Category Bar ───────────────────── */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          paddingTop: 12,
        }}>
          {/* Search Input */}
          <div style={{ padding: '0 16px', marginBottom: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search delicious dishes, ingredients..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: 9999,
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: '0.86rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {searchQuery && (
                <X
                  size={15}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => setSearchQuery('')}
                />
              )}
            </div>
          </div>

          {/* Categories Horizontal Scroller */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 12px 16px' }} className="scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
                style={{
                  padding: '7px 16px',
                  borderRadius: 9999,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  border: 'none',
                  background: activeCategory === cat ? '#0f172a' : '#f1f5f9',
                  color: activeCategory === cat ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── 4. Main Menu Items List ───────────────────────────── */}
        <div style={{ padding: '16px 16px 0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.map(item => {
            const cartQty = cart[item.id]?.qty || 0;
            const salesCount = salesMap[item.id] || (item.name && salesMap[item.name]) || item.salesCount || 0;
            const isVeg = item.type === 'Veg' || item.type === 'Vegan' || (item.dietary && (item.dietary.includes('vegetarian') || item.dietary.includes('vegan'))) || (item.category && item.category.toLowerCase().includes('veg') && !item.category.toLowerCase().includes('non-veg'));
            const isNonVeg = item.type === 'Non-Veg' || (item.dietary && (item.dietary.includes('meat') || item.dietary.includes('chicken') || item.dietary.includes('fish'))) || (item.category && item.category.toLowerCase().includes('non-veg'));

            return (
              <div
                key={item.id}
                style={{
                  background: '#ffffff',
                  borderRadius: 20,
                  padding: '14px 14px',
                  border: '1px solid #f1f5f9',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  position: 'relative'
                }}
              >
                {/* Left: Info */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {/* Badges row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {isVeg ? (
                      <span title="Vegetarian" style={{ width: 14, height: 14, border: '1.5px solid #16a34a', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                      </span>
                    ) : isNonVeg ? (
                      <span title="Non-Vegetarian" style={{ width: 14, height: 14, border: '1.5px solid #dc2626', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                      </span>
                    ) : null}

                    {/* Pinned item badge */}
                    {(pinnedItemIds.includes(item.id) || item.pinned) && pinnedTagLabel && (
                      <span style={{ fontSize: '0.66rem', fontWeight: 750, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 9999, border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Pin size={10} /> {pinnedTagLabel}
                      </span>
                    )}

                    {/* Manually assigned Chef's Pick tag */}
                    {(chefsPickItemIds.includes(item.id) || item.chefsPick) && chefsPickTagLabel && (
                      <span style={{ fontSize: '0.66rem', fontWeight: 750, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 9999, border: '1px solid #fef08a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Star size={10} color="#ca8a04" fill="#ca8a04" /> {chefsPickTagLabel}
                      </span>
                    )}

                    {/* Manually assigned Most Ordered tag */}
                    {(mostOrderedItemIds.includes(item.id) || item.mostOrdered) && mostOrderedTagLabel && (
                      <span style={{ fontSize: '0.66rem', fontWeight: 750, background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 9999, border: '1px solid #ffedd5', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Flame size={10} color="#ea580c" /> {mostOrderedTagLabel}
                      </span>
                    )}

                    {/* Item custom tag */}
                    {itemCustomTags[item.id] && (
                      <span style={{ fontSize: '0.66rem', fontWeight: 750, background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 9999, border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Award size={10} color="#64748b" /> {itemCustomTags[item.id]}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 750, margin: '2px 0 3px 0', color: '#0f172a', letterSpacing: '-0.2px', lineHeight: 1.3 }}>
                    {item.name}
                  </h3>

                  {/* Price */}
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', marginBottom: 5 }}>
                    ₹{item.price.toLocaleString('en-IN')}
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 8px 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.description}
                    </p>
                  )}

                  {/* Note Editing when item in cart */}
                  {cartQty > 0 && (
                    <div style={{ marginTop: 'auto' }}>
                      {activeNoteItemId === item.id ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input
                            type="text"
                            placeholder="e.g. less spicy, no onion"
                            value={cart[item.id]?.notes || ''}
                            onChange={e => handleUpdateNotes(item.id, e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '0.72rem', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }}
                            autoFocus
                          />
                          <button
                            onClick={() => setActiveNoteItemId(null)}
                            style={{ fontSize: '0.72rem', padding: '4px 8px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer' }}
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveNoteItemId(item.id)}
                          style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.72rem', color: '#ea580c', fontWeight: 650, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <MessageSquare size={11} /> {cart[item.id]?.notes ? `Note: "${cart[item.id].notes}"` : '+ Add note'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Dish Photo & Morphing Add Button */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 96, flexShrink: 0 }}>
                  <div style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {item.image ? (
                      typeof item.image === 'string' && item.image.trim().startsWith('<svg') ? (
                        <div className="svg-img-container" style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: item.image }} />
                      ) : (
                        <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : (
                      <div style={{ fontSize: '2.2rem', opacity: 0.25 }}>🍔</div>
                    )}
                  </div>

                  {/* Morphing Stepper CTA */}
                  {allowOrdering && (
                    <div style={{ marginTop: -14, zIndex: 2 }}>
                      {cartQty > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', color: '#fff', padding: '5px 10px', borderRadius: 9999, boxShadow: '0 4px 12px rgba(15,23,42,0.25)' }}>
                          <button
                            onClick={() => handleRemoveFromCart(item.id)}
                            style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                          >
                            <Minus size={12} strokeWidth={3} />
                          </button>
                          <span style={{ fontWeight: 800, fontSize: '0.82rem', minWidth: 14, textAlign: 'center' }}>{cartQty}</span>
                          <button
                            onClick={() => {
                              if (!isStoreOpen) { alert(closedMessage); return; }
                              handleAddToCart(item);
                            }}
                            style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                          >
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (!isStoreOpen) { alert(closedMessage); return; }
                            handleAddToCart(item);
                          }}
                          style={{
                            padding: '6px 18px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            borderRadius: 9999,
                            border: '1.5px solid #e2e8f0',
                            background: '#ffffff',
                            color: '#0f172a',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Plus size={12} strokeWidth={3} /> ADD
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '56px 16px', color: '#94a3b8' }}>
              <Utensils size={36} style={{ strokeWidth: 1.5, margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '0.92rem', fontWeight: 700, color: '#475569', margin: '0 0 4px 0' }}>No dishes found</p>
              <span style={{ fontSize: '0.78rem' }}>Try clearing filters or searching another keyword.</span>
            </div>
          )}
        </div>

        {/* ── 5. Floating Glass Bottom Cart Capsule ──────────────── */}
        {allowOrdering && cartItemsCount > 0 && !showCart && (
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              left: 20,
              right: 20,
              maxWidth: 460,
              margin: '0 auto',
              zIndex: 40,
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(20px)',
              borderRadius: 9999,
              padding: '10px 18px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 12px 36px rgba(15, 23, 42, 0.35)',
              cursor: 'pointer'
            }}
            onClick={() => setShowCart(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart size={18} />
                <span style={{ position: 'absolute', top: -3, right: -3, background: '#ea580c', color: '#fff', fontSize: '0.66rem', fontWeight: 900, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f172a' }}>
                  {cartItemsCount}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{cartItemsCount} item{cartItemsCount > 1 ? 's' : ''} added</div>
                <div style={{ fontSize: '1.08rem', fontWeight: 900, letterSpacing: '-0.3px' }}>₹{cartSubtotal.toLocaleString('en-IN')}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ea580c', padding: '8px 16px', borderRadius: 9999, fontWeight: 800, fontSize: '0.84rem' }}>
              View Order <ChevronRight size={15} />
            </div>
          </div>
        )}

        {/* ── 6. AI Food Copilot (Gen Z "Craving Matcher") ─────────── */}
        {aiOrderingEnabled && !orderSuccess && (
          <>
            {/* Floating AI Bubble */}
            <button
              onClick={() => setShowAiChat(true)}
              style={{
                position: 'fixed',
                bottom: cartItemsCount > 0 ? 84 : 24,
                right: 20,
                zIndex: 42,
                padding: '9px 16px',
                borderRadius: 9999,
                background: aiButtonColor || 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
                fontWeight: 750,
                fontSize: '0.82rem',
                width: 'auto',
                maxWidth: 'calc(100vw - 40px)',
                whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={16} />
              <span>{aiButtonText || 'Ask AI Copilot'}</span>
            </button>

            {/* AI Assistant Drawer */}
            {showAiChat && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 98, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} onClick={() => setShowAiChat(false)} />

                <div style={{
                  position: 'relative',
                  background: '#ffffff',
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                  height: '82vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  maxWidth: 500,
                  width: '100%',
                  margin: '0 auto'
                }}>
                  {/* Header */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <Bot size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>AI Food Copilot ✨</div>
                      <div style={{ fontSize: '0.74rem', color: '#7c3aed', fontWeight: 650 }}>Ask cravings, recommendations & combos</div>
                    </div>
                    <button onClick={() => setShowAiChat(false)} style={{ border: 'none', background: 'rgba(0,0,0,0.05)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={16} color="#64748b" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {aiMessages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                        <div style={{
                          maxWidth: '85%',
                          padding: '11px 15px',
                          borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                          background: msg.role === 'user' ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : '#f8fafc',
                          color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                          fontSize: '0.86rem',
                          lineHeight: 1.5,
                          fontWeight: 500,
                          border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {msg.text?.replace(/\*\*(.*?)\*\*/g, '$1')}
                        </div>
                        {allowOrdering && msg.addToCart && msg.addToCart.length > 0 && (
                          <button
                            onClick={() => handleAiOrder(msg.addToCart)}
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 750,
                              padding: '8px 16px',
                              borderRadius: 9999,
                              border: 'none',
                              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                              color: '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: '0 4px 14px rgba(124,58,237,0.3)'
                            }}
                          >
                            <Send size={13} />
                            Order Now — {msg.addToCart.map(i => `${i.qty || 1}× ${i.name}`).join(', ')}
                          </button>
                        )}
                      </div>
                    ))}
                    {aiLoading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#7c3aed', fontSize: '0.84rem', fontWeight: 650 }}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating recommendations…
                      </div>
                    )}
                    <div ref={aiEndRef} />
                  </div>

                  {/* 1-Tap Vibe Prompts */}
                  <div style={{ padding: '8px 16px 0 16px', display: 'flex', gap: 6, overflowX: 'auto', borderTop: '1px solid #f1f5f9' }} className="scrollbar-hide">
                    <button
                      onClick={() => sendAiMessage('What are the most popular bestsellers right now?')}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, padding: '5px 11px', borderRadius: 9999, border: '1.5px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.05)', color: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
                    >
                      🔥 Most Hyped
                    </button>
                    <button
                      onClick={() => sendAiMessage('Suggest a healthy, light meal under 400 calories')}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, padding: '5px 11px', borderRadius: 9999, border: '1.5px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.05)', color: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
                    >
                      🥑 Healthy & Clean
                    </button>
                    <button
                      onClick={() => sendAiMessage('Suggest the best combo for 2 people under ₹600')}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, padding: '5px 11px', borderRadius: 9999, border: '1.5px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.05)', color: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
                    >
                      💸 Meal for 2
                    </button>
                    <button
                      onClick={() => sendAiMessage('I want something super spicy and comforting')}
                      style={{ whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, padding: '5px 11px', borderRadius: 9999, border: '1.5px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.05)', color: '#7c3aed', cursor: 'pointer', flexShrink: 0 }}
                    >
                      🌶️ Extra Spicy
                    </button>
                  </div>

                  {/* Input bar */}
                  <div style={{ padding: '10px 16px 16px 16px', display: 'flex', gap: 8, alignItems: 'center', background: '#fff' }}>
                    <input
                      type="text"
                      placeholder={
                        pendingAiStep === 'table' ? 'Type your table number…' :
                        pendingAiStep === 'name'  ? 'Type your name…' :
                        'Ask about dishes, ingredients, or pairings…'
                      }
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(aiInput); } }}
                      style={{ flex: 1, padding: '11px 16px', borderRadius: 9999, border: '1.5px solid #e2e8f0', fontSize: '0.86rem', outline: 'none', background: '#f8fafc' }}
                    />
                    <button
                      onClick={() => sendAiMessage(aiInput)}
                      disabled={!aiInput.trim() || aiLoading}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: !aiInput.trim() || aiLoading ? 0.5 : 1 }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 7. Slide-Up Bottom Sheet Cart ────────────────────────── */}
        {allowOrdering && showCart && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 99,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end'
          }}>
            <div style={{ flex: 1 }} onClick={() => setShowCart(false)} />

            <div style={{
              background: '#ffffff',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
              maxWidth: 500,
              width: '100%',
              margin: '0 auto',
              overflow: 'hidden'
            }}>
              {/* Drag Pill Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px 0' }}>
                <div style={{ width: 36, height: 4, borderRadius: 9999, background: '#cbd5e1' }} />
              </div>

              {/* Header */}
              <div style={{ padding: '8px 20px 14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Your Order Cart</h2>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Table {tableNumber || 'Pending'}</span>
                </div>
                <button
                  onClick={() => setShowCart(false)}
                  style={{ border: 'none', background: '#f1f5f9', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <X size={15} color="#64748b" />
                </button>
              </div>

              {/* Scrollable Cart Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {/* Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  {Object.entries(cart).map(([itemId, cartItem]) => (
                    <div key={itemId} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 750, fontSize: '0.9rem', color: '#0f172a' }}>{cartItem.item.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 650, marginTop: 2 }}>
                            ₹{cartItem.item.price} × {cartItem.qty} = <span style={{ color: '#0f172a', fontWeight: 800 }}>₹{cartItem.item.price * cartItem.qty}</span>
                          </div>
                        </div>

                        {/* Quantity Stepper */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f172a', color: '#fff', padding: '4px 10px', borderRadius: 9999 }}>
                          <button
                            onClick={() => handleRemoveFromCart(itemId)}
                            style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2 }}
                          >
                            <Minus size={11} strokeWidth={3} />
                          </button>
                          <span style={{ fontWeight: 800, fontSize: '0.82rem', minWidth: 12, textAlign: 'center' }}>{cartItem.qty}</span>
                          <button
                            onClick={() => handleAddToCart(cartItem.item)}
                            style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer', padding: 2 }}
                          >
                            <Plus size={11} strokeWidth={3} />
                          </button>
                        </div>
                      </div>

                      {/* Item Note */}
                      <input
                        type="text"
                        placeholder="Add cooking note (e.g. less spicy, no mayo)..."
                        value={cartItem.notes || ''}
                        onChange={e => handleUpdateNotes(itemId, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 12px',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          fontSize: '0.74rem',
                          background: '#f8fafc',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Checkout Form */}
                <form onSubmit={handlePlaceOrder} style={{ borderTop: '2px dashed #e2e8f0', paddingTop: 16 }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>
                    Guest Details
                  </h3>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Your Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9876543210"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Table No. *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        placeholder="e.g. 4"
                        value={tableNumber}
                        onChange={e => setTableNumber(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>General Remarks (Optional)</label>
                    <textarea
                      placeholder="Any overall instructions for table service..."
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: '0.84rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Summary Breakdown */}
                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '12px 14px', marginBottom: 18, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b', marginBottom: 6 }}>
                      <span>Subtotal</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748b', marginBottom: 8 }}>
                      <span>Taxes & GST</span>
                      <span style={{ fontWeight: 650 }}>{pricesIncludeGst ? 'Included' : `+${effectiveSettings?.billing?.gstRate || 5}% GST`}</span>
                    </div>
                    <div style={{ height: '1px', background: '#e2e8f0', margin: '6px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>Total Pay</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !isStoreOpen}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: 9999,
                      fontWeight: 800,
                      fontSize: '0.94rem',
                      background: isStoreOpen ? '#0f172a' : '#94a3b8',
                      color: '#ffffff',
                      border: 'none',
                      cursor: isStoreOpen ? 'pointer' : 'not-allowed',
                      boxShadow: isStoreOpen ? '0 8px 24px rgba(15, 23, 42, 0.25)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    {!isStoreOpen ? 'Kitchen Closed' : (isSubmitting ? 'Sending to Kitchen…' : 'Send Order to Kitchen 🔥')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default QRMenu;
