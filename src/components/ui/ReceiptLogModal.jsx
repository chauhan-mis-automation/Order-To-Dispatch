import React, { useEffect, useState } from "react";
import { X, Loader2, ClipboardList } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

function fmtDateTime(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ReceiptLogModal({ po, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!po) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("po_receipt_logs")
        .select("*, material:raw_materials(name, unit)")
        .eq("po_id", po.id)
        .order("received_at", { ascending: true });
      if (!cancelled) {
        setLogs(data || []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [po]);

  if (!po) return null;

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-card" onClick={(e) => e.stopPropagation()}>
        <div className="rl-header">
          <h4><ClipboardList size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Receiving History</h4>
          <button className="rl-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="rl-body">
          <div className="rl-oid-badge">{po.po_number}</div>

          {loading ? (
            <div className="rl-loading"><Loader2 size={20} className="rl-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="rl-empty">No receiving history yet for this PO.</div>
          ) : (
            <div className="rl-table-wrap">
              <table className="rl-table">
                <thead>
                  <tr><th>#</th><th>Material</th><th>Qty Received</th><th>Receive Date</th></tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log.id}>
                      <td><span className="rl-seq">{idx + 1}</span></td>
                      <td className="rl-item">{log.material?.name || "-"} <span className="rl-unit">{log.material?.unit || ""}</span></td>
                      <td className="rl-qty">{log.qty_received}</td>
                      <td className="rl-date">{fmtDateTime(log.received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .rl-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 250; display: flex; align-items: center; justify-content: center; padding: 16px; animation: rl-fade 0.18s ease; }
        @keyframes rl-fade { from { opacity: 0; } to { opacity: 1; } }
        .rl-card { width: 100%; max-width: 600px; max-height: 80vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.28); overflow: hidden; display: flex; flex-direction: column; animation: rl-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes rl-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .rl-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .rl-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .rl-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .rl-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .rl-oid-badge { display: inline-block; background: #14161f; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 16px; }
        .rl-loading { display: flex; justify-content: center; padding: 40px 0; color: #b5620f; }
        .rl-spin { animation: rl-spin-anim 0.9s linear infinite; }
        @keyframes rl-spin-anim { to { transform: rotate(360deg); } }
        .rl-empty { text-align: center; color: #b7b9c6; padding: 30px 0; background: #fff9ef; border: 1px solid #f5e3bd; border-radius: 12px; }
        .rl-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: hidden; overflow-x: auto; }
        .rl-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: center; min-width: 440px; }
        .rl-table thead th { background: #f6f7fb; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #5b5f72; }
        .rl-item { text-align: left; font-weight: 700; }
        .rl-unit { font-weight: 400; color: #9295a8; font-size: 11px; }
        .rl-table tbody td { padding: 10px 12px; border-top: 1px solid #f0f1f6; }
        .rl-qty { background: #eafaf133; font-weight: 700; color: #1a8a4c; }
        .rl-date { font-size: 11.5px; color: #9295a8; white-space: nowrap; }
        .rl-seq { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 7px; background: #14161f; color: #fff; font-size: 11px; font-weight: 800; }
      `}</style>
    </div>
  );
}
