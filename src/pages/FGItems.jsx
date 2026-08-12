import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Tag, Trash2, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";

const ITEM_ABBR = {
  "PLYWOOD": "PLY",
  "BLOCKBOARD": "BLK",
  "FLUSH DOOR": "FLD",
  "MEMBRANE DOOR": "MDR",
  "PVC MEMBRANE DOOR": "PVM",
  "PVC VENEER DOOR": "PVV",
  "SUPER PVC": "SPV",
};

function abbreviate(itemName) {
  const upper = (itemName || "").trim().toUpperCase();
  if (ITEM_ABBR[upper]) return ITEM_ABBR[upper];
  return upper.replace(/[^A-Z]/g, "").slice(0, 3) || "ITM";
}

async function nextFgId(itemName) {
  const abbr = abbreviate(itemName);
  const { data } = await supabase.from("fg_items").select("fg_id").like("fg_id", `FG-${abbr}-%`);
  let maxSeq = 0;
  (data || []).forEach((r) => {
    const seq = parseInt(String(r.fg_id).split("-")[2], 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `FG-${abbr}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export default function FGItems() {
  const master = useMasterData();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [thickness, setThickness] = useState("");
  const [fgName, setFgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("fg_items").select("*").order("fg_id");
    if (err) setError(err.message);
    else setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (itemName && thickness && size && !fgName) {
      setFgName(`${itemName} ${thickness} ${size} Sheet`);
    }
  }, [itemName, thickness, size]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFgItem(e) {
    e.preventDefault();
    if (!itemName || !size || !thickness || !fgName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const fg_id = await nextFgId(itemName);
      const { error: err } = await supabase.from("fg_items").insert({
        fg_id, fg_name: fgName.trim(), item_name: itemName, brand: brand || "", size, thickness,
      });
      if (err) throw err;
      setItemName(""); setBrand(""); setSize(""); setThickness(""); setFgName("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id) {
    if (!confirm("Remove this FG catalog entry?")) return;
    const { error: err } = await supabase.from("fg_items").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      `${r.fg_id} ${r.fg_name} ${r.item_name} ${r.brand || ""}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="fgi-root">
      <style>{`
        .fgi-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .fgi-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: grid; grid-template-columns: repeat(4, 1fr) 1.4fr auto; gap: 10px; align-items: end; }
        @media (max-width: 1050px) { .fgi-form { grid-template-columns: repeat(2, 1fr); } }
        .fgi-label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .fgi-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; }
        .fgi-add-btn { border: none; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .fgi-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .fgi-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; }
        .fgi-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; color: #9295a8; }
        .fgi-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .fgi-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .fgi-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .fgi-table thead th { background: #14161f; color: #fff; text-align: left; padding: 13px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .fgi-table tbody td { padding: 13px 18px; border-bottom: 1px solid #f0f1f6; }
        .fgi-table tbody tr:last-child td { border-bottom: none; }

        @media (max-width: 780px) {
          .fgi-table, .fgi-table thead, .fgi-table tbody, .fgi-table tr, .fgi-table td { display: block; width: 100%; }
          .fgi-table thead { display: none; }
          .fgi-table tbody tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          .fgi-table tbody td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f5f6fa; text-align: right; }
          .fgi-table tbody td:last-child { border-bottom: none; }
          .fgi-table tbody td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
        }
        .fgi-code { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 12.5px; }
        .fgi-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #d64545; display: flex; align-items: center; justify-content: center; }
        .fgi-del-btn:hover { background: #fdeceb; }
        .fgi-empty, .fgi-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .fgi-spin { animation: fgi-spin-anim 0.9s linear infinite; }
        @keyframes fgi-spin-anim { to { transform: rotate(360deg); } }
        .fgi-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <form className="fgi-form" onSubmit={addFgItem}>
        <div><label className="fgi-label">Item</label><ComboBox value={itemName} onChange={setItemName} options={master.items} placeholder="Item" /></div>
        <div><label className="fgi-label">Brand</label><ComboBox value={brand} onChange={setBrand} options={master.brands} placeholder="Brand (optional)" /></div>
        <div><label className="fgi-label">Size</label><ComboBox value={size} onChange={setSize} options={master.sizesFt} placeholder="Size" /></div>
        <div><label className="fgi-label">Thickness</label><ComboBox value={thickness} onChange={setThickness} options={master.thickness} placeholder="Thk" /></div>
        <div><label className="fgi-label">FG Name</label><input className="fgi-input" value={fgName} onChange={(e) => setFgName(e.target.value)} placeholder="Auto-suggested, editable" /></div>
        <button className="fgi-add-btn" type="submit" disabled={saving}><Plus size={15} /> {saving ? "Adding..." : "Add FG Item"}</button>
      </form>

      {error && <div className="fgi-error">{error}</div>}

      <div className="fgi-toolbar">
        <div className="fgi-search">
          <Search size={14} />
          <input placeholder="Search by FG ID, name, item..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="fgi-card">
        {loading ? (
          <div className="fgi-loading"><Loader2 size={20} className="fgi-spin" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="fgi-empty"><Tag size={22} style={{ marginBottom: 8 }} /><div>No FG catalog entries found.</div></div>
        ) : (
          <table className="fgi-table">
            <thead><tr><th>FG ID</th><th>FG Name</th><th>Item</th><th>Brand</th><th>Size</th><th>Thickness</th><th></th></tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td data-label="FG ID"><span className="fgi-code">{r.fg_id}</span></td>
                  <td data-label="FG Name">{r.fg_name}</td>
                  <td data-label="Item">{r.item_name}</td>
                  <td data-label="Brand">{r.brand || "-"}</td>
                  <td data-label="Size">{r.size}</td>
                  <td data-label="Thickness">{r.thickness}</td>
                  <td data-label="Action" style={{ textAlign: "right" }}>
                    <button className="fgi-del-btn" onClick={() => removeRow(r.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
