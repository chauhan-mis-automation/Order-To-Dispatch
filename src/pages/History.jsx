import { useEffect, useMemo, useState } from "react";
import {
  Eye, ClipboardList, RotateCcw, FileSpreadsheet, Loader2, Search, BarChart3,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import DispatchLogModal from "../components/ui/DispatchLogModal";
import PartySummaryModal from "../components/ui/PartySummaryModal";

const ALL_STATUSES = ["Pending", "Confirmed", "Indent Raised", "Picked", "Ready to Ship", "Dispatched", "On Hold", "Cancelled"];

const STATUS_STYLES = {
  Pending: { bg: "#fdeceb", color: "#c23c33" },
  Confirmed: { bg: "#e8f1ff", color: "#1d5fc7" },
  "Indent Raised": { bg: "#f1f2f6", color: "#4a4d5c" },
  Picked: { bg: "#e8f1ff", color: "#1d5fc7" },
  "Ready to Ship": { bg: "#f3e8ff", color: "#8b3fd6" },
  Dispatched: { bg: "#eafaf1", color: "#1a8a4c" },
  Cancelled: { bg: "#f1f2f6", color: "#4a4d5c" },
  "On Hold": { bg: "#fff4de", color: "#b5620f" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function History() {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [viewOrderId, setViewOrderId] = useState(null);
  const [varianceOrderId, setVarianceOrderId] = useState(null);
  const [showSummary, setShowSummary] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setErrorMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
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
      if (startDate && o.order_date < startDate) return false;
      if (endDate && o.order_date > endDate) return false;
      if (partyFilter && o.party_name !== partyFilter) return false;
      if (salesFilter && o.sales_person !== salesFilter) return false;
      if (brandFilter && o.brand !== brandFilter) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.order_id} ${o.party_name} ${o.brand || ""} ${o.destination || ""} ${o.sales_person || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, startDate, endDate, partyFilter, salesFilter, brandFilter, statusFilter, search]);

  function resetFilters() {
    setStartDate(""); setEndDate(""); setPartyFilter(""); setSalesFilter("");
    setBrandFilter(""); setStatusFilter(""); setSearch("");
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
    link.download = `History_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const summaryOrders = useMemo(() => {
    if (!partyFilter) return [];
    return filtered.filter((o) => o.party_name === partyFilter);
  }, [filtered, partyFilter]);

  return (
    <div className="hs-root">
      <style>{`
        .hs-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .hs-filterbar {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px;
          padding: 18px 20px; margin-bottom: 16px;
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; align-items: end;
        }
        @media (max-width: 1100px) { .hs-filterbar { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 640px) { .hs-filterbar { grid-template-columns: repeat(2, 1fr); } }
        .hs-date-field label { display: block; font-size: 12.5px; font-weight: 600; color: #5b5f72; margin-bottom: 6px; }
        .hs-date-field input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; outline: none;
        }
        .hs-date-field input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .hs-filter-actions { display: flex; gap: 8px; grid-column: span 2; }
        @media (max-width: 640px) { .hs-filter-actions { grid-column: span 2; } }
        .hs-btn { flex: 1; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap; }
        .hs-btn-reset { background: #f1f2f6; color: #4a4d5c; }
        .hs-btn-summary { background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; box-shadow: 0 4px 12px rgba(245,166,35,0.28); }
        .hs-btn-summary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }

        .hs-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .hs-csv-btn { border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c; border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 7px; }
        .hs-count { font-size: 12.5px; color: #9295a8; }
        .hs-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee; border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8; }
        .hs-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .hs-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .hs-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.hs-table { width: 100%; border-collapse: collapse; min-width: 1150px; font-size: 13.5px; }
        .hs-table thead th { position: sticky; top: 0; background: #14161f; color: #fff; text-align: left; padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .hs-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .hs-table tbody tr:hover { background: #fbfbfd; }
        .hs-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .hs-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .hs-empty-cell { color: #c3c5d1; }

        .hs-actioncell { display: flex; align-items: center; gap: 6px; }
        .hs-iconbtn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .hs-iconbtn:hover { background: #f6f7fb; }
        .hs-variance-btn {
          border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 9px; padding: 7px 12px;
          font-weight: 700; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }

        .hs-loading, .hs-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .hs-spin { animation: hs-spin-anim 0.9s linear infinite; }
        @keyframes hs-spin-anim { to { transform: rotate(360deg); } }
        .hs-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        @media (max-width: 900px) {
          .hs-table-scroll { overflow-x: visible; }
          table.hs-table, table.hs-table thead, table.hs-table tbody, table.hs-table tr, table.hs-table td { display: block; width: 100%; }
          table.hs-table { min-width: 0; }
          table.hs-table thead { display: none; }
          table.hs-table tr { border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          table.hs-table td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right; }
          table.hs-table td:last-child { border-bottom: none; }
          table.hs-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
          .hs-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="hs-filterbar">
        <div className="hs-date-field">
          <label>From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="hs-date-field">
          <label>To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        <ComboBox label="Status" value={statusFilter} onChange={setStatusFilter} options={ALL_STATUSES} placeholder="All Status" />

        <div className="hs-filter-actions" style={{ gridColumn: "1 / -1" }}>
          <button className="hs-btn hs-btn-reset" onClick={resetFilters}><RotateCcw size={14} /> Reset</button>
          <button className="hs-btn hs-btn-summary" disabled={!partyFilter} onClick={() => setShowSummary(true)}>
            <BarChart3 size={14} /> Summary
          </button>
        </div>
      </div>

      <div className="hs-toolbar">
        <button className="hs-csv-btn" onClick={exportCsv}><FileSpreadsheet size={15} /> Export to CSV</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="hs-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="hs-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="hs-error">{errorMsg}</div>}

      <div className="hs-table-card">
        {loading ? (
          <div className="hs-loading"><Loader2 size={22} className="hs-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="hs-nodata">No records found.</div>
        ) : (
          <div className="hs-table-scroll">
            <table className="hs-table">
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
                      <td data-label="Order ID"><span className="hs-oid">{o.order_id}</span></td>
                      <td data-label="Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Qty">{o.total_qty}</td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="User">{o.created_by || <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Appr. Date">{formatDate(o.approved_at)}</td>
                      <td data-label="Plan Date">{formatDate(o.plan_dispatch_date)}</td>
                      <td data-label="Status">
                        <span className="hs-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>{o.status}</span>
                      </td>
                      <td data-label="Truck No">{o.truck_no || <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Bill Amt">{o.bill_amount ? `₹${Number(o.bill_amount).toLocaleString("en-IN")}` : <span className="hs-empty-cell">-</span>}</td>
                      <td data-label="Action">
                        <div className="hs-actioncell">
                          <button className="hs-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          {o.status === "Dispatched" && (
                            <button className="hs-variance-btn" onClick={() => setVarianceOrderId(o.order_id)}>
                              <ClipboardList size={13} /> Variance
                            </button>
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
      <DispatchLogModal orderId={varianceOrderId} onClose={() => setVarianceOrderId(null)} />
      {showSummary && (
        <PartySummaryModal party={partyFilter} orders={summaryOrders} onClose={() => setShowSummary(false)} />
      )}
    </div>
  );
}
