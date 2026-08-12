import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, FlaskConical, ClipboardList, Search, Table2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";

export default function ItemBOM() {
  const master = useMasterData();

  const [materials, setMaterials] = useState([]);
  const [bomRows, setBomRows] = useState([]); // all rows, all item+thickness combos
  const [fgItems, setFgItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selItem, setSelItem] = useState("");
  const [selThickness, setSelThickness] = useState("");

  const [newMaterial, setNewMaterial] = useState("");
  const [newBasis, setNewBasis] = useState("per_sqmtr");
  const [newQty, setNewQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [tableSearch, setTableSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [matRes, bomRes, fgRes] = await Promise.all([
      supabase.from("raw_materials").select("*").order("name"),
      supabase.from("item_bom").select("*, raw_materials(name, unit, item_code, category)").order("item_name"),
      supabase.from("fg_items").select("*"),
    ]);
    if (matRes.error) setError(matRes.error.message);
    else setMaterials(matRes.data || []);
    if (bomRes.error) setError(bomRes.error.message);
    else setBomRows(bomRes.data || []);
    setFgItems(fgRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentRecipe = useMemo(() => {
    if (!selItem || !selThickness) return [];
    return bomRows.filter((r) => r.item_name === selItem && r.thickness === selThickness);
  }, [bomRows, selItem, selThickness]);

  const groupedRecipes = useMemo(() => {
    const map = {};
    bomRows.forEach((r) => {
      const key = `${r.item_name}__${r.thickness}`;
      if (!map[key]) map[key] = { item: r.item_name, thickness: r.thickness, count: 0 };
      map[key].count += 1;
    });
    return Object.values(map);
  }, [bomRows]);

  async function nextBomId() {
    const { data } = await supabase.from("item_bom").select("bom_id").not("bom_id", "is", null);
    let maxSeq = 0;
    (data || []).forEach((r) => {
      const seq = parseInt(String(r.bom_id).split("-")[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    });
    return `BOM-${String(maxSeq + 1).padStart(3, "0")}`;
  }

  async function addMaterialToRecipe() {
    if (!selItem || !selThickness || !newMaterial || !newQty) {
      setError("Select item, thickness, material, and quantity.");
      return;
    }
    const material = materials.find((m) => m.name === newMaterial);
    if (!material) {
      setError("Unknown material — add it in Raw Materials first.");
      return;
    }
    setSaving(true);
    setError("");
    // reuse this recipe's existing BOM ID if it already has rows, otherwise mint a new one
    const groupBomId = currentRecipe[0]?.bom_id || (await nextBomId());
    const { error: err } = await supabase.from("item_bom").insert({
      item_name: selItem,
      thickness: selThickness,
      material_id: material.id,
      basis: newBasis,
      qty_per_unit: parseFloat(newQty) || 0,
      bom_id: groupBomId,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setNewMaterial("");
      setNewQty("");
      load();
    }
  }

  async function removeRow(id) {
    const { error: err } = await supabase.from("item_bom").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  // Flattened sheet-style view: one row per (BOM material x matching FG catalog entry),
  // exactly mirroring the reference spreadsheet's columns.
  const flatSheetRows = useMemo(() => {
    const out = [];
    bomRows.forEach((b) => {
      const matches = fgItems.filter((f) => f.item_name === b.item_name && f.thickness === b.thickness);
      const fgList = matches.length > 0 ? matches : [{ fg_id: "—", fg_name: `${b.item_name} ${b.thickness}` }];
      fgList.forEach((fg) => {
        out.push({
          key: `${b.id}_${fg.fg_id}`,
          bomId: b.bom_id || "—",
          fgId: fg.fg_id,
          fgName: fg.fg_name,
          itemCode: b.raw_materials?.item_code || "-",
          materialName: b.raw_materials?.name || "Unknown",
          category: b.raw_materials?.category || "-",
          uom: b.raw_materials?.unit || "-",
          qty: b.qty_per_unit,
          basis: b.basis,
        });
      });
    });
    if (!tableSearch.trim()) return out;
    const q = tableSearch.trim().toLowerCase();
    return out.filter((r) =>
      `${r.bomId} ${r.fgId} ${r.fgName} ${r.itemCode} ${r.materialName} ${r.category}`.toLowerCase().includes(q)
    );
  }, [bomRows, fgItems, tableSearch]);

  return (
    <div className="bom-root">
      <style>{`
        .bom-root { font-family: 'Inter', sans-serif; color: #1c1e26; max-width: 1000px; }
        .bom-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
        @media (max-width: 900px) { .bom-grid { grid-template-columns: 1fr; } }
        .bom-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; }
        .bom-card h6 { margin: 0 0 14px 0; font-family: 'Space Grotesk', sans-serif; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .bom-selector-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
        .bom-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }

        .bom-recipe-list { margin-bottom: 16px; }
        .bom-recipe-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid #eceef4; border-radius: 10px; margin-bottom: 8px; background: #fbfbfd; }
        .bom-recipe-name { font-size: 13px; font-weight: 700; }
        .bom-recipe-meta { font-size: 11.5px; color: #9295a8; font-family: 'IBM Plex Mono', monospace; }
        .bom-basis-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin-left: 8px; }
        .bom-basis-sqmtr { background: #e8f1ff; color: #1d5fc7; }
        .bom-basis-piece { background: #fdf3e4; color: #b5620f; }
        .bom-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #d64545; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .bom-del-btn:hover { background: #fdeceb; }
        .bom-id-badge { display: inline-block; background: #14161f; color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 5px 12px; border-radius: 999px; margin-bottom: 12px; }
        .bom-recipe-code { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #b5620f; font-weight: 700; margin-right: 8px; }

        .bom-add-row { display: grid; grid-template-columns: 1.5fr 1fr 0.8fr auto; gap: 8px; align-items: end; padding-top: 14px; border-top: 1px solid #f0f1f6; }
        @media (max-width: 700px) { .bom-add-row { grid-template-columns: 1fr 1fr; } }
        .bom-add-row label { display: block; font-size: 11px; font-weight: 700; color: #5b5f72; margin-bottom: 5px; }
        .bom-select, .bom-qty-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 9px 10px; font-size: 12.5px; }
        .bom-add-btn { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; border-radius: 9px; padding: 9px 14px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .bom-empty { text-align: center; color: #b7b9c6; padding: 20px 0; font-size: 12.5px; }

        .bom-all-list { max-height: 480px; overflow-y: auto; }
        .bom-all-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 10px; cursor: pointer; margin-bottom: 6px; }
        .bom-all-item:hover { background: #f6f7fb; }
        .bom-all-item-active { background: #fdf3e4; }
        .bom-all-name { font-size: 12.5px; font-weight: 700; }
        .bom-all-count { font-size: 10.5px; font-weight: 700; background: #f1f2f6; color: #4a4d5c; padding: 3px 9px; border-radius: 20px; }

        .bom-sheet-section { margin-top: 20px; background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; max-width: 1000px; }
        .bom-sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px; }
        .bom-sheet-header h6 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .bom-sheet-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 8px 14px; min-width: 240px; color: #9295a8; }
        .bom-sheet-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .bom-sheet-wrap { border: 1px solid #eceef4; border-radius: 12px; overflow: auto; max-height: 60vh; }
        .bom-sheet-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 900px; }
        .bom-sheet-table thead th { position: sticky; top: 0; background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .bom-sheet-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .bom-sheet-table tbody tr:hover { background: #fbfbfd; }
        .bom-sheet-bomid { font-family: 'IBM Plex Mono', monospace; color: #4a4d5c; font-size: 11.5px; }
        .bom-sheet-fgid { font-family: 'IBM Plex Mono', monospace; color: #1d5fc7; font-weight: 700; font-size: 11.5px; }
        .bom-sheet-code { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-weight: 700; font-size: 11.5px; }
        .bom-sheet-cat { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; background: #f1f2f6; color: #4a4d5c; }
        .bom-sheet-qty { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1a8a4c; }
        .bom-sheet-basis { font-size: 10px; color: #9295a8; margin-left: 4px; }
        .bom-sheet-count { font-size: 12px; color: #9295a8; font-weight: 600; }
      `}</style>

      {error && <div className="bom-error">{error}</div>}

      <div className="bom-grid">
        <div className="bom-card">
          <h6><FlaskConical size={16} /> Recipe Editor</h6>

          <div className="bom-selector-row">
            <ComboBox label="Item" value={selItem} onChange={setSelItem} options={master.items} placeholder="Select item" />
            <ComboBox label="Thickness" value={selThickness} onChange={setSelThickness} options={master.thickness} placeholder="Select thickness" />
          </div>

          {loading ? (
            <div className="bom-empty"><Loader2 size={18} className="rm-spin" /></div>
          ) : !selItem || !selThickness ? (
            <div className="bom-empty">Select an Item and Thickness to view/edit its recipe.</div>
          ) : (
            <>
              {currentRecipe[0]?.bom_id && (
                <div className="bom-id-badge">{currentRecipe[0].bom_id}</div>
              )}
              <div className="bom-recipe-list">
                {currentRecipe.length === 0 ? (
                  <div className="bom-empty">No materials defined yet for {selItem} — {selThickness}.</div>
                ) : (
                  currentRecipe.map((row) => (
                    <div className="bom-recipe-row" key={row.id}>
                      <div>
                        <span className="bom-recipe-code">{row.raw_materials?.item_code}</span>
                        <span className="bom-recipe-name">{row.raw_materials?.name || "Unknown"}</span>
                        <span className={`bom-basis-badge ${row.basis === "per_sqmtr" ? "bom-basis-sqmtr" : "bom-basis-piece"}`}>
                          {row.basis === "per_sqmtr" ? "per Sq.Mtr" : "per Piece"}
                        </span>
                        <div className="bom-recipe-meta">{row.qty_per_unit} {row.raw_materials?.unit} · {row.raw_materials?.category}</div>
                      </div>
                      <button className="bom-del-btn" onClick={() => removeRow(row.id)}><Trash2 size={13} /></button>
                    </div>
                  ))
                )}
              </div>

              <div className="bom-add-row">
                <div>
                  <label>Material</label>
                  <ComboBox value={newMaterial} onChange={setNewMaterial} options={materials.map((m) => m.name)} placeholder="Select material" />
                </div>
                <div>
                  <label>Basis</label>
                  <select className="bom-select" value={newBasis} onChange={(e) => setNewBasis(e.target.value)}>
                    <option value="per_sqmtr">per Sq.Mtr</option>
                    <option value="per_piece">per Piece</option>
                  </select>
                </div>
                <div>
                  <label>Qty</label>
                  <input type="number" className="bom-qty-input" value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="0.00" />
                </div>
                <button className="bom-add-btn" onClick={addMaterialToRecipe} disabled={saving}>
                  <Plus size={14} /> {saving ? "Adding..." : "Add"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bom-card">
          <h6><ClipboardList size={16} /> All Recipes ({groupedRecipes.length})</h6>
          <div className="bom-all-list">
            {groupedRecipes.length === 0 ? (
              <div className="bom-empty">No recipes defined yet.</div>
            ) : (
              groupedRecipes.map((g) => {
                const active = g.item === selItem && g.thickness === selThickness;
                return (
                  <div
                    key={`${g.item}__${g.thickness}`}
                    className={`bom-all-item ${active ? "bom-all-item-active" : ""}`}
                    onClick={() => { setSelItem(g.item); setSelThickness(g.thickness); }}
                  >
                    <span className="bom-all-name">{g.item} — {g.thickness}</span>
                    <span className="bom-all-count">{g.count} materials</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="bom-sheet-section">
        <div className="bom-sheet-header">
          <h6><Table2 size={16} /> Full BOM Sheet</h6>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="bom-sheet-count">{flatSheetRows.length} row(s)</span>
            <div className="bom-sheet-search">
              <Search size={14} />
              <input placeholder="Search BOM ID, FG, material..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bom-empty"><Loader2 size={18} className="rm-spin" /></div>
        ) : flatSheetRows.length === 0 ? (
          <div className="bom-empty">No BOM data yet — build a recipe above to see it here.</div>
        ) : (
          <div className="bom-sheet-wrap">
            <table className="bom-sheet-table">
              <thead>
                <tr>
                  <th>BOM ID</th><th>FG ID</th><th>FG Name</th><th>Item Code</th>
                  <th>Material Name</th><th>Category</th><th>UOM</th><th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {flatSheetRows.map((r) => (
                  <tr key={r.key}>
                    <td><span className="bom-sheet-bomid">{r.bomId}</span></td>
                    <td><span className="bom-sheet-fgid">{r.fgId}</span></td>
                    <td>{r.fgName}</td>
                    <td><span className="bom-sheet-code">{r.itemCode}</span></td>
                    <td>{r.materialName}</td>
                    <td><span className="bom-sheet-cat">{r.category}</span></td>
                    <td>{r.uom}</td>
                    <td>
                      <span className="bom-sheet-qty">{r.qty}</span>
                      <span className="bom-sheet-basis">{r.basis === "per_sqmtr" ? "/ Sq.Mtr" : "/ Piece"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
