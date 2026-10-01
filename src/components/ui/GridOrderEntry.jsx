import React, { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { calculateItemWeight } from "../../utils/weightCalculator";

let blockIdCounter = 0;
function newBlockId() {
  blockIdCounter += 1;
  return `blk_${Date.now()}_${blockIdCounter}`;
}

// flattens the qty matrix into the same row shape the List-entry mode produces,
// ready for order_items insert.
//
// Two shapes are supported, distinguished purely by whether variantByItem[itemName]
// has a `.blocks` array:
//   - Plain items:        qtyMatrix[itemName] = { thickness: { size: qty } }
//   - Multi-model items:  qtyMatrix[itemName] = { [blockId]: { thickness: { size: qty } } }
//     with variantByItem[itemName] = { blocks: [{ id, model, shade }, ...] }
//     — this is what lets one order carry e.g. EMD-52/30MM/78x36 qty 10 AND
//     EMD-53/30MM/78x30 qty 12 as two separate rows in the same item section.
export function flattenGrid(qtyMatrix, variantByItem = {}) {
  const rows = [];
  Object.entries(qtyMatrix || {}).forEach(([itemName, matrixValue]) => {
    const variantEntry = variantByItem[itemName];
    if (variantEntry && Array.isArray(variantEntry.blocks)) {
      const blockById = {};
      variantEntry.blocks.forEach((b) => { blockById[b.id] = b; });
      Object.entries(matrixValue || {}).forEach(([blockId, byThickness]) => {
        const block = blockById[blockId] || {};
        Object.entries(byThickness || {}).forEach(([thickness, bySize]) => {
          Object.entries(bySize || {}).forEach(([size, qtyStr]) => {
            const qty = parseFloat(qtyStr) || 0;
            if (qty <= 0) return;
            const calc = calculateItemWeight({ itemName, size, thickness, qty });
            rows.push({
              itemName, thickness, size, qty,
              na: calc.na, weightTon: calc.weightTon,
              shade: block.shade || "", model: block.model || "",
            });
          });
        });
      });
    } else {
      const flatShade = variantEntry?.shade || "";
      Object.entries(matrixValue || {}).forEach(([thickness, bySize]) => {
        Object.entries(bySize || {}).forEach(([size, qtyStr]) => {
          const qty = parseFloat(qtyStr) || 0;
          if (qty <= 0) return;
          const calc = calculateItemWeight({ itemName, size, thickness, qty });
          rows.push({
            itemName, thickness, size, qty,
            na: calc.na, weightTon: calc.weightTon,
            shade: flatShade, model: "",
          });
        });
      });
    }
  });
  return rows;
}

function setFlatCell(qtyMatrix, itemName, thickness, size, value) {
  const next = { ...qtyMatrix };
  next[itemName] = { ...(next[itemName] || {}) };
  next[itemName][thickness] = { ...(next[itemName][thickness] || {}) };
  next[itemName][thickness][size] = value;
  return next;
}

function setBlockCell(qtyMatrix, itemName, blockId, thickness, size, value) {
  const next = { ...qtyMatrix };
  next[itemName] = { ...(next[itemName] || {}) };
  next[itemName][blockId] = { ...(next[itemName][blockId] || {}) };
  next[itemName][blockId][thickness] = { ...(next[itemName][blockId][thickness] || {}) };
  next[itemName][blockId][thickness][size] = value;
  return next;
}

function sumTotals(sizes, thicknesses, byThickness, itemName) {
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
  const total = rowTotals.reduce(
    (acc, r) => ({ pcs: acc.pcs + r.pcs, na: acc.na + r.na, ton: acc.ton + r.ton }),
    { pcs: 0, na: 0, ton: 0 }
  );
  return { rowTotals, total };
}

// Items hidden from Grid Entry entirely (still fine to leave in the DB/List-entry
// mode — this is a display-only filter for this screen).
const HIDDEN_ITEMS = new Set(["PVC VENEER DOOR"]);
// Item -> thickness combinations hidden from Grid Entry (same reasoning).
const HIDDEN_THICKNESS = new Set(["MEMBRANE DOOR__19MM"]);
// Items pinned to the top of the grid, in this order; everything else keeps
// its normal (alphabetical, from the DB) order after these.
const PINNED_ORDER = ["PLYWOOD"];

function norm(s) {
  return String(s || "").trim().toUpperCase();
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

  const items = useMemo(() => {
    const raw = (master.items || []).filter((n) => !HIDDEN_ITEMS.has(norm(n)));
    const pinnedIndex = (n) => {
      const i = PINNED_ORDER.indexOf(norm(n));
      return i === -1 ? PINNED_ORDER.length : i;
    };
    return [...raw].sort((a, b) => pinnedIndex(a) - pinnedIndex(b));
  }, [master.items]);

  function needsShade(itemName) {
    const u = norm(itemName);
    return u.includes("MEMBRANE") || u.includes("EMD");
  }
  function modelsFor(itemName) {
    return master.modelsByItem[norm(itemName)] || null;
  }

  function needsVariantBlocks(itemName) {
    // Any item that carries a Model and/or a Shade needs the multi-block UI —
    // Membrane Door (Model + Shade), PVC Membrane Door (Shade only), etc. —
    // because one order can need more than one combo of it, each with its
    // own quantities (e.g. RW in one size mix, AT in another).
    return !!modelsFor(itemName) || needsShade(itemName);
  }

  // Each "block" below is its own Model and/or Shade pick with its own qty
  // grid; "+ Add Model"/"+ Add Shade" adds another block for the same item.
  useEffect(() => {
    if (loading) return;
    setVariants((prev) => {
      let changed = false;
      const next = { ...prev };
      items.forEach((itemName) => {
        if (!needsVariantBlocks(itemName)) return;
        const entry = next[itemName];
        if (!entry || !Array.isArray(entry.blocks) || entry.blocks.length === 0) {
          next[itemName] = { blocks: [{ id: newBlockId(), model: "", shade: "" }] };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.join("|")]);

  function updateVariant(itemName, field, value) {
    setVariants((prev) => ({ ...prev, [itemName]: { ...(prev[itemName] || {}), [field]: value } }));
  }

  function updateBlockField(itemName, blockId, field, value) {
    setVariants((prev) => {
      const entry = prev[itemName] || { blocks: [] };
      const blocks = entry.blocks.map((b) => (b.id === blockId ? { ...b, [field]: value } : b));
      return { ...prev, [itemName]: { ...entry, blocks } };
    });
  }

  function addBlock(itemName) {
    setVariants((prev) => {
      const entry = prev[itemName] || { blocks: [] };
      return { ...prev, [itemName]: { ...entry, blocks: [...entry.blocks, { id: newBlockId(), model: "", shade: "" }] } };
    });
  }

  function removeBlock(itemName, blockId) {
    setVariants((prev) => {
      const entry = prev[itemName] || { blocks: [] };
      return { ...prev, [itemName]: { ...entry, blocks: entry.blocks.filter((b) => b.id !== blockId) } };
    });
    setQtyMatrix((prev) => {
      if (!prev[itemName]) return prev;
      const next = { ...prev, [itemName]: { ...prev[itemName] } };
      delete next[itemName][blockId];
      return next;
    });
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
      if (HIDDEN_THICKNESS.has(`${norm(r.item_name)}__${norm(r.thickness)}`)) return;
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
    setQtyMatrix((prev) => setFlatCell(prev, itemName, thickness, size, value));
  }

  function blockCellValue(itemName, blockId, thickness, size) {
    return qtyMatrix?.[itemName]?.[blockId]?.[thickness]?.[size] ?? "";
  }
  function handleBlockCellChange(itemName, blockId, thickness, size, value) {
    setQtyMatrix((prev) => setBlockCell(prev, itemName, blockId, thickness, size, value));
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

  // per-item computed rows/totals (plain items with no Model/Shade blocks only)
  const itemComputed = useMemo(() => {
    const out = {};
    items.forEach((itemName) => {
      if (needsVariantBlocks(itemName)) return; // block items compute their own per-block totals inline below
      const sizes = sizeMap[itemName] || [];
      const thicknesses = thicknessMap[itemName] || [];
      const byThickness = qtyMatrix?.[itemName] || {};
      const { rowTotals, total } = sumTotals(sizes, thicknesses, byThickness, itemName);
      out[itemName] = { sizes, thicknesses, rowTotals, itemTotal: total };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyMatrix, items, sizeMap, thicknessMap]);

  const grandTotal = useMemo(() => {
    let acc = { pcs: 0, na: 0, ton: 0 };
    items.forEach((itemName) => {
      const sizes = sizeMap[itemName] || [];
      const thicknesses = thicknessMap[itemName] || [];
      if (needsVariantBlocks(itemName)) {
        const blocks = (variants[itemName]?.blocks) || [];
        blocks.forEach((b) => {
          const byThickness = qtyMatrix?.[itemName]?.[b.id] || {};
          const { total } = sumTotals(sizes, thicknesses, byThickness, itemName);
          acc = { pcs: acc.pcs + total.pcs, na: acc.na + total.na, ton: acc.ton + total.ton };
        });
      } else {
        const t = itemComputed[itemName]?.itemTotal;
        if (t) acc = { pcs: acc.pcs + t.pcs, na: acc.na + t.na, ton: acc.ton + t.ton };
      }
    });
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemComputed, qtyMatrix, variants, items, sizeMap, thicknessMap]);

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

        .goe-block { border-top: 1px solid #eceef4; }
        .goe-block:first-child { border-top: none; }
        .goe-block-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #fafbfd; flex-wrap: wrap; }
        .goe-block-label { font-size: 10.5px; font-weight: 800; color: #9295a8; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 2px; }
        .goe-select { border: 1px solid #e1e3ec; background: #fff; color: #1c1e26; border-radius: 8px; padding: 6px 9px; font-size: 12px; font-weight: 600; }
        .goe-block-remove { margin-left: auto; border: 1px solid #f3c6c3; background: #fdeceb; color: #c23c33; border-radius: 8px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .goe-block-remove:hover { background: #fbd8d6; }
        .goe-add-model-row { padding: 10px 14px; }
        .goe-add-model-btn { border: 1px dashed #cfd2de; background: #fff; color: #4a4d5c; border-radius: 8px; padding: 7px 12px; font-weight: 700; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 5px; }
        .goe-add-model-btn:hover { background: #f6f7fb; }

        .goe-grand { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
        @media (max-width: 560px) { .goe-grand { grid-template-columns: 1fr; } }
        .goe-grand-box { background: #fff; border: 2px solid #1a8a4c33; border-radius: 12px; padding: 14px; text-align: center; }
        .goe-grand-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9295a8; letter-spacing: 0.06em; }
        .goe-grand-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; color: #1a8a4c; margin-top: 4px; }
      `}</style>

      {items.map((itemName) => {
        const sizes = sizeMap[itemName] || [];
        const thicknesses = thicknessMap[itemName] || [];
        const isAddingSize = addingFor === `${itemName}__size`;
        const isAddingThickness = addingFor === `${itemName}__thickness`;
        const models = modelsFor(itemName);
        const hasModels = !!models;
        const showShade = needsShade(itemName);
        const multiVariant = needsVariantBlocks(itemName);
        const blocks = multiVariant ? (variants[itemName]?.blocks || []) : [];

        function renderGridTable(cellVal, onCellChange) {
          if (sizes.length === 0 || thicknesses.length === 0) {
            return (
              <div className="goe-empty-note">
                No {sizes.length === 0 ? "sizes" : "thicknesses"} set up for {itemName} yet — use "Add Size" / "Add Thickness" above.
              </div>
            );
          }
          const byThickness = {};
          thicknesses.forEach((t) => { byThickness[t] = {}; sizes.forEach((s) => { byThickness[t][s] = cellVal(t, s); }); });
          const { rowTotals, total } = sumTotals(sizes, thicknesses, byThickness, itemName);
          return (
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
                              value={cellVal(thickness, size)}
                              onChange={(e) => onCellChange(thickness, size, e.target.value)}
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
                    <td className="goe-num">{total.pcs}</td>
                    <td className="goe-num">{total.na.toFixed(3)}</td>
                    <td className="goe-num">{total.ton.toFixed(3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div className="goe-section" key={itemName}>
            <div className="goe-section-head">
              <span className="goe-section-title">{itemName}</span>
              <div className="goe-section-actions">
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

            {multiVariant ? (
              <>
                {blocks.map((block) => (
                  <div className="goe-block" key={block.id}>
                    <div className="goe-block-head">
                      {hasModels && (
                        <>
                          <span className="goe-block-label">Model</span>
                          <select
                            className="goe-select"
                            value={block.model || ""}
                            onChange={(e) => updateBlockField(itemName, block.id, "model", e.target.value)}
                          >
                            <option value="">- Select Model -</option>
                            {models.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </>
                      )}
                      {showShade && (
                        <>
                          <span className="goe-block-label">Shade</span>
                          <select
                            className="goe-select"
                            value={block.shade || ""}
                            onChange={(e) => updateBlockField(itemName, block.id, "shade", e.target.value)}
                          >
                            <option value="">- Shade -</option>
                            <option value="RW">RW</option>
                            <option value="AT">AT</option>
                          </select>
                        </>
                      )}
                      {blocks.length > 1 && (
                        <button className="goe-block-remove" title={`Remove this ${hasModels ? "model" : "shade"}`} onClick={() => removeBlock(itemName, block.id)}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {renderGridTable(
                      (t, s) => blockCellValue(itemName, block.id, t, s),
                      (t, s, v) => handleBlockCellChange(itemName, block.id, t, s, v)
                    )}
                  </div>
                ))}
                <div className="goe-add-model-row">
                  <button className="goe-add-model-btn" onClick={() => addBlock(itemName)}>
                    <Plus size={13} /> {hasModels ? "Add Model" : "Add Shade"} — enter another {hasModels ? "model/shade" : "shade"} with its own quantities in this same order
                  </button>
                </div>
              </>
            ) : (
              renderGridTable(
                (t, s) => cellValue(itemName, t, s),
                (t, s, v) => handleCellChange(itemName, t, s, v)
              )
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
