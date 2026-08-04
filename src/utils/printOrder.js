import { supabase } from "../lib/supabaseClient";

function fmt(d) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export async function printOrder(orderId) {
  const [orderRes, itemsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("order_id", orderId).single(),
    supabase.from("order_items").select("*").eq("order_id", orderId),
  ]);

  const order = orderRes.data;
  const items = itemsRes.data || [];

  if (!order) {
    alert("Order not found or data missing.");
    return;
  }

  let totalQty = 0;
  let totalWt = 0;

  const itemsHtml = items
    .map((it) => {
      totalQty += Number(it.qty) || 0;
      totalWt += Number(it.weight_ton) || 0;
      const shadeStr = it.shade ? `(${it.shade})` : "";
      const modelStr = it.model ? `<strong>[${it.model}]</strong>` : "";
      return `<tr>
        <td>${it.item_name || ""} ${shadeStr} <br> ${modelStr}</td>
        <td>${it.brand || order.brand || ""}</td>
        <td>${it.size || ""}</td>
        <td>${it.thickness || ""}</td>
        <td>${it.qty || 0}</td>
        <td>${Number(it.na || 0).toFixed(3)}</td>
        <td>${Number(it.weight_ton || 0).toFixed(3)}</td>
      </tr>`;
    })
    .join("");

  const globalRem = order.remark ? `<p><strong>Remark:</strong> ${order.remark}</p>` : "";
  const destHtml = order.destination
    ? `<div><strong>Destination:</strong> <span>${order.destination}</span></div>`
    : "";

  const html = `<!DOCTYPE html><html><head><title>Print Order ${order.order_id}</title><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 20px; color: #333;}
    .print-container { border: 1px solid #dee2e6; padding: 25px; max-width: 800px; margin: auto; background: #fff; border-radius: 8px; }
    h1, h2 { text-align: center; margin: 0; color: #000;} h1 { font-size: 24px; } h2 { font-size: 20px; color: #555; margin-top: 5px;}
    .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; font-size: 14px; }
    .details-grid div { display: flex; padding: 5px; border-bottom: 1px solid #eee;} .details-grid strong { width: 110px; color: #555;}
    h3 { border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 30px;}
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;}
    th, td { border: 1px solid #dee2e6; padding: 10px; text-align: left; } thead { background-color: #f8f9fa; } tfoot { font-weight: bold; background-color: #f8f9fa;}
    @media print { body { margin: 0; background: #fff; } .print-container { border: none; box-shadow: none; max-width: 100%; } #printButton { display: none; } }
  </style></head><body>
    <div class="print-container">
      <div class="header"><h1>Order Confirmation</h1><h2>${order.order_id}</h2></div>
      <div class="details-grid">
        <div><strong>Party Name:</strong> <span>${order.party_name || ""}</span></div>
        <div><strong>Sales Person:</strong> <span>${order.sales_person || ""}</span></div>
        <div><strong>Order Date:</strong> <span>${fmt(order.order_date)}</span></div>
        <div><strong>Brand:</strong> <span>${order.brand || ""}</span></div>
        ${destHtml}
      </div>
      ${globalRem}
      <h3>Item Details</h3>
      <table>
        <thead><tr><th>Item / Model</th><th>Brand</th><th>Size</th><th>Thick</th><th>Qty</th><th>NA</th><th>Wt(Ton)</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;">Total</td><td>${totalQty}</td><td></td><td>${totalWt.toFixed(3)}</td></tr></tfoot>
      </table>
    </div>
    <div style="text-align:center; margin-top:20px;">
      <button id="printButton" onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor:pointer;">Print</button>
    </div>
  </body></html>`;

  const win = window.open("", "Print Order", "width=850,height=800");
  win.document.write(html);
  win.document.close();
}
