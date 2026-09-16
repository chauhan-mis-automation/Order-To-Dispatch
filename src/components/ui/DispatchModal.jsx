import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Loader2, Truck } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useMasterData } from "../../hooks/useMasterData";
import { calculateItemWeight } from "../../utils/weightCalculator";
import ComboBox from "./ComboBox";
import ConfirmDialog from "./ConfirmDialog";

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `d_${Date.now()}_${idCounter}`;
}

function keyFor(itemName, brand, size, thickness) {
  return `${itemName}_${brand || ""}_${size}_${thickness}`.toUpperCase();
}

export default function DispatchModal({ order, currentUser, requireLogin, onClose, onDispatched }) {
  const master = useMasterData();

  const [loading, setLoading] = useState(true);
  const [orderItems, setOrderItems] = useState([]); // the original, untouched order — never overwritten
  const [alreadyDispatchedMap, setAlreadyDispatchedMap] = useState({}); // key -> qty dispatched so far (prior actions)
  const [rows, setRows] = useState([]);
  const [fgStock, setFgStock] = useState([]);
  const [truckNo, setTruckNo] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [itemsRes, logsRes, fgRes] = await Promise.all([
        supabase.from("order_items").select("*").eq("order_id", order.order_id),
        supabase.from("dispatch_logs").select("*").eq("order_id", order.order_id),
        supabase.from("fg_stock").select("*"),
      ]);
      if (cancelled) return;

      const items = itemsRes.data || [];
      setOrderItems(items);

      // sum everything dispatched so far, across every prior dispatch action
      const dispatchedMap = {};
      (logsRes.data || []).forEach((log) => {
        const key = keyFor(log.item_name, log.brand, log.size, log.thickness);
        dispatchedMap[key] = (dispatchedMap[key] || 0) + (Number(log.dispatched_qty) || 0);
      });
      setAlreadyDispatchedMap(dispatchedMap);

      // default "dispatching now" qty = whatever's still remaining for each item
      const builtRows = items
        .map((item) => {
          const key = keyFor(item.item_name, item.brand, item.size, item.thickness);
          const ordered = Number(item.qty) || 0;
          const already = dispatchedMap[key] || 0;
          const remaining = Math.max(0, ordered - already);
          return {
            id: newId(),
            itemName: item.item_name, brand: item.brand, size: item.size, thickness: item.thickness,
            ordered, already, qty: remaining,
            na: "0.000", weightTon: "0.000", sqMtr: "0.00",
            shade: item.shade || "", model: item.model || "", remark: "",
          };
        })
        .filter((r) => r.ordered > r.already); // fully-dispatched items don't need to show up again

      setRows(builtRows.map((r) => {
        const calc = calculateItemWeight({ itemName: r.itemName, size: r.size, thickness: r.thickness, qty: r.qty });
        return { ...r, na: calc.na, weightTon: calc.weightTon, sqMtr: calc.sqMtr };
      }));

      setFgStock(fgRes.data || []);
      setTruckNo("");
      setBillAmount("");
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [order]);

  function recalcRow(row) {
    const calc = calculateItemWeight({ itemName: row.itemName, size: row.size, thickness: row.thickness, qty: row.qty });
    return { ...row, na: calc.na, weightTon: calc.weightTon, sqMtr: calc.sqMtr };
  }

  function updateRow(id, field, value) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      let next = { ...r, [field]: value };
      if (["size", "thickness", "qty"].includes(field)) next = recalcRow(next);
      return next;
    }));
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addItem() {
    if (!newItemName.trim()) return;
    const base = { itemName: newItemName.trim(), brand: order.brand, size: "", thickness: "", qty: 0, remark: "", shade: "", model: "" };
    const calc = calculateItemWeight(base);
    setRows((prev) => [...prev, { id: newId(), ...base, ordered: 0, already: 0, na: calc.na, weightTon: calc.weightTon, sqMtr: calc.sqMtr }]);
    setNewItemName("");
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.pcs += Number(r.qty) || 0;
        acc.sqMtr += Number(r.sqMtr) || 0;
        acc.weight += Number(r.weightTon) || 0;
        return acc;
      },
      { pcs: 0, sqMtr: 0, weight: 0 }
    );
  }, [rows]);

  function isMembraneFamily(itemName) {
    const u = (itemName || "").trim().toUpperCase();
    return u.includes("MEMBRANE") || u.includes("EMD");
  }

  async function performDispatch(userName) {
    setSaving(true);
    setError("");
    try {
      // ---- log this dispatch action ----
      const logRows = rows
        .filter((r) => (Number(r.qty) || 0) > 0)
        .map((r) => {
          const nowDispatched = Number(r.qty) || 0;
          const totalDispatchedAfter = r.already + nowDispatched;
          const pending = Math.max(0, r.ordered - totalDispatchedAfter);
          const status = totalDispatchedAfter >= r.ordered ? "Full" : "Short";
          return {
            order_id: order.order_id,
            dispatched_by: userName,
            item_name: r.itemName, brand: r.brand, size: r.size, thickness: r.thickness,
            ordered_qty: r.ordered, dispatched_qty: nowDispatched, pending_qty: pending,
            variance_status: pending === 0 ? status : (totalDispatchedAfter > r.ordered ? "Excess" : "Short"),
            truck_no: truckNo || null, bill_amount: billAmount ? Number(billAmount) : null,
          };
        });

      if (logRows.length > 0) {
        const { error: logErr } = await supabase.from("dispatch_logs").insert(logRows);
        if (logErr) throw logErr;
      }

      // deduct only what's being dispatched THIS round from finished-goods stock
      for (const r of rows) {
        const qtyDispatched = Number(r.qty) || 0;
        if (qtyDispatched <= 0) continue;
        const { data: fgRow } = await supabase
          .from("fg_stock")
          .select("*")
          .eq("item_name", r.itemName)
          .eq("brand", r.brand || "")
          .eq("size", r.size)
          .eq("thickness", r.thickness)
          .maybeSingle();
        if (fgRow) {
          const newQty = Math.max(0, Number(fgRow.qty_available) - qtyDispatched);
          await supabase
            .from("fg_stock")
            .update({ qty_available: newQty, updated_at: new Date().toISOString() })
            .eq("id", fgRow.id);
        }
      }

      // ---- figure out whether the WHOLE order is now fully dispatched, or still partial ----
      // order_items is never touched — it always reflects the original demand
      const { data: freshLogs } = await supabase.from("dispatch_logs").select("*").eq("order_id", order.order_id);
      const totalDispatchedMap = {};
      (freshLogs || []).forEach((log) => {
        const key = keyFor(log.item_name, log.brand, log.size, log.thickness);
        totalDispatchedMap[key] = (totalDispatchedMap[key] || 0) + (Number(log.dispatched_qty) || 0);
      });
      const isFullyDispatched = orderItems.every((item) => {
        const key = keyFor(item.item_name, item.brand, item.size, item.thickness);
        return (totalDispatchedMap[key] || 0) >= (Number(item.qty) || 0);
      });

      const orderUpdate = {
        status: isFullyDispatched ? "Dispatched" : "Partially Dispatched",
        truck_no: truckNo || order.truck_no || null,
        bill_amount: billAmount ? Number(billAmount) : order.bill_amount || null,
      };
      if (isFullyDispatched) orderUpdate.dispatched_at = new Date().toISOString();
      if (order.original_qty === null || order.original_qty === undefined) {
        orderUpdate.original_qty = order.total_qty;
      }
      const { error: orderErr } = await supabase.from("orders").update(orderUpdate).eq("order_id", order.order_id);
      if (orderErr) throw orderErr;

      setSaving(false);
      onDispatched && onDispatched();
    } catch (err) {
      setError(err.message || "Failed to dispatch order.");
      setSaving(false);
    }
  }

  function handleSubmitClick() {
    setConfirmOpen(true);
  }

  function handleConfirmDispatch() {
    setConfirmOpen(false);
    requireLogin((userName) => performDispatch(userName));
  }

  const allFullyDispatched = !loading && rows.length === 0;

  return (
    <div className="dm-overlay" onClick={onClose}>
      <div className="dm-card" onClick={(e) => e.stopPropagation()}>
        <div className="dm-header">
          <div>
            <div className="dm-eyebrow">Dispatch Entry</div>
            <h4><Truck size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{order.order_id}</h4>
          </div>
          <button className="dm-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="dm-body">
          {loading ? (
            <div className="dm-loading"><Loader2 size={22} className="dm-spin" /> Loading items...</div>
          ) : allFullyDispatched ? (
            <div className="dm-loading">Everything on this order has already been dispatched.</div>
          ) : (
            <>
              <div className="dm-info-grid">
                <div><span>Party</span><strong>{order.party_name}</strong></div>
                <div><span>Brand</span><strong>{order.brand || "-"}</strong></div>
                <div><span>Destination</span><strong>{order.destination || "-"}</strong></div>
                <div>
                  <span>Truck No (this shipment)</span>
                  <input className="dm-field-input" value={truckNo} onChange={(e) => setTruckNo(e.target.value)} placeholder="e.g. OD05 AB 1234" />
                </div>
                <div>
                  <span>Bill Amount (₹, this shipment)</span>
                  <input type="number" className="dm-field-input" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="0.00" />
                </div>
              </div>

              {error && <div className="dm-error">{error}</div>}

              <div className="dm-items-head">
                <span>Item</span><span>Thk</span><span>Size</span><span>Ordered / Pending</span>
                <span>Dispatching Now</span><span>Wt(Ton)</span><span>Remark</span><span></span>
              </div>

              {rows.map((row) => {
                const remainingAfterThis = row.ordered - row.already - (Number(row.qty) || 0);
                return (
                  <div className="dm-item-row" key={row.id}>
                    <div className="dm-field-full">
                      <span className="dm-field-label">Item</span>
                      <div className="dm-item-name">
                        {row.itemName}
                        {row.model && <span className="dm-badge dm-badge-blue">{row.model}</span>}
                        {row.already > 0 && <span className="dm-badge dm-badge-green">{row.already} already dispatched</span>}
                      </div>
                      {isMembraneFamily(row.itemName) && (
                        <select className="dm-select" value={row.shade} onChange={(e) => updateRow(row.id, "shade", e.target.value)}>
                          <option value="">- Shade -</option>
                          <option value="RW">RW</option>
                          <option value="AT">AT</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <span className="dm-field-label">Thk</span>
                      <ComboBox value={row.thickness} onChange={(v) => updateRow(row.id, "thickness", v)} options={master.thickness} placeholder="Thk" />
                    </div>
                    <div>
                      <span className="dm-field-label">Size</span>
                      <ComboBox value={row.size} onChange={(v) => updateRow(row.id, "size", v)} options={master.sizesFt} placeholder="Size" />
                    </div>
                    <div>
                      <span className="dm-field-label">Ordered / Pending</span>
                      <div className="dm-readonly" style={{ textAlign: "center" }}>{row.ordered} / {Math.max(0, row.ordered - row.already)}</div>
                    </div>
                    <div>
                      <span className="dm-field-label">Dispatching Now</span>
                      <input type="number" className="dm-qty-input" value={row.qty} onChange={(e) => updateRow(row.id, "qty", e.target.value)} />
                      {remainingAfterThis > 0 && (
                        <div className="dm-stock-hint">{remainingAfterThis} will remain pending after this</div>
                      )}
                      {(() => {
                        const stockRow = fgStock.find(
                          (f) => f.item_name === row.itemName && (f.brand || "") === (row.brand || "") && f.size === row.size && f.thickness === row.thickness
                        );
                        const available = stockRow ? Number(stockRow.qty_available) : 0;
                        const over = (Number(row.qty) || 0) > available;
                        if (!stockRow) {
                          return <div className="dm-stock-hint dm-stock-over">⚠️ No stock record for "{row.brand || "no brand"}" — will NOT deduct</div>;
                        }
                        return <div className={`dm-stock-hint ${over ? "dm-stock-over" : ""}`}>Stock: {available} {over ? "⚠️ exceeds stock" : ""}</div>;
                      })()}
                    </div>
                    <div>
                      <span className="dm-field-label">Wt(Ton)</span>
                      <div className="dm-readonly">{row.weightTon}</div>
                    </div>
                    <div>
                      <span className="dm-field-label">Remark</span>
                      <input className="dm-remark-input" value={row.remark} onChange={(e) => updateRow(row.id, "remark", e.target.value)} />
                    </div>
                    <button className="dm-del-btn" onClick={() => removeRow(row.id)} title="Remove"><Trash2 size={14} /></button>
                  </div>
                );
              })}

              <div className="dm-add-row">
                <ComboBox value={newItemName} onChange={setNewItemName} options={master.items} placeholder="Search item to add..." />
                <button className="dm-add-btn" onClick={addItem}><Plus size={15} /> Add</button>
              </div>

              <div className="dm-totals">
                <div className="dm-total-box"><div className="dm-total-label">Dispatching Now (Pcs)</div><div className="dm-total-value">{totals.pcs}</div></div>
                <div className="dm-total-box"><div className="dm-total-label">Sq.M</div><div className="dm-total-value">{totals.sqMtr.toFixed(2)}</div></div>
                <div className="dm-total-box"><div className="dm-total-label">Weight</div><div className="dm-total-value">{totals.weight.toFixed(3)}</div></div>
              </div>

              <button className="dm-submit" onClick={handleSubmitClick} disabled={saving}>
                {saving ? <Loader2 size={16} className="dm-spin" /> : null}
                {saving ? "Processing..." : "Submit Dispatch"}
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Dispatch?"
        message={`Dispatch ${totals.pcs} pcs for ${order.order_id}? If anything is still pending after this, the order will stay in the Dispatch queue for the remaining quantity.`}
        confirmLabel="Yes, Dispatch!"
        onConfirm={handleConfirmDispatch}
        onCancel={() => setConfirmOpen(false)}
      />

      <style>{`
        .dm-overlay {
          position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px);
          z-index: 220; display: flex; align-items: center; justify-content: center; padding: 16px;
          animation: dm-fade 0.18s ease;
        }
        @keyframes dm-fade { from { opacity: 0; } to { opacity: 1; } }
        .dm-card {
          width: 100%; max-width: 1020px; max-height: 90vh; background: #f6f7fb; border-radius: 20px;
          box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column;
          animation: dm-pop 0.2s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes dm-pop { from { opacity: 0; transform: scale(0.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .dm-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 26px; background: #fff; border-bottom: 1px solid #eceef4; }
        .dm-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9295a8; margin-bottom: 3px; }
        .dm-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 18px; color: #b5620f; }
        .dm-close { border: none; background: #f1f2f6; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
        .dm-body { padding: 22px 26px 28px 26px; overflow-y: auto; }
        .dm-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px 0; color: #9295a8; }
        .dm-spin { animation: dm-spin-anim 0.9s linear infinite; }
        @keyframes dm-spin-anim { to { transform: rotate(360deg); } }
        .dm-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }

        .dm-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 16px; }
        @media (max-width: 700px) { .dm-info-grid { grid-template-columns: 1fr 1fr; } }
        .dm-info-grid > div span { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #9295a8; margin-bottom: 4px; letter-spacing: 0.04em; }
        .dm-info-grid > div strong { font-size: 13.5px; color: #1c1e26; }
        .dm-field-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 8px 10px; font-size: 13px; outline: none;
        }
        .dm-field-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }

        .dm-items-head {
          display: grid; grid-template-columns: 2fr 0.8fr 0.9fr 1fr 1.2fr 0.8fr 1fr 34px; gap: 8px;
          padding: 0 10px 8px 10px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #9295a8;
        }
        .dm-item-row {
          display: grid; grid-template-columns: 2fr 0.8fr 0.9fr 1fr 1.2fr 0.8fr 1fr 34px; gap: 8px;
          align-items: start; padding: 10px; border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 8px; background: #fff;
        }
        .dm-item-name { font-size: 13px; font-weight: 700; color: #1c1e26; padding: 10px 0; }
        .dm-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; margin-left: 6px; }
        .dm-badge-blue { background: #e8f1ff; color: #1d5fc7; }
        .dm-badge-green { background: #eafaf1; color: #1a8a4c; }
        .dm-select {
          margin-top: 6px; width: 100%; border: 1px solid #e1e3ec; border-radius: 8px; padding: 6px 8px; font-size: 12px;
        }
        .dm-qty-input, .dm-remark-input {
          width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 9px 10px; font-size: 13px; outline: none;
        }
        .dm-qty-input:focus, .dm-remark-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .dm-stock-hint { font-size: 10px; color: #9295a8; margin-top: 4px; font-family: 'IBM Plex Mono', monospace; }
        .dm-stock-over { color: #c23c33; font-weight: 700; }
        .dm-readonly {
          background: #f1f2f6; border: 1px solid #e6e8f0; border-radius: 9px; padding: 9px 10px; font-size: 12.5px;
          color: #5b5f72; font-family: 'IBM Plex Mono', monospace; text-align: right;
        }
        .dm-del-btn {
          border: none; background: #fdeceb; color: #d64545; width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 2px;
        }
        .dm-del-btn:hover { background: #fbd8d6; }

        .dm-add-row {
          display: flex; gap: 10px; align-items: center; padding: 12px; background: #fff9ef; border: 1.5px dashed #e1c78f;
          border-radius: 12px; margin: 14px 0 20px 0;
        }
        .dm-add-row > div:first-child { flex: 1; }
        .dm-add-btn {
          border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; border-radius: 9px;
          padding: 10px 16px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;
        }

        .dm-totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        @media (max-width: 560px) { .dm-totals { grid-template-columns: 1fr; } }
        .dm-total-box { background: #fff; border: 2px solid #1a8a4c33; border-radius: 12px; padding: 14px; text-align: center; }
        .dm-total-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.06em; }
        .dm-total-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; color: #1a8a4c; margin-top: 4px; }

        .dm-submit {
          width: 100%; border: none; padding: 14px; border-radius: 12px; font-weight: 700; font-size: 14.5px;
          background: linear-gradient(135deg, #f5c343, #f5a623); color: #17130a; cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.3); display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .dm-submit:disabled { opacity: 0.7; cursor: not-allowed; }

        @media (max-width: 760px) {
          .dm-items-head { display: none; }
          .dm-item-row { grid-template-columns: 1fr 1fr; }
          .dm-item-row .dm-field-full { grid-column: 1 / -1; }
          .dm-field-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9295a8; margin-bottom: 4px; }
        }
      `}</style>
    </div>
  );
}
