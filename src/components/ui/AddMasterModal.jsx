import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Generic "Add new <thing>" modal — used for Party, Sales Person, Brand,
 * Destination. Mirrors the old #addMasterDataModal behaviour.
 */
export default function AddMasterModal({ open, title, onClose, onSubmit }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    queueMicrotask(() => {
      setValue("");
    });
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!value.trim()) return;
    setSaving(true);
    await onSubmit(value.trim());
    setSaving(false);
  }

  return (
    <div className="amm-overlay" onClick={onClose}>
      <div className="amm-card" onClick={(e) => e.stopPropagation()}>
        <div className="amm-header">
          <h4>{title}</h4>
          <button className="amm-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="amm-body">
          <input
            autoFocus
            className="amm-input"
            value={value}
            placeholder="Enter new value..."
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <div className="amm-footer">
          <button className="amm-cancel" onClick={onClose}>Cancel</button>
          <button className="amm-save" onClick={handleSubmit} disabled={saving || !value.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <style>{`
        .amm-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.45);
          backdrop-filter: blur(2px); z-index: 200;
          display: flex; align-items: center; justify-content: center;
          animation: amm-fade 0.18s ease; padding: 16px;
        }
        @keyframes amm-fade { from { opacity: 0; } to { opacity: 1; } }
        .amm-card {
          width: 100%; max-width: 380px; background: #fff; border-radius: 16px;
          box-shadow: 0 20px 50px rgba(10,11,20,0.25); overflow: hidden;
          animation: amm-pop 0.2s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes amm-pop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .amm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 10px 20px; }
        .amm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #1c1e26; }
        .amm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display:flex; align-items:center; justify-content:center; cursor: pointer; color: #5b5f72; }
        .amm-body { padding: 6px 20px 18px 20px; }
        .amm-input {
          width: 100%; border: 1px solid #e1e3ec; border-radius: 10px; padding: 11px 13px;
          font-size: 14px; outline: none; transition: border-color .15s ease, box-shadow .15s ease;
        }
        .amm-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .amm-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid #f1f2f6; }
        .amm-cancel { border: none; background: #f1f2f6; color: #4a4d5c; padding: 9px 16px; border-radius: 9px; font-weight: 600; font-size: 13px; cursor: pointer; }
        .amm-save {
          border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 9px 18px; border-radius: 9px; font-weight: 700; font-size: 13px; cursor: pointer;
          box-shadow: 0 4px 12px rgba(245,166,35,0.3);
        }
        .amm-save:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
