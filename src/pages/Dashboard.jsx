import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Inbox, Clock3, RefreshCw, CheckCircle2, BarChart3, Boxes, Truck, CheckCheck, Loader2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import OrdersListModal from "../components/ui/OrdersListModal";
import OrderItemsModal from "../components/ui/OrderItemsModal";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [drilldown, setDrilldown] = useState(null); // { title, orders }
  const [viewOrderId, setViewOrderId] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("order_id, order_date, party_name, brand, destination, sales_person, total_qty, total_weight, status");
      if (error) setErrorMsg(error.message);
      else setOrders(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const analytics = useMemo(() => {
    const stats = {
      total: orders.length,
      pending: orders.filter((o) => o.status === "Pending").length,
      indents: orders.filter((o) => o.status === "Indent Raised").length,
      picking: orders.filter((o) => o.status === "Confirmed").length,
      packing: orders.filter((o) => o.status === "Picked").length,
      readyToShip: orders.filter((o) => o.status === "Ready to Ship").length,
      dispatched: orders.filter((o) => o.status === "Dispatched").length,
    };

    const currentYear = new Date().getFullYear();
    const monthlyData = Array(12).fill(0);
    orders.forEach((o) => {
      if (!o.order_date) return;
      const d = new Date(o.order_date);
      if (d.getFullYear() === currentYear) monthlyData[d.getMonth()] += 1;
    });
    const chartData = MONTH_LABELS.map((m, i) => ({ month: m, orders: monthlyData[i] }));

    function topBy(keyFn, valueFn) {
      const map = {};
      orders.forEach((o) => {
        const key = keyFn(o);
        if (!key) return;
        map[key] = (map[key] || 0) + valueFn(o);
      });
      return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }

    const topParties = topBy((o) => o.party_name, () => 1);
    const topPartiesByQty = topBy((o) => o.party_name, (o) => Number(o.total_qty) || 0);
    const topPartiesByWt = topBy((o) => o.party_name, (o) => Number(o.total_weight) || 0)
      .map(([p, w]) => [p, Number(w.toFixed(2))]);
    const topPartiesByDispatch = topBy(
      (o) => (o.status === "Dispatched" ? o.party_name : null),
      () => 1
    );

    const totalQty = orders.reduce((s, o) => s + (Number(o.total_qty) || 0), 0);

    return { stats, chartData, topParties, topPartiesByQty, topPartiesByWt, topPartiesByDispatch, totalQty };
  }, [orders]);

  function openStatDrilldown(type) {
    const statusMap = {
      all: [],
      pending: ["Pending", "Indent Raised"],
      inprocess: ["Confirmed", "Picked", "Ready to Ship"],
      dispatched: ["Dispatched"],
    };
    const titles = {
      all: "All Orders",
      pending: "Pending Orders (Pending + Indent Raised)",
      inprocess: "In Process Orders (Confirmed + Picked + Ready to Ship)",
      dispatched: "Dispatched Orders",
    };
    const statuses = statusMap[type];
    const filtered = statuses.length === 0 ? orders : orders.filter((o) => statuses.includes(o.status));
    setDrilldown({ title: titles[type], orders: filtered });
  }

  function openPartyDrilldown(party, mode) {
    let filtered = orders.filter((o) => o.party_name === party);
    if (mode === "dispatch") filtered = filtered.filter((o) => o.status === "Dispatched");
    const titles = {
      orders: "Orders Count — ",
      qty: "Total Qty (Pcs) — ",
      weight: "Total Weight (Ton) — ",
      dispatch: "Dispatched Orders — ",
    };
    setDrilldown({ title: (titles[mode] || "") + party, orders: filtered });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: "#9295a8" }}>
        <Loader2 size={26} className="db-spin" />
        <style>{`.db-spin { animation: db-spin-anim 0.9s linear infinite; } @keyframes db-spin-anim { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="db-root">
      <style>{`
        .db-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .db-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        .db-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
        @media (max-width: 900px) { .db-stats-grid { grid-template-columns: repeat(2, 1fr); } }
        .db-stat-card {
          background: #fff; border-radius: 14px; padding: 18px; border-left: 4px solid;
          box-shadow: 0 2px 8px rgba(20,22,35,0.05); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease;
          display: flex; align-items: center; justify-content: space-between;
        }
        .db-stat-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(20,22,35,0.1); }
        .db-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.05em; }
        .db-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 26px; font-weight: 700; margin-top: 6px; }
        .db-stat-icon { opacity: 0.15; }

        .db-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 980px) { .db-row { grid-template-columns: 1fr; } }
        .db-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px; }
        .db-card h6 { margin: 0 0 14px 0; font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .db-icon-chip { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }

        .db-list-item {
          display: flex; align-items: center; justify-content: space-between; padding: 9px 0;
          border-top: 1px solid #f0f1f6; cursor: pointer;
        }
        .db-list-item:first-of-type { border-top: none; }
        .db-list-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .db-rank { min-width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .db-list-name { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
        .db-list-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }

        .db-top-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        @media (max-width: 980px) { .db-top-grid { grid-template-columns: 1fr; } }
        .db-empty-list { text-align: center; color: #b7b9c6; font-size: 12.5px; padding: 16px 0; }
      `}</style>

      {errorMsg && <div className="db-error">{errorMsg}</div>}

      <div className="db-stats-grid">
        <div className="db-stat-card" style={{ borderLeftColor: "#1d5fc7" }} onClick={() => openStatDrilldown("all")}>
          <div><div className="db-stat-label">Total Orders</div><div className="db-stat-value" style={{ color: "#1d5fc7" }}>{analytics.stats.total}</div></div>
          <Inbox size={34} className="db-stat-icon" style={{ color: "#1d5fc7" }} />
        </div>
        <div className="db-stat-card" style={{ borderLeftColor: "#e0951f" }} onClick={() => openStatDrilldown("pending")}>
          <div><div className="db-stat-label">Pending</div><div className="db-stat-value" style={{ color: "#e0951f" }}>{analytics.stats.pending + analytics.stats.indents}</div></div>
          <Clock3 size={34} className="db-stat-icon" style={{ color: "#e0951f" }} />
        </div>
        <div className="db-stat-card" style={{ borderLeftColor: "#06b6d4" }} onClick={() => openStatDrilldown("inprocess")}>
          <div><div className="db-stat-label">In Process</div><div className="db-stat-value" style={{ color: "#06b6d4" }}>{analytics.stats.picking + analytics.stats.packing + analytics.stats.readyToShip}</div></div>
          <RefreshCw size={34} className="db-stat-icon" style={{ color: "#06b6d4" }} />
        </div>
        <div className="db-stat-card" style={{ borderLeftColor: "#1a8a4c" }} onClick={() => openStatDrilldown("dispatched")}>
          <div><div className="db-stat-label">Dispatched</div><div className="db-stat-value" style={{ color: "#1a8a4c" }}>{analytics.stats.dispatched}</div></div>
          <CheckCircle2 size={34} className="db-stat-icon" style={{ color: "#1a8a4c" }} />
        </div>
      </div>

      <div className="db-row">
        <div className="db-card">
          <h6><BarChart3 size={16} /> Orders This Year</h6>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9295a8" }} axisLine={{ stroke: "#eceef4" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9295a8" }} axisLine={{ stroke: "#eceef4" }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #eceef4", fontSize: 12.5 }} />
                <Line type="monotone" dataKey="orders" stroke="#f5a623" strokeWidth={2.5} dot={{ r: 3, fill: "#f5a623" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="db-card">
          <h6>
            <span className="db-icon-chip" style={{ background: "#e0e7ff" }}><BarChart3 size={15} style={{ color: "#4f46e5" }} /></span>
            Top Parties by Orders
          </h6>
          {analytics.topParties.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topParties.map(([party, count], i) => (
            <div className="db-list-item" key={party} onClick={() => openPartyDrilldown(party, "orders")}>
              <div className="db-list-left">
                <span className="db-rank" style={{ background: "#e0e7ff", color: "#4f46e5" }}>{i + 1}</span>
                <span className="db-list-name" title={party}>{party}</span>
              </div>
              <span className="db-list-badge" style={{ background: "#e0e7ff", color: "#4f46e5" }}>{count} orders</span>
            </div>
          ))}
        </div>
      </div>

      <div className="db-top-grid">
        <div className="db-card">
          <h6>
            <span className="db-icon-chip" style={{ background: "#e0f2fe" }}><Boxes size={15} style={{ color: "#0284c7" }} /></span>
            Top Parties by Qty (Pcs)
          </h6>
          {analytics.topPartiesByQty.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topPartiesByQty.map(([party, qty], i) => (
            <div className="db-list-item" key={party} onClick={() => openPartyDrilldown(party, "qty")}>
              <div className="db-list-left">
                <span className="db-rank" style={{ background: "#e0f2fe", color: "#0284c7" }}>{i + 1}</span>
                <span className="db-list-name" title={party}>{party}</span>
              </div>
              <span className="db-list-badge" style={{ background: "#0284c7", color: "#fff" }}>{qty} pcs</span>
            </div>
          ))}
        </div>

        <div className="db-card">
          <h6>
            <span className="db-icon-chip" style={{ background: "#dcfce7" }}><Truck size={15} style={{ color: "#16a34a" }} /></span>
            Top Parties by Weight (Ton)
          </h6>
          {analytics.topPartiesByWt.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topPartiesByWt.map(([party, wt], i) => (
            <div className="db-list-item" key={party} onClick={() => openPartyDrilldown(party, "weight")}>
              <div className="db-list-left">
                <span className="db-rank" style={{ background: "#dcfce7", color: "#16a34a" }}>{i + 1}</span>
                <span className="db-list-name" title={party}>{party}</span>
              </div>
              <span className="db-list-badge" style={{ background: "#16a34a", color: "#fff" }}>{wt} T</span>
            </div>
          ))}
        </div>

        <div className="db-card">
          <h6>
            <span className="db-icon-chip" style={{ background: "#fef9c3" }}><CheckCheck size={15} style={{ color: "#ca8a04" }} /></span>
            Top Parties by Dispatch
          </h6>
          {analytics.topPartiesByDispatch.length === 0 ? <div className="db-empty-list">No dispatched orders yet.</div> : analytics.topPartiesByDispatch.map(([party, count], i) => (
            <div className="db-list-item" key={party} onClick={() => openPartyDrilldown(party, "dispatch")}>
              <div className="db-list-left">
                <span className="db-rank" style={{ background: "#fef9c3", color: "#ca8a04" }}>{i + 1}</span>
                <span className="db-list-name" title={party}>{party}</span>
              </div>
              <span className="db-list-badge" style={{ background: "#ca8a04", color: "#fff" }}>{count} dispatched</span>
            </div>
          ))}
        </div>
      </div>

      {drilldown && (
        <OrdersListModal
          title={drilldown.title}
          orders={drilldown.orders}
          onClose={() => setDrilldown(null)}
          onViewOrder={(id) => setViewOrderId(id)}
        />
      )}
      <OrderItemsModal orderId={viewOrderId} onClose={() => setViewOrderId(null)} />
    </div>
  );
}
