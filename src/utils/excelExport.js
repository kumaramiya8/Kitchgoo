/**
 * Kitchgoo — Multi-sheet Excel (.xls) Daily Operations Exporter
 *
 * Uses Microsoft XML Spreadsheet 2003 specification to generate real, styled,
 * multi-tab workbooks natively viewable in Excel, Apple Numbers, Google Sheets,
 * and LibreOffice without adding external npm dependencies.
 */

import { localDayStr } from '../../shared/dates';

/**
 * Escape XML special characters.
 */
export function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format currency or number values safely.
 */
function num(val) {
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/**
 * Format integer values safely.
 */
function int(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Format time string from ISO.
 */
function formatTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleTimeString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(isoStr);
  }
}

/**
 * Build cell XML tag.
 */
function cell(type, val, styleId = null) {
  const styleAttr = styleId ? ` ss:StyleID="${styleId}"` : '';
  if (type === 'Number') {
    return `<Cell${styleAttr}><Data ss:Type="Number">${num(val)}</Data></Cell>`;
  }
  if (type === 'Integer') {
    return `<Cell${styleAttr}><Data ss:Type="Number">${int(val)}</Data></Cell>`;
  }
  return `<Cell${styleAttr}><Data ss:Type="String">${escapeXml(val)}</Data></Cell>`;
}

/**
 * Build empty cell.
 */
function emptyCell(styleId = null) {
  return styleId ? `<Cell ss:StyleID="${styleId}"/>` : '<Cell/>';
}

/**
 * Build XML Row.
 */
function row(cells) {
  return `<Row>${cells.join('')}</Row>`;
}

/**
 * Filter data by target local calendar day.
 */
export function filterByDate(list = [], dateField = 'createdAt', targetDateStr) {
  if (!Array.isArray(list) || !targetDateStr) return [];
  return list.filter(item => {
    const raw = item?.[dateField] || item?.timestamp || item?.date || item?.closedAt || item?.sentAt;
    return localDayStr(raw) === targetDateStr;
  });
}

/**
 * Generate full daily operational report XML workbook.
 */
export function generateDailyOperationsWorkbook({
  dateStr,
  orders = [],
  cashDrawer = {},
  registerClosures = [],
  kdsTickets = [],
  attendance = [],
  auditLog = [],
  wasteLog = [],
  purchaseOrders = [],
  expenses = [],
  settings = {},
}) {
  const restaurant = settings?.restaurant || {};
  const billing = settings?.billing || {};
  const targetDay = dateStr || localDayStr(new Date());

  // Filter collections strictly to target day
  const dayOrders = filterByDate(orders, 'createdAt', targetDay);
  const dayClosures = filterByDate(registerClosures, 'closedAt', targetDay);
  const dayTickets = filterByDate(kdsTickets, 'createdAt', targetDay);
  const dayAttendance = filterByDate(attendance, 'timestamp', targetDay);
  const dayAudit = filterByDate(auditLog, 'timestamp', targetDay);
  const dayWaste = filterByDate(wasteLog, 'date', targetDay);
  const dayPurchases = filterByDate(purchaseOrders, 'date', targetDay);
  const dayExpenses = filterByDate(expenses, 'date', targetDay);

  // ─── 1. AGGREGATE FINANCIALS ──────────────────────────────
  let grossSales = 0;
  let totalDiscounts = 0;
  let netTaxableSales = 0;
  let totalGst = 0;
  let totalServiceCharge = 0;
  let totalAutoGratuity = 0;
  let totalTips = 0;
  let grandTotal = 0;

  const paymentModes = {
    cash: 0,
    upi: 0,
    card: 0,
    other: 0,
  };

  const orderTypes = {
    dineIn: 0,
    takeout: 0,
    delivery: 0,
  };

  // Item sales tracking: name -> { category, qty, unitPrice, revenue }
  const itemMap = {};

  for (const o of dayOrders) {
    const sub = num(o.subtotal);
    const disc = num(o.discount);
    const tax = num(o.tax);
    const sc = num(o.serviceCharge);
    const ag = num(o.autoGratuity);
    const tip = num(o.tip);
    const tot = num(o.total || o.grandTotal);

    grossSales += sub;
    totalDiscounts += disc;
    netTaxableSales += Math.max(0, sub - disc);
    totalGst += tax;
    totalServiceCharge += sc;
    totalAutoGratuity += ag;
    totalTips += tip;
    grandTotal += tot;

    // Payment methods
    const method = String(o.paymentMethod || 'cash').toLowerCase();
    if (method.includes('cash')) paymentModes.cash += tot;
    else if (method.includes('upi')) paymentModes.upi += tot;
    else if (method.includes('card')) paymentModes.card += tot;
    else paymentModes.other += tot;

    // Order types
    const ot = String(o.orderType || '').toLowerCase();
    if (ot.includes('takeout') || ot.includes('takeaway')) orderTypes.takeout++;
    else if (ot.includes('delivery')) orderTypes.delivery++;
    else orderTypes.dineIn++;

    // Items
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        const name = it.name || 'Unnamed Item';
        const qty = int(it.quantity || it.qty || 1);
        const price = num(it.price);
        const rev = qty * price;
        const cat = it.category || 'General';

        if (!itemMap[name]) {
          itemMap[name] = { name, category: cat, quantity: 0, unitPrice: price, revenue: 0 };
        }
        itemMap[name].quantity += qty;
        itemMap[name].revenue += rev;
      }
    }
  }

  const itemsList = Object.values(itemMap).sort((a, b) => b.quantity - a.quantity);
  const totalItemsSold = itemsList.reduce((acc, i) => acc + i.quantity, 0);

  // Split GST evenly into CGST and SGST
  const cgst = Math.round((totalGst / 2) * 100) / 100;
  const sgst = Math.round((totalGst - cgst) * 100) / 100;

  // ─── 2. CASH DRAWER & EXPENSES AGGREGATION ────────────────
  const drawerOpening = num(cashDrawer?.openingBalance || 0);
  const drawerCashIn = num(cashDrawer?.cashIn || paymentModes.cash);
  const drawerCashOut = num(cashDrawer?.cashOut || 0); // Paid-outs / petty expenses
  const drawerDropsList = Array.isArray(cashDrawer?.drops) ? cashDrawer.drops : [];
  const drawerDropsTotal = drawerDropsList.reduce((acc, d) => acc + num(d.amount), 0);
  const expectedDrawerBalance = drawerOpening + drawerCashIn - drawerCashOut - drawerDropsTotal;
  const currentDrawerBalance = num(cashDrawer?.currentBalance ?? expectedDrawerBalance);

  // Waste, purchase & overhead totals
  const totalWasteCost = dayWaste.reduce((acc, w) => acc + num(w.cost), 0);
  const totalPurchaseCost = dayPurchases.reduce((acc, p) => acc + num(p.totalAmount || p.total || 0), 0);
  const totalOverheadCost = dayExpenses.reduce((acc, e) => acc + num(e.amount || 0), 0);
  const totalDailyExpenses = drawerCashOut + totalWasteCost + totalPurchaseCost + totalOverheadCost;

  // ─── XML STYLES ──────────────────────────────────────────
  const xmlHeader = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Kitchgoo POS</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#111827"/>
  </Style>
  <Style ss:ID="MainTitle">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E5E4A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SubBanner">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#27785F" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SectionHeader">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="12" ss:Bold="1" ss:Color="#1E5E4A"/>
   <Interior ss:Color="#E8F5E9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7D7C5"/>
   </Borders>
  </Style>
  <Style ss:ID="ColHeader">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E5E4A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0E3C2F"/>
   </Borders>
  </Style>
  <Style ss:ID="ColHeaderLeft">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E5E4A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Currency">
   <NumberFormat ss:Format="₹#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="CurrencyBold">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#1E5E4A"/>
   <NumberFormat ss:Format="₹#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Integer">
   <NumberFormat ss:Format="#,##0"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="IntegerCenter">
   <NumberFormat ss:Format="#,##0"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Center">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="BoldLabel">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#374151"/>
  </Style>
  <Style ss:ID="TotalRowLabel">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9CA3AF"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="2" ss:Color="#111827"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowCurrency">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#1E5E4A"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="₹#,##0.00"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9CA3AF"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="2" ss:Color="#111827"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalRowInteger">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
   <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#9CA3AF"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="2" ss:Color="#111827"/>
   </Borders>
  </Style>
  <Style ss:ID="Muted">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Color="#6B7280"/>
  </Style>
  <Style ss:ID="BadgeGreen">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#166534"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="BadgeYellow">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#854D0E"/>
   <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="BadgeRed">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
 </Styles>`;

  // ─── TAB 1: DAILY SUMMARY ─────────────────────────────────
  const summaryRows = [
    // Report Title & Meta
    row([cell('String', `${restaurant.name || 'Kitchgoo'} — Daily Operational & Financial Report`, 'MainTitle'), emptyCell('MainTitle'), emptyCell('MainTitle'), emptyCell('MainTitle')]),
    row([cell('String', `Date: ${targetDay}  |  GSTIN: ${restaurant.gstin || 'N/A'}  |  FSSAI: ${restaurant.fssai || 'N/A'}  |  Exported: ${new Date().toLocaleString('en-IN')}`, 'SubBanner'), emptyCell('SubBanner'), emptyCell('SubBanner'), emptyCell('SubBanner')]),
    row([]),

    // 1. Executive Revenue Summary
    row([cell('String', '1. EXECUTIVE REVENUE & TAX BREAKDOWN', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Metric', 'ColHeaderLeft'), cell('String', 'Description', 'ColHeaderLeft'), cell('String', 'Amount (INR)', 'ColHeader'), emptyCell()]),
    row([cell('String', 'Gross Sales (Item Totals)', 'BoldLabel'), cell('String', 'Total sum of bill items before discounts', 'Muted'), cell('Number', grossSales, 'Currency'), emptyCell()]),
    row([cell('String', 'Total Discounts & Comps', 'BoldLabel'), cell('String', 'Promotions, manager comps, and bill discounts applied', 'Muted'), cell('Number', totalDiscounts, 'Currency'), emptyCell()]),
    row([cell('String', 'Net Taxable Sales', 'BoldLabel'), cell('String', 'Taxable revenue (Gross - Discounts)', 'Muted'), cell('Number', netTaxableSales, 'CurrencyBold'), emptyCell()]),
    row([cell('String', `CGST (${(billing.gstRate || 5) / 2}%)`, 'BoldLabel'), cell('String', 'Central Goods & Services Tax', 'Muted'), cell('Number', cgst, 'Currency'), emptyCell()]),
    row([cell('String', `SGST (${(billing.gstRate || 5) / 2}%)`, 'BoldLabel'), cell('String', 'State Goods & Services Tax', 'Muted'), cell('Number', sgst, 'Currency'), emptyCell()]),
    row([cell('String', `Total GST Collected (${billing.gstRate || 5}%)`, 'BoldLabel'), cell('String', 'Combined tax collected on orders', 'Muted'), cell('Number', totalGst, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Service Charge Collected', 'BoldLabel'), cell('String', 'Optional restaurant service charge', 'Muted'), cell('Number', totalServiceCharge, 'Currency'), emptyCell()]),
    row([cell('String', 'Auto-Gratuity Collected', 'BoldLabel'), cell('String', 'Automatic gratuity on large parties', 'Muted'), cell('Number', totalAutoGratuity, 'Currency'), emptyCell()]),
    row([cell('String', 'Tips Collected for Staff', 'BoldLabel'), cell('String', 'Guest gratuities paid directly to service staff', 'Muted'), cell('Number', totalTips, 'Currency'), emptyCell()]),
    row([cell('String', 'GRAND TOTAL INVOICED REVENUE', 'TotalRowLabel'), cell('String', 'Total settlement collected across all payment channels', 'TotalRowLabel'), cell('Number', grandTotal, 'TotalRowCurrency'), emptyCell()]),
    row([]),

    // 2. Payment Tender Breakdown
    row([cell('String', '2. PAYMENT TENDER RECONCILIATION', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Tender Method', 'ColHeaderLeft'), cell('String', 'Volume Description', 'ColHeaderLeft'), cell('String', 'Total Collected', 'ColHeader'), emptyCell()]),
    row([cell('String', 'Cash Settlements', 'BoldLabel'), cell('String', 'Physical cash received at counter/tables', 'Muted'), cell('Number', paymentModes.cash, 'Currency'), emptyCell()]),
    row([cell('String', 'UPI / QR Payments', 'BoldLabel'), cell('String', 'Google Pay, PhonePe, Paytm, BHIM UPI transfers', 'Muted'), cell('Number', paymentModes.upi, 'Currency'), emptyCell()]),
    row([cell('String', 'Card Settlements', 'BoldLabel'), cell('String', 'Debit and credit card POS machines', 'Muted'), cell('Number', paymentModes.card, 'Currency'), emptyCell()]),
    row([cell('String', 'Other / Digital Wallets', 'BoldLabel'), cell('String', 'Apple Pay, vouchers, external aggregator settlements', 'Muted'), cell('Number', paymentModes.other, 'Currency'), emptyCell()]),
    row([cell('String', 'TOTAL SETTLEMENTS RECEIVED', 'TotalRowLabel'), cell('String', 'Reconciled total tenders', 'TotalRowLabel'), cell('Number', grandTotal, 'TotalRowCurrency'), emptyCell()]),
    row([]),

    // 3. Cash Drawer & Petty Expenses
    row([cell('String', '3. CASH DRAWER, EXPENSES & VARIANCE', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Drawer Activity', 'ColHeaderLeft'), cell('String', 'Operation Details', 'ColHeaderLeft'), cell('String', 'Amount (INR)', 'ColHeader'), emptyCell()]),
    row([cell('String', 'Opening Cash Float', 'BoldLabel'), cell('String', 'Cash in register at shift start', 'Muted'), cell('Number', drawerOpening, 'Currency'), emptyCell()]),
    row([cell('String', 'Cash Sales Inflow (+)', 'BoldLabel'), cell('String', 'Total cash collected on bills today', 'Muted'), cell('Number', drawerCashIn, 'Currency'), emptyCell()]),
    row([cell('String', 'Paid-Outs / Petty Cash Expenses (-)', 'BoldLabel'), cell('String', 'Cash drawn from drawer for daily kitchen/petty expenses', 'Muted'), cell('Number', drawerCashOut, 'Currency'), emptyCell()]),
    row([cell('String', 'Cash Drops to Safe/Bank (-)', 'BoldLabel'), cell('String', 'Excess cash moved from drawer to manager safe', 'Muted'), cell('Number', drawerDropsTotal, 'Currency'), emptyCell()]),
    row([cell('String', 'Expected Cash in Drawer', 'BoldLabel'), cell('String', 'Opening + Cash In - Paid Outs - Drops', 'Muted'), cell('Number', expectedDrawerBalance, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Current / Counted Cash in Drawer', 'BoldLabel'), cell('String', 'Physically counted balance or current system balance', 'Muted'), cell('Number', currentDrawerBalance, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Cash Discrepancy (Over / Short)', 'BoldLabel'), cell('String', 'Counted Cash - Expected Cash', 'Muted'), cell('Number', currentDrawerBalance - expectedDrawerBalance, (currentDrawerBalance - expectedDrawerBalance === 0) ? 'CurrencyBold' : 'Currency'), emptyCell()]),
    row([cell('String', 'Drawer Shift Status', 'BoldLabel'), cell('String', cashDrawer?.isClosed ? 'Closed for the day' : 'Active / Shift in progress', 'Muted'), cell('String', cashDrawer?.isClosed ? 'CLOSED' : 'OPEN', cashDrawer?.isClosed ? 'BadgeGreen' : 'BadgeYellow'), emptyCell()]),
    row([]),

    // 4. Operational & Kitchen Throughput
    row([cell('String', '4. OPERATIONAL VOLUME & ORDER CHANNELS', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Metric', 'ColHeaderLeft'), cell('String', 'Description', 'ColHeaderLeft'), cell('String', 'Count / Value', 'ColHeader'), emptyCell()]),
    row([cell('String', 'Total Orders / Invoices', 'BoldLabel'), cell('String', 'Completed customer transactions today', 'Muted'), cell('Integer', dayOrders.length, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Dine-In Orders', 'BoldLabel'), cell('String', 'Table service orders', 'Muted'), cell('Integer', orderTypes.dineIn, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Takeaway Orders', 'BoldLabel'), cell('String', 'Pick-up / counter orders', 'Muted'), cell('Integer', orderTypes.takeout, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Delivery Orders', 'BoldLabel'), cell('String', 'Direct or aggregator delivery orders', 'Muted'), cell('Integer', orderTypes.delivery, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Total Menu Items Sold', 'BoldLabel'), cell('String', 'Total food and drink portions served', 'Muted'), cell('Integer', totalItemsSold, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Average Order Value (AOV)', 'BoldLabel'), cell('String', 'Grand total revenue divided by total orders', 'Muted'), cell('Number', dayOrders.length > 0 ? (grandTotal / dayOrders.length) : 0, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Kitchen (KDS) Tickets Fired', 'BoldLabel'), cell('String', 'Kitchen tickets sent to cook stations', 'Muted'), cell('Integer', dayTickets.length, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Staff Clock-In / Shift Events', 'BoldLabel'), cell('String', 'Attendance punches recorded', 'Muted'), cell('Integer', dayAttendance.length, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'Security & Audit Events', 'BoldLabel'), cell('String', 'Manager voids, comps, and manual drawer kicks', 'Muted'), cell('Integer', dayAudit.length, 'IntegerCenter'), emptyCell()]),
    row([cell('String', 'General Operating Overheads', 'BoldLabel'), cell('String', 'Rent, utilities, packaging, marketing, maintenance', 'Muted'), cell('Number', totalOverheadCost, 'Currency'), emptyCell()]),
    row([cell('String', 'Total Operational Expenses', 'BoldLabel'), cell('String', 'Paid-outs + Waste + Purchases + Overheads', 'Muted'), cell('Number', totalDailyExpenses, 'CurrencyBold'), emptyCell()]),
  ];

  const sheet1Xml = ` <Worksheet ss:Name="Daily Summary">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="220"/>
   <Column ss:Width="300"/>
   <Column ss:Width="140"/>
   <Column ss:Width="40"/>
   ${summaryRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 2: SALES & INVOICES ──────────────────────────────
  const invoiceHeaders = [
    'Bill / Invoice #',
    'Time',
    'Order ID',
    'Type',
    'Table / Source',
    'Guest Name',
    'Server',
    'Payment Method',
    'Subtotal',
    'Discount',
    'GST',
    'Service Charge',
    'Auto-Gratuity',
    'Tip',
    'Grand Total',
    'Items Summary',
  ];

  const invoiceRows = [
    row(invoiceHeaders.map(h => cell('String', h, 'ColHeader'))),
  ];

  let subtotalSum = 0;
  let discountSum = 0;
  let gstSum = 0;
  let scSum = 0;
  let agSum = 0;
  let tipSum = 0;
  let totalSum = 0;

  for (const o of dayOrders) {
    const sub = num(o.subtotal);
    const disc = num(o.discount);
    const tax = num(o.tax);
    const sc = num(o.serviceCharge);
    const ag = num(o.autoGratuity);
    const tip = num(o.tip);
    const tot = num(o.total || o.grandTotal);

    subtotalSum += sub;
    discountSum += disc;
    gstSum += tax;
    scSum += sc;
    agSum += ag;
    tipSum += tip;
    totalSum += tot;

    const itemsSummary = Array.isArray(o.items)
      ? o.items.map(i => `${i.name} (x${i.quantity || i.qty || 1})`).join(', ')
      : '-';

    invoiceRows.push(row([
      cell('String', o.invoiceNumber || o.billNumber || o.id?.slice(-6) || 'INV-0000', 'BoldLabel'),
      cell('String', formatTime(o.createdAt), 'Center'),
      cell('String', o.id || '-', 'Muted'),
      cell('String', o.orderType || 'Dine-In', 'Center'),
      cell('String', o.tableName || o.tableId || 'Walk-in', 'Center'),
      cell('String', o.guestName || o.customerName || 'Walk-in Guest'),
      cell('String', o.serverName || o.cashierName || 'Staff'),
      cell('String', o.paymentMethod || 'Cash', 'Center'),
      cell('Number', sub, 'Currency'),
      cell('Number', disc, 'Currency'),
      cell('Number', tax, 'Currency'),
      cell('Number', sc, 'Currency'),
      cell('Number', ag, 'Currency'),
      cell('Number', tip, 'Currency'),
      cell('Number', tot, 'CurrencyBold'),
      cell('String', itemsSummary),
    ]));
  }

  // Add Summary Total Row
  if (dayOrders.length > 0) {
    invoiceRows.push(row([
      cell('String', 'TOTALS', 'TotalRowLabel'),
      cell('String', `${dayOrders.length} orders`, 'TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      cell('Number', subtotalSum, 'TotalRowCurrency'),
      cell('Number', discountSum, 'TotalRowCurrency'),
      cell('Number', gstSum, 'TotalRowCurrency'),
      cell('Number', scSum, 'TotalRowCurrency'),
      cell('Number', agSum, 'TotalRowCurrency'),
      cell('Number', tipSum, 'TotalRowCurrency'),
      cell('Number', totalSum, 'TotalRowCurrency'),
      emptyCell('TotalRowLabel'),
    ]));
  } else {
    invoiceRows.push(row([
      cell('String', 'No orders recorded for this date', 'Muted'),
    ]));
  }

  const sheet2Xml = ` <Worksheet ss:Name="Sales &amp; Invoices">
  <Table ss:DefaultColumnWidth="100" ss:DefaultRowHeight="20">
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="100"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="90"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="80"/>
   <Column ss:Width="110"/>
   <Column ss:Width="280"/>
   ${invoiceRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 3: ITEM SALES BREAKDOWN ──────────────────────────
  const itemHeaders = ['Item Name', 'Category', 'Quantity Sold', 'Unit Price', 'Total Revenue', '% of Sales'];
  const itemRows = [
    row(itemHeaders.map(h => cell('String', h, 'ColHeader'))),
  ];

  for (const item of itemsList) {
    const pct = totalSum > 0 ? Math.round((item.revenue / totalSum) * 1000) / 10 : 0;
    itemRows.push(row([
      cell('String', item.name, 'BoldLabel'),
      cell('String', item.category, 'Center'),
      cell('Integer', item.quantity, 'IntegerCenter'),
      cell('Number', item.unitPrice, 'Currency'),
      cell('Number', item.revenue, 'CurrencyBold'),
      cell('String', `${pct}%`, 'Center'),
    ]));
  }

  if (itemsList.length > 0) {
    itemRows.push(row([
      cell('String', 'TOTALS', 'TotalRowLabel'),
      cell('String', `${itemsList.length} unique items`, 'TotalRowLabel'),
      cell('Integer', totalItemsSold, 'TotalRowInteger'),
      emptyCell('TotalRowLabel'),
      cell('Number', grossSales, 'TotalRowCurrency'),
      cell('String', '100%', 'TotalRowLabel'),
    ]));
  } else {
    itemRows.push(row([
      cell('String', 'No item sales recorded for this date', 'Muted'),
    ]));
  }

  const sheet3Xml = ` <Worksheet ss:Name="Item Sales Breakdown">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="200"/>
   <Column ss:Width="140"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="130"/>
   <Column ss:Width="90"/>
   ${itemRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 4: CASH DRAWER & EXPENSES ────────────────────────
  const drawerRows = [
    row([cell('String', 'CASH DRAWER SHIFT RECONCILIATION', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Metric', 'ColHeaderLeft'), cell('String', 'Details', 'ColHeaderLeft'), cell('String', 'Amount (INR)', 'ColHeader'), emptyCell()]),
    row([cell('String', 'Shift Opening Float', 'BoldLabel'), cell('String', 'Starting cash in register', 'Muted'), cell('Number', drawerOpening, 'Currency'), emptyCell()]),
    row([cell('String', 'Cash Sales Inflows', 'BoldLabel'), cell('String', 'Cash payments on completed orders', 'Muted'), cell('Number', drawerCashIn, 'Currency'), emptyCell()]),
    row([cell('String', 'Paid-Outs / Petty Cash Drawn', 'BoldLabel'), cell('String', 'Cash taken from register for daily expenses', 'Muted'), cell('Number', drawerCashOut, 'Currency'), emptyCell()]),
    row([cell('String', 'Cash Drops to Safe/Bank', 'BoldLabel'), cell('String', 'Mid-shift transfers to safe', 'Muted'), cell('Number', drawerDropsTotal, 'Currency'), emptyCell()]),
    row([cell('String', 'Expected System Cash Balance', 'BoldLabel'), cell('String', 'Calculated register balance', 'Muted'), cell('Number', expectedDrawerBalance, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Counted / Current Balance', 'BoldLabel'), cell('String', 'Physical cash count', 'Muted'), cell('Number', currentDrawerBalance, 'CurrencyBold'), emptyCell()]),
    row([cell('String', 'Net Discrepancy (Over / Short)', 'TotalRowLabel'), cell('String', 'Difference between physical count and system calculation', 'TotalRowLabel'), cell('Number', currentDrawerBalance - expectedDrawerBalance, 'TotalRowCurrency'), emptyCell()]),
    row([]),

    // Cash Drops Table
    row([cell('String', 'CASH DROPS & TRANSFERS TO SAFE', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([cell('String', 'Timestamp', 'ColHeader'), cell('String', 'Cashier / Manager', 'ColHeaderLeft'), cell('String', 'Note / Reason', 'ColHeaderLeft'), cell('String', 'Amount (INR)', 'ColHeader')]),
  ];

  if (drawerDropsList.length > 0) {
    for (const d of drawerDropsList) {
      drawerRows.push(row([
        cell('String', formatTime(d.timestamp), 'Center'),
        cell('String', d.cashier || 'Manager'),
        cell('String', d.note || 'Cash Drop to Safe'),
        cell('Number', num(d.amount), 'Currency'),
      ]));
    }
    drawerRows.push(row([
      cell('String', 'Total Drops', 'TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      cell('Number', drawerDropsTotal, 'TotalRowCurrency'),
    ]));
  } else {
    drawerRows.push(row([cell('String', 'No mid-day drops recorded for this date', 'Muted'), emptyCell(), emptyCell(), emptyCell()]));
  }

  drawerRows.push(row([]));

  // Register Closures Table
  drawerRows.push(row([cell('String', 'OFFICIAL REGISTER CLOSURES (Z-REPORTS)', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]));
  drawerRows.push(row([
    cell('String', 'Closed At', 'ColHeader'),
    cell('String', 'Closed By', 'ColHeaderLeft'),
    cell('String', 'Expected Cash', 'ColHeader'),
    cell('String', 'Counted Cash', 'ColHeader'),
    cell('String', 'Discrepancy', 'ColHeader'),
    cell('String', 'Notes / Resolution', 'ColHeaderLeft'),
  ]));

  if (dayClosures.length > 0) {
    for (const c of dayClosures) {
      drawerRows.push(row([
        cell('String', formatTime(c.closedAt), 'Center'),
        cell('String', c.closedBy || 'Manager'),
        cell('Number', num(c.expectedBalance), 'Currency'),
        cell('Number', num(c.countedCash), 'CurrencyBold'),
        cell('Number', num(c.discrepancy), 'Currency'),
        cell('String', c.notes || 'End-of-day register closure'),
      ]));
    }
  } else {
    drawerRows.push(row([cell('String', 'No register closures saved for this date', 'Muted'), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()]));
  }

  const sheet4Xml = ` <Worksheet ss:Name="Cash Drawer &amp; Expenses">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="160"/>
   <Column ss:Width="200"/>
   <Column ss:Width="140"/>
   <Column ss:Width="140"/>
   <Column ss:Width="130"/>
   <Column ss:Width="240"/>
   ${drawerRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 5: WASTE & PURCHASES ─────────────────────────────
  const expRows = [
    row([cell('String', 'INVENTORY FOOD WASTE & SPOILAGE LOG', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]),
    row([
      cell('String', 'Time', 'ColHeader'),
      cell('String', 'Item Name', 'ColHeaderLeft'),
      cell('String', 'Quantity', 'ColHeader'),
      cell('String', 'Unit', 'ColHeader'),
      cell('String', 'Cost / Loss (INR)', 'ColHeader'),
      cell('String', 'Reason / Logged By', 'ColHeaderLeft'),
    ]),
  ];

  if (dayWaste.length > 0) {
    for (const w of dayWaste) {
      expRows.push(row([
        cell('String', formatTime(w.date || w.timestamp), 'Center'),
        cell('String', w.itemName || 'Inventory Item', 'BoldLabel'),
        cell('Number', num(w.quantity), 'Center'),
        cell('String', w.unit || 'units', 'Center'),
        cell('Number', num(w.cost), 'Currency'),
        cell('String', `${w.reason || 'Spoilage'} (Logged by: ${w.loggedBy || 'Staff'})`),
      ]));
    }
    expRows.push(row([
      cell('String', 'Total Waste Loss', 'TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      cell('Number', totalWasteCost, 'TotalRowCurrency'),
      emptyCell('TotalRowLabel'),
    ]));
  } else {
    expRows.push(row([cell('String', 'No food waste logged for this date', 'Muted'), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()]));
  }

  expRows.push(row([]));

  // Supplier Purchases Table
  expRows.push(row([cell('String', 'SUPPLIER PURCHASE ORDERS & PROCUREMENT', 'SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader'), emptyCell('SectionHeader')]));
  expRows.push(row([
    cell('String', 'PO Number', 'ColHeader'),
    cell('String', 'Supplier', 'ColHeaderLeft'),
    cell('String', 'Status', 'ColHeader'),
    cell('String', 'Items Procured', 'ColHeaderLeft'),
    cell('String', 'Total Amount (INR)', 'ColHeader'),
  ]));

  if (dayPurchases.length > 0) {
    for (const p of dayPurchases) {
      const itemsProcured = Array.isArray(p.items)
        ? p.items.map(i => `${i.name} (x${i.qty || i.quantity || 1})`).join(', ')
        : '-';
      expRows.push(row([
        cell('String', p.poNumber || p.orderNumber || p.id || 'PO-000', 'BoldLabel'),
        cell('String', p.supplierName || 'Vendor'),
        cell('String', p.status || 'Received', 'Center'),
        cell('String', itemsProcured),
        cell('Number', num(p.totalAmount || p.total || 0), 'CurrencyBold'),
      ]));
    }
    expRows.push(row([
      cell('String', 'Total Purchases', 'TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      emptyCell('TotalRowLabel'),
      cell('Number', totalPurchaseCost, 'TotalRowCurrency'),
    ]));
  } else {
    expRows.push(row([cell('String', 'No supplier purchase orders logged for this date', 'Muted'), emptyCell(), emptyCell(), emptyCell(), emptyCell()]));
  }

  const sheet5Xml = ` <Worksheet ss:Name="Waste &amp; Purchases">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="100"/>
   <Column ss:Width="180"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="130"/>
   <Column ss:Width="250"/>
   ${expRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 6: KITCHEN OPERATIONS (KDS) ─────────────────────
  const kdsHeaders = ['Ticket #', 'Order ID', 'Table / Channel', 'Order Type', 'Status', 'Sent Time', 'Bumped Time', 'Prep Duration', 'Ordered Items'];
  const kdsRows = [
    row(kdsHeaders.map(h => cell('String', h, 'ColHeader'))),
  ];

  if (dayTickets.length > 0) {
    for (const t of dayTickets) {
      const sent = t.createdAt || t.sentAt;
      const bumped = t.bumpedAt || t.completedAt;
      let durationStr = '-';
      if (sent && bumped) {
        const ms = new Date(bumped).getTime() - new Date(sent).getTime();
        const mins = Math.max(0, Math.round(ms / 60000));
        durationStr = `${mins} min`;
      }

      const itemsDesc = Array.isArray(t.items)
        ? t.items.map(i => `${i.name} (x${i.quantity || i.qty || 1})${i.notes ? ` [${i.notes}]` : ''}`).join(', ')
        : '-';

      kdsRows.push(row([
        cell('String', t.id?.slice(-6) || 'KDS-00', 'BoldLabel'),
        cell('String', t.orderId || '-', 'Muted'),
        cell('String', t.tableName || t.tableId || 'Table', 'Center'),
        cell('String', t.orderType || 'Dine-In', 'Center'),
        cell('String', t.status || 'completed', t.status === 'bumped' || t.status === 'completed' ? 'BadgeGreen' : 'BadgeYellow'),
        cell('String', formatTime(sent), 'Center'),
        cell('String', formatTime(bumped), 'Center'),
        cell('String', durationStr, 'Center'),
        cell('String', itemsDesc),
      ]));
    }
  } else {
    kdsRows.push(row([
      cell('String', 'No kitchen tickets recorded for this date', 'Muted'),
    ]));
  }

  const sheet6Xml = ` <Worksheet ss:Name="Kitchen Operations">
  <Table ss:DefaultColumnWidth="110" ss:DefaultRowHeight="20">
   <Column ss:Width="90"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="100"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="100"/>
   <Column ss:Width="300"/>
   ${kdsRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 7: STAFF ATTENDANCE ─────────────────────────────
  const attHeaders = ['Staff Name', 'Role', 'Punch Type', 'Timestamp', 'Verification Method', 'Device / Location / Notes'];
  const attRows = [
    row(attHeaders.map(h => cell('String', h, 'ColHeader'))),
  ];

  if (dayAttendance.length > 0) {
    for (const a of dayAttendance) {
      const isClockIn = String(a.type).toLowerCase().includes('in');
      attRows.push(row([
        cell('String', a.staffName || a.name || 'Staff Member', 'BoldLabel'),
        cell('String', a.role || 'Service', 'Center'),
        cell('String', isClockIn ? 'CLOCK-IN' : 'CLOCK-OUT', isClockIn ? 'BadgeGreen' : 'BadgeYellow'),
        cell('String', formatTime(a.timestamp), 'Center'),
        cell('String', a.method || a.verificationMethod || 'PIN / Manual', 'Center'),
        cell('String', a.notes || a.location || 'Terminal POS'),
      ]));
    }
  } else {
    attRows.push(row([
      cell('String', 'No staff attendance records logged for this date', 'Muted'),
    ]));
  }

  const sheet7Xml = ` <Worksheet ss:Name="Staff Attendance">
  <Table ss:DefaultColumnWidth="130" ss:DefaultRowHeight="20">
   <Column ss:Width="160"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="100"/>
   <Column ss:Width="140"/>
   <Column ss:Width="250"/>
   ${attRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── TAB 8: AUDIT LOG & VOIDS ────────────────────────────
  const auditHeaders = ['Time', 'Action Type', 'User Name', 'Role', 'Details / Override Reasons'];
  const auditRows = [
    row(auditHeaders.map(h => cell('String', h, 'ColHeader'))),
  ];

  if (dayAudit.length > 0) {
    for (const e of dayAudit) {
      const act = String(e.action || '').toUpperCase();
      let badgeStyle = 'Center';
      if (act.includes('VOID') || act.includes('DELETE')) badgeStyle = 'BadgeRed';
      else if (act.includes('COMP') || act.includes('DISCOUNT')) badgeStyle = 'BadgeYellow';
      else if (act.includes('DRAWER')) badgeStyle = 'BadgeGreen';

      auditRows.push(row([
        cell('String', formatTime(e.timestamp), 'Center'),
        cell('String', act || 'ACTION', badgeStyle),
        cell('String', e.userName || 'System', 'BoldLabel'),
        cell('String', e.role || 'Staff', 'Center'),
        cell('String', e.details || e.note || '-'),
      ]));
    }
  } else {
    auditRows.push(row([
      cell('String', 'No audit entries recorded for this date', 'Muted'),
    ]));
  }

  const sheet8Xml = ` <Worksheet ss:Name="Audit Log &amp; Voids">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="100"/>
   <Column ss:Width="130"/>
   <Column ss:Width="140"/>
   <Column ss:Width="100"/>
   <Column ss:Width="350"/>
   ${auditRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // ─── 9. EXPENSES & OVERHEADS WORKSHEET ─────────────────────
  const expenseRows = [
    row([cell('String', `${restaurant.name || 'Kitchgoo'} — Expenses & Overheads Log (${targetDay})`, 'HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle'), emptyCell('HeaderTitle')]),
    row([cell('String', `Generated: ${new Date().toISOString()} • Total Overhead Expenses: INR ${totalOverheadCost.toFixed(2)}`, 'Muted'), emptyCell('Muted'), emptyCell('Muted'), emptyCell('Muted'), emptyCell('Muted'), emptyCell('Muted'), emptyCell('Muted'), emptyCell('Muted')]),
    row([]),
    row([
      cell('String', 'Date', 'ColHeaderLeft'),
      cell('String', 'Description / Title', 'ColHeaderLeft'),
      cell('String', 'Category', 'ColHeaderLeft'),
      cell('String', 'Payee / Vendor', 'ColHeaderLeft'),
      cell('String', 'Payment Mode', 'ColHeaderLeft'),
      cell('String', 'Status', 'ColHeader'),
      cell('String', 'Invoice / Ref No', 'ColHeaderLeft'),
      cell('String', 'Amount (INR)', 'ColHeader'),
    ]),
  ];

  if (dayExpenses.length === 0) {
    expenseRows.push(
      row([cell('String', 'No general overhead expenses logged for this date.', 'Muted'), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()])
    );
  } else {
    dayExpenses.forEach(exp => {
      expenseRows.push(
        row([
          cell('String', exp.date || targetDay, 'DataLeft'),
          cell('String', exp.title || '', 'DataLeft'),
          cell('String', exp.category || '', 'DataLeft'),
          cell('String', exp.payee || '', 'DataLeft'),
          cell('String', exp.paymentMethod || 'Cash', 'DataLeft'),
          cell('String', (exp.status || 'paid').toUpperCase(), exp.status === 'paid' ? 'BadgeGreen' : 'BadgeYellow'),
          cell('String', exp.invoiceNumber || '', 'DataLeft'),
          cell('Number', num(exp.amount), 'Currency'),
        ])
      );
    });

    expenseRows.push(
      row([
        cell('String', 'TOTAL OVERHEAD EXPENSES', 'TotalLabel'),
        emptyCell('TotalLabel'),
        emptyCell('TotalLabel'),
        emptyCell('TotalLabel'),
        emptyCell('TotalLabel'),
        emptyCell('TotalLabel'),
        emptyCell('TotalLabel'),
        cell('Number', totalOverheadCost, 'TotalCurrency'),
      ])
    );
  }

  const sheet9Xml = ` <Worksheet ss:Name="Expenses &amp; Overheads">
  <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">
   <Column ss:Width="90"/>
   <Column ss:Width="220"/>
   <Column ss:Width="140"/>
   <Column ss:Width="150"/>
   <Column ss:Width="120"/>
   <Column ss:Width="90"/>
   <Column ss:Width="120"/>
   <Column ss:Width="130"/>
   ${expenseRows.join('\n   ')}
  </Table>
 </Worksheet>`;

  // Combine into complete Workbook
  return `${xmlHeader}
${sheet1Xml}
${sheet2Xml}
${sheet3Xml}
${sheet4Xml}
${sheet5Xml}
${sheet6Xml}
${sheet7Xml}
${sheet8Xml}
${sheet9Xml}
</Workbook>`;
}

/**
 * Trigger browser download of Excel workbook.
 */
export function downloadExcelWorkbook(filename, xmlContent) {
  if (typeof window === 'undefined' || !window.document) return;
  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.xls') ? filename : `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
