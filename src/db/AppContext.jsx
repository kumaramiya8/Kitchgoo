/**
 * AppContext — Global React state backed by the database layer.
 * All pages can access and mutate shared data from here.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getAll,
  getSettings,
  insert,
  update,
  remove,
  setCollection,
  computeStockStatus,
  logAttendance,
  getAttendanceForStaff,
  createOrder,
  getTodayStats,
  updateSettings as dbUpdateSettings,
  addDeliveryOrder,
  updateDeliveryStatus,
  createKDSTicket,
  bumpKDSItem,
  bumpKDSTicket,
  recallKDSTicket,
  createReservation,
  addToWaitlist,
  logAudit,
  logWaste,
  depleteInventoryForOrder,
  updateCashDrawer,
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
  const [kdsTickets, setKdsTickets] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [wasteLog, setWasteLog] = useState([]);
  const [locations, setLocations] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [floorPlans, setFloorPlans] = useState({ tables: [], sections: [] });
  const [modifiers, setModifiers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [tipPools, setTipPools] = useState([]);
  const [loyalty, setLoyalty] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  const [guests, setGuests] = useState([]);
  const [cashDrawer, setCashDrawer] = useState({});

  useEffect(() => {
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
    setKdsTickets(getAll('kds_tickets'));
    setReservations(getAll('reservations'));
    setWaitlist(getAll('waitlist'));
    setOnlineOrders(getAll('online_orders'));
    setSuppliers(getAll('suppliers'));
    setPurchaseOrders(getAll('purchase_orders'));
    setRecipes(getAll('recipes'));
    setWasteLog(getAll('waste_log'));
    setLocations(getAll('locations'));
    setAuditLog(getAll('audit_log'));
    const fp = getAll('floor_plans');
    setFloorPlans(fp && fp.tables ? fp : { tables: [], sections: [] });
    setModifiers(getAll('modifiers'));
    setSchedules(getAll('schedules'));
    setTipPools(getAll('tip_pools'));
    setLoyalty(getAll('loyalty') || {});
    setCampaigns(getAll('campaigns'));
    setGuests(getAll('guests'));
    setCashDrawer(getAll('cash_drawer') || {});
  };

  // ── Staff ────────────────────────────────────────────────
  const addStaff = useCallback(async (data) => {
    await insert('staff', data);
    setStaff(getAll('staff'));
  }, []);

  const editStaff = useCallback(async (id, data) => {
    await update('staff', id, data);
    setStaff(getAll('staff'));
  }, []);

  const deleteStaff = useCallback(async (id) => {
    await remove('staff', id);
    setStaff(getAll('staff'));
  }, []);

  const toggleStaffStatus = useCallback(async (id) => {
    const member = getAll('staff').find(s => s.id === id);
    if (!member) return;
    await update('staff', id, { status: member.status === 'active' ? 'off-duty' : 'active' });
    setStaff(getAll('staff'));
  }, []);

  const checkInOut = useCallback(async (staffId, type) => {
    await logAttendance(staffId, type);
  }, []);

  const getStaffAttendance = useCallback((staffId) => {
    return getAttendanceForStaff(staffId);
  }, []);

  // ── Inventory ────────────────────────────────────────────
  const addInventoryItem = useCallback(async (data) => {
    const existing = getAll('inventory').find(i => i.name.toLowerCase() === data.name.toLowerCase());
    if (existing) {
      const newStock = existing.stock + parseFloat(data.stock);
      await update('inventory', existing.id, {
        stock: newStock, status: computeStockStatus(newStock, existing.min),
        lastUpdated: new Date().toISOString(),
      });
    } else {
      const stock = parseFloat(data.stock);
      const min = parseFloat(data.min) || 5;
      await insert('inventory', { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    }
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const editInventoryItem = useCallback(async (id, data) => {
    const stock = parseFloat(data.stock);
    const min = parseFloat(data.min);
    await update('inventory', id, { ...data, stock, min, status: computeStockStatus(stock, min), lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const orderMoreInventory = useCallback(async (id) => {
    const item = getAll('inventory').find(i => i.id === id);
    if (!item) return;
    const newStock = item.stock + item.min * 2;
    await update('inventory', id, { stock: newStock, status: 'good', lastUpdated: new Date().toISOString() });
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  const deleteInventoryItem = useCallback(async (id) => {
    await remove('inventory', id);
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
  }, []);

  // ── Menu ─────────────────────────────────────────────────
  const addMenuItem = useCallback(async (data) => {
    await insert('menu', { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
  }, []);

  const editMenuItem = useCallback(async (id, data) => {
    await update('menu', id, { ...data, price: parseFloat(data.price) });
    setMenu(getAll('menu'));
  }, []);

  const deleteMenuItem = useCallback(async (id) => {
    await remove('menu', id);
    setMenu(getAll('menu'));
  }, []);

  const toggleMenuItemAvailability = useCallback(async (id) => {
    const item = getAll('menu').find(i => i.id === id);
    if (!item) return;
    await update('menu', id, { active: !item.active });
    setMenu(getAll('menu'));
  }, []);

  const toggle86 = useCallback(async (id) => {
    const item = getAll('menu').find(i => i.id === id);
    if (!item) return;
    await update('menu', id, { sold86: !item.sold86, active: item.sold86 ? true : false });
    setMenu(getAll('menu'));
  }, []);

  // ── Orders / POS ────────────────────────────────────────
  const placeOrder = useCallback(async (tableId, items, paymentMethod, extra = {}) => {
    const order = await createOrder(tableId, items, paymentMethod, extra);
    await depleteInventoryForOrder(items);
    setOrders(getAll('orders'));
    setTodayStats(getTodayStats());
    setInventory(getAll('inventory').map(i => ({ ...i, status: computeStockStatus(i.stock, i.min) })));
    return order;
  }, []);

  // ── Delivery ──────────────────────────────────────────────
  const addDelivery = useCallback(async (order) => {
    await addDeliveryOrder(order);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const advanceDeliveryStatus = useCallback(async (id) => {
    const FLOW = { new: 'preparing', preparing: 'ready', ready: 'out-for-delivery', 'out-for-delivery': 'delivered' };
    const order = getAll('delivery_orders').find(o => o.id === id);
    if (!order || !FLOW[order.status]) return;
    await updateDeliveryStatus(id, FLOW[order.status]);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const rejectDelivery = useCallback(async (id) => {
    await remove('delivery_orders', id);
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  const simulateNewDelivery = useCallback(async () => {
    const platforms = ['Zomato', 'Swiggy', 'UberEats', 'DoorDash'];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const pfx = { Zomato: 'ZOM', Swiggy: 'SWG', UberEats: 'UBE', DoorDash: 'DD' }[platform];
    await addDeliveryOrder({
      externalId: `${pfx}-${Math.floor(Math.random() * 9000) + 1000}`,
      platform,
      status: 'new',
      items: Math.floor(Math.random() * 4) + 1,
      total: Math.floor(Math.random() * 800) + 200,
      customer: ['Amit B.', 'Rahul K.', 'Sneha M.', 'Priya S.', 'Vikram D.'][Math.floor(Math.random() * 5)],
      address: '123 Main St, Bengaluru',
      phone: '+91 98765 00000',
      driverInstructions: '',
      assignedDriver: null,
    });
    setDeliveryOrders(getAll('delivery_orders'));
  }, []);

  // ── KDS ─────────────────────────────────────────────────
  const fireToKDS = useCallback(async (orderId, items, tableId, orderType) => {
    await createKDSTicket(orderId, items, tableId, orderType);
    setKdsTickets(getAll('kds_tickets'));
  }, []);

  const bumpKDSItemAction = useCallback(async (ticketId, itemIndex) => {
    await bumpKDSItem(ticketId, itemIndex);
    setKdsTickets(getAll('kds_tickets'));
  }, []);

  const bumpKDSTicketAction = useCallback(async (ticketId) => {
    await bumpKDSTicket(ticketId);
    setKdsTickets(getAll('kds_tickets'));
  }, []);

  const recallKDSTicketAction = useCallback(async (ticketId) => {
    await recallKDSTicket(ticketId);
    setKdsTickets(getAll('kds_tickets'));
  }, []);

  // ── Reservations & Waitlist ─────────────────────────────
  const addReservation = useCallback(async (data) => {
    await createReservation(data);
    setReservations(getAll('reservations'));
  }, []);

  const editReservation = useCallback(async (id, data) => {
    await update('reservations', id, data);
    setReservations(getAll('reservations'));
  }, []);

  const cancelReservation = useCallback(async (id) => {
    await update('reservations', id, { status: 'cancelled' });
    setReservations(getAll('reservations'));
  }, []);

  const addWaitlistEntry = useCallback(async (data) => {
    await addToWaitlist(data);
    setWaitlist(getAll('waitlist'));
  }, []);

  const notifyWaitlist = useCallback(async (id) => {
    await update('waitlist', id, { status: 'notified', notifiedAt: new Date().toISOString() });
    setWaitlist(getAll('waitlist'));
  }, []);

  const seatWaitlist = useCallback(async (id) => {
    await update('waitlist', id, { status: 'seated' });
    setWaitlist(getAll('waitlist'));
  }, []);

  const removeWaitlist = useCallback(async (id) => {
    await remove('waitlist', id);
    setWaitlist(getAll('waitlist'));
  }, []);

  // ── Suppliers ──────────────────────────────────────────
  const addSupplier = useCallback(async (data) => {
    await insert('suppliers', data);
    setSuppliers(getAll('suppliers'));
  }, []);

  const editSupplier = useCallback(async (id, data) => {
    await update('suppliers', id, data);
    setSuppliers(getAll('suppliers'));
  }, []);

  const deleteSupplier = useCallback(async (id) => {
    await remove('suppliers', id);
    setSuppliers(getAll('suppliers'));
  }, []);

  // ── Purchase Orders ────────────────────────────────────
  const addPurchaseOrder = useCallback(async (data) => {
    await insert('purchase_orders', { ...data, status: 'draft' });
    setPurchaseOrders(getAll('purchase_orders'));
  }, []);

  const editPurchaseOrder = useCallback(async (id, data) => {
    await update('purchase_orders', id, data);
    setPurchaseOrders(getAll('purchase_orders'));
  }, []);

  // ── Recipes ────────────────────────────────────────────
  const addRecipe = useCallback(async (data) => {
    await insert('recipes', data);
    setRecipes(getAll('recipes'));
  }, []);

  const editRecipe = useCallback(async (id, data) => {
    await update('recipes', id, data);
    setRecipes(getAll('recipes'));
  }, []);

  const deleteRecipe = useCallback(async (id) => {
    await remove('recipes', id);
    setRecipes(getAll('recipes'));
  }, []);

  // ── Waste ──────────────────────────────────────────────
  const addWasteEntry = useCallback(async (data) => {
    await logWaste(data);
    setWasteLog(getAll('waste_log'));
  }, []);

  // ── Locations ──────────────────────────────────────────
  const addLocation = useCallback(async (data) => {
    await insert('locations', data);
    setLocations(getAll('locations'));
  }, []);

  const editLocation = useCallback(async (id, data) => {
    await update('locations', id, data);
    setLocations(getAll('locations'));
  }, []);

  // ── Modifiers ──────────────────────────────────────────
  const addModifier = useCallback(async (data) => {
    await insert('modifiers', data);
    setModifiers(getAll('modifiers'));
  }, []);

  const editModifier = useCallback(async (id, data) => {
    await update('modifiers', id, data);
    setModifiers(getAll('modifiers'));
  }, []);

  const deleteModifier = useCallback(async (id) => {
    await remove('modifiers', id);
    setModifiers(getAll('modifiers'));
  }, []);

  // ── Floor Plans ────────────────────────────────────────
  const updateFloorPlans = useCallback(async (data) => {
    await setCollection('floor_plans', data);
    setFloorPlans(data);
  }, []);

  // ── Schedules ──────────────────────────────────────────
  const addSchedule = useCallback(async (data) => {
    await insert('schedules', data);
    setSchedules(getAll('schedules'));
  }, []);

  const editSchedule = useCallback(async (id, data) => {
    await update('schedules', id, data);
    setSchedules(getAll('schedules'));
  }, []);

  const deleteSchedule = useCallback(async (id) => {
    await remove('schedules', id);
    setSchedules(getAll('schedules'));
  }, []);

  // ── Campaigns ──────────────────────────────────────────
  const addCampaign = useCallback(async (data) => {
    await insert('campaigns', data);
    setCampaigns(getAll('campaigns'));
  }, []);

  const editCampaign = useCallback(async (id, data) => {
    await update('campaigns', id, data);
    setCampaigns(getAll('campaigns'));
  }, []);

  const deleteCampaign = useCallback(async (id) => {
    await remove('campaigns', id);
    setCampaigns(getAll('campaigns'));
  }, []);

  // ── Loyalty ────────────────────────────────────────────
  const updateLoyalty = useCallback(async (data) => {
    await setCollection('loyalty', data);
    setLoyalty(data);
  }, []);

  // ── Guests ─────────────────────────────────────────────
  const addGuest = useCallback(async (data) => {
    await insert('guests', data);
    setGuests(getAll('guests'));
  }, []);

  const editGuest = useCallback(async (id, data) => {
    await update('guests', id, data);
    setGuests(getAll('guests'));
  }, []);

  const deleteGuest = useCallback(async (id) => {
    await remove('guests', id);
    setGuests(getAll('guests'));
  }, []);

  // ── Cash Drawer ────────────────────────────────────────
  const updateCashDrawerAction = useCallback(async (data) => {
    const updated = await updateCashDrawer(data);
    setCashDrawer(updated);
  }, []);

  // ── Audit ──────────────────────────────────────────────
  const addAuditEntry = useCallback(async (action, userId, userName, details) => {
    await logAudit(action, userId, userName, details);
    setAuditLog(getAll('audit_log'));
  }, []);

  // ── Online Orders ──────────────────────────────────────
  const addOnlineOrder = useCallback(async (data) => {
    await insert('online_orders', data);
    setOnlineOrders(getAll('online_orders'));
  }, []);

  const editOnlineOrder = useCallback(async (id, data) => {
    await update('online_orders', id, data);
    setOnlineOrders(getAll('online_orders'));
  }, []);

  // ── Settings ──────────────────────────────────────────────
  const updateSettingsSection = useCallback(async (section, data) => {
    const updated = await dbUpdateSettings(section, data);
    setSettings(updated);
    return updated;
  }, []);

  // ── Tip Pools ─────────────────────────────────────────
  const updateTipPools = useCallback(async (data) => {
    await setCollection('tip_pools', data);
    setTipPools(data);
  }, []);

  const value = {
    ready,
    // Data
    staff, inventory, menu, orders, deliveryOrders, settings, todayStats,
    kdsTickets, reservations, waitlist, onlineOrders, suppliers, purchaseOrders,
    recipes, wasteLog, locations, auditLog, floorPlans, modifiers, schedules,
    tipPools, loyalty, campaigns, guests, cashDrawer,
    // Staff
    addStaff, editStaff, deleteStaff, toggleStaffStatus, checkInOut, getStaffAttendance,
    // Inventory
    addInventoryItem, editInventoryItem, orderMoreInventory, deleteInventoryItem,
    // Menu
    addMenuItem, editMenuItem, deleteMenuItem, toggleMenuItemAvailability, toggle86,
    // Orders / POS
    placeOrder,
    // Delivery
    addDelivery, advanceDeliveryStatus, rejectDelivery, simulateNewDelivery,
    // KDS
    fireToKDS, bumpKDSItemAction, bumpKDSTicketAction, recallKDSTicketAction,
    // Reservations & Waitlist
    addReservation, editReservation, cancelReservation,
    addWaitlistEntry, notifyWaitlist, seatWaitlist, removeWaitlist,
    // Suppliers
    addSupplier, editSupplier, deleteSupplier,
    // Purchase Orders
    addPurchaseOrder, editPurchaseOrder,
    // Recipes
    addRecipe, editRecipe, deleteRecipe,
    // Waste
    addWasteEntry,
    // Locations
    addLocation, editLocation,
    // Modifiers
    addModifier, editModifier, deleteModifier,
    // Floor Plans
    updateFloorPlans,
    // Schedules
    addSchedule, editSchedule, deleteSchedule,
    // Campaigns
    addCampaign, editCampaign, deleteCampaign,
    // Loyalty
    updateLoyalty,
    // Guests
    addGuest, editGuest, deleteGuest,
    // Cash Drawer
    updateCashDrawer: updateCashDrawerAction,
    // Audit
    addAuditEntry,
    // Online Orders
    addOnlineOrder, editOnlineOrder,
    // Settings
    updateSettingsSection,
    // Tip Pools
    updateTipPools,
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
