import React, { useState } from "react";
import { X, PackageCheck, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ReceiveGoodsModal({ po, items, onClose, onDone }) {
  const [receiveVals, setReceiveVals] = useState(
    Object.fromEntries(
      items.map((it) => [it.id, String(Math.max(0, Number(it.qty_ordered) - Number(it.qty_received)))])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!po) return null;

  function updateVal(itemId, value) {
    setReceiveVals((prev) => ({ ...prev, [itemId]: value }));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      for (const item of items) {
        const receivingNow = parseFloat(receiveVals[item.id]) || 0;
        if (receivingNow <= 0) continue;

        const newReceived = Number(item.qty_received) + receivingNow;
        if (newReceived > Number(item.qty_ordered) + 0.001) {
          throw new Error(`${item.material?.name}: can't receive more than ordered (${item.qty_ordered}).`);
        }

        const { error: itemErr } = await supabase
          .from("purchase_order_items")
          .update({ qty_received: newReceived, last_received_at: new Date().toISOString() })
          .eq("id", item.id);
        if (itemErr) throw itemErr;

        // add the received quantity into RM stock
        const { data: existing } = await supabase
          .from("rm_stock")
          .select("*")
          .eq("material_id", item.material_id)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("rm_stock")
            .update({ qty_available: Number(existing.qty_available) + receivingNow, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("rm_stock").insert({ material_id: item.material_id, qty_available: receivingNow });
        }
      }

      // recompute PO-level status from the fresh item totals
      const { data: freshItems } = await supabase.from("purchase_order_items").select("*").eq("po_id", po.id);
      const allReceived = (freshItems || []).every((it) => Number(it.qty_received) >= Number(it.qty_ordered) - 0.001);
      const anyReceived = (freshItems || []).some((it) => Number(it.qty_received) > 0);
      const newStatus = allReceived ? "Received" : anyReceived ? "Partially Received" : "Ordered";

      const { error: poErr } = await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", po.id);
      if (poErr) throw poErr;

      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rgm-overlay" onClick={onClose}>
      <div className="rgm-card" onClick={(e) => e.stopPropagation()}>
        <div className="rgm-header">
          <h4><PackageCheck size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Receive Goods — {po.po_number}</h4>
          <button className="rgm-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="rgm-body">
          {error && <div className="rgm-error">{error}</div>}
          <table className="rgm-table">
            <thead>
              <tr><th>Material</th><th>Ordered</th><th>Received</th><th>Pending</th><th>Receiving Now</th></tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const pending = Math.max(0, Number(it.qty_ordered) - Number(it.qty_received));
                return (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{it.material?.name}</div>
                      <div style={{ fontSize: 11, color: "#9295a8" }}>{it.material?.unit}</div>
                    </td>
                    <td>{it.qty_ordered}</td>
                    <td>{it.qty_received}</td>
                    <td style={{ color: pending > 0 ? "#c23c33" : "#1a8a4c", fontWeight: 700 }}>{pending}</td>
                    <td>
                      <input
                        type="number"
                        className="rgm-input"
                        value={receiveVals[it.id]}
                        max={pending}
                        disabled={pending <= 0}
                        onChange={(e) => updateVal(it.id, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button className="rgm-submit-btn" disabled={saving} onClick={submit}>
            <PackageCheck size={16} /> {saving ? "Receiving..." : "Confirm Receipt → Add to RM Stock"}
          </button>
        </div>
      </div>

      <style>{`
        .rgm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .rgm-card { width: 100%; max-width: 640px; max-height: 85vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; }
        .rgm-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
        .rgm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
        .rgm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .rgm-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .rgm-error { background: #fdeceb; color: #c23c33; padding: 9px 13px; border-radius: 9px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
        .rgm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 16px; }
        .rgm-table thead th { background: #f6f7fb; text-align: left; padding: 9px 10px; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; }
        .rgm-table tbody td { padding: 9px 10px; border-top: 1px solid #f0f1f6; }
        .rgm-input { width: 90px; box-sizing: border-box; border: 1px solid #cfe0ff; background: #e8f1ff; border-radius: 8px; padding: 7px 9px; font-size: 12.5px; font-weight: 700; color: #1d5fc7; }
        .rgm-input:disabled { background: #f1f2f6; border-color: #e1e3ec; color: #b7b9c6; }
        .rgm-submit-btn { width: 100%; border: none; padding: 12px; border-radius: 11px; font-weight: 700; font-size: 13.5px; cursor: pointer; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .rgm-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
