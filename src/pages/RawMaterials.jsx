import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Package, Trash2, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";

const CATEGORY_PREFIX = {
  "Raw Material": "RM",
  "Consumable": "CON",
  "Packing Material": "PM",
  "Utility": "UTL",
};
const CATEGORY_BADGE = {
  "Raw Material": { bg: "#e8f1ff", color: "#1d5fc7" },
  "Consumable": { bg: "#fff4de", color: "#b5620f" },
  "Packing Material": { bg: "#f3e8ff", color: "#8b3fd6" },
  "Utility": { bg: "#eafaf1", color: "#1a8a4c" },
};

async function nextItemCode(category) {
  const prefix = CATEGORY_PREFIX[category];
  const { data } = await supabase
    .from("raw_materials")
    .select("item_code")
    .like("item_code", `${prefix}-%`);
  let maxSeq = 0;
  (data || []).forEach((r) => {
    const seq = parseInt(String(r.item_code).split("-")[1], 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export default function RawMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("Raw Material");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("raw_materials").select("*").order("item_code");
    if (err) setError(err.message);
    else setMaterials(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addMaterial(e) {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);
    setError("");
    try {
      const item_code = await nextItemCode(category);
      const { error: err } = await supabase.from("raw_materials").insert({
        item_code, name: name.trim(), unit: unit.trim(), category,
      });
      if (err) throw err;
      setName(""); setUnit("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeMaterial(id) {
    if (!confirm("Remove this material? BOM recipes using it will also lose this entry.")) return;
    const { error: err } = await supabase.from("raw_materials").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      if (categoryFilter && m.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${m.name} ${m.item_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [materials, categoryFilter, search]);

  return (
    <div className="rm-root">
      <style>{`
        .rm-root { font-family: 'Inter', sans-serif; color: #1c1e26; max-width: 900px; }
        .rm-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
        .rm-field { flex: 1; min-width: 160px; }
        .rm-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .rm-field input, .rm-field select { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; outline: none; background: #fff; }
        .rm-field input:focus, .rm-field select:focus { border-color: #f5a623; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .rm-add-btn { border: none; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .rm-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .rm-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .rm-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; flex: 1; min-width: 200px; color: #9295a8; }
        .rm-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .rm-cat-select { min-width: 190px; }
        .rm-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .rm-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .rm-table thead th { background: #14161f; color: #fff; text-align: left; padding: 13px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .rm-table tbody td { padding: 13px 18px; border-bottom: 1px solid #f0f1f6; }
        .rm-table tbody tr:last-child td { border-bottom: none; }

        @media (max-width: 700px) {
          .rm-table, .rm-table thead, .rm-table tbody, .rm-table tr, .rm-table td { display: block; width: 100%; }
          .rm-table thead { display: none; }
          .rm-table tbody tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          .rm-table tbody td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f5f6fa; text-align: right; }
          .rm-table tbody td:last-child { border-bottom: none; }
          .rm-table tbody td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
        }
        .rm-code { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 12.5px; }
        .rm-unit-badge { background: #f1f2f6; color: #4a4d5c; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
        .rm-cat-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
        .rm-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #d64545; display: flex; align-items: center; justify-content: center; }
        .rm-del-btn:hover { background: #fdeceb; }
        .rm-empty, .rm-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .rm-spin { animation: rm-spin-anim 0.9s linear infinite; }
        @keyframes rm-spin-anim { to { transform: rotate(360deg); } }
        .rm-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <form className="rm-form" onSubmit={addMaterial}>
        <div className="rm-field">
          <label>Material Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Core Veneer" />
        </div>
        <div className="rm-field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(CATEGORY_PREFIX).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="rm-field">
          <label>UOM (Unit)</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Nos, Kg, Ltr, Mtr" />
        </div>
        <button className="rm-add-btn" type="submit" disabled={saving}>
          <Plus size={15} /> {saving ? "Adding..." : "Add Material"}
        </button>
      </form>

      {error && <div className="rm-error">{error}</div>}

      <div className="rm-toolbar">
        <div className="rm-search">
          <Search size={14} />
          <input placeholder="Search by name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="rm-cat-select">
          <ComboBox value={categoryFilter} onChange={setCategoryFilter} options={Object.keys(CATEGORY_PREFIX)} placeholder="All Categories" />
        </div>
      </div>

      <div className="rm-card">
        {loading ? (
          <div className="rm-loading"><Loader2 size={20} className="rm-spin" /></div>
        ) : filteredMaterials.length === 0 ? (
          <div className="rm-empty"><Package size={22} style={{ marginBottom: 8 }} /><div>No raw materials found.</div></div>
        ) : (
          <table className="rm-table">
            <thead><tr><th>Item Code</th><th>Material</th><th>Category</th><th>UOM</th><th></th></tr></thead>
            <tbody>
              {filteredMaterials.map((m) => {
                const badge = CATEGORY_BADGE[m.category] || { bg: "#f1f2f6", color: "#4a4d5c" };
                return (
                  <tr key={m.id}>
                    <td data-label="Item Code"><span className="rm-code">{m.item_code}</span></td>
                    <td data-label="Material">{m.name}</td>
                    <td data-label="Category"><span className="rm-cat-badge" style={{ background: badge.bg, color: badge.color }}>{m.category}</span></td>
                    <td data-label="UOM"><span className="rm-unit-badge">{m.unit}</span></td>
                    <td data-label="Action" style={{ textAlign: "right" }}>
                      <button className="rm-del-btn" onClick={() => removeMaterial(m.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
