/**
 * Kitchgoo - Print Receipt Utility
 * Generates a proper restaurant invoice and opens a print dialog.
 */

export function printReceipt({ order, settings, tableId, guestName }) {
  const restaurant = settings?.restaurant || {};
  const billing = settings?.billing || {};
  const payments = settings?.payments || {};
  const printer = settings?.printer || {};
  const receipt = settings?.receipt || {};

  const formatDate = (iso) => {
    const d = new Date(iso || Date.now());
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatTime = (iso) => {
    const d = new Date(iso || Date.now());
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const pricesIncludeGst = order.pricesIncludeGst !== undefined
    ? order.pricesIncludeGst
    : (billing.pricesIncludeGst !== false);
  const taxRate = order.taxRate ?? billing.gstRate ?? 5;
  const itemsTotal = (order.items || []).reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);

  const tax = order.tax !== undefined
    ? order.tax
    : (pricesIncludeGst
      ? (taxRate > 0 ? itemsTotal - (itemsTotal / (1 + taxRate / 100)) : 0)
      : itemsTotal * (taxRate / 100));

  const subtotal = order.subtotal !== undefined
    ? order.subtotal
    : (pricesIncludeGst ? itemsTotal - tax : itemsTotal);

  const cgst = tax / 2;
  const sgst = tax / 2;
  const serviceCharge = order.serviceCharge !== undefined
    ? order.serviceCharge
    : (billing.enableServiceCharge ? subtotal * ((billing.serviceCharge || 0) / 100) : 0);

  const discount = order.discount || 0;
  const autoGratuity = order.autoGratuity || 0;
  const tip = order.tip || 0;

  const total = order.total !== undefined
    ? order.total
    : (subtotal + tax + serviceCharge + autoGratuity - discount + tip);

  let showUpiQrHtml = '';
  if (payments.upi && payments.showUpiQr && payments.upiId) {
    const upiId = payments.upiId;
    const payeeName = payments.upiPayeeName || restaurant.name || 'Kitchgoo';
    const remarks = payments.upiRemarks || (order.billNo ? `Bill ${order.billNo}` : 'Kitchgoo Bill');
    const amount = total.toFixed(2);
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(amount)}&tn=${encodeURIComponent(remarks)}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUrl)}`;

    showUpiQrHtml = `
  <div class="center" style="margin: 12px 0;">
    <div class="bold" style="font-size: 10px; margin-bottom: 6px; letter-spacing: 0.5px;">SCAN TO PAY WITH UPI</div>
    <img src="${qrCodeUrl}" alt="UPI QR Code" style="width: 120px; height: 120px; display: block; margin: 0 auto;" />
    <div class="sm" style="margin-top: 6px; font-family: monospace;">UPI ID: ${upiId}</div>
    ${payments.upiPayeeName ? `<div class="sm" style="font-family: monospace;">Payee: ${payments.upiPayeeName}</div>` : ''}
    <div class="sm bold" style="margin-top: 4px; font-size: 11px;">Amount: ${restaurant.currency || '₹'}${amount}</div>
  </div>
  <div class="divider"></div>
`;
  }

  const paperSize = printer.paperSize || '80mm';
  const copies = Math.max(1, Math.min(5, parseInt(printer.copies) || 1));
  const logoUrl = receipt.logo || restaurant.logo || '';
  const headerMsg = receipt.headerText || billing.receiptHeader || '';
  const footerMsg = receipt.footerText || billing.receiptFooter || '';
  const showFeedbackQr = receipt.showQrCode || receipt.showQR;

  const pageSizeCss = paperSize === '58mm'
    ? '@page { size: 58mm auto; margin: 3mm; } body { width: 52mm; max-width: 52mm; font-size: 10px; }'
    : paperSize === 'A4'
    ? '@page { size: A4 portrait; margin: 15mm; } body { width: 100%; max-width: 180mm; font-size: 12px; }'
    : '@page { size: 80mm auto; margin: 6mm; } body { width: 80mm; max-width: 80mm; font-size: 11px; }';

  const renderSingleSlip = (copyIdx) => `
  <div class="receipt-slip" style="${copyIdx < copies - 1 ? 'page-break-after: always; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 2px dashed #999;' : ''}">
    ${copies > 1 ? `<div class="sm center bold" style="margin-bottom: 4px; font-size: 10px;">COPY ${copyIdx + 1} OF ${copies} ${copyIdx === 0 ? '(CUSTOMER)' : '(MERCHANT)'}</div>` : ''}

    ${logoUrl ? `<div class="center" style="margin-bottom: 6px;"><img src="${logoUrl}" alt="Logo" style="max-height: 48px; max-width: 140px; object-fit: contain;" /></div>` : ''}

    <!-- Header -->
    <div class="center" style="margin-bottom: 6px;">
      <div class="restaurant-name">${restaurant.name || 'Kitchgoo'}</div>
      ${restaurant.tagline ? `<div class="sm" style="margin-top:2px;">${restaurant.tagline}</div>` : ''}
      <div class="sm" style="margin-top:3px;">${restaurant.address || ''}</div>
      ${restaurant.phone ? `<div class="sm">Tel: ${restaurant.phone}</div>` : ''}
      ${restaurant.gstin ? `<div class="sm">GSTIN: ${restaurant.gstin}</div>` : ''}
      ${restaurant.fssai ? `<div class="sm">FSSAI: ${restaurant.fssai}</div>` : ''}
    </div>

    <div class="divider-solid"></div>

    <!-- Bill Info -->
    <div class="row">
      <span class="bold bill-no">Bill No: ${order.billNo}</span>
      <span class="sm">${formatDate(order.createdAt)}</span>
    </div>
    <div class="row">
      <span class="sm">Table: ${tableId ? `Table ${tableId}` : (order.tokenNumber ? `Token #${order.tokenNumber} (Dine-In)` : (order.orderType === 'dine-in' ? 'Dine-In (Table Pending)' : 'Takeaway'))}</span>
      <span class="sm">${formatTime(order.createdAt)}</span>
    </div>
    ${guestName ? `<div class="row"><span class="sm">Guest: <span class="bold">${guestName}</span></span></div>` : ''}
    <div class="row">
      <span class="sm">Payment: ${order.paymentMethod || 'Cash'}</span>
      <span class="badge">TAX INVOICE</span>
    </div>
    ${(() => {
      const splits = order.paymentSplits || order.timestamps?.paymentSplits;
      if (Array.isArray(splits) && splits.length > 0) {
        return `
        <div style="margin: 3px 0 4px 0; padding: 3px 0; border-top: 1px dotted #ccc; font-size: 11px;">
          ${splits.map(sp => `
            <div class="row sm">
              <span>&bull; ${sp.method}</span>
              <span>${restaurant.currency || '₹'}${parseFloat(sp.amount || 0).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
        `;
      }
      return '';
    })()}

    <div class="divider"></div>

    <!-- Item Table -->
    <table>
      <thead>
        <tr>
          <th class="item-name">Item</th>
          <th class="item-qty">Qty</th>
          <th class="item-rate">Rate</th>
          <th class="item-total">Amt</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="4"><div class="divider" style="margin:3px 0;"></div></td></tr>
        ${order.items.map(item => `
        <tr>
          <td class="item-name">${item.name}</td>
          <td class="item-qty">${item.qty}</td>
          <td class="item-rate">${restaurant.currency || '₹'}${item.price.toFixed(2)}</td>
          <td class="item-total">${restaurant.currency || '₹'}${(item.price * item.qty).toFixed(2)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="divider"></div>

    <!-- Totals -->
    <div class="row"><span>${pricesIncludeGst ? 'Taxable Amount' : 'Subtotal'}</span><span>${restaurant.currency || '₹'}${subtotal.toFixed(2)}</span></div>
    ${billing.showGstBreakdown ? `
    <div class="row sm"><span>CGST @ ${(taxRate / 2).toFixed(1)}%</span><span>${restaurant.currency || '₹'}${cgst.toFixed(2)}</span></div>
    <div class="row sm"><span>SGST @ ${(taxRate / 2).toFixed(1)}%</span><span>${restaurant.currency || '₹'}${sgst.toFixed(2)}</span></div>
    ` : `<div class="row sm"><span>GST (${taxRate}%${pricesIncludeGst ? ' incl.' : ''})</span><span>${restaurant.currency || '₹'}${tax.toFixed(2)}</span></div>`}
    ${serviceCharge > 0 ? `<div class="row"><span>Service Charge (${billing.serviceCharge}%)</span><span>${restaurant.currency || '₹'}${serviceCharge.toFixed(2)}</span></div>` : ''}
    ${autoGratuity > 0 ? `<div class="row"><span>Auto-Gratuity</span><span>${restaurant.currency || '₹'}${autoGratuity.toFixed(2)}</span></div>` : ''}
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>-${restaurant.currency || '₹'}${discount.toFixed(2)}</span></div>` : ''}

    <div class="divider-solid"></div>
    <div class="row total-row">
      <span>TOTAL ${pricesIncludeGst ? '(INCL. GST)' : ''}</span>
      <span>${restaurant.currency || '₹'}${total.toFixed(2)}</span>
    </div>
    ${(() => {
      const splits = order.paymentSplits || order.timestamps?.paymentSplits;
      if (Array.isArray(splits) && splits.length > 0) {
        return `
        <div style="margin-top: 4px; font-size: 11px;">
          ${splits.map(sp => `
            <div class="row sm">
              <span style="color:#555;">Paid via ${sp.method}</span>
              <span style="font-weight:600;">${restaurant.currency || '₹'}${parseFloat(sp.amount || 0).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
        `;
      }
      return '';
    })()}
    <div class="divider"></div>

    ${showUpiQrHtml}

    <!-- Items count -->
    <div class="sm center">${order.items.reduce((s,i) => s + i.qty, 0)} item(s) &nbsp;|&nbsp; Thank you!</div>

    <div class="divider"></div>

    <!-- Custom Messages & QR -->
    ${headerMsg ? `<div class="footer-msg bold" style="color: #222; margin-bottom: 2px;">${headerMsg}</div>` : ''}
    ${footerMsg ? `<div class="footer-msg" style="white-space: pre-wrap;">${footerMsg}</div>` : ''}
    ${showFeedbackQr ? `
      <div class="center" style="margin: 8px 0;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(restaurant.name ? `https://kitchgoo.in/feedback?restaurant=${encodeURIComponent(restaurant.name)}` : 'https://kitchgoo.in/feedback')}" alt="Feedback QR" style="width: 70px; height: 70px; display: block; margin: 0 auto;" />
        <div class="sm" style="margin-top: 3px; font-size: 8px;">Scan to share your feedback</div>
      </div>
    ` : ''}
    <div class="footer-msg" style="margin-top:6px;">*** Please check your bill before settling ***</div>
    <div class="footer-msg">Powered by Kitchgoo POS</div>
  </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt - ${order.billNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    ${pageSizeCss}
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #111;
      padding: 8px;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: 700; }
    .lg     { font-size: 14px; }
    .sm     { font-size: 9px; color: #555; }
    .divider { border-top: 1px dashed #aaa; margin: 6px 0; }
    .divider-solid { border-top: 1px solid #111; margin: 6px 0; }
    .row    { display: flex; justify-content: space-between; margin: 2px 0; }
    .item-name { flex: 1; padding-right: 6px; }
    .item-qty  { width: 28px; text-align: center; }
    .item-rate { width: 52px; text-align: right; }
    .item-total{ width: 58px; text-align: right; }
    thead th   { font-weight: 700; font-size: 9px; text-transform: uppercase; }
    table      { width: 100%; border-collapse: collapse; }
    td, th     { padding: 2px 0; }
    .total-row { font-size: 13px; font-weight: 700; }
    .restaurant-name { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
    .bill-no { font-size: 10px; }
    .footer-msg { font-size: 9px; color: #555; text-align: center; margin-top: 4px; }
    .badge { display: inline-block; border: 1px solid #ccc; padding: 1px 5px; border-radius: 4px; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    @media print {
      body { width: 100%; }
      button { display: none; }
    }
  </style>
</head>
<body>
  ${Array.from({ length: copies }, (_, i) => renderSingleSlip(i)).join('')}

  <script>
    window.onload = () => {
      // Small delay so styles load fully
      setTimeout(() => { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`;

  if (typeof window !== 'undefined' && window.open) {
    const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  }
  return html;
}

export function printTableTransferNotice({ fromTable, toTable, guestName, serverName, items = [], settings }) {
  const restaurant = settings?.restaurant || {};
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const fromNum = typeof fromTable === 'object' ? (fromTable.number || fromTable.id) : fromTable;
  const toNum = typeof toTable === 'object' ? (toTable.number || toTable.id) : toTable;
  const totalQty = items.reduce((s, i) => s + (i.qty || 1), 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Table Transfer Notice</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 6mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #000;
      width: 72mm;
      margin: 0 auto;
      padding: 4px 0;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: 14px; font-weight: bold; margin: 4px 0 2px; }
    .alert-box {
      border: 2px dashed #000;
      padding: 8px;
      margin: 8px 0;
      text-align: center;
    }
    .shift-arrow {
      font-size: 15px;
      font-weight: bold;
      margin: 4px 0;
    }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .item-row { display: flex; justify-content: space-between; font-size: 10px; margin: 2px 0; }
    .footer-msg { text-align: center; font-size: 10px; margin-top: 6px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="center bold">${restaurant.name ? restaurant.name.toUpperCase() : 'KITCHGOO RESTAURANT'}</div>
  <div class="center bold title">TABLE TRANSFER NOTICE</div>
  <div class="center" style="font-size: 10px;">${dateStr} &nbsp; ${timeStr}</div>

  <div class="alert-box">
    <div style="font-size: 10px; text-transform: uppercase;">GUEST MOVED</div>
    <div class="shift-arrow">TABLE ${fromNum} &#10132; TABLE ${toNum}</div>
    <div style="font-size: 9px;">PLEASE DELIVER ALL PENDING FOOD TO TABLE ${toNum}</div>
  </div>

  <div class="divider"></div>
  <div class="row"><span>Guest:</span><span class="bold">${guestName || 'Guest'}</span></div>
  ${serverName ? `<div class="row"><span>Server:</span><span>${serverName}</span></div>` : ''}
  <div class="row"><span>Items on Tab:</span><span>${items.length} items (${totalQty} qty)</span></div>

  ${items.length > 0 ? `
  <div class="divider"></div>
  <div class="bold" style="font-size: 10px; margin-bottom: 3px;">ACTIVE ITEMS:</div>
  ${items.map(i => `
    <div class="item-row">
      <span>${i.qty}x ${i.name || i.title || 'Item'}</span>
      ${i.course ? `<span>[C${i.course}]</span>` : ''}
    </div>
  `).join('')}
  ` : ''}

  <div class="divider"></div>
  <div class="footer-msg">*** ATTENTION RUNNERS & KITCHEN ***</div>
  <div class="center" style="font-size: 9px; margin-top: 2px;">Update physical slips accordingly</div>

  <script>
    window.onload = () => {
      setTimeout(() => { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`;

  if (typeof window !== 'undefined' && window.open) {
    const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  }
  return html;
}

export function printKOT({ orderId, items = [], tableId, tableName, serverName, orderType = 'Dine-in', notes = '', settings }) {
  const restaurant = settings?.restaurant || {};
  const printer = settings?.printer || {};
  const paperSize = printer.paperSize || '80mm';
  const d = new Date();
  const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const tableLabel = tableName || (tableId ? (String(tableId).startsWith('tab_') ? 'Dine-In (Table Pending)' : `Table ${tableId}`) : (orderType?.toLowerCase() === 'dine-in' ? 'Dine-In (Table Pending)' : 'Takeout'));

  const pageSizeCss = paperSize === '58mm'
    ? '@page { size: 58mm auto; margin: 3mm; } body { width: 52mm; max-width: 52mm; font-size: 10px; }'
    : paperSize === 'A4'
    ? '@page { size: A4 portrait; margin: 15mm; } body { width: 100%; max-width: 180mm; font-size: 12px; }'
    : '@page { size: 80mm auto; margin: 6mm; } body { width: 80mm; max-width: 80mm; font-size: 11px; }';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>KOT - ${orderId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    ${pageSizeCss}
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      padding: 6px;
    }
    .center { text-align: center; }
    .bold   { font-weight: 700; }
    .title  { font-size: 15px; letter-spacing: 1px; margin-bottom: 2px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border-top: 2px solid #000; margin: 6px 0; }
    .row    { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
    .item-row { display: flex; align-items: flex-start; margin: 4px 0; font-size: 12px; }
    .item-qty { width: 34px; font-weight: 800; font-size: 14px; }
    .item-name { flex: 1; font-weight: 700; }
    .item-note { font-size: 10px; color: #333; font-style: italic; margin-left: 34px; }
    .course-badge { font-size: 10px; padding: 1px 4px; border: 1px solid #000; border-radius: 3px; font-weight: 600; margin-left: 4px; }
    @media print {
      body { width: 100%; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="center bold title">KITCHEN ORDER TICKET (KOT)</div>
  <div class="center" style="font-size: 10px;">${restaurant.name || 'Kitchgoo'}</div>
  <div class="divider-solid"></div>

  <div class="row">
    <span class="bold" style="font-size: 13px;">${tableLabel}</span>
    <span class="bold" style="font-size: 12px;">#${orderId}</span>
  </div>
  <div class="row">
    <span>Type: ${orderType}</span>
    <span>${timeStr}</span>
  </div>
  <div class="row">
    <span>Server: ${serverName || 'Staff'}</span>
    <span>${dateStr}</span>
  </div>

  <div class="divider-solid"></div>

  <div style="margin: 6px 0;">
    ${items.map(item => `
      <div style="margin-bottom: 6px;">
        <div class="item-row">
          <span class="item-qty">${item.qty}x</span>
          <span class="item-name">${item.name || item.title || 'Item'}</span>
          ${item.course ? `<span class="course-badge">C${item.course}</span>` : ''}
        </div>
        ${(item.modifiers && item.modifiers.length > 0) ? `
          <div class="item-note">+ ${item.modifiers.map(m => m.name || m).join(', ')}</div>
        ` : ''}
        ${item.notes ? `
          <div class="item-note">Note: ${item.notes}</div>
        ` : ''}
      </div>
    `).join('')}
  </div>

  ${notes ? `
    <div class="divider"></div>
    <div style="font-size: 10px; font-weight: 700;">Order Note: ${notes}</div>
  ` : ''}

  <div class="divider-solid"></div>
  <div class="center bold" style="font-size: 10px; margin-top: 4px;">*** END OF TICKET ***</div>

  <script>
    window.onload = () => {
      setTimeout(() => { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`;

  if (typeof window !== 'undefined' && window.open) {
    const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  }
  return html;
}

