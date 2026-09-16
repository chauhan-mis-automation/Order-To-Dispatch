import React, { useEffect, useState } from "react";
import { X, AlertTriangle, Lock } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

function keyFor(itemName, brand, size, thickness) {
  return `${itemName}_${brand || ""}_${size}_${thickness}`.toUpperCase();
}

export default function CloseOrderModal({ order, currentUser, onClose, onClosed }) {
  const [pendingRows, setPendingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [itemsRes, logsRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", order.order_id),
        supabase.from("dispatch_logs").select("*").eq("order_id", order.order_id),
      ]);
      if (cancelled) return;
      const dispatchedMap = {};
      (logsRes.data || []).forEach((log) => {
        const key = keyFor(log.item_name, log.brand, log.size, log.thickness);
        dispatchedMap[key] = (dispatchedMap[key] || 0) + (Number(log.dispatched_qty) || 0);
      });
      const rows = (itemsRes.data || [])
        .map((it) => {
          const key = keyFor(it.item_name, it.brand, it.size, it.thickness);
          const ordered = Number(it.qty) || 0;
          const dispatched = dispatchedMap[key] || 0;
          const pending = Math.max(0, ordered - dispatched);
          return { itemName: it.item_name, size: it.size, thickness: it.thickness, ordered, dispatched, pending };
        })
        .filter((r) => r.pending > 0);
      setPendingRows(rows);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [order]);

  if (!order) return null;

  async function handleClose() {
    if (!remark.trim()) {
      setError("Remark is required to close an order with pending quantity.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("orders")
        .update({
          status: "Dispatched",
          dispatched_at: order.dispatched_at || new Date().toISOString(),
          closed_manually: true,
          close_remark: remark.trim(),
          closed_by: currentUser,
        })
        .eq("order_id", order.order_id);
      if (err) throw err;
      onClosed && onClosed();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="com-overlay" onClick={onClose}>
      <div className="com-card" onClick={(e) => e.stopPropagation()}>
        <div className="com-header">
          <h4><Lock size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Close Order — {order.order_id}</h4>
          <button className="com-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="com-body">
          <div className="com-warning">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>This order still has pending quantity. Closing it means the pending amount will <b>never be dispatched</b> — the order moves to History as complete. This cannot be undone from here.</div>
          </div>

          {loading ? (
            <div className="com-loading">Loading pending items...</div>
          ) : (
            <table className="com-table">
              <thead><tr><th>Item</th><th>Size</th><th>Thk</th><th>Ordered</th><th>Dispatched</th><th>Pending (will be cancelled)</th></tr></thead>
              <tbody>
                {pendingRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.itemName}</td><td>{r.size}</td><td>{r.thickness}</td>
                    <td>{r.ordered}</td><td>{r.dispatched}</td>
                    <td className="com-pending">{r.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="com-field">
            <label>Remark <span className="com-required">(mandatory)</span></label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Why is the pending quantity being cancelled? e.g. customer no longer needs it, stock unavailable..."
              rows={3}
            />
          </div>

          {error && <div className="com-error">{error}</div>}

          <button className="com-confirm-btn" onClick={handleClose} disabled={saving || !remark.trim()}>
            <Lock size={15} /> {saving ? "Closing..." : "Close Order Manually"}
          </button>
        </div>
      </div>

      <style>{`
        .com-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .com-card { width: 100%; max-width: 620px; max-height: 90vh; max-height: 90dvh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; }
        .com-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; flex-shrink: 0; }
        .com-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 15px; color: #c23c33; }
        .com-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .com-body { padding: 18px 22px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }

        .com-warning { display: flex; gap: 10px; background: #fdeceb; color: #c23c33; border-radius: 12px; padding: 12px 14px; font-size: 12.5px; font-weight: 600; margin-bottom: 16px; line-height: 1.5; }

        .com-loading { text-align: center; color: #9295a8; padding: 20px 0; font-size: 12.5px; }
        .com-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 18px; }
        .com-table th { text-align: left; padding: 8px 10px; background: #f6f7fb; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; font-weight: 700; }
        .com-table td { padding: 8px 10px; border-top: 1px solid #f0f1f6; }
        .com-pending { color: #c23c33; font-weight: 700; }

        .com-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .com-required { color: #c23c33; font-weight: 700; }
        .com-field textarea {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px;
          font-size: 13px; font-family: inherit; resize: vertical; outline: none;
        }
        .com-field textarea:focus { border-color: #c23c33; box-shadow: 0 0 0 3px rgba(194,60,51,0.12); }

        .com-error { background: #fdeceb; color: #c23c33; padding: 9px 13px; border-radius: 9px; margin-top: 12px; font-size: 12.5px; font-weight: 600; }

        .com-confirm-btn {
          width: 100%; border: none; padding: 13px; border-radius: 12px; font-weight: 700; font-size: 13.5px; cursor: pointer;
          background: linear-gradient(135deg, #c23c33, #a12e26); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px;
        }
        .com-confirm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
