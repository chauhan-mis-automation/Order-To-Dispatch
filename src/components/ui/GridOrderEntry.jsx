import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { calculateItemWeight } from "../../utils/weightCalculator";

// flattens the { itemName: { thickness: { size: qty } } } matrix into the
// same row shape the List-entry mode produces, ready for order_items insert.
// variantByItem: { itemName: { shade, model } } — applied to every row from that item's section.
export function flattenGrid(qtyMatrix, variantByItem = {}) {
  const rows = [];
  Object.entries(qtyMatrix || {}).forEach(([itemName, byThickness]) => {
    Object.entries(byThickness || {}).forEach(([thickness, bySize]) => {
      Object.entries(bySize || {}).forEach(([size, qtyStr]) => {
        const qty = parseFloat(qtyStr) || 0;
        if (qty <= 0) return;
        const calc = calculateItemWeight({ itemName, size, thickness, qty });
        const variant = variantByItem[itemName] || {};
        rows.push({
          itemName, thickness, size, qty,
          na: calc.na, weightTon: calc.weightTon,
          shade: variant.shade || "", model: variant.model || "",
        });
      });
    });
  });
  return rows;
}

function setCell(qtyMatrix, itemName, thickness, size, value) {
  const next = { ...qtyMatrix };
  next[itemName] = { ...(next[itemName] || {}) };
  next[itemName][thickness] = { ...(next[itemName][thickness] || {}) };
  next[itemName][thickness][size] = value;
  return next;
}

export default function GridOrderEntry({ master, qtyMatrix, setQtyMatrix, variants = {}, setVariants }) {
  const [sizeMap, setSizeMap] = useState({});      // { itemName: [sizes...] }
  const [thicknessMap, setThicknessMap] = useState({}); // { itemName: [thicknesses...] }
  const [loading, setLoading] = useState(true);
  const [addingFor, setAddingFor] = useState(null); // itemName currently adding a size/thickness
  const [newSize, setNewSize] = useState("");
  const [newThickness, setNewThickness] = useState("");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  const items = master.items || [];

  function needsShade(itemName) {
    const u = itemName.trim().toUpperCase();
    return u.includes("MEMBRANE") || u.includes("EMD");
  }
  function modelsFor(itemName) {
    return master.modelsByItem[itemName.trim().toUpperCase()] || null;
  }
  function updateVariant(itemName, field, value) {
    setVariants((prev) => ({ ...prev, [itemName]: { ...(prev[itemName] || {}), [field]: value } }));
  }

  async function loadMaps() {
    setLoading(true);
    const [sizeRes, thickRes] = await Promise.all([
      supabase.from("item_size_map").select("*").order("item_name").order("sequence"),
      supabase.from("item_thickness_map").select("*").order("item_name").order("sequence"),
    ]);
    const sMap = {};
    (sizeRes.data || []).forEach((r) => {
      sMap[r.item_name] = sMap[r.item_name] || [];
      sMap[r.item_name].push(r.size);
    });
    const tMap = {};
    (thickRes.data || []).forEach((r) => {
      tMap[r.item_name] = tMap[r.item_name] || [];
      tMap[r.item_name].push(r.thickness);
    });
    setSizeMap(sMap);
    setThicknessMap(tMap);
    setLoading(false);
  }

  useEffect(() => { loadMaps(); }, []);

  function cellValue(itemName, thickness, size) {
    return qtyMatrix?.[itemName]?.[thickness]?.[size] ?? "";
  }
  function handleCellChange(itemName, thickness, size, value) {
    setQtyMatrix((prev) => setCell(prev, itemName, thickness, size, value));
  }

  async function addSizeFor(itemName) {
    if (!newSize.trim()) return;
    setSaving(true);
    setAddError("");
    try {
      const existing = sizeMap[itemName] || [];
      const { error } = await supabase.from("item_size_map").insert({
        item_name: itemName, size: newSize.trim(), sequence: existing.length + 1,
      });
      if (error && error.code !== "23505") throw error; // 23505 = already exists, harmless
      await master.addNew("sizesFt", newSize.trim()); // keep the global master in sync too (List-entry mode uses it)
      await loadMaps();
      setNewSize("");
      setAddingFor(null);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addThicknessFor(itemName) {
    if (!newThickness.trim()) return;
    setSaving(true);
    setAddError("");
    try {
      const existing = thicknessMap[itemName] || [];
      const { error } = await supabase.from("item_thickness_map").insert({
        item_name: itemName, thickness: newThickness.trim(), sequence: existing.length + 1,
      });
      if (error && error.code !== "23505") throw error;
      await master.addNew("thickness", newThickness.trim());
      await loadMaps();
      setNewThickness("");
      setAddingFor(null);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // per-item computed rows/totals
  const itemComputed = useMemo(() => {
    const out = {};
    items.forEach((itemName) => {
      const sizes = sizeMap[itemName] || [];
      const thicknesses = thicknessMap[itemName] || [];
      const byThickness = qtyMatrix?.[itemName] || {};
      const rowTotals = thicknesses.map((thickness) => {
        let pcs = 0, na = 0, ton = 0;
        sizes.forEach((size) => {
          const qty = parseFloat(byThickness?.[thickness]?.[size]) || 0;
          if (qty <= 0) return;
          const calc = calculateItemWeight({ itemName, size, thickness, qty });
          pcs += qty; na += Number(calc.na) || 0; ton += Number(calc.weightTon) || 0;
        });
        return { thickness, pcs, na, ton };
      });
      const itemTotal = rowTotals.reduce(
        (acc, r) => ({ pcs: acc.pcs + r.pcs, na: acc.na + r.na, ton: acc.ton + r.ton }),
        { pcs: 0, na: 0, ton: 0 }
      );
      out[itemName] = { sizes, thicknesses, rowTotals, itemTotal };
    });
    return out;
  }, [qtyMatrix, items, sizeMap, thicknessMap]);

  const grandTotal = useMemo(() => {
    return Object.values(itemComputed).reduce(
      (acc, v) => ({ pcs: acc.pcs + v.itemTotal.pcs, na: acc.na + v.itemTotal.na, ton: acc.ton + v.itemTotal.ton }),
      { pcs: 0, na: 0, ton: 0 }
    );
  }, [itemComputed]);

  if (loading) {
    return <div className="goe-loading">Loading grid...</div>;
  }

  return (
    <div className="goe-root">
      <style>{`
        .goe-root { font-family: 'Inter', sans-serif; }
        .goe-loading { padding: 30px; text-align: center; color: #9295a8; font-size: 13px; }

        .goe-section { margin-bottom: 22px; border: 1px solid #eceef4; border-radius: 14px; overflow: hidden; }
        .goe-section-head { display: flex; align-items: center; justify-content: space-between; background: #14161f; padding: 10px 14px; flex-wrap: wrap; gap: 8px; }
        .goe-section-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; }
        .goe-section-actions { display: flex; gap: 6px; }
        .goe-mini-btn { border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); color: #ffcd80; border-radius: 8px; padding: 5px 10px; font-size: 10.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; }
        .goe-mini-btn:hover { background: rgba(255,255,255,0.15); }
        .goe-variant-select { border: 1px solid rgba(255,255,255,0.25); background: #1e2130; color: #ffcd80; border-radius: 8px; padding: 5px 8px; font-size: 11px; font-weight: 700; }

        .goe-add-row { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #fff9ef; border-bottom: 1px solid #e1c78f; flex-wrap: wrap; }
        .goe-add-row input { border: 1px solid #e1e3ec; border-radius: 8px; padding: 7px 10px; font-size: 12px; width: 110px; }
        .goe-add-row button { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; border-radius: 8px; padding: 7px 12px; font-weight: 700; font-size: 11.5px; cursor: pointer; }
        .goe-add-row .goe-cancel { background: #f1f2f6; color: #5b5f72; }
        .goe-add-error { color: #c23c33; font-size: 11px; font-weight: 600; width: 100%; }

        .goe-table-wrap { overflow: auto; }
        .goe-table { border-collapse: collapse; font-size: 12.5px; width: 100%; min-width: 600px; }
        .goe-table th, .goe-table td { border: 1px solid #eceef4; padding: 6px 8px; text-align: center; white-space: nowrap; }
        .goe-table thead th { background: #f6f7fb; color: #4a4d5c; font-size: 10.5px; text-transform: uppercase; font-weight: 700; position: sticky; top: 0; }
        .goe-table thead th:first-child { position: sticky; left: 0; background: #f6f7fb; z-index: 1; }
        .goe-thickness-cell { background: #fbfbfd; font-weight: 700; text-align: left; position: sticky; left: 0; }
        .goe-qty-input { width: 56px; border: 1px solid #e1e3ec; border-radius: 6px; padding: 5px 4px; text-align: center; font-size: 12px; }
        .goe-qty-input:focus { border-color: #f5a623; outline: none; box-shadow: 0 0 0 2px rgba(245,166,35,0.15); }
        .goe-total-row td { background: #fdf3e4; font-weight: 800; color: #b5620f; }
        .goe-num { font-family: 'IBM Plex Mono', monospace; }
        .goe-empty-note { padding: 14px; font-size: 12px; color: #9295a8; text-align: center; }

        .goe-grand { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
        @media (max-width: 560px) { .goe-grand { grid-template-columns: 1fr; } }
        .goe-grand-box { background: #fff; border: 2px solid #1a8a4c33; border-radius: 12px; padding: 14px; text-align: center; }
        .goe-grand-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.06em; }
        .goe-grand-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; color: #1a8a4c; margin-top: 4px; }
      `}</style>

      {items.map((itemName) => {
        const { sizes, thicknesses, rowTotals, itemTotal } = itemComputed[itemName] || { sizes: [], thicknesses: [], rowTotals: [], itemTotal: { pcs: 0, na: 0, ton: 0 } };
        const isAddingSize = addingFor === `${itemName}__size`;
        const isAddingThickness = addingFor === `${itemName}__thickness`;
        const models = modelsFor(itemName);
        const showShade = needsShade(itemName);
        const currentVariant = variants[itemName] || {};
        return (
          <div className="goe-section" key={itemName}>
            <div className="goe-section-head">
              <span className="goe-section-title">{itemName}</span>
              <div className="goe-section-actions">
                {models && (
                  <select
                    className="goe-variant-select"
                    value={currentVariant.model || ""}
                    onChange={(e) => updateVariant(itemName, "model", e.target.value)}
                  >
                    <option value="">- Select Model -</option>
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                {showShade && (
                  <select
                    className="goe-variant-select"
                    value={currentVariant.shade || ""}
                    onChange={(e) => updateVariant(itemName, "shade", e.target.value)}
                  >
                    <option value="">- Shade -</option>
                    <option value="RW">RW</option>
                    <option value="AT">AT</option>
                  </select>
                )}
                <button className="goe-mini-btn" onClick={() => { setAddingFor(`${itemName}__size`); setAddError(""); }}>
                  <Plus size={11} /> Add Size
                </button>
                <button className="goe-mini-btn" onClick={() => { setAddingFor(`${itemName}__thickness`); setAddError(""); }}>
                  <Plus size={11} /> Add Thickness
                </button>
              </div>
            </div>

            {isAddingSize && (
              <div className="goe-add-row">
                <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="e.g. 9x4" autoFocus />
                <button onClick={() => addSizeFor(itemName)} disabled={saving}>Add</button>
                <button className="goe-cancel" onClick={() => { setAddingFor(null); setNewSize(""); setAddError(""); }}>Cancel</button>
                {addError && <span className="goe-add-error">{addError}</span>}
              </div>
            )}
            {isAddingThickness && (
              <div className="goe-add-row">
                <input value={newThickness} onChange={(e) => setNewThickness(e.target.value)} placeholder="e.g. 22MM" autoFocus />
                <button onClick={() => addThicknessFor(itemName)} disabled={saving}>Add</button>
                <button className="goe-cancel" onClick={() => { setAddingFor(null); setNewThickness(""); setAddError(""); }}>Cancel</button>
                {addError && <span className="goe-add-error">{addError}</span>}
              </div>
            )}

            {sizes.length === 0 || thicknesses.length === 0 ? (
              <div className="goe-empty-note">
                No {sizes.length === 0 ? "sizes" : "thicknesses"} set up for {itemName} yet — use "Add Size" / "Add Thickness" above.
              </div>
            ) : (
              <div className="goe-table-wrap">
                <table className="goe-table">
                  <thead>
                    <tr>
                      <th>Thickness</th>
                      {sizes.map((size) => <th key={size}>{size}</th>)}
                      <th>PCS</th><th>NA</th><th>TON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thicknesses.map((thickness) => {
                      const rt = rowTotals.find((r) => r.thickness === thickness) || { pcs: 0, na: 0, ton: 0 };
                      return (
                        <tr key={thickness}>
                          <td className="goe-thickness-cell">{thickness}</td>
                          {sizes.map((size) => (
                            <td key={size}>
                              <input
                                type="number"
                                className="goe-qty-input"
                                value={cellValue(itemName, thickness, size)}
                                onChange={(e) => handleCellChange(itemName, thickness, size, e.target.value)}
                                placeholder="0"
                              />
                            </td>
                          ))}
                          <td className="goe-num">{rt.pcs || 0}</td>
                          <td className="goe-num">{rt.na.toFixed(3)}</td>
                          <td className="goe-num">{rt.ton.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                    <tr className="goe-total-row">
                      <td>TOTAL {itemName}</td>
                      {sizes.map((size) => <td key={size}></td>)}
                      <td className="goe-num">{itemTotal.pcs}</td>
                      <td className="goe-num">{itemTotal.na.toFixed(3)}</td>
                      <td className="goe-num">{itemTotal.ton.toFixed(3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="goe-grand">
        <div className="goe-grand-box"><div className="goe-grand-label">Grand Total PCS</div><div className="goe-grand-value">{grandTotal.pcs}</div></div>
        <div className="goe-grand-box"><div className="goe-grand-label">Grand Total NA</div><div className="goe-grand-value">{grandTotal.na.toFixed(3)}</div></div>
        <div className="goe-grand-box"><div className="goe-grand-label">Grand Total TON</div><div className="goe-grand-value">{grandTotal.ton.toFixed(3)}</div></div>
      </div>
    </div>
  );
}
