import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ShoppingCart, PackageCheck, Search, Trash2, Printer, ChevronDown, ChevronUp, UploadCloud } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ComboBox from "../components/ui/ComboBox";
import ReceiveGoodsModal from "../components/ui/ReceiveGoodsModal";
import BulkPurchaseUpload from "../components/ui/BulkPurchaseUpload";
import { printPurchaseOrder } from "../utils/printPurchaseOrder";

function poNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
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

  // create-PO form state
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState(null);
  const [receivingPo, setReceivingPo] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [matRes, poRes] = await Promise.all([
      supabase.from("raw_materials").select("*").order("name"),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    ]);
    setMaterials(matRes.data || []);
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

  async function createPO(e) {
    e.preventDefault();
    const validLines = lineItems.filter((li) => li.materialName && parseFloat(li.qty) > 0);
    if (!vendorName.trim() || validLines.length === 0) {
      setError("Vendor name and at least one material line are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: poRow, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: poNumber(),
          vendor_name: vendorName.trim(),
          vendor_address: vendorAddress.trim(),
          delivery_location: deliveryLocation.trim(),
          expected_date: expectedDate || null,
          payment_terms: paymentTerms.trim(),
          remarks: remarks.trim(),
          status: "Ordered",
          created_by: currentUser,
        })
        .select()
        .single();
      if (poErr) throw poErr;

      const itemRows = validLines.map((li) => {
        const material = materials.find((m) => m.name === li.materialName);
        const qty = parseFloat(li.qty) || 0;
        const rate = parseFloat(li.rate) || 0;
        return {
          po_id: poRow.id,
          material_id: material.id,
          qty_ordered: qty,
          rate,
          amount: qty * rate,
        };
      });
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;

      setVendorName(""); setVendorAddress(""); setDeliveryLocation("");
      setExpectedDate(""); setPaymentTerms(""); setRemarks("");
      setLineItems([emptyLineItem()]);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${po.po_number} ${po.vendor_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, statusFilter, search]);

  return (
    <div className="po-root">
      <style>{`
        .po-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .po-form-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 20px; margin-bottom: 18px; }
        .po-form-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 14px; }
        .po-header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        @media (max-width: 900px) { .po-header-grid { grid-template-columns: repeat(2, 1fr); } }
        .po-field label { display: block; font-size: 11.5px; font-weight: 700; color: #5b5f72; margin-bottom: 6px; }
        .po-field input, .po-field textarea { width: 100%; box-sizing: border-box; border: 1px solid #e1e3ec; border-radius: 10px; padding: 9px 11px; font-size: 13px; font-family: inherit; }

        .po-lines-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #b5620f; margin: 16px 0 10px 0; border-top: 1px solid #f0f1f6; padding-top: 14px; }
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

      <form className="po-form-card" onSubmit={createPO}>
        <div className="po-form-title">Create Purchase Order</div>

        <div className="po-header-grid">
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
        </div>

        <div className="po-lines-title">Materials</div>
        {lineItems.map((li) => (
          <div className="po-line-row" key={li.key}>
            <div>
              <label>Material</label>
              <ComboBox value={li.materialName} onChange={(v) => updateLine(li.key, "materialName", v)} options={materials.map((m) => m.name)} placeholder="Select material" />
            </div>
            <div>
              <label>Qty</label>
              <input type="number" className="po-line-input" value={li.qty} onChange={(e) => updateLine(li.key, "qty", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label>UOM</label>
              <div className="po-line-unit">{materialUnit(li.materialName) || "—"}</div>
            </div>
            <div>
              <label>Rate (₹)</label>
              <input type="number" className="po-line-input" value={li.rate} onChange={(e) => updateLine(li.key, "rate", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label>Amount</label>
              <div className="po-line-amount">₹{lineTotal(li).toFixed(2)}</div>
            </div>
            <button type="button" className="po-line-del" onClick={() => removeLine(li.key)}><Trash2 size={13} /></button>
          </div>
        ))}
        <button type="button" className="po-add-line-btn" onClick={addLine}><Plus size={13} /> Add Material</button>

        <div className="po-total-row">
          <span className="po-total-label">Total:</span>
          <span className="po-total-value">₹{grandTotal.toFixed(2)}</span>
        </div>

        {error && <div className="po-error">{error}</div>}

        <button className="po-submit-btn" type="submit" disabled={saving}>
          <ShoppingCart size={16} /> {saving ? "Creating..." : "Create Purchase Order"}
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
                  <button className="po-icon-btn" title="Print / PDF" onClick={() => handlePrint(po)}><Printer size={14} /></button>
                  <button className="po-icon-btn" title="View items" onClick={() => setExpandedId(isExpanded ? null : po.id)}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button className="po-icon-btn danger" title="Delete" onClick={() => deletePO(po.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="po-card-meta">
                {items.length} item(s) · ₹{total.toFixed(2)} · Expected {fmtDate(po.expected_date)} · Created {fmtDate(po.created_at)}
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
