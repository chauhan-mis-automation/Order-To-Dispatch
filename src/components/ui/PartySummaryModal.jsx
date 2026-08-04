import { useMemo } from "react";
import { X, Building2 } from "lucide-react";

const STATUS_BADGE = {
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

export default function PartySummaryModal({ party, orders, onClose }) {
  const stats = useMemo(() => {
    const totalQty = orders.reduce((s, o) => s + (Number(o.total_qty) || 0), 0);
    const totalWt = orders.reduce((s, o) => s + (Number(o.total_weight) || 0), 0);

    const groups = {};
    orders.forEach((o) => {
      if (!groups[o.status]) groups[o.status] = { count: 0, qty: 0, wt: 0 };
      groups[o.status].count += 1;
      groups[o.status].qty += Number(o.total_qty) || 0;
      groups[o.status].wt += Number(o.total_weight) || 0;
    });

    return { totalQty, totalWt, groups };
  }, [orders]);

  if (!party) return null;

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-card" onClick={(e) => e.stopPropagation()}>
        <div className="ps-header">
          <h4><Building2 size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{party}</h4>
          <button className="ps-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="ps-body">
          <div className="ps-stats">
            <div className="ps-stat ps-stat-blue"><span>Total Orders</span><strong>{orders.length}</strong></div>
            <div className="ps-stat ps-stat-green"><span>Total Qty (Pcs)</span><strong>{stats.totalQty}</strong></div>
            <div className="ps-stat ps-stat-dark"><span>Total Wt (Ton)</span><strong>{stats.totalWt.toFixed(3)}</strong></div>
          </div>

          <div className="ps-section-title">Status Breakdown</div>
          <div className="ps-status-grid">
            {Object.entries(stats.groups).map(([status, d]) => {
              const badge = STATUS_BADGE[status] || { bg: "#f1f2f6", color: "#4a4d5c" };
              return (
                <div className="ps-status-card" key={status}>
                  <span className="ps-status-badge" style={{ background: badge.bg, color: badge.color }}>{status}</span>
                  <div className="ps-status-row"><span>Orders</span><strong>{d.count}</strong></div>
                  <div className="ps-status-row"><span>Qty</span><strong>{d.qty}</strong></div>
                  <div className="ps-status-row"><span>Wt(T)</span><strong>{d.wt.toFixed(3)}</strong></div>
                </div>
              );
            })}
          </div>

          <div className="ps-section-title">Orders</div>
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr><th>Order ID</th><th>Date</th><th>Brand</th><th>Destination</th><th>Sales</th><th>Qty</th><th>Wt(T)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const badge = STATUS_BADGE[o.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
                  return (
                    <tr key={o.order_id}>
                      <td className="ps-oid">{o.order_id}</td>
                      <td>{formatDate(o.order_date)}</td>
                      <td>{o.brand || "-"}</td>
                      <td>{o.destination || "-"}</td>
                      <td>{o.sales_person || "-"}</td>
                      <td>{o.total_qty}</td>
                      <td>{Number(o.total_weight).toFixed(3)}</td>
                      <td><span className="ps-status-badge" style={{ background: badge.bg, color: badge.color }}>{o.status}</span></td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={8} className="ps-empty">No orders match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        .ps-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 260; display: flex; align-items: center; justify-content: center; padding: 16px; animation: ps-fade 0.18s ease; }
        @keyframes ps-fade { from { opacity: 0; } to { opacity: 1; } }
        .ps-card { width: 100%; max-width: 880px; max-height: 88vh; background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; animation: ps-pop 0.2s cubic-bezier(.2,.8,.3,1); }
        @keyframes ps-pop { from { opacity: 0; transform: scale(0.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .ps-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; background: #14161f; }
        .ps-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #fff; }
        .ps-close { border: none; background: rgba(255,255,255,0.1); width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; }
        .ps-body { padding: 22px 24px 26px 24px; overflow-y: auto; }

        .ps-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 22px; }
        @media (max-width: 560px) { .ps-stats { grid-template-columns: 1fr; } }
        .ps-stat { border-radius: 12px; padding: 14px; text-align: center; }
        .ps-stat span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #8a8da0; margin-bottom: 4px; }
        .ps-stat strong { font-family: 'IBM Plex Mono', monospace; font-size: 21px; }
        .ps-stat-blue { background: #e8f1ff; } .ps-stat-blue strong { color: #1d5fc7; }
        .ps-stat-green { background: #eafaf1; } .ps-stat-green strong { color: #1a8a4c; }
        .ps-stat-dark { background: #f1f2f6; } .ps-stat-dark strong { color: #1c1e26; }

        .ps-section-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #b5620f; margin: 18px 0 10px 0; border-bottom: 1px solid #f0f1f6; padding-bottom: 8px; }
        .ps-status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
        .ps-status-card { border: 1px solid #eceef4; border-radius: 12px; padding: 10px; font-size: 12px; background: #fbfbfd; }
        .ps-status-badge { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; margin-bottom: 6px; }
        .ps-status-row { display: flex; justify-content: space-between; padding: 3px 0; border-top: 1px solid #f0f1f6; }
        .ps-status-row:first-of-type { border-top: none; }
        .ps-status-row span { color: #9295a8; } .ps-status-row strong { font-family: 'IBM Plex Mono', monospace; }

        .ps-table-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: auto; max-height: 300px; }
        .ps-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 640px; }
        .ps-table thead th { position: sticky; top: 0; background: #f6f7fb; padding: 9px 12px; text-align: left; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; }
        .ps-table tbody td { padding: 9px 12px; border-top: 1px solid #f0f1f6; }
        .ps-oid { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-weight: 700; }
        .ps-empty { text-align: center; color: #b7b9c6; padding: 24px !important; }
      `}</style>
    </div>
  );
}
