import React, { useEffect, useState } from "react";
import { CalendarCheck, X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

/**
 * Set/edit an order's plan dispatch date. Stamped with the current
 * logged-in session user — no separate re-authentication needed.
 */
export default function PlanDateModal({ open, orderId, existingDate, currentUser, onClose, onSaved }) {
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDate(existingDate || new Date().toISOString().split("T")[0]);
      setError("");
    }
  }, [open, existingDate]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date) {
      setError("Please select a date.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          plan_dispatch_date: date,
          approved_by: currentUser,
          approved_at: new Date().toISOString(),
        })
        .eq("order_id", orderId);

      if (updateError) throw updateError;

      setLoading(false);
      onSaved && onSaved();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <div className="pdm-card" onClick={(e) => e.stopPropagation()}>
        <button className="pdm-close" onClick={onClose}><X size={16} /></button>
        <div className="pdm-icon"><CalendarCheck size={24} /></div>
        <h4>Planning Dispatch Date</h4>
        <p className="pdm-sub">Order: <strong>{orderId}</strong></p>

        <form onSubmit={handleSubmit}>
          <label className="pdm-label">Dispatch Date</label>
          <input type="date" className="pdm-input" value={date} onChange={(e) => setDate(e.target.value)} />

          {error && <div className="pdm-error">{error}</div>}

          <button className="pdm-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={15} className="pdm-spin" /> : null}
            {loading ? "Saving..." : "Confirm & Save"}
          </button>
        </form>
      </div>

      <style>{`
        .pdm-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px);
          z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px;
          animation: pdm-fade 0.18s ease;
        }
        @keyframes pdm-fade { from { opacity: 0; } to { opacity: 1; } }
        .pdm-card {
          position: relative; width: 100%; max-width: 360px; background: #fff; border-radius: 20px;
          box-shadow: 0 24px 60px rgba(10,11,20,0.28); padding: 30px 26px 26px 26px; text-align: center;
          animation: pdm-pop 0.2s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes pdm-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .pdm-close {
          position: absolute; top: 14px; right: 14px; border: none; background: #f1f2f6;
          width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72;
        }
        .pdm-icon {
          width: 52px; height: 52px; border-radius: 50%; margin: 0 auto 12px auto;
          background: #fdf3e4; color: #b5620f; display: flex; align-items: center; justify-content: center;
        }
        .pdm-card h4 { margin: 0 0 4px 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .pdm-sub { margin: 0 0 18px 0; font-size: 12.5px; color: #8a8da0; }
        .pdm-label { display: block; text-align: left; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 5px; }
        .pdm-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px;
          padding: 10px 13px; font-size: 13.5px; outline: none; margin-bottom: 14px;
        }
        .pdm-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .pdm-error { background: #fdeceb; color: #c23c33; font-size: 12.5px; font-weight: 600; padding: 9px 12px; border-radius: 9px; margin-bottom: 14px; text-align: left; }
        .pdm-submit {
          width: 100%; border: none; display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 12px; border-radius: 11px; font-weight: 700; font-size: 14px; cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.28);
        }
        .pdm-submit:disabled { opacity: 0.7; cursor: not-allowed; }
        .pdm-spin { animation: pdm-spin-anim 0.9s linear infinite; }
        @keyframes pdm-spin-anim { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
