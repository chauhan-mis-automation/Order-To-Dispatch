import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, CheckCircle2, PackagePlus } from "lucide-react";
import ComboBox from "../components/ui/ComboBox";
import AddMasterModal from "../components/ui/AddMasterModal";
import { useMasterData } from "../hooks/useMasterData";
import { calculateItemWeight, sumItemTotals } from "../utils/weightCalculator";
import { supabase } from "../lib/supabaseClient";

let localIdCounter = 0;
function newLocalId() {
  localIdCounter += 1;
  return `row_${Date.now()}_${localIdCounter}`;
}

function emptyRow() {
  return {
    id: newLocalId(),
    itemName: "",
    shade: "",
    model: "",
    thickness: "",
    size: "",
    qty: 1,
    na: "0.000",
    weightTon: "0.000",
  };
}

// ---- order id generation (same scheme as the old getNextOrderId) ----
function currentFY() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  return month >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

async function fetchNextOrderId() {
  const prefix = `KSM/FIN/${currentFY()}/`;
  const { data, error } = await supabase
    .from("orders")
    .select("order_id")
    .like("order_id", `${prefix}%`)
    .order("order_id", { ascending: false })
    .limit(1);

  if (error) throw error;

  let maxSeq = 0;
  if (data && data.length > 0) {
    const parts = data[0].order_id.split("/");
    const seq = parseInt(parts[3], 10);
    if (!Number.isNaN(seq)) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export default function CreateOrder({ currentUser = "Guest", editOrderId = null, onExitEdit }) {
  const master = useMasterData();

  const [orderId, setOrderId] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [party, setParty] = useState("");
  const [salesPerson, setSalesPerson] = useState("");
  const [brand, setBrand] = useState("");
  const [destination, setDestination] = useState("");
  const [remark, setRemark] = useState("");
  const [fileLink, setFileLink] = useState("");
  const [items, setItems] = useState([emptyRow()]);

  const [addModal, setAddModal] = useState(null); // 'parties' | 'salesPersons' | 'brands' | 'destinations' | null
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success'|'error', message }
  const [loadingOrderId, setLoadingOrderId] = useState(true);

  const loadOrderId = useCallback(async () => {
    setLoadingOrderId(true);
    try {
      const id = await fetchNextOrderId();
      setOrderId(id);
    } catch (err) {
      setStatus({ type: "error", message: "Could not generate order ID: " + err.message });
    } finally {
      setLoadingOrderId(false);
    }
  }, []);

  const loadExistingOrder = useCallback(async (id) => {
    setLoadingOrderId(true);
    setStatus(null);
    try {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("*").eq("order_id", id).single(),
        supabase.from("order_items").select("*").eq("order_id", id),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const o = orderRes.data;
      setOrderId(o.order_id);
      setOrderDate(o.order_date);
      setParty(o.party_name || "");
      setSalesPerson(o.sales_person || "");
      setBrand(o.brand || "");
      setDestination(o.destination || "");
      setRemark(o.remark || "");
      setFileLink(o.file_link || "");

      const loadedItems = (itemsRes.data || []).map((it) => {
        const row = {
          id: newLocalId(),
          itemName: it.item_name || "",
          shade: it.shade || "",
          model: it.model || "",
          thickness: it.thickness || "",
          size: it.size || "",
          qty: it.qty,
          na: "0.000",
          weightTon: "0.000",
        };
        const calc = calculateItemWeight({ itemName: row.itemName, size: row.size, thickness: row.thickness, qty: row.qty });
        return { ...row, na: calc.na, weightTon: calc.weightTon };
      });
      setItems(loadedItems.length > 0 ? loadedItems : [emptyRow()]);
    } catch (err) {
      setStatus({ type: "error", message: "Could not load order: " + err.message });
    } finally {
      setLoadingOrderId(false);
    }
  }, []);

  useEffect(() => {
    if (editOrderId) {
      loadExistingOrder(editOrderId);
    } else {
      loadOrderId();
    }
  }, [editOrderId, loadExistingOrder, loadOrderId]);

  const totals = useMemo(() => sumItemTotals(items), [items]);

  function recalcRow(row) {
    const result = calculateItemWeight({
      itemName: row.itemName,
      size: row.size,
      thickness: row.thickness,
      qty: row.qty,
    });
    return { ...row, na: result.na, weightTon: result.weightTon };
  }

  function updateRow(id, field, value) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        let next = { ...row, [field]: value };

        // reset shade/model when item name changes away from a matching type
        if (field === "itemName") {
          const upper = value.trim().toUpperCase();
          const isMembraneFamily = upper.includes("MEMBRANE") || upper.includes("EMD");
          if (!isMembraneFamily) next.shade = "";
          if (!master.modelsByItem[upper]) next.model = "";
        }

        if (["itemName", "size", "thickness", "qty"].includes(field)) {
          next = recalcRow(next);
        }
        return next;
      })
    );
  }

  function addItemRow() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItemRow(id) {
    setItems((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function isMembraneFamily(itemName) {
    const u = itemName.trim().toUpperCase();
    return u.includes("MEMBRANE") || u.includes("EMD");
  }

  function modelsFor(itemName) {
    return master.modelsByItem[itemName.trim().toUpperCase()] || null;
  }

  async function handleAddMaster(value) {
    const result = await master.addNew(addModal, value);
    if (result.success) {
      if (addModal === "parties") setParty(value);
      if (addModal === "salesPersons") setSalesPerson(value);
      if (addModal === "brands") setBrand(value);
      if (addModal === "destinations") setDestination(value);
      setAddModal(null);
    } else {
      setStatus({ type: "error", message: result.message });
    }
  }

  function validate() {
    if (!party.trim()) return "Party is required.";
    if (!brand.trim()) return "Brand is required.";
    if (!destination.trim()) return "Destination is required.";
    const validItems = items.filter((r) => r.itemName.trim());
    if (validItems.length === 0) return "Add at least one item.";
    for (const row of validItems) {
      if (!row.thickness.trim() || !row.size.trim()) {
        return `Thickness and Size are required for "${row.itemName}".`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setStatus({ type: "error", message: validationError });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const validItems = items.filter((r) => r.itemName.trim());
      const orderPayload = {
        order_date: orderDate,
        party_name: party,
        sales_person: salesPerson || null,
        brand,
        destination,
        file_link: fileLink || null,
        remark: remark || null,
        total_qty: totals.totalQty,
        total_weight: totals.totalWeight,
      };

      if (editOrderId) {
        const { error: orderError } = await supabase.from("orders").update(orderPayload).eq("order_id", editOrderId);
        if (orderError) throw orderError;

        const { error: delErr } = await supabase.from("order_items").delete().eq("order_id", editOrderId);
        if (delErr) throw delErr;
      } else {
        const { error: orderError } = await supabase.from("orders").insert({
          order_id: orderId,
          ...orderPayload,
          status: "Pending",
          created_by: currentUser,
        });
        if (orderError) throw orderError;
      }

      const targetOrderId = editOrderId || orderId;
      const itemRows = validItems.map((row) => ({
        order_id: targetOrderId,
        item_name: row.itemName,
        brand,
        size: row.size,
        thickness: row.thickness,
        qty: parseFloat(row.qty) || 0,
        na: parseFloat(row.na) || 0,
        weight_ton: parseFloat(row.weightTon) || 0,
        shade: row.shade || null,
        model: row.model || null,
      }));
      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
        if (itemsError) throw itemsError;
      }

      if (editOrderId) {
        setStatus({ type: "success", message: `Order ${editOrderId} updated successfully!` });
        if (onExitEdit) setTimeout(() => onExitEdit(), 1100);
      } else {
        setStatus({ type: "success", message: `Order ${orderId} saved successfully!` });
        setParty("");
        setSalesPerson("");
        setBrand("");
        setDestination("");
        setRemark("");
        setFileLink("");
        setItems([emptyRow()]);
        loadOrderId();
      }
    } catch (err) {
      setStatus({ type: "error", message: `Failed to ${editOrderId ? "update" : "save"} order: ` + err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="co-root">
      <style>{`
        .co-root { font-family: 'Inter', sans-serif; color: #1c1e26; max-width: 1400px; width: 100%; }
        .co-card { background: #fff; border: 1px solid #eceef4; border-radius: 18px; overflow: hidden; }
        .co-header {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 20px 24px; border-bottom: 1px solid #f0f1f6; flex-wrap: wrap;
        }
        .co-header h2 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 19px; margin: 0; }
        .co-header-badges { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .co-badge {
          font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
          background: #fdf3e4; color: #b5620f; font-family: 'IBM Plex Mono', monospace;
          display: flex; align-items: center; gap: 6px;
        }
        .co-badge-user { background: #f1f2f6; color: #4a4d5c; font-family: 'Inter', sans-serif; }
        .co-body { padding: 32px 36px; }

        .co-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 18px; margin-bottom: 26px;
        }
        .co-grid .span-2 { grid-column: span 2; }
        .co-grid .span-3 { grid-column: span 3; }
        @media (max-width: 820px) {
          .co-grid { grid-template-columns: repeat(2, 1fr); }
          .co-grid .span-2 { grid-column: span 2; }
        }
        @media (max-width: 560px) {
          .co-grid { grid-template-columns: 1fr; }
          .co-grid .span-2, .co-grid .span-3 { grid-column: span 1; }
        }

        .co-text-field { display: flex; flex-direction: column; gap: 6px; }
        .co-text-field label { font-size: 12.5px; font-weight: 600; color: #5b5f72; }
        .co-text-field input, .co-text-field textarea {
          border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px;
          font-family: 'Inter', sans-serif; outline: none; transition: border-color .15s ease, box-shadow .15s ease;
          width: 100%; box-sizing: border-box;
        }
        .co-text-field input:focus, .co-text-field textarea:focus {
          border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15);
        }

        .co-section-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14px;
          color: #b5620f; text-transform: uppercase; letter-spacing: 0.06em;
          border-bottom: 1px solid #f0f1f6; padding-bottom: 10px; margin-bottom: 16px;
        }

        /* ---- item rows: table on desktop, stacked cards on mobile ---- */
        .co-items-head {
          display: grid;
          grid-template-columns: 2fr 0.9fr 0.9fr 1.1fr 0.6fr 0.7fr 0.8fr 40px;
          gap: 10px; padding: 0 10px 8px 10px;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: #9295a8;
        }
        .co-item-row {
          display: grid;
          grid-template-columns: 2fr 0.9fr 0.9fr 1.1fr 0.6fr 0.7fr 0.8fr 40px;
          gap: 10px; align-items: start; padding: 10px; border: 1px solid #eceef4; border-radius: 12px;
          margin-bottom: 10px; background: #fbfbfd;
        }
        .co-readonly {
          background: #f1f2f6; border: 1px solid #e6e8f0; border-radius: 10px; padding: 10px 12px;
          font-size: 13px; color: #5b5f72; font-family: 'IBM Plex Mono', monospace; text-align: right;
        }
        .co-qty-input {
          border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px;
          width: 100%; box-sizing: border-box; outline: none;
        }
        .co-qty-input:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .co-select {
          border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 10px; font-size: 12.5px;
          width: 100%; box-sizing: border-box; background: #fff;
        }
        .co-del-btn {
          border: none; background: #fdeceb; color: #d64545; width: 34px; height: 34px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 2px;
          transition: background .15s ease;
        }
        .co-del-btn:hover { background: #fbd8d6; }

        @media (max-width: 860px) {
          .co-items-head { display: none; }
          .co-item-row {
            grid-template-columns: 1fr 1fr; grid-auto-rows: auto;
          }
          .co-item-row .co-field-full { grid-column: 1 / -1; }
          .co-field-label {
            display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase;
            color: #9295a8; margin-bottom: 4px; letter-spacing: 0.05em;
          }
        }

        .co-add-item-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 11px; border: 1.5px dashed #e1c78f; border-radius: 12px;
          background: #fffaf1; color: #b5620f; font-weight: 700; font-size: 13px; cursor: pointer;
          transition: background .15s ease, border-color .15s ease;
        }
        .co-add-item-btn:hover { background: #fdf3e4; border-color: #f5a623; }

        .co-totals {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0;
        }
        @media (max-width: 560px) { .co-totals { grid-template-columns: 1fr; } }
        .co-total-box {
          background: #f6f7fb; border: 1px solid #eceef4; border-radius: 12px; padding: 14px; text-align: center;
        }
        .co-total-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.06em; }
        .co-total-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; color: #1c1e26; margin-top: 4px; }

        .co-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 18px; border-top: 1px solid #f0f1f6; flex-wrap: wrap; }
        .co-btn-secondary { border: 1px solid #e1e3ec; background: #fff; color: #4a4d5c; padding: 11px 20px; border-radius: 11px; font-weight: 600; font-size: 13.5px; cursor: pointer; }
        .co-btn-primary {
          border: none; display: flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a;
          padding: 11px 22px; border-radius: 11px; font-weight: 700; font-size: 13.5px; cursor: pointer;
          box-shadow: 0 6px 16px rgba(245,166,35,0.28); transition: transform .15s ease, box-shadow .15s ease;
        }
        .co-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(245,166,35,0.35); }
        .co-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .co-status {
          margin-top: 14px; padding: 12px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600;
          display: flex; align-items: center; gap: 8px;
        }
        .co-status-success { background: #eafaf1; color: #1a8a4c; }
        .co-status-error { background: #fdeceb; color: #c23c33; }
      `}</style>

      <div className="co-card">
        <div className="co-header">
          <h2><PackagePlus size={19} style={{ marginRight: 8, verticalAlign: -3 }} />{editOrderId ? "Edit Order" : "Create New Order"}</h2>
          <div className="co-header-badges">
            <span className="co-badge">
              {loadingOrderId ? <Loader2 size={13} className="co-spin" /> : orderId}
            </span>
          </div>
        </div>

        <div className="co-body">
          {/* ---- master fields ---- */}
          <div className="co-grid">
            <div className="co-text-field">
              <label>Date</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>

            <ComboBox
              label="Party"
              required
              value={party}
              onChange={setParty}
              options={master.parties}
              placeholder="Select Party"
              onAddNew={() => setAddModal("parties")}
            />

            <ComboBox
              label="Sales Person"
              value={salesPerson}
              onChange={setSalesPerson}
              options={master.salesPersons}
              placeholder="Select Sales"
              onAddNew={() => setAddModal("salesPersons")}
            />

            <ComboBox
              label="Brand"
              required
              value={brand}
              onChange={setBrand}
              options={master.brands}
              placeholder="Select Brand"
              onAddNew={() => setAddModal("brands")}
            />

            <ComboBox
              label="Destination"
              required
              value={destination}
              onChange={setDestination}
              options={master.destinations}
              placeholder="Select Destination"
              onAddNew={() => setAddModal("destinations")}
            />

            <div className="co-text-field span-2">
              <label>Reference Link</label>
              <input value={fileLink} onChange={(e) => setFileLink(e.target.value)} placeholder="e.g., Google Drive link" />
            </div>

            <div className="co-text-field span-3">
              <label>Remark (Global)</label>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional global order remark" />
            </div>
          </div>

          {/* ---- items ---- */}
          <div className="co-section-title">Order Items</div>

          <div className="co-items-head">
            <span>Item</span><span>Shade</span><span>Thk *</span><span>Size *</span>
            <span>Qty</span><span>NA</span><span>Wt(Ton)</span><span></span>
          </div>

          {items.map((row) => {
            const membraneFamily = isMembraneFamily(row.itemName);
            const models = modelsFor(row.itemName);
            return (
              <div className="co-item-row" key={row.id}>
                <div className="co-field-full">
                  <span className="co-field-label">Item</span>
                  <ComboBox
                    value={row.itemName}
                    onChange={(v) => updateRow(row.id, "itemName", v)}
                    options={master.items}
                    placeholder="Item"
                  />
                  {models && (
                    <select
                      className="co-select"
                      style={{ marginTop: 6 }}
                      value={row.model}
                      onChange={(e) => updateRow(row.id, "model", e.target.value)}
                    >
                      <option value="">- Select Model -</option>
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <span className="co-field-label">Shade</span>
                  {membraneFamily ? (
                    <select
                      className="co-select"
                      value={row.shade}
                      onChange={(e) => updateRow(row.id, "shade", e.target.value)}
                    >
                      <option value="">-</option>
                      <option value="RW">RW</option>
                      <option value="AT">AT</option>
                    </select>
                  ) : (
                    <div className="co-select" style={{ color: "#c3c5d1", textAlign: "center" }}>—</div>
                  )}
                </div>

                <div>
                  <span className="co-field-label">Thk *</span>
                  <ComboBox
                    value={row.thickness}
                    onChange={(v) => updateRow(row.id, "thickness", v)}
                    options={master.thickness}
                    placeholder="Thk"
                  />
                </div>

                <div>
                  <span className="co-field-label">Size *</span>
                  <ComboBox
                    value={row.size}
                    onChange={(v) => updateRow(row.id, "size", v)}
                    options={master.sizesFt}
                    placeholder="Size"
                  />
                </div>

                <div>
                  <span className="co-field-label">Qty</span>
                  <input
                    type="number"
                    className="co-qty-input"
                    value={row.qty}
                    onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                  />
                </div>

                <div>
                  <span className="co-field-label">NA</span>
                  <div className="co-readonly">{row.na}</div>
                </div>

                <div>
                  <span className="co-field-label">Wt (Ton)</span>
                  <div className="co-readonly">{row.weightTon}</div>
                </div>

                <button className="co-del-btn" onClick={() => removeItemRow(row.id)} title="Remove item">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}

          <button className="co-add-item-btn" onClick={addItemRow}>
            <Plus size={15} strokeWidth={2.6} /> Add Item
          </button>

          {/* ---- totals ---- */}
          <div className="co-totals">
            <div className="co-total-box">
              <div className="co-total-label">Total Pcs</div>
              <div className="co-total-value">{totals.totalQty}</div>
            </div>
            <div className="co-total-box">
              <div className="co-total-label">Total NA</div>
              <div className="co-total-value">{totals.totalNa.toFixed(3)}</div>
            </div>
            <div className="co-total-box">
              <div className="co-total-label">Total Weight</div>
              <div className="co-total-value">{totals.totalWeight.toFixed(3)}</div>
            </div>
          </div>

          {status && (
            <div className={`co-status ${status.type === "success" ? "co-status-success" : "co-status-error"}`}>
              {status.type === "success" ? <CheckCircle2 size={16} /> : null}
              {status.message}
            </div>
          )}

          <div className="co-footer">
            {editOrderId ? (
              <button className="co-btn-secondary" onClick={() => onExitEdit && onExitEdit()}>
                Cancel
              </button>
            ) : (
              <button className="co-btn-secondary" onClick={() => { setItems([emptyRow()]); setStatus(null); }}>
                Reset
              </button>
            )}
            <button className="co-btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 size={16} className="co-spin" /> : <CheckCircle2 size={16} />}
              {saving ? (editOrderId ? "Updating..." : "Saving...") : (editOrderId ? "Update Order" : "Save Order")}
            </button>
          </div>
        </div>
      </div>

      <AddMasterModal
        open={!!addModal}
        title={
          addModal === "parties" ? "Add New Party" :
          addModal === "salesPersons" ? "Add New Sales Person" :
          addModal === "brands" ? "Add New Brand" :
          addModal === "destinations" ? "Add New Destination" : ""
        }
        onClose={() => setAddModal(null)}
        onSubmit={handleAddMaster}
      />

      <style>{`
        .co-spin { animation: co-spin-anim 0.9s linear infinite; }
        @keyframes co-spin-anim { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
