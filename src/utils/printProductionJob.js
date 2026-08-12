function fmt(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

/**
 * Opens a print-ready window listing every item + its full material
 * breakdown for a production job. The user can "Save as PDF" from the
 * browser's print dialog — no extra PDF library needed.
 */
export function printProductionJob(job, perItemMaterials) {
  const itemSections = perItemMaterials
    .map(({ item, materials }) => {
      const rows = materials
        .map(
          (m) => `<tr>
            <td>${m.bomId}</td>
            <td>${m.fgId}</td>
            <td>${m.fgName}</td>
            <td>${m.itemCode}</td>
            <td>${m.name}</td>
            <td>${m.category}</td>
            <td>${m.unit}</td>
            <td>${m.totalQty.toFixed(2)} ${m.basis === "per_sqmtr" ? "/Sq.Mtr" : "/Pc"}</td>
            <td>${m.available.toFixed(2)}</td>
            <td class="${m.isShort ? "short" : "ok"}">${m.isShort ? `Short ${m.shortQty.toFixed(2)}` : "OK"}</td>
          </tr>`
        )
        .join("");

      return `
        <div class="item-block">
          <div class="item-title">${item.item_name} — ${item.thickness}, ${item.size} ${item.brand ? `(${item.brand})` : ""} — <strong>${item.qty} pcs</strong></div>
          <table>
            <thead>
              <tr>
                <th>BOM ID</th><th>FG ID</th><th>FG Name</th><th>Item Code</th>
                <th>Material</th><th>Category</th><th>UOM</th><th>Qty Needed</th><th>Available</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="10" class="empty">No BOM recipe found for this item.</td></tr>`}</tbody>
          </table>
        </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><title>${job.job_number} — Material Requirement</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; color: #1c1e26; }
    .print-container { max-width: 950px; margin: auto; }
    .header { border-bottom: 3px solid #14161f; padding-bottom: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .header h1 { margin: 0; font-size: 22px; }
    .header .job-id { font-family: monospace; font-size: 14px; background: #14161f; color: #fff; padding: 5px 12px; border-radius: 20px; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px; margin-bottom: 22px; }
    .meta div { border: 1px solid #e2e4ec; border-radius: 8px; padding: 8px 12px; }
    .meta span { display: block; font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 3px; }
    .item-block { margin-bottom: 26px; }
    .item-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; background: #fdf3e4; padding: 8px 12px; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th, td { border: 1px solid #dcdfe6; padding: 6px 8px; text-align: left; }
    thead th { background: #14161f; color: #fff; font-size: 10px; text-transform: uppercase; }
    td.ok { color: #1a8a4c; font-weight: 700; }
    td.short { color: #c23c33; font-weight: 700; }
    td.empty { text-align: center; color: #999; }
    @media print { #printBtn { display: none; } body { margin: 0; } }
  </style></head>
  <body>
    <div class="print-container">
      <div class="header">
        <h1>Production Job — Material Requirement</h1>
        <span class="job-id">${job.job_number}</span>
      </div>
      <div class="meta">
        <div><span>Order</span>${job.order_id}</div>
        <div><span>Status</span>${job.status}</div>
        <div><span>Generated</span>${fmt(new Date())}</div>
      </div>
      ${itemSections}
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button id="printBtn" onclick="window.print()" style="padding:10px 22px; font-size:15px; cursor:pointer;">Print / Save as PDF</button>
    </div>
  </body></html>`;

  const win = window.open("", "Production Job", "width=950,height=850");
  win.document.write(html);
  win.document.close();
}
