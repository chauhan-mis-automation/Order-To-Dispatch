import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Loader2, Boxes, Pencil, Trash2, Check, X, Search, AlertTriangle, Layers, PackageMinus, UploadCloud,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import ComboBox from "../components/ui/ComboBox";
import BulkIssueUpload from "../components/ui/BulkIssueUpload";

const RM_CATEGORIES = ["Raw Material", "Consumable", "Packing Material", "Utility"];
const ALL_CATEGORIES = [...RM_CATEGORIES, "Finished Goods"];
const RM_CATEGORY_PREFIX = { "Raw Material": "RM", "Consumable": "CON", "Packing Material": "PM", "Utility": "UTL" };
const ITEM_ABBR = {
  "PLYWOOD": "PLY", "BLOCKBOARD": "BLK", "FLUSH DOOR": "FLD", "MEMBRANE DOOR": "MDR",
  "PVC MEMBRANE DOOR": "PVM", "PVC VENEER DOOR": "PVV", "SUPER PVC": "SPV",
};
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function abbreviateItem(itemName) {
  const upper = (itemName || "").trim().toUpperCase();
  if (ITEM_ABBR[upper]) return ITEM_ABBR[upper];
  return upper.replace(/[^A-Z]/g, "").slice(0, 3) || "ITM";
}

async function nextRmItemCode(category) {
  const prefix = RM_CATEGORY_PREFIX[category];
  const { data } = await supabase.from("raw_materials").select("item_code").like("item_code", `${prefix}-%`);
  let maxSeq = 0;
  (data || []).forEach((r) => {
    const seq = parseInt(String(r.item_code).split("-")[1], 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

async function nextFgId(itemName) {
  const abbr = abbreviateItem(itemName);
  const { data } = await supabase.from("fg_items").select("fg_id").like("fg_id", `FG-${abbr}-%`);
  let maxSeq = 0;
  (data || []).forEach((r) => {
    const seq = parseInt(String(r.fg_id).split("-")[2], 10);
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `FG-${abbr}-${String(maxSeq + 1).padStart(3, "0")}`;
}

const emptyForm = {
  type: "Raw Material", // "Raw Material" | "Finished Good" (special)
  name: "", category: "Raw Material", unit: "",
  itemName: "", brand: "", size: "", thickness: "", fgName: "",
  qty: "", min: "", max: "", location: "", remarks: "",
};

export default function IMS() {
  const master = useMasterData();
  const [rmRows, setRmRows] = useState([]);
  const [fgRows, setFgRows] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueCategory, setIssueCategory] = useState("Raw Material");
  const [issueMaterialName, setIssueMaterialName] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [issueLog, setIssueLog] = useState([]);
  const [showBulkIssue, setShowBulkIssue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [rmRes, fgRes, poItemsRes, dispatchRes, issueRes] = await Promise.all([
      supabase.from("rm_stock").select("*, raw_materials(id, name, unit, item_code, category)").order("id"),
      supabase.from("fg_stock").select("*").order("item_name"),
      supabase.from("purchase_order_items").select("*").gt("qty_received", 0),
      supabase.from("dispatch_logs").select("*"),
      supabase.from("material_issues").select("*, raw_materials(name, item_code, category, unit)").order("issue_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (rmRes.error) setError(rmRes.error.message);
    else setRmRows(rmRes.data || []);
    if (fgRes.error) setError(fgRes.error.message);
    else setFgRows(fgRes.data || []);
    setPoItems(poItemsRes.data || []);
    setDispatchLogs(dispatchRes.data || []);
    setIssueLog(issueRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function receivedLast30d(materialId) {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return poItems
      .filter((it) => it.material_id === materialId && it.last_received_at && new Date(it.last_received_at).getTime() >= cutoff)
      .reduce((sum, it) => sum + (Number(it.qty_received) || 0), 0);
  }
  function dispatchedLast30d(row) {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return dispatchLogs
      .filter((d) => {
        if (d.item_name !== row.item_name || (d.brand || "") !== (row.brand || "") || d.size !== row.size || d.thickness !== row.thickness) return false;
        if (!d.created_at) return true;
        return new Date(d.created_at).getTime() >= cutoff;
      })
      .reduce((sum, d) => sum + (Number(d.dispatched_qty) || 0), 0);
  }

  // How much of this raw material has been ISSUED (consumed) so far in the current calendar month
  function monthlyConsumption(materialId) {
    const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    return issueLog
      .filter((i) => i.material_id === materialId && i.issue_date && i.issue_date.startsWith(thisMonth))
      .reduce((sum, i) => sum + (Number(i.qty_issued) || 0), 0);
  }

  // ---- unify RM + FG rows into one shape for a single table ----
  const unifiedRows = useMemo(() => {
    const rm = rmRows.map((r) => ({
      key: `rm_${r.id}`, kind: "RM", rowId: r.id,
      code: r.raw_materials?.item_code || "-",
      name: r.raw_materials?.name || "Unknown",
      category: r.raw_materials?.category || "-",
      specs: "-",
      unit: r.raw_materials?.unit || "-",
      qty: Number(r.qty_available) || 0,
      min: Number(r.min_stock) || 0,
      max: Number(r.max_stock) || 0,
      location: r.location || "",
      remarks: r.remarks || "",
      activityLabel: "Received (30d)",
      activityValue: receivedLast30d(r.material_id),
      monthlyConsumption: monthlyConsumption(r.material_id),
    }));
    const fg = fgRows.map((r) => ({
      key: `fg_${r.id}`, kind: "FG", rowId: r.id,
      code: r.fg_id || "-",
      name: r.item_name,
      category: "Finished Goods",
      specs: `${r.brand || "-"}, ${r.size}, ${r.thickness}`,
      unit: "pcs",
      qty: Number(r.qty_available) || 0,
      min: Number(r.min_stock) || 0,
      max: Number(r.max_stock) || 0,
      location: r.location || "",
      remarks: r.remarks || "",
      activityLabel: "Dispatched (30d)",
      activityValue: dispatchedLast30d(r),
      monthlyConsumption: null,
    }));
    return [...rm, ...fg];
  }, [rmRows, fgRows, poItems, dispatchLogs, issueLog]);

  const filteredRows = useMemo(() => {
    return unifiedRows.filter((row) => {
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${row.code} ${row.name} ${row.specs}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedRows, categoryFilter, search]);

  // ---- Add Item (creates master + stock together, one step) ----
  useEffect(() => {
    if (form.type === "Finished Good" && form.itemName && form.thickness && form.size && !form.fgName) {
      setForm((f) => ({ ...f, fgName: `${f.itemName} ${f.thickness} ${f.size} Sheet` }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.itemName, form.thickness, form.size, form.type]);

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submitAddItem(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (form.type === "Raw Material") {
        if (!form.name.trim() || !form.unit.trim()) throw new Error("Material name and UOM are required.");
        const item_code = await nextRmItemCode(form.category);
        const { data: matRow, error: matErr } = await supabase
          .from("raw_materials")
          .insert({ item_code, name: form.name.trim(), unit: form.unit.trim(), category: form.category })
          .select()
          .single();
        if (matErr) throw matErr;

        const { error: stockErr } = await supabase.from("rm_stock").insert({
          material_id: matRow.id,
          qty_available: parseFloat(form.qty) || 0,
          min_stock: parseFloat(form.min) || 0,
          max_stock: parseFloat(form.max) || 0,
          location: form.location.trim(),
          remarks: form.remarks.trim(),
        });
        if (stockErr) throw stockErr;
      } else {
        if (!form.itemName || !form.size || !form.thickness || !form.fgName.trim()) {
          throw new Error("Item, Size, Thickness and FG Name are required.");
        }
        const fg_id = await nextFgId(form.itemName);
        const { error: fgErr } = await supabase.from("fg_items").insert({
          fg_id, fg_name: form.fgName.trim(), item_name: form.itemName,
          brand: form.brand || "", size: form.size, thickness: form.thickness,
        });
        if (fgErr) throw fgErr;

        const { error: stockErr } = await supabase.from("fg_stock").insert({
          fg_id, item_name: form.itemName, brand: form.brand || "", size: form.size, thickness: form.thickness,
          qty_available: parseFloat(form.qty) || 0,
          min_stock: parseFloat(form.min) || 0,
          max_stock: parseFloat(form.max) || 0,
          location: form.location.trim(),
          remarks: form.remarks.trim(),
        });
        if (stockErr) throw stockErr;
      }
      setForm(emptyForm);
      setShowAddForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingKey(row.key);
    setEditForm({
      qty: String(row.qty), min: String(row.min), max: String(row.max),
      location: row.location, remarks: row.remarks,
    });
  }

  async function saveEdit(row) {
    const table = row.kind === "RM" ? "rm_stock" : "fg_stock";
    const { error: err } = await supabase
      .from(table)
      .update({
        qty_available: parseFloat(editForm.qty) || 0,
        min_stock: parseFloat(editForm.min) || 0,
        max_stock: parseFloat(editForm.max) || 0,
        location: editForm.location || "",
        remarks: editForm.remarks || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.rowId);
    if (err) setError(err.message);
    else {
      setEditingKey(null);
      load();
    }
  }

  async function removeRow(row) {
    if (!confirm(`Remove this stock entry for "${row.name}"?`)) return;
    const table = row.kind === "RM" ? "rm_stock" : "fg_stock";
    const { error: err } = await supabase.from(table).delete().eq("id", row.rowId);
    if (err) setError(err.message);
    else load();
  }

  // ---- Issue Material for Production (manual — deducts straight from RM Stock) ----
  const issueMaterialOptions = useMemo(
    () => rmRows.filter((r) => r.raw_materials?.category === issueCategory).map((r) => r.raw_materials?.name).filter(Boolean),
    [rmRows, issueCategory]
  );
  const issueMaterialRow = rmRows.find((r) => r.raw_materials?.category === issueCategory && r.raw_materials?.name === issueMaterialName);

  async function submitIssue(e) {
    e.preventDefault();
    setIssueError("");
    if (!issueMaterialName || !issueQty || parseFloat(issueQty) <= 0) {
      setIssueError("Select a material and enter a valid quantity.");
      return;
    }
    if (!issueMaterialRow) {
      setIssueError("This material has no stock entry yet.");
      return;
    }
    const qtyNum = parseFloat(issueQty) || 0;
    const available = Number(issueMaterialRow.qty_available) || 0;
    if (qtyNum > available) {
      setIssueError(`Only ${available} ${issueMaterialRow.raw_materials?.unit || ""} available — can't issue ${qtyNum}.`);
      return;
    }
    setIssuing(true);
    try {
      const { error: issueErr } = await supabase.from("material_issues").insert({
        material_id: issueMaterialRow.material_id,
        qty_issued: qtyNum,
        qty_before: available,
        qty_after: available - qtyNum,
        issued_to: issuedTo.trim(),
        remarks: issueRemarks.trim(),
      });
      if (issueErr) throw issueErr;

      const { error: stockErr } = await supabase
        .from("rm_stock")
        .update({ qty_available: available - qtyNum, updated_at: new Date().toISOString() })
        .eq("id", issueMaterialRow.id);
      if (stockErr) throw stockErr;

      setIssueMaterialName(""); setIssueQty(""); setIssuedTo(""); setIssueRemarks("");
      load();
    } catch (err) {
      setIssueError(err.message);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="ims-root">
      <style>{`
        .ims-root { font-family: 'Inter', sans-serif; color: #1c1e26; width: 100%; }

        .ims-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .ims-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; flex: 1; min-width: 200px; color: #9295a8; }
        .ims-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .ims-cat-select { min-width: 190px; }
        .ims-add-btn { border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; }

        .ims-form-card { background: #fff; border: 1.5px solid #f5a623; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .ims-type-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
        .ims-type-btn { flex: 1; border: 1.5px solid #e1e3ec; background: #fff; color: #5b5f72; padding: 10px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .ims-type-btn.active { border-color: #f5a623; background: #fff4de; color: #b5620f; }
        .ims-form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
        @media (max-width: 900px) { .ims-form-grid { grid-template-columns: repeat(2, 1fr); } }
        .ims-form-field label { display: block; font-size: 11px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .ims-form-field input, .ims-form-field select { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 9px 10px; font-size: 13px; }
        .ims-form-actions { display: flex; gap: 10px; margin-top: 14px; }
        .ims-submit-btn { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .ims-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ims-cancel-btn { border: 1px solid #e1e3ec; background: #fff; color: #5b5f72; padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }

        .ims-issue-btn { border: none; background: linear-gradient(135deg, #c23c33, #a12e26); color: #fff; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .ims-bulk-issue-btn { border: 1px solid #f3c6c3; background: #fdeceb; color: #c23c33; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .ims-issue-card { background: #fff; border: 1.5px solid #f3c6c3; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .ims-issue-hint { background: #fdeceb; color: #c23c33; border-radius: 9px; padding: 9px 12px; font-size: 12px; font-weight: 600; margin-top: 4px; }
        .ims-issue-avail { font-size: 12px; color: #5b5f72; margin-top: 4px; }
        .ims-issue-avail b { color: #1a8a4c; }

        .ims-log-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14.5px; margin: 22px 0 12px 0; display: flex; align-items: center; gap: 8px; }
        .ims-log-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: auto; }
        .ims-log-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 800px; }
        .ims-log-table thead th { background: #14161f; color: #fff; text-align: left; padding: 11px 14px; font-size: 10.5px; text-transform: uppercase; white-space: nowrap; }
        .ims-log-table tbody td { padding: 10px 14px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .ims-log-table tbody tr:last-child td { border-bottom: none; }
        .ims-log-empty { text-align: center; color: #b7b9c6; padding: 24px; }

        .ims-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: auto; }
        .ims-table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 1300px; }
        .ims-table thead th { background: #14161f; color: #fff; text-align: left; padding: 12px 14px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .ims-table tbody td { padding: 11px 14px; border-bottom: 1px solid #f0f1f6; white-space: nowrap; }
        .ims-table tbody tr:last-child td { border-bottom: none; }
        .ims-table tbody tr.ims-row-low { background: #fdeceb; }

        .ims-kind-badge { font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
        .ims-kind-rm { background: #e8f1ff; color: #1d5fc7; }
        .ims-kind-fg { background: #f3e8ff; color: #8b3fd6; }
        .ims-code { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 12px; }
        .ims-cat-badge { background: #f1f2f6; color: #4a4d5c; font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; }
        .ims-specs { font-size: 11.5px; color: #9295a8; }
        .ims-qty { font-family: 'IBM Plex Mono', monospace; font-weight: 700; }
        .ims-unit-badge { background: #e8f1ff; color: #1d5fc7; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; margin-left: 4px; }
        .ims-activity { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1a8a4c; }
        .ims-status-badge { font-size: 10.5px; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; }
        .ims-status-ok { background: #eafaf1; color: #1a8a4c; }
        .ims-status-low { background: #fdeceb; color: #c23c33; }
        .ims-loc { font-size: 12px; color: #4a4d5c; }
        .ims-remark { font-size: 11.5px; color: #9295a8; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }

        .ims-edit-input { width: 74px; box-sizing: border-box; border: 1px solid #f5a623; border-radius: 8px; padding: 6px 8px; font-size: 12px; }
        .ims-edit-input.wide { width: 110px; }
        .ims-icon-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: flex; align-items: center; justify-content: center; }
        .ims-icon-btn:hover { background: #f6f7fb; }
        .ims-icon-btn.danger { color: #d64545; }
        .ims-icon-btn.danger:hover { background: #fdeceb; }
        .ims-icon-btn.save { color: #1a8a4c; background: #eafaf1; border-color: #bfe3cf; }

        .ims-empty, .ims-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .ims-spin { animation: ims-spin-anim 0.9s linear infinite; }
        @keyframes ims-spin-anim { to { transform: rotate(360deg); } }
        .ims-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <div className="ims-toolbar">
        <div className="ims-search">
          <Search size={14} />
          <input placeholder="Search by code, name, specs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="ims-cat-select">
          <ComboBox value={categoryFilter} onChange={setCategoryFilter} options={ALL_CATEGORIES} placeholder="All Categories" />
        </div>
        <button className="ims-bulk-issue-btn" onClick={() => setShowBulkIssue(true)}>
          <UploadCloud size={15} /> Bulk Issue Upload
        </button>
        <button className="ims-issue-btn" onClick={() => { setShowIssueForm((s) => !s); setShowAddForm(false); }}>
          <PackageMinus size={15} /> Issue Material
        </button>
        <button className="ims-add-btn" onClick={() => { setShowAddForm((s) => !s); setShowIssueForm(false); }}>
          <Plus size={15} /> Add Item
        </button>
      </div>

      {error && <div className="ims-error">{error}</div>}

      {showIssueForm && (
        <form className="ims-issue-card" onSubmit={submitIssue}>
          <div className="ims-form-grid">
            <div className="ims-form-field">
              <label>Category</label>
              <select value={issueCategory} onChange={(e) => { setIssueCategory(e.target.value); setIssueMaterialName(""); }}>
                {RM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="ims-form-field">
              <label>Material</label>
              <ComboBox value={issueMaterialName} onChange={setIssueMaterialName} options={issueMaterialOptions} placeholder="Select material" />
              {issueMaterialRow && (
                <div className="ims-issue-avail">Available: <b>{issueMaterialRow.qty_available} {issueMaterialRow.raw_materials?.unit}</b></div>
              )}
            </div>
            <div className="ims-form-field"><label>Qty to Issue</label><input type="number" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} placeholder="0" /></div>
            <div className="ims-form-field"><label>Issued To</label><input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="e.g. Production Floor" /></div>
            <div className="ims-form-field" style={{ gridColumn: "span 2" }}><label>Remarks</label><input value={issueRemarks} onChange={(e) => setIssueRemarks(e.target.value)} placeholder="Optional" /></div>
          </div>

          {issueError && <div className="ims-issue-hint">{issueError}</div>}

          <div className="ims-form-actions">
            <button className="ims-submit-btn" type="submit" disabled={issuing} style={{ background: "linear-gradient(135deg, #c23c33, #a12e26)" }}>
              <PackageMinus size={15} /> {issuing ? "Issuing..." : "Issue Material → Deduct from Stock"}
            </button>
            <button type="button" className="ims-cancel-btn" onClick={() => setShowIssueForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {showAddForm && (
        <form className="ims-form-card" onSubmit={submitAddItem}>
          <div className="ims-type-toggle">
            <button type="button" className={`ims-type-btn ${form.type === "Raw Material" ? "active" : ""}`} onClick={() => setForm({ ...emptyForm, type: "Raw Material" })}>
              Raw Material / Consumable / Packing / Utility
            </button>
            <button type="button" className={`ims-type-btn ${form.type === "Finished Good" ? "active" : ""}`} onClick={() => setForm({ ...emptyForm, type: "Finished Good" })}>
              Finished Good
            </button>
          </div>

          {form.type === "Raw Material" ? (
            <div className="ims-form-grid">
              <div className="ims-form-field"><label>Material Name</label><input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="e.g. Core Veneer" /></div>
              <div className="ims-form-field">
                <label>Category</label>
                <select value={form.category} onChange={(e) => updateForm("category", e.target.value)}>
                  {RM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="ims-form-field"><label>UOM (Unit)</label><input value={form.unit} onChange={(e) => updateForm("unit", e.target.value)} placeholder="e.g. Kg, Ltr, Sheet" /></div>
              <div className="ims-form-field"><label>Opening Qty</label><input type="number" value={form.qty} onChange={(e) => updateForm("qty", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Min Stock</label><input type="number" value={form.min} onChange={(e) => updateForm("min", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Max Stock</label><input type="number" value={form.max} onChange={(e) => updateForm("max", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Location</label><input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="e.g. RM Store" /></div>
              <div className="ims-form-field"><label>Remarks</label><input value={form.remarks} onChange={(e) => updateForm("remarks", e.target.value)} placeholder="Optional" /></div>
            </div>
          ) : (
            <div className="ims-form-grid">
              <div className="ims-form-field"><label>Item</label><ComboBox value={form.itemName} onChange={(v) => updateForm("itemName", v)} options={master.items} placeholder="Select item" /></div>
              <div className="ims-form-field"><label>Brand</label><ComboBox value={form.brand} onChange={(v) => updateForm("brand", v)} options={master.brands} placeholder="Optional" /></div>
              <div className="ims-form-field"><label>Size</label><ComboBox value={form.size} onChange={(v) => updateForm("size", v)} options={master.sizesFt} placeholder="Select size" /></div>
              <div className="ims-form-field"><label>Thickness</label><ComboBox value={form.thickness} onChange={(v) => updateForm("thickness", v)} options={master.thickness} placeholder="Select thickness" /></div>
              <div className="ims-form-field" style={{ gridColumn: "span 2" }}><label>FG Name</label><input value={form.fgName} onChange={(e) => updateForm("fgName", e.target.value)} placeholder="Auto-suggested, editable" /></div>
              <div className="ims-form-field"><label>Opening Qty</label><input type="number" value={form.qty} onChange={(e) => updateForm("qty", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Min Stock</label><input type="number" value={form.min} onChange={(e) => updateForm("min", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Max Stock</label><input type="number" value={form.max} onChange={(e) => updateForm("max", e.target.value)} placeholder="0" /></div>
              <div className="ims-form-field"><label>Location</label><input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="e.g. FG Store" /></div>
              <div className="ims-form-field" style={{ gridColumn: "span 2" }}><label>Remarks</label><input value={form.remarks} onChange={(e) => updateForm("remarks", e.target.value)} placeholder="Optional" /></div>
            </div>
          )}

          <div className="ims-form-actions">
            <button className="ims-submit-btn" type="submit" disabled={saving}>
              <Check size={15} /> {saving ? "Adding..." : "Add Item"}
            </button>
            <button type="button" className="ims-cancel-btn" onClick={() => { setShowAddForm(false); setForm(emptyForm); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="ims-card">
        {loading ? (
          <div className="ims-loading"><Loader2 size={20} className="ims-spin" /></div>
        ) : filteredRows.length === 0 ? (
          <div className="ims-empty"><Boxes size={22} /><div>No inventory items found.</div></div>
        ) : (
          <table className="ims-table">
            <thead>
              <tr>
                <th>Type</th><th>Code</th><th>Name</th><th>Category / Specs</th><th>UOM</th>
                <th>Closing Stock</th><th>30d Activity</th><th>Monthly Consumption</th><th>Min</th><th>Max</th><th>Status</th>
                <th>Location</th><th>Remarks</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isEditing = editingKey === row.key;
                const isLow = row.min > 0 && row.qty < row.min;
                return (
                  <tr key={row.key} className={isLow && !isEditing ? "ims-row-low" : ""}>
                    <td><span className={`ims-kind-badge ${row.kind === "RM" ? "ims-kind-rm" : "ims-kind-fg"}`}>{row.kind}</span></td>
                    <td><span className="ims-code">{row.code}</span></td>
                    <td>{row.name}</td>
                    <td>
                      {row.kind === "RM" ? <span className="ims-cat-badge">{row.category}</span> : <span className="ims-specs">{row.specs}</span>}
                    </td>
                    <td>{row.unit}</td>
                    <td>
                      {isEditing ? (
                        <input type="number" className="ims-edit-input" value={editForm.qty} onChange={(e) => setEditForm((f) => ({ ...f, qty: e.target.value }))} autoFocus />
                      ) : (
                        <span className="ims-qty">{row.qty}</span>
                      )}
                    </td>
                    <td><span className="ims-activity">{row.activityValue}</span> <span style={{ fontSize: 10, color: "#9295a8" }}>{row.activityLabel.includes("Received") ? "recv" : "disp"}</span></td>
                    <td>
                      {row.monthlyConsumption === null ? (
                        <span style={{ color: "#c3c5d1" }}>—</span>
                      ) : (
                        <span className="ims-activity" style={{ color: "#c23c33" }}>{row.monthlyConsumption}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" className="ims-edit-input" value={editForm.min} onChange={(e) => setEditForm((f) => ({ ...f, min: e.target.value }))} />
                      ) : (row.min || "-")}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" className="ims-edit-input" value={editForm.max} onChange={(e) => setEditForm((f) => ({ ...f, max: e.target.value }))} />
                      ) : (row.max || "-")}
                    </td>
                    <td>
                      {row.min > 0 ? (
                        <span className={`ims-status-badge ${isLow ? "ims-status-low" : "ims-status-ok"}`}>
                          {isLow && <AlertTriangle size={11} />} {isLow ? "LOW STOCK" : "OK"}
                        </span>
                      ) : (<span className="ims-cat-badge">Set Min</span>)}
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="ims-edit-input wide" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} placeholder="Location" />
                      ) : (<span className="ims-loc">{row.location || "-"}</span>)}
                    </td>
                    <td>
                      {isEditing ? (
                        <input className="ims-edit-input wide" value={editForm.remarks} onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="—" />
                      ) : (<span className="ims-remark" title={row.remarks}>{row.remarks || "—"}</span>)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="ims-icon-btn save" onClick={() => saveEdit(row)}><Check size={13} /></button>
                          <button className="ims-icon-btn" onClick={() => setEditingKey(null)}><X size={13} /></button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="ims-icon-btn" onClick={() => startEdit(row)}><Pencil size={13} /></button>
                          <button className="ims-icon-btn danger" onClick={() => removeRow(row)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="ims-log-title"><PackageMinus size={16} /> Material Issue Log</div>
      <div className="ims-log-card">
        {issueLog.length === 0 ? (
          <div className="ims-log-empty">No material issued yet.</div>
        ) : (
          <table className="ims-log-table">
            <thead>
              <tr><th>Date</th><th>Item Code</th><th>Material</th><th>Category</th><th>Opening Qty</th><th>Issued Qty</th><th>Closing Qty</th><th>Issued To</th><th>Remarks</th></tr>
            </thead>
            <tbody>
              {issueLog.map((i) => (
                <tr key={i.id}>
                  <td>{fmtDate(i.issue_date)}</td>
                  <td><span className="ims-code">{i.raw_materials?.item_code || "-"}</span></td>
                  <td>{i.raw_materials?.name || "Unknown"}</td>
                  <td><span className="ims-cat-badge">{i.raw_materials?.category || "-"}</span></td>
                  <td>{i.qty_before} {i.raw_materials?.unit}</td>
                  <td><span className="ims-qty" style={{ color: "#c23c33" }}>-{i.qty_issued} {i.raw_materials?.unit}</span></td>
                  <td><span className="ims-qty" style={{ color: "#1a8a4c" }}>{i.qty_after} {i.raw_materials?.unit}</span></td>
                  <td>{i.issued_to || "-"}</td>
                  <td>{i.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBulkIssue && (
        <BulkIssueUpload
          rmRows={rmRows}
          onClose={() => setShowBulkIssue(false)}
          onImported={load}
        />
      )}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}
