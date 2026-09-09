import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Pencil, ChevronDown, RotateCcw, FileSpreadsheet, Loader2, Search,
  CheckCircle2, PauseCircle, XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import OrderItemsModal from "../components/ui/OrderItemsModal";

const STATUSES = ["Pending", "Indent Raised", "On Hold"];

const STATUS_STYLES = {
  Pending: { bg: "#fdeceb", color: "#c23c33" },
  "Indent Raised": { bg: "#f1f2f6", color: "#4a4d5c" },
  "On Hold": { bg: "#fff4de", color: "#b5620f" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB").replace(/\//g, "/");
}

export default function Verification({ currentUser, onEditOrder }) {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");

  const [openMenuId, setOpenMenuId] = useState(null);
  const [viewOrderId, setViewOrderId] = useState(null);

  const [pendingAction, setPendingAction] = useState(null); // { orderId, newStatus }
  const [stockWarnings, setStockWarnings] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", STATUSES)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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
    setPartyFilter("");
    setSalesFilter("");
    setBrandFilter("");
    setSearch("");
  }

  async function requestAction(orderId, newStatus) {
    setOpenMenuId(null);
    setPendingAction({ orderId, newStatus });
    setStockWarnings([]);

    if (newStatus === "Confirmed") {
      const [{ data: items }, { data: fgRows }] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("fg_stock").select("*"),
      ]);
      const warnings = (items || []).map((it) => {
        const stockRow = (fgRows || []).find(
          (f) => f.item_name === it.item_name && (f.brand || "") === (it.brand || "") && f.size === it.size && f.thickness === it.thickness
        );
        const available = stockRow ? Number(stockRow.qty_available) : 0;
        return { ...it, available };
      }).filter((it) => Number(it.qty) > it.available);
      setStockWarnings(warnings);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    setActionBusy(true);
    const { orderId, newStatus } = pendingAction;

    try {
      const payload = { status: newStatus };
      if (newStatus === "Confirmed") {
        payload.approved_by = currentUser;
        payload.approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("orders").update(payload).eq("order_id", orderId);
      if (error) throw error;
      loadOrders();
    } catch (err) {
      setErrorMsg("Failed to update: " + err.message);
    } finally {
      setActionBusy(false);
      setPendingAction(null);
      setStockWarnings([]);
    }
  }

  function exportCsv() {
    const headers = [
      "Order ID", "Date", "Party Name", "Brand", "Destination", "Sales",
      "Qty", "Wt(Ton)", "User", "Appr. Date", "Plan Date", "Status", "Truck No", "Bill Amt",
    ];
    const rows = filtered.map((o) => [
      o.order_id, formatDate(o.order_date), o.party_name, o.brand || "-", o.destination || "-",
      o.sales_person || "-", o.total_qty, o.total_weight, o.created_by || "-",
      formatDate(o.approved_at), formatDate(o.plan_dispatch_date), o.status,
      o.truck_no || "-", o.bill_amount || "-",
    ]);
    const csv = "\uFEFF" + [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Verification_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="vf-root">
      <style>{`
        .vf-root { font-family: 'Inter', sans-serif; color: #1c1e26; }

        .vf-filterbar {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px;
          padding: 18px 20px; margin-bottom: 16px;
          display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap;
        }
        .vf-filter-item { flex: 1; min-width: 170px; }
        .vf-actions-row { display: flex; gap: 8px; }
        .vf-btn {
          border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .vf-btn:hover { transform: translateY(-1px); }
        .vf-btn-reset { background: #f1f2f6; color: #4a4d5c; }
        .vf-btn-summary {
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          box-shadow: 0 4px 12px rgba(245,166,35,0.28);
        }

        .vf-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .vf-csv-btn {
          border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c;
          border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px;
          cursor: pointer; display: flex; align-items: center; gap: 7px;
        }
        .vf-count { font-size: 12.5px; color: #9295a8; }
        .vf-search {
          display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee;
          border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8;
        }
        .vf-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .vf-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .vf-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.vf-table { width: 100%; border-collapse: collapse; min-width: 1150px; font-size: 13px; }
        .vf-table thead th {
          position: sticky; top: 0; background: #14161f; color: #fff; text-align: left;
          padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .vf-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; font-size: 13.5px; }
        .vf-table tbody tr:hover { background: #fbfbfd; }
        .vf-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .vf-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .vf-empty-cell { color: #c3c5d1; }

        .vf-actioncell { display: flex; align-items: center; gap: 6px; position: relative; }
        .vf-iconbtn {
          border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .vf-iconbtn:hover { background: #f6f7fb; }
        .vf-menu-btn {
          border: none; background: #14161f; color: #fff; border-radius: 9px; padding: 8px 12px;
          font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;
        }
        .vf-menu-panel {
          position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e6e8f0;
          border-radius: 12px; box-shadow: 0 14px 30px rgba(20,22,35,0.14); z-index: 30; min-width: 170px; padding: 6px;
        }
        .vf-menu-item {
          display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 8px; font-size: 13px;
          cursor: pointer; font-weight: 600;
        }
        .vf-menu-item:hover { background: #f6f7fb; }
        .vf-menu-approve { color: #1a8a4c; }
        .vf-menu-hold { color: #b5620f; }
        .vf-menu-cancel { color: #c23c33; }

        .vf-loading, .vf-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .vf-spin { animation: vf-spin-anim 0.9s linear infinite; }
        @keyframes vf-spin-anim { to { transform: rotate(360deg); } }
        .vf-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        /* ---------- Mobile: rows become cards ---------- */
        @media (max-width: 900px) {
          .vf-table-scroll { overflow-x: visible; }
          table.vf-table, table.vf-table thead, table.vf-table tbody, table.vf-table tr, table.vf-table td { display: block; width: 100%; }
          table.vf-table { min-width: 0; }
          table.vf-table thead { display: none; }
          table.vf-table tr {
            border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0;
            box-shadow: 0 2px 6px rgba(20,22,35,0.04);
          }
          table.vf-table td {
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
            padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right;
          }
          table.vf-table td:last-child { border-bottom: none; }
          table.vf-table td::before {
            content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px;
            text-transform: uppercase; letter-spacing: 0.04em; text-align: left;
          }
          .vf-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="vf-filterbar">
        <div className="vf-filter-item">
          <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        </div>
        <div className="vf-filter-item">
          <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        </div>
        <div className="vf-filter-item">
          <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        </div>
        <div className="vf-actions-row">
          <button className="vf-btn vf-btn-reset" onClick={resetFilters}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div className="vf-toolbar">
        <button className="vf-csv-btn" onClick={exportCsv}>
          <FileSpreadsheet size={15} /> Export to CSV
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="vf-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="vf-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="vf-error">{errorMsg}</div>}

      <div className="vf-table-card">
        {loading ? (
          <div className="vf-loading"><Loader2 size={22} className="vf-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="vf-nodata">No records found.</div>
        ) : (
          <div className="vf-table-scroll">
            <table className="vf-table">
              <thead>
                <tr>
                  <th>Order ID</th><th>Date</th><th>Party Name</th><th>Brand</th><th>Destination</th>
                  <th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>User</th><th>Appr. Date</th>
                  <th>Plan Date</th><th>Status</th><th>Truck No</th><th>Bill Amt (₹)</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const badgeStyle = STATUS_STYLES[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                  return (
                    <tr key={o.order_id}>
                      <td data-label="Order ID"><span className="vf-oid">{o.order_id}</span></td>
                      <td data-label="Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Qty">{o.total_qty}</td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="User">{o.created_by || <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Appr. Date">{formatDate(o.approved_at)}</td>
                      <td data-label="Plan Date">{formatDate(o.plan_dispatch_date)}</td>
                      <td data-label="Status">
                        <span className="vf-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
                          {o.status}
                        </span>
                      </td>
                      <td data-label="Truck No">{o.truck_no || <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Bill Amt">{o.bill_amount ? `₹${Number(o.bill_amount).toLocaleString("en-IN")}` : <span className="vf-empty-cell">-</span>}</td>
                      <td data-label="Action">
                        <div className="vf-actioncell">
                          <button className="vf-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          <button className="vf-iconbtn" title="Edit Order" onClick={() => onEditOrder && onEditOrder(o.order_id)}>
                            <Pencil size={14} />
                          </button>
                          <button
                            className="vf-menu-btn"
                            onClick={() => setOpenMenuId(openMenuId === o.order_id ? null : o.order_id)}
                          >
                            Action <ChevronDown size={13} />
                          </button>
                          {openMenuId === o.order_id && (
                            <div className="vf-menu-panel" onMouseLeave={() => setOpenMenuId(null)}>
                              <div className="vf-menu-item vf-menu-approve" onClick={() => requestAction(o.order_id, "Confirmed")}>
                                <CheckCircle2 size={15} /> Approve
                              </div>
                              <div className="vf-menu-item vf-menu-hold" onClick={() => requestAction(o.order_id, "On Hold")}>
                                <PauseCircle size={15} /> Hold
                              </div>
                              <div className="vf-menu-item vf-menu-cancel" onClick={() => requestAction(o.order_id, "Cancelled")}>
                                <XCircle size={15} /> Cancel
                              </div>
                            </div>
                          )}
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

      <ConfirmDialog
        open={!!pendingAction}
        title="Confirm Status Change"
        message={
          pendingAction ? (
            <>
              <div>{`Update ${pendingAction.orderId} to "${pendingAction.newStatus}"?`}</div>
              {stockWarnings.length > 0 && (
                <div style={{
                  marginTop: 12, background: "#fdeceb", color: "#c23c33", borderRadius: 10,
                  padding: "10px 12px", fontSize: 12, fontWeight: 600, textAlign: "left",
                }}>
                  ⚠️ Stock is short for {stockWarnings.length} item(s):
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: 18 }}>
                    {stockWarnings.map((w, i) => (
                      <li key={i}>{w.item_name} ({w.thickness}, {w.size}) — need {w.qty}, only {w.available} in FG Stock</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : ""
        }
        confirmLabel={actionBusy ? "Updating..." : "Confirm"}
        onConfirm={confirmPendingAction}
        onCancel={() => { setPendingAction(null); setStockWarnings([]); }}
      />
    </div>
  );
}
