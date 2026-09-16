import React, { useEffect, useState } from "react";
import { X, History as HistoryIcon, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

const FIELD_LABELS = {
  order_date: "Order Date", party_name: "Party", address: "Address", sales_person: "Sales Person",
  brand: "Brand", destination: "Destination", remark: "Remark",
  total_qty: "Total Qty", total_weight: "Total Weight", file_link: "Reference Link",
};

function fmtDateTime(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fieldDiffs(before, after) {
  if (!before || !after) return [];
  return Object.keys(FIELD_LABELS)
    .filter((key) => String(before[key] ?? "") !== String(after[key] ?? ""))
    .map((key) => ({ label: FIELD_LABELS[key], before: before[key] ?? "-", after: after[key] ?? "-" }));
}

function itemsSummary(items) {
  if (!items || items.length === 0) return "No items";
  return items.map((it) => `${it.item_name} (${it.thickness}, ${it.size}) × ${it.qty}`).join(", ");
}

export default function OrderEditHistoryModal({ orderId, onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("order_edit_history")
        .select("*")
        .eq("order_id", orderId)
        .order("edited_at", { ascending: false });
      setEntries(data || []);
      setLoading(false);
    }
    load();
  }, [orderId]);

  if (!orderId) return null;

  return (
    <div className="oeh-overlay" onClick={onClose}>
      <div className="oeh-card" onClick={(e) => e.stopPropagation()}>
        <div className="oeh-header">
          <h4><HistoryIcon size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Edit History — <span className="oeh-order-id">{orderId}</span></h4>
          <button className="oeh-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="oeh-body">
          {loading ? (
            <div className="oeh-loading"><Loader2 size={20} className="oeh-spin" /></div>
          ) : entries.length === 0 ? (
            <div className="oeh-empty">No edits recorded for this order yet.</div>
          ) : (
            entries.map((e) => {
              const diffs = fieldDiffs(e.before_order, e.after_order);
              const itemsChanged = JSON.stringify(e.before_items) !== JSON.stringify(e.after_items);
              return (
                <div className="oeh-entry" key={e.id}>
                  <div className="oeh-entry-head">
                    <span className="oeh-editor">{e.edited_by || "Unknown"}</span>
                    <span className="oeh-time">{fmtDateTime(e.edited_at)}</span>
                  </div>

                  {diffs.length === 0 && !itemsChanged ? (
                    <div className="oeh-nochange">No field-level changes detected (edit saved with same values).</div>
                  ) : (
                    <>
                      {diffs.length > 0 && (
                        <table className="oeh-diff-table">
                          <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                          <tbody>
                            {diffs.map((d, i) => (
                              <tr key={i}>
                                <td>{d.label}</td>
                                <td className="oeh-before">{String(d.before)}</td>
                                <td className="oeh-after">{String(d.after)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {itemsChanged && (
                        <div className="oeh-items-diff">
                          <div className="oeh-items-row">
                            <span className="oeh-items-label">Before:</span>
                            <span className="oeh-before">{itemsSummary(e.before_items)}</span>
                          </div>
                          <div className="oeh-items-row">
                            <span className="oeh-items-label">After:</span>
                            <span className="oeh-after">{itemsSummary(e.after_items)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        .oeh-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 280; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .oeh-card { width: 100%; max-width: 620px; max-height: 90vh; max-height: 90dvh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; }
        .oeh-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; flex-shrink: 0; }
        .oeh-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
        .oeh-order-id { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-size: 13px; }
        .oeh-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .oeh-body { padding: 18px 22px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
        .oeh-loading, .oeh-empty { text-align: center; color: #b7b9c6; padding: 40px 0; }
        .oeh-spin { animation: oeh-spin-anim 0.9s linear infinite; }
        @keyframes oeh-spin-anim { to { transform: rotate(360deg); } }

        .oeh-entry { border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
        .oeh-entry:last-child { margin-bottom: 0; }
        .oeh-entry-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .oeh-editor { font-weight: 700; font-size: 13px; }
        .oeh-time { font-size: 11.5px; color: #9295a8; }
        .oeh-nochange { font-size: 12px; color: #9295a8; font-style: italic; }

        .oeh-diff-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
        .oeh-diff-table th { text-align: left; padding: 6px 8px; color: #9295a8; font-weight: 700; text-transform: uppercase; font-size: 10px; border-bottom: 1px solid #eceef4; }
        .oeh-diff-table td { padding: 7px 8px; border-bottom: 1px solid #f6f7fb; }
        .oeh-before { color: #c23c33; text-decoration: line-through; }
        .oeh-after { color: #1a8a4c; font-weight: 600; }

        .oeh-items-diff { background: #f6f7fb; border-radius: 10px; padding: 10px 12px; font-size: 12px; }
        .oeh-items-row { margin-bottom: 6px; }
        .oeh-items-row:last-child { margin-bottom: 0; }
        .oeh-items-label { font-weight: 700; color: #4a4d5c; margin-right: 6px; }
      `}</style>
    </div>
  );
}
