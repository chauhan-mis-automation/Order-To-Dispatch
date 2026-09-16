function fmt(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

/**
 * Prints a preview of a Grid-entry order — only rows with a filled qty are
 * shown (never the blank grid cells), grouped by item, matching the
 * client's original Excel/challan layout.
 */
export function printGridPreview(header, items) {
  if (!items || items.length === 0) {
    alert("Fill at least one quantity in the grid before printing.");
    return;
  }

  // group flattened rows by item name for a sectioned layout
  const byItem = {};
  items.forEach((it) => {
    byItem[it.itemName] = byItem[it.itemName] || [];
    byItem[it.itemName].push(it);
  });

  let grandPcs = 0, grandNa = 0, grandWt = 0;
  const sections = Object.entries(byItem)
    .map(([itemName, rows]) => {
      const rowsHtml = rows
        .map((r) => {
          grandPcs += Number(r.qty) || 0;
          grandNa += Number(r.na) || 0;
          grandWt += Number(r.weightTon) || 0;
          return `<tr>
            <td>${r.thickness}</td><td>${r.size}</td>
            <td>${r.model || "-"}</td><td>${r.shade || "-"}</td>
            <td class="num">${r.qty}</td><td class="num">${Number(r.na).toFixed(3)}</td><td class="num">${Number(r.weightTon).toFixed(3)}</td>
          </tr>`;
        })
        .join("");
      const secPcs = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const secNa = rows.reduce((s, r) => s + (Number(r.na) || 0), 0);
      const secWt = rows.reduce((s, r) => s + (Number(r.weightTon) || 0), 0);
      return `<h3>${itemName}</h3>
        <table>
          <thead><tr><th>Thickness</th><th>Size</th><th>Model</th><th>Shade</th><th>Pcs</th><th>NA</th><th>Ton</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr><td colspan="4">TOTAL ${itemName}</td><td class="num">${secPcs}</td><td class="num">${secNa.toFixed(3)}</td><td class="num">${secWt.toFixed(3)}</td></tr></tfoot>
        </table>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><title>Order Preview</title><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color: #333; }
    .print-container { border: 1px solid #dee2e6; padding: 25px; max-width: 900px; margin: auto; background: #fff; border-radius: 8px; }
    h1 { text-align: center; margin: 0; font-size: 22px; }
    .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 12.5px; }
    .details-grid div { display: flex; padding: 4px; border-bottom: 1px solid #eee; }
    .details-grid strong { width: 100px; color: #555; flex-shrink: 0; }
    h3 { border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 22px; font-size: 14px; background: #f6f7fb; padding: 6px 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12.5px; }
    th, td { border: 1px solid #dee2e6; padding: 6px 8px; text-align: left; }
    thead { background-color: #14161f; color: #fff; } tfoot { font-weight: bold; background-color: #fdf3e4; }
    td.num, th.num { text-align: right; }
    .grand-total { margin-top: 20px; padding: 12px; background: #eafaf1; border-radius: 8px; font-weight: 700; display: flex; justify-content: space-around; font-size: 13px; }
    @media print { body { margin: 0; } .print-container { border: none; max-width: 100%; } #printBtn { display: none; } }
  </style></head><body>
    <div class="print-container">
      <div class="header"><h1>Order Preview — ${header.clientOrderNo || "New Order"}</h1></div>
      <div class="details-grid">
        <div><strong>Party:</strong> <span>${header.party || "-"}</span></div>
        <div><strong>Brand:</strong> <span>${header.brand || "-"}</span></div>
        <div><strong>Destination:</strong> <span>${header.destination || "-"}</span></div>
        <div><strong>Date:</strong> <span>${fmt(header.orderDate)}</span></div>
        <div><strong>Indent Date:</strong> <span>${fmt(header.indentDate)}</span></div>
        <div><strong>Bill No:</strong> <span>${header.billNo || "-"}</span></div>
        <div><strong>Order No:</strong> <span>${header.clientOrderNo || "-"}</span></div>
        <div><strong>Transport:</strong> <span>${header.transport || "-"}</span></div>
        <div><strong>Truck No:</strong> <span>${header.truckNo || "-"}</span></div>
        <div><strong>Mode of Vehicle:</strong> <span>${header.modeOfVehicle || "-"}</span></div>
        <div><strong>Driver Name:</strong> <span>${header.driverName || "-"}</span></div>
        <div><strong>Driver Mobile:</strong> <span>${header.driverMobile || "-"}</span></div>
      </div>

      ${sections}

      <div class="grand-total">
        <span>Grand Total Pcs: ${grandPcs}</span>
        <span>Grand Total NA: ${grandNa.toFixed(3)}</span>
        <span>Grand Total Ton: ${grandWt.toFixed(3)}</span>
      </div>
      ${header.remark ? `<p style="margin-top:14px;"><strong>Remark:</strong> ${header.remark}</p>` : ""}
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button id="printBtn" onclick="window.print()" style="padding:10px 22px; font-size:15px; cursor:pointer;">Print / Save as PDF</button>
    </div>
  </body></html>`;

  const win = window.open("", "Order Preview", "width=950,height=850");
  win.document.write(html);
  win.document.close();
}
