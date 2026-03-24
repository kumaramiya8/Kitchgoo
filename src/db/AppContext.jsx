/**
 * AppContext — Global React state backed by the database layer.
 * All pages can access and mutate shared data from here.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  initDB,
  getAll,
  getSettings,
  insert,
  update,
  remove,
  computeStockStatus,
  logAttendance,
  getAttendanceForStaff,
  createOrder,
  getTodayStats,
  updateSettings as dbUpdateSettings,
  addDeliveryOrder,
  updateDeliveryStatus,
  genId,
} from './database';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [todayStats, setTodayStats] = useState({ gross: 0, orderCount: 0, avg: 0, orders: [] });

  // Bootstrap
  useEffect(() => {
    initDB();
    reload();
    setReady(true);
  }, []);

  const reload = () => {
    setStaff(getAll('staff'));
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    setMenu(getAll('menu'));
    setOrders(getAll('orders'));
    setDeliveryOrders(getAll('delivery_orders'));
    setSettings(getSettings());
    setTodayStats(getTodayStats());
  };

  // ── Staff ────────────────────────────────────────────────
  const addStaff = useCallback((data) => {
    const item = insert('staff', data);
    setStaff(getAll('staff'));
    return item;
  }, []);

  const editStaff = useCallback((id, data) => {
    const item = update('staff', id, data);
    setStaff(getAll('staff'));
    return item;
  }, []);

  const deleteStaff = useCallback((id) => {
    remove('staff', id);
    setStaff(getAll('staff'));
  }, []);

  const toggleStaffStatus = useCallback((id) => {
    const member = getAll('staff').find(s => s.id === id);
    if (!member) return;
    const newStatus = member.status === 'active' ? 'off-duty' : 'active';
    update('staff', id, { status: newStatus });
    setStaff(getAll('staff'));
  }, []);

  const checkInOut = useCallback((staffId, type) => {
    logAttendance(staffId, type);
  }, []);

  const getStaffAttendance = useCallback((staffId) => {
    return getAttendanceForStaff(staffId);
  }, []);

  // ── Inventory ────────────────────────────────────────────
  const addInventoryItem = useCallback((data) => {
    // Check if item with same name exists → top up
    const existing = getAll('inventory').find(i => i.name.toLowerCase() === data.name.toLowerCase());
    if (existing) {
      const newStock = existing.stock + parseFloat(data.stock);
      update('inventory', existing.id, {
        stock: newStock,
        status: computeStockStatus(newStock, existing.min),
        lastUpdated: new Date().toISOString(),
      });
    } else {
      const stock = parseFloat(data.stock);
      const min = parseFloat(data.min) || 5;
      insert('inventory', { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    }
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const editInventoryItem = useCallback((id, data) => {
    const stock = parseFloat(data.stock);
    const min = parseFloat(data.min);
    update('inventory', id, { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const orderMoreInventory = useCallback((id) => {
    const item = getAll('inventory').find(i => i.id === id);
    if (!item) return;
    const newStock = item.stock + item.min * 2;
    update('inventory', id, { stock: newStock, status: 'good', lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const deleteInventoryItem = useCallback((id) => {
    remove('inventory', id);
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  // ── Menu ─────────────────────────────────────────────────
  const addMenuItem = useCallback((data) => {
    const item = insert('menu', { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
    return item;
  }, []);

  const editMenuItem = useCallback((id, data) => {
    const item = update('menu', id, { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
    return item;
  }, []);

  const deleteMenuItem = useCallback((id) => {
    remove('menu', id);
    setMenu(getAll('menu'));
  }, []);

  const toggleMenuItemAvailability = useCallback((id) => {
    const item = getAll('menu').find(i => i.id === id);
    if (!item) return;
    update('menu', id, { active: !item.active });
    setMenu(getAll('menu'));
  }, []);

  // ── Orders ────────────────────────────────────────────────
  const placeOrder = useCallback((tableId, items, paymentMethod) => {
    const order = createOrder(tableId, items, paymentMethod);
    setOrders(getAll('orders'));
    setTodayStats(getTodayStats());
    return order;
  }, []);

  // ── Delivery ──────────────────────────────────────────────
  const addDelivery = useCallback((order) => {
    const item = addDeliveryOrder(order);
    setDeliveryOrders(getAll('delivery_orders'));
    return item;
  }, []);

  const advanceDeliveryStatus = useCallback((id) => {
    const FLOW = { new: 'preparing', preparing: 'ready', ready: 'delivered' };
    const order = getAll('delivery_orders').find(o => o.id === id);
    if (!order || !FLOW[order.status]) return;
    updateDeliveryStatus(id, FLOW[order.status]);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const rejectDelivery = useCallback((id) => {
    remove('delivery_orders', id);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const simulateNewDelivery = useCallback(() => {
    const platforms = ['Zomato', 'Swiggy'];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const pfx = platform === 'Zomato' ? 'ZOM' : 'SWG';
    addDelivery({
      externalId: `${pfx}-${Math.floor(Math.random() * 9000) + 1000}`,
      platform,
      status: 'new',
      items: Math.floor(Math.random() * 4) + 1,
      total: Math.floor(Math.random() * 800) + 200,
      customer: ['Amit B.', 'Rahul K.', 'Sneha M.', 'Priya S.', 'Vikram D.'][Math.floor(Math.random() * 5)],
    });
  }, []);

  // ── Settings ──────────────────────────────────────────────
  const updateSettingsSection = useCallback((section, data) => {
    const updated = dbUpdateSettings(section, data);
    setSettings(updated);
    return updated;
  }, []);

  const value = {
    ready,
    // Data
    staff, inventory, menu, orders, deliveryOrders, settings, todayStats,
    // Staff
    addStaff, editStaff, deleteStaff, toggleStaffStatus, checkInOut, getStaffAttendance,
    // Inventory
    addInventoryItem, editInventoryItem, orderMoreInventory, deleteInventoryItem,
    // Menu
    addMenuItem, editMenuItem, deleteMenuItem, toggleMenuItemAvailability,
    // Orders / POS
    placeOrder,
    // Delivery
    addDelivery, advanceDeliveryStatus, rejectDelivery, simulateNewDelivery,
    // Settings
    updateSettingsSection,
    // Utility
    reload,
  };

  if (!ready) return null;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
