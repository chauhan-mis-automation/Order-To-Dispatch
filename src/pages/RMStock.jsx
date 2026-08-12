import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, FlaskConical, Pencil, Trash2, Check, X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";

const CATEGORIES = ["Raw Material", "Consumable", "Packing Material", "Utility"];

export default function RMStock() {
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [bomRows, setBomRows] = useState([]);
  const [fgItems, setFgItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [materialName, setMaterialName] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [rmRes, matRes, bomRes, fgRes] = await Promise.all([
      supabase.from("rm_stock").select("*, raw_materials(id, name, unit, item_code, category)").order("id"),
      supabase.from("raw_materials").select("*").order("name"),
      supabase.from("item_bom").select("*"),
      supabase.from("fg_items").select("*"),
    ]);
    if (rmRes.error) setError(rmRes.error.message);
    else setRows(rmRes.data || []);
    setMaterials(matRes.data || []);
    setBomRows(bomRes.data || []);
    setFgItems(fgRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // For a given material_id, find every FG that uses it (via item_bom -> fg_items match on item_name+thickness)
  function usedInFor(materialId) {
    const recipes = bomRows.filter((b) => b.material_id === materialId);
    const results = [];
    recipes.forEach((r) => {
      const matches = fgItems.filter((f) => f.item_name === r.item_name && f.thickness === r.thickness);
      matches.forEach((fg) => {
        results.push({
          fgId: fg.fg_id,
          fgName: fg.fg_name,
          qty: r.qty_per_unit,
          basis: r.basis,
        });
      });
    });
    return results;
  }

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter && r.raw_materials?.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.raw_materials?.name || ""} ${r.raw_materials?.item_code || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, search]);

  async function addStock(e) {
    e.preventDefault();
    if (!materialName || qty === "") return;
    const material = materials.find((m) => m.name === materialName);
    if (!material) { setError("Unknown material."); return; }
    setSaving(true);
    setError("");
    try {
      const { data: existing } = await supabase.from("rm_stock").select("*").eq("material_id", material.id).maybeSingle();
      if (existing) {
        const { error: err } = await supabase
          .from("rm_stock")
          .update({ qty_available: Number(existing.qty_available) + parseFloat(qty), updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("rm_stock").insert({ material_id: material.id, qty_available: parseFloat(qty) });
        if (err) throw err;
      }
      setMaterialName(""); setQty("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditQty(String(row.qty_available));
  }

  async function saveEdit(id) {
    if (editQty === "") return;
    const { error: err } = await supabase
      .from("rm_stock")
      .update({ qty_available: parseFloat(editQty) || 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setEditingId(null);
      load();
    }
  }

  async function removeRow(id) {
    if (!confirm("Remove this material's stock entry? (The material itself stays in Raw Materials.)")) return;
    const { error: err } = await supabase.from("rm_stock").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  return (
    <div className="rms-root">
      <style>{`
        .rms-root { font-family: 'Inter', sans-serif; color: #1c1e26; width: 100%; }
        .rms-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
        .rms-field { flex: 1; min-width: 180px; }
        .rms-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .rms-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; }
        .rms-add-btn { border: none; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .rms-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .rms-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .rms-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; flex: 1; min-width: 200px; color: #9295a8; }
        .rms-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .rms-cat-select { min-width: 190px; }

        .rms-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .rms-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .rms-table thead th { background: #14161f; color: #fff; text-align: left; padding: 13px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .rms-table tbody td { padding: 13px 18px; border-bottom: 1px solid #f0f1f6; }
        .rms-table tbody tr:last-child td { border-bottom: none; }
        .rms-qty { font-family: 'IBM Plex Mono', monospace; font-weight: 700; }
        .rms-low { color: #c23c33; }
        .rms-unit-badge { background: #e8f1ff; color: #1d5fc7; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
        .rms-code { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 12.5px; }
        .rms-cat-badge { background: #f1f2f6; color: #4a4d5c; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
        .rms-empty, .rms-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .rms-spin { animation: rms-spin-anim 0.9s linear infinite; }
        @keyframes rms-spin-anim { to { transform: rotate(360deg); } }
        .rms-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
        .rms-edit-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: flex; align-items: center; justify-content: center; }
        .rms-edit-btn:hover { background: #f6f7fb; }
        .rms-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #d64545; display: flex; align-items: center; justify-content: center; }
        .rms-del-btn:hover { background: #fdeceb; }
        .rms-save-btn { border: 1px solid #bfe3cf; background: #eafaf1; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #1a8a4c; display: flex; align-items: center; justify-content: center; }
        .rms-save-btn:hover { background: #d7f3e3; }
        .rms-expand-btn {
          border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7;
          padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 700;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: background .15s ease, transform .15s ease;
        }
        .rms-expand-btn:hover { background: #d9e9ff; transform: translateY(-1px); }
        .rms-edit-input { width: 100px; box-sizing: border-box; border: 1px solid #f5a623; border-radius: 8px; padding: 7px 9px; font-size: 13px; outline: none; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .rms-used-row td { background: #fbfbfd; padding: 14px 18px 18px 18px !important; }
        .rms-used-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9295a8; margin-bottom: 10px; }
        .rms-used-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #eceef4; border-radius: 10px; overflow: hidden; font-size: 12.5px; }
        .rms-used-table thead th { background: #f1f2f6; text-align: left; padding: 8px 12px; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; }
        .rms-used-table tbody td { padding: 9px 12px; border-top: 1px solid #f0f1f6; }
        .rms-used-fgid { font-family: 'IBM Plex Mono', monospace; color: #1d5fc7; font-weight: 700; }
        .rms-used-qtyval { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1a8a4c; }
        .rms-used-empty { font-size: 12.5px; color: #b7b9c6; }

        @media (max-width: 860px) {
          .rms-table, .rms-table thead, .rms-table tbody, .rms-table tr, .rms-table td { display: block; width: 100%; }
          .rms-table thead { display: none; }
          .rms-table tbody tr:not(.rms-used-row) {
            border: 1px solid #eceef4; border-radius: 12px; margin: 0 0 10px 0; padding: 4px 0;
            box-shadow: 0 2px 6px rgba(20,22,35,0.04);
          }
          .rms-table tbody tr:not(.rms-used-row) td {
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
            padding: 10px 14px; border-bottom: 1px solid #f5f6fa; text-align: right;
          }
          .rms-table tbody tr:not(.rms-used-row) td:last-child { border-bottom: none; }
          .rms-table tbody tr:not(.rms-used-row) td::before {
            content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px;
            text-transform: uppercase; letter-spacing: 0.04em; text-align: left;
          }
          .rms-used-row td { padding: 12px !important; }
          .rms-used-table { min-width: 0; }
          .rms-used-table, .rms-used-table thead, .rms-used-table tbody, .rms-used-table tr, .rms-used-table td { display: block; width: 100%; }
          .rms-used-table thead { display: none; }
          .rms-used-table tbody tr { border-bottom: 1px solid #f0f1f6; padding: 8px 0; }
          .rms-used-table tbody tr:last-child { border-bottom: none; }
          .rms-used-table tbody td { display: flex; justify-content: space-between; padding: 3px 0; border-top: none; }
          .rms-used-table tbody td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10px; text-transform: uppercase; }
        }
      `}</style>

      <form className="rms-form" onSubmit={addStock}>
        <div className="rms-field">
          <label>Material</label>
          <ComboBox value={materialName} onChange={setMaterialName} options={materials.map((m) => m.name)} placeholder="Select material" />
        </div>
        <div className="rms-field">
          <label>Add Qty</label>
          <input type="number" className="rms-input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
        <button className="rms-add-btn" type="submit" disabled={saving}><Plus size={15} /> {saving ? "Saving..." : "Add Stock"}</button>
      </form>

      <div className="rms-toolbar">
        <div className="rms-search">
          <Search size={14} />
          <input placeholder="Search by material or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="rms-cat-select">
          <ComboBox value={categoryFilter} onChange={setCategoryFilter} options={CATEGORIES} placeholder="All Categories" />
        </div>
      </div>

      {error && <div className="rms-error">{error}</div>}

      <div className="rms-card">
        {loading ? (
          <div className="rms-loading"><Loader2 size={20} className="rms-spin" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="rms-empty"><FlaskConical size={22} style={{ marginBottom: 8 }} /><div>No raw material stock recorded yet.</div></div>
        ) : (
          <table className="rms-table">
            <thead><tr><th>Item Code</th><th>Material</th><th>Category</th><th>Available Qty</th><th>Used In</th><th></th></tr></thead>
            <tbody>
              {filteredRows.map((r) => {
                const usedIn = usedInFor(r.material_id);
                const isExpanded = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td data-label="Item Code"><span className="rms-code">{r.raw_materials?.item_code || "-"}</span></td>
                      <td data-label="Material">{r.raw_materials?.name || "Unknown"}</td>
                      <td data-label="Category"><span className="rms-cat-badge">{r.raw_materials?.category || "-"}</span></td>
                      <td data-label="Available Qty">
                        {editingId === r.id ? (
                          <input
                            type="number"
                            className="rms-edit-input"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className={`rms-qty ${Number(r.qty_available) <= 10 ? "rms-low" : ""}`}>{r.qty_available}</span>{" "}
                            <span className="rms-unit-badge">{r.raw_materials?.unit}</span>
                          </>
                        )}
                      </td>
                      <td data-label="Used In">
                        <button className="rms-expand-btn" onClick={() => setExpandedId(isExpanded ? null : r.id)} title="Show FGs using this material">
                          {usedIn.length} FG{usedIn.length !== 1 ? "s" : ""} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </td>
                      <td data-label="Action" style={{ textAlign: "right" }}>
                        {editingId === r.id ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className="rms-save-btn" onClick={() => saveEdit(r.id)}><Check size={14} /></button>
                            <button className="rms-del-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className="rms-edit-btn" onClick={() => startEdit(r)}><Pencil size={14} /></button>
                            <button className="rms-del-btn" onClick={() => removeRow(r.id)}><Trash2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="rms-used-row">
                        <td colSpan={6}>
                          <div className="rms-used-title">Used in these Finished Goods</div>
                          {usedIn.length === 0 ? (
                            <div className="rms-used-empty">Not used in any BOM recipe yet.</div>
                          ) : (
                            <table className="rms-used-table">
                              <thead>
                                <tr><th>FG ID</th><th>FG Name</th><th>Qty Needed</th><th>Basis</th></tr>
                              </thead>
                              <tbody>
                                {usedIn.map((u, i) => (
                                  <tr key={i}>
                                    <td data-label="FG ID"><span className="rms-used-fgid">{u.fgId}</span></td>
                                    <td data-label="FG Name">{u.fgName}</td>
                                    <td data-label="Qty Needed"><span className="rms-used-qtyval">{u.qty} {r.raw_materials?.unit}</span></td>
                                    <td data-label="Basis">{u.basis === "per_sqmtr" ? "per Sq.Mtr" : "per Piece"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
