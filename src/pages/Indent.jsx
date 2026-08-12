import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Factory, RotateCcw, FileSpreadsheet, Loader2, Search, Layers,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import ProductionJobModal from "../components/ui/ProductionJobModal";
import { computeMaterialRequirements } from "../utils/materialCalculator";

const STATUSES = ["Indent Raised"];
const STATUS_STYLES = { "Indent Raised": { bg: "#fdeceb", color: "#c23c33" } };
const JOB_STATUS_STYLES = {
  "Pending Material": { bg: "#fdeceb", color: "#c23c33" },
  "Ready to Schedule": { bg: "#fff4de", color: "#b5620f" },
  "Scheduled": { bg: "#f3e8ff", color: "#8b3fd6" },
  "In Production": { bg: "#e8f1ff", color: "#1d5fc7" },
  "QC Pending": { bg: "#fff4de", color: "#b5620f" },
  "Completed": { bg: "#eafaf1", color: "#1a8a4c" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function Indent() {
  const master = useMasterData();

  const [orders, setOrders] = useState([]);
  const [jobsByOrder, setJobsByOrder] = useState({}); // order_id -> job rows[]
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [partyFilter, setPartyFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");

  const [viewOrderId, setViewOrderId] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  const [combinedOpen, setCombinedOpen] = useState(false);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [combinedResults, setCombinedResults] = useState([]);

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
      setLoading(false);
      return;
    }
    setOrders(data || []);

    const orderIds = (data || []).map((o) => o.order_id);
    if (orderIds.length > 0) {
      const { data: jobs } = await supabase
        .from("production_jobs")
        .select("*")
        .in("order_id", orderIds)
        .neq("status", "Completed")
        .order("created_at", { ascending: false });
      const map = {};
      (jobs || []).forEach((j) => {
        if (!map[j.order_id]) map[j.order_id] = [];
        map[j.order_id].push(j);
      });
      setJobsByOrder(map);
    } else {
      setJobsByOrder({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

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

  async function openCombined() {
    setCombinedOpen(true);
    setCombinedLoading(true);
    const jobIds = filtered.flatMap((o) => (jobsByOrder[o.order_id] || []).map((j) => j.id));
    if (jobIds.length === 0) {
      setCombinedResults([]);
      setCombinedLoading(false);
      return;
    }
    const [itemsRes, bomRes] = await Promise.all([
      supabase.from("production_job_items").select("*").in("job_id", jobIds),
      supabase.from("item_bom").select("*, raw_materials(name, unit)"),
    ]);
    const jobItems = (itemsRes.data || []).map((it) => ({
      item_name: it.item_name, size: it.size, thickness: it.thickness, qty: it.qty,
    }));
    const results = computeMaterialRequirements(jobItems, bomRes.data || []);
    setCombinedResults(results);
    setCombinedLoading(false);
  }

  function exportCsv() {
    const headers = ["Order ID", "Date", "Party Name", "Brand", "Destination", "Sales", "Qty", "Wt(Ton)", "Job Status"];
    const rows = filtered.map((o) => [
      o.order_id, formatDate(o.order_date), o.party_name, o.brand || "-", o.destination || "-",
      o.sales_person || "-", o.total_qty, o.total_weight,
      (jobsByOrder[o.order_id] || []).map((j) => `${j.job_number}:${j.status}`).join(" | ") || "-",
    ]);
    const csv = "\uFEFF" + [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Indent_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="in-root">
      <style>{`
        .in-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .in-filterbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
        .in-filter-item { flex: 1; min-width: 170px; }
        .in-btn { border: none; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
        .in-btn-reset { background: #f1f2f6; color: #4a4d5c; }
        .in-btn-combined { background: linear-gradient(135deg, #1d5fc7, #164a9e); color: #fff; box-shadow: 0 4px 12px rgba(29,95,199,0.28); }
        .in-btn-combined:disabled { opacity: 0.5; cursor: not-allowed; }

        .in-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .in-csv-btn { border: 1px solid #bfe3cf; background: #eafaf1; color: #1a8a4c; border-radius: 10px; padding: 9px 14px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 7px; }
        .in-count { font-size: 12.5px; color: #9295a8; }
        .in-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e4e6ee; border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8; }
        .in-search input { border: none; outline: none; font-size: 13px; width: 100%; }

        .in-table-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; min-height: 400px; }
        .in-table-scroll { overflow-x: auto; max-height: 78vh; min-height: 340px; overflow-y: auto; }
        table.in-table { width: 100%; border-collapse: collapse; min-width: 1100px; font-size: 13.5px; }
        .in-table thead th { position: sticky; top: 0; background: #14161f; color: #fff; text-align: left; padding: 15px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        .in-table tbody td { padding: 16px 18px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .in-table tbody tr:hover { background: #fbfbfd; }
        .in-oid { color: #b5620f; font-weight: 700; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .in-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .in-empty-cell { color: #c3c5d1; }

        .in-actioncell { display: flex; align-items: center; gap: 6px; }
        .in-iconbtn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .in-iconbtn:hover { background: #f6f7fb; }
        .in-job-btn { border: none; background: #14161f; color: #fff; border-radius: 9px; padding: 8px 14px; font-weight: 700; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }

        .in-loading, .in-nodata { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #9295a8; gap: 10px; }
        .in-spin { animation: in-spin-anim 0.9s linear infinite; }
        @keyframes in-spin-anim { to { transform: rotate(360deg); } }
        .in-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        .in-combined-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 250; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .in-combined-card { width: 100%; max-width: 560px; max-height: 82vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.28); overflow: hidden; display: flex; flex-direction: column; }
        .in-combined-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .in-combined-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .in-combined-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #5b5f72; }
        .in-combined-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .in-combined-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .in-combined-table thead th { background: #f6f7fb; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #5b5f72; }
        .in-combined-table tbody td { padding: 11px 14px; border-top: 1px solid #f0f1f6; }
        .in-combined-table .in-qty { font-family: 'IBM Plex Mono', monospace; color: #1a8a4c; font-weight: 700; }

        @media (max-width: 900px) {
          .in-table-scroll { overflow-x: visible; }
          table.in-table, table.in-table thead, table.in-table tbody, table.in-table tr, table.in-table td { display: block; width: 100%; }
          table.in-table { min-width: 0; }
          table.in-table thead { display: none; }
          table.in-table tr { border: 1px solid #eceef4; border-radius: 12px; margin: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          table.in-table td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid #f5f6fa; white-space: normal; text-align: right; }
          table.in-table td:last-child { border-bottom: none; }
          table.in-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
          .in-actioncell { justify-content: flex-end; }
        }
      `}</style>

      <div className="in-filterbar">
        <div className="in-filter-item">
          <ComboBox label="Party" value={partyFilter} onChange={setPartyFilter} options={master.parties} placeholder="All Parties" />
        </div>
        <div className="in-filter-item">
          <ComboBox label="Sales" value={salesFilter} onChange={setSalesFilter} options={master.salesPersons} placeholder="All Sales" />
        </div>
        <div className="in-filter-item">
          <ComboBox label="Brand" value={brandFilter} onChange={setBrandFilter} options={master.brands} placeholder="All Brands" />
        </div>
        <button className="in-btn in-btn-reset" onClick={resetFilters}><RotateCcw size={14} /> Reset</button>
        <button className="in-btn in-btn-combined" onClick={openCombined} disabled={filtered.length === 0}>
          <Layers size={14} /> Combined Requirement
        </button>
      </div>

      <div className="in-toolbar">
        <button className="in-csv-btn" onClick={exportCsv}><FileSpreadsheet size={15} /> Export to CSV</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="in-search">
            <Search size={14} />
            <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="in-count">{filtered.length} record(s)</span>
        </div>
      </div>

      {errorMsg && <div className="in-error">{errorMsg}</div>}

      <div className="in-table-card">
        {loading ? (
          <div className="in-loading"><Loader2 size={22} className="in-spin" /> Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="in-nodata">No records found.</div>
        ) : (
          <div className="in-table-scroll">
            <table className="in-table">
              <thead>
                <tr>
                  <th>Order ID</th><th>Date</th><th>Party Name</th><th>Brand</th><th>Destination</th>
                  <th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>Job Status</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const jobs = jobsByOrder[o.order_id] || [];
                  return (
                    <tr key={o.order_id}>
                      <td data-label="Order ID"><span className="in-oid">{o.order_id}</span></td>
                      <td data-label="Date">{formatDate(o.order_date)}</td>
                      <td data-label="Party Name">{o.party_name}</td>
                      <td data-label="Brand">{o.brand || <span className="in-empty-cell">-</span>}</td>
                      <td data-label="Destination">{o.destination || <span className="in-empty-cell">-</span>}</td>
                      <td data-label="Sales">{o.sales_person || <span className="in-empty-cell">-</span>}</td>
                      <td data-label="Qty">{o.total_qty}</td>
                      <td data-label="Wt(Ton)">{Number(o.total_weight).toFixed(3)}</td>
                      <td data-label="Job Status">
                        {jobs.length === 0 ? (
                          <span className="in-empty-cell">No job</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            {jobs.map((job) => {
                              const jobBadge = JOB_STATUS_STYLES[job.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                              return (
                                <span key={job.id} className="in-badge" style={{ background: jobBadge.bg, color: jobBadge.color }} title={job.job_number}>
                                  {job.status}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td data-label="Action">
                        <div className="in-actioncell" style={{ flexWrap: "wrap" }}>
                          <button className="in-iconbtn" title="View Items" onClick={() => setViewOrderId(o.order_id)}>
                            <Eye size={14} />
                          </button>
                          {jobs.map((job, idx) => (
                            <button key={job.id} className="in-job-btn" onClick={() => setActiveJobId(job.id)} title={job.job_number}>
                              <Factory size={13} /> {jobs.length > 1 ? `Manage Job ${idx + 1}` : "Manage Job"}
                            </button>
                          ))}
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

      {activeJobId && (
        <ProductionJobModal
          jobId={activeJobId}
          onClose={() => setActiveJobId(null)}
          onChanged={loadOrders}
        />
      )}

      {combinedOpen && (
        <div className="in-combined-overlay" onClick={() => setCombinedOpen(false)}>
          <div className="in-combined-card" onClick={(e) => e.stopPropagation()}>
            <div className="in-combined-header">
              <h4><Layers size={17} style={{ marginRight: 8, verticalAlign: -3 }} />Combined Material Requirement</h4>
              <button className="in-combined-close" onClick={() => setCombinedOpen(false)}>✕</button>
            </div>
            <div className="in-combined-body">
              <p style={{ fontSize: 12.5, color: "#9295a8", marginTop: 0 }}>
                Total raw materials needed to produce the shortfall across all {filtered.length} filtered Indent order(s).
              </p>
              {combinedLoading ? (
                <div style={{ textAlign: "center", padding: "30px 0" }}><Loader2 size={20} className="in-spin" /></div>
              ) : combinedResults.length === 0 ? (
                <div style={{ textAlign: "center", color: "#b7b9c6", padding: 20 }}>No active production jobs / BOM matches found.</div>
              ) : (
                <table className="in-combined-table">
                  <thead><tr><th>Material</th><th>Total Required</th></tr></thead>
                  <tbody>
                    {combinedResults.map((r) => (
                      <tr key={r.name}>
                        <td style={{ fontWeight: 700 }}>{r.name}</td>
                        <td className="in-qty">{r.totalQty.toFixed(3)} {r.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
