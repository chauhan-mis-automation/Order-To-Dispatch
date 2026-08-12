import React, { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ITEM_ABBR = {
  "PLYWOOD": "PLY",
  "BLOCKBOARD": "BLK",
  "FLUSH DOOR": "FLD",
  "MEMBRANE DOOR": "MDR",
  "PVC MEMBRANE DOOR": "PVM",
  "PVC VENEER DOOR": "PVV",
  "SUPER PVC": "SPV",
};

function abbreviate(itemName) {
  const upper = (itemName || "").trim().toUpperCase();
  if (ITEM_ABBR[upper]) return ITEM_ABBR[upper];
  return upper.replace(/[^A-Z]/g, "").slice(0, 3) || "ITM";
}

async function ensureFgCatalogEntry(item) {
  const { data: fgMatch } = await supabase
    .from("fg_items")
    .select("fg_id")
    .eq("item_name", item.item_name)
    .eq("brand", item.brand || "")
    .eq("size", item.size)
    .eq("thickness", item.thickness)
    .maybeSingle();
  if (fgMatch) return fgMatch.fg_id;

  const abbr = abbreviate(item.item_name);
  const { data: existingCodes } = await supabase.from("fg_items").select("fg_id").like("fg_id", `FG-${abbr}-%`);
  let maxSeq = 0;
  (existingCodes || []).forEach((r) => {
    const seq = parseInt(String(r.fg_id).split("-")[2], 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  const newFgId = `FG-${abbr}-${String(maxSeq + 1).padStart(3, "0")}`;
  const fgName = `${item.item_name} ${item.thickness} ${item.size}${item.brand ? ` (${item.brand})` : ""}`;

  const { error: insErr } = await supabase.from("fg_items").insert({
    fg_id: newFgId, fg_name: fgName, item_name: item.item_name, brand: item.brand || "", size: item.size, thickness: item.thickness,
  });
  if (insErr) return null;
  return newFgId;
}

export default function QC({ currentUser }) {
  const [jobs, setJobs] = useState([]);
  const [jobItemsMap, setJobItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formState, setFormState] = useState({}); // `${jobId}_${itemId}` -> { passed, rejected }
  const [remarks, setRemarks] = useState({});
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: jobRows, error: jobErr } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("status", "QC Pending")
      .order("created_at", { ascending: true });
    if (jobErr) {
      setError(jobErr.message);
      setLoading(false);
      return;
    }
    setJobs(jobRows || []);

    const jobIds = (jobRows || []).map((j) => j.id);
    if (jobIds.length > 0) {
      const { data: items } = await supabase.from("production_job_items").select("*").in("job_id", jobIds);
      const map = {};
      (items || []).forEach((it) => {
        if (!map[it.job_id]) map[it.job_id] = [];
        map[it.job_id].push(it);
      });
      setJobItemsMap(map);

      setFormState((prev) => {
        const next = { ...prev };
        (items || []).forEach((it) => {
          const key = `${it.job_id}_${it.id}`;
          if (!next[key]) next[key] = { passed: it.qty, rejected: 0 };
        });
        return next;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateQty(jobId, item, field, value) {
    const key = `${jobId}_${item.id}`;
    setFormState((prev) => {
      const current = prev[key] || { passed: item.qty, rejected: 0 };
      const next = { ...current, [field]: value };
      return { ...prev, [key]: next };
    });
  }

  async function submitQC(job) {
    const items = jobItemsMap[job.id] || [];
    setSaving(job.id);
    setError("");
    try {
      const reworkNeeded = []; // items with rejected > 0 -> need a fresh production job

      for (const item of items) {
        const key = `${job.id}_${item.id}`;
        const vals = formState[key] || { passed: item.qty, rejected: 0 };
        const passed = parseFloat(vals.passed) || 0;
        const rejected = parseFloat(vals.rejected) || 0;

        if (passed + rejected > Number(item.qty) + 0.001) {
          throw new Error(`${item.item_name}: Passed + Rejected exceeds produced quantity (${item.qty}).`);
        }

        await supabase.from("qc_checks").insert({
          job_id: job.id,
          item_name: item.item_name,
          brand: item.brand || "",
          size: item.size,
          thickness: item.thickness,
          total_qty: item.qty,
          passed_qty: passed,
          rejected_qty: rejected,
          remarks: remarks[job.id] || null,
          checked_by: currentUser,
        });

        if (passed > 0) {
          const [{ data: existing }, fgId] = await Promise.all([
            supabase
              .from("fg_stock")
              .select("*")
              .eq("item_name", item.item_name)
              .eq("brand", item.brand || "")
              .eq("size", item.size)
              .eq("thickness", item.thickness)
              .maybeSingle(),
            ensureFgCatalogEntry(item),
          ]);

          if (existing) {
            await supabase
              .from("fg_stock")
              .update({
                qty_available: Number(existing.qty_available) + passed,
                fg_id: existing.fg_id || fgId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("fg_stock").insert({
              fg_id: fgId,
              item_name: item.item_name, brand: item.brand || "", size: item.size, thickness: item.thickness, qty_available: passed,
            });
          }
        }

        // rejected pieces mean the order is still short by that many pieces —
        // queue a fresh rework production job for exactly that shortfall.
        if (rejected > 0) {
          reworkNeeded.push({ item, rejected });
        }
      }

      const { error: jobErr } = await supabase
        .from("production_jobs")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      if (jobErr) throw jobErr;

      // Create rework job(s) for any rejected quantity — reuses the exact
      // same Indent -> PPC -> Production -> QC cycle for just the shortfall.
      for (const { item, rejected } of reworkNeeded) {
        const jobNumber = `JOB-RWK-${job.order_id.split("/").pop()}-${Date.now().toString().slice(-5)}`;
        const { data: reworkJob, error: reworkErr } = await supabase
          .from("production_jobs")
          .insert({ job_number: jobNumber, order_id: job.order_id, status: "Pending Material" })
          .select()
          .single();
        if (reworkErr) throw reworkErr;

        const { error: reworkItemErr } = await supabase.from("production_job_items").insert({
          job_id: reworkJob.id,
          item_name: item.item_name,
          brand: item.brand || "",
          size: item.size,
          thickness: item.thickness,
          qty: rejected,
        });
        if (reworkItemErr) throw reworkItemErr;
      }

      // Only move the order back to Picking once EVERY job for it (including
      // any rework job just created above) is Completed.
      const { data: siblingJobs, error: siblingErr } = await supabase
        .from("production_jobs")
        .select("id, status")
        .eq("order_id", job.order_id)
        .neq("status", "Completed");
      if (siblingErr) throw siblingErr;

      if (!siblingJobs || siblingJobs.length === 0) {
        const { error: orderErr } = await supabase.from("orders").update({ status: "Confirmed" }).eq("order_id", job.order_id);
        if (orderErr) throw orderErr;
      } else if (reworkNeeded.length > 0) {
        // make sure the order stays flagged as needing more production
        await supabase.from("orders").update({ status: "Indent Raised" }).eq("order_id", job.order_id);
      }

      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="qc-root">
      <style>{`
        .qc-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .qc-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; }
        .qc-job-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
        .qc-job-badge { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; background: #14161f; color: #fff; padding: 5px 12px; border-radius: 999px; }
        .qc-order-badge { font-size: 12px; color: #9295a8; }

        .qc-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: auto; margin-bottom: 16px; }
        .qc-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
        .qc-table thead th { background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .qc-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; vertical-align: middle; }
        .qc-table tbody tr:last-child td { border-bottom: none; }
        .qc-item-name { font-weight: 700; }
        .qc-item-spec { font-size: 11px; color: #9295a8; margin-top: 2px; }
        .qc-produced-badge { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #4a4d5c; background: #f1f2f6; padding: 6px 10px; border-radius: 8px; text-align: center; display: inline-block; min-width: 40px; }
        .qc-num-input { width: 74px; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 8px; padding: 7px 9px; font-size: 13px; text-align: center; }
        .qc-num-input.passed { border-color: #bfe3cf; }
        .qc-num-input.rejected { border-color: #f3c6c3; }
        .qc-rework-note { font-size: 10.5px; color: #c23c33; font-weight: 700; margin-top: 4px; display: flex; align-items: center; gap: 3px; }

        .qc-remark { margin-bottom: 14px; }
        .qc-remark label { display: block; font-size: 11.5px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .qc-remark input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 12px; font-size: 13px; }

        .qc-submit-btn {
          width: 100%; border: none; padding: 12px; border-radius: 11px; font-weight: 700; font-size: 13.5px; cursor: pointer;
          background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .qc-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .qc-empty { text-align: center; color: #b7b9c6; padding: 40px; background: #fff; border: 1px solid #eceef4; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .qc-loading { display: flex; justify-content: center; padding: 40px 0; }
        .qc-spin { animation: qc-spin-anim 0.9s linear infinite; }
        @keyframes qc-spin-anim { to { transform: rotate(360deg); } }
        .qc-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }

        @media (max-width: 700px) {
          .qc-table thead { display: none; }
          .qc-table, .qc-table tbody, .qc-table tr, .qc-table td { display: block; width: 100%; }
          .qc-table tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; padding: 4px 0; }
          .qc-table td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid #f5f6fa; }
          .qc-table td:last-child { border-bottom: none; }
          .qc-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10px; text-transform: uppercase; }
        }
      `}</style>

      {error && <div className="qc-error">{error}</div>}

      {loading ? (
        <div className="qc-loading"><Loader2 size={22} className="qc-spin" /></div>
      ) : jobs.length === 0 ? (
        <div className="qc-empty"><ClipboardCheck size={24} /><div>No jobs waiting for QC right now.</div></div>
      ) : (
        jobs.map((job) => {
          const items = jobItemsMap[job.id] || [];
          return (
            <div className="qc-card" key={job.id}>
              <div className="qc-job-top">
                <span className="qc-job-badge">{job.job_number}</span>
                <span className="qc-order-badge">for {job.order_id}</span>
              </div>

              <div className="qc-table-wrap">
                <table className="qc-table">
                  <thead>
                    <tr>
                      <th>Item</th><th>Produced</th><th>Passed Qty</th><th>Rejected Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const key = `${job.id}_${item.id}`;
                      const vals = formState[key] || { passed: item.qty, rejected: 0 };
                      const rejectedNum = parseFloat(vals.rejected) || 0;
                      return (
                        <tr key={item.id}>
                          <td data-label="Item">
                            <div className="qc-item-name">{item.item_name}</div>
                            <div className="qc-item-spec">{item.thickness}, {item.size}{item.brand ? ` (${item.brand})` : ""}</div>
                          </td>
                          <td data-label="Produced"><span className="qc-produced-badge">{item.qty}</span></td>
                          <td data-label="Passed Qty">
                            <input
                              type="number"
                              className="qc-num-input passed"
                              value={vals.passed}
                              onChange={(e) => updateQty(job.id, item, "passed", e.target.value)}
                            />
                          </td>
                          <td data-label="Rejected Qty">
                            <input
                              type="number"
                              className="qc-num-input rejected"
                              value={vals.rejected}
                              onChange={(e) => updateQty(job.id, item, "rejected", e.target.value)}
                            />
                            {rejectedNum > 0 && (
                              <div className="qc-rework-note"><RotateCcw size={10} /> {rejectedNum} pcs will auto-queue for rework</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="qc-remark">
                <label>Remarks (optional)</label>
                <input
                  value={remarks[job.id] || ""}
                  onChange={(e) => setRemarks((prev) => ({ ...prev, [job.id]: e.target.value }))}
                  placeholder="e.g. minor surface scratches on 2 pcs"
                />
              </div>

              <button className="qc-submit-btn" disabled={saving === job.id} onClick={() => submitQC(job)}>
                <ClipboardCheck size={16} /> {saving === job.id ? "Submitting..." : "Submit QC → Add Passed to FG Stock"}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
