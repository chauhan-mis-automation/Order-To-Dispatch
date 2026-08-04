import { useEffect, useMemo, useState } from "react";
import {
  Eye, Printer, ChevronDown, RotateCcw, FileSpreadsheet, Loader2, Search,
  PackageCheck, AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import AuthModal from "../components/ui/AuthModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import PlanDateModal from "../components/ui/PlanDateModal";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import { printOrder } from "../utils/printOrder";

const STATUSES = ["Confirmed"];

const STATUS_STYLES = {
  Confirmed: { bg: "#e8f1ff", color: "#1d5fc7" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function Planning() {
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

  const [confirmTarget, setConfirmTarget] = useState(null); // orderId pending "Picked" confirm
  const [pendingAction, setPendingAction] = useState(null); // { orderId, newStatus } needing auth
  const [authOpen, setAuthOpen] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [planDateTarget, setPlanDateTarget] = useState(null); // { orderId, existingDate }

  async function loadOrders() {
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
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadOrders();
    });
  }, []);

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

  // "Picked (Stock OK)" — quick confirm, no login needed (matches old app)
  function requestPicked(orderId) {
    setOpenMenuId(null);
    setConfirmTarget(orderId);
  }

  async function confirmPicked() {
    const orderId = confirmTarget;
    setConfirmTarget(null);
    const { error } = await supabase.from("orders").update({ status: "Picked" }).eq("order_id", orderId);
    if (error) setErrorMsg("Failed to update: " + error.message);
    else loadOrders();
  }

  // "Missing (Indent Raised)" — requires login confirmation, same as Verification actions
  function requestIndent(orderId) {
    setOpenMenuId(null);
    setPendingAction({ orderId, newStatus: "Indent Raised" });
    setAuthOpen(true);
  }

  async function handleAuthSuccess(user) {
    if (!pendingAction) { setAuthOpen(false); return; }
    const { orderId, newStatus } = pendingAction;
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus, approved_by: user.name, approved_at: new Date().toISOString() })
      .eq("order_id", orderId);
    setAuthOpen(false);
    setPendingAction(null);
    if (error) setErrorMsg("Failed to update: " + error.message);
    else loadOrders();
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
        table.pl-table { width: 100%; border-collapse: collapse; min-width: 1200px; font-size: 13px; }
        .pl-table thead th {
          position: sticky; top: 0; background: #14161f; color: #fff; text-align: left;
          padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .pl-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; font-size: 13.5px; }
        .pl-table tbody tr:hover { background: #fbfbfd; }
        .pl-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .pl-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .pl-empty-cell { color: #c3c5d1; }
        .pl-plandate { cursor: pointer; }

        .pl-actioncell { display: flex; align-items: center; gap: 6px; position: relative; }
        .pl-iconbtn {
          border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .pl-iconbtn:hover { background: #f6f7fb; }
        .pl-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pl-menu-btn {
          border: none; background: #1d5fc7; color: #fff; border-radius: 9px; padding: 8px 12px;
          font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;
        }
        .pl-menu-panel {
          position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e6e8f0;
          border-radius: 12px; box-shadow: 0 14px 30px rgba(20,22,35,0.14); z-index: 30; min-width: 200px; padding: 6px;
        }
        .pl-menu-item {
          display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 8px; font-size: 13px;
          cursor: pointer; font-weight: 600;
        }
        .pl-menu-item:hover { background: #f6f7fb; }
        .pl-menu-picked { color: #1a8a4c; }
        .pl-menu-indent { color: #c23c33; }

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
                      <td data-label="Order ID"><span className="pl-oid">{o.order_id}</span></td>
                      <td data-label="Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="pl-empty-cell">-</span>}</td>
                      <td data-label="Qty">{o.total_qty}</td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="User">{o.created_by || <span className="pl-empty-cell">-</span>}</td>
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
                      <td data-label="Truck No">{o.truck_no || <span className="pl-empty-cell">-</span>}</td>
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
                          <button
                            className="pl-menu-btn"
                            onClick={() => setOpenMenuId(openMenuId === o.order_id ? null : o.order_id)}
                          >
                            Picking Status <ChevronDown size={13} />
                          </button>
                          {openMenuId === o.order_id && (
                            <div className="pl-menu-panel" onMouseLeave={() => setOpenMenuId(null)}>
                              <div className="pl-menu-item pl-menu-picked" onClick={() => requestPicked(o.order_id)}>
                                <PackageCheck size={15} /> Picked (Stock OK)
                              </div>
                              <div className="pl-menu-item pl-menu-indent" onClick={() => requestIndent(o.order_id)}>
                                <AlertTriangle size={15} /> Missing (Indent)
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

      <PlanDateModal
        open={!!planDateTarget}
        orderId={planDateTarget?.orderId}
        existingDate={planDateTarget?.existingDate}
        onClose={() => setPlanDateTarget(null)}
        onSaved={() => { setPlanDateTarget(null); loadOrders(); }}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        title="Confirm Update"
        message={`Mark ${confirmTarget} as Picked (Stock OK)?`}
        confirmLabel="Yes, Picked"
        onConfirm={confirmPicked}
        onCancel={() => setConfirmTarget(null)}
      />

      <AuthModal
        open={authOpen}
        onClose={() => { setAuthOpen(false); setPendingAction(null); }}
        onSuccess={handleAuthSuccess}
        title="Confirm Status Change"
        subtitle={pendingAction ? `Mark ${pendingAction.orderId} as "${pendingAction.newStatus}"` : ""}
        submitLabel="Confirm"
      />
    </div>
  );
}
