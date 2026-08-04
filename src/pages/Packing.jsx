import { useEffect, useMemo, useState } from "react";
import { Eye, RotateCcw, FileSpreadsheet, Loader2, Search, PackageCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import OrderItemsModal from "../components/ui/OrderItemsModal";

const STATUSES = ["Picked"];
const STATUS_STYLES = { Picked: { bg: "#e8f1ff", color: "#1d5fc7" } };

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function Packing() {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");

  const [viewOrderId, setViewOrderId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);

  async function loadOrders() {
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

  async function confirmPacked() {
    const orderId = confirmTarget;
    setConfirmTarget(null);
    const { error } = await supabase.from("orders").update({ status: "Ready to Ship" }).eq("order_id", orderId);
    if (error) setErrorMsg("Failed to update: " + error.message);
    else loadOrders();
  }

  function exportCsv() {
    const headers = ["Order ID", "Date", "Party Name", "Brand", "Destination", "Sales", "Qty", "Wt(Ton)", "User", "Status"];
    const rows = filtered.map((o) => [
      o.order_id, formatDate(o.order_date), o.party_name, o.brand || "-", o.destination || "-",
      o.sales_person || "-", o.total_qty, o.total_weight, o.created_by || "-", o.status,
    ]);
    const csv = "\uFEFF" + [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Packing_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="pc-root">
      <style>{`
        .pc-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .pc-filterbar {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px;
          padding: 18px 20px; margin-bottom: 16px;
          display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap;
        }
        .pc-filter-item { flex: 1; min-width: 170px; }
        .pc-btn {
          border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px;
          cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap;
        }
        .pc-btn-reset { background: #f1f2f6; color: #4a4d5c; }

        .pc-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .pc-csv-btn {
          border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c;
          border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px;
          cursor: pointer; display: flex; align-items: center; gap: 7px;
        }
        .pc-count { font-size: 12.5px; color: #9295a8; }
        .pc-search {
          display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee;
          border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8;
        }
        .pc-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .pc-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .pc-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.pc-table { width: 100%; border-collapse: collapse; min-width: 950px; font-size: 13.5px; }
        .pc-table thead th {
          position: sticky; top: 0; background: #14161f; color: #fff; text-align: left;
          padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;
        }
        .pc-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .pc-table tbody tr:hover { background: #fbfbfd; }
        .pc-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .pc-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .pc-empty-cell { color: #c3c5d1; }

        .pc-actioncell { display: flex; align-items: center; gap: 8px; }
        .pc-iconbtn {
          border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .pc-iconbtn:hover { background: #f6f7fb; }
        .pc-packed-btn {
          border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer;
          box-shadow: 0 4px 12px rgba(245,166,35,0.28); display: flex; align-items: center; gap: 7px;
        }

        .pc-loading, .pc-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .pc-spin { animation: pc-spin-anim 0.9s linear infinite; }
        @keyframes pc-spin-anim { to { transform: rotate(360deg); } }
        .pc-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        @media (max-width: 900px) {
          .pc-table-scroll { overflow-x: visible; }
          table.pc-table, table.pc-table thead, table.pc-table tbody, table.pc-table tr, table.pc-table td { display: block; width: 100%; }
          table.pc-table { min-width: 0; }
          table.pc-table thead { display: none; }
          table.pc-table tr { border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          table.pc-table td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right; }
          table.pc-table td:last-child { border-bottom: none; }
          table.pc-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
          .pc-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="pc-filterbar">
        <div className="pc-filter-item">
          <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        </div>
        <div className="pc-filter-item">
          <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        </div>
        <div className="pc-filter-item">
          <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        </div>
        <button className="pc-btn pc-btn-reset" onClick={resetFilters}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <div className="pc-toolbar">
        <button className="pc-csv-btn" onClick={exportCsv}>
          <FileSpreadsheet size={15} /> Export to CSV
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="pc-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="pc-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="pc-error">{errorMsg}</div>}

      <div className="pc-table-card">
        {loading ? (
          <div className="pc-loading"><Loader2 size={22} className="pc-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="pc-nodata">No records found.</div>
        ) : (
          <div className="pc-table-scroll">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Order ID</th><th>Date</th><th>Party Name</th><th>Brand</th><th>Destination</th>
                  <th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>Status</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const badgeStyle = STATUS_STYLES[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                  return (
                    <tr key={o.order_id}>
                      <td data-label="Order ID"><span className="pc-oid">{o.order_id}</span></td>
                      <td data-label="Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="pc-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="pc-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="pc-empty-cell">-</span>}</td>
                      <td data-label="Qty">{o.total_qty}</td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="Status">
                        <span className="pc-badge" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>{o.status}</span>
                      </td>
                      <td data-label="Action">
                        <div className="pc-actioncell">
                          <button className="pc-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          <button className="pc-packed-btn" onClick={() => setConfirmTarget(o.order_id)}>
                            <PackageCheck size={14} /> Packed 📦
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

      <ConfirmDialog
        open={!!confirmTarget}
        title="Confirm Update"
        message={`Mark ${confirmTarget} as Packed and move to Ready to Ship?`}
        confirmLabel="Yes, Packed"
        onConfirm={confirmPacked}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
