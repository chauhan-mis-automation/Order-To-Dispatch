import React, { useCallback, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2, Download, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabaseClient";

function poNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
}

// Handles Excel serial dates AND text dates in DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD —
// converts to the ISO yyyy-mm-dd format Postgres expects. Returns null if empty/unparseable.
function parseDateValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return null;
}

const REQUIRED_COLS = ["PO Ref", "Vendor Name", "Material Name", "Qty"];

export default function BulkPurchaseUpload({ currentUser, materials, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [groupedPOs, setGroupedPOs] = useState([]); // [{ ref, meta:{}, items:[], errors:[] }]
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const materialSet = new Set(materials.map((m) => m.name.toUpperCase()));

  const handleFile = useCallback(
    (file) => {
      setParseError("");
      setImportResults(null);
      setFileName(file.name);
      setParsing(true);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "binary" });
          const sheetName = wb.SheetNames.includes("Purchase Orders") ? "Purchase Orders" : wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

          if (rows.length === 0) {
            setParseError("No rows found in the sheet.");
            setParsing(false);
            return;
          }
          const headerCols = Object.keys(rows[0]);
          const missing = REQUIRED_COLS.filter((c) => !headerCols.includes(c));
          if (missing.length > 0) {
            setParseError(`Missing required column(s): ${missing.join(", ")}`);
            setParsing(false);
            return;
          }

          const groups = {};
          rows.forEach((row, idx) => {
            const ref = String(row["PO Ref"] ?? "").trim() || `ROW${idx + 1}`;
            if (!groups[ref]) {
              groups[ref] = {
                ref,
                meta: {
                  vendorName: String(row["Vendor Name"] ?? "").trim(),
                  vendorAddress: String(row["Vendor Address"] ?? "").trim(),
                  deliveryLocation: String(row["Deliver To"] ?? "").trim(),
                  expectedDate: parseDateValue(row["Expected Date"]),
                  paymentTerms: String(row["Payment Terms"] ?? "").trim(),
                  remarks: String(row["Remarks"] ?? "").trim(),
                },
                items: [],
                errors: [],
              };
            }
            const materialName = String(row["Material Name"] ?? "").trim();
            const qty = parseFloat(row["Qty"]) || 0;
            const rate = parseFloat(row["Rate"]) || 0;

            groups[ref].items.push({ materialName, qty, rate });

            if (!materialName || qty <= 0) {
              groups[ref].errors.push(`Row missing Material Name or valid Qty.`);
            } else if (!materialSet.has(materialName.toUpperCase())) {
              groups[ref].errors.push(`Material "${materialName}" not found in Raw Materials master.`);
            }
          });

          const result = Object.values(groups).map((g) => {
            if (!g.meta.vendorName) g.errors.push("Vendor Name is required.");
            return g;
          });

          setGroupedPOs(result);
        } catch (err) {
          setParseError("Could not read this file — make sure it's a valid .xlsx or .csv export.");
        } finally {
          setParsing(false);
        }
      };
      reader.readAsBinaryString(file);
    },
    [materialSet]
  );

  function onFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function removeGroup(ref) {
    setGroupedPOs((prev) => prev.filter((g) => g.ref !== ref));
  }

  const validGroups = groupedPOs.filter((g) => g.errors.length === 0);
  const invalidCount = groupedPOs.length - validGroups.length;

  async function importAll() {
    setImporting(true);
    const created = [];
    const failed = [];

    for (const g of validGroups) {
      const newPoNumber = poNumber();
      try {
        const { data: poRow, error: poErr } = await supabase
          .from("purchase_orders")
          .insert({
            po_number: newPoNumber,
            vendor_name: g.meta.vendorName,
            vendor_address: g.meta.vendorAddress,
            delivery_location: g.meta.deliveryLocation,
            expected_date: g.meta.expectedDate || null,
            payment_terms: g.meta.paymentTerms,
            remarks: g.meta.remarks,
            status: "Ordered",
            created_by: currentUser,
          })
          .select()
          .single();
        if (poErr) throw poErr;

        const itemRows = g.items.map((it) => {
          const material = materials.find((m) => m.name.toUpperCase() === it.materialName.toUpperCase());
          return {
            po_id: poRow.id,
            material_id: material.id,
            qty_ordered: it.qty,
            rate: it.rate,
            amount: it.qty * it.rate,
          };
        });
        const { error: itemsErr } = await supabase.from("purchase_order_items").insert(itemRows);
        if (itemsErr) throw itemsErr;

        created.push({ ref: g.ref, poNumber: newPoNumber });
      } catch (err) {
        failed.push({ ref: g.ref, error: err.message });
      }
    }

    setImportResults({ created, failed });
    setGroupedPOs((prev) => prev.filter((g) => !created.some((c) => c.ref === g.ref)));
    setImporting(false);
    if (created.length > 0) onImported();
  }

  function downloadTemplate() {
    const headers = ["PO Ref", "Vendor Name", "Vendor Address", "Deliver To", "Expected Date", "Payment Terms", "Remarks", "Material Name", "Qty", "Rate"];
    const example = [
      ["P1", "ABC Timber Suppliers", "Guwahati", "RM Store", "15-09-2026", "30 days credit", "", "Core Veneer", 100, 45],
      ["P1", "ABC Timber Suppliers", "Guwahati", "RM Store", "15-09-2026", "30 days credit", "", "PF Resin", 50, 85],
      ["P2", "Chemical House", "Kolkata", "Chemical Store", "20-09-2026", "Advance", "", "Hardener", 30, 120],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");
    XLSX.writeFile(wb, "O2D_FMS_Bulk_PO_Template.xlsx");
  }

  return (
    <div className="bpo-overlay" onClick={onClose}>
      <div className="bpo-card" onClick={(e) => e.stopPropagation()}>
        <style>{`
          .bpo-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; }
          .bpo-card { width: 100%; max-width: 780px; max-height: 88vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; }
          .bpo-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
          .bpo-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
          .bpo-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
          .bpo-body { padding: 20px 22px 22px 22px; overflow-y: auto; }

          .bpo-toolbar { display: flex; gap: 10px; margin-bottom: 14px; }
          .bpo-template-btn { border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 10px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
          .bpo-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; background: #fff; border: 2px dashed #e1e3ec; border-radius: 16px; padding: 28px; text-align: center; margin-bottom: 16px; cursor: pointer; }
          .bpo-drop:hover { border-color: #f5a623; background: #fffaf1; }
          .bpo-drop input { display: none; }
          .bpo-drop-icon { color: #b5620f; margin-bottom: 8px; }
          .bpo-drop-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
          .bpo-drop-sub { font-size: 11.5px; color: #9295a8; }
          .bpo-filename { font-size: 12px; color: #5b5f72; margin-top: 8px; display: flex; align-items: center; gap: 6px; }

          .bpo-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
          .bpo-summary { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
          .bpo-chip { font-size: 12px; font-weight: 700; padding: 6px 13px; border-radius: 20px; }
          .bpo-chip-valid { background: #eafaf1; color: #1a8a4c; }
          .bpo-chip-invalid { background: #fdeceb; color: #c23c33; }

          .bpo-group-card { background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; margin-bottom: 10px; }
          .bpo-group-card.has-error { border-color: #f3c6c3; background: #fffafa; }
          .bpo-group-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
          .bpo-group-ref { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; background: #14161f; color: #fff; padding: 4px 10px; border-radius: 999px; }
          .bpo-group-meta { font-size: 12px; color: #5b5f72; }
          .bpo-group-meta b { color: #1c1e26; }
          .bpo-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 26px; height: 26px; border-radius: 8px; cursor: pointer; color: #c23c33; display: flex; align-items: center; justify-content: center; }
          .bpo-items-list { font-size: 12px; color: #4a4d5c; background: #f6f7fb; border-radius: 9px; padding: 7px 11px; margin-bottom: 6px; }
          .bpo-error-line { font-size: 11px; color: #c23c33; font-weight: 600; display: flex; align-items: flex-start; gap: 5px; margin-top: 2px; }

          .bpo-import-btn { width: 100%; border: none; padding: 12px; border-radius: 12px; font-weight: 700; font-size: 13.5px; cursor: pointer; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; }
          .bpo-import-btn:disabled { opacity: 0.6; cursor: not-allowed; }

          .bpo-result-card { background: #fbfbfd; border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; margin-top: 14px; }
          .bpo-result-line { font-size: 12.5px; padding: 5px 0; display: flex; align-items: center; gap: 8px; }
          .bpo-result-ok { color: #1a8a4c; }
          .bpo-result-fail { color: #c23c33; }
          .bpo-spin { animation: bpo-spin-anim 0.9s linear infinite; }
          @keyframes bpo-spin-anim { to { transform: rotate(360deg); } }
        `}</style>

        <div className="bpo-header">
          <h4><UploadCloud size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Bulk Purchase Order Upload</h4>
          <button className="bpo-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="bpo-body">
          <div className="bpo-toolbar">
            <button className="bpo-template-btn" onClick={downloadTemplate}><Download size={14} /> Download Template</button>
          </div>

          <label className="bpo-drop">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileInput} />
            <div className="bpo-drop-icon"><UploadCloud size={26} /></div>
            <div className="bpo-drop-title">Click to upload Purchase Orders file</div>
            <div className="bpo-drop-sub">.xlsx or .csv — use the template above for the right columns</div>
            {fileName && <div className="bpo-filename"><FileSpreadsheet size={12} /> {fileName}</div>}
          </label>

          {parsing && <div className="bpo-error" style={{ background: "#fff4de", color: "#b5620f" }}><Loader2 size={13} className="bpo-spin" style={{ verticalAlign: -2, marginRight: 6 }} />Reading file...</div>}
          {parseError && <div className="bpo-error">{parseError}</div>}

          {groupedPOs.length > 0 && (
            <>
              <div className="bpo-summary">
                <span className="bpo-chip bpo-chip-valid">{validGroups.length} PO(s) ready to import</span>
                {invalidCount > 0 && <span className="bpo-chip bpo-chip-invalid">{invalidCount} PO(s) need fixes</span>}
              </div>

              {groupedPOs.map((g) => (
                <div className={`bpo-group-card ${g.errors.length > 0 ? "has-error" : ""}`} key={g.ref}>
                  <div className="bpo-group-top">
                    <span className="bpo-group-ref">{g.ref}</span>
                    <span className="bpo-group-meta"><b>{g.meta.vendorName || "—"}</b> · {g.meta.deliveryLocation || "—"} · {g.meta.expectedDate || "no date"}</span>
                    <button className="bpo-del-btn" onClick={() => removeGroup(g.ref)}><Trash2 size={12} /></button>
                  </div>
                  <div className="bpo-items-list">
                    {g.items.map((it, i) => (
                      <div key={i}>{it.materialName} × {it.qty}{it.rate ? ` @ ₹${it.rate}` : ""}</div>
                    ))}
                  </div>
                  {g.errors.map((e, i) => (
                    <div className="bpo-error-line" key={i}><AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />{e}</div>
                  ))}
                </div>
              ))}

              <button className="bpo-import-btn" disabled={importing || validGroups.length === 0} onClick={importAll}>
                <CheckCircle2 size={15} /> {importing ? "Importing..." : `Import ${validGroups.length} Purchase Order(s)`}
              </button>
            </>
          )}

          {importResults && (
            <div className="bpo-result-card">
              {importResults.created.map((c) => (
                <div className="bpo-result-line bpo-result-ok" key={c.ref}><CheckCircle2 size={13} /> {c.ref} → created as <b>{c.poNumber}</b></div>
              ))}
              {importResults.failed.map((f, i) => (
                <div className="bpo-result-line bpo-result-fail" key={i}><AlertTriangle size={13} /> {f.ref}: {f.error}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
