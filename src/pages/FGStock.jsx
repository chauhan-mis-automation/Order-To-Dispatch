import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Boxes, Trash2, Pencil, Check, X, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";

export default function FGStock() {
  const [rows, setRows] = useState([]);
  const [fgItems, setFgItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fgIdInput, setFgIdInput] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [stockRes, fgRes] = await Promise.all([
      supabase.from("fg_stock").select("*").order("item_name"),
      supabase.from("fg_items").select("*").order("fg_id"),
    ]);
    if (stockRes.error) setError(stockRes.error.message);
    else setRows(stockRes.data || []);
    setFgItems(fgRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addOrUpdateStock(e) {
    e.preventDefault();
    if (!fgIdInput || qty === "") return;
    const fgItem = fgItems.find((f) => `${f.fg_id} — ${f.fg_name}` === fgIdInput);
    if (!fgItem) { setError("Select a valid FG item from the catalog."); return; }
    setSaving(true);
    setError("");
    try {
      const { data: existing } = await supabase.from("fg_stock").select("*").eq("fg_id", fgItem.fg_id).maybeSingle();
      if (existing) {
        const { error: err } = await supabase
          .from("fg_stock")
          .update({ qty_available: Number(existing.qty_available) + parseFloat(qty), updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("fg_stock").insert({
          fg_id: fgItem.fg_id, item_name: fgItem.item_name, brand: fgItem.brand || "",
          size: fgItem.size, thickness: fgItem.thickness, qty_available: parseFloat(qty),
        });
        if (err) throw err;
      }
      setFgIdInput(""); setQty("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id) {
    if (!confirm("Remove this stock entry?")) return;
    const { error: err } = await supabase.from("fg_stock").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditQty(String(row.qty_available));
  }

  async function saveEdit(id) {
    if (editQty === "") return;
    const { error: err } = await supabase
      .from("fg_stock")
      .update({ qty_available: parseFloat(editQty) || 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setEditingId(null);
      load();
    }
  }

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      `${r.fg_id || ""} ${r.item_name} ${r.brand || ""} ${r.size} ${r.thickness}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="fg-root">
      <style>{`
        .fg-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .fg-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
        .fg-field { flex: 2; min-width: 240px; }
        .fg-field-qty { flex: 1; min-width: 120px; }
        .fg-qty-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; }
        .fg-label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .fg-add-btn { border: none; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .fg-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .fg-hint { font-size: 11.5px; color: #9295a8; margin-bottom: 14px; }
        .fg-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; }
        .fg-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; color: #9295a8; }
        .fg-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .fg-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .fg-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .fg-table thead th { background: #14161f; color: #fff; text-align: left; padding: 13px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .fg-table tbody td { padding: 13px 18px; border-bottom: 1px solid #f0f1f6; }
        .fg-table tbody tr:last-child td { border-bottom: none; }

        @media (max-width: 800px) {
          .fg-table, .fg-table thead, .fg-table tbody, .fg-table tr, .fg-table td { display: block; width: 100%; }
          .fg-table thead { display: none; }
          .fg-table tbody tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          .fg-table tbody td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f5f6fa; text-align: right; }
          .fg-table tbody td:last-child { border-bottom: none; }
          .fg-table tbody td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
        }
        .fg-code { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 12.5px; }
        .fg-qty-badge { font-family: 'IBM Plex Mono', monospace; font-weight: 700; }
        .fg-low { color: #c23c33; }
        .fg-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #d64545; display: flex; align-items: center; justify-content: center; }
        .fg-del-btn:hover { background: #fdeceb; }
        .fg-edit-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: flex; align-items: center; justify-content: center; }
        .fg-edit-btn:hover { background: #f6f7fb; }
        .fg-save-btn { border: 1px solid #bfe3cf; background: #eafaf1; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #1a8a4c; display: flex; align-items: center; justify-content: center; }
        .fg-save-btn:hover { background: #d7f3e3; }
        .fg-edit-input { width: 90px; box-sizing: border-box; border: 1px solid #f5a623; border-radius: 8px; padding: 7px 9px; font-size: 13px; outline: none; box-shadow: 0 0 0 3px rgba(245,166,35,0.15); }
        .fg-empty, .fg-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .fg-spin { animation: fg-spin-anim 0.9s linear infinite; }
        @keyframes fg-spin-anim { to { transform: rotate(360deg); } }
        .fg-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <form className="fg-form" onSubmit={addOrUpdateStock}>
        <div className="fg-field">
          <label className="fg-label">FG Item</label>
          <ComboBox
            value={fgIdInput}
            onChange={setFgIdInput}
            options={fgItems.map((f) => `${f.fg_id} — ${f.fg_name}`)}
            placeholder="Select from FG catalog"
          />
        </div>
        <div className="fg-field-qty">
          <label className="fg-label">Add Qty</label>
          <input type="number" className="fg-qty-input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
        <button className="fg-add-btn" type="submit" disabled={saving}><Plus size={15} /> {saving ? "Saving..." : "Add Stock"}</button>
      </form>
      <div className="fg-hint">No matching FG item? Add it first under Admin → FG Items.</div>

      {error && <div className="fg-error">{error}</div>}

      <div className="fg-toolbar">
        <div className="fg-search">
          <Search size={14} />
          <input placeholder="Search by FG ID, item, brand..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="fg-card">
        {loading ? (
          <div className="fg-loading"><Loader2 size={20} className="fg-spin" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="fg-empty"><Boxes size={22} style={{ marginBottom: 8 }} /><div>No FG stock entries found.</div></div>
        ) : (
          <table className="fg-table">
            <thead><tr><th>FG ID</th><th>Item</th><th>Brand</th><th>Size</th><th>Thickness</th><th>Qty Available</th><th></th></tr></thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td data-label="FG ID">{r.fg_id ? <span className="fg-code">{r.fg_id}</span> : "-"}</td>
                  <td data-label="Item">{r.item_name}</td>
                  <td data-label="Brand">{r.brand || "-"}</td>
                  <td data-label="Size">{r.size}</td>
                  <td data-label="Thickness">{r.thickness}</td>
                  <td data-label="Qty Available">
                    {editingId === r.id ? (
                      <input
                        type="number"
                        className="fg-edit-input"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className={`fg-qty-badge ${Number(r.qty_available) <= 5 ? "fg-low" : ""}`}>{r.qty_available}</span>
                    )}
                  </td>
                  <td data-label="Action" style={{ textAlign: "right" }}>
                    {editingId === r.id ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="fg-save-btn" onClick={() => saveEdit(r.id)}><Check size={14} /></button>
                        <button className="fg-del-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="fg-edit-btn" onClick={() => startEdit(r)}><Pencil size={14} /></button>
                        <button className="fg-del-btn" onClick={() => removeRow(r.id)}><Trash2 size={14} /></button>
                      </div>
                    )}
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
