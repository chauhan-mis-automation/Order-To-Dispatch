import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ShoppingCart, PackageCheck, Search, Trash2, Printer, ChevronDown, ChevronUp, UploadCloud, Pencil } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";
import ReceiveGoodsModal from "../components/ui/ReceiveGoodsModal";
import BulkPurchaseUpload from "../components/ui/BulkPurchaseUpload";
import { printPurchaseOrder } from "../utils/printPurchaseOrder";

const RM_CATEGORIES = ["Raw Material", "Consumable", "Packing Material", "Utility"];
const RM_CATEGORY_PREFIX = { "Raw Material": "RM", "Consumable": "CON", "Packing Material": "PM", "Utility": "UTL" };

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

function emptyLineItem() {
  return { key: `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, materialName: "", qty: "", rate: "" };
}
function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB");
}
const STATUS_STYLES = {
  Ordered: { bg: "#fff4de", color: "#b5620f" },
  "Partially Received": { bg: "#e8f1ff", color: "#1d5fc7" },
  Received: { bg: "#eafaf1", color: "#1a8a4c" },
};

export default function PurchaseOrders({ currentUser }) {
  const [materials, setMaterials] = useState([]);
  const [pos, setPos] = useState([]);
  const [poItemsMap, setPoItemsMap] = useState({}); // po_id -> items[]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // create/edit-PO form state
  const [poNumberInput, setPoNumberInput] = useState("");
  const [editingPo, setEditingPo] = useState(null); // full PO object when editing, else null
  const [poDate, setPoDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [saving, setSaving] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null); // File object pending upload
  const [existingFile, setExistingFile] = useState(null); // { url, name } already on the PO being edited
  const [uploadingFile, setUploadingFile] = useState(false);

  const [uomList, setUomList] = useState([]);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatCategory, setNewMatCategory] = useState("Raw Material");
  const [newMatUom, setNewMatUom] = useState("");
  const [newUomInput, setNewUomInput] = useState("");
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addMaterialError, setAddMaterialError] = useState("");

  const [expandedId, setExpandedId] = useState(null);
  const [receivingPo, setReceivingPo] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [matRes, poRes, uomRes] = await Promise.all([
      supabase.from("raw_materials").select("*").order("name"),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("uom_master").select("name").order("sequence"),
    ]);
    setMaterials(matRes.data || []);
    setUomList((uomRes.data || []).map((u) => u.name));
    if (poRes.error) setError(poRes.error.message);
    else setPos(poRes.data || []);

    const poIds = (poRes.data || []).map((p) => p.id);
    if (poIds.length > 0) {
      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("*, material:raw_materials(id, name, unit, item_code)")
        .in("po_id", poIds);
      const map = {};
      (items || []).forEach((it) => {
        if (!map[it.po_id]) map[it.po_id] = [];
        map[it.po_id].push(it);
      });
      setPoItemsMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateLine(key, field, value) {
    setLineItems((prev) => prev.map((li) => (li.key === key ? { ...li, [field]: value } : li)));
  }
  function addLine() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }
  function removeLine(key) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((li) => li.key !== key) : prev));
  }

  const lineTotal = (li) => (parseFloat(li.qty) || 0) * (parseFloat(li.rate) || 0);
  const grandTotal = lineItems.reduce((sum, li) => sum + lineTotal(li), 0);

  function materialUnit(name) {
    return materials.find((m) => m.name === name)?.unit || "";
  }

  async function addUom() {
    if (!newUomInput.trim()) return;
    try {
      const { error: err } = await supabase.from("uom_master").insert({ name: newUomInput.trim(), sequence: uomList.length + 1 });
      if (err && err.code !== "23505") throw err;
      setNewMatUom(newUomInput.trim());
      setNewUomInput("");
      load();
    } catch (err) {
      setAddMaterialError(err.message);
    }
  }

  async function addNewMaterial(e) {
    e.preventDefault();
    if (!newMatName.trim() || !newMatUom) {
      setAddMaterialError("Material name and unit are required.");
      return;
    }
    setAddingMaterial(true);
    setAddMaterialError("");
    try {
      const item_code = await nextRmItemCode(newMatCategory);
      const { data: matRow, error: matErr } = await supabase
        .from("raw_materials")
        .insert({ item_code, name: newMatName.trim(), unit: newMatUom, category: newMatCategory })
        .select()
        .single();
      if (matErr) throw matErr;

      await supabase.from("rm_stock").insert({ material_id: matRow.id, qty_available: 0 });

      await load();
      // auto-select the new material on the first empty line item
      setLineItems((prev) => {
        const emptyIdx = prev.findIndex((li) => !li.materialName);
        if (emptyIdx >= 0) {
          const next = [...prev];
          next[emptyIdx] = { ...next[emptyIdx], materialName: newMatName.trim() };
          return next;
        }
        return [...prev, { ...emptyLineItem(), materialName: newMatName.trim() }];
      });
      setNewMatName(""); setNewMatCategory("Raw Material"); setNewMatUom("");
      setShowAddMaterial(false);
    } catch (err) {
      setAddMaterialError(err.message);
    } finally {
      setAddingMaterial(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
  }

  async function uploadAttachedFile() {
    if (!attachedFile) return existingFile;
    setUploadingFile(true);
    try {
      const ext = attachedFile.name.split(".").pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("po-documents").upload(path, attachedFile);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("po-documents").getPublicUrl(path);
      return { url: urlData.publicUrl, name: attachedFile.name };
    } finally {
      setUploadingFile(false);
    }
  }

  async function submitPO(e) {
    e.preventDefault();
    const validLines = lineItems.filter((li) => li.materialName && parseFloat(li.qty) > 0);
    if (!poNumberInput.trim() || !vendorName.trim() || validLines.length === 0) {
      setError("PO Number, Vendor name and at least one material line are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const uploaded = attachedFile ? await uploadAttachedFile() : existingFile;

      const headerPayload = {
        po_number: poNumberInput.trim(),
        po_date: poDate || null,
        vendor_name: vendorName.trim(),
        vendor_address: vendorAddress.trim(),
        delivery_location: deliveryLocation.trim(),
        expected_date: expectedDate || null,
        payment_terms: paymentTerms.trim(),
        remarks: remarks.trim(),
        file_url: uploaded?.url || null,
        file_name: uploaded?.name || null,
      };

      let poId;
      if (editingPo) {
        const { error: updErr } = await supabase.from("purchase_orders").update(headerPayload).eq("id", editingPo.id);
        if (updErr) throw updErr;
        poId = editingPo.id;

        // line items can only be safely replaced if nothing has been received yet —
        // otherwise we'd wipe out qty_received history for goods already in stock
        if (editingPo.status === "Ordered") {
          const { error: delErr } = await supabase.from("purchase_order_items").delete().eq("po_id", poId);
          if (delErr) throw delErr;
        }
      } else {
        const { data: poRow, error: poErr } = await supabase
          .from("purchase_orders")
          .insert({ ...headerPayload, status: "Ordered", created_by: currentUser })
          .select()
          .single();
        if (poErr) throw poErr;
        poId = poRow.id;
      }

      if (!editingPo || editingPo.status === "Ordered") {
        const itemRows = validLines.map((li) => {
          const material = materials.find((m) => m.name === li.materialName);
          const qty = parseFloat(li.qty) || 0;
          const rate = parseFloat(li.rate) || 0;
          return { po_id: poId, material_id: material.id, qty_ordered: qty, rate, amount: qty * rate };
        });
        const { error: itemsErr } = await supabase.from("purchase_order_items").insert(itemRows);
        if (itemsErr) throw itemsErr;
      }

      resetForm();
      load();
    } catch (err) {
      if (err.message && err.message.includes("purchase_orders_po_number_key")) {
        setError(`PO Number "${poNumberInput.trim()}" already exists — use a different number.`);
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setEditingPo(null);
    setPoNumberInput("");
    setPoDate(new Date().toISOString().split("T")[0]);
    setVendorName(""); setVendorAddress(""); setDeliveryLocation("");
    setExpectedDate(""); setPaymentTerms(""); setRemarks("");
    setLineItems([emptyLineItem()]);
    setAttachedFile(null);
    setExistingFile(null);
  }

  function startEditPo(po) {
    setEditingPo(po);
    setPoNumberInput(po.po_number);
    setPoDate(po.po_date || po.created_at?.split("T")[0] || "");
    setVendorName(po.vendor_name || "");
    setVendorAddress(po.vendor_address || "");
    setDeliveryLocation(po.delivery_location || "");
    setExpectedDate(po.expected_date || "");
    setPaymentTerms(po.payment_terms || "");
    setRemarks(po.remarks || "");
    setAttachedFile(null);
    setExistingFile(po.file_url ? { url: po.file_url, name: po.file_name } : null);
    const items = poItemsMap[po.id] || [];
    setLineItems(
      items.length > 0
        ? items.map((it) => ({
            key: `li_${it.id}`,
            materialName: it.material?.name || "",
            qty: String(it.qty_ordered),
            rate: String(it.rate),
          }))
        : [emptyLineItem()]
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePO(id) {
    if (!confirm("Delete this Purchase Order? This cannot be undone.")) return;
    const { error: err } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (err) setError(err.message);
    else load();
  }

  function handlePrint(po) {
    printPurchaseOrder(po, poItemsMap[po.id] || []);
  }

  const filteredPos = useMemo(() => {
    return pos.filter((po) => {
      if (statusFilter && po.status !== statusFilter) return false;
      if (fromDate && po.created_at.split("T")[0] < fromDate) return false;
      if (toDate && po.created_at.split("T")[0] > toDate) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${po.po_number} ${po.vendor_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, statusFilter, fromDate, toDate, search]);

  return (
    <div className="po-root">
      <style>{`
        .po-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .po-form-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; margin-bottom: 18px; }
        .po-form-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 14px; }
        .po-form-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .po-form-title-row .po-form-title { margin-bottom: 0; }
        .po-cancel-edit-btn { border: 1px solid #e1e3ec; background: #fff; color: #5b5f72; border-radius: 9px; padding: 7px 14px; font-weight: 700; font-size: 12px; cursor: pointer; }
        .po-locked-note { background: #fff4de; color: #b5620f; border-radius: 10px; padding: 9px 13px; font-size: 12px; font-weight: 600; margin-bottom: 14px; }
        .po-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        @media (max-width: 900px) { .po-header-grid { grid-template-columns: repeat(2, 1fr); } }
        .po-field label { display: block; font-size: 11.5px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .po-field input, .po-field textarea { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; }

        .po-lines-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #b5620f; margin: 16px 0 10px 0; border-top: 1px solid #f0f1f6; padding-top: 14px; }
        .po-lines-title-row { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px 0; border-top: 1px solid #f0f1f6; padding-top: 14px; flex-wrap: wrap; gap: 8px; }
        .po-add-material-btn { border: 1px dashed #cfe0ff; background: #f5f9ff; color: #1d5fc7; border-radius: 9px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .po-add-material-btn:hover { background: #e8f1ff; }

        .po-file-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 8px 10px; font-size: 12.5px; background: #fff; }
        .po-file-hint { font-size: 11.5px; color: #5b5f72; margin-top: 5px; }
        .po-file-hint a { color: #1d5fc7; font-weight: 600; }

        .po-quickadd-card { background: #f5f9ff; border: 1.5px dashed #cfe0ff; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
        .po-quickadd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 700px) { .po-quickadd-grid { grid-template-columns: 1fr; } }
        .po-quickadd-grid label { display: block; font-size: 10.5px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; text-transform: uppercase; }
        .po-quickadd-grid input, .po-quickadd-grid select { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 8px 10px; font-size: 12.5px; }
        .po-quickadd-uom { display: flex; gap: 6px; margin-top: 6px; }
        .po-quickadd-uom input { flex: 1; border: 1px solid #e1e3ec; border-radius: 7px; padding: 6px 8px; font-size: 11.5px; }
        .po-quickadd-uom button { border: none; background: #14161f; color: #fff; border-radius: 7px; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
        .po-quickadd-error { background: #fdeceb; color: #c23c33; padding: 8px 12px; border-radius: 8px; margin-top: 10px; font-size: 12px; font-weight: 600; }
        .po-quickadd-actions { display: flex; gap: 8px; margin-top: 12px; }
        .po-quickadd-save { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
        .po-quickadd-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .po-quickadd-cancel { border: 1px solid #e1e3ec; background: #fff; color: #5b5f72; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
        .po-line-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: end; margin-bottom: 8px; }
        @media (max-width: 900px) { .po-line-row { grid-template-columns: 1fr 1fr; } }
        .po-line-row label { display: block; font-size: 10px; font-weight: 700; color: #9295a8; margin-bottom: 4px; text-transform: uppercase; }
        .po-line-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 9px; padding: 8px 10px; font-size: 12.5px; }
        .po-line-unit { font-size: 11px; color: #9295a8; padding: 8px 0; }
        .po-line-amount { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #1a8a4c; padding: 8px 0; font-size: 13px; }
        .po-line-del { border: 1px solid #e6e8f0; background: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; color: #c23c33; display: flex; align-items: center; justify-content: center; }
        .po-add-line-btn { border: 1px dashed #cfe0ff; background: #f5f9ff; color: #1d5fc7; border-radius: 9px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; margin-top: 4px; }

        .po-total-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin: 16px 0; padding-top: 12px; border-top: 1px solid #f0f1f6; }
        .po-total-label { font-size: 13px; color: #5b5f72; font-weight: 700; }
        .po-total-value { font-family: 'IBM Plex Mono', monospace; font-size: 18px; font-weight: 800; color: #14161f; }
        .po-submit-btn { width: 100%; border: none; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 12px; border-radius: 11px; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .po-submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .po-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .po-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; flex: 1; min-width: 200px; color: #9295a8; }
        .po-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .po-status-select { border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 12px; font-size: 13px; min-width: 170px; background: #fff; }
        .po-date-input { border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 12px; font-size: 13px; background: #fff; }
        .po-bulk-btn { border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 10px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; }

        .po-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 16px 18px; margin-bottom: 12px; }
        .po-card-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .po-num { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #b5620f; font-size: 13px; }
        .po-vendor { font-weight: 700; font-size: 13.5px; }
        .po-status-badge { font-size: 10.5px; font-weight: 700; padding: 4px 10px; border-radius: 20px; }
        .po-card-meta { font-size: 12px; color: #9295a8; margin-top: 4px; }
        .po-card-actions { margin-left: auto; display: flex; gap: 6px; }
        .po-icon-btn { border: 1px solid #e6e8f0; background: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; color: #5b5f72; display: flex; align-items: center; justify-content: center; }
        .po-icon-btn:hover { background: #f6f7fb; }
        .po-icon-btn.danger { color: #c23c33; }
        .po-icon-btn.danger:hover { background: #fdeceb; }
        .po-receive-btn { border: none; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; border-radius: 9px; padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }

        .po-items-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 12px; }
        .po-items-table thead th { background: #f6f7fb; text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; color: #5b5f72; }
        .po-items-table tbody td { padding: 8px 10px; border-top: 1px solid #f0f1f6; }
        .po-items-table .num { text-align: right; }

        .po-empty, .po-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; background: #fff; border: 1px solid #eceef4; border-radius: 16px; }
        .po-spin { animation: po-spin-anim 0.9s linear infinite; }
        @keyframes po-spin-anim { to { transform: rotate(360deg); } }
        .po-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <form className="po-form-card" onSubmit={submitPO}>
        <div className="po-form-title-row">
          <div className="po-form-title">{editingPo ? `Edit Purchase Order — ${editingPo.po_number}` : "Create Purchase Order"}</div>
          {editingPo && <button type="button" className="po-cancel-edit-btn" onClick={resetForm}>Cancel Edit</button>}
        </div>
        {editingPo && editingPo.status !== "Ordered" && (
          <div className="po-locked-note">⚠️ Some material has already been received on this PO — line items are locked. Only header details can be edited.</div>
        )}

        <div className="po-header-grid">
          <div className="po-field">
            <label>PO Number *</label>
            <input value={poNumberInput} onChange={(e) => setPoNumberInput(e.target.value)} placeholder="e.g. PO-00123" />
          </div>
          <div className="po-field">
            <label>PO Date</label>
            <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>
          <div className="po-field">
            <label>Vendor Name *</label>
            <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Vendor name" />
          </div>
          <div className="po-field">
            <label>Vendor Address</label>
            <input value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} placeholder="Optional" />
          </div>
          <div className="po-field">
            <label>Deliver To</label>
            <input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="e.g. RM Store" />
          </div>
          <div className="po-field">
            <label>Expected Delivery Date</label>
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
          <div className="po-field">
            <label>Payment Terms</label>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days credit" />
          </div>
          <div className="po-field">
            <label>Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
          </div>
          <div className="po-field">
            <label>Attach Document</label>
            <input type="file" onChange={handleFileChange} className="po-file-input" />
            {attachedFile && <div className="po-file-hint">Selected: {attachedFile.name}</div>}
            {!attachedFile && existingFile && <div className="po-file-hint">Current: <a href={existingFile.url} target="_blank" rel="noreferrer">{existingFile.name}</a></div>}
          </div>
        </div>

        <div className="po-lines-title-row">
          <div className="po-lines-title" style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>Materials</div>
          {!(editingPo && editingPo.status !== "Ordered") && (
            <button type="button" className="po-add-material-btn" onClick={() => setShowAddMaterial((s) => !s)}>
              <Plus size={13} /> Add Material to List
            </button>
          )}
        </div>

        {showAddMaterial && (
          <div className="po-quickadd-card">
            <div className="po-quickadd-grid">
              <div>
                <label>Material Name</label>
                <input value={newMatName} onChange={(e) => setNewMatName(e.target.value)} placeholder="e.g. Core Veneer" />
              </div>
              <div>
                <label>Category</label>
                <select value={newMatCategory} onChange={(e) => setNewMatCategory(e.target.value)}>
                  {RM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>UOM (Unit)</label>
                <select value={newMatUom} onChange={(e) => setNewMatUom(e.target.value)}>
                  <option value="">- Select Unit -</option>
                  {uomList.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <div className="po-quickadd-uom">
                  <input value={newUomInput} onChange={(e) => setNewUomInput(e.target.value)} placeholder="+ new unit" />
                  <button type="button" onClick={addUom}><Plus size={12} /></button>
                </div>
              </div>
            </div>
            {addMaterialError && <div className="po-quickadd-error">{addMaterialError}</div>}
            <div className="po-quickadd-actions">
              <button type="button" className="po-quickadd-save" onClick={addNewMaterial} disabled={addingMaterial}>
                {addingMaterial ? "Adding..." : "Add Material"}
              </button>
              <button type="button" className="po-quickadd-cancel" onClick={() => setShowAddMaterial(false)}>Cancel</button>
            </div>
          </div>
        )}

        {lineItems.map((li) => {
          const locked = editingPo && editingPo.status !== "Ordered";
          return (
            <div className="po-line-row" key={li.key}>
              <div>
                <label>Material</label>
                {locked ? <div className="po-line-unit">{li.materialName}</div> : (
                  <ComboBox value={li.materialName} onChange={(v) => updateLine(li.key, "materialName", v)} options={materials.map((m) => m.name)} placeholder="Select material" />
                )}
              </div>
              <div>
                <label>Qty</label>
                <input type="number" className="po-line-input" value={li.qty} onChange={(e) => updateLine(li.key, "qty", e.target.value)} placeholder="0" disabled={locked} />
              </div>
              <div>
                <label>UOM</label>
                <div className="po-line-unit">{materialUnit(li.materialName) || "—"}</div>
              </div>
              <div>
                <label>Rate (₹)</label>
                <input type="number" className="po-line-input" value={li.rate} onChange={(e) => updateLine(li.key, "rate", e.target.value)} placeholder="0" disabled={locked} />
              </div>
              <div>
                <label>Amount</label>
                <div className="po-line-amount">₹{lineTotal(li).toFixed(2)}</div>
              </div>
              {!locked && <button type="button" className="po-line-del" onClick={() => removeLine(li.key)}><Trash2 size={13} /></button>}
            </div>
          );
        })}
        {!(editingPo && editingPo.status !== "Ordered") && (
          <button type="button" className="po-add-line-btn" onClick={addLine}><Plus size={13} /> Add Material</button>
        )}

        <div className="po-total-row">
          <span className="po-total-label">Total:</span>
          <span className="po-total-value">₹{grandTotal.toFixed(2)}</span>
        </div>

        {error && <div className="po-error">{error}</div>}

        <button className="po-submit-btn" type="submit" disabled={saving || uploadingFile}>
          <ShoppingCart size={16} /> {uploadingFile ? "Uploading file..." : saving ? "Saving..." : editingPo ? "Update Purchase Order" : "Create Purchase Order"}
        </button>
      </form>

      <div className="po-toolbar">
        <div className="po-search">
          <Search size={14} />
          <input placeholder="Search by PO no or vendor..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="po-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Ordered">Ordered</option>
          <option value="Partially Received">Partially Received</option>
          <option value="Received">Received</option>
        </select>
        <input type="date" className="po-date-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" className="po-date-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button className="po-bulk-btn" onClick={() => setShowBulkUpload(true)}>
          <UploadCloud size={14} /> Bulk Upload
        </button>
      </div>

      {loading ? (
        <div className="po-loading"><Loader2 size={22} className="po-spin" /></div>
      ) : filteredPos.length === 0 ? (
        <div className="po-empty"><ShoppingCart size={22} /><div>No purchase orders found.</div></div>
      ) : (
        filteredPos.map((po) => {
          const items = poItemsMap[po.id] || [];
          const total = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
          const badge = STATUS_STYLES[po.status] || { bg: "#f1f2f6", color: "#4a4d5c" };
          const isExpanded = expandedId === po.id;
          const hasPending = items.some((it) => Number(it.qty_received) < Number(it.qty_ordered));
          return (
            <div className="po-card" key={po.id}>
              <div className="po-card-top">
                <span className="po-num">{po.po_number}</span>
                <span className="po-vendor">{po.vendor_name}</span>
                <span className="po-status-badge" style={{ background: badge.bg, color: badge.color }}>{po.status}</span>
                <div className="po-card-actions">
                  {hasPending && (
                    <button className="po-receive-btn" onClick={() => setReceivingPo(po)}>
                      <PackageCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Receive
                    </button>
                  )}
                  <button className="po-icon-btn" title="Edit PO" onClick={() => startEditPo(po)}><Pencil size={14} /></button>
                  <button className="po-icon-btn" title="Print / PDF" onClick={() => handlePrint(po)}><Printer size={14} /></button>
                  <button className="po-icon-btn" title="View items" onClick={() => setExpandedId(isExpanded ? null : po.id)}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button className="po-icon-btn danger" title="Delete" onClick={() => deletePO(po.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="po-card-meta">
                {items.length} item(s) · ₹{total.toFixed(2)} · PO Date {fmtDate(po.po_date || po.created_at)} · Expected {fmtDate(po.expected_date)}
                {po.file_url && <> · <a href={po.file_url} target="_blank" rel="noreferrer" style={{ color: "#1d5fc7", fontWeight: 600 }}>📎 {po.file_name || "Attachment"}</a></>}
              </div>

              {isExpanded && (
                <table className="po-items-table">
                  <thead>
                    <tr><th>Item Code</th><th>Material</th><th>UOM</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Rate</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.material?.item_code || "-"}</td>
                        <td>{it.material?.name || "Unknown"}</td>
                        <td>{it.material?.unit || "-"}</td>
                        <td className="num">{it.qty_ordered}</td>
                        <td className="num" style={{ color: Number(it.qty_received) < Number(it.qty_ordered) ? "#c23c33" : "#1a8a4c", fontWeight: 700 }}>{it.qty_received}</td>
                        <td className="num">₹{Number(it.rate).toFixed(2)}</td>
                        <td className="num">₹{Number(it.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}

      {receivingPo && (
        <ReceiveGoodsModal
          po={receivingPo}
          items={poItemsMap[receivingPo.id] || []}
          onClose={() => setReceivingPo(null)}
          onDone={() => { setReceivingPo(null); load(); }}
        />
      )}

      {showBulkUpload && (
        <BulkPurchaseUpload
          currentUser={currentUser}
          materials={materials}
          onClose={() => setShowBulkUpload(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
