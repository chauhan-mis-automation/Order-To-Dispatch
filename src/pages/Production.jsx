import React, { useCallback, useEffect, useState } from "react";
import { Factory, Loader2, PlayCircle, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { computeMaterialRequirements } from "../utils/materialCalculator";
import ConfirmDialog from "../components/ui/ConfirmDialog";

export default function Production() {
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [inProgressJobs, setInProgressJobs] = useState([]);
  const [jobItemsMap, setJobItemsMap] = useState({});
  const [stagesMap, setStagesMap] = useState({}); // job_id -> stage rows
  const [masterStages, setMasterStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyJob, setBusyJob] = useState(null);
  const [confirmStart, setConfirmStart] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [schedRes, inProgRes, stagesMasterRes] = await Promise.all([
      supabase.from("production_jobs").select("*, production_lines(name)").eq("status", "Scheduled").order("planned_start_date", { ascending: true }),
      supabase.from("production_jobs").select("*, production_lines(name)").eq("status", "In Production").order("planned_start_date", { ascending: true }),
      supabase.from("production_stages").select("*").order("sequence"),
    ]);
    setScheduledJobs(schedRes.data || []);
    setInProgressJobs(inProgRes.data || []);
    setMasterStages(stagesMasterRes.data || []);

    const allJobIds = [...(schedRes.data || []), ...(inProgRes.data || [])].map((j) => j.id);
    if (allJobIds.length > 0) {
      const [itemsRes, stageRowsRes] = await Promise.all([
        supabase.from("production_job_items").select("*").in("job_id", allJobIds),
        supabase.from("production_job_stages").select("*").in("job_id", allJobIds).order("sequence"),
      ]);
      const itemsMap = {};
      (itemsRes.data || []).forEach((it) => {
        if (!itemsMap[it.job_id]) itemsMap[it.job_id] = [];
        itemsMap[it.job_id].push(it);
      });
      setJobItemsMap(itemsMap);

      const sMap = {};
      (stageRowsRes.data || []).forEach((s) => {
        if (!sMap[s.job_id]) sMap[s.job_id] = [];
        sMap[s.job_id].push(s);
      });
      setStagesMap(sMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const itemsSummary = (jobId) =>
    (jobItemsMap[jobId] || []).map((it) => `${it.item_name} (${it.thickness}, ${it.size}) × ${it.qty}`).join(", ");

  async function confirmStartProduction() {
    const job = confirmStart;
    setConfirmStart(null);
    setBusyJob(job.id);
    setError("");
    try {
      const items = jobItemsMap[job.id] || [];
      const [bomRes, rmRes] = await Promise.all([
        supabase.from("item_bom").select("*, raw_materials(id, name)"),
        supabase.from("rm_stock").select("*"),
      ]);
      const required = computeMaterialRequirements(
        items.map((it) => ({ item_name: it.item_name, size: it.size, thickness: it.thickness, qty: it.qty })),
        bomRes.data || []
      );

      // Live re-check: stock shown earlier (in Indent/PPC) can go stale if another
      // job consumed the same shared material in the meantime. Never deduct
      // blindly — verify every material still has enough RIGHT NOW, first.
      const shortages = [];
      const resolved = [];
      for (const req of required) {
        const bomRow = (bomRes.data || []).find((b) => b.raw_materials?.name === req.name);
        const materialId = bomRow?.raw_materials?.id;
        if (!materialId) continue;
        const rmRow = (rmRes.data || []).find((r) => r.material_id === materialId);
        const available = rmRow ? Number(rmRow.qty_available) : 0;
        if (available < req.totalQty) {
          shortages.push(`${req.name}: need ${req.totalQty.toFixed(2)}, only ${available.toFixed(2)} left`);
        } else {
          resolved.push({ materialId, newQty: available - req.totalQty });
        }
      }

      if (shortages.length > 0) {
        throw new Error(
          `Stock changed since this job was scheduled — another job used shared material(s) first. Short on: ${shortages.join("; ")}. Raise a Purchase Order or wait for stock, then try again.`
        );
      }

      for (const r of resolved) {
        await supabase.from("rm_stock").update({ qty_available: r.newQty, updated_at: new Date().toISOString() }).eq("material_id", r.materialId);
      }

      const stageRows = masterStages.map((s) => ({
        job_id: job.id,
        stage_name: s.name,
        sequence: s.sequence,
        status: "Pending",
      }));
      if (stageRows.length > 0) {
        const { error: stageErr } = await supabase.from("production_job_stages").insert(stageRows);
        if (stageErr) throw stageErr;
      }

      const { error: jobErr } = await supabase.from("production_jobs").update({ status: "In Production" }).eq("id", job.id);
      if (jobErr) throw jobErr;

      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyJob(null);
    }
  }

  async function advanceStage(jobId, stage, allStagesForJob) {
    setBusyJob(jobId);
    setError("");
    try {
      if (stage.status === "Pending") {
        await supabase.from("production_job_stages").update({ status: "In Progress", started_at: new Date().toISOString() }).eq("id", stage.id);
      } else if (stage.status === "In Progress") {
        await supabase.from("production_job_stages").update({ status: "Completed", completed_at: new Date().toISOString() }).eq("id", stage.id);

        const isLast = stage.sequence === Math.max(...allStagesForJob.map((s) => s.sequence));
        if (isLast) {
          await supabase.from("production_jobs").update({ status: "QC Pending" }).eq("id", jobId);
        }
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyJob(null);
    }
  }

  return (
    <div className="prod-root">
      <style>{`
        .prod-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .prod-section-title { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; margin: 22px 0 12px 0; }
        .prod-section-title:first-child { margin-top: 0; }
        .prod-count-badge { font-size: 11px; font-weight: 700; background: #fdf3e4; color: #b5620f; padding: 3px 10px; border-radius: 20px; }
        .prod-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 14px; }
        .prod-job-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
        .prod-job-badge { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; background: #14161f; color: #fff; padding: 5px 12px; border-radius: 999px; }
        .prod-order-badge { font-size: 12px; color: #9295a8; }
        .prod-line-badge { font-size: 11px; font-weight: 700; background: #e8f1ff; color: #1d5fc7; padding: 3px 10px; border-radius: 20px; margin-left: auto; }
        .prod-items-desc { font-size: 12.5px; color: #5b5f72; margin-bottom: 14px; background: #f6f7fb; border-radius: 10px; padding: 10px 12px; }
        .prod-start-btn {
          border: none; background: linear-gradient(135deg, #f5c343, #f5a623); color: #17130a;
          padding: 11px 20px; border-radius: 11px; font-weight: 700; font-size: 13px; cursor: pointer;
          display: flex; align-items: center; gap: 8px; box-shadow: 0 6px 16px rgba(245,166,35,0.28);
        }
        .prod-start-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .prod-stage-list { display: flex; flex-direction: column; gap: 8px; }
        .prod-stage-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #eceef4; border-radius: 10px; }
        .prod-stage-row.is-done { background: #f6fbf8; border-color: #d7f0e2; }
        .prod-stage-row.is-active { background: #fffaf1; border-color: #f5e3bd; }
        .prod-stage-icon { color: #c3c5d1; }
        .prod-stage-row.is-done .prod-stage-icon { color: #1a8a4c; }
        .prod-stage-row.is-active .prod-stage-icon { color: #b5620f; }
        .prod-stage-name { flex: 1; font-size: 13px; font-weight: 600; }
        .prod-stage-btn {
          border: none; border-radius: 8px; padding: 7px 14px; font-size: 11.5px; font-weight: 700; cursor: pointer;
        }
        .prod-stage-btn-start { background: #e8f1ff; color: #1d5fc7; }
        .prod-stage-btn-complete { background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; }
        .prod-stage-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .prod-stage-status { font-size: 10.5px; font-weight: 700; color: #9295a8; text-transform: uppercase; }

        .prod-empty { text-align: center; color: #b7b9c6; padding: 30px; background: #fff; border: 1px solid #eceef4; border-radius: 16px; }
        .prod-loading { display: flex; justify-content: center; padding: 40px 0; }
        .prod-spin { animation: prod-spin-anim 0.9s linear infinite; }
        @keyframes prod-spin-anim { to { transform: rotate(360deg); } }
        .prod-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      {error && <div className="prod-error">{error}</div>}

      <div className="prod-section-title">
        <Clock3 size={17} /> Scheduled — Ready to Start <span className="prod-count-badge">{scheduledJobs.length}</span>
      </div>

      {loading ? (
        <div className="prod-loading"><Loader2 size={22} className="prod-spin" /></div>
      ) : scheduledJobs.length === 0 ? (
        <div className="prod-empty">No scheduled jobs waiting to start. Schedule jobs in "PPC" first.</div>
      ) : (
        scheduledJobs.map((job) => (
          <div className="prod-card" key={job.id}>
            <div className="prod-job-top">
              <span className="prod-job-badge">{job.job_number}</span>
              <span className="prod-order-badge">for {job.order_id}</span>
              <span className="prod-line-badge">{job.production_lines?.name || "No line"} · {job.shift}</span>
            </div>
            <div className="prod-items-desc">{itemsSummary(job.id)}</div>
            <button className="prod-start-btn" disabled={busyJob === job.id} onClick={() => setConfirmStart(job)}>
              <PlayCircle size={16} /> {busyJob === job.id ? "Starting..." : "Start Production"}
            </button>
          </div>
        ))
      )}

      <div className="prod-section-title">
        <Factory size={17} /> In Production <span className="prod-count-badge">{inProgressJobs.length}</span>
      </div>

      {!loading && inProgressJobs.length === 0 ? (
        <div className="prod-empty">No jobs currently in production.</div>
      ) : (
        inProgressJobs.map((job) => {
          const stages = stagesMap[job.id] || [];
          return (
            <div className="prod-card" key={job.id}>
              <div className="prod-job-top">
                <span className="prod-job-badge">{job.job_number}</span>
                <span className="prod-order-badge">for {job.order_id}</span>
                <span className="prod-line-badge">{job.production_lines?.name || "No line"} · {job.shift}</span>
              </div>
              <div className="prod-items-desc">{itemsSummary(job.id)}</div>

              <div className="prod-stage-list">
                {stages.map((stage, idx) => {
                  const prevDone = idx === 0 || stages[idx - 1]?.status === "Completed";
                  const isDone = stage.status === "Completed";
                  const isActive = stage.status === "In Progress";
                  const canAct = prevDone && stage.status !== "Completed";
                  return (
                    <div className={`prod-stage-row ${isDone ? "is-done" : isActive ? "is-active" : ""}`} key={stage.id}>
                      <span className="prod-stage-icon">
                        {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </span>
                      <span className="prod-stage-name">{stage.stage_name}</span>
                      {isDone ? (
                        <span className="prod-stage-status">Completed</span>
                      ) : stage.status === "Pending" ? (
                        <button
                          className="prod-stage-btn prod-stage-btn-start"
                          disabled={!canAct || busyJob === job.id}
                          onClick={() => advanceStage(job.id, stage, stages)}
                        >
                          Start
                        </button>
                      ) : (
                        <button
                          className="prod-stage-btn prod-stage-btn-complete"
                          disabled={busyJob === job.id}
                          onClick={() => advanceStage(job.id, stage, stages)}
                        >
                          Mark Complete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <ConfirmDialog
        open={!!confirmStart}
        title="Start Production?"
        message={confirmStart ? `This will deduct raw materials from RM Stock for ${confirmStart.job_number}. Continue?` : ""}
        confirmLabel="Yes, Start"
        onConfirm={confirmStartProduction}
        onCancel={() => setConfirmStart(null)}
      />
    </div>
  );
}
