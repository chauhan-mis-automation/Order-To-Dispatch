import React, { useEffect, useState } from "react";
import { X, Loader2, ClipboardList, Hourglass, PlusCircle, CheckCheck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function DispatchLogModal({ orderId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase.from("dispatch_logs").select("*").eq("order_id", orderId);
      if (!cancelled) {
        setLogs(data || []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orderId]);

  if (!orderId) return null;

  return (
    <div className="dl-overlay" onClick={onClose}>
      <div className="dl-card" onClick={(e) => e.stopPropagation()}>
        <div className="dl-header">
          <h4><ClipboardList size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Dispatch Variance Log</h4>
          <button className="dl-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dl-body">
          <div className="dl-oid-badge">{orderId}</div>

          {loading ? (
            <div className="dl-loading"><Loader2 size={20} className="dl-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="dl-empty">No dispatch history logs found for this order.</div>
          ) : (
            <div className="dl-table-wrap">
              <table className="dl-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Item</th><th>Size</th><th>Thk</th>
                    <th>Ordered</th><th>Dispatched</th><th>Pending</th><th>Truck No</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const pending = Number(log.pending_qty);
                    const icon = pending > 0 ? <Hourglass size={13} /> : pending < 0 ? <PlusCircle size={13} /> : <CheckCheck size={13} />;
                    const cls = pending > 0 ? "dl-short" : pending < 0 ? "dl-excess" : "dl-full";
                    return (
                      <tr key={log.id}>
                        <td className="dl-date">{log.created_at ? new Date(log.created_at).toLocaleDateString("en-GB") : "-"}</td>
                        <td className="dl-item">{log.item_name}</td>
                        <td>{log.size}</td>
                        <td>{log.thickness}</td>
                        <td className="dl-ordered">{log.ordered_qty}</td>
                        <td className="dl-dispatched">{log.dispatched_qty}</td>
                        <td className={cls}>{icon} {pending}</td>
                        <td className="dl-truck">{log.truck_no || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .dl-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 250; display: flex; align-items: center; justify-content: center; padding: 16px; animation: dl-fade 0.18s ease; }
        @keyframes dl-fade { from { opacity: 0; } to { opacity: 1; } }
        .dl-card { width: 100%; max-width: 640px; max-height: 80vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.28); overflow: hidden; display: flex; flex-direction: column; animation: dl-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes dl-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .dl-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .dl-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .dl-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .dl-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .dl-oid-badge { display: inline-block; background: #14161f; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 16px; }
        .dl-loading { display: flex; justify-content: center; padding: 40px 0; color: #b5620f; }
        .dl-spin { animation: dl-spin-anim 0.9s linear infinite; }
        @keyframes dl-spin-anim { to { transform: rotate(360deg); } }
        .dl-empty { text-align: center; color: #b7b9c6; padding: 30px 0; background: #fff9ef; border: 1px solid #f5e3bd; border-radius: 12px; }
        .dl-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: hidden; overflow-x: auto; }
        .dl-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: center; min-width: 460px; }
        .dl-table thead th { background: #f6f7fb; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #5b5f72; }
        .dl-item { text-align: left; font-weight: 700; }
        .dl-table tbody td { padding: 10px 12px; border-top: 1px solid #f0f1f6; }
        .dl-ordered { background: #e8f1ff33; font-weight: 700; }
        .dl-dispatched { background: #eafaf133; font-weight: 700; }
        .dl-short { color: #c23c33; font-weight: 700; }
        .dl-excess { color: #b5620f; font-weight: 700; }
        .dl-full { color: #1a8a4c; font-weight: 700; }
        .dl-date { font-size: 11.5px; color: #9295a8; white-space: nowrap; }
        .dl-truck { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; }
      `}</style>
    </div>
  );
}
