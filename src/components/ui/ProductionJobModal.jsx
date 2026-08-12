import React, { useCallback, useEffect, useState } from "react";
import { X, Loader2, Factory, ShoppingCart, PlayCircle, CheckCircle2, Package, Download } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { computeMaterialRequirements } from "../../utils/materialCalculator";
import { calculateItemWeight } from "../../utils/weightCalculator";
import { printProductionJob } from "../../utils/printProductionJob";

function poNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
}

export default function ProductionJobModal({ jobId, onClose, onChanged }) {
  const [job, setJob] = useState(null);
  const [jobItems, setJobItems] = useState([]);
  const [bomRows, setBomRows] = useState([]);
  const [rmRows, setRmRows] = useState([]);
  const [fgItems, setFgItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [poFormFor, setPoFormFor] = useState(null); // material name currently showing the PO form
  const [poVendor, setPoVendor] = useState("");
  const [poQty, setPoQty] = useState("");

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const [jobRes, itemsRes, bomRes, rmRes, fgRes] = await Promise.all([
        supabase.from("production_jobs").select("*").eq("id", jobId).single(),
        supabase.from("production_job_items").select("*").eq("job_id", jobId),
        supabase.from("item_bom").select("*, raw_materials(id, name, unit, item_code, category)"),
        supabase.from("rm_stock").select("*, raw_materials(id, name)"),
        supabase.from("fg_items").select("*"),
      ]);
      if (jobRes.error) throw jobRes.error;
      if (itemsRes.error) throw itemsRes.error;
      setJob(jobRes.data);
      setJobItems(itemsRes.data || []);
      setBomRows(bomRes.data || []);
      setRmRows(rmRes.data || []);
      setFgItems(fgRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  if (!jobId) return null;

  // Attach live RM availability to a set of material requirement rows (pure, no fetch)
  function withAvailability(reqs) {
    return reqs.map((req) => {
      const match = rmRows.find((r) => r.raw_materials?.name === req.name);
      const available = match ? Number(match.qty_available) : 0;
      return {
        ...req,
        available,
        isShort: available < req.totalQty,
        shortQty: Math.max(0, req.totalQty - available),
        materialId: match?.material_id || null,
      };
    });
  }

  // Full sheet-style breakdown for ONE produce-item: BOM ID, FG ID, FG Name,
  // Item Code, Category, UOM — everything, scoped to just this item's recipe.
  // Status/shortfall is taken from the job-WIDE aggregate (not checked in isolation),
  // because two items in the same job can compete for the same shared material —
  // an item can only look "OK" on its own while the combined job need is short.
  function buildItemRows(item, aggregateByName) {
    const recipe = bomRows.filter((b) => b.item_name === item.item_name && b.thickness === item.thickness);
    const fgMatch =
      fgItems.find((f) => f.item_name === item.item_name && f.brand === (item.brand || "") && f.size === item.size && f.thickness === item.thickness) ||
      fgItems.find((f) => f.item_name === item.item_name && f.thickness === item.thickness);

    const calc = calculateItemWeight({
      itemName: item.item_name,
      size: item.size,
      thickness: item.thickness,
      qty: item.qty,
    });
    const sqMtr = calc.sqMtrRaw || 0;

    return recipe.map((b) => {
      const totalQty = b.basis === "per_sqmtr" ? sqMtr * (b.qty_per_unit || 0) : (Number(item.qty) || 0) * (b.qty_per_unit || 0);
      const materialName = b.raw_materials?.name || "Unknown";
      const agg = aggregateByName[materialName];
      return {
        key: b.id,
        bomId: b.bom_id || "—",
        fgId: fgMatch?.fg_id || "—",
        fgName: fgMatch?.fg_name || `${item.item_name} ${item.thickness}`,
        itemCode: b.raw_materials?.item_code || "-",
        name: materialName,
        category: b.raw_materials?.category || "-",
        unit: b.raw_materials?.unit || "-",
        totalQty,
        basis: b.basis,
        // job-wide figures (shared across every item that uses this material)
        available: agg ? agg.available : 0,
        isShort: agg ? agg.isShort : false,
        shortQty: agg ? agg.shortQty : 0,
        materialId: b.raw_materials?.id || null,
      };
    });
  }

  // Combined totals across all items — the real gate for Start/Complete actions,
  // and the source of truth for whether any shared material is actually short.
  const aggregateMaterials = withAvailability(
    computeMaterialRequirements(
      jobItems.map((it) => ({ item_name: it.item_name, size: it.size, thickness: it.thickness, qty: it.qty })),
      bomRows
    )
  );
  const aggregateByName = {};
  aggregateMaterials.forEach((m) => { aggregateByName[m.name] = m; });

  // Per-item breakdown — each produce-item gets its OWN material table (own Qty Needed),
  // but the Available/Status columns reflect the shared job-wide stock check above.
  const perItemMaterials = jobItems.map((item) => ({
    item,
    materials: buildItemRows(item, aggregateByName),
  }));

  const allSufficient = aggregateMaterials.length > 0 && aggregateMaterials.every((m) => !m.isShort);
  const materialsLocked = ["In Production", "QC Pending", "Completed"].includes(job?.status);

  async function submitPO(material) {
    if (!poVendor.trim() || !poQty) return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase.from("purchase_orders").insert({
        po_number: poNumber(),
        vendor_name: poVendor.trim(),
        material_id: material.materialId,
        qty_ordered: parseFloat(poQty) || 0,
        status: "Ordered",
      });
      if (err) throw err;
      setPoFormFor(null);
      setPoVendor("");
      setPoQty("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendToPlanning() {
    setBusy(true);
    setError("");
    try {
      const { error: jobErr } = await supabase
        .from("production_jobs")
        .update({ status: "Ready to Schedule" })
        .eq("id", jobId);
      if (jobErr) throw jobErr;

      await load();
      onChanged && onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pjm-overlay" onClick={onClose}>
      <div className="pjm-card" onClick={(e) => e.stopPropagation()}>
        <div className="pjm-header">
          <h4><Factory size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Production Job</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!loading && (
              <button className="pjm-pdf-btn" onClick={() => printProductionJob(job, perItemMaterials)} title="Download / Print as PDF">
                <Download size={14} /> PDF
              </button>
            )}
            <button className="pjm-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="pjm-body">
          {loading ? (
            <div className="pjm-loading"><Loader2 size={20} className="pjm-spin" /></div>
          ) : (
            <>
              <div className="pjm-meta-row">
                <span className="pjm-oid-badge">{job?.job_number}</span>
                <span className="pjm-order-badge">for {job?.order_id}</span>
                <span className={`pjm-status-badge pjm-status-${(job?.status || "").replace(/\s/g, "")}`}>{job?.status}</span>
              </div>

              {error && <div className="pjm-error">{error}</div>}

              {/* Per-item groups — each item's own materials directly beneath it, never mixed */}
              {perItemMaterials.map(({ item, materials }) => (
                <div className="pjm-item-group" key={item.id}>
                  <div className="pjm-item-header">
                    <Package size={15} />
                    <span className="pjm-item-title">{item.item_name} — {item.thickness}, {item.size}</span>
                    {item.brand && <span className="pjm-item-brand">({item.brand})</span>}
                    <span className="pjm-item-qty">{item.qty} pcs</span>
                  </div>

                  <div className="pjm-table-wrap">
                    {materials.length === 0 ? (
                      <div className="pjm-no-recipe">No BOM recipe found for this item — set one up in "BOM Setup".</div>
                    ) : (
                      <table className="pjm-table">
                        <thead>
                          <tr>
                            <th>BOM ID</th><th>FG ID</th><th>FG Name</th><th>Item Code</th>
                            <th>Material</th><th>Category</th><th>UOM</th><th>Qty Needed</th><th>Available</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {materials.map((m) => (
                            <React.Fragment key={m.key}>
                              <tr>
                                <td data-label="BOM ID"><span className="pjm-mono">{m.bomId}</span></td>
                                <td data-label="FG ID"><span className="pjm-fgid">{m.fgId}</span></td>
                                <td data-label="FG Name">{m.fgName}</td>
                                <td data-label="Item Code"><span className="pjm-code">{m.itemCode}</span></td>
                                <td data-label="Material">{m.name}</td>
                                <td data-label="Category"><span className="pjm-cat">{m.category}</span></td>
                                <td data-label="UOM">{m.unit}</td>
                                <td data-label="Qty Needed">
                                  <span className="pjm-qty">{m.totalQty.toFixed(2)}</span>
                                  <span className="pjm-basis">{m.basis === "per_sqmtr" ? "/Sq.Mtr" : "/Pc"}</span>
                                </td>
                                <td data-label="Available">
                                  <span className={`pjm-avail ${m.isShort ? "pjm-avail-low" : ""}`}>{m.available.toFixed(2)} {m.unit}</span>
                                </td>
                                <td data-label="Status">
                                  <span className={`pjm-material-status ${materialsLocked ? "pjm-ok" : (m.isShort ? "pjm-short" : "pjm-ok")}`}>
                                    {materialsLocked ? "Issued" : (m.isShort ? `Short ${m.shortQty.toFixed(2)}` : "OK")}
                                  </span>
                                </td>
                              </tr>
                              {!materialsLocked && m.isShort && (
                                <tr className="pjm-po-row">
                                  <td colSpan={10}>
                                    {poFormFor === `${item.id}_${m.name}` ? (
                                      <div className="pjm-po-form">
                                        <input
                                          className="pjm-po-input"
                                          placeholder="Vendor name"
                                          value={poVendor}
                                          onChange={(e) => setPoVendor(e.target.value)}
                                        />
                                        <input
                                          className="pjm-po-input"
                                          type="number"
                                          placeholder="Qty"
                                          value={poQty}
                                          onChange={(e) => setPoQty(e.target.value)}
                                        />
                                        <button className="pjm-po-submit" disabled={busy} onClick={() => submitPO(m)}>Submit</button>
                                        <button className="pjm-po-cancel" onClick={() => setPoFormFor(null)}>✕</button>
                                      </div>
                                    ) : (
                                      <button
                                        className="pjm-po-btn"
                                        onClick={() => { setPoFormFor(`${item.id}_${m.name}`); setPoQty(m.shortQty.toFixed(2)); }}
                                      >
                                        <ShoppingCart size={13} /> Create Purchase Order for {m.name}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}

              <div className="pjm-actions">
                {job?.status === "Pending Material" && allSufficient && (
                  <button className="pjm-action-btn pjm-action-start" disabled={busy} onClick={sendToPlanning}>
                    <PlayCircle size={16} /> {busy ? "Sending..." : "Send to Planning (PPC)"}
                  </button>
                )}
                {job?.status === "Pending Material" && !allSufficient && (
                  <div className="pjm-hint">Raise Purchase Orders for the short materials above, then receive them in "Purchase Orders" to unlock this step.</div>
                )}
                {job?.status === "Ready to Schedule" && allSufficient && (
                  <div className="pjm-done pjm-done-blue">📋 Materials ready — schedule this job in the "PPC" page.</div>
                )}
                {job?.status === "Ready to Schedule" && !allSufficient && (
                  <div className="pjm-hint">⚠️ Stock has changed since this job was queued. Raise Purchase Orders for the short materials above before scheduling it.</div>
                )}
                {job?.status === "Scheduled" && allSufficient && (
                  <div className="pjm-done pjm-done-blue">🗓️ Scheduled — start it from the "Production" page when ready.</div>
                )}
                {job?.status === "Scheduled" && !allSufficient && (
                  <div className="pjm-hint">⚠️ Scheduled, but stock is short right now (another job may have used it first). Raise a Purchase Order above — "Start Production" will re-check automatically.</div>
                )}
                {job?.status === "In Production" && (
                  <div className="pjm-done pjm-done-blue">🏭 In production — track stage progress on the "Production" page.</div>
                )}
                {job?.status === "QC Pending" && (
                  <div className="pjm-done pjm-done-amber">🔍 Awaiting Quality Check — go to the "QC" page to inspect and pass/reject.</div>
                )}
                {job?.status === "Completed" && (
                  <div className="pjm-done">✅ Production completed — order moved back to Confirmed.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .pjm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 16px; animation: pjm-fade 0.18s ease; }
        @keyframes pjm-fade { from { opacity: 0; } to { opacity: 1; } }
        .pjm-card { width: 100%; max-width: 880px; max-height: 88vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; animation: pjm-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes pjm-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .pjm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .pjm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .pjm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .pjm-pdf-btn {
          border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 8px;
          padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; gap: 6px;
        }
        .pjm-pdf-btn:hover { background: #d9e9ff; }
        .pjm-body { padding: 20px 22px 24px 22px; overflow-y: auto; }
        .pjm-loading { display: flex; justify-content: center; padding: 40px 0; color: #b5620f; }
        .pjm-spin { animation: pjm-spin-anim 0.9s linear infinite; }
        @keyframes pjm-spin-anim { to { transform: rotate(360deg); } }
        .pjm-error { background: #fdeceb; color: #c23c33; padding: 9px 13px; border-radius: 9px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }

        .pjm-meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
        .pjm-oid-badge { background: #14161f; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; padding: 5px 12px; border-radius: 999px; }
        .pjm-order-badge { font-size: 12px; color: #9295a8; }
        .pjm-status-badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-left: auto; }
        .pjm-status-PendingMaterial { background: #fdeceb; color: #c23c33; }
        .pjm-status-ReadytoProduce { background: #fff4de; color: #b5620f; }
        .pjm-status-InProduction { background: #e8f1ff; color: #1d5fc7; }
        .pjm-status-Completed { background: #eafaf1; color: #1a8a4c; }

        .pjm-item-group { border: 1.5px solid #eceef4; border-radius: 14px; padding: 14px; margin-bottom: 14px; background: #fbfbfd; }
        .pjm-item-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; color: #b5620f; }
        .pjm-item-title { font-weight: 700; font-size: 13.5px; color: #1c1e26; }
        .pjm-item-brand { font-size: 11.5px; color: #9295a8; }
        .pjm-item-qty { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 12.5px; background: #fdf3e4; color: #b5620f; padding: 3px 10px; border-radius: 20px; }
        .pjm-no-recipe { font-size: 12px; color: #b7b9c6; padding: 10px; text-align: center; }

        .pjm-no-recipe { font-size: 12px; color: #b7b9c6; padding: 10px; text-align: center; }

        .pjm-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: auto; max-height: 320px; }
        .pjm-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 680px; }
        .pjm-table thead th { position: sticky; top: 0; background: #14161f; color: #fff; text-align: left; padding: 9px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .pjm-table tbody td { padding: 9px 12px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .pjm-table tbody tr:hover { background: #fbfbfd; }
        .pjm-mono { font-family: 'IBM Plex Mono', monospace; color: #4a4d5c; font-size: 11px; }
        .pjm-fgid { font-family: 'IBM Plex Mono', monospace; color: #1d5fc7; font-weight: 700; font-size: 11px; }
        .pjm-code { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-weight: 700; font-size: 11px; }
        .pjm-cat { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; background: #f1f2f6; color: #4a4d5c; }
        .pjm-qty { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1a8a4c; }
        .pjm-basis { font-size: 9.5px; color: #9295a8; margin-left: 3px; }
        .pjm-avail { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #4a4d5c; }
        .pjm-avail-low { color: #c23c33; }
        .pjm-material-status { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
        .pjm-ok { background: #eafaf1; color: #1a8a4c; }
        .pjm-short { background: #fdeceb; color: #c23c33; }
        .pjm-po-btn { border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 8px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .pjm-po-row td { background: #fffaf1; padding: 10px 12px !important; }

        @media (max-width: 700px) {
          .pjm-table-wrap { max-height: none; overflow: visible; }
          .pjm-table, .pjm-table thead, .pjm-table tbody, .pjm-table tr, .pjm-table td { display: block; width: 100%; }
          .pjm-table thead { display: none; }
          .pjm-table tbody tr:not(.pjm-po-row) { border: 1px solid #eceef4; border-radius: 10px; margin-bottom: 8px; padding: 4px 0; }
          .pjm-table tbody tr:not(.pjm-po-row) td { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #f5f6fa; text-align: right; white-space: normal; }
          .pjm-table tbody tr:not(.pjm-po-row) td:last-child { border-bottom: none; }
          .pjm-table tbody tr:not(.pjm-po-row) td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 9.5px; text-transform: uppercase; text-align: left; }
        }
        .pjm-po-form { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .pjm-po-input { border: 1px solid #e1e3ec; border-radius: 8px; padding: 7px 9px; font-size: 12px; flex: 1; min-width: 100px; }
        .pjm-po-submit { border: none; background: #1a8a4c; color: #fff; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .pjm-po-cancel { border: none; background: #f1f2f6; color: #5b5f72; border-radius: 8px; padding: 7px 10px; font-size: 12px; cursor: pointer; }

        .pjm-actions { margin-top: 8px; }
        .pjm-action-btn { width: 100%; border: none; padding: 13px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .pjm-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pjm-action-start { background: linear-gradient(135deg, #f5c343, #f5a623); color: #17130a; box-shadow: 0 6px 16px rgba(245,166,35,0.3); }
        .pjm-action-complete { background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; box-shadow: 0 6px 16px rgba(26,138,76,0.3); }
        .pjm-done { text-align: center; background: #eafaf1; color: #1a8a4c; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 13px; }
        .pjm-done-blue { background: #e8f1ff; color: #1d5fc7; }
        .pjm-done-amber { background: #fff4de; color: #b5620f; }
        .pjm-hint { font-size: 12px; color: #9295a8; text-align: center; margin-top: 10px; }
      `}</style>
    </div>
  );
}
