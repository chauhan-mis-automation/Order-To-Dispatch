// import React, { useEffect, useMemo, useState } from "react";
// import {
//   Inbox, Clock3, RefreshCw, CheckCircle2, BarChart3, Boxes, Truck, CheckCheck, Loader2,
// } from "lucide-react";
// import { supabase } from "../lib/supabaseClient";
// import OrdersListModal from "../components/ui/OrdersListModal";
// import OrderItemsModal from "../components/ui/OrderItemsModal";
// import { CountUp } from "../components/ui/motion";
// import { TrendChart } from "../components/ui/charts";
// import { PALETTE } from "../components/ui/chartTheme";

// const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// export default function Dashboard() {
//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [errorMsg, setErrorMsg] = useState("");

//   const [drilldown, setDrilldown] = useState(null); // { title, orders }
//   const [viewOrderId, setViewOrderId] = useState(null);

//   useEffect(() => {
//     async function load() {
//       setLoading(true);
//       const { data, error } = await supabase
//         .from("orders")
//         .select("order_id, order_date, party_name, brand, destination, sales_person, total_qty, total_weight, status");
//       if (error) setErrorMsg(error.message);
//       else setOrders(data || []);
//       setLoading(false);
//     }
//     load();
//   }, []);

//   const analytics = useMemo(() => {
//     const stats = {
//       total: orders.length,
//       pending: orders.filter((o) => o.status === "Pending").length,
//       indents: orders.filter((o) => o.status === "Indent Raised").length,
//       picking: orders.filter((o) => o.status === "Confirmed").length,
//       packing: orders.filter((o) => o.status === "Picked").length,
//       readyToShip: orders.filter((o) => o.status === "Ready to Ship").length,
//       dispatched: orders.filter((o) => o.status === "Dispatched").length,
//     };

//     const currentYear = new Date().getFullYear();
//     const monthlyData = Array(12).fill(0);
//     orders.forEach((o) => {
//       if (!o.order_date) return;
//       const d = new Date(o.order_date);
//       if (d.getFullYear() === currentYear) monthlyData[d.getMonth()] += 1;
//     });
//     const chartData = MONTH_LABELS.map((m, i) => ({ month: m, orders: monthlyData[i] }));

//     function topBy(keyFn, valueFn) {
//       const map = {};
//       orders.forEach((o) => {
//         const key = keyFn(o);
//         if (!key) return;
//         map[key] = (map[key] || 0) + valueFn(o);
//       });
//       return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
//     }

//     const topParties = topBy((o) => o.party_name, () => 1);
//     const topPartiesByQty = topBy((o) => o.party_name, (o) => Number(o.total_qty) || 0);
//     const topPartiesByWt = topBy((o) => o.party_name, (o) => Number(o.total_weight) || 0)
//       .map(([p, w]) => [p, Number(w.toFixed(2))]);
//     const topPartiesByDispatch = topBy(
//       (o) => (o.status === "Dispatched" ? o.party_name : null),
//       () => 1
//     );

//     const totalQty = orders.reduce((s, o) => s + (Number(o.total_qty) || 0), 0);

//     return { stats, chartData, topParties, topPartiesByQty, topPartiesByWt, topPartiesByDispatch, totalQty };
//   }, [orders]);

//   function openStatDrilldown(type) {
//     const statusMap = {
//       all: [],
//       pending: ["Pending", "Indent Raised"],
//       inprocess: ["Confirmed", "Picked", "Ready to Ship", "Partially Dispatched"],
//       dispatched: ["Dispatched"],
//     };
//     const titles = {
//       all: "All Orders",
//       pending: "Pending Orders (Pending + Indent Raised)",
//       inprocess: "In Process Orders (Confirmed + Picked + Ready to Ship + Partially Dispatched)",
//       dispatched: "Dispatched Orders",
//     };
//     const statuses = statusMap[type];
//     const filtered = statuses.length === 0 ? orders : orders.filter((o) => statuses.includes(o.status));
//     setDrilldown({ title: titles[type], orders: filtered });
//   }

//   function openPartyDrilldown(party, mode) {
//     let filtered = orders.filter((o) => o.party_name === party);
//     if (mode === "dispatch") filtered = filtered.filter((o) => o.status === "Dispatched");
//     const titles = {
//       orders: "Orders Count — ",
//       qty: "Total Qty (Pcs) — ",
//       weight: "Total Weight (Ton) — ",
//       dispatch: "Dispatched Orders — ",
//     };
//     setDrilldown({ title: (titles[mode] || "") + party, orders: filtered });
//   }

//   if (loading) {
//     return (
//       <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", color: "#9295a8" }}>
//         <Loader2 size={26} className="db-spin" />
//         <style>{`.db-spin { animation: db-spin-anim 0.9s linear infinite; } @keyframes db-spin-anim { to { transform: rotate(360deg); } }`}</style>
//       </div>
//     );
//   }

//   return (
//     <div className="db-root">
//       <style>{`
//         .db-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
//         .db-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

//         .db-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 18px; }
//         @media (max-width: 900px) { .db-stats-grid { grid-template-columns: repeat(2, 1fr); } }
//         .db-stat-card {
//           background: #fff; border-radius: 14px; padding: 18px; border-left: 4px solid;
//           box-shadow: 0 2px 8px rgba(20,22,35,0.05); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease;
//           display: flex; align-items: center; justify-content: space-between;
//         }
//         .db-stat-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(20,22,35,0.1); }
//         .db-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.05em; }
//         .db-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 26px; font-weight: 700; margin-top: 6px; }
//         .db-stat-icon { opacity: 0.15; }

//         .db-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
//         @media (max-width: 980px) { .db-row { grid-template-columns: 1fr; } }
//         .db-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px; }
//         .db-card h6 { margin: 0 0 14px 0; font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
//         .db-icon-chip { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }

//         .db-list-item {
//           display: flex; align-items: center; justify-content: space-between; padding: 9px 0;
//           border-top: 1px solid #f0f1f6; cursor: pointer;
//         }
//         .db-list-item:first-of-type { border-top: none; }
//         .db-list-item { transition: background .15s ease, padding-left .15s ease; border-radius: 8px; }
//         .db-list-item:hover { background: #f7f8fc; padding-left: 8px; }
//         .db-list-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
//         .db-rank { min-width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
//         .db-list-name { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
//         .db-list-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }

//         .db-top-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
//         @media (max-width: 980px) { .db-top-grid { grid-template-columns: 1fr; } }
//         .db-empty-list { text-align: center; color: #b7b9c6; font-size: 12.5px; padding: 16px 0; }

//         .db-prod-card { background: linear-gradient(135deg, #14161f, #1e2130); color: #fff; border-radius: 16px; padding: 16px 20px; margin-bottom: 18px; }
//         .db-prod-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #ffcd80; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
//         .db-prod-total { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 800; margin-bottom: 8px; }
//         .db-prod-breakdown { display: flex; gap: 8px; flex-wrap: wrap; }
//         .db-prod-chip { background: rgba(255,255,255,0.08); border-radius: 9px; padding: 5px 11px; font-size: 11.5px; }
//         .db-prod-chip b { color: #ffcd80; }
//         .db-prod-empty { font-size: 12px; color: #a7abc0; }
//       `}</style>

//       {errorMsg && <div className="db-error">{errorMsg}</div>}

//       <div className="db-stats-grid">
//         <div className="db-stat-card fx-rise" style={{ borderLeftColor: "#1d5fc7", "--i": 0 }} onClick={() => openStatDrilldown("all")}>
//           <div><div className="db-stat-label">Total Orders</div><div className="db-stat-value" style={{ color: "#1d5fc7" }}><CountUp value={analytics.stats.total} /></div></div>
//           <Inbox size={34} className="db-stat-icon" style={{ color: "#1d5fc7" }} />
//         </div>
//         <div className="db-stat-card fx-rise" style={{ borderLeftColor: "#e0951f", "--i": 1 }} onClick={() => openStatDrilldown("pending")}>
//           <div><div className="db-stat-label">Pending</div><div className="db-stat-value" style={{ color: "#e0951f" }}><CountUp value={analytics.stats.pending + analytics.stats.indents} /></div></div>
//           <Clock3 size={34} className="db-stat-icon" style={{ color: "#e0951f" }} />
//         </div>
//         <div className="db-stat-card fx-rise" style={{ borderLeftColor: "#06b6d4", "--i": 2 }} onClick={() => openStatDrilldown("inprocess")}>
//           <div><div className="db-stat-label">In Process</div><div className="db-stat-value" style={{ color: "#06b6d4" }}><CountUp value={analytics.stats.picking + analytics.stats.packing + analytics.stats.readyToShip} /></div></div>
//           <RefreshCw size={34} className="db-stat-icon" style={{ color: "#06b6d4" }} />
//         </div>
//         <div className="db-stat-card fx-rise" style={{ borderLeftColor: "#1a8a4c", "--i": 3 }} onClick={() => openStatDrilldown("dispatched")}>
//           <div><div className="db-stat-label">Dispatched</div><div className="db-stat-value" style={{ color: "#1a8a4c" }}><CountUp value={analytics.stats.dispatched} /></div></div>
//           <CheckCircle2 size={34} className="db-stat-icon" style={{ color: "#1a8a4c" }} />
//         </div>
//       </div>

//       <div className="db-row">
//         <div className="db-card fx-rise" style={{ "--i": 4 }}>
//           <h6><BarChart3 size={16} /> Orders This Year</h6>
//           <TrendChart
//             data={analytics.chartData}
//             xKey="month"
//             height={280}
//             series={[{ key: "orders", name: "Orders", color: PALETTE.amber }]}
//           />
//         </div>

//         <div className="db-card fx-rise" style={{ "--i": 5 }}>
//           <h6>
//             <span className="db-icon-chip" style={{ background: "#e0e7ff" }}><BarChart3 size={15} style={{ color: "#4f46e5" }} /></span>
//             Top Parties by Orders
//           </h6>
//           {analytics.topParties.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topParties.map(([party, count], i) => (
//             <div className="db-list-item fx-row" style={{ "--i": i + 3 }} key={party} onClick={() => openPartyDrilldown(party, "orders")}>
//               <div className="db-list-left">
//                 <span className="db-rank" style={{ background: "#e0e7ff", color: "#4f46e5" }}>{i + 1}</span>
//                 <span className="db-list-name" title={party}>{party}</span>
//               </div>
//               <span className="db-list-badge" style={{ background: "#e0e7ff", color: "#4f46e5" }}>{count} orders</span>
//             </div>
//           ))}
//         </div>
//       </div>

//       <div className="db-top-grid">
//         <div className="db-card fx-rise" style={{ "--i": 6 }}>
//           <h6>
//             <span className="db-icon-chip" style={{ background: "#e0f2fe" }}><Boxes size={15} style={{ color: "#0284c7" }} /></span>
//             Top Parties by Qty (Pcs)
//           </h6>
//           {analytics.topPartiesByQty.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topPartiesByQty.map(([party, qty], i) => (
//             <div className="db-list-item fx-row" style={{ "--i": i + 3 }} key={party} onClick={() => openPartyDrilldown(party, "qty")}>
//               <div className="db-list-left">
//                 <span className="db-rank" style={{ background: "#e0f2fe", color: "#0284c7" }}>{i + 1}</span>
//                 <span className="db-list-name" title={party}>{party}</span>
//               </div>
//               <span className="db-list-badge" style={{ background: "#0284c7", color: "#fff" }}>{qty} pcs</span>
//             </div>
//           ))}
//         </div>

//         <div className="db-card fx-rise" style={{ "--i": 7 }}>
//           <h6>
//             <span className="db-icon-chip" style={{ background: "#dcfce7" }}><Truck size={15} style={{ color: "#16a34a" }} /></span>
//             Top Parties by Weight (Ton)
//           </h6>
//           {analytics.topPartiesByWt.length === 0 ? <div className="db-empty-list">No data yet.</div> : analytics.topPartiesByWt.map(([party, wt], i) => (
//             <div className="db-list-item fx-row" style={{ "--i": i + 3 }} key={party} onClick={() => openPartyDrilldown(party, "weight")}>
//               <div className="db-list-left">
//                 <span className="db-rank" style={{ background: "#dcfce7", color: "#16a34a" }}>{i + 1}</span>
//                 <span className="db-list-name" title={party}>{party}</span>
//               </div>
//               <span className="db-list-badge" style={{ background: "#16a34a", color: "#fff" }}>{wt} T</span>
//             </div>
//           ))}
//         </div>

//         <div className="db-card fx-rise" style={{ "--i": 8 }}>
//           <h6>
//             <span className="db-icon-chip" style={{ background: "#fef9c3" }}><CheckCheck size={15} style={{ color: "#ca8a04" }} /></span>
//             Top Parties by Dispatch
//           </h6>
//           {analytics.topPartiesByDispatch.length === 0 ? <div className="db-empty-list">No dispatched orders yet.</div> : analytics.topPartiesByDispatch.map(([party, count], i) => (
//             <div className="db-list-item fx-row" style={{ "--i": i + 3 }} key={party} onClick={() => openPartyDrilldown(party, "dispatch")}>
//               <div className="db-list-left">
//                 <span className="db-rank" style={{ background: "#fef9c3", color: "#ca8a04" }}>{i + 1}</span>
//                 <span className="db-list-name" title={party}>{party}</span>
//               </div>
//               <span className="db-list-badge" style={{ background: "#ca8a04", color: "#fff" }}>{count} dispatched</span>
//             </div>
//           ))}
//         </div>
//       </div>

//       {drilldown && (
//         <OrdersListModal
//           title={drilldown.title}
//           orders={drilldown.orders}
//           onClose={() => setDrilldown(null)}
//           onViewOrder={(id) => setViewOrderId(id)}
//         />
//       )}
//       <OrderItemsModal orderId={viewOrderId} onClose={() => setViewOrderId(null)} />
//     </div>
//   );
// }


import { useEffect, useId, useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  Inbox, Clock3, RefreshCw, CheckCircle2, BarChart3, Boxes, Truck, CheckCheck, Loader2,
  PieChart as PieIcon, Scale, Gauge, Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import OrdersListModal from "../components/ui/OrdersListModal";
import OrderItemsModal from "../components/ui/OrderItemsModal";
import { CountUp } from "../components/ui/motion";
import { ChartCard, DonutChart, TrendChart } from "../components/ui/charts";
import { PALETTE } from "../components/ui/chartTheme";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_COLORS = {
  Pending: "#c23c33", "Indent Raised": "#f5a623", "On Hold": "#9295a8", Confirmed: "#1d5fc7",
  Picked: "#8b3fd6", "Ready to Ship": "#06b6d4", "Partially Dispatched": "#f97316",
  Dispatched: "#1a8a4c", Cancelled: "#cbd0dd",
};

const PIPELINE = [
  { label: "Pending", statuses: ["Pending", "Indent Raised"], color: "#c23c33" },
  { label: "Confirmed", statuses: ["Confirmed"], color: "#1d5fc7" },
  { label: "Picked", statuses: ["Picked"], color: "#8b3fd6" },
  { label: "Ready to Ship", statuses: ["Ready to Ship"], color: "#06b6d4" },
  { label: "Part. Dispatched", statuses: ["Partially Dispatched"], color: "#f97316" },
  { label: "Dispatched", statuses: ["Dispatched"], color: "#1a8a4c" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Spark({ data, color }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div style={{ width: 92, height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${uid})`} dot={false} isAnimationActive animationDuration={1300} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopList({ title, icon: Icon, tint, fg, rows, unit, solid, onPick, empty, delay }) {
  const max = rows[0]?.[1] || 1;
  return (
    <div className="db-card fx-rise" style={{ "--i": delay }}>
      <h6>
        <span className="db-icon-chip" style={{ background: tint }}><Icon size={15} style={{ color: fg }} /></span>
        {title}
      </h6>
      {rows.length === 0 ? <div className="db-empty-list">{empty}</div> : rows.map(([party, val], i) => (
        <div className="db-list-item fx-row" style={{ "--i": i + 3 }} key={party} onClick={() => onPick(party)}>
          <div className="db-list-top">
            <div className="db-list-left">
              <span className="db-rank" style={i === 0 ? { background: fg, color: "#fff" } : { background: tint, color: fg }}>{i + 1}</span>
              <span className="db-list-name" title={party}>{party}</span>
            </div>
            <span className="db-list-badge" style={solid ? { background: fg, color: "#fff" } : { background: tint, color: fg }}>{val} {unit}</span>
          </div>
          <div className="db-list-track"><div className="db-list-fill fx-grow" style={{ width: `${(val / max) * 100}%`, background: fg, "--i": i }} /></div>
        </div>
      ))}
    </div>
  );
}

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
    const monthly = (pred) => {
      const arr = Array(12).fill(0);
      orders.forEach((o) => {
        if (!o.order_date || !pred(o)) return;
        const d = new Date(o.order_date);
        if (d.getFullYear() === currentYear) arr[d.getMonth()] += 1;
      });
      return arr;
    };
    const monthlyData = monthly(() => true);
    const chartData = MONTH_LABELS.map((m, i) => ({ month: m, orders: monthlyData[i] }));
    const sparkOf = (statuses) => monthly((o) => !statuses || statuses.includes(o.status)).map((v) => ({ v }));
    const sparks = {
      all: sparkOf(null),
      pending: sparkOf(["Pending", "Indent Raised"]),
      inprocess: sparkOf(["Confirmed", "Picked", "Ready to Ship", "Partially Dispatched"]),
      dispatched: sparkOf(["Dispatched"]),
    };

    const statusCounts = {};
    orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || "#64748b" }));
    const pipeline = PIPELINE.map((p) => ({ ...p, count: orders.filter((o) => p.statuses.includes(o.status)).length }));

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
    const topPartiesByDispatch = topBy((o) => (o.status === "Dispatched" ? o.party_name : null), () => 1);

    const totalQty = orders.reduce((s, o) => s + (Number(o.total_qty) || 0), 0);
    const totalWeight = orders.reduce((s, o) => s + (Number(o.total_weight) || 0), 0);
    const dispatchRate = stats.total ? (stats.dispatched / stats.total) * 100 : 0;

    return { stats, chartData, sparks, statusData, pipeline, topParties, topPartiesByQty, topPartiesByWt, topPartiesByDispatch, totalQty, totalWeight, dispatchRate };
  }, [orders]);

  function openStatDrilldown(type) {
    const statusMap = {
      all: [],
      pending: ["Pending", "Indent Raised"],
      inprocess: ["Confirmed", "Picked", "Ready to Ship", "Partially Dispatched"],
      dispatched: ["Dispatched"],
    };
    const titles = {
      all: "All Orders",
      pending: "Pending Orders (Pending + Indent Raised)",
      inprocess: "In Process Orders (Confirmed + Picked + Ready to Ship + Partially Dispatched)",
      dispatched: "Dispatched Orders",
    };
    const statuses = statusMap[type];
    const filtered = statuses.length === 0 ? orders : orders.filter((o) => statuses.includes(o.status));
    setDrilldown({ title: titles[type], orders: filtered });
  }

  function openStageDrilldown(stage) {
    setDrilldown({ title: `${stage.label} Orders`, orders: orders.filter((o) => stage.statuses.includes(o.status)) });
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

  const { stats } = analytics;
  const statCards = [
    { key: "all", label: "Total Orders", value: stats.total, color: "#1d5fc7", icon: Inbox, spark: analytics.sparks.all },
    { key: "pending", label: "Pending", value: stats.pending + stats.indents, color: "#e0951f", icon: Clock3, spark: analytics.sparks.pending },
    { key: "inprocess", label: "In Process", value: stats.picking + stats.packing + stats.readyToShip, color: "#06b6d4", icon: RefreshCw, spark: analytics.sparks.inprocess },
    { key: "dispatched", label: "Dispatched", value: stats.dispatched, color: "#1a8a4c", icon: CheckCircle2, spark: analytics.sparks.dispatched },
  ];
  const maxStage = Math.max(1, ...analytics.pipeline.map((p) => p.count));
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="db-root">
      <style>{`
        .db-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .db-error { background: #fdeceb; color: #c23c33; padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; font-size: 13px; font-weight: 600; }

        /* Hero */
        .db-hero { position: relative; overflow: hidden; border-radius: 20px; padding: 22px 26px; margin-bottom: 16px; color: #fff;
          background: linear-gradient(120deg, #12141c 0%, #1d2130 55%, #2a2314 100%);
          display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
        .db-hero::before, .db-hero::after { content: ''; position: absolute; border-radius: 50%; filter: blur(50px); pointer-events: none; }
        .db-hero::before { width: 260px; height: 260px; right: -60px; top: -120px; background: rgba(245,166,35,0.35); animation: db-float 9s ease-in-out infinite; }
        .db-hero::after { width: 200px; height: 200px; left: 30%; bottom: -130px; background: rgba(6,182,212,0.22); animation: db-float 11s ease-in-out infinite reverse; }
        @keyframes db-float { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-24px, 18px); } }
        .db-hero-left { position: relative; z-index: 1; }
        .db-hero-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #ffcd80; }
        .db-hero-title { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 800; margin: 6px 0 2px; }
        .db-hero-date { font-size: 12.5px; color: #a7abc0; }
        .db-hero-chips { position: relative; z-index: 1; display: flex; gap: 10px; flex-wrap: wrap; }
        .db-hero-chip { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(6px);
          border-radius: 14px; padding: 10px 16px; min-width: 128px; }
        .db-hero-chip-label { display: flex; align-items: center; gap: 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #a7abc0; font-weight: 700; }
        .db-hero-chip-value { font-family: 'Space Grotesk', sans-serif; font-size: 21px; font-weight: 800; color: #ffcd80; margin-top: 3px; }
        .db-hero-chip-value small { font-size: 12px; color: #a7abc0; font-weight: 600; margin-left: 3px; }

        /* Stat cards */
        .db-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
        @media (max-width: 900px) { .db-stats-grid { grid-template-columns: repeat(2, 1fr); } }
        .db-stat-card { position: relative; overflow: hidden; background: #fff; border-radius: 16px; padding: 16px 18px; border: 1px solid #eceef4;
          box-shadow: 0 2px 8px rgba(20,22,35,0.04); cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
        .db-stat-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--c); }
        .db-stat-card::after { content: ''; position: absolute; right: -30px; top: -30px; width: 110px; height: 110px; border-radius: 50%; background: var(--c); opacity: 0.07; transition: transform .4s ease; }
        .db-stat-card:hover { transform: translateY(-4px); box-shadow: 0 12px 26px rgba(20,22,35,0.1); }
        .db-stat-card:hover::after { transform: scale(1.4); }
        .db-stat-top { display: flex; align-items: center; justify-content: space-between; }
        .db-stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.05em; }
        .db-stat-chip { width: 34px; height: 34px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 14%, white); color: var(--c); position: relative; z-index: 1; }
        .db-stat-bottom { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 8px; position: relative; z-index: 1; }
        .db-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 30px; font-weight: 700; line-height: 1; color: var(--c); }

        /* Pipeline */
        .db-pipeline { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 16px 18px; margin-bottom: 16px; }
        .db-pipeline-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        @media (max-width: 1100px) { .db-pipeline-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .db-pipeline-grid { grid-template-columns: repeat(2, 1fr); } }
        .db-stage { text-align: left; border: 1px solid #eef0f6; background: #fafbfd; border-radius: 12px; padding: 12px 13px; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
        .db-stage:hover { transform: translateY(-3px); background: #fff; box-shadow: 0 8px 18px rgba(20,22,35,0.08); }
        .db-stage-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #6b6f82; }
        .db-stage-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .db-stage-count { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 800; margin: 6px 0 8px; }
        .db-stage-track { height: 5px; border-radius: 9px; background: #eceef4; overflow: hidden; }
        .db-stage-fill { height: 100%; border-radius: 9px; }

        /* Cards */
        .db-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 980px) { .db-row { grid-template-columns: 1fr; } }
        .db-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px; min-width: 0; }
        .db-card h6 { margin: 0 0 14px 0; font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .db-icon-chip { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }

        .db-top-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 14px; }
        .db-list-item { padding: 9px 8px; border-top: 1px solid #f0f1f6; cursor: pointer; border-radius: 8px; transition: background .15s ease; }
        .db-list-item:first-of-type { border-top: none; }
        .db-list-item:hover { background: #f7f8fc; }
        .db-list-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .db-list-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .db-rank { min-width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .db-list-name { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .db-list-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }
        .db-list-track { height: 4px; border-radius: 9px; background: #f0f1f6; margin: 7px 0 0 32px; overflow: hidden; }
        .db-list-fill { height: 100%; border-radius: 9px; opacity: 0.85; }
        .db-empty-list { text-align: center; color: #b7b9c6; font-size: 12.5px; padding: 16px 0; }
      `}</style>

      {errorMsg && <div className="db-error">{errorMsg}</div>}

      <div className="db-hero fx-rise">
        <div className="db-hero-left">
          <div className="db-hero-eyebrow"><Sparkles size={13} /> {greeting()}</div>
          <div className="db-hero-title">Dispatch Control Overview</div>
          <div className="db-hero-date">{today}</div>
        </div>
        <div className="db-hero-chips">
          <div className="db-hero-chip">
            <div className="db-hero-chip-label"><Boxes size={13} /> Total Qty</div>
            <div className="db-hero-chip-value"><CountUp value={analytics.totalQty} /><small>pcs</small></div>
          </div>
          <div className="db-hero-chip">
            <div className="db-hero-chip-label"><Scale size={13} /> Total Weight</div>
            <div className="db-hero-chip-value"><CountUp value={analytics.totalWeight} decimals={2} /><small>T</small></div>
          </div>
          <div className="db-hero-chip">
            <div className="db-hero-chip-label"><Gauge size={13} /> Dispatch Rate</div>
            <div className="db-hero-chip-value"><CountUp value={analytics.dispatchRate} decimals={1} /><small>%</small></div>
          </div>
        </div>
      </div>

      <div className="db-stats-grid">
        {statCards.map((c, i) => (
          <div key={c.key} className="db-stat-card fx-rise" style={{ "--c": c.color, "--i": i + 1 }} onClick={() => openStatDrilldown(c.key)}>
            <div className="db-stat-top">
              <div className="db-stat-label">{c.label}</div>
              <span className="db-stat-chip"><c.icon size={17} /></span>
            </div>
            <div className="db-stat-bottom">
              <div className="db-stat-value"><CountUp value={c.value} /></div>
              <Spark data={c.spark} color={c.color} />
            </div>
          </div>
        ))}
      </div>

      <div className="db-pipeline fx-rise" style={{ "--i": 5 }}>
        <h6 style={{ margin: "0 0 12px", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="db-icon-chip" style={{ background: "#fff4de" }}><Truck size={15} style={{ color: "#b5620f" }} /></span>
          Order Pipeline
        </h6>
        <div className="db-pipeline-grid">
          {analytics.pipeline.map((p, i) => (
            <button key={p.label} className="db-stage fx-rise" style={{ "--i": i + 6 }} onClick={() => openStageDrilldown(p)}>
              <div className="db-stage-label"><span className="db-stage-dot" style={{ background: p.color }} />{p.label}</div>
              <div className="db-stage-count" style={{ color: p.color }}><CountUp value={p.count} /></div>
              <div className="db-stage-track"><div className="db-stage-fill fx-grow" style={{ width: `${(p.count / maxStage) * 100}%`, background: p.color, "--i": i }} /></div>
            </button>
          ))}
        </div>
      </div>

      <div className="db-row">
        <div className="db-card fx-rise" style={{ "--i": 7 }}>
          <h6><BarChart3 size={16} /> Orders This Year</h6>
          <TrendChart data={analytics.chartData} xKey="month" height={280} series={[{ key: "orders", name: "Orders", color: PALETTE.amber }]} />
        </div>
        <ChartCard title="Order Status Mix" icon={PieIcon} color={PALETTE.blue} delay={8}>
          <DonutChart data={analytics.statusData} centerLabel="Orders" height={250} />
        </ChartCard>
      </div>

      <div className="db-top-grid">
        <TopList title="Top Parties by Orders" icon={BarChart3} tint="#e0e7ff" fg="#4f46e5" unit="orders" delay={9}
          rows={analytics.topParties} empty="No data yet." onPick={(p) => openPartyDrilldown(p, "orders")} />
        <TopList title="Top Parties by Qty (Pcs)" icon={Boxes} tint="#e0f2fe" fg="#0284c7" unit="pcs" solid delay={10}
          rows={analytics.topPartiesByQty} empty="No data yet." onPick={(p) => openPartyDrilldown(p, "qty")} />
        <TopList title="Top Parties by Weight (Ton)" icon={Truck} tint="#dcfce7" fg="#16a34a" unit="T" solid delay={11}
          rows={analytics.topPartiesByWt} empty="No data yet." onPick={(p) => openPartyDrilldown(p, "weight")} />
        <TopList title="Top Parties by Dispatch" icon={CheckCheck} tint="#fef9c3" fg="#ca8a04" unit="dispatched" solid delay={12}
          rows={analytics.topPartiesByDispatch} empty="No dispatched orders yet." onPick={(p) => openPartyDrilldown(p, "dispatch")} />
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