import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Printer, RotateCcw, FileSpreadsheet, Loader2, Search, ArrowDownAZ, Lock,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import PlanDateModal from "../components/ui/PlanDateModal";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import CloseOrderModal from "../components/ui/CloseOrderModal";
import { printOrder } from "../utils/printOrder";

// Everything from "Confirmed" onward (until fully Dispatched) lives here —
// "Picked"/"Ready to Ship" are kept in the query only so any order still
// sitting in those legacy states from before the flow simplification
// doesn't get orphaned out of every list.
const STATUSES = ["Confirmed", "Picked", "Ready to Ship", "Partially Dispatched"];

const STATUS_STYLES = {
  Confirmed: { bg: "#e8f1ff", color: "#1d5fc7" },
  Picked: { bg: "#e8f1ff", color: "#1d5fc7" },
  "Ready to Ship": { bg: "#f3e8ff", color: "#8b3fd6" },
  "Partially Dispatched": { bg: "#fff4de", color: "#b5620f" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function Picking({ currentUser }) {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [dispatchedMap, setDispatchedMap] = useState({}); // order_id -> total already dispatched qty

  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortAlpha, setSortAlpha] = useState(false);
  const [apprFromDate, setApprFromDate] = useState("");
  const [apprToDate, setApprToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [printingDetailed, setPrintingDetailed] = useState(false);

  const [viewOrderId, setViewOrderId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [planDateTarget, setPlanDateTarget] = useState(null); // { orderId, existingDate }
  const [closeOrder, setCloseOrder] = useState(null); // full order object

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", STATUSES)
      .order("created_at", { ascending: false });

    if (error) setErrorMsg(error.message);
    else setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Pull dispatch_logs for every order currently in view, so partially
  // dispatched orders can show "X dispatched / Y pending" — same numbers
  // the Dispatch page works off of.
  useEffect(() => {
    let cancelled = false;
    async function loadDispatched() {
      if (orders.length === 0) {
        setDispatchedMap({});
        return;
      }
      const orderIds = orders.map((o) => o.order_id);
      const { data } = await supabase.from("dispatch_logs").select("order_id, dispatched_qty").in("order_id", orderIds);
      if (cancelled) return;
      const map = {};
      (data || []).forEach((r) => {
        map[r.order_id] = (map[r.order_id] || 0) + (Number(r.dispatched_qty) || 0);
      });
      setDispatchedMap(map);
    }
    loadDispatched();
    return () => { cancelled = true; };
  }, [orders]);

  const filtered = useMemo(() => {
    let result = orders.filter((o) => {
      if (partyFilter && o.party_name !== partyFilter) return false;
      if (salesFilter && o.sales_person !== salesFilter) return false;
      if (brandFilter && o.brand !== brandFilter) return false;
      if (apprFromDate && (!o.approved_at || o.approved_at.split("T")[0] < apprFromDate)) return false;
      if (apprToDate && (!o.approved_at || o.approved_at.split("T")[0] > apprToDate)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.order_id} ${o.party_name} ${o.brand || ""} ${o.destination || ""} ${o.sales_person || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortAlpha) {
      result = [...result].sort((a, b) => a.party_name.localeCompare(b.party_name));
    }
    return result;
  }, [orders, partyFilter, salesFilter, brandFilter, search, apprFromDate, apprToDate, sortAlpha]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [orders]);

  function resetFilters() {
    setPartyFilter(""); setSalesFilter(""); setBrandFilter(""); setSearch("");
    setApprFromDate(""); setApprToDate(""); setSortAlpha(false);
  }

  function toggleSelect(orderId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.order_id))));
  }

  function printSelected() {
    const toPrint = selectedIds.size > 0 ? filtered.filter((o) => selectedIds.has(o.order_id)) : filtered;
    if (toPrint.length === 0) {
      alert("No records to print.");
      return;
    }
    const title = "Approved Orders";
    const rowsHtml = toPrint.map((o) => {
      const dispatched = dispatchedMap[o.order_id] || 0;
      const pending = Math.max(0, (Number(o.total_qty) || 0) - dispatched);
      const qtyCell = dispatched > 0
        ? `${o.total_qty} total<br/><span class="disp">${dispatched} dispatched</span><br/><span class="pend">${pending} pending</span>`
        : `${o.total_qty}`;
      return `<tr>
        <td>${o.order_id}</td><td>${formatDate(o.order_date)}</td><td>${o.party_name}</td>
        <td>${o.brand || "-"}</td><td>${o.destination || "-"}</td><td>${o.sales_person || "-"}</td>
        <td class="num">${qtyCell}</td><td class="num">${Number(o.total_weight).toFixed(3)}</td>
        <td>${o.status}</td><td>${formatDate(o.approved_at)}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color: #1c1e26; }
      h1 { font-size: 18px; border-bottom: 2px solid #14161f; padding-bottom: 10px; }
      .sub { color: #9295a8; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #dee2e6; padding: 6px 8px; text-align: left; }
      thead { background: #14161f; color: #fff; }
      td.num, th.num { text-align: right; }
      td .disp { color: #1a8a4c; font-weight: 700; }
      td .pend { color: #c23c33; font-weight: 700; }
      @media print { #printBtn { display: none; } }
    </style></head><body>
      <h1>${title}</h1>
      <div class="sub">Generated ${formatDate(new Date())} — ${toPrint.length} record(s)</div>
      <table>
        <thead><tr><th>Order ID</th><th>Order Date</th><th>Party</th><th>Brand</th><th>Destination</th><th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>Status</th><th>Appr. Date</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="text-align:center; margin-top:20px;">
        <button id="printBtn" onclick="window.print()" style="padding:10px 22px; font-size:15px; cursor:pointer;">Print / Save as PDF</button>
      </div>
    </body></html>`;
    const win = window.open("", title, "width=950,height=850");
    win.document.write(html);
    win.document.close();
  }

  async function printSelectedDetailed() {
    const toPrint = selectedIds.size > 0 ? filtered.filter((o) => selectedIds.has(o.order_id)) : filtered;
    if (toPrint.length === 0) {
      alert("No records to print.");
      return;
    }
    setPrintingDetailed(true);
    try {
      const orderIds = toPrint.map((o) => o.order_id);
      const { data: allItems } = await supabase.from("order_items").select("*").in("order_id", orderIds);
      const itemsByOrder = {};
      (allItems || []).forEach((it) => {
        itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || [];
        itemsByOrder[it.order_id].push(it);
      });

      const title = "Approved Orders — Full Details";
      const field = (label, value) => (value ? `<div><strong>${label}:</strong> <span>${value}</span></div>` : "");

      const sectionsHtml = toPrint
        .map((o) => {
          const items = itemsByOrder[o.order_id] || [];
          const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
          const totalNa = items.reduce((s, i) => s + (Number(i.na) || 0), 0);
          const totalWt = items.reduce((s, i) => s + (Number(i.weight_ton) || 0), 0);
          const dispatched = dispatchedMap[o.order_id] || 0;
          const pending = Math.max(0, (Number(o.total_qty) || 0) - dispatched);
          const itemRows = items
            .map((it) => `<tr>
              <td>${it.item_name}${it.shade ? ` <span class="badge">${it.shade}</span>` : ""}${it.model ? ` <span class="badge blue">${it.model}</span>` : ""}</td>
              <td>${it.size}</td><td>${it.thickness}</td>
              <td class="num">${it.qty}</td><td class="num">${Number(it.na).toFixed(3)}</td><td class="num">${Number(it.weight_ton).toFixed(3)}</td>
            </tr>`)
            .join("");

          return `<div class="order-section">
            <div class="order-head">
              <span class="order-id">${o.order_id}</span>
              <span class="order-status">${o.status}</span>
            </div>
            <div class="details-grid">
              ${field("Date", formatDate(o.order_date))}
              ${field("Party", o.party_name)}
              ${field("Brand", o.brand)}
              ${field("Destination", o.destination)}
              ${field("Sales Person", o.sales_person)}
              ${field("Appr. Date", o.approved_at ? formatDate(o.approved_at) : "")}
              ${field("Bill No", o.bill_no)}
              ${field("Indent No", o.client_order_no)}
              ${field("Indent Date", o.indent_date ? formatDate(o.indent_date) : "")}
              ${dispatched > 0 ? `<div><strong>Dispatched:</strong> <span class="disp">${dispatched}</span></div>` : ""}
              ${dispatched > 0 ? `<div><strong>Pending:</strong> <span class="pend">${pending}</span></div>` : ""}
            </div>
            ${o.remark ? `<p class="remark"><strong>Remark:</strong> ${o.remark}</p>` : ""}
            <table>
              <thead><tr><th>Item / Model</th><th>Size</th><th>Thick</th><th class="num">Qty</th><th class="num">NA</th><th class="num">Wt(Ton)</th></tr></thead>
              <tbody>${itemRows || `<tr><td colspan="6" style="text-align:center;color:#9295a8;">No items found.</td></tr>`}</tbody>
              <tfoot><tr><td colspan="3" style="text-align:right;color:#8a8da0;">Total</td><td class="num">${totalQty}</td><td class="num">${totalNa.toFixed(3)}</td><td class="num">${totalWt.toFixed(3)}</td></tr></tfoot>
            </table>
          </div>`;
        })
        .join("");

      const html = `<!DOCTYPE html><html><head><title>${title}</title><style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; color: #1c1e26; }
        h1 { font-size: 18px; border-bottom: 2px solid #14161f; padding-bottom: 10px; }
        .sub { color: #9295a8; font-size: 12px; margin-bottom: 20px; }
        .order-section { border: 1px solid #dee2e6; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; page-break-inside: avoid; }
        .order-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eceef4; padding-bottom: 10px; margin-bottom: 12px; }
        .order-id { font-family: monospace; font-weight: 700; color: #b5620f; font-size: 14px; }
        .order-status { background: #f1f2f6; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .details-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; margin-bottom: 10px; }
        .details-grid div { padding: 4px 0; border-bottom: 1px solid #f4f4f7; }
        .details-grid strong { color: #5b5f72; margin-right: 5px; }
        .remark { font-size: 12px; background: #f6f7fb; padding: 8px 10px; border-radius: 8px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #dee2e6; padding: 6px 8px; text-align: left; }
        thead { background: #14161f; color: #fff; }
        td.num, th.num { text-align: right; }
        .badge { font-size: 10px; background: #fff4de; color: #b5620f; padding: 1px 6px; border-radius: 10px; }
        .badge.blue { background: #e8f1ff; color: #1d5fc7; }
        .disp { color: #1a8a4c; font-weight: 700; }
        .pend { color: #c23c33; font-weight: 700; }
        @media print { #printBtn { display: none; } .order-section { page-break-after: always; } .order-section:last-child { page-break-after: auto; } }
      </style></head><body>
        <h1>${title}</h1>
        <div class="sub">Generated ${formatDate(new Date())} — ${toPrint.length} order(s)</div>
        ${sectionsHtml}
        <div style="text-align:center; margin-top:20px;">
          <button id="printBtn" onclick="window.print()" style="padding:10px 22px; font-size:15px; cursor:pointer;">Print / Save as PDF</button>
        </div>
      </body></html>`;
      const win = window.open("", title, "width=950,height=850");
      win.document.write(html);
      win.document.close();
    } catch (err) {
      alert("Failed to build detailed print: " + err.message);
    } finally {
      setPrintingDetailed(false);
    }
  }

  async function handlePrint(orderId) {
    setPrintingId(orderId);
    try {
      await printOrder(orderId);
    } finally {
      setPrintingId(null);
    }
  }

  function exportCsv() {
    const headers = [
      "Order ID", "Date", "Party Name", "Brand", "Destination", "Sales",
      "Qty", "Dispatched", "Pending", "Wt(Ton)", "User", "Appr. Date", "Plan Date", "Status",
      "Bill No", "Indent No", "Indent Date",
      "Bill Amt",
    ];
    const rows = filtered.map((o) => {
      const dispatched = dispatchedMap[o.order_id] || 0;
      const pending = Math.max(0, (Number(o.total_qty) || 0) - dispatched);
      return [
        o.order_id, formatDate(o.order_date), o.party_name, o.brand || "-", o.destination || "-",
        o.sales_person || "-", o.total_qty, dispatched, pending, o.total_weight, o.created_by || "-",
        formatDate(o.approved_at), formatDate(o.plan_dispatch_date), o.status,
        o.bill_no || "-", o.client_order_no || "-", o.indent_date ? formatDate(o.indent_date) : "-",
        o.bill_amount || "-",
      ];
    });
    const csv = "﻿" + [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Approved_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="pk-root">
      <style>{`
        .pk-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .pk-filterbar {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px;
          padding: 18px 20px; margin-bottom: 16px;
          display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap;
        }
        .pk-filter-item { flex: 1; min-width: 170px; }
        .pk-date-label { display: block; font-size: 11px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .pk-date-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 11px; font-size: 13px; }
        .pk-actions-row { display: flex; gap: 8px; }
        .pk-btn {
          border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap;
        }
        .pk-btn-reset { background: #f1f2f6; color: #4a4d5c; }
        .pk-btn-sort-active { background: #e8f1ff; color: #1d5fc7; }
        .pk-print-btn { border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
        .pk-print-detailed-btn { border: 1px solid #c3e6cc; background: #eafaf1; color: #1a8a4c; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
        .pk-print-detailed-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .pk-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .pk-csv-btn {
          border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c;
          border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px;
          cursor: pointer; display: flex; align-items: center; gap: 7px;
        }
        .pk-count { font-size: 12.5px; color: #9295a8; }
        .pk-search {
          display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee;
          border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8;
        }
        .pk-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .pk-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .pk-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.pk-table { width: 100%; border-collapse: collapse; min-width: 1220px; font-size: 13px; }
        .pk-table thead th {
          position: sticky; top: 0; z-index: 5; background: #14161f; color: #fff; text-align: left;
          padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .pk-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; font-size: 13.5px; }
        .pk-table tbody tr:hover { background: #fbfbfd; }
        .pk-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .pk-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .pk-empty-cell { color: #c3c5d1; }
        .pk-plandate { cursor: pointer; }
        .pk-qty-plain { font-family: 'IBM Plex Mono', monospace; }
        .pk-qty-split { font-size: 11.5px; line-height: 1.5; }
        .pk-qty-split .pk-qty-total { font-weight: 700; color: #1c1e26; }
        .pk-qty-split .pk-qty-disp { color: #1a8a4c; font-weight: 700; }
        .pk-qty-split .pk-qty-pend { color: #c23c33; font-weight: 700; }

        .pk-actioncell { display: flex; align-items: center; gap: 6px; }
        .pk-iconbtn {
          border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .pk-iconbtn:hover { background: #f6f7fb; }
        .pk-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pk-close-btn {
          border: 1px solid #f3c6c3; background: #fdeceb; color: #c23c33; border-radius: 9px; padding: 7px 12px;
          font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .pk-close-btn:hover { background: #fbd8d6; }

        .pk-loading, .pk-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .pk-spin { animation: pk-spin-anim 0.9s linear infinite; }
        @keyframes pk-spin-anim { to { transform: rotate(360deg); } }
        .pk-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        @media (max-width: 900px) {
          .pk-table-scroll { overflow-x: visible; }
          table.pk-table, table.pk-table thead, table.pk-table tbody, table.pk-table tr, table.pk-table td { display: block; width: 100%; }
          table.pk-table { min-width: 0; }
          table.pk-table thead { display: none; }
          table.pk-table tr {
            border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0;
            box-shadow: 0 2px 6px rgba(20,22,35,0.04);
          }
          table.pk-table td {
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
            padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right;
          }
          table.pk-table td:last-child { border-bottom: none; }
          table.pk-table td::before {
            content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px;
            text-transform: uppercase; letter-spacing: 0.04em; text-align: left;
          }
          .pk-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="pk-filterbar">
        <div className="pk-filter-item">
          <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        </div>
        <div className="pk-filter-item">
          <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        </div>
        <div className="pk-filter-item">
          <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        </div>
        <div className="pk-filter-item">
          <label className="pk-date-label">Approval Date From</label>
          <input type="date" className="pk-date-input" value={apprFromDate} onChange={(e) => setApprFromDate(e.target.value)} />
        </div>
        <div className="pk-filter-item">
          <label className="pk-date-label">Approval Date To</label>
          <input type="date" className="pk-date-input" value={apprToDate} onChange={(e) => setApprToDate(e.target.value)} />
        </div>
        <div className="pk-actions-row">
          <button className={`pk-btn ${sortAlpha ? "pk-btn-sort-active" : "pk-btn-reset"}`} onClick={() => setSortAlpha((s) => !s)}>
            <ArrowDownAZ size={14} /> {sortAlpha ? "Sorted A-Z" : "Sort A-Z"}
          </button>
          <button className="pk-btn pk-btn-reset" onClick={resetFilters}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="pk-toolbar">
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pk-csv-btn" onClick={exportCsv}>
            <FileSpreadsheet size={15} /> Export to CSV
          </button>
          <button className="pk-print-btn" onClick={printSelected}>
            <Printer size={15} /> {selectedIds.size > 0 ? `Print Selected (${selectedIds.size})` : "Print All"}
          </button>
          <button className="pk-print-detailed-btn" onClick={printSelectedDetailed} disabled={printingDetailed}>
            <Printer size={15} /> {printingDetailed ? "Preparing..." : selectedIds.size > 0 ? `Print Full Details (${selectedIds.size})` : "Print All (Full Details)"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="pk-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="pk-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="pk-error">{errorMsg}</div>}

      <div className="pk-table-card">
        {loading ? (
          <div className="pk-loading"><Loader2 size={22} className="pk-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="pk-nodata">No records found.</div>
        ) : (
          <div className="pk-table-scroll">
            <table className="pk-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th>Order ID</th><th>Order Date</th><th>Party Name</th><th>Brand</th><th>Destination</th>
                  <th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>User</th>
                  <th>Indent No</th><th>Indent Date</th>
                  <th>Appr. Date</th><th>Plan Date</th><th>Status</th>
                  <th>Bill No</th><th>Bill Amt (₹)</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const badgeStyle = STATUS_STYLES[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                  const dispatched = dispatchedMap[o.order_id] || 0;
                  const pending = Math.max(0, (Number(o.total_qty) || 0) - dispatched);
                  return (
                    <tr key={o.order_id}>
                      <td data-label="Select">
                        <input type="checkbox" checked={selectedIds.has(o.order_id)} onChange={() => toggleSelect(o.order_id)} />
                      </td>
                      <td data-label="Order ID"><span className="pk-oid">{o.order_id}</span></td>
                      <td data-label="Order Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Qty">
                        {dispatched > 0 ? (
                          <div className="pk-qty-split">
                            <div className="pk-qty-total">{o.total_qty} total</div>
                            <div className="pk-qty-disp">{dispatched} dispatched</div>
                            <div className="pk-qty-pend">{pending} pending</div>
                          </div>
                        ) : (
                          <span className="pk-qty-plain">{o.total_qty}</span>
                        )}
                      </td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="User">{o.created_by || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Indent No">{o.client_order_no || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Indent Date">{o.indent_date ? formatDate(o.indent_date) : <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Appr. Date">{formatDate(o.approved_at)}</td>
                      <td data-label="Plan Date">
                        <span
                          className="pk-plandate"
                          onClick={() => setPlanDateTarget({ orderId: o.order_id, existingDate: o.plan_dispatch_date })}
                          title="Click to set/edit dispatch date"
                        >
                          {o.plan_dispatch_date
                            ? <span className="pk-badge" style={{ background: "#eafaf1", color: "#1a8a4c" }}>{formatDate(o.plan_dispatch_date)}</span>
                            : <span className="pk-badge" style={{ background: "#fff4de", color: "#b5620f" }}>Set Date</span>}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className="pk-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
                          {o.status}
                        </span>
                      </td>
                      <td data-label="Bill No">{o.bill_no || <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Bill Amt">{o.bill_amount ? `₹${Number(o.bill_amount).toLocaleString("en-IN")}` : <span className="pk-empty-cell">-</span>}</td>
                      <td data-label="Action">
                        <div className="pk-actioncell">
                          <button className="pk-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          <button
                            className="pk-iconbtn"
                            title="Print Order"
                            disabled={printingId === o.order_id}
                            onClick={() => handlePrint(o.order_id)}
                          >
                            {printingId === o.order_id ? <Loader2 size={14} className="pk-spin" /> : <Printer size={14} />}
                          </button>
                          <button className="pk-close-btn" title="Close order manually — cancels the pending qty" onClick={() => setCloseOrder(o)}>
                            <Lock size={13} /> Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderItemsModal orderId={viewOrderId} onClose={() => setViewOrderId(null)} />

      <PlanDateModal
        open={!!planDateTarget}
        orderId={planDateTarget?.orderId}
        existingDate={planDateTarget?.existingDate}
        currentUser={currentUser}
        onClose={() => setPlanDateTarget(null)}
        onSaved={() => { setPlanDateTarget(null); loadOrders(); }}
      />

      {closeOrder && (
        <CloseOrderModal
          order={closeOrder}
          currentUser={currentUser}
          onClose={() => setCloseOrder(null)}
          onClosed={() => { setCloseOrder(null); loadOrders(); }}
        />
      )}
    </div>
  );
}
