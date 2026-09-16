import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, Factory, Layers, ShoppingCart, Truck, ChevronLeft, Loader2,
  Search, AlertTriangle, Eye, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import OrderItemsModal from "../components/ui/OrderItemsModal";

function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}
function todayStr() { return new Date().toISOString().split("T")[0]; }
function pct(actual, target) {
  if (!target) return null;
  return (Number(actual) / Number(target)) * 100;
}

const REPORT_CARDS = [
  { id: "orders", label: "Order Report", icon: Package, color: "#1d5fc7", bg: "#e8f1ff", desc: "Every order — status, party, qty, weight" },
  { id: "production", label: "Production Report", icon: Factory, color: "#b5620f", bg: "#fff4de", desc: "Target vs Actual across stages" },
  { id: "inventory", label: "Inventory Report", icon: Layers, color: "#8b3fd6", bg: "#f3e8ff", desc: "RM + FG stock, low-stock items" },
  { id: "purchase", label: "Purchase Report", icon: ShoppingCart, color: "#1a8a4c", bg: "#eafaf1", desc: "POs, vendors, spend, pending receipts" },
  { id: "dispatch", label: "Dispatch Report", icon: Truck, color: "#c23c33", bg: "#fdeceb", desc: "Dispatched vs ordered, variance" },
];

export default function Reports() {
  const [activeReport, setActiveReport] = useState(null);

  return (
    <div className="rpts-root">
      <style>{`
        .rpts-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .rpts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        @media (max-width: 900px) { .rpts-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .rpts-grid { grid-template-columns: 1fr; } }
        .rpts-card {
          background: #fff; border: 1px solid #eceef4; border-radius: 18px; padding: 22px;
          cursor: pointer; transition: transform .15s ease, box-shadow .15s ease; text-align: left;
        }
        .rpts-card:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(20,22,35,0.08); }
        .rpts-card-icon { width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
        .rpts-card-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .rpts-card-desc { font-size: 12px; color: #9295a8; line-height: 1.5; }

        .rpts-back-btn { border: none; background: #f1f2f6; color: #4a4d5c; padding: 9px 16px; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; margin-bottom: 18px; }
        .rpts-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }

        .rpt-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 14px; }
        .rpt-filters input, .rpt-filters select { border: 1px solid #e1e3ec; border-radius: 9px; padding: 8px 11px; font-size: 12.5px; }
        .rpt-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 8px 13px; flex: 1; min-width: 180px; color: #9295a8; }
        .rpt-search input { border: none; outline: none; font-size: 12.5px; width: 100%; background: transparent; }

        .rpt-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        @media (max-width: 900px) { .rpt-cards { grid-template-columns: repeat(2, 1fr); } }
        .rpt-card { background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; }
        .rpt-card-label { font-size: 10px; text-transform: uppercase; color: #9295a8; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 5px; }
        .rpt-card-value { font-family: 'Space Grotesk', sans-serif; font-size: 21px; font-weight: 800; }

        .rpt-table-wrap { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: auto; }
        .rpt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 900px; }
        .rpt-table thead th { background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; white-space: nowrap; }
        .rpt-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .rpt-table tbody tr:last-child td { border-bottom: none; }
        .rpt-badge { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; }
        .rpt-empty, .rpt-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .rpt-spin { animation: rpt-spin-anim 0.9s linear infinite; }
        @keyframes rpt-spin-anim { to { transform: rotate(360deg); } }
        .rpt-count { font-size: 12px; color: #9295a8; margin-bottom: 10px; }
        .rpt-good { color: #1a8a4c; font-weight: 700; }
        .rpt-bad { color: #c23c33; font-weight: 700; }
        .rpt-view-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: inline-flex; align-items: center; justify-content: center; }
        .rpt-view-btn:hover { background: #f6f7fb; color: #1d5fc7; }
        .rpt-expand-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: inline-flex; align-items: center; justify-content: center; }
        .rpt-expand-btn:hover { background: #f6f7fb; }
        .rpt-po-items { background: #f6f7fb; }
        .rpt-po-items-inner { padding: 12px 16px; }
        .rpt-po-items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .rpt-po-items-table th { text-align: left; padding: 6px 10px; color: #9295a8; font-weight: 700; text-transform: uppercase; font-size: 10px; }
        .rpt-po-items-table td { padding: 6px 10px; border-top: 1px solid #e8e9f0; }
        .rpt-material-rank { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f0f1f6; }
        .rpt-material-rank:last-child { border-bottom: none; }
        .rpt-material-rank-num { width: 22px; height: 22px; border-radius: 7px; background: #14161f; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .rpt-material-rank-bar-track { flex: 1; background: #f1f2f6; border-radius: 20px; height: 8px; overflow: hidden; }
        .rpt-material-rank-bar-fill { height: 100%; background: linear-gradient(90deg, #f5a623, #1a8a4c); border-radius: 20px; }
      `}</style>

      {!activeReport ? (
        <div className="rpts-grid">
          {REPORT_CARDS.map((c) => (
            <button key={c.id} className="rpts-card" onClick={() => setActiveReport(c.id)}>
              <div className="rpts-card-icon" style={{ background: c.bg, color: c.color }}><c.icon size={22} /></div>
              <div className="rpts-card-title">{c.label}</div>
              <div className="rpts-card-desc">{c.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button className="rpts-back-btn" onClick={() => setActiveReport(null)}><ChevronLeft size={14} /> Back to Reports</button>
          <div className="rpts-title">
            {(() => { const c = REPORT_CARDS.find((r) => r.id === activeReport); const Icon = c.icon; return (<><Icon size={18} style={{ color: c.color }} />{c.label}</>); })()}
          </div>
          {activeReport === "orders" && <OrderReport />}
          {activeReport === "production" && <ProductionReport />}
          {activeReport === "inventory" && <InventoryReport />}
          {activeReport === "purchase" && <PurchaseReport />}
          {activeReport === "dispatch" && <DispatchReport />}
        </div>
      )}
    </div>
  );
}

/* ============================== ORDER REPORT ============================== */
function OrderReport() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewOrderId, setViewOrderId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("orders").select("*").order("order_date", { ascending: false });
      setOrders(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const statuses = useMemo(() => [...new Set(orders.map((o) => o.status))], [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (status && o.status !== status) return false;
      if (fromDate && o.order_date < fromDate) return false;
      if (toDate && o.order_date > toDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${o.order_id} ${o.party_name} ${o.brand || ""} ${o.destination || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, status, fromDate, toDate, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    qty: filtered.reduce((s, o) => s + (Number(o.total_qty) || 0), 0),
    weight: filtered.reduce((s, o) => s + (Number(o.total_weight) || 0), 0),
    dispatched: filtered.filter((o) => o.status === "Dispatched").length,
  }), [filtered]);

  const STATUS_COLORS = {
    Pending: { bg: "#fdeceb", color: "#c23c33" }, Confirmed: { bg: "#e8f1ff", color: "#1d5fc7" },
    "Indent Raised": { bg: "#fff4de", color: "#b5620f" }, "On Hold": { bg: "#f1f2f6", color: "#4a4d5c" },
    Picked: { bg: "#f3e8ff", color: "#8b3fd6" }, "Ready to Ship": { bg: "#e8f1ff", color: "#1d5fc7" },
    "Partially Dispatched": { bg: "#fff4de", color: "#b5620f" },
    Dispatched: { bg: "#eafaf1", color: "#1a8a4c" }, Cancelled: { bg: "#f1f2f6", color: "#9295a8" },
  };

  return (
    <div>
      <div className="rpt-filters">
        <div className="rpt-search"><Search size={13} /><input placeholder="Search order, party, brand..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <div className="rpt-cards">
        <div className="rpt-card"><div className="rpt-card-label">Total Orders</div><div className="rpt-card-value">{totals.count}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Qty</div><div className="rpt-card-value" style={{ color: "#1d5fc7" }}>{totals.qty}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Weight (Ton)</div><div className="rpt-card-value">{totals.weight.toFixed(2)}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Dispatched</div><div className="rpt-card-value" style={{ color: "#1a8a4c" }}>{totals.dispatched}</div></div>
      </div>

      <div className="rpt-count">{filtered.length} order(s)</div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Loader2 size={20} className="rpt-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rpt-empty">No orders match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>Order ID</th><th>Date</th><th>Party</th><th>Brand</th><th>Destination</th><th>Sales</th><th>Qty</th><th>Wt(Ton)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((o) => {
                const badge = STATUS_COLORS[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                return (
                  <tr key={o.order_id}>
                    <td>{o.order_id}</td><td>{fmtDate(o.order_date)}</td><td>{o.party_name}</td>
                    <td>{o.brand || "-"}</td><td>{o.destination || "-"}</td><td>{o.sales_person || "-"}</td>
                    <td>{o.total_qty}</td><td>{Number(o.total_weight).toFixed(3)}</td>
                    <td><span className="rpt-badge" style={{ background: badge.bg, color: badge.color }}>{o.status}</span></td>
                    <td style={{ textAlign: "right" }}>
                      <button className="rpt-view-btn" onClick={() => setViewOrderId(o.order_id)} title="View items"><Eye size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <OrderItemsModal orderId={viewOrderId} onClose={() => setViewOrderId(null)} />
    </div>
  );
}

/* ============================== PRODUCTION REPORT ============================== */
function ProductionReport() {
  const [targets, setTargets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [tRes, lRes] = await Promise.all([
        supabase.from("target_master").select("*"),
        supabase.from("production_log").select("*").order("entry_date", { ascending: false }),
      ]);
      setTargets(tRes.data || []);
      setLogs(lRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const departments = useMemo(() => [...new Set(logs.map((l) => l.department))], [logs]);

  const joined = useMemo(() => {
    return logs.map((l) => {
      const t = targets.find((x) => x.department === l.department && x.product === l.product && x.stage === l.stage);
      const target = t?.daily_target || 0;
      const balance = Number(l.actual_qty) - target;
      return { ...l, target, unit: t?.unit || "", balance, achievement: pct(l.actual_qty, target) };
    });
  }, [logs, targets]);

  const filtered = useMemo(() => {
    return joined.filter((r) => {
      if (fromDate && r.entry_date < fromDate) return false;
      if (toDate && r.entry_date > toDate) return false;
      if (department && r.department !== department) return false;
      return true;
    });
  }, [joined, fromDate, toDate, department]);

  const totals = useMemo(() => ({
    target: filtered.reduce((s, r) => s + r.target, 0),
    actual: filtered.reduce((s, r) => s + Number(r.actual_qty), 0),
    rejection: filtered.reduce((s, r) => s + Number(r.rejection_qty), 0),
  }), [filtered]);
  const achievement = pct(totals.actual, totals.target);

  return (
    <div>
      <div className="rpt-filters">
        <select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <div className="rpt-cards">
        <div className="rpt-card"><div className="rpt-card-label">Total Target</div><div className="rpt-card-value">{totals.target}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Actual</div><div className="rpt-card-value" style={{ color: "#1a8a4c" }}>{totals.actual}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Achievement %</div><div className="rpt-card-value" style={{ color: "#1d5fc7" }}>{achievement === null ? "-" : `${achievement.toFixed(1)}%`}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Rejection</div><div className="rpt-card-value" style={{ color: "#c23c33" }}>{totals.rejection}</div></div>
      </div>

      <div className="rpt-count">{filtered.length} record(s)</div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Loader2 size={20} className="rpt-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rpt-empty">No production records match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>Date</th><th>Shift</th><th>Department</th><th>Product</th><th>Stage</th><th>Target</th><th>Actual</th><th>Balance</th><th>Achievement %</th><th>Rejection</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.entry_date)}</td><td>{r.shift || "-"}</td><td>{r.department}</td><td>{r.product}</td><td>{r.stage}</td>
                  <td>{r.target} {r.unit}</td><td>{r.actual_qty} {r.unit}</td>
                  <td className={r.balance < 0 ? "rpt-bad" : "rpt-good"}>{r.balance > 0 ? `+${r.balance}` : r.balance}</td>
                  <td className={r.achievement !== null && r.achievement < 90 ? "rpt-bad" : "rpt-good"}>{r.achievement === null ? "-" : `${r.achievement.toFixed(1)}%`}</td>
                  <td>{r.rejection_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ============================== INVENTORY REPORT ============================== */
function InventoryReport() {
  const [rmRows, setRmRows] = useState([]);
  const [fgRows, setFgRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [rmRes, fgRes] = await Promise.all([
        supabase.from("rm_stock").select("*, raw_materials(name, unit, item_code, category)"),
        supabase.from("fg_stock").select("*"),
      ]);
      setRmRows(rmRes.data || []);
      setFgRows(fgRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  const unified = useMemo(() => {
    const rm = rmRows.map((r) => ({
      key: `rm_${r.id}`, kind: "RM", code: r.raw_materials?.item_code || "-", name: r.raw_materials?.name || "Unknown",
      category: r.raw_materials?.category || "-", unit: r.raw_materials?.unit || "-",
      qty: Number(r.qty_available) || 0, min: Number(r.min_stock) || 0,
    }));
    const fg = fgRows.map((r) => ({
      key: `fg_${r.id}`, kind: "FG", code: r.fg_id || "-", name: `${r.item_name} (${r.thickness}, ${r.size})`,
      category: "Finished Goods", unit: "pcs", qty: Number(r.qty_available) || 0, min: Number(r.min_stock) || 0,
    }));
    return [...rm, ...fg];
  }, [rmRows, fgRows]);

  const categories = useMemo(() => [...new Set(unified.map((r) => r.category))], [unified]);

  const filtered = useMemo(() => {
    return unified.filter((r) => {
      const isLow = r.min > 0 && r.qty < r.min;
      if (lowOnly && !isLow) return false;
      if (category && r.category !== category) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${r.code} ${r.name}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [unified, category, lowOnly, search]);

  const lowCount = unified.filter((r) => r.min > 0 && r.qty < r.min).length;

  return (
    <div>
      <div className="rpt-filters">
        <div className="rpt-search"><Search size={13} /><input placeholder="Search item..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5b5f72", fontWeight: 600 }}>
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low Stock Only
        </label>
      </div>

      <div className="rpt-cards">
        <div className="rpt-card"><div className="rpt-card-label">Total Items</div><div className="rpt-card-value">{unified.length}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Raw Material Items</div><div className="rpt-card-value" style={{ color: "#1d5fc7" }}>{rmRows.length}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Finished Goods Items</div><div className="rpt-card-value" style={{ color: "#8b3fd6" }}>{fgRows.length}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Low Stock Items</div><div className="rpt-card-value" style={{ color: "#c23c33" }}>{lowCount}</div></div>
      </div>

      <div className="rpt-count">{filtered.length} item(s)</div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Loader2 size={20} className="rpt-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rpt-empty">No items match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>Type</th><th>Code</th><th>Name</th><th>Category</th><th>UOM</th><th>Qty</th><th>Min</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((r) => {
                const isLow = r.min > 0 && r.qty < r.min;
                return (
                  <tr key={r.key}>
                    <td><span className="rpt-badge" style={{ background: r.kind === "RM" ? "#e8f1ff" : "#f3e8ff", color: r.kind === "RM" ? "#1d5fc7" : "#8b3fd6" }}>{r.kind}</span></td>
                    <td>{r.code}</td><td>{r.name}</td><td>{r.category}</td><td>{r.unit}</td><td>{r.qty}</td><td>{r.min || "-"}</td>
                    <td>{r.min > 0 ? (<span className="rpt-badge" style={{ background: isLow ? "#fdeceb" : "#eafaf1", color: isLow ? "#c23c33" : "#1a8a4c" }}>{isLow ? "LOW STOCK" : "OK"}</span>) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ============================== PURCHASE REPORT ============================== */
function PurchaseReport() {
  const [pos, setPos] = useState([]);
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [poRes, itemsRes, matRes] = await Promise.all([
        supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("purchase_order_items").select("*"),
        supabase.from("raw_materials").select("id, name, unit, item_code"),
      ]);
      setPos(poRes.data || []);
      setItems(itemsRes.data || []);
      setMaterials(matRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  function materialInfo(materialId) {
    return materials.find((m) => m.id === materialId) || { name: "Unknown", unit: "", item_code: "-" };
  }

  const withTotals = useMemo(() => {
    return pos.map((po) => {
      const poItems = items.filter((i) => i.po_id === po.id);
      const amount = poItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      return { ...po, poItems, amount, itemCount: poItems.length };
    });
  }, [pos, items]);

  const filtered = useMemo(() => {
    return withTotals.filter((po) => {
      if (status && po.status !== status) return false;
      if (fromDate && po.created_at.split("T")[0] < fromDate) return false;
      if (toDate && po.created_at.split("T")[0] > toDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${po.po_number} ${po.vendor_name}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [withTotals, status, fromDate, toDate, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, po) => s + po.amount, 0),
    pending: filtered.filter((po) => po.status !== "Received").length,
  }), [filtered]);

  // Which materials are being bought the most, and at what cost — across the currently filtered POs
  const materialRanking = useMemo(() => {
    const filteredPoIds = new Set(filtered.map((po) => po.id));
    const map = {};
    items.forEach((it) => {
      if (!filteredPoIds.has(it.po_id)) return;
      if (!map[it.material_id]) map[it.material_id] = { qty: 0, amount: 0 };
      map[it.material_id].qty += Number(it.qty_ordered) || 0;
      map[it.material_id].amount += Number(it.amount) || 0;
    });
    const ranked = Object.entries(map)
      .map(([materialId, v]) => ({ materialId, ...v, info: materialInfo(materialId) }))
      .sort((a, b) => b.qty - a.qty);
    const maxQty = ranked[0]?.qty || 1;
    return ranked.slice(0, 8).map((r) => ({ ...r, widthPct: (r.qty / maxQty) * 100 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filtered, materials]);

  const STATUS_COLORS = { Ordered: { bg: "#fff4de", color: "#b5620f" }, "Partially Received": { bg: "#e8f1ff", color: "#1d5fc7" }, Received: { bg: "#eafaf1", color: "#1a8a4c" } };

  return (
    <div>
      <div className="rpt-filters">
        <div className="rpt-search"><Search size={13} /><input placeholder="Search PO, vendor..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="Ordered">Ordered</option>
          <option value="Partially Received">Partially Received</option>
          <option value="Received">Received</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      <div className="rpt-cards">
        <div className="rpt-card"><div className="rpt-card-label">Total POs</div><div className="rpt-card-value">{totals.count}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Spend</div><div className="rpt-card-value" style={{ color: "#1a8a4c" }}>₹{totals.amount.toFixed(0)}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Pending Receipts</div><div className="rpt-card-value" style={{ color: "#c23c33" }}>{totals.pending}</div></div>
      </div>

      {materialRanking.length > 0 && (
        <>
          <div className="rpts-title" style={{ fontSize: 14.5, marginTop: 4 }}>Top Materials Purchased</div>
          <div className="rpt-table-wrap" style={{ marginBottom: 18 }}>
            {materialRanking.map((r, i) => (
              <div className="rpt-material-rank" key={r.materialId}>
                <div className="rpt-material-rank-num">{i + 1}</div>
                <div style={{ minWidth: 140, fontSize: 12.5, fontWeight: 700 }}>{r.info.name}</div>
                <div className="rpt-material-rank-bar-track"><div className="rpt-material-rank-bar-fill" style={{ width: `${r.widthPct}%` }} /></div>
                <div style={{ minWidth: 90, textAlign: "right", fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{r.qty} {r.info.unit}</div>
                <div style={{ minWidth: 90, textAlign: "right", fontSize: 12.5, color: "#1a8a4c", fontWeight: 700 }}>₹{r.amount.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rpt-count">{filtered.length} PO(s)</div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Loader2 size={20} className="rpt-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rpt-empty">No purchase orders match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>PO No.</th><th>Vendor</th><th>Date</th><th>Items</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((po) => {
                const badge = STATUS_COLORS[po.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                const isExpanded = expandedId === po.id;
                return (
                  <React.Fragment key={po.id}>
                    <tr>
                      <td>{po.po_number}</td><td>{po.vendor_name}</td><td>{fmtDate(po.created_at)}</td>
                      <td>{po.itemCount}</td><td>₹{po.amount.toFixed(2)}</td>
                      <td><span className="rpt-badge" style={{ background: badge.bg, color: badge.color }}>{po.status}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <button className="rpt-expand-btn" onClick={() => setExpandedId(isExpanded ? null : po.id)}>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="rpt-po-items">
                        <td colSpan={7}>
                          <div className="rpt-po-items-inner">
                            <table className="rpt-po-items-table">
                              <thead><tr><th>Item Code</th><th>Material</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                              <tbody>
                                {po.poItems.map((it) => {
                                  const info = materialInfo(it.material_id);
                                  return (
                                    <tr key={it.id}>
                                      <td>{info.item_code}</td><td>{info.name}</td><td>{info.unit}</td>
                                      <td>{it.qty_ordered}</td><td>₹{Number(it.rate).toFixed(2)}</td><td>₹{Number(it.amount).toFixed(2)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ============================== DISPATCH REPORT ============================== */
function DispatchReport() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [varianceStatus, setVarianceStatus] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("dispatch_logs").select("*").order("created_at", { ascending: false });
      setLogs(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (varianceStatus && l.variance_status !== varianceStatus) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${l.order_id} ${l.item_name}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, varianceStatus]);

  const totals = useMemo(() => ({
    ordered: filtered.reduce((s, l) => s + (Number(l.ordered_qty) || 0), 0),
    dispatched: filtered.reduce((s, l) => s + (Number(l.dispatched_qty) || 0), 0),
    short: filtered.filter((l) => l.variance_status === "Short").length,
    excess: filtered.filter((l) => l.variance_status === "Excess").length,
  }), [filtered]);

  const VARIANCE_COLORS = { Full: { bg: "#eafaf1", color: "#1a8a4c" }, Short: { bg: "#fdeceb", color: "#c23c33" }, Excess: { bg: "#fff4de", color: "#b5620f" } };

  return (
    <div>
      <div className="rpt-filters">
        <div className="rpt-search"><Search size={13} /><input placeholder="Search order, item..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select value={varianceStatus} onChange={(e) => setVarianceStatus(e.target.value)}>
          <option value="">All Variance</option>
          <option value="Full">Full</option>
          <option value="Short">Short</option>
          <option value="Excess">Excess</option>
        </select>
      </div>

      <div className="rpt-cards">
        <div className="rpt-card"><div className="rpt-card-label">Total Ordered</div><div className="rpt-card-value">{totals.ordered}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Total Dispatched</div><div className="rpt-card-value" style={{ color: "#1a8a4c" }}>{totals.dispatched}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Short Deliveries</div><div className="rpt-card-value" style={{ color: "#c23c33" }}>{totals.short}</div></div>
        <div className="rpt-card"><div className="rpt-card-label">Excess Deliveries</div><div className="rpt-card-value" style={{ color: "#b5620f" }}>{totals.excess}</div></div>
      </div>

      <div className="rpt-count">{filtered.length} record(s)</div>

      <div className="rpt-table-wrap">
        {loading ? (
          <div className="rpt-loading"><Loader2 size={20} className="rpt-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rpt-empty">No dispatch records match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>Order ID</th><th>Item</th><th>Brand</th><th>Size</th><th>Thickness</th><th>Ordered</th><th>Dispatched</th><th>Pending</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((l, i) => {
                const badge = VARIANCE_COLORS[l.variance_status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                return (
                  <tr key={l.id || i}>
                    <td>{l.order_id}</td><td>{l.item_name}</td><td>{l.brand || "-"}</td><td>{l.size}</td><td>{l.thickness}</td>
                    <td>{l.ordered_qty}</td><td>{l.dispatched_qty}</td><td>{l.pending_qty}</td>
                    <td><span className="rpt-badge" style={{ background: badge.bg, color: badge.color }}>{l.variance_status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
