/**
 * Order / KDS-ticket / saved-order line items used to be stored as a full
 * copy of the menu item — including its base64 `image` (hundreds of KB) and
 * other definitional fields. That bloated every order and ticket, so a sync
 * shipped megabytes. These helpers keep only what a stored line actually
 * needs; the heavy fields live on the menu row (and its image in Storage).
 */

// Fields never needed on a stored line item (a snapshot of what was ordered).
// `image` is the giant one; the rest are menu definitions, not order data.
export const HEAVY_ITEM_FIELDS = [
  'image', 'modifierGroups', 'priceTiers', 'ingredients', 'description', 'dietaryLabels',
];

export function stripItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  for (const f of HEAVY_ITEM_FIELDS) delete out[f];
  return out;
}

export function stripItems(items) {
  return Array.isArray(items) ? items.map(stripItem) : items;
}

// Strip items across a whole collection value (array of orders/tickets, or a
// { tableId: [items] } saved-orders map).
export function stripCollectionItems(name, value) {
  if (name === 'orders' || name === 'kds_tickets') {
    if (!Array.isArray(value)) return value;
    return value.map(row => (row && Array.isArray(row.items) ? { ...row, items: stripItems(row.items) } : row));
  }
  if (name === 'pos_saved_orders') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripItems(v);
    return out;
  }
  return value;
}
