import React, { useState, useCallback } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";
import { useMasterData } from "../hooks/useMasterData";
import { calculateItemWeight, sumItemTotals } from "../utils/weightCalculator";

function currentFY() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  return month >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

async function fetchNextSeq() {
  const prefix = `KSM/FIN/${currentFY()}/`;
  const { data, error } = await supabase
    .from("orders")
    .select("order_id")
    .like("order_id", `${prefix}%`)
    .order("order_id", { ascending: false })
    .limit(1);
  if (error) throw error;
  let maxSeq = 0;
  if (data && data.length > 0) {
    const seq = parseInt(data[0].order_id.split("/")[3], 10);
    if (!Number.isNaN(seq)) maxSeq = seq;
  }
  return { prefix, nextSeq: maxSeq + 1 };
}

function excelDateToISO(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  if (typeof value === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

const REQUIRED_COLS = ["Order Ref", "Party", "Brand", "Destination", "Item Name", "Size", "Thickness", "Qty"];

export default function BulkOrderUpload({ currentUser }) {
  const master = useMasterData();
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [groupedOrders, setGroupedOrders] = useState([]); // [{ ref, meta:{}, items:[], errors:[] }]
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null); // { created: [...], failed: [...] }

  const itemsSet = new Set(master.items.map((i) => i.toUpperCase()));
  const thicknessSet = new Set(master.thickness.map((t) => t.toUpperCase()));

  const handleFile = useCallback(
    (file) => {
      setParseError("");
      setImportResults(null);
      setFileName(file.name);
      setParsing(true);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "binary", cellDates: false });
          const sheetName = wb.SheetNames.includes("Orders") ? "Orders" : wb.SheetNames[0];
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

          // group rows by "Order Ref" — same ref = same order, multiple items
          const groups = {};
          rows.forEach((row, idx) => {
            const ref = String(row["Order Ref"] ?? "").trim() || `ROW${idx + 1}`;
            if (!groups[ref]) {
              groups[ref] = {
                ref,
                meta: {
                  orderDate: excelDateToISO(row["Order Date"]),
                  party: String(row["Party"] ?? "").trim(),
                  salesPerson: String(row["Sales Person"] ?? "").trim(),
                  brand: String(row["Brand"] ?? "").trim(),
                  destination: String(row["Destination"] ?? "").trim(),
                  remark: String(row["Remark"] ?? "").trim(),
                },
                items: [],
                errors: [],
              };
            }
            const itemName = String(row["Item Name"] ?? "").trim();
            const size = String(row["Size"] ?? "").trim();
            const thickness = String(row["Thickness"] ?? "").trim();
            const qty = parseFloat(row["Qty"]) || 0;
            const shade = String(row["Shade"] ?? "").trim();
            const model = String(row["Model"] ?? "").trim();

            const calc = calculateItemWeight({ itemName, size, thickness, qty });
            groups[ref].items.push({
              itemName, size, thickness, qty,
              shade: shade || null, model: model || null,
              na: calc.na, weightTon: calc.weightTon,
            });

            if (!itemName || !size || !thickness || qty <= 0) {
              groups[ref].errors.push(`Row for "${itemName || "?"}" is missing Item/Size/Thickness/Qty.`);
            }
            if (itemName && !itemsSet.has(itemName.toUpperCase())) {
              groups[ref].errors.push(`Item "${itemName}" not found in Items master.`);
            }
            if (thickness && !thicknessSet.has(thickness.toUpperCase())) {
              groups[ref].errors.push(`Thickness "${thickness}" not found in Thickness master.`);
            }
          });

          const result = Object.values(groups).map((g) => {
            if (!g.meta.party) g.errors.push("Party is required.");
            if (!g.meta.brand) g.errors.push("Brand is required.");
            if (!g.meta.destination) g.errors.push("Destination is required.");
            return g;
          });

          setGroupedOrders(result);
        } catch (err) {
          setParseError("Could not read this file — make sure it's a valid .xlsx or .csv export.");
        } finally {
          setParsing(false);
        }
      };
      reader.readAsBinaryString(file);
    },
    [itemsSet, thicknessSet]
  );

  function onFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function removeGroup(ref) {
    setGroupedOrders((prev) => prev.filter((g) => g.ref !== ref));
  }

  const validGroups = groupedOrders.filter((g) => g.errors.length === 0);
  const invalidCount = groupedOrders.length - validGroups.length;

  async function importAll() {
    setImporting(true);
    const created = [];
    const failed = [];
    try {
      let { prefix, nextSeq } = await fetchNextSeq();

      for (const g of validGroups) {
        const orderId = `${prefix}${String(nextSeq).padStart(3, "0")}`;
        try {
          const totals = sumItemTotals(
            g.items.map((it) => ({ qty: it.qty, na: it.na, weightTon: it.weightTon }))
          );
          const { error: orderErr } = await supabase.from("orders").insert({
            order_id: orderId,
            order_date: g.meta.orderDate,
            party_name: g.meta.party,
            sales_person: g.meta.salesPerson || null,
            brand: g.meta.brand,
            destination: g.meta.destination,
            remark: g.meta.remark || null,
            total_qty: totals.totalQty,
            total_weight: totals.totalWeight,
            status: "Pending",
            created_by: currentUser,
          });
          if (orderErr) throw orderErr;

          const itemRows = g.items.map((it) => ({
            order_id: orderId,
            item_name: it.itemName,
            brand: g.meta.brand,
            size: it.size,
            thickness: it.thickness,
            qty: it.qty,
            na: parseFloat(it.na) || 0,
            weight_ton: parseFloat(it.weightTon) || 0,
            shade: it.shade,
            model: it.model,
          }));
          const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
          if (itemsErr) throw itemsErr;

          created.push({ ref: g.ref, orderId });
          nextSeq += 1;
        } catch (err) {
          failed.push({ ref: g.ref, error: err.message });
        }
      }

      setImportResults({ created, failed });
      setGroupedOrders((prev) => prev.filter((g) => !created.some((c) => c.ref === g.ref)));
    } catch (err) {
      setImportResults({ created: [], failed: [{ ref: "-", error: err.message }] });
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const headers = ["Order Ref", "Order Date", "Party", "Sales Person", "Brand", "Destination", "Remark", "Item Name", "Size", "Thickness", "Qty", "Shade", "Model"];
    const example = [
      ["B1", "10-08-2026", "ADITYA GLASS", "ABHAY KUMAR", "BEST PINE", "AYODHA", "", "PLYWOOD", "8x4", "12MM", 10, "", ""],
      ["B1", "10-08-2026", "ADITYA GLASS", "ABHAY KUMAR", "BEST PINE", "AYODHA", "", "BLOCKBOARD", "8x4", "19MM", 5, "", ""],
      ["B2", "10-08-2026", "AMBICA PLYWOOD", "ROHIT SHARMA", "BULAND PLY / MARS CLUB", "GUWAHATI", "", "MEMBRANE DOOR", "80 X 40", "19MM", 3, "", "EMD-51"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, "O2D_FMS_Bulk_Order_Template.xlsx");
  }

  return (
    <div className="bou-root">
      <style>{`
        .bou-root { font-family: 'Inter', sans-serif; color: #1c1e26; }
        .bou-toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
        .bou-template-btn { border: 1px solid #cfe0ff; background: #e8f1ff; color: #1d5fc7; border-radius: 10px; padding: 10px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .bou-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; background: #fff; border: 2px dashed #e1e3ec; border-radius: 16px; padding: 34px; text-align: center; margin-bottom: 18px; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
        .bou-drop:hover { border-color: #f5a623; background: #fffaf1; }
        .bou-drop input { display: none; }
        .bou-drop-icon { color: #b5620f; margin-bottom: 10px; }
        .bou-drop-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
        .bou-drop-sub { font-size: 12px; color: #9295a8; }
        .bou-filename { font-size: 12.5px; color: #5b5f72; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; }

        .bou-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
        .bou-summary { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .bou-summary-chip { font-size: 12px; font-weight: 700; padding: 7px 14px; border-radius: 20px; }
        .bou-chip-valid { background: #eafaf1; color: #1a8a4c; }
        .bou-chip-invalid { background: #fdeceb; color: #c23c33; }

        .bou-group-card { background: #fff; border: 1px solid #eceef4; border-radius: 14px; padding: 16px 18px; margin-bottom: 12px; }
        .bou-group-card.has-error { border-color: #f3c6c3; background: #fffafa; }
        .bou-group-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .bou-group-ref { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #14161f; color: #fff; padding: 4px 10px; border-radius: 999px; }
        .bou-group-meta { font-size: 12.5px; color: #5b5f72; }
        .bou-group-meta b { color: #1c1e26; }
        .bou-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; color: #c23c33; display: flex; align-items: center; justify-content: center; }
        .bou-items-list { font-size: 12.5px; color: #4a4d5c; background: #f6f7fb; border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; }
        .bou-errors { display: flex; flex-direction: column; gap: 4px; }
        .bou-error-line { font-size: 11.5px; color: #c23c33; font-weight: 600; display: flex; align-items: flex-start; gap: 5px; }

        .bou-import-btn { width: 100%; border: none; padding: 13px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; background: linear-gradient(135deg, #1a8a4c, #146b3c); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; }
        .bou-import-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .bou-result-card { background: #fff; border: 1px solid #eceef4; border-radius: 16px; padding: 18px 20px; margin-top: 16px; }
        .bou-result-title { font-weight: 700; font-size: 14px; margin-bottom: 10px; }
        .bou-result-line { font-size: 13px; padding: 6px 0; display: flex; align-items: center; gap: 8px; }
        .bou-result-ok { color: #1a8a4c; }
        .bou-result-fail { color: #c23c33; }
        .bou-spin { animation: bou-spin-anim 0.9s linear infinite; }
        @keyframes bou-spin-anim { to { transform: rotate(360deg); } }
      `}</style>

      <div className="bou-toolbar">
        <button className="bou-template-btn" onClick={downloadTemplate}>
          <Download size={15} /> Download Template
        </button>
      </div>

      <label className="bou-drop">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileInput} />
        <div className="bou-drop-icon"><UploadCloud size={32} /></div>
        <div className="bou-drop-title">Click to upload Orders file</div>
        <div className="bou-drop-sub">.xlsx or .csv — use the template above for the right columns</div>
        {fileName && (
          <div className="bou-filename"><FileSpreadsheet size={13} /> {fileName}</div>
        )}
      </label>

      {parsing && <div className="bou-error" style={{ background: "#fff4de", color: "#b5620f" }}><Loader2 size={14} className="bou-spin" style={{ verticalAlign: -2, marginRight: 6 }} />Reading file...</div>}
      {parseError && <div className="bou-error">{parseError}</div>}

      {groupedOrders.length > 0 && (
        <>
          <div className="bou-summary">
            <span className="bou-summary-chip bou-chip-valid">{validGroups.length} order(s) ready to import</span>
            {invalidCount > 0 && <span className="bou-summary-chip bou-chip-invalid">{invalidCount} order(s) need fixes</span>}
          </div>

          {groupedOrders.map((g) => (
            <div className={`bou-group-card ${g.errors.length > 0 ? "has-error" : ""}`} key={g.ref}>
              <div className="bou-group-top">
                <span className="bou-group-ref">{g.ref}</span>
                <span className="bou-group-meta">
                  <b>{g.meta.party || "—"}</b> · {g.meta.brand || "—"} · {g.meta.destination || "—"} · {g.meta.orderDate}
                </span>
                <button className="bou-del-btn" onClick={() => removeGroup(g.ref)} title="Remove this order"><Trash2 size={13} /></button>
              </div>
              <div className="bou-items-list">
                {g.items.map((it, i) => (
                  <div key={i}>{it.itemName} — {it.thickness}, {it.size} × {it.qty}{it.model ? ` (Model: ${it.model})` : ""}</div>
                ))}
              </div>
              {g.errors.length > 0 && (
                <div className="bou-errors">
                  {g.errors.map((e, i) => (
                    <div className="bou-error-line" key={i}><AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />{e}</div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button className="bou-import-btn" disabled={importing || validGroups.length === 0} onClick={importAll}>
            <CheckCircle2 size={16} /> {importing ? "Importing..." : `Import ${validGroups.length} Order(s)`}
          </button>
        </>
      )}

      {importResults && (
        <div className="bou-result-card">
          <div className="bou-result-title">Import Results</div>
          {importResults.created.map((c) => (
            <div className="bou-result-line bou-result-ok" key={c.ref}><CheckCircle2 size={14} /> {c.ref} → created as <b>{c.orderId}</b></div>
          ))}
          {importResults.failed.map((f, i) => (
            <div className="bou-result-line bou-result-fail" key={i}><AlertTriangle size={14} /> {f.ref}: {f.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
