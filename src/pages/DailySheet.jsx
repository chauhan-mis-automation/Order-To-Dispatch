import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Download, Copy, Printer, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import { BLOCKS as BASE_BLOCKS } from "../lib/productionBlocks";

// Production types = column groups of the client's Excel report.
// glue = Glueline multiplier applied on FA.
export const PROD_TYPES = [
  { id: "DIRECT", label: "Direct Production", glue: 2 },
  { id: "MAT", label: "Mat", glue: 1 },
  { id: "DOUBLE_REFACING", label: "Double Refacing", glue: 1 },
  { id: "MAT_REFACING", label: "Mat Refacing", glue: 1 },
  { id: "SINGLE_REFACING", label: "Single Refacing", glue: 0.5 },
];
const SHIFT_OPTIONS = ["DAY", "NIGHT"];

function todayStr() { return new Date().toISOString().split("T")[0]; }
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });

// Glueline multiplier as in the client's Excel. Only Direct and Mat vary by
// plywood thickness (number of glue layers); everything else is fixed.
const PLY_GLUE = { 4: [1, 1], 6: [2, 1], 9: [3, 2], 12: [4, 3], 16: [5, 4], 19: [6, 5] }; // [DIRECT, MAT]
function glueFactor(product, thickness, typeId) {
  if (product === "PLY" && PLY_GLUE[Number(thickness)]) {
    if (typeId === "DIRECT") return PLY_GLUE[Number(thickness)][0];
    if (typeId === "MAT") return PLY_GLUE[Number(thickness)][1];
  }
  return PROD_TYPES.find((t) => t.id === typeId)?.glue ?? 1;
}

// Same formulas as the Excel sheet.
export function calc(product, thickness, l, w, pcs, typeId) {
  const p = Number(pcs) || 0;
  const fa = l * w * p;
  const na = product === "PLY" ? (fa * thickness) / 4 : (fa * 12) / 4;
  const cbm = (fa * thickness) / 1000;
  const glue = fa * glueFactor(product, thickness, typeId);
  return { pcs: p, fa, na, cbm, glue };
}
// Supabase returns at most 1000 rows per request, so read daily_production page by page.
export async function fetchDailyProduction(from, to) {
  const PAGE = 1000; const out = [];
  for (let off = 0; ; off += PAGE) {
    let q = supabase.from("daily_production").select("*").order("entry_date").order("id").range(off, off + PAGE - 1);
    if (from) q = q.gte("entry_date", from);
    if (to) q = q.lte("entry_date", to);
    const { data, error } = await q;
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

const zero = () => ({ pcs: 0, fa: 0, na: 0, cbm: 0, glue: 0 });
const add = (a, b) => ({ pcs: a.pcs + b.pcs, fa: a.fa + b.fa, na: a.na + b.na, cbm: a.cbm + b.cbm, glue: a.glue + b.glue });

const blockOf = (blocks, product, thickness) => blocks.find((b) => b.product === product && Number(b.thickness) === Number(thickness));
// block id is derived from the row itself, so loading never depends on which sizes are currently known
const blockIdOf = (r) => `${Number(r.thickness)}_MM_${r.product}`;
const sizeDims = (blk, size) => blk?.sizes.find((s) => s.size === size);

export default function DailySheet({ currentUser }) {
  const [view, setView] = useState("entry");
  const [custom, setCustom] = useState([]);
  const loadCustom = useCallback(async () => {
    const { data } = await supabase.from("production_custom_sizes").select("*").order("created_at");
    setCustom(data || []);
  }, []);
  useEffect(() => { loadCustom(); }, [loadCustom]);
  // base sizes from the client's Excel + sizes added by the user in the app
  const blocks = useMemo(() => BASE_BLOCKS.map((b) => ({
    ...b,
    sizes: [
      ...b.sizes,
      ...custom
        .filter((c) => c.product === b.product && Number(c.thickness) === Number(b.thickness) && !b.sizes.some((x) => x.size === c.size))
        .map((c) => ({ size: c.size, l: Number(c.l), w: Number(c.w), custom: true, id: c.id })),
    ],
  })), [custom]);
  return (
    <div className="ds-root">
      <style>{`
        .ds-root { color:#1c1e26; font-size:12.5px; }
        .ds-bar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
        .ds-bar label { font-weight:700; font-size:11.5px; color:#5b5f72; display:flex; flex-direction:column; gap:3px; }
        .ds-in, .ds-sel { border:1px solid #dfe2ec; border-radius:8px; padding:7px 9px; font-size:12.5px; background:#fff; }
        .ds-btn { border:none; background:#14161f; color:#fff; padding:9px 14px; border-radius:9px; font-weight:700; font-size:12px; cursor:pointer; display:inline-flex; gap:6px; align-items:center; }
        .ds-btn.alt { background:#fff; color:#14161f; border:1px solid #dfe2ec; }
        .ds-btn:disabled { opacity:.5; cursor:not-allowed; }
        .ds-chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
        .ds-chip { border:1px solid #dfe2ec; background:#fff; padding:6px 12px; border-radius:20px; font-weight:700; font-size:12px; cursor:pointer; }
        .ds-chip.on { background:#14161f; color:#fff; border-color:#14161f; }
        .ds-chip .dot { display:inline-block; width:6px; height:6px; background:#1a8a4c; border-radius:50%; margin-left:5px; }
        .ds-wrap { overflow:auto; max-height:62vh; border:1px solid #eceef4; border-radius:12px; background:#fff; }
        .ds-tbl { border-collapse:collapse; width:100%; min-width:900px; }
        .ds-tbl th, .ds-tbl td { border-bottom:1px solid #f0f1f6; padding:5px 8px; text-align:right; white-space:nowrap; }
        .ds-tbl th { background:#f7f8fb; position:sticky; top:0; z-index:1; font-size:11px; text-transform:uppercase; color:#5b5f72; }
        .ds-tbl th:first-child, .ds-tbl td:first-child { text-align:left; position:sticky; left:0; background:#fff; font-weight:700; }
        .ds-tbl th:first-child { background:#f7f8fb; z-index:2; }
        .ds-tbl tfoot td { font-weight:800; background:#f7f8fb; position:sticky; bottom:0; }
        .ds-pcs { width:70px; text-align:right; border:1px solid #dfe2ec; border-radius:6px; padding:4px 6px; font-size:12.5px; }
        .ds-pcs:focus { outline:2px solid #1a8a4c; }
        .ds-msg { padding:9px 12px; border-radius:9px; margin-bottom:10px; font-weight:600; }
        .ds-msg.ok { background:#e8f6ee; color:#1a8a4c; } .ds-msg.err { background:#fdeceb; color:#c23c33; }
        .ds-grp { text-align:center !important; border-left:2px solid #eceef4; }
        .ds-h3 { font-size:13px; font-weight:800; margin:18px 0 8px; }
        .ds-print-title { display:none; }
        @media print {
          body * { visibility:hidden !important; }
          .ds-print-area, .ds-print-area * { visibility:visible !important; }
          .ds-print-area { position:absolute; left:0; top:0; width:100%; padding:10px; background:#fff; }
          .ds-print-area .ds-wrap { max-height:none !important; overflow:visible !important; border:none; }
          .ds-print-area .ds-tbl { min-width:0 !important; font-size:10.5px; }
          .ds-print-area .ds-tbl th, .ds-print-area .ds-tbl td { position:static !important; }
          .ds-noprint { display:none !important; }
          .ds-print-title { display:block; font-size:15px; font-weight:800; margin-bottom:8px; }
        }
      `}</style>
      <div className="ds-chips">
        <button className={`ds-chip ${view === "entry" ? "on" : ""}`} onClick={() => setView("entry")}>Entry</button>
        <button className={`ds-chip ${view === "summary" ? "on" : ""}`} onClick={() => setView("summary")}>Monthly Summary</button>
      </div>
      {view === "entry" ? <EntryView currentUser={currentUser} blocks={blocks} reloadSizes={loadCustom} /> : <SummaryView blocks={blocks} />}
    </div>
  );
}

/* ----------------------------- ENTRY ----------------------------- */
function EntryView({ currentUser, blocks, reloadSizes }) {
  const BLOCKS = blocks;
  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState("DAY");
  const [blockId, setBlockId] = useState(BLOCKS[0].id);
  const [pcs, setPcs] = useState({}); // key `${blockId}|${size}|${type}` -> string
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);

  const keyOf = (bid, size, t) => `${bid}|${size}|${t}`;

  // ---- add / remove a size ----
  const [showAdd, setShowAdd] = useState(false);
  const [nUnit, setNUnit] = useState("INCH");
  const [nL, setNL] = useState("");
  const [nW, setNW] = useState("");
  const [nLabel, setNLabel] = useState("");
  const UNIT_M = { INCH: 0.0254, FEET: 0.3048, METRE: 1 };
  const toM = (v) => Math.round(Number(v) * UNIT_M[nUnit] * 10000) / 10000;
  const autoLabel = nL && nW ? `${nL} X ${nW}` : "";

  async function addSize() {
    const blk = BLOCKS.find((b) => b.id === blockId);
    const l = toM(nL); const w = toM(nW);
    const label = (nLabel || autoLabel).trim();
    if (!(l > 0) || !(w > 0) || !label) { setMsg({ t: "err", m: "Enter length, width and size name" }); return; }
    if (blk.sizes.some((x) => x.size.toUpperCase() === label.toUpperCase())) { setMsg({ t: "err", m: `Size "${label}" already exists in ${blk.label}` }); return; }
    const { error } = await supabase.from("production_custom_sizes").insert({ product: blk.product, thickness: blk.thickness, size: label, l, w, created_by: currentUser?.name || currentUser?.username || null });
    if (error) { setMsg({ t: "err", m: error.message }); return; }
    setNL(""); setNW(""); setNLabel(""); setShowAdd(false);
    setMsg({ t: "ok", m: `Added size ${label} (${l} × ${w} m) to ${blk.label}` });
    reloadSizes();
  }

  async function removeSize(blk, s) {
    const { count } = await supabase.from("daily_production").select("id", { count: "exact", head: true }).eq("product", blk.product).eq("thickness", blk.thickness).eq("size", s.size);
    if (count > 0) { setMsg({ t: "err", m: `Size ${s.size} has ${count} saved entries, so it cannot be removed` }); return; }
    if (!window.confirm(`Remove size ${s.size} from ${blk.label}?`)) return;
    const { error } = await supabase.from("production_custom_sizes").delete().eq("id", s.id);
    if (error) setMsg({ t: "err", m: error.message });
    else { setMsg({ t: "ok", m: `Removed size ${s.size}` }); reloadSizes(); }
  }

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.from("daily_production").select("*").eq("entry_date", date).eq("shift", shift);
    if (error) { setMsg({ t: "err", m: error.message }); setLoading(false); return; }
    const m = {};
    (data || []).forEach((r) => {
      m[keyOf(blockIdOf(r), r.size, r.prod_type)] = String(Number(r.pcs));
    });
    setPcs(m); setDirty(false); setLoading(false);
  }, [date, shift]);
  useEffect(() => { load(); }, [load]);

  const block = BLOCKS.find((b) => b.id === blockId);

  const rowCalc = (blk, s) => PROD_TYPES.reduce((acc, t) => add(acc, calc(blk.product, blk.thickness, s.l, s.w, pcs[keyOf(blk.id, s.size, t.id)], t.id)), zero());
  const blockTotal = (blk) => blk.sizes.reduce((acc, s) => add(acc, rowCalc(blk, s)), zero());
  const typeTotal = (blk, t) => blk.sizes.reduce((acc, s) => add(acc, calc(blk.product, blk.thickness, s.l, s.w, pcs[keyOf(blk.id, s.size, t.id)], t.id)), zero());
  const grand = BLOCKS.reduce((acc, b) => add(acc, blockTotal(b)), zero());

  async function save() {
    setSaving(true); setMsg(null);
    const upserts = []; const dels = [];
    BLOCKS.forEach((b) => b.sizes.forEach((s) => PROD_TYPES.forEach((t) => {
      const raw = pcs[keyOf(b.id, s.size, t.id)];
      const n = Number(raw);
      const base = { entry_date: date, shift, product: b.product, thickness: b.thickness, size: s.size, prod_type: t.id };
      if (raw !== undefined && raw !== "" && n > 0) upserts.push({ ...base, pcs: n, created_by: currentUser?.name || currentUser?.username || null });
      else dels.push(base);
    })));
    let err = null;
    if (upserts.length) {
      const { error } = await supabase.from("daily_production").upsert(upserts, { onConflict: "entry_date,shift,product,thickness,size,prod_type" });
      err = error;
    }
    if (!err) {
      // remove rows that were cleared/zeroed for this date+shift
      const keep = new Set(upserts.map((u) => `${u.product}|${u.thickness}|${u.size}|${u.prod_type}`));
      const { data: existing, error: e2 } = await supabase.from("daily_production").select("id,product,thickness,size,prod_type").eq("entry_date", date).eq("shift", shift);
      if (e2) err = e2;
      else {
        const ids = (existing || []).filter((r) => !keep.has(`${r.product}|${Number(r.thickness)}|${r.size}|${r.prod_type}`)).map((r) => r.id);
        if (ids.length) { const { error } = await supabase.from("daily_production").delete().in("id", ids); err = error; }
      }
    }
    setSaving(false);
    if (err) setMsg({ t: "err", m: err.message });
    else { setMsg({ t: "ok", m: `Saved ${date} ${shift} shift (${upserts.length} entries)` }); setDirty(false); }
  }

  function downloadCsv() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Date", "Shift", "Product", "Thickness", "Size", "Type", "PCS", "F.A.", "N.A.", "CBM", "Glueline"].map(q).join(",")];
    BLOCKS.forEach((b) => b.sizes.forEach((sz) => PROD_TYPES.forEach((t) => {
      const raw = pcs[keyOf(b.id, sz.size, t.id)];
      if (!(Number(raw) > 0)) return;
      const c = calc(b.product, b.thickness, sz.l, sz.w, raw, t.id);
      lines.push([date, shift, b.product, b.thickness, sz.size, t.label, c.pcs, r2(c.fa), r2(c.na), Math.round(c.cbm * 1000) / 1000, r2(c.glue)].map(q).join(","));
    })));
    lines.push(["TOTAL", shift, "", "", "", "", grand.pcs, r2(grand.fa), r2(grand.na), Math.round(grand.cbm * 1000) / 1000, r2(grand.glue)].map(q).join(","));
    if (lines.length === 2) { setMsg({ t: "err", m: "No PCS entered for this date and shift" }); return; }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Production_${date}_${shift}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copyFromPrev() {
    // copies sizes/rows (as blanks to fill) is pointless; instead copy the previous day's same-shift PCS as a starting point
    const { data } = await supabase.from("daily_production").select("entry_date").eq("shift", shift).lt("entry_date", date).order("entry_date", { ascending: false }).limit(1);
    if (!data?.length) { setMsg({ t: "err", m: "No earlier entry found for this shift" }); return; }
    const d = data[0].entry_date;
    const { data: rows } = await supabase.from("daily_production").select("*").eq("entry_date", d).eq("shift", shift);
    const m = {};
    (rows || []).forEach((r) => { m[keyOf(blockIdOf(r), r.size, r.prod_type)] = String(Number(r.pcs)); });
    setPcs(m); setDirty(true); setMsg({ t: "ok", m: `Copied from ${d}. Edit and press Save.` });
  }

  return (
    <>
      <div className="ds-bar">
        <label>Date<input className="ds-in" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Shift
          <select className="ds-sel" value={shift} onChange={(e) => setShift(e.target.value)}>
            {SHIFT_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button className="ds-btn alt" onClick={downloadCsv} disabled={loading}><FileDown size={13} /> Download CSV</button>
        <button className="ds-btn alt" onClick={copyFromPrev} disabled={loading}><Copy size={13} /> Copy previous day</button>
        <button className="ds-btn" onClick={save} disabled={saving || loading}>{saving ? <Loader2 size={13} className="prod-spin" /> : <Save size={13} />} Save {dirty ? "*" : ""}</button>
      </div>
      {msg && <div className={`ds-msg ${msg.t}`}>{msg.m}</div>}

      <div className="ds-chips">
        {BLOCKS.map((b) => {
          const has = blockTotal(b).pcs > 0;
          return <button key={b.id} className={`ds-chip ${b.id === blockId ? "on" : ""}`} onClick={() => setBlockId(b.id)}>{b.label}{has && <span className="dot" />}</button>;
        })}
      </div>

      <div style={{ marginBottom: 10 }}>
        <button className="ds-btn alt" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "Cancel" : `+ Add size in ${block.label}`}</button>
        {showAdd && (
          <div className="ds-bar" style={{ marginTop: 10, padding: 12, border: "1px solid #eceef4", borderRadius: 12, background: "#fff" }}>
            <label>Unit
              <select className="ds-sel" value={nUnit} onChange={(e) => setNUnit(e.target.value)}>
                <option value="INCH">Inch (e.g. 72 × 24)</option><option value="FEET">Feet (e.g. 8 × 4)</option><option value="METRE">Metre</option>
              </select>
            </label>
            <label>Length<input className="ds-in" type="number" step="any" style={{ width: 90 }} value={nL} onChange={(e) => setNL(e.target.value)} /></label>
            <label>Width<input className="ds-in" type="number" step="any" style={{ width: 90 }} value={nW} onChange={(e) => setNW(e.target.value)} /></label>
            <label>Size name<input className="ds-in" style={{ width: 110 }} placeholder={autoLabel || "e.g. 72 X 24"} value={nLabel} onChange={(e) => setNLabel(e.target.value)} /></label>
            <div style={{ fontWeight: 700, alignSelf: "flex-end", paddingBottom: 8 }}>{nL && nW ? `= ${toM(nL)} × ${toM(nW)} m` : ""}</div>
            <button className="ds-btn" onClick={addSize}>Add size</button>
          </div>
        )}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="prod-spin" /></div> : (
        <div className="ds-wrap">
          <table className="ds-tbl">
            <thead>
              <tr>
                <th>{block.label} · Size</th><th>L × W (m)</th>
                {PROD_TYPES.map((t) => <th key={t.id} className="ds-grp">{t.label}<br />PCS</th>)}
                <th className="ds-grp">F.A.</th><th>N.A.</th><th>C.B.M.</th><th>Glueline</th>
              </tr>
            </thead>
            <tbody>
              {block.sizes.map((s) => {
                const rc = rowCalc(block, s);
                return (
                  <tr key={s.size}>
                    <td>{s.size}{s.custom && <button title="Remove this added size" onClick={() => removeSize(block, s)} style={{ marginLeft: 6, border: "none", background: "transparent", color: "#c23c33", cursor: "pointer", fontWeight: 800 }}>×</button>}</td>
                    <td>{s.l} × {s.w}</td>
                    {PROD_TYPES.map((t) => (
                      <td key={t.id} className="ds-grp">
                        <input className="ds-pcs" type="number" min="0" inputMode="numeric" value={pcs[keyOf(block.id, s.size, t.id)] ?? ""}
                          onChange={(e) => { setPcs((p) => ({ ...p, [keyOf(block.id, s.size, t.id)]: e.target.value })); setDirty(true); }} />
                      </td>
                    ))}
                    <td className="ds-grp">{rc.pcs ? fmt(rc.fa) : "-"}</td>
                    <td>{rc.pcs ? fmt(rc.na) : "-"}</td>
                    <td>{rc.pcs ? fmt(rc.cbm, 3) : "-"}</td>
                    <td>{rc.pcs ? fmt(rc.glue) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td><td />
                {PROD_TYPES.map((t) => <td key={t.id} className="ds-grp">{fmt(typeTotal(block, t).pcs, 0)}</td>)}
                {(() => { const bt = blockTotal(block); return <><td className="ds-grp">{fmt(bt.fa)}</td><td>{fmt(bt.na)}</td><td>{fmt(bt.cbm, 3)}</td><td>{fmt(bt.glue)}</td></>; })()}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="ds-h3">{block.label} · type-wise total</div>
      <div className="ds-wrap" style={{ maxHeight: "none" }}>
        <table className="ds-tbl" style={{ minWidth: 700 }}>
          <thead><tr><th>Type</th><th>PCS</th><th>F.A.</th><th>N.A.</th><th>C.B.M.</th><th>Glueline</th></tr></thead>
          <tbody>
            {PROD_TYPES.map((t) => { const c = typeTotal(block, t); return <tr key={t.id}><td>{t.label}</td><td>{fmt(c.pcs, 0)}</td><td>{fmt(c.fa)}</td><td>{fmt(c.na)}</td><td>{fmt(c.cbm, 3)}</td><td>{fmt(c.glue)}</td></tr>; })}
          </tbody>
          <tfoot>{(() => { const bt = blockTotal(block); return <tr><td>BLOCK TOTAL</td><td>{fmt(bt.pcs, 0)}</td><td>{fmt(bt.fa)}</td><td>{fmt(bt.na)}</td><td>{fmt(bt.cbm, 3)}</td><td>{fmt(bt.glue)}</td></tr>; })()}</tfoot>
        </table>
      </div>

      <div className="ds-h3">{date} · {shift} shift totals</div>
      <div className="ds-wrap" style={{ maxHeight: "none" }}>
        <table className="ds-tbl" style={{ minWidth: 700 }}>
          <thead><tr><th>Group</th><th>PCS</th><th>F.A.</th><th>N.A.</th><th>C.B.M.</th><th>Glueline</th></tr></thead>
          <tbody>
            {[["BLOCK BOARD TOTAL", "BB"], ["FLUSH DOOR TOTAL", "FD"], ["PLYWOOD TOTAL", "PLY"]].map(([label, prod]) => {
              const g = BLOCKS.filter((b) => b.product === prod).reduce((a, b) => add(a, blockTotal(b)), zero());
              return <tr key={prod}><td>{label}</td><td>{fmt(g.pcs, 0)}</td><td>{fmt(g.fa)}</td><td>{fmt(g.na)}</td><td>{fmt(g.cbm, 3)}</td><td>{fmt(g.glue)}</td></tr>;
            })}
          </tbody>
          <tfoot><tr><td>{shift} SHIFT TOTAL</td><td>{fmt(grand.pcs, 0)}</td><td>{fmt(grand.fa)}</td><td>{fmt(grand.na)}</td><td>{fmt(grand.cbm, 3)}</td><td>{fmt(grand.glue)}</td></tr></tfoot>
        </table>
      </div>

      <div className="ds-h3">{date} · {shift} shift · type-wise total (all products)</div>
      <div className="ds-wrap" style={{ maxHeight: "none" }}>
        <table className="ds-tbl" style={{ minWidth: 700 }}>
          <thead><tr><th>Type</th><th>PCS</th><th>F.A.</th><th>N.A.</th><th>C.B.M.</th><th>Glueline</th></tr></thead>
          <tbody>
            {PROD_TYPES.map((t) => { const c = BLOCKS.reduce((a, b) => add(a, typeTotal(b, t)), zero()); return <tr key={t.id}><td>{t.label}</td><td>{fmt(c.pcs, 0)}</td><td>{fmt(c.fa)}</td><td>{fmt(c.na)}</td><td>{fmt(c.cbm, 3)}</td><td>{fmt(c.glue)}</td></tr>; })}
          </tbody>
          <tfoot><tr><td>{shift} SHIFT TOTAL</td><td>{fmt(grand.pcs, 0)}</td><td>{fmt(grand.fa)}</td><td>{fmt(grand.na)}</td><td>{fmt(grand.cbm, 3)}</td><td>{fmt(grand.glue)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ----------------------------- SUMMARY ----------------------------- */
function SummaryView({ blocks }) {
  const BLOCKS = blocks;
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true); setErr("");
      const from = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const to = new Date(Date.UTC(y, m, 0)).toISOString().split("T")[0];
      const { data, error } = await fetchDailyProduction(from, to);
      if (error) setErr(error.message); else setRows(data || []);
      setLoading(false);
    })();
  }, [month]);

  const enriched = useMemo(() => rows.map((r) => {
    const blk = blockOf(BLOCKS, r.product, r.thickness); const d = sizeDims(blk, r.size);
    if (!d) return null;
    return { ...r, ...calc(r.product, Number(r.thickness), d.l, d.w, r.pcs, r.prod_type) };
  }).filter(Boolean), [rows, BLOCKS]);

  const PRODUCTS = ["PLY", "BB", "FD"];
  const matrix = useMemo(() => {
    const m = {};
    PROD_TYPES.forEach((t) => { m[t.id] = {}; PRODUCTS.forEach((p) => { m[t.id][p] = zero(); }); });
    enriched.forEach((r) => { m[r.prod_type][r.product] = add(m[r.prod_type][r.product], r); });
    return m;
  }, [enriched]);

  const days = useMemo(() => {
    const m = {};
    enriched.forEach((r) => {
      const d = (m[r.entry_date] ||= { DAY: zero(), NIGHT: zero() });
      d[r.shift] = add(d[r.shift] || zero(), r);
    });
    return Object.keys(m).sort().map((k) => ({ date: k, ...m[k] }));
  }, [enriched]);

  const total = enriched.reduce((a, r) => add(a, r), zero());
  const nDays = days.length;
  const refacingPcs = enriched.filter((r) => /REFACING/.test(r.prod_type)).reduce((a, r) => a + r.pcs, 0);

  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    const sum = [["Type", "Product", "PCS", "F.A.", "N.A.", "CBM", "Glueline"]];
    PROD_TYPES.forEach((t) => PRODUCTS.forEach((p) => { const c = matrix[t.id][p]; sum.push([t.label, p, c.pcs, r2(c.fa), r2(c.na), r2(c.cbm), r2(c.glue)]); }));
    sum.push(["TOTAL", "", total.pcs, r2(total.fa), r2(total.na), r2(total.cbm), r2(total.glue)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), "Summary");
    const dd = [["Date", "Shift", "PCS", "F.A.", "N.A.", "CBM", "Glueline"]];
    days.forEach((d) => ["DAY", "NIGHT"].forEach((s) => { const c = d[s]; if (c.pcs) dd.push([d.date, s, c.pcs, r2(c.fa), r2(c.na), r2(c.cbm), r2(c.glue)]); }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dd), "Day-wise");
    const det = [["Date", "Shift", "Product", "Thickness", "Size", "Type", "PCS", "F.A.", "N.A.", "CBM", "Glueline"]];
    enriched.slice().sort((a, b) => a.entry_date.localeCompare(b.entry_date)).forEach((r) => det.push([r.entry_date, r.shift, r.product, Number(r.thickness), r.size, r.prod_type, r.pcs, r2(r.fa), r2(r.na), r2(r.cbm), r2(r.glue)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), "Detail");
    XLSX.writeFile(wb, `Production_${month}.xlsx`);
  }

  return (
    <>
      <div className="ds-bar ds-noprint">
        <label>Month<input className="ds-in" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <div style={{ flex: 1 }} />
        <button className="ds-btn alt" onClick={() => window.print()} disabled={!enriched.length}><Printer size={13} /> Print</button>
        <button className="ds-btn alt" onClick={exportXlsx} disabled={!enriched.length}><Download size={13} /> Export Excel</button>
      </div>
      {err && <div className="ds-msg err">{err}</div>}
      {loading ? <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="prod-spin" /></div> : (
        <div className="ds-print-area">
          <div className="ds-print-title">Production Summary · {month}</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {nDays} days with entries · Total {fmt(total.pcs, 0)} pcs · F.A. {fmt(total.fa)} · N.A. {fmt(total.na)} · CBM {fmt(total.cbm, 3)} · Daily avg {nDays ? fmt(total.pcs / nDays, 0) : 0} pcs · Refacing {fmt(refacingPcs, 0)} pcs
          </div>
          <div className="ds-wrap">
            <table className="ds-tbl" style={{ minWidth: 700 }}>
              <thead><tr><th>Type</th>{PRODUCTS.map((p) => <th key={p}>{p} PCS</th>)}<th>Total PCS</th><th>F.A.</th><th>N.A.</th><th>CBM</th><th>Glueline</th></tr></thead>
              <tbody>
                {PROD_TYPES.map((t) => {
                  const tt = PRODUCTS.reduce((a, p) => add(a, matrix[t.id][p]), zero());
                  return <tr key={t.id}><td>{t.label}</td>{PRODUCTS.map((p) => <td key={p}>{fmt(matrix[t.id][p].pcs, 0)}</td>)}<td>{fmt(tt.pcs, 0)}</td><td>{fmt(tt.fa)}</td><td>{fmt(tt.na)}</td><td>{fmt(tt.cbm, 3)}</td><td>{fmt(tt.glue)}</td></tr>;
                })}
              </tbody>
              <tfoot><tr><td>MTD TOTAL</td>{PRODUCTS.map((p) => <td key={p}>{fmt(PROD_TYPES.reduce((a, t) => a + matrix[t.id][p].pcs, 0), 0)}</td>)}<td>{fmt(total.pcs, 0)}</td><td>{fmt(total.fa)}</td><td>{fmt(total.na)}</td><td>{fmt(total.cbm, 3)}</td><td>{fmt(total.glue)}</td></tr></tfoot>
            </table>
          </div>

          <div className="ds-h3">Day-wise</div>
          <div className="ds-wrap">
            <table className="ds-tbl" style={{ minWidth: 700 }}>
              <thead><tr><th>Date</th><th>Day PCS</th><th>Night PCS</th><th>Total PCS</th><th>F.A.</th><th>N.A.</th><th>CBM</th><th>Glueline</th></tr></thead>
              <tbody>
                {days.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center" }}>No entries this month</td></tr>}
                {days.map((d) => { const t = add(d.DAY, d.NIGHT); return <tr key={d.date}><td>{d.date.split("-").reverse().join("/")}</td><td>{fmt(d.DAY.pcs, 0)}</td><td>{fmt(d.NIGHT.pcs, 0)}</td><td>{fmt(t.pcs, 0)}</td><td>{fmt(t.fa)}</td><td>{fmt(t.na)}</td><td>{fmt(t.cbm, 3)}</td><td>{fmt(t.glue)}</td></tr>; })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}