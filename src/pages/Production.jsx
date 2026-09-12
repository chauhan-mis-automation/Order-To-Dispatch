import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Factory, Loader2, Plus, Trash2, Pencil, Check, X, LayoutDashboard,
  ClipboardList, Table2, Settings2, AlertTriangle, BarChart3, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis, AreaChart, Area, Line,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";

const DEPARTMENTS = ["Plywood", "Door", "Furniture"];
const SHIFTS = ["Shift 1 (6AM-2PM)", "Shift 2 (2PM-10PM)", "Shift 3 (10PM-6AM)"];

// Maps a real Item (from the Items master used across orders) to the
// manufacturing department whose stage-list applies to it.
const ITEM_DEPARTMENT = {
  "PLYWOOD": "Plywood",
  "BLOCKBOARD": "Plywood",
  "FLUSH DOOR": "Door",
  "MEMBRANE DOOR": "Door",
  "PVC MEMBRANE DOOR": "Door",
  "PVC VENEER DOOR": "Door",
  "SUPER PVC": "Door",
};
function departmentForItem(itemName) {
  return ITEM_DEPARTMENT[(itemName || "").trim().toUpperCase()] || "";
}
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "entry", label: "Daily Entry", icon: ClipboardList },
  { id: "report", label: "Production Sheet", icon: Table2 },
  { id: "target", label: "Target Master", icon: Settings2 },
];

function todayStr() { return new Date().toISOString().split("T")[0]; }
function monthStr() { return todayStr().slice(0, 7); }
function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}
function pct(actual, target) {
  if (!target) return null;
  return (Number(actual) / Number(target)) * 100;
}

export default function Production({ currentUser }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [targets, setTargets] = useState([]);
  const [stages, setStages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [tRes, sRes, lRes] = await Promise.all([
      supabase.from("target_master").select("*").order("department").order("product").order("stage"),
      supabase.from("stage_master").select("*").order("department").order("sequence"),
      supabase.from("production_log").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (tRes.error) setError(tRes.error.message);
    else setTargets(tRes.data || []);
    if (sRes.error) setError(sRes.error.message);
    else setStages(sRes.data || []);
    if (lRes.error) setError(lRes.error.message);
    else setLogs(lRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function findTarget(department, product, stage) {
    return targets.find((t) => t.department === department && t.product === product && t.stage === stage);
  }

  // one row per log entry, enriched with its target/capacity/unit + calculations
  const joinedRows = useMemo(() => {
    return logs.map((l) => {
      const t = findTarget(l.department, l.product, l.stage);
      const target = t?.daily_target || 0;
      const capacity = t?.capacity_8hr || 0;
      const unit = t?.unit || "";
      const balance = Number(l.actual_qty) - target;
      const achievement = pct(l.actual_qty, target);
      return { ...l, capacity, target, unit, balance, achievement };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, targets]);

  return (
    <div className="prod-root">
      <style>{`
        .prod-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .prod-tabs { display: flex; gap: 6px; background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 6px; margin-bottom: 18px; flex-wrap: wrap; }
        .prod-tab-btn { flex: 1; min-width: 120px; border: none; background: transparent; color: #5b5f72; padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .prod-tab-btn.active { background: #14161f; color: #fff; }
        .prod-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
        .prod-loading { display: flex; justify-content: center; padding: 60px 0; }
        .prod-spin { animation: prod-spin-anim 0.9s linear infinite; }
        @keyframes prod-spin-anim { to { transform: rotate(360deg); } }
      `}</style>

      <div className="prod-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`prod-tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {error && <div className="prod-error">{error}</div>}

      {loading ? (
        <div className="prod-loading"><Loader2 size={24} className="prod-spin" /></div>
      ) : (
        <>
          {activeTab === "dashboard" && <DashboardTab joinedRows={joinedRows} targets={targets} />}
          {activeTab === "entry" && <EntryTab targets={targets} stages={stages} currentUser={currentUser} onSaved={load} />}
          {activeTab === "report" && <ReportTab joinedRows={joinedRows} />}
          {activeTab === "target" && <TargetTab targets={targets} stages={stages} onChanged={load} />}
        </>
      )}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function DashboardTab({ joinedRows, targets }) {
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [filterProduct, setFilterProduct] = useState("");

  const productList = useMemo(() => [...new Set(joinedRows.map((r) => r.product))], [joinedRows]);

  const filtered = useMemo(() => {
    return joinedRows.filter((r) => {
      if (fromDate && r.entry_date < fromDate) return false;
      if (toDate && r.entry_date > toDate) return false;
      if (filterProduct && r.product !== filterProduct) return false;
      return true;
    });
  }, [joinedRows, fromDate, toDate, filterProduct]);

  const totals = useMemo(() => {
    const target = filtered.reduce((s, r) => s + Number(r.target), 0);
    const actual = filtered.reduce((s, r) => s + Number(r.actual_qty), 0);
    const rejection = filtered.reduce((s, r) => s + Number(r.rejection_qty), 0);
    const balance = actual - target;
    const achievement = pct(actual, target);
    return { target, actual, rejection, balance, achievement };
  }, [filtered]);

  const byProduct = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      if (!map[r.product]) map[r.product] = { target: 0, actual: 0 };
      map[r.product].target += Number(r.target);
      map[r.product].actual += Number(r.actual_qty);
    });
    return Object.entries(map)
      .map(([product, v]) => ({ product, ...v, achievement: pct(v.actual, v.target) }))
      .sort((a, b) => b.actual - a.actual);
  }, [filtered]);

  const byStage = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const key = r.stage;
      if (!map[key]) map[key] = { target: 0, actual: 0 };
      map[key].target += Number(r.target);
      map[key].actual += Number(r.actual_qty);
    });
    return Object.entries(map)
      .map(([stage, v]) => ({ stage, ...v, balance: v.actual - v.target, achievement: pct(v.actual, v.target) }))
      .sort((a, b) => b.actual - a.actual);
  }, [filtered]);

  const lowestStage = useMemo(() => {
    const withAch = byStage.filter((s) => s.achievement !== null);
    if (withAch.length === 0) return null;
    return withAch.reduce((min, s) => (s.achievement < min.achievement ? s : min));
  }, [byStage]);

  // last 14 days trend — independent of the single-date filter (respects product filter only)
  const trendData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }
    const byDate = {};
    days.forEach((d) => { byDate[d] = { target: 0, actual: 0 }; });
    joinedRows.forEach((r) => {
      if (filterProduct && r.product !== filterProduct) return;
      if (byDate[r.entry_date]) {
        byDate[r.entry_date].target += Number(r.target);
        byDate[r.entry_date].actual += Number(r.actual_qty);
      }
    });
    return days.map((d) => ({
      date: d,
      label: new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      ...byDate[d],
    }));
  }, [joinedRows, filterProduct]);

  const gaugeColor = totals.achievement === null ? "#c3c5d1" : totals.achievement >= 90 ? "#1a8a4c" : totals.achievement >= 75 ? "#f5a623" : "#c23c33";
  const gaugeData = [{ value: Math.min(100, totals.achievement || 0), fill: gaugeColor }];

  return (
    <div>
      <style>{`
        .pd-filters { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; align-items: end; }
        .pd-filter-item label.pd-filter-label { display: block; font-size: 10px; font-weight: 700; color: #9295a8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
        .pd-quick-btn { border: 1px solid #e1e3ec; background: #fff; color: #5b5f72; border-radius: 10px; padding: 9px 13px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .pd-quick-btn:hover { background: #f6f7fb; border-color: #f5a623; color: #b5620f; }
        .pd-filters input, .pd-filters select { border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 12px; font-size: 13px; background: #fff; }

        .pd-top-grid { display: grid; grid-template-columns: 220px 1fr; gap: 16px; margin-bottom: 20px; }
        @media (max-width: 900px) { .pd-top-grid { grid-template-columns: 1fr; } }

        .pd-gauge-card { background: #fff; border: 1px solid #eceef4; border-radius: 18px; padding: 18px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
        .pd-gauge-wrap { position: relative; width: 160px; height: 160px; }
        .pd-gauge-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .pd-gauge-pct { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 800; }
        .pd-gauge-label { font-size: 10px; text-transform: uppercase; color: #9295a8; font-weight: 700; letter-spacing: 0.04em; margin-top: 2px; }
        .pd-gauge-title { font-size: 11px; font-weight: 700; color: #5b5f72; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 12px; }

        .pd-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (max-width: 500px) { .pd-cards { grid-template-columns: 1fr; } }
        .pd-card {
          background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 16px 18px;
          position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px;
        }
        .pd-card-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pd-card-label { font-size: 10px; text-transform: uppercase; color: #9295a8; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 3px; }
        .pd-card-value { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 800; }

        .pd-bottleneck {
          background: linear-gradient(135deg, #14161f, #1e2130); color: #fff; border-radius: 16px;
          padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 14px;
        }
        .pd-bottleneck-icon { width: 40px; height: 40px; border-radius: 12px; background: rgba(245,166,35,0.18); color: #ffcd80; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pd-bottleneck-title { font-size: 10.5px; text-transform: uppercase; color: #ffcd80; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 3px; }
        .pd-bottleneck-value { font-size: 14px; font-weight: 700; }
        .pd-bottleneck-sub { font-size: 12px; color: #a7abc0; margin-top: 2px; }

        .pd-section-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14.5px; margin: 4px 0 12px 0; display: flex; align-items: center; gap: 8px; }
        .pd-chart-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; margin-bottom: 20px; }

        .pd-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 4px; }
        @media (max-width: 900px) { .pd-charts-grid { grid-template-columns: 1fr; } }

        .pd-stage-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .pd-stage-table thead th { background: #14161f; color: #fff; text-align: left; padding: 10px 14px; font-size: 10.5px; text-transform: uppercase; }
        .pd-stage-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; }
        .pd-stage-table tbody tr:last-child td { border-bottom: none; }
        .pd-achievement-low { color: #c23c33; font-weight: 700; }
        .pd-achievement-ok { color: #1a8a4c; font-weight: 700; }
        .pd-card-table { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .pd-empty { text-align: center; color: #b7b9c6; padding: 30px; }
      `}</style>

      <div className="pd-filters">
        <div className="pd-filter-item">
          <label className="pd-filter-label">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="pd-filter-item">
          <label className="pd-filter-label">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button className="pd-quick-btn" onClick={() => { setFromDate(todayStr()); setToDate(todayStr()); }}>Today</button>
        <button className="pd-quick-btn" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 6); setFromDate(d.toISOString().split("T")[0]); setToDate(todayStr()); }}>Last 7 Days</button>
        <button className="pd-quick-btn" onClick={() => { setFromDate(monthStr() + "-01"); setToDate(todayStr()); }}>This Month</button>
        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
          <option value="">All Products</option>
          {productList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="pd-top-grid">
        <div className="pd-gauge-card">
          <div className="pd-gauge-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="72%" outerRadius="100%" data={gaugeData} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "#f1f2f6" }} angleAxisId={0} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pd-gauge-center">
              <div className="pd-gauge-pct" style={{ color: gaugeColor }}>{totals.achievement === null ? "-" : `${totals.achievement.toFixed(0)}%`}</div>
              <div className="pd-gauge-label">Achieved</div>
            </div>
          </div>
          <div className="pd-gauge-title">Overall Achievement</div>
        </div>

        <div className="pd-cards">
          <div className="pd-card">
            <div className="pd-card-icon" style={{ background: "#f1f2f6", color: "#5b5f72" }}><Table2 size={18} /></div>
            <div><div className="pd-card-label">Target</div><div className="pd-card-value">{totals.target}</div></div>
          </div>
          <div className="pd-card">
            <div className="pd-card-icon" style={{ background: "#eafaf1", color: "#1a8a4c" }}><CheckIcon /></div>
            <div><div className="pd-card-label">Actual Production</div><div className="pd-card-value" style={{ color: "#1a8a4c" }}>{totals.actual}</div></div>
          </div>
          <div className="pd-card">
            <div className="pd-card-icon" style={{ background: totals.balance < 0 ? "#fdeceb" : "#eafaf1", color: totals.balance < 0 ? "#c23c33" : "#1a8a4c" }}><AlertTriangle size={18} /></div>
            <div><div className="pd-card-label">Balance</div><div className="pd-card-value" style={{ color: totals.balance < 0 ? "#c23c33" : "#1a8a4c" }}>{totals.balance > 0 ? `+${totals.balance}` : totals.balance}</div></div>
          </div>
          <div className="pd-card">
            <div className="pd-card-icon" style={{ background: "#fdeceb", color: "#c23c33" }}><Trash2 size={18} /></div>
            <div><div className="pd-card-label">Total Rejection</div><div className="pd-card-value" style={{ color: "#c23c33" }}>{totals.rejection}</div></div>
          </div>
        </div>
      </div>

      {lowestStage && lowestStage.achievement < 90 && (
        <div className="pd-bottleneck">
          <div className="pd-bottleneck-icon"><AlertTriangle size={18} /></div>
          <div>
            <div className="pd-bottleneck-title">Bottleneck Stage</div>
            <div className="pd-bottleneck-value">{lowestStage.stage} — {lowestStage.achievement.toFixed(1)}% achievement</div>
            <div className="pd-bottleneck-sub">{lowestStage.actual} / {lowestStage.target} — this stage needs attention</div>
          </div>
        </div>
      )}

      <div className="pd-section-title"><TrendingUp size={16} /> 14-Day Production Trend {filterProduct ? `— ${filterProduct}` : ""}</div>
      <div className="pd-chart-card">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="pdActualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1a8a4c" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#1a8a4c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10.5 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #eceef4" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="target" name="Target" stroke="#c3c5d1" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            <Area type="monotone" dataKey="actual" name="Actual" stroke="#1a8a4c" strokeWidth={2.5} fill="url(#pdActualGradient)" dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="pd-charts-grid">
        <div>
          <div className="pd-section-title"><BarChart3 size={16} /> Product-wise (Target vs Actual)</div>
          <div className="pd-chart-card">
            {byProduct.length === 0 ? (
              <div className="pd-empty">No production logged for this filter yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, byProduct.length * 46)}>
                <BarChart data={byProduct} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="product" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #eceef4" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="target" name="Target" fill="#dfe1e8" radius={[0, 6, 6, 0]} barSize={14} />
                  <Bar dataKey="actual" name="Actual" fill="#1a8a4c" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div>
          <div className="pd-section-title"><BarChart3 size={16} /> Stage-wise (Target vs Actual)</div>
          <div className="pd-chart-card">
            {byStage.length === 0 ? (
              <div className="pd-empty">No production logged for this filter yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, byStage.length * 46)}>
                <BarChart data={byStage} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 10.5 }} width={110} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #eceef4" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="target" name="Target" fill="#dfe1e8" radius={[0, 6, 6, 0]} barSize={14} />
                  <Bar dataKey="actual" name="Actual" fill="#f5a623" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="pd-section-title"><Table2 size={16} /> Stage-wise Detail</div>
      <div className="pd-card-table">
        {byStage.length === 0 ? (
          <div className="pd-empty">No production logged for this filter yet.</div>
        ) : (
          <table className="pd-stage-table">
            <thead><tr><th>Stage</th><th>Target</th><th>Actual</th><th>Balance</th><th>Achievement %</th></tr></thead>
            <tbody>
              {byStage.map((s) => (
                <tr key={s.stage}>
                  <td>{s.stage}</td><td>{s.target}</td><td>{s.actual}</td>
                  <td className={s.balance < 0 ? "pd-achievement-low" : "pd-achievement-ok"}>{s.balance > 0 ? `+${s.balance}` : s.balance}</td>
                  <td className={s.achievement !== null && s.achievement < 90 ? "pd-achievement-low" : "pd-achievement-ok"}>
                    {s.achievement === null ? "-" : `${s.achievement.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return <Check size={18} />;
}

/* ============================== DAILY ENTRY ============================== */
function EntryTab({ targets, stages, currentUser, onSaved }) {
  const master = useMasterData();
  const [entryDate, setEntryDate] = useState(todayStr());
  const [shift, setShift] = useState("");
  const [product, setProduct] = useState("");
  const [stage, setStage] = useState("");
  const [actual, setActual] = useState("");
  const [rejection, setRejection] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const department = departmentForItem(product);

  // full canonical stage list for the resolved department — not limited to stages that already have a target
  const stageOptions = useMemo(
    () => stages.filter((s) => s.department === department).sort((a, b) => a.sequence - b.sequence).map((s) => s.stage),
    [stages, department]
  );
  const matchedTarget = targets.find((t) => t.department === department && t.product === product && t.stage === stage);

  function handleProductChange(v) {
    setProduct(v);
    setStage("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!product || !stage || actual === "") {
      setError("Product, Stage and Actual Production are required.");
      return;
    }
    if (!department) {
      setError(`"${product}" isn't mapped to a department yet — check with admin.`);
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("production_log").insert({
      entry_date: entryDate, shift, department, product, stage,
      actual_qty: parseFloat(actual) || 0,
      rejection_qty: parseFloat(rejection) || 0,
      remarks: remarks.trim(),
      created_by: currentUser,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setActual(""); setRejection(""); setRemarks("");
      onSaved();
    }
  }

  return (
    <form className="ent-form" onSubmit={submit}>
      <style>{`
        .ent-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 22px; max-width: 720px; }
        .ent-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 14px; }
        @media (max-width: 640px) { .ent-grid { grid-template-columns: 1fr; } }
        .ent-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .ent-field input, .ent-field select { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; font-family: inherit; }
        .ent-fetch-box { background: #fff4de; border: 1px dashed #f5d29a; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 12.5px; color: #b5620f; display: flex; gap: 16px; flex-wrap: wrap; }
        .ent-fetch-box b { font-size: 14px; }
        .ent-submit { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; padding: 12px 22px; border-radius: 11px; font-weight: 700; font-size: 13.5px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .ent-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .ent-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
        .ent-dept-tag { font-size: 10.5px; font-weight: 700; color: #1d5fc7; background: #e8f1ff; padding: 3px 9px; border-radius: 20px; margin-left: 8px; }
      `}</style>

      {error && <div className="ent-error">{error}</div>}

      <div className="ent-grid">
        <div className="ent-field"><label>Date</label><input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
        <div className="ent-field">
          <label>Shift</label>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">Select shift</option>
            {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="ent-field">
          <label>Product {department && <span className="ent-dept-tag">{department} dept.</span>}</label>
          <ComboBox value={product} onChange={handleProductChange} options={master.items} placeholder="Select product" />
        </div>
        <div className="ent-field">
          <label>Stage / Process</label>
          <ComboBox value={stage} onChange={setStage} options={stageOptions} placeholder={product ? "Select stage" : "Select product first"} />
        </div>
        <div className="ent-field"><label>Actual Production Qty</label><input type="number" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" /></div>
        <div className="ent-field"><label>Rejection Qty (optional)</label><input type="number" value={rejection} onChange={(e) => setRejection(e.target.value)} placeholder="0" /></div>
        <div className="ent-field" style={{ gridColumn: "span 2" }}><label>Remarks (optional)</label><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. machine downtime" /></div>
      </div>

      {matchedTarget && (
        <div className="ent-fetch-box">
          <span>8 Hr Capacity: <b>{matchedTarget.capacity_8hr}</b></span>
          <span>Daily Target: <b>{matchedTarget.daily_target}</b></span>
          <span>Unit: <b>{matchedTarget.unit}</b></span>
        </div>
      )}
      {product && stage && !matchedTarget && (
        <div className="ent-fetch-box" style={{ background: "#fdeceb", borderColor: "#f3c6c3", color: "#c23c33" }}>
          <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> No target defined for this combination yet — set it up in "Target Master".
        </div>
      )}

      <button className="ent-submit" type="submit" disabled={saving}>
        <Plus size={15} /> {saving ? "Saving..." : "Submit Entry"}
      </button>
    </form>
  );
}

/* ============================== PRODUCTION SHEET / REPORT ============================== */
function ReportTab({ joinedRows }) {
  const [filterDate, setFilterDate] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterShift, setFilterShift] = useState("");

  const products = useMemo(() => [...new Set(joinedRows.map((r) => r.product))], [joinedRows]);
  const stages = useMemo(() => [...new Set(joinedRows.map((r) => r.stage))], [joinedRows]);

  const filtered = useMemo(() => {
    return joinedRows.filter((r) => {
      if (filterDate && r.entry_date !== filterDate) return false;
      if (filterMonth && !r.entry_date.startsWith(filterMonth)) return false;
      if (filterDept && r.department !== filterDept) return false;
      if (filterProduct && r.product !== filterProduct) return false;
      if (filterStage && r.stage !== filterStage) return false;
      if (filterShift && r.shift !== filterShift) return false;
      return true;
    });
  }, [joinedRows, filterDate, filterMonth, filterDept, filterProduct, filterStage, filterShift]);

  return (
    <div>
      <style>{`
        .rpt-filters { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 12px; }
        .rpt-filters input, .rpt-filters select { border: 1px solid #e1e3ec; border-radius: 9px; padding: 8px 10px; font-size: 12.5px; }
        .rpt-count { font-size: 12px; color: #9295a8; margin-bottom: 10px; }
        .rpt-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: auto; }
        .rpt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 1150px; }
        .rpt-table thead th { background: #14161f; color: #fff; text-align: left; padding: 10px 12px; font-size: 10.5px; text-transform: uppercase; white-space: nowrap; }
        .rpt-table tbody td { padding: 10px 12px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .rpt-achievement-low { color: #c23c33; font-weight: 700; }
        .rpt-achievement-ok { color: #1a8a4c; font-weight: 700; }
        .rpt-empty { text-align: center; color: #b7b9c6; padding: 30px; }
      `}</style>

      <div className="rpt-filters">
        <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setFilterMonth(""); }} placeholder="Date" />
        <input type="month" value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setFilterDate(""); }} placeholder="Month" />
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
          <option value="">All Products</option>
          {products.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
          <option value="">All Stages</option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
          <option value="">All Shifts</option>
          {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="rpt-count">{filtered.length} record(s)</div>

      <div className="rpt-card">
        {filtered.length === 0 ? (
          <div className="rpt-empty">No production records match this filter.</div>
        ) : (
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Date</th><th>Shift</th><th>Department</th><th>Product</th><th>Stage</th>
                <th>8Hr Capacity</th><th>Target</th><th>Actual</th><th>Balance</th><th>Achievement %</th><th>Rejection</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.entry_date)}</td>
                  <td>{r.shift ? r.shift.split(" ")[0] + " " + r.shift.split(" ")[1] : "-"}</td>
                  <td>{r.department}</td>
                  <td>{r.product}</td>
                  <td>{r.stage}</td>
                  <td>{r.capacity} {r.unit}</td>
                  <td>{r.target} {r.unit}</td>
                  <td>{r.actual_qty} {r.unit}</td>
                  <td className={r.balance < 0 ? "rpt-achievement-low" : "rpt-achievement-ok"}>{r.balance > 0 ? `+${r.balance}` : r.balance}</td>
                  <td className={r.achievement !== null && r.achievement < 90 ? "rpt-achievement-low" : "rpt-achievement-ok"}>
                    {r.achievement === null ? "-" : `${r.achievement.toFixed(1)}%`}
                  </td>
                  <td>{r.rejection_qty}</td>
                  <td>{r.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ============================== TARGET MASTER ============================== */
function TargetTab({ targets, stages, onChanged }) {
  const master = useMasterData();
  const [product, setProduct] = useState("");
  const [stage, setStage] = useState("");
  const [capacity, setCapacity] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const department = departmentForItem(product);
  const stageOptions = useMemo(
    () => stages.filter((s) => s.department === department).sort((a, b) => a.sequence - b.sequence).map((s) => s.stage),
    [stages, department]
  );

  function handleProductChange(v) {
    setProduct(v);
    setStage("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!product || !stage.trim()) {
      setError("Product and Stage are required.");
      return;
    }
    if (!department) {
      setError(`"${product}" isn't mapped to a department yet — check with admin.`);
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("target_master").insert({
      department, product, stage: stage.trim(),
      capacity_8hr: parseFloat(capacity) || 0,
      daily_target: parseFloat(dailyTarget) || 0,
      unit: unit.trim(),
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setProduct(""); setStage(""); setCapacity(""); setDailyTarget(""); setUnit("");
      onChanged();
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditForm({ capacity_8hr: String(t.capacity_8hr), daily_target: String(t.daily_target), unit: t.unit });
  }
  async function saveEdit(id) {
    const { error: err } = await supabase.from("target_master").update({
      capacity_8hr: parseFloat(editForm.capacity_8hr) || 0,
      daily_target: parseFloat(editForm.daily_target) || 0,
      unit: editForm.unit,
    }).eq("id", id);
    if (err) setError(err.message);
    else { setEditingId(null); onChanged(); }
  }
  async function removeTarget(id) {
    if (!confirm("Delete this target? Existing production log entries for it will lose auto-fetched target/capacity.")) return;
    const { error: err } = await supabase.from("target_master").delete().eq("id", id);
    if (err) setError(err.message);
    else onChanged();
  }

  return (
    <div>
      <style>{`
        .tgt-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; margin-bottom: 18px; }
        .tgt-grid { display: grid; grid-template-columns: repeat(3, 1fr) repeat(3, 0.7fr) auto; gap: 10px; align-items: end; }
        @media (max-width: 1000px) { .tgt-grid { grid-template-columns: repeat(2, 1fr); } }
        .tgt-field label { display: block; font-size: 11px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .tgt-field input, .tgt-field select { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 9px 10px; font-size: 12.5px; }
        .tgt-add-btn { border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
        .tgt-error { background: #fdeceb; color: #c23c33; padding: 9px 13px; border-radius: 9px; margin-top: 12px; font-size: 12.5px; font-weight: 600; }
        .tgt-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: auto; }
        .tgt-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 800px; }
        .tgt-table thead th { background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; }
        .tgt-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; }
        .tgt-edit-input { width: 70px; border: 1px solid #f5a623; border-radius: 7px; padding: 6px 8px; font-size: 12px; }
        .tgt-icon-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: flex; align-items: center; justify-content: center; }
        .tgt-icon-btn.danger { color: #d64545; }
        .tgt-icon-btn.save { color: #1a8a4c; background: #eafaf1; border-color: #bfe3cf; }
      `}</style>

      <form className="tgt-form" onSubmit={submit}>
        <div className="tgt-grid">
          <div className="tgt-field">
            <label>Product {department && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#1d5fc7", background: "#e8f1ff", padding: "2px 8px", borderRadius: 20, marginLeft: 6 }}>{department}</span>}</label>
            <ComboBox value={product} onChange={handleProductChange} options={master.items} placeholder="Select product" />
          </div>
          <div className="tgt-field">
            <label>Stage / Process</label>
            <ComboBox value={stage} onChange={setStage} options={stageOptions} placeholder={product ? "Select stage" : "Select product first"} />
          </div>
          <div className="tgt-field"><label>8Hr Capacity</label><input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="0" /></div>
          <div className="tgt-field"><label>Daily Target</label><input type="number" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} placeholder="0" /></div>
          <div className="tgt-field"><label>Unit</label><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Sheets/Nos" /></div>
          <button className="tgt-add-btn" type="submit" disabled={saving}><Plus size={14} style={{ verticalAlign: -2 }} /> {saving ? "Adding..." : "Add"}</button>
        </div>
        {error && <div className="tgt-error">{error}</div>}
      </form>

      <div className="tgt-card">
        <table className="tgt-table">
          <thead><tr><th>Department</th><th>Product</th><th>Stage</th><th>8Hr Capacity</th><th>Daily Target</th><th>Unit</th><th></th></tr></thead>
          <tbody>
            {targets.map((t) => {
              const isEditing = editingId === t.id;
              return (
                <tr key={t.id}>
                  <td>{t.department}</td>
                  <td>{t.product}</td>
                  <td>{t.stage}</td>
                  <td>{isEditing ? <input type="number" className="tgt-edit-input" value={editForm.capacity_8hr} onChange={(e) => setEditForm((f) => ({ ...f, capacity_8hr: e.target.value }))} /> : t.capacity_8hr}</td>
                  <td>{isEditing ? <input type="number" className="tgt-edit-input" value={editForm.daily_target} onChange={(e) => setEditForm((f) => ({ ...f, daily_target: e.target.value }))} /> : t.daily_target}</td>
                  <td>{isEditing ? <input className="tgt-edit-input" value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))} /> : t.unit}</td>
                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="tgt-icon-btn save" onClick={() => saveEdit(t.id)}><Check size={13} /></button>
                        <button className="tgt-icon-btn" onClick={() => setEditingId(null)}><X size={13} /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="tgt-icon-btn" onClick={() => startEdit(t)}><Pencil size={13} /></button>
                        <button className="tgt-icon-btn danger" onClick={() => removeTarget(t.id)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
