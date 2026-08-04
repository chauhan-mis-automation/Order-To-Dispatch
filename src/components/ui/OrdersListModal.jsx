import { X, Eye } from "lucide-react";

const STATUS_STYLES = {
  Pending: { bg: "#fdeceb", color: "#c23c33" },
  Confirmed: { bg: "#e8f1ff", color: "#1d5fc7" },
  "Indent Raised": { bg: "#f1f2f6", color: "#4a4d5c" },
  Picked: { bg: "#e8f1ff", color: "#1d5fc7" },
  "Ready to Ship": { bg: "#f3e8ff", color: "#8b3fd6" },
  Dispatched: { bg: "#eafaf1", color: "#1a8a4c" },
  Cancelled: { bg: "#f1f2f6", color: "#4a4d5c" },
  "On Hold": { bg: "#fff4de", color: "#b5620f" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}

export default function OrdersListModal({ title, orders, onClose, onViewOrder }) {
  if (!orders) return null;

  const totalQty = orders.reduce((s, o) => s + (Number(o.total_qty) || 0), 0);
  const totalWt = orders.reduce((s, o) => s + (Number(o.total_weight) || 0), 0);

  return (
    <div className="olm-overlay" onClick={onClose}>
      <div className="olm-card" onClick={(e) => e.stopPropagation()}>
        <div className="olm-header">
          <h4>{title}</h4>
          <button className="olm-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="olm-body">
          <div className="olm-stats">
            <div><span>Orders</span><strong>{orders.length}</strong></div>
            <div><span>Total Qty</span><strong>{totalQty}</strong></div>
            <div><span>Total Wt(T)</span><strong>{totalWt.toFixed(3)}</strong></div>
          </div>

          <div className="olm-table-wrap">
            <table className="olm-table">
              <thead>
                <tr><th>Order ID</th><th>Date</th><th>Party</th><th>Brand</th><th>Qty</th><th>Wt(T)</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const badge = STATUS_STYLES[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                  return (
                    <tr key={o.order_id}>
                      <td className="olm-oid">{o.order_id}</td>
                      <td>{formatDate(o.order_date)}</td>
                      <td>{o.party_name}</td>
                      <td>{o.brand || "-"}</td>
                      <td>{o.total_qty}</td>
                      <td>{Number(o.total_weight).toFixed(3)}</td>
                      <td><span className="olm-badge" style={{ background: badge.bg, color: badge.color }}>{o.status}</span></td>
                      <td>
                        {onViewOrder && (
                          <button className="olm-view-btn" onClick={() => onViewOrder(o.order_id)}><Eye size={13} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={8} className="olm-empty">No records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        .olm-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 16px; animation: olm-fade 0.18s ease; }
        @keyframes olm-fade { from { opacity: 0; } to { opacity: 1; } }
        .olm-card { width: 100%; max-width: 820px; max-height: 86vh; background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; animation: olm-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes olm-pop { from { opacity: 0; transform: scale(0.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .olm-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #f0f1f6; }
        .olm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
        .olm-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .olm-body { padding: 20px 24px 24px 24px; overflow-y: auto; }
        .olm-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
        @media (max-width: 500px) { .olm-stats { grid-template-columns: 1fr; } }
        .olm-stats div { background: #f6f7fb; border: 1px solid #eceef4; border-radius: 12px; padding: 12px; text-align: center; }
        .olm-stats span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #9295a8; margin-bottom: 4px; }
        .olm-stats strong { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #1c1e26; }
        .olm-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: auto; max-height: 50vh; }
        .olm-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 620px; }
        .olm-table thead th { position: sticky; top: 0; background: #f6f7fb; padding: 9px 12px; text-align: left; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; }
        .olm-table tbody td { padding: 9px 12px; border-top: 1px solid #f0f1f6; }
        .olm-oid { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-weight: 700; }
        .olm-badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 10.5px; font-weight: 700; }
        .olm-view-btn { border: 1px solid #e6e8f0; background: #fff; width: 26px; height: 26px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #5b5f72; }
        .olm-empty { text-align: center; color: #b7b9c6; padding: 24px !important; }
      `}</style>
    </div>
  );
}
