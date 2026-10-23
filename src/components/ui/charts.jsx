import { useId } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { CountUp } from "./motion";
import { PALETTE } from "./chartTheme";


const AXIS_TICK = { fontSize: 11, fill: "#9295a8" };
const AXIS_LINE = { stroke: "#eceef4" };
const TOOLTIP_STYLE = {
  borderRadius: 12, border: "1px solid #eceef4", fontSize: 12.5,
  boxShadow: "0 10px 24px rgba(20,22,35,0.12)",
};

const ANIM = { isAnimationActive: true, animationDuration: 1100, animationEasing: "ease-out" };

const hasData = (rows, keys) =>
  rows.length > 0 && rows.some((r) => keys.some((k) => Number(r[k]) > 0));

/** White card with an icon title; fades/rises in. `delay` = stagger index. */
export function ChartCard({ title, icon: Icon, color = PALETTE.blue, delay = 0, children, style }) {
  return (
    <div className="chart-card fx-rise" style={{ "--i": delay, ...style }}>
      <style>{`
        .chart-card { background:#fff; border:1px solid #eceef4; border-radius:16px; padding:16px 18px; min-width:0; }
        .chart-card h6 { margin:0 0 12px; font-family:'Space Grotesk',sans-serif; font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:8px; }
        .chart-chip { width:28px; height:28px; border-radius:9px; display:flex; align-items:center; justify-content:center; }
        .chart-empty { height:100%; display:flex; align-items:center; justify-content:center; color:#b7b9c6; font-size:12.5px; }
        .donut-legend { display:flex; flex-wrap:wrap; gap:6px 14px; justify-content:center; margin-top:8px; }
        .donut-legend span { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:#5b5f72; font-weight:600; }
        .donut-legend i { width:9px; height:9px; border-radius:50%; display:inline-block; }
      `}</style>
      <h6>
        {Icon && (
          <span className="chart-chip" style={{ background: `${color}1f` }}>
            <Icon size={15} style={{ color }} />
          </span>
        )}
        {title}
      </h6>
      {children}
    </div>
  );
}

/** data: [{ name, value, color }] — shows total in the centre. */
export function DonutChart({ data, height = 230, centerLabel = "Total", decimals = 0, emptyText = "No data for this filter." }) {
  const rows = data.filter((d) => Number(d.value) > 0);
  const total = rows.reduce((s, d) => s + Number(d.value), 0);
  if (rows.length === 0) return <div style={{ height }}><div className="chart-empty">{emptyText}</div></div>;

  return (
    <div>
      <div style={{ height, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Pie
              data={rows} dataKey="value" nameKey="name"
              innerRadius="62%" outerRadius="92%" paddingAngle={3} cornerRadius={6}
              startAngle={90} endAngle={-270} stroke="none" {...ANIM}
            >
              {rows.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 800, color: "#1c1e26" }}>
            <CountUp value={total} decimals={decimals} />
          </div>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9295a8", fontWeight: 700 }}>
            {centerLabel}
          </div>
        </div>
      </div>
      <div className="donut-legend">
        {rows.map((d) => <span key={d.name}><i style={{ background: d.color }} />{d.name} ({d.value})</span>)}
      </div>
    </div>
  );
}

/** Smooth gradient area/line. series: [{ key, name, color }] */
export function TrendChart({ data, xKey, series, height = 250, allowDecimals = false, emptyText = "No data for this filter." }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!hasData(data, series.map((s) => s.key))) return <div style={{ height }}><div className="chart-empty">{emptyText}</div></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis allowDecimals={allowDecimals} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Area
              key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5}
              fill={`url(#${uid}-${s.key})`} dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 6 }} {...ANIM}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped vertical bars. series: [{ key, name, color }] */
export function BarCompare({ data, xKey, series, height = 250, allowDecimals = false, emptyText = "No data for this filter." }) {
  if (!hasData(data, series.map((s) => s.key))) return <div style={{ height }}><div className="chart-empty">{emptyText}</div></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval={0} />
          <YAxis allowDecimals={allowDecimals} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(20,22,35,0.04)" }} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[7, 7, 0, 0]}
              {...ANIM} animationBegin={i * 150}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranking bars (good for long labels like party / vendor names). */
export function RankBars({ data, nameKey, valueKey, color = PALETTE.blue, height = 250, valueFormatter, emptyText = "No data for this filter." }) {
  if (!hasData(data, [valueKey])) return <div style={{ height }}><div className="chart-empty">{emptyText}</div></div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f6" horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis
            type="category" dataKey={nameKey} width={110} tick={{ ...AXIS_TICK, fill: "#4a4d5c" }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => (String(v).length > 15 ? `${String(v).slice(0, 14)}…` : v)}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(20,22,35,0.04)" }} formatter={valueFormatter} />
          <Bar dataKey={valueKey} fill={color} radius={[0, 7, 7, 0]} {...ANIM} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
