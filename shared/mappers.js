/**
 * Shared camelCase <-> snake_case mappers and table payload sanitizers.
 * Used by the browser data layer and the serverless API. No env access.
 */

// JSONB columns whose contents must be passed through untouched
const RAW_KEYS_CAMEL = ['items', 'modifierGroups', 'allergens', 'dietaryLabels', 'priceTiers', 'timestamps', 'courseFiring'];
const RAW_KEYS_SNAKE = ['items', 'modifier_groups', 'allergens', 'dietary_labels', 'price_tiers', 'timestamps', 'course_firing'];

export function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snake = {};
  for (const [key, value] of Object.entries(obj)) {
    let sKey = key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/_([0-9])/, "_$1");
    if (key === 'sold86') sKey = 'sold_86';
    if (!RAW_KEYS_CAMEL.includes(key)) {
      snake[sKey] = (typeof value === 'object' && value !== null) ? toSnakeCase(value) : value;
    } else {
      snake[sKey] = value;
    }
  }
  return snake;
}

export function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camel = {};
  for (const [key, value] of Object.entries(obj)) {
    let cKey = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    if (key === 'sold_86') cKey = 'sold86';
    if (!RAW_KEYS_SNAKE.includes(key)) {
      camel[cKey] = (typeof value === 'object' && value !== null) ? toCamelCase(value) : value;
    } else {
      camel[cKey] = value;
    }
  }
  return camel;
}

// Column allowlists for the relational tables (camelCase, pre-snake conversion)
export const INSERT_COLUMNS = {
  users: ['id', 'accountId', 'name', 'email', 'password', 'role', 'avatar', 'phone', 'createdAt'],
  menu: ['id', 'accountId', 'name', 'price', 'category', 'subcategory', 'reportingGroup', 'type', 'active', 'description', 'preparationTime', 'station', 'modifierGroups', 'taxGroup', 'calories', 'allergens', 'dietaryLabels', 'costPrice', 'sold86', 'priceTiers', 'image', 'ingredients', 'createdAt'],
  inventory: ['id', 'accountId', 'name', 'category', 'stock', 'unit', 'min', 'cost', 'supplier', 'lastUpdated'],
  orders: ['id', 'accountId', 'billNo', 'tableId', 'items', 'subtotal', 'tax', 'taxRate', 'serviceCharge', 'autoGratuity', 'discount', 'comp', 'tip', 'total', 'paymentMethod', 'orderType', 'guestId', 'guestName', 'serverId', 'serverName', 'partySize', 'status', 'voidReason', 'compReason', 'discountReason', 'courseFiring', 'timestamps', 'createdAt'],
};

export const UPDATE_COLUMNS = {
  users: ['name', 'email', 'password', 'role', 'avatar', 'phone'],
  menu: INSERT_COLUMNS.menu.filter(c => !['id', 'accountId', 'createdAt'].includes(c)),
  inventory: INSERT_COLUMNS.inventory.filter(c => !['id', 'accountId'].includes(c)),
  orders: INSERT_COLUMNS.orders.filter(c => !['id', 'accountId', 'createdAt'].includes(c)),
};

export function sanitizeInsertPayload(table, data) {
  const allowed = INSERT_COLUMNS[table];
  if (!allowed) return toSnakeCase(data);
  const filtered = {};
  for (const key of allowed) {
    if (data[key] !== undefined) filtered[key] = data[key];
  }
  return toSnakeCase(filtered);
}

export function sanitizeUpdatePayload(table, data) {
  const allowed = UPDATE_COLUMNS[table];
  if (!allowed) return toSnakeCase(data);
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.includes(key)) filtered[key] = value;
  }
  return toSnakeCase(filtered);
}
