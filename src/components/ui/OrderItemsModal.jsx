import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function OrderItemsModal({ orderId, onClose }) {
  const [items, setItems] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [itemsRes, orderRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("orders").select("*").eq("order_id", orderId).single(),
      ]);
      if (cancelled) return;
      setItems(itemsRes.data || []);
      setOrder(orderRes.data || null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId) return null;

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalNa = items.reduce((s, i) => s + (Number(i.na) || 0), 0);
  const totalWt = items.reduce((s, i) => s + (Number(i.weight_ton) || 0), 0);

  return (
    <div className="oim-overlay" onClick={onClose}>
      <div className="oim-card" onClick={(e) => e.stopPropagation()}>
        <div className="oim-header">
          <h4>📦 Order Items — <span className="oim-oid">{orderId}</span></h4>
          <button className="oim-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="oim-body">
          {loading ? (
            <div className="oim-loading"><Loader2 size={20} className="oim-spin" /></div>
          ) : (
            <>
              <div className="oim-table-wrap">
                <table className="oim-table">
                  <thead>
                    <tr>
                      <th>Item / Model</th><th>Size</th><th>Thick</th>
                      <th>Qty</th><th>NA</th><th>Wt(Ton)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.item_name}
                          {it.shade && <span className="oim-badge oim-badge-amber">{it.shade}</span>}
                          {it.model && <span className="oim-badge oim-badge-blue">{it.model}</span>}
                        </td>
                        <td>{it.size}</td>
                        <td>{it.thickness}</td>
                        <td>{it.qty}</td>
                        <td>{Number(it.na).toFixed(3)}</td>
                        <td>{Number(it.weight_ton).toFixed(3)}</td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={6} className="oim-empty">No items found.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right", color: "#8a8da0" }}>Total</td>
                      <td className="oim-total">{totalQty}</td>
                      <td className="oim-total">{totalNa.toFixed(3)}</td>
                      <td className="oim-total">{totalWt.toFixed(3)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {order && (
                <div className="oim-summary">
                  <div><span>Brand</span><strong>{order.brand || "-"}</strong></div>
                  <div><span>Destination</span><strong>{order.destination || "-"}</strong></div>
                  <div><span>Remark</span><strong>{order.remark || "-"}</strong></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .oim-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px);
          z-index: 250; display: flex; align-items: center; justify-content: center; padding: 16px;
          animation: oim-fade 0.18s ease;
        }
        @keyframes oim-fade { from { opacity: 0; } to { opacity: 1; } }
        .oim-card {
          width: 100%; max-width: 720px; max-height: 84vh; background: #fff; border-radius: 18px;
          box-shadow: 0 24px 60px rgba(10,11,20,0.28); overflow: hidden; display: flex; flex-direction: column;
          animation: oim-pop 0.2s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes oim-pop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .oim-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; }
        .oim-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .oim-oid { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-size: 14px; }
        .oim-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .oim-body { padding: 18px 22px 22px 22px; overflow-y: auto; }
        .oim-loading { display: flex; justify-content: center; padding: 40px 0; color: #b5620f; }
        .oim-spin { animation: oim-spin-anim 0.9s linear infinite; }
        @keyframes oim-spin-anim { to { transform: rotate(360deg); } }
        .oim-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: hidden; overflow-x: auto; }
        .oim-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 480px; }
        .oim-table thead th { background: #14161f; color: #fff; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .oim-table tbody td { padding: 10px 12px; border-bottom: 1px solid #f0f1f6; }
        .oim-table tfoot td { padding: 10px 12px; font-weight: 700; background: #f6f7fb; }
        .oim-total { font-family: 'IBM Plex Mono', monospace; }
        .oim-empty { text-align: center; color: #b7b9c6; padding: 24px !important; }
        .oim-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; margin-left: 6px; }
        .oim-badge-amber { background: #fdf3e4; color: #b5620f; }
        .oim-badge-blue { background: #e8f1ff; color: #1d5fc7; }
        .oim-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
        @media (max-width: 560px) { .oim-summary { grid-template-columns: 1fr; } }
        .oim-summary div { background: #f6f7fb; border: 1px solid #eceef4; border-radius: 10px; padding: 10px 12px; }
        .oim-summary span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #9295a8; margin-bottom: 3px; }
        .oim-summary strong { font-size: 13px; color: #1c1e26; }
      `}</style>
    </div>
  );
}
