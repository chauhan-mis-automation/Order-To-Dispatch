import React, { useEffect, useState } from "react";
import { X, Loader2, FlaskConical } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { computeMaterialRequirements } from "../../utils/materialCalculator";

export default function MaterialRequirementModal({ orderId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState([]);
  const [missingRecipe, setMissingRecipe] = useState([]);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [itemsRes, bomRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("item_bom").select("*, raw_materials(name, unit)"),
      ]);
      if (cancelled) return;

      const items = itemsRes.data || [];
      const bomRows = bomRes.data || [];
      const results = computeMaterialRequirements(items, bomRows);
      setRequirements(results);

      const missing = items.filter(
        (it) => !bomRows.some((r) => r.item_name === it.item_name && r.thickness === it.thickness)
      );
      setMissingRecipe(missing);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [orderId]);

  if (!orderId) return null;

  return (
    <div className="mrm-overlay" onClick={onClose}>
      <div className="mrm-card" onClick={(e) => e.stopPropagation()}>
        <div className="mrm-header">
          <h4><FlaskConical size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Material Requirement</h4>
          <button className="mrm-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mrm-body">
          <div className="mrm-oid-badge">{orderId}</div>

          {loading ? (
            <div className="mrm-loading"><Loader2 size={20} className="mrm-spin" /></div>
          ) : requirements.length === 0 ? (
            <div className="mrm-empty">No BOM recipe found for any item in this order. Set one up in "BOM Setup".</div>
          ) : (
            <div className="mrm-table-wrap">
              <table className="mrm-table">
                <thead><tr><th>Material</th><th>Total Required</th></tr></thead>
                <tbody>
                  {requirements.map((r) => (
                    <tr key={r.name}>
                      <td className="mrm-name">{r.name}</td>
                      <td className="mrm-qty">{r.totalQty.toFixed(3)} {r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && missingRecipe.length > 0 && (
            <div className="mrm-warning">
              ⚠️ No recipe defined for: {[...new Set(missingRecipe.map((i) => `${i.item_name} (${i.thickness})`))].join(", ")}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .mrm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 250; display: flex; align-items: center; justify-content: center; padding: 16px; animation: mrm-fade 0.18s ease; }
        @keyframes mrm-fade { from { opacity: 0; } to { opacity: 1; } }
        .mrm-card { width: 100%; max-width: 560px; max-height: 82vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.28); overflow: hidden; display: flex; flex-direction: column; animation: mrm-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes mrm-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .mrm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .mrm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .mrm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .mrm-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .mrm-oid-badge { display: inline-block; background: #14161f; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 6px 14px; border-radius: 999px; margin-bottom: 16px; }
        .mrm-loading { display: flex; justify-content: center; padding: 30px 0; color: #b5620f; }
        .mrm-spin { animation: mrm-spin-anim 0.9s linear infinite; }
        @keyframes mrm-spin-anim { to { transform: rotate(360deg); } }
        .mrm-empty { text-align: center; color: #b7b9c6; padding: 24px; background: #fff9ef; border: 1px solid #f5e3bd; border-radius: 12px; font-size: 13px; }
        .mrm-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: hidden; }
        .mrm-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .mrm-table thead th { background: #f6f7fb; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #5b5f72; }
        .mrm-table tbody td { padding: 11px 14px; border-top: 1px solid #f0f1f6; }
        .mrm-name { font-weight: 700; }
        .mrm-qty { font-family: 'IBM Plex Mono', monospace; color: #1a8a4c; font-weight: 700; }
        .mrm-warning { margin-top: 14px; background: #fff4de; color: #b5620f; padding: 10px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; }
      `}</style>
    </div>
  );
}
