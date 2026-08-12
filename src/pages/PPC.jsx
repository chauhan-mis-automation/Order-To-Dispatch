import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, ListChecks, Factory, AlertTriangle, Layers, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const SHIFTS = ["Shift 1 (6AM-2PM)", "Shift 2 (2PM-10PM)", "Shift 3 (10PM-6AM)"];
const PRIORITY_STYLES = {
  Low: { bg: "#f1f2f6", color: "#4a4d5c" },
  Medium: { bg: "#e8f1ff", color: "#1d5fc7" },
  High: { bg: "#fff4de", color: "#b5620f" },
  Urgent: { bg: "#fdeceb", color: "#c23c33" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

// Two date ranges overlap if each starts before (or when) the other ends.
function rangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export default function PPC({ currentUser }) {
  const [queueJobs, setQueueJobs] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [occupyingJobs, setOccupyingJobs] = useState([]); // Scheduled + In Production — anything still holding a line
  const [jobItemsMap, setJobItemsMap] = useState({});
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formState, setFormState] = useState({}); // jobId -> { priority, lineId, shift, startDate, endDate }
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [queueRes, schedRes, occRes, linesRes] = await Promise.all([
      supabase.from("production_jobs").select("*").eq("status", "Ready to Schedule").order("created_at", { ascending: true }),
      supabase.from("production_jobs").select("*, production_lines(name)").eq("status", "Scheduled").order("planned_start_date", { ascending: true }),
      supabase.from("production_jobs").select("*, production_lines(name)").in("status", ["Scheduled", "In Production"]).order("planned_start_date", { ascending: true }),
      supabase.from("production_lines").select("*").order("name"),
    ]);
    if (queueRes.error) setError(queueRes.error.message);
    else setQueueJobs(queueRes.data || []);
    setScheduledJobs(schedRes.data || []);
    setOccupyingJobs(occRes.data || []);
    setLines(linesRes.data || []);

    const allJobIds = [...(queueRes.data || []), ...(occRes.data || [])].map((j) => j.id);
    if (allJobIds.length > 0) {
      const { data: items } = await supabase.from("production_job_items").select("*").in("job_id", allJobIds);
      const map = {};
      (items || []).forEach((it) => {
        if (!map[it.job_id]) map[it.job_id] = [];
        map[it.job_id].push(it);
      });
      setJobItemsMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateForm(jobId, field, value) {
    setFormState((prev) => ({ ...prev, [jobId]: { ...prev[jobId], [field]: value } }));
  }

  function getForm(jobId) {
    return formState[jobId] || { priority: "Medium", lineId: "", shift: "", startDate: "", endDate: "" };
  }

  // Every job (any priority order) currently holding a given line, soonest first
  function bookingsForLine(lineId) {
    return occupyingJobs
      .filter((j) => j.line_id === lineId)
      .sort((a, b) => (a.planned_start_date || "").localeCompare(b.planned_start_date || ""));
  }

  // Find a booking on the same line whose date range overlaps the proposed dates
  function findConflict(lineId, startDate, endDate, excludeJobId) {
    return occupyingJobs.find(
      (j) =>
        j.line_id === lineId &&
        j.id !== excludeJobId &&
        j.planned_start_date &&
        j.planned_end_date &&
        rangesOverlap(startDate, endDate, j.planned_start_date, j.planned_end_date)
    );
  }

  async function scheduleJob(job) {
    const f = getForm(job.id);
    if (!f.lineId || !f.shift || !f.startDate || !f.endDate) {
      setError("Select line, shift, and both planned dates before scheduling.");
      return;
    }
    if (f.endDate < f.startDate) {
      setError("Target Finish date can't be before the Start Date.");
      return;
    }

    const conflict = findConflict(f.lineId, f.startDate, f.endDate, job.id);
    if (conflict) {
      const nextFree = addDays(conflict.planned_end_date, 1);
      const lineName = lines.find((l) => l.id === f.lineId)?.name || "This line";
      setError(
        `${lineName} is already booked for ${conflict.job_number} (${conflict.planned_start_date ? formatDate(conflict.planned_start_date) : "-"} → ${formatDate(conflict.planned_end_date)}). ` +
        `Choose a different line, or set the start date to ${formatDate(nextFree)} or later.`
      );
      return;
    }

    setSaving(job.id);
    setError("");
    const { error: err } = await supabase
      .from("production_jobs")
      .update({
        status: "Scheduled",
        priority: f.priority || "Medium",
        line_id: f.lineId,
        shift: f.shift,
        planned_start_date: f.startDate,
        planned_end_date: f.endDate,
        scheduled_by: currentUser,
        scheduled_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    setSaving(null);
    if (err) setError(err.message);
    else load();
  }

  const itemsSummary = (jobId) =>
    (jobItemsMap[jobId] || []).map((it) => `${it.item_name} (${it.thickness}, ${it.size}) × ${it.qty}`).join(", ");

  const linesWithBookings = useMemo(
    () => lines.map((l) => ({ line: l, bookings: bookingsForLine(l.id) })),
    [lines, occupyingJobs]
  );

  return (
    <div className="ppc-root">
      <style>{`
        .ppc-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .ppc-section-title { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; margin: 22px 0 12px 0; }
        .ppc-section-title:first-child { margin-top: 0; }
        .ppc-count-badge { font-size: 11px; font-weight: 700; background: #fdf3e4; color: #b5620f; padding: 3px 10px; border-radius: 20px; }
        .ppc-refresh-btn {
          margin-left: auto; border: 1px solid #e1e3ec; background: #fff; color: #5b5f72;
          padding: 6px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; gap: 6px;
        }
        .ppc-refresh-btn:hover { background: #f6f7fb; }

        .ppc-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 14px; }
        .ppc-job-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
        .ppc-job-badge { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; background: #14161f; color: #fff; padding: 5px 12px; border-radius: 999px; }
        .ppc-order-badge { font-size: 12px; color: #9295a8; }
        .ppc-items-desc { font-size: 12.5px; color: #5b5f72; margin-bottom: 14px; background: #f6f7fb; border-radius: 10px; padding: 10px 12px; }

        .ppc-form-grid { display: grid; grid-template-columns: repeat(5, 1fr) auto; gap: 10px; align-items: end; }
        @media (max-width: 1000px) { .ppc-form-grid { grid-template-columns: repeat(2, 1fr); } }
        .ppc-field label { display: block; font-size: 11.5px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .ppc-field select, .ppc-field input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 10px; font-size: 13px; background: #fff;
        }
        .ppc-schedule-btn {
          border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 12.5px; cursor: pointer; white-space: nowrap;
        }
        .ppc-schedule-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .ppc-line-preview {
          margin-top: 12px; background: #fbfbfd; border: 1px dashed #e1e3ec; border-radius: 10px; padding: 10px 12px;
        }
        .ppc-line-preview-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; margin-bottom: 8px; letter-spacing: 0.04em; }
        .ppc-line-booking { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 5px 0; border-top: 1px solid #f0f1f6; }
        .ppc-line-booking:first-of-type { border-top: none; }
        .ppc-line-booking-job { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #4a4d5c; }
        .ppc-line-booking-dates { margin-left: auto; color: #9295a8; }
        .ppc-line-free { font-size: 12px; color: #1a8a4c; font-weight: 600; }

        .ppc-sched-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ppc-sched-table thead th { background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; }
        .ppc-sched-table tbody td { padding: 11px 14px; border-bottom: 1px solid #f0f1f6; }
        .ppc-priority-badge { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; }
        .ppc-empty { text-align: center; color: #b7b9c6; padding: 30px; background: #fff; border: 1px solid #eceef4; border-radius: 16px; }
        .ppc-loading { display: flex; justify-content: center; padding: 40px 0; }
        .ppc-spin { animation: ppc-spin-anim 0.9s linear infinite; }
        @keyframes ppc-spin-anim { to { transform: rotate(360deg); } }
        .ppc-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; display: flex; align-items: flex-start; gap: 8px; }

        .ppc-lines-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
        .ppc-line-card { background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; }
        .ppc-line-card-title { font-weight: 700; font-size: 13.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .ppc-line-status-badge { margin-left: auto; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
        .ppc-line-status-busy { background: #fff4de; color: #b5620f; }
        .ppc-line-status-free { background: #eafaf1; color: #1a8a4c; }
        .ppc-line-timeline-item { border-left: 2px solid #f5a623; padding: 6px 0 6px 12px; margin-bottom: 6px; font-size: 12px; }
        .ppc-line-timeline-item .job { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1c1e26; }
        .ppc-line-timeline-item .desc { color: #5b5f72; margin-top: 2px; }
        .ppc-line-timeline-item .dates { color: #9295a8; margin-top: 2px; }
        .ppc-line-status-tag { font-size: 9.5px; font-weight: 700; padding: 1px 7px; border-radius: 10px; margin-left: 6px; }
        .ppc-tag-scheduled { background: #f3e8ff; color: #8b3fd6; }
        .ppc-tag-inprod { background: #e8f1ff; color: #1d5fc7; }
        .ppc-tag-overdue { background: #fdeceb; color: #c23c33; }

        @media (max-width: 760px) {
          .ppc-sched-table thead { display: none; }
          .ppc-sched-table, .ppc-sched-table tbody, .ppc-sched-table tr, .ppc-sched-table td { display: block; width: 100%; }
          .ppc-sched-table tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; }
          .ppc-sched-table td { display: flex; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid #f5f6fa; text-align: right; }
          .ppc-sched-table td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10px; text-transform: uppercase; text-align: left; }
        }
      `}</style>

      {error && <div className="ppc-error"><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}

      <div className="ppc-section-title">
        <ListChecks size={17} /> Planning Queue <span className="ppc-count-badge">{queueJobs.length} waiting</span>
      </div>

      {loading ? (
        <div className="ppc-loading"><Loader2 size={22} className="ppc-spin" /></div>
      ) : queueJobs.length === 0 ? (
        <div className="ppc-empty">No jobs waiting for scheduling. Jobs appear here once materials are confirmed ready in Indent.</div>
      ) : (
        queueJobs.map((job) => {
          const f = getForm(job.id);
          const lineBookings = f.lineId ? bookingsForLine(f.lineId) : [];
          return (
            <div className="ppc-card" key={job.id}>
              <div className="ppc-job-top">
                <span className="ppc-job-badge">{job.job_number}</span>
                <span className="ppc-order-badge">for {job.order_id}</span>
              </div>
              <div className="ppc-items-desc">{itemsSummary(job.id) || "Loading items..."}</div>

              <div className="ppc-form-grid">
                <div className="ppc-field">
                  <label>Priority</label>
                  <select value={f.priority} onChange={(e) => updateForm(job.id, "priority", e.target.value)}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="ppc-field">
                  <label>Line</label>
                  <select value={f.lineId} onChange={(e) => updateForm(job.id, "lineId", e.target.value)}>
                    <option value="">Select line</option>
                    {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="ppc-field">
                  <label>Shift</label>
                  <select value={f.shift} onChange={(e) => updateForm(job.id, "shift", e.target.value)}>
                    <option value="">Select shift</option>
                    {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="ppc-field">
                  <label>Start Date</label>
                  <input type="date" value={f.startDate} onChange={(e) => updateForm(job.id, "startDate", e.target.value)} />
                </div>
                <div className="ppc-field">
                  <label>Target Finish</label>
                  <input type="date" value={f.endDate} onChange={(e) => updateForm(job.id, "endDate", e.target.value)} />
                </div>
                <button className="ppc-schedule-btn" disabled={saving === job.id} onClick={() => scheduleJob(job)}>
                  {saving === job.id ? "Scheduling..." : "Schedule Job"}
                </button>
              </div>

              {f.lineId && (
                <div className="ppc-line-preview">
                  <div className="ppc-line-preview-title">
                    <Layers size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                    {lines.find((l) => l.id === f.lineId)?.name} — current bookings
                  </div>
                  {lineBookings.length === 0 ? (
                    <div className="ppc-line-free">✓ Free — no jobs booked on this line yet.</div>
                  ) : (
                    lineBookings.map((b) => (
                      <div className="ppc-line-booking" key={b.id}>
                        <span className="ppc-line-booking-job">{b.job_number}</span>
                        <span className={`ppc-line-status-tag ${b.status === "In Production" ? "ppc-tag-inprod" : "ppc-tag-scheduled"}`}>{b.status}</span>
                        <span className="ppc-line-booking-dates">{formatDate(b.planned_start_date)} → {formatDate(b.planned_end_date)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="ppc-section-title">
        <CalendarClock size={17} /> Scheduled Jobs <span className="ppc-count-badge">{scheduledJobs.length}</span>
      </div>

      {!loading && scheduledJobs.length === 0 ? (
        <div className="ppc-empty">No jobs scheduled yet.</div>
      ) : !loading && (
        <div className="ppc-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="ppc-sched-table">
            <thead>
              <tr><th>Job</th><th>Order</th><th>Priority</th><th>Line</th><th>Shift</th><th>Start</th><th>Finish</th></tr>
            </thead>
            <tbody>
              {scheduledJobs.map((job) => {
                const badge = PRIORITY_STYLES[job.priority] || PRIORITY_STYLES.Medium;
                return (
                  <tr key={job.id}>
                    <td data-label="Job">{job.job_number}</td>
                    <td data-label="Order">{job.order_id}</td>
                    <td data-label="Priority"><span className="ppc-priority-badge" style={{ background: badge.bg, color: badge.color }}>{job.priority}</span></td>
                    <td data-label="Line">{job.production_lines?.name || "-"}</td>
                    <td data-label="Shift">{job.shift}</td>
                    <td data-label="Start">{formatDate(job.planned_start_date)}</td>
                    <td data-label="Finish">{formatDate(job.planned_end_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="ppc-section-title">
        <Layers size={17} /> Line Occupancy Overview
        <button className="ppc-refresh-btn" onClick={load} title="Refresh line status">
          <RefreshCw size={13} className={loading ? "ppc-spin" : ""} /> Refresh
        </button>
      </div>

      {!loading && (
        <div className="ppc-lines-grid">
          {linesWithBookings.map(({ line, bookings }) => (
            <div className="ppc-line-card" key={line.id}>
              <div className="ppc-line-card-title">
                <Factory size={14} /> {line.name}
                <span className={`ppc-line-status-badge ${bookings.length > 0 ? "ppc-line-status-busy" : "ppc-line-status-free"}`}>
                  {bookings.length > 0 ? `${bookings.length} booked` : "Free"}
                </span>
              </div>
              {bookings.length === 0 ? (
                <div style={{ fontSize: 12, color: "#b7b9c6" }}>No jobs booked on this line.</div>
              ) : (
                bookings.map((b) => {
                  const today = new Date().toISOString().split("T")[0];
                  const isOverdue = b.planned_end_date && b.planned_end_date < today && b.status === "In Production";
                  return (
                    <div className="ppc-line-timeline-item" key={b.id} style={isOverdue ? { borderLeftColor: "#c23c33" } : undefined}>
                      <div className="job">
                        {b.job_number}
                        <span className={`ppc-line-status-tag ${b.status === "In Production" ? "ppc-tag-inprod" : "ppc-tag-scheduled"}`}>{b.status}</span>
                        {isOverdue && <span className="ppc-line-status-tag ppc-tag-overdue">⏰ Overdue</span>}
                      </div>
                      <div className="desc">{itemsSummary(b.id) || b.order_id}</div>
                      <div className="dates">{formatDate(b.planned_start_date)} → {formatDate(b.planned_end_date)} · {b.shift}</div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: "#9295a8", marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <Factory size={13} /> Scheduled jobs move to the "Production" page to actually start the work.
      </p>
    </div>
  );
}
