import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ShoppingCart, CheckCircle2, Clock3, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";

function poNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
}

export default function PurchaseOrders() {
  const [pos, setPos] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [vendor, setVendor] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [poRes, matRes] = await Promise.all([
      supabase.from("purchase_orders").select("*, raw_materials(name, unit)").order("created_at", { ascending: false }),
      supabase.from("raw_materials").select("*").order("name"),
    ]);
    if (poRes.error) setError(poRes.error.message);
    else setPos(poRes.data || []);
    setMaterials(matRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createPO(e) {
    e.preventDefault();
    if (!vendor.trim() || !materialName || !qty) return;
    const material = materials.find((m) => m.name === materialName);
    if (!material) { setError("Unknown material."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("purchase_orders").insert({
      po_number: poNumber(),
      vendor_name: vendor.trim(),
      material_id: material.id,
      qty_ordered: parseFloat(qty) || 0,
      status: "Ordered",
    });
    setSaving(false);
    if (err) setError(err.message);
    else {
      setVendor(""); setMaterialName(""); setQty("");
      load();
    }
  }

  const filteredPos = useMemo(() => {
    return pos.filter((po) => {
      if (statusFilter && po.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${po.po_number} ${po.vendor_name} ${po.raw_materials?.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, statusFilter, search]);

  async function markReceived(po) {
    setReceivingId(po.id);
    setError("");
    try {
      const { data: existing } = await supabase.from("rm_stock").select("*").eq("material_id", po.material_id).maybeSingle();
      if (existing) {
        const { error: err } = await supabase
          .from("rm_stock")
          .update({ qty_available: Number(existing.qty_available) + Number(po.qty_ordered), updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("rm_stock").insert({ material_id: po.material_id, qty_available: po.qty_ordered });
        if (err) throw err;
      }
      const { error: poErr } = await supabase
        .from("purchase_orders")
        .update({ status: "Received", received_at: new Date().toISOString() })
        .eq("id", po.id);
      if (poErr) throw poErr;
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReceivingId(null);
    }
  }

  return (
    <div className="po-root">
      <style>{`
        .po-root { font-family: 'Inter', sans-serif; color: #1c1e26; max-width: 900px; }
        .po-form { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
        .po-field { flex: 1; min-width: 160px; }
        .po-field label { display: block; font-size: 12px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .po-input { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; }
        .po-add-btn { border: none; display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f5a623, #e0951f); color: #17130a; padding: 10px 18px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .po-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .po-toolbar { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 14px 18px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .po-search { display: flex; align-items: center; gap: 8px; background: #f6f7fb; border: 1px solid #e4e6ee; border-radius: 999px; padding: 9px 14px; flex: 1; min-width: 200px; color: #9295a8; }
        .po-search input { border: none; outline: none; font-size: 13px; width: 100%; background: transparent; }
        .po-status-select { border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 12px; font-size: 13px; min-width: 150px; background: #fff; }
        .po-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; overflow: hidden; }
        .po-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .po-table thead th { background: #14161f; color: #fff; text-align: left; padding: 13px 18px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
        .po-table tbody td { padding: 13px 18px; border-bottom: 1px solid #f0f1f6; }

        @media (max-width: 780px) {
          .po-table, .po-table thead, .po-table tbody, .po-table tr, .po-table td { display: block; width: 100%; }
          .po-table thead { display: none; }
          .po-table tbody tr { border: 1px solid #eceef4; border-radius: 12px; margin-bottom: 10px; padding: 4px 0; box-shadow: 0 2px 6px rgba(20,22,35,0.04); }
          .po-table tbody td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f5f6fa; text-align: right; }
          .po-table tbody td:last-child { border-bottom: none; }
          .po-table tbody td::before { content: attr(data-label); font-weight: 700; color: #9295a8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; }
        }
        .po-table tbody tr:last-child td { border-bottom: none; }
        .po-num { font-family: 'IBM Plex Mono', monospace; color: #b5620f; font-weight: 700; font-size: 12px; }
        .po-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; }
        .po-status-ordered { background: #fff4de; color: #b5620f; }
        .po-status-received { background: #eafaf1; color: #1a8a4c; }
        .po-receive-btn { border: none; background: #1a8a4c; color: #fff; border-radius: 8px; padding: 7px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
        .po-receive-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .po-empty, .po-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 0; color: #9295a8; }
        .po-spin { animation: po-spin-anim 0.9s linear infinite; }
        @keyframes po-spin-anim { to { transform: rotate(360deg); } }
        .po-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 12px; font-size: 12.5px; font-weight: 600; }
      `}</style>

      <form className="po-form" onSubmit={createPO}>
        <div className="po-field"><label>Vendor</label><input className="po-input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" /></div>
        <div className="po-field"><label>Material</label><ComboBox value={materialName} onChange={setMaterialName} options={materials.map((m) => m.name)} placeholder="Select material" /></div>
        <div className="po-field"><label>Qty</label><input type="number" className="po-input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></div>
        <button className="po-add-btn" type="submit" disabled={saving}><Plus size={15} /> {saving ? "Creating..." : "Create PO"}</button>
      </form>

      {error && <div className="po-error">{error}</div>}

      <div className="po-toolbar">
        <div className="po-search">
          <Search size={14} />
          <input placeholder="Search by PO no, vendor, material..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="po-status-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="Ordered">Ordered</option>
          <option value="Received">Received</option>
        </select>
      </div>

      <div className="po-card">
        {loading ? (
          <div className="po-loading"><Loader2 size={20} className="po-spin" /></div>
        ) : filteredPos.length === 0 ? (
          <div className="po-empty"><ShoppingCart size={22} style={{ marginBottom: 8 }} /><div>No purchase orders found.</div></div>
        ) : (
          <table className="po-table">
            <thead><tr><th>PO No.</th><th>Vendor</th><th>Material</th><th>Qty</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredPos.map((po) => (
                <tr key={po.id}>
                  <td data-label="PO No."><span className="po-num">{po.po_number}</span></td>
                  <td data-label="Vendor">{po.vendor_name}</td>
                  <td data-label="Material">{po.raw_materials?.name || "-"}</td>
                  <td data-label="Qty">{po.qty_ordered} {po.raw_materials?.unit}</td>
                  <td data-label="Status">
                    {po.status === "Received" ? (
                      <span className="po-status po-status-received"><CheckCircle2 size={12} /> Received</span>
                    ) : (
                      <span className="po-status po-status-ordered"><Clock3 size={12} /> Ordered</span>
                    )}
                  </td>
                  <td data-label="Action" style={{ textAlign: "right" }}>
                    {po.status !== "Received" && (
                      <button className="po-receive-btn" disabled={receivingId === po.id} onClick={() => markReceived(po)}>
                        {receivingId === po.id ? "..." : "Mark Received"}
                      </button>
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
