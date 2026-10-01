import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Printer, RotateCcw, FileSpreadsheet, Loader2, Search, Lock,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import PlanDateModal from "../components/ui/PlanDateModal";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import CloseOrderModal from "../components/ui/CloseOrderModal";
import { printOrder } from "../utils/printOrder";

// Same superset as Approved — kept broad so any order still sitting in a
// legacy "Picked"/"Ready to Ship" state (from before the flow simplification)
// doesn't get orphaned out of Planning either.
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

export default function Planning({ currentUser }) {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [dispatchedMap, setDispatchedMap] = useState({});

  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");

  const [viewOrderId, setViewOrderId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [planDateTarget, setPlanDateTarget] = useState(null); // { orderId, existingDate }
  const [closeOrder, setCloseOrder] = useState(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", STATUSES)
      .not("plan_dispatch_date", "is", null)
      .order("plan_dispatch_date", { ascending: true });

    if (error) setErrorMsg(error.message);
    else setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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
    return orders.filter((o) => {
      if (partyFilter && o.party_name !== partyFilter) return false;
      if (salesFilter && o.sales_person !== salesFilter) return false;
      if (brandFilter && o.brand !== brandFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.order_id} ${o.party_name} ${o.brand || ""} ${o.destination || ""} ${o.sales_person || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, partyFilter, salesFilter, brandFilter, search]);

  function resetFilters() {
    setPartyFilter(""); setSalesFilter(""); setBrandFilter(""); setSearch("");
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
    link.download = `Planning_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="pl-root">
      <style>{`
        .pl-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .pl-filterbar {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px;
          padding: 18px 20px; margin-bottom: 16px;
          display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap;
        }
        .pl-filter-item { flex: 1; min-width: 170px; }
        .pl-btn {
          border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap;
        }
        .pl-btn-reset { background: #f1f2f6; color: #4a4d5c; }

        .pl-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .pl-csv-btn {
          border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c;
          border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px;
          cursor: pointer; display: flex; align-items: center; gap: 7px;
        }
        .pl-count { font-size: 12.5px; color: #9295a8; }
        .pl-search {
          display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee;
          border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8;
        }
        .pl-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .pl-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .pl-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.pl-table { width: 100%; border-collapse: collapse; min-width: 1220px; font-size: 13px; }
        .pl-table thead th {
          position: sticky; top: 0; z-index: 5; background: #14161f; color: #fff; text-align: left;
          padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .pl-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; font-size: 13.5px; }
        .pl-table tbody tr:hover { background: #fbfbfd; }
        .pl-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .pl-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .pl-empty-cell { color: #c3c5d1; }
        .pl-plandate { cursor: pointer; }
        .pl-qty-plain { font-family: 'IBM Plex Mono', monospace; }
        .pl-qty-split { font-size: 11.5px; line-height: 1.5; }
        .pl-qty-split .pl-qty-total { font-weight: 700; color: #1c1e26; }
        .pl-qty-split .pl-qty-disp { color: #1a8a4c; font-weight: 700; }
        .pl-qty-split .pl-qty-pend { color: #c23c33; font-weight: 700; }

        .pl-actioncell { display: flex; align-items: center; gap: 6px; }
        .pl-iconbtn {
          border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .pl-iconbtn:hover { background: #f6f7fb; }
        .pl-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pl-close-btn {
          border: 1px solid #f3c6c3; background: #fdeceb; color: #c23c33; border-radius: 9px; padding: 7px 12px;
          font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }
        .pl-close-btn:hover { background: #fbd8d6; }

        .pl-loading, .pl-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .pl-spin { animation: pl-spin-anim 0.9s linear infinite; }
        @keyframes pl-spin-anim { to { transform: rotate(360deg); } }
        .pl-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        @media (max-width: 900px) {
          .pl-table-scroll { overflow-x: visible; }
          table.pl-table, table.pl-table thead, table.pl-table tbody, table.pl-table tr, table.pl-table td { display: block; width: 100%; }
          table.pl-table { min-width: 0; }
          table.pl-table thead { display: none; }
          table.pl-table tr {
            border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0;
            box-shadow: 0 2px 6px rgba(20,22,35,0.04);
          }
          table.pl-table td {
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
            padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right;
          }
          table.pl-table td:last-child { border-bottom: none; }
          table.pl-table td::before {
            content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px;
            text-transform: uppercase; letter-spacing: 0.04em; text-align: left;
          }
          .pl-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="pl-filterbar">
        <div className="pl-filter-item">
          <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        </div>
        <div className="pl-filter-item">
          <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        </div>
        <div className="pl-filter-item">
          <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        </div>
        <button className="pl-btn pl-btn-reset" onClick={resetFilters}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="pl-toolbar">
        <button className="pl-csv-btn" onClick={exportCsv}>
          <FileSpreadsheet size={15} /> Export to CSV
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="pl-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="pl-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="pl-error">{errorMsg}</div>}

      <div className="pl-table-card">
        {loading ? (
          <div className="pl-loading"><Loader2 size={22} className="pl-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="pl-nodata">No records found.</div>
        ) : (
          <div className="pl-table-scroll">
            <table className="pl-table">
              <thead>
                <tr>
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
                      <td data-label="Order ID"><span className="pl-oid">{o.order_id}</span></td>
                      <td data-label="Order Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Qty">
                        {dispatched > 0 ? (
                          <div className="pl-qty-split">
                            <div className="pl-qty-total">{o.total_qty} total</div>
                            <div className="pl-qty-disp">{dispatched} dispatched</div>
                            <div className="pl-qty-pend">{pending} pending</div>
                          </div>
                        ) : (
                          <span className="pl-qty-plain">{o.total_qty}</span>
                        )}
                      </td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="User">{o.created_by || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Indent No">{o.client_order_no || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Indent Date">{o.indent_date ? formatDate(o.indent_date) : <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Appr. Date">{formatDate(o.approved_at)}</td>
                      <td data-label="Plan Date">
                        <span
                          className="pl-plandate"
                          onClick={() => setPlanDateTarget({ orderId: o.order_id, existingDate: o.plan_dispatch_date })}
                          title="Click to set/edit dispatch date"
                        >
                          {o.plan_dispatch_date
                            ? <span className="pl-badge" style={{ background: "#eafaf1", color: "#1a8a4c" }}>{formatDate(o.plan_dispatch_date)}</span>
                            : <span className="pl-badge" style={{ background: "#fff4de", color: "#b5620f" }}>Set Date</span>}
                        </span>
                      </td>
                      <td data-label="Status">
                        <span className="pl-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
                          {o.status}
                        </span>
                      </td>
                      <td data-label="Bill No">{o.bill_no || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Bill Amt">{o.bill_amount ? `₹${Number(o.bill_amount).toLocaleString("en-IN")}` : <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Action">
                        <div className="pl-actioncell">
                          <button className="pl-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          <button
                            className="pl-iconbtn"
                            title="Print Order"
                            disabled={printingId === o.order_id}
                            onClick={() => handlePrint(o.order_id)}
                          >
                            {printingId === o.order_id ? <Loader2 size={14} className="pl-spin" /> : <Printer size={14} />}
                          </button>
                          <button className="pl-close-btn" title="Close order manually — cancels the pending qty" onClick={() => setCloseOrder(o)}>
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
