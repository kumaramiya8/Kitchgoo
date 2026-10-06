import { describe, it, expect } from 'vitest';

// Aggregation logic mirroring Reports.jsx TaxComplianceTab
function computeTaxComplianceData(orders, settings = {}, taxTypeFilter = 'All') {
  const valid = [];
  const voided = [];
  let voidedTax = 0;

  (orders || []).forEach(o => {
    const s = (o.status || '').toLowerCase();
    const p = (o.paymentMethod || '').toLowerCase();
    if (s === 'voided' || s === 'cancelled' || p === 'voided') {
      voided.push(o);
      voidedTax += parseFloat(o.tax || 0);
    } else {
      valid.push(o);
    }
  });

  const defaultGst = parseFloat(settings?.billing?.gstRate ?? 5) || 5;
  const globalPricesIncludeGst = settings?.billing?.pricesIncludeGst !== false;

  const slabs = {
    'Food Tax': {
      key: 'Food Tax',
      name: `${defaultGst}% Restaurant Food GST`,
      rate: defaultGst,
      type: 'GST',
      taxable: 0,
      cgst: 0,
      sgst: 0,
      vat: 0,
      collected: 0,
      ordersCount: 0,
    },
    'Takeout GST': {
      key: 'Takeout GST',
      name: `${defaultGst}% Takeout & Delivery GST`,
      rate: defaultGst,
      type: 'GST',
      taxable: 0,
      cgst: 0,
      sgst: 0,
      vat: 0,
      collected: 0,
      ordersCount: 0,
    },
    'Beverage Tax': {
      key: 'Beverage Tax',
      name: '12% Beverage GST',
      rate: 12,
      type: 'GST',
      taxable: 0,
      cgst: 0,
      sgst: 0,
      vat: 0,
      collected: 0,
      ordersCount: 0,
    },
    'Alcohol Tax': {
      key: 'Alcohol Tax',
      name: '18% Liquor / Alcohol VAT',
      rate: 18,
      type: 'VAT',
      taxable: 0,
      cgst: 0,
      sgst: 0,
      vat: 0,
      collected: 0,
      ordersCount: 0,
    },
  };

  const slabOrderSets = {
    'Food Tax': new Set(),
    'Takeout GST': new Set(),
    'Beverage Tax': new Set(),
    'Alcohol Tax': new Set(),
  };

  valid.forEach(o => {
    const isTakeout = !o.tableId || (o.orderType || '').toLowerCase() === 'takeout' || (o.orderType || '').toLowerCase() === 'delivery';
    const orderPricesIncludeGst = o.pricesIncludeGst !== undefined ? o.pricesIncludeGst : globalPricesIncludeGst;
    const orderItems = o.items || [];
    const orderDiscount = parseFloat(o.discount || o.discountAmount || 0);

    if (orderItems.length === 0) {
      const orderTax = parseFloat(o.tax || 0);
      const orderSubtotal = parseFloat(o.subtotal || 0) || (orderPricesIncludeGst ? (parseFloat(o.total || 0) - orderTax) : parseFloat(o.total || 0));
      const targetSlab = isTakeout ? 'Takeout GST' : 'Food Tax';
      slabs[targetSlab].taxable += orderSubtotal;
      slabs[targetSlab].collected += orderTax;
      slabs[targetSlab].cgst += orderTax / 2;
      slabs[targetSlab].sgst += orderTax / 2;
      slabOrderSets[targetSlab].add(o.id || o.billNo);
      return;
    }

    const rawItemsSum = orderItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1), 0);
    const discountRatio = (rawItemsSum > 0 && orderDiscount > 0) ? Math.max(0, 1 - (orderDiscount / rawItemsSum)) : 1;

    orderItems.forEach(item => {
      const cat = (item.category || '').toLowerCase();
      const tg = (item.taxGroup || '').toLowerCase();
      const isAlcohol = tg === 'alcohol' || cat.includes('alcohol') || cat.includes('bar') || cat.includes('liquor') || cat.includes('beer') || cat.includes('wine');
      const isBev = cat.includes('beverage') || cat.includes('juice') || cat.includes('coffee') || cat.includes('tea') || cat.includes('shake');

      let slabKey;
      if (isAlcohol) slabKey = 'Alcohol Tax';
      else if (isTakeout) slabKey = 'Takeout GST';
      else if (isBev) slabKey = 'Beverage Tax';
      else slabKey = 'Food Tax';

      const rate = slabs[slabKey].rate;
      const grossRevenue = (parseFloat(item.price) || 0) * (parseFloat(item.qty || item.quantity) || 1);
      const netRevenue = grossRevenue * discountRatio;

      if (!item.taxExempt) {
        let taxable = 0;
        let taxCollected = 0;

        if (orderPricesIncludeGst) {
          taxCollected = rate > 0 ? netRevenue - (netRevenue / (1 + rate / 100)) : 0;
          taxable = netRevenue - taxCollected;
        } else {
          taxable = netRevenue;
          taxCollected = taxable * (rate / 100);
        }

        slabs[slabKey].taxable += taxable;
        slabs[slabKey].collected += taxCollected;

        if (slabs[slabKey].type === 'GST') {
          slabs[slabKey].cgst += taxCollected / 2;
          slabs[slabKey].sgst += taxCollected / 2;
        } else {
          slabs[slabKey].vat += taxCollected;
        }

        slabOrderSets[slabKey].add(o.id || o.billNo);
      }
    });
  });

  Object.keys(slabs).forEach(k => {
    slabs[k].ordersCount = slabOrderSets[k].size;
  });

  let result = Object.values(slabs);
  if (taxTypeFilter !== 'All') {
    result = result.filter(r => r.type === taxTypeFilter);
  }

  const totals = result.reduce((s, r) => ({
    taxable: s.taxable + (r.taxable || 0),
    cgst: s.cgst + (r.cgst || 0),
    sgst: s.sgst + (r.sgst || 0),
    vat: s.vat + (r.vat || 0),
    collected: s.collected + (r.collected || 0),
    totalValue: s.totalValue + ((r.taxable || 0) + (r.collected || 0)),
  }), { taxable: 0, cgst: 0, sgst: 0, vat: 0, collected: 0, totalValue: 0 });

  return {
    validOrders: valid,
    voidedOrders: voided,
    voidedTaxAmount: voidedTax,
    slabs: result,
    totals,
  };
}

describe('Tax & Compliance Report Calculations', () => {
  const sampleSettings = {
    billing: {
      gstRate: 5,
      pricesIncludeGst: true,
    },
    restaurant: {
      gstin: '29AABCT1332L1ZY',
      fssai: '10012345678901',
      name: 'Spice Garden',
    },
  };

  it('never returns undefined or crashes on empty orders', () => {
    const res = computeTaxComplianceData([], sampleSettings);
    expect(Array.isArray(res.slabs)).toBe(true);
    expect(res.slabs.length).toBe(4);
    expect(res.totals.taxable).toBe(0);
    expect(res.totals.collected).toBe(0);
    expect(res.totals.cgst).toBe(0);
    expect(res.totals.sgst).toBe(0);
    expect(res.totals.vat).toBe(0);
  });

  it('excludes voided and cancelled orders from tax liability', () => {
    const orders = [
      {
        id: 'ord_1',
        billNo: 'INV-101',
        status: 'paid',
        paymentMethod: 'Cash',
        tableId: 1,
        items: [{ name: 'Paneer Butter Masala', price: 200, qty: 1, category: 'Main Course' }],
        tax: 9.52,
        total: 200,
      },
      {
        id: 'ord_2',
        billNo: 'INV-102',
        status: 'voided',
        paymentMethod: 'Cash',
        tableId: 2,
        items: [{ name: 'Butter Naan', price: 100, qty: 2, category: 'Breads' }],
        tax: 9.52,
        total: 200,
      },
      {
        id: 'ord_3',
        billNo: 'INV-103',
        status: 'paid',
        paymentMethod: 'voided',
        tableId: 3,
        items: [{ name: 'Biryani', price: 300, qty: 1, category: 'Rice' }],
        tax: 14.29,
        total: 300,
      },
    ];

    const res = computeTaxComplianceData(orders, sampleSettings);
    expect(res.validOrders.length).toBe(1);
    expect(res.voidedOrders.length).toBe(2);
    expect(Math.round(res.totals.taxable + res.totals.collected)).toBe(200);
  });

  it('correctly splits GST into equal 50% CGST and 50% SGST', () => {
    const orders = [
      {
        id: 'ord_1',
        billNo: 'INV-101',
        status: 'paid',
        paymentMethod: 'UPI',
        tableId: 1,
        items: [{ name: 'Dal Makhani', price: 210, qty: 1, category: 'Main' }],
      },
    ];

    const res = computeTaxComplianceData(orders, sampleSettings);
    const foodSlab = res.slabs.find(s => s.key === 'Food Tax');
    expect(foodSlab).toBeDefined();
    expect(foodSlab.type).toBe('GST');
    expect(foodSlab.cgst).toBeGreaterThan(0);
    expect(foodSlab.sgst).toBe(foodSlab.cgst);
    expect(Math.round((foodSlab.cgst + foodSlab.sgst) * 100) / 100).toBe(Math.round(foodSlab.collected * 100) / 100);
  });

  it('categorizes alcoholic beverages into State VAT (18%) with zero CGST/SGST', () => {
    const orders = [
      {
        id: 'ord_bar',
        billNo: 'INV-201',
        status: 'paid',
        paymentMethod: 'Card',
        tableId: 5,
        items: [{ name: 'Craft Beer', price: 500, qty: 1, category: 'Bar Beer' }],
      },
    ];

    const res = computeTaxComplianceData(orders, sampleSettings);
    const alcoholSlab = res.slabs.find(s => s.key === 'Alcohol Tax');
    expect(alcoholSlab).toBeDefined();
    expect(alcoholSlab.type).toBe('VAT');
    expect(alcoholSlab.rate).toBe(18);
    expect(alcoholSlab.vat).toBeGreaterThan(0);
    expect(alcoholSlab.cgst).toBe(0);
    expect(alcoholSlab.sgst).toBe(0);
  });

  it('correctly reduces taxable turnover when invoice discount is applied', () => {
    const ordersWithDisc = [
      {
        id: 'ord_disc',
        billNo: 'INV-301',
        status: 'paid',
        paymentMethod: 'Cash',
        tableId: 1,
        discount: 50,
        items: [{ name: 'Family Combo', price: 500, qty: 1, category: 'Specials' }],
      },
    ];

    const res = computeTaxComplianceData(ordersWithDisc, sampleSettings);
    // 500 - 50 discount = 450 net invoice revenue
    expect(Math.round(res.totals.totalValue)).toBe(450);
  });

  it('filters slabs by taxTypeFilter (GST vs VAT)', () => {
    const orders = [
      {
        id: 'ord_mix',
        billNo: 'INV-401',
        status: 'paid',
        tableId: 1,
        items: [
          { name: 'Pizza', price: 300, qty: 1, category: 'Food' },
          { name: 'Red Wine', price: 600, qty: 1, category: 'Bar Wine' },
        ],
      },
    ];

    const gstOnly = computeTaxComplianceData(orders, sampleSettings, 'GST');
    expect(gstOnly.slabs.every(s => s.type === 'GST')).toBe(true);

    const vatOnly = computeTaxComplianceData(orders, sampleSettings, 'VAT');
    expect(vatOnly.slabs.every(s => s.type === 'VAT')).toBe(true);
  });
});
