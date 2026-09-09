function fmt(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

function money(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Opens a print-ready Purchase Order document — the user can "Save as PDF"
 * from the browser's print dialog to send it to the vendor.
 */
export function printPurchaseOrder(po, items) {
  const rows = items
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${it.material?.item_code || "-"}</td>
        <td>${it.material?.name || "Unknown"}</td>
        <td>${it.material?.unit || "-"}</td>
        <td class="num">${Number(it.qty_ordered).toLocaleString("en-IN")}</td>
        <td class="num">₹${money(it.rate)}</td>
        <td class="num">₹${money(it.amount)}</td>
      </tr>`
    )
    .join("");

  const total = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const html = `<!DOCTYPE html><html><head><title>${po.po_number} — Purchase Order</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #1c1e26; }
    .print-container { max-width: 900px; margin: auto; }
    .header { border-bottom: 3px solid #14161f; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { margin: 0 0 4px 0; font-size: 22px; }
    .header .sub { color: #888; font-size: 12px; }
    .header .po-id { font-family: monospace; font-size: 15px; background: #14161f; color: #fff; padding: 6px 14px; border-radius: 20px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    .meta-box { border: 1px solid #e2e4ec; border-radius: 10px; padding: 12px 14px; }
    .meta-box h4 { margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.04em; }
    .meta-box div { font-size: 13.5px; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 18px; }
    th, td { border: 1px solid #dcdfe6; padding: 8px 10px; text-align: left; }
    thead th { background: #14161f; color: #fff; font-size: 10.5px; text-transform: uppercase; }
    td.num, th.num { text-align: right; }
    tfoot td { font-weight: 700; background: #f6f7fb; }
    .remarks { font-size: 12.5px; color: #4a4d5c; border-top: 1px solid #eceef4; padding-top: 12px; }
    @media print { #printBtn { display: none; } body { margin: 0; } }
  </style></head>
  <body>
    <div class="print-container">
      <div class="header">
        <div>
          <h1>Purchase Order</h1>
          <div class="sub">Generated ${fmt(new Date())}</div>
        </div>
        <span class="po-id">${po.po_number}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-box">
          <h4>Vendor</h4>
          <div><strong>${po.vendor_name}</strong></div>
          <div>${po.vendor_address || "-"}</div>
        </div>
        <div class="meta-box">
          <h4>Order Details</h4>
          <div>PO Date: ${fmt(po.created_at)}</div>
          <div>Expected Delivery: ${fmt(po.expected_date)}</div>
          <div>Deliver To: ${po.delivery_location || "-"}</div>
          <div>Payment Terms: ${po.payment_terms || "-"}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>#</th><th>Item Code</th><th>Material</th><th>UOM</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="6" class="num">Total</td><td class="num">₹${money(total)}</td></tr>
        </tfoot>
      </table>

      ${po.remarks ? `<div class="remarks"><strong>Remarks:</strong> ${po.remarks}</div>` : ""}
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button id="printBtn" onclick="window.print()" style="padding:10px 22px; font-size:15px; cursor:pointer;">Print / Save as PDF</button>
    </div>
  </body></html>`;

  const win = window.open("", "Purchase Order", "width=950,height=850");
  win.document.write(html);
  win.document.close();
}
