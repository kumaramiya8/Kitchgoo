/**
 * Kitchgoo - Print Receipt Utility
 * Generates a proper restaurant invoice and opens a print dialog.
 */

export function printReceipt({ order, settings, tableId, guestName }) {
  const restaurant = settings?.restaurant || {};
  const billing = settings?.billing || {};

  const formatDate = (iso) => {
    const d = new Date(iso || Date.now());
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const formatTime = (iso) => {
    const d = new Date(iso || Date.now());
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  const taxRate = billing.gstRate ?? 5;
  const tax = subtotal * (taxRate / 100);
  const cgst = tax / 2;
  const sgst = tax / 2;
  const serviceCharge = billing.enableServiceCharge
    ? subtotal * ((billing.serviceCharge || 0) / 100) : 0;
  const total = subtotal + tax + serviceCharge;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt - ${order.billNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 6mm; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #111;
      width: 80mm;
      max-width: 80mm;
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
      body { width: 80mm; }
      button { display: none; }
    }
  </style>
</head>
<body>

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
    <span class="sm">Table: ${tableId ? `Table ${tableId}` : 'Takeaway'}</span>
    <span class="sm">${formatTime(order.createdAt)}</span>
  </div>
  ${guestName ? `<div class="row"><span class="sm">Guest: <span class="bold">${guestName}</span></span></div>` : ''}
  <div class="row">
    <span class="sm">Payment: ${order.paymentMethod || 'Cash'}</span>
    <span class="badge">TAX INVOICE</span>
  </div>

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
  <div class="row"><span>Subtotal</span><span>${restaurant.currency || '₹'}${subtotal.toFixed(2)}</span></div>
  ${billing.showGstBreakdown ? `
  <div class="row sm"><span>CGST @ ${taxRate / 2}%</span><span>${restaurant.currency || '₹'}${cgst.toFixed(2)}</span></div>
  <div class="row sm"><span>SGST @ ${taxRate / 2}%</span><span>${restaurant.currency || '₹'}${sgst.toFixed(2)}</span></div>
  ` : `<div class="row"><span>GST (${taxRate}%)</span><span>${restaurant.currency || '₹'}${tax.toFixed(2)}</span></div>`}
  ${serviceCharge > 0 ? `<div class="row"><span>Service Charge (${billing.serviceCharge}%)</span><span>${restaurant.currency || '₹'}${serviceCharge.toFixed(2)}</span></div>` : ''}

  <div class="divider-solid"></div>
  <div class="row total-row">
    <span>TOTAL</span>
    <span>${restaurant.currency || '₹'}${total.toFixed(2)}</span>
  </div>
  <div class="divider"></div>

  <!-- Items count -->
  <div class="sm center">${order.items.reduce((s,i) => s + i.qty, 0)} item(s) &nbsp;|&nbsp; Thank you!</div>

  <div class="divider"></div>

  <!-- Footer -->
  ${billing.receiptHeader ? `<div class="footer-msg">${billing.receiptHeader}</div>` : ''}
  ${billing.receiptFooter ? `<div class="footer-msg">${billing.receiptFooter}</div>` : ''}
  <div class="footer-msg" style="margin-top:6px;">*** Please check your bill before settling ***</div>
  <div class="footer-msg">Powered by Kitchgoo POS</div>

  <script>
    window.onload = () => {
      // Small delay so styles load fully
      setTimeout(() => { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}
