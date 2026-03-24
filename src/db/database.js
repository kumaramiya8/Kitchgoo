/**
 * Kitchgoo - Database Layer
 * Uses localStorage for client-side persistence.
 * Each collection is stored under a namespaced key.
 */

const NS = 'kitchgoo_';

// ─── Helpers ──────────────────────────────────────────────
const read = (key) => {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const write = (key, value) => {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch { return false; }
};

const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Seed Data ────────────────────────────────────────────
const SEEDS = {
  settings: {
    restaurant: {
      name: 'Kitchgoo',
      tagline: 'A Fine Dining Experience',
      address: '12, MG Road, Bengaluru, Karnataka 560001',
      phone: '+91 80 1234 5678',
      email: 'hello@kitchgoo.in',
      gstin: '29AABCT1332L1ZY',
      fssai: '10012345678901',
      currency: '₹',
      timezone: 'Asia/Kolkata',
    },
    billing: {
      gstRate: 5,
      serviceCharge: 0,
      enableServiceCharge: false,
      roundingMode: 'nearest', // 'none' | 'nearest' | 'up'
      billPrefix: 'INV',
      billStartNumber: 1001,
      receiptHeader: 'Thank you for visiting Kitchgoo!',
      receiptFooter: 'For feedback: feedback@kitchgoo.in',
      showGstBreakdown: true,
    },
    payments: {
      cash: true,
      upi: true,
      card: true,
      wallet: false,
      onlineGateway: false,
      upiId: 'kitchgoo@upi',
    },
    delivery: {
      zomatoEnabled: false,
      zomatoApiKey: '',
      zomatoResId: '',
      swiggyEnabled: false,
      swiggyApiKey: '',
      swiggyResId: '',
      dunzoEnabled: false,
      packagingCharge: 20,
    },
    operations: {
      tables: 20,
      openingTime: '09:00',
      closingTime: '23:00',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      autoKOT: false,
      offlineMode: true,
      lowStockThreshold: 5,
    },
    notifications: {
      lowStock: true,
      newDeliveryOrder: true,
      orderReady: true,
      dailySummary: false,
      emailAlerts: false,
      alertEmail: '',
    },
    printer: {
      kotPrinter: 'Default',
      billPrinter: 'Default',
      autoPrintKOT: false,
      autoPrintBill: false,
      paperSize: '80mm',
      copies: 1,
    },
    appearance: {
      theme: 'light',
      accentColor: '#7c3aed',
      compactMode: false,
      language: 'en',
    },
    roles: [
      { id: 'owner', name: 'Owner', permissions: ['all'] },
      { id: 'manager', name: 'Manager', permissions: ['pos', 'inventory', 'staff', 'reports', 'menu', 'delivery'] },
      { id: 'cashier', name: 'Cashier', permissions: ['pos', 'delivery'] },
      { id: 'chef', name: 'Chef', permissions: ['inventory', 'menu'] },
      { id: 'waiter', name: 'Waiter', permissions: ['pos'] },
    ],
  },

  staff: [
    { id: genId(), name: 'Anil Kumar', role: 'Manager', phone: '+91 98765 43210', status: 'active', shift: 'Morning', salary: 25000, joinDate: '2023-01-15' },
    { id: genId(), name: 'Priya Sharma', role: 'Cashier', phone: '+91 98765 43211', status: 'active', shift: 'Evening', salary: 18000, joinDate: '2023-03-01' },
    { id: genId(), name: 'Rahul Verma', role: 'Chef', phone: '+91 98765 43212', status: 'off-duty', shift: 'Morning', salary: 22000, joinDate: '2022-11-10' },
    { id: genId(), name: 'Sneha Gupta', role: 'Waiter', phone: '+91 98765 43213', status: 'active', shift: 'Evening', salary: 14000, joinDate: '2023-06-20' },
  ],

  inventory: [
    { id: genId(), name: 'Tomatoes', category: 'Vegetables', stock: 15, unit: 'kg', min: 10, cost: 30, supplier: 'Raj Suppliers', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Onions', category: 'Vegetables', stock: 8, unit: 'kg', min: 15, cost: 25, supplier: 'Raj Suppliers', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Basmati Rice', category: 'Grains', stock: 50, unit: 'kg', min: 20, cost: 80, supplier: 'Grain House', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Chicken Breast', category: 'Meat', stock: 5, unit: 'kg', min: 10, cost: 250, supplier: 'Fresh Meats Co.', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Paneer', category: 'Dairy', stock: 2, unit: 'kg', min: 5, cost: 180, supplier: 'Dairy Fresh', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Milk', category: 'Dairy', stock: 12, unit: 'L', min: 10, cost: 55, supplier: 'Dairy Fresh', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Cooking Oil', category: 'Pantry', stock: 25, unit: 'L', min: 15, cost: 120, supplier: 'Pantry Plus', lastUpdated: new Date().toISOString() },
    { id: genId(), name: 'Salt', category: 'Pantry', stock: 10, unit: 'kg', min: 5, cost: 20, supplier: 'Pantry Plus', lastUpdated: new Date().toISOString() },
  ],

  menu: [
    { id: genId(), name: 'Paneer Tikka', price: 250, category: 'Starters', type: 'Veg', active: true, description: 'Grilled paneer with spices', preparationTime: 15 },
    { id: genId(), name: 'Chicken Wings', price: 300, category: 'Starters', type: 'Non-Veg', active: true, description: 'Crispy spiced wings', preparationTime: 20 },
    { id: genId(), name: 'Butter Chicken', price: 450, category: 'Main Course', type: 'Non-Veg', active: true, description: 'Classic creamy tomato gravy', preparationTime: 25 },
    { id: genId(), name: 'Garlic Naan', price: 60, category: 'Main Course', type: 'Veg', active: true, description: 'Tandoor-baked naan with garlic', preparationTime: 10 },
    { id: genId(), name: 'Dal Makhani', price: 350, category: 'Main Course', type: 'Veg', active: false, description: 'Slow-cooked black lentils', preparationTime: 30 },
    { id: genId(), name: 'Gulab Jamun', price: 120, category: 'Desserts', type: 'Veg', active: true, description: '2 pcs with rabdi', preparationTime: 5 },
    { id: genId(), name: 'Cold Coffee', price: 150, category: 'Beverages', type: 'Veg', active: true, description: 'Blended iced coffee', preparationTime: 7 },
    { id: genId(), name: 'Veg Biryani', price: 280, category: 'Main Course', type: 'Veg', active: true, description: 'Fragrant basmati with vegetables', preparationTime: 30 },
  ],

  orders: [],
  delivery_orders: [],
  attendance: [],
  users: [],
  guests: [
    { id: genId(), name: 'Arjun Mehta', phone: '+91 98101 23456', email: 'arjun@email.com', notes: 'Prefers window seat', visitCount: 8, totalSpend: 6200 },
    { id: genId(), name: 'Sunita Rao', phone: '+91 97200 34567', email: 'sunita@email.com', notes: 'Vegetarian only', visitCount: 5, totalSpend: 3800 },
    { id: genId(), name: 'Karan Malhotra', phone: '+91 99300 45678', email: '', notes: '', visitCount: 2, totalSpend: 1400 },
    { id: genId(), name: 'Priya Kapoor', phone: '+91 96400 56789', email: 'priya.k@email.com', notes: 'Birthday on Feb 14', visitCount: 12, totalSpend: 10500 },
  ],
};

// ─── Init ─────────────────────────────────────────────────
export function initDB() {
  const collections = ['settings', 'staff', 'inventory', 'menu', 'orders', 'delivery_orders', 'attendance', 'users', 'guests'];
  collections.forEach(col => {
    if (read(col) === null) {
      write(col, SEEDS[col]);
    }
  });
  // Increment bill counter
  if (read('bill_counter') === null) write('bill_counter', 1001);
}

// ─── Generic Collection CRUD ───────────────────────────────
export function getAll(collection) {
  return read(collection) || [];
}

export function getById(collection, id) {
  const items = getAll(collection);
  return items.find(i => i.id === id) || null;
}

export function insert(collection, data) {
  const items = getAll(collection);
  const newItem = { id: genId(), createdAt: new Date().toISOString(), ...data };
  write(collection, [...items, newItem]);
  return newItem;
}

export function update(collection, id, data) {
  const items = getAll(collection);
  const updated = items.map(i => i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i);
  write(collection, updated);
  return updated.find(i => i.id === id);
}

export function remove(collection, id) {
  const items = getAll(collection).filter(i => i.id !== id);
  write(collection, items);
}

// ─── Settings ─────────────────────────────────────────────
export function getSettings() {
  const s = read('settings') || SEEDS.settings;
  // Self-healing: if roles got corrupted to a non-array (object spread bug), reset to seed
  if (!Array.isArray(s.roles)) {
    const fixed = { ...s, roles: SEEDS.settings.roles };
    write('settings', fixed);
    return fixed;
  }
  return s;
}


export function updateSettings(section, data) {
  const settings = getSettings();
  // For array values (like 'roles'), store directly — don't spread
  const newSectionValue = Array.isArray(data)
    ? data
    : { ...settings[section], ...data };
  const updated = { ...settings, [section]: newSectionValue };
  write('settings', updated);
  return updated;
}


// ─── Orders ───────────────────────────────────────────────
export function createOrder(tableId, items, paymentMethod) {
  const counter = read('bill_counter') || 1001;
  const settings = getSettings();
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * (settings.billing.gstRate / 100);
  const serviceCharge = settings.billing.enableServiceCharge
    ? subtotal * (settings.billing.serviceCharge / 100) : 0;
  const total = subtotal + tax + serviceCharge;

  const order = {
    id: genId(),
    billNo: `${settings.billing.billPrefix}-${counter}`,
    tableId,
    items,
    subtotal,
    tax,
    taxRate: settings.billing.gstRate,
    serviceCharge,
    total,
    paymentMethod,
    status: 'paid',
    createdAt: new Date().toISOString(),
  };

  const orders = getAll('orders');
  write('orders', [...orders, order]);
  write('bill_counter', counter + 1);
  return order;
}

export function getOrdersByDate(dateStr) {
  const orders = getAll('orders');
  return orders.filter(o => o.createdAt.startsWith(dateStr));
}

export function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = getOrdersByDate(today);
  const gross = todayOrders.reduce((s, o) => s + o.total, 0);
  const orderCount = todayOrders.length;
  const avg = orderCount > 0 ? gross / orderCount : 0;
  return { gross, orderCount, avg, orders: todayOrders };
}

// ─── Inventory Helpers ────────────────────────────────────
export function computeStockStatus(stock, min) {
  if (stock <= 0) return 'critical';
  if (stock < min * 0.5) return 'critical';
  if (stock < min) return 'low';
  return 'good';
}

export function receiveStock(id, quantity) {
  const item = getById('inventory', id);
  if (!item) return null;
  const newStock = item.stock + quantity;
  return update('inventory', id, {
    stock: newStock,
    status: computeStockStatus(newStock, item.min),
    lastUpdated: new Date().toISOString(),
  });
}

// ─── Attendance ───────────────────────────────────────────
export function logAttendance(staffId, type) {
  return insert('attendance', {
    staffId,
    type, // 'IN' | 'OUT'
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
  });
}

export function getAttendanceForStaff(staffId) {
  return getAll('attendance').filter(a => a.staffId === staffId);
}

// ─── Delivery Orders ──────────────────────────────────────
export function addDeliveryOrder(order) {
  return insert('delivery_orders', { ...order, status: order.status || 'new' });
}

export function updateDeliveryStatus(id, status) {
  return update('delivery_orders', id, { status });
}

export { genId };
