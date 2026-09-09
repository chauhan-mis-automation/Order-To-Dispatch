import React from "react";
import { HelpCircle } from "lucide-react";

export default function ConfirmDialog({ open, title, message, confirmLabel = "Yes", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="cd-overlay" onClick={onCancel}>
      <div className="cd-card" onClick={(e) => e.stopPropagation()}>
        <div className="cd-icon"><HelpCircle size={24} /></div>
        <h4>{title}</h4>
        <div className="cd-message">{message}</div>
        <div className="cd-actions">
          <button className="cd-cancel" onClick={onCancel}>Cancel</button>
          <button className="cd-confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>

      <style>{`
        .cd-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.45); backdrop-filter: blur(2px);
          z-index: 260; display: flex; align-items: center; justify-content: center; padding: 16px;
          animation: cd-fade 0.15s ease;
        }
        @keyframes cd-fade { from { opacity: 0; } to { opacity: 1; } }
        .cd-card {
          width: 100%; max-width: 340px; background: #fff; border-radius: 18px; padding: 26px 24px;
          text-align: center; box-shadow: 0 20px 50px rgba(10,11,20,0.25);
          animation: cd-pop 0.18s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes cd-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .cd-icon {
          width: 48px; height: 48px; border-radius: 50%; margin: 0 auto 12px auto;
          background: #e8f1ff; color: #1d5fc7; display: flex; align-items: center; justify-content: center;
        }
        .cd-card h4 { margin: 0 0 6px 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .cd-card .cd-message { margin: 0 0 18px 0; font-size: 13px; color: #8a8da0; }
        .cd-actions { display: flex; gap: 8px; }
        .cd-cancel, .cd-confirm { flex: 1; border: none; border-radius: 10px; padding: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .cd-cancel { background: #f1f2f6; color: #4a4d5c; }
        .cd-confirm { background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; box-shadow: 0 4px 12px rgba(245,166,35,0.28); }
      `}</style>
    </div>
  );
}
