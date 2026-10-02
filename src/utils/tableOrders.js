/**
 * Kitchgoo — Table Orders & Billing Helper
 *
 * Computes line-item breakdown, taxes (GST inclusive or exclusive),
 * service charges, auto-gratuity, and grand totals for table orders.
 */

export function calculateTableBill({
  items = [],
  settings = {},
  partySize = 1,
  discountAmount = 0,
  orderType = 'dine-in',
}) {
  const billing = settings?.billing || {};
  const gstRate = parseFloat(billing.gstRate) || 0;
  const pricesIncludeGst = billing.pricesIncludeGst ?? true;
  const serviceChargeRate = billing.enableServiceCharge ? (parseFloat(billing.serviceCharge) || 0) : 0;
  const autoGratuityEnabled = billing.autoGratuityEnabled ?? false;
  const autoGratuityThreshold = parseInt(billing.autoGratuityThreshold, 10) || 6;
  const autoGratuityRate = parseFloat(billing.autoGratuityPercent) || 18;
  const autoGratuityPreTax = billing.autoGratuityPreTax ?? true;
  const roundingMode = billing.roundingMode || 'none';

  const subtotal = (items || []).reduce((s, i) => {
    const modPrice = (i.modifiers || []).reduce((ms, m) => ms + (Number(m.price) || 0), 0);
    return s + ((Number(i.price) || 0) + modPrice) * (Number(i.qty || i.quantity) || 1);
  }, 0);

  const tax = pricesIncludeGst
    ? (gstRate > 0 ? subtotal - (subtotal / (1 + gstRate / 100)) : 0)
    : subtotal * (gstRate / 100);

  const subtotalNet = pricesIncludeGst ? subtotal - tax : subtotal;

  const serviceCharge = (autoGratuityPreTax ? subtotalNet : subtotal) * (serviceChargeRate / 100);

  const party = partySize || 1;
  const autoGratuity = (autoGratuityEnabled && party >= autoGratuityThreshold)
    ? (autoGratuityPreTax ? subtotalNet : (pricesIncludeGst ? subtotal : subtotal + tax)) * (autoGratuityRate / 100)
    : 0;

  const packagingCharge = (orderType === 'takeout' || orderType === 'delivery')
    ? (parseFloat(settings?.delivery?.packagingCharge) || 0)
    : 0;

  const applyRounding = (val) => {
    if (roundingMode === 'nearest') return Math.round(val);
    if (roundingMode === 'up') return Math.ceil(val);
    return Math.round(val * 100) / 100;
  };

  const rawGrandTotal = pricesIncludeGst
    ? subtotal + serviceCharge + autoGratuity + packagingCharge - discountAmount
    : subtotal + tax + serviceCharge + autoGratuity + packagingCharge - discountAmount;

  const grandTotal = applyRounding(Math.max(0, rawGrandTotal));

  return {
    items,
    itemCount: (items || []).reduce((s, i) => s + (Number(i.qty || i.quantity) || 1), 0),
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    serviceCharge: Math.round(serviceCharge * 100) / 100,
    autoGratuity: Math.round(autoGratuity * 100) / 100,
    packagingCharge: Math.round(packagingCharge * 100) / 100,
    grandTotal,
    hasOrder: (items || []).length > 0,
  };
}
