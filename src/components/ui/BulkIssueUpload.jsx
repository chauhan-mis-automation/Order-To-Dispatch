import React, { useCallback, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Trash2, Download, X, PackageMinus } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabaseClient";

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
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

const REQUIRED_COLS = ["Material Name", "Qty to Issue"];

export default function BulkIssueUpload({ rmRows, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState([]); // [{ key, materialName, qty, issuedTo, remarks, issueDate, matchedRow, errors: [] }]
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

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
          const sheetName = wb.SheetNames.includes("Material Issues") ? "Material Issues" : wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

          if (rawRows.length === 0) {
            setParseError("No rows found in the sheet.");
            setParsing(false);
            return;
          }
          const headerCols = Object.keys(rawRows[0]);
          const missing = REQUIRED_COLS.filter((c) => !headerCols.includes(c));
          if (missing.length > 0) {
            setParseError(`Missing required column(s): ${missing.join(", ")}`);
            setParsing(false);
            return;
          }

          // track running availability per material across the batch, so row 2
          // issuing the same material as row 1 is checked against what's left
          const runningAvailable = {};
          rmRows.forEach((r) => {
            runningAvailable[(r.raw_materials?.name || "").toUpperCase()] = Number(r.qty_available) || 0;
          });

          const parsed = rawRows.map((row, idx) => {
            const materialName = String(row["Material Name"] ?? "").trim();
            const qty = parseFloat(row["Qty to Issue"]) || 0;
            const issuedTo = String(row["Issued To"] ?? "").trim();
            const remarks = String(row["Remarks"] ?? "").trim();
            const issueDate = parseDateValue(row["Date"]) || todayStr();

            const errors = [];
            const matchedRow = rmRows.find((r) => (r.raw_materials?.name || "").toUpperCase() === materialName.toUpperCase());

            if (!materialName || qty <= 0) {
              errors.push("Missing Material Name or a valid Qty to Issue.");
            } else if (!matchedRow) {
              errors.push(`Material "${materialName}" not found in Raw Materials master.`);
            } else {
              const key = materialName.toUpperCase();
              const remaining = runningAvailable[key] ?? 0;
              if (qty > remaining) {
                errors.push(`Only ${remaining} ${matchedRow.raw_materials?.unit || ""} left — can't issue ${qty}.`);
              } else {
                runningAvailable[key] = remaining - qty;
              }
            }

            return {
              key: `row_${idx}`, materialName, qty, issuedTo, remarks, issueDate, matchedRow, errors,
            };
          });

          setRows(parsed);
        } catch (err) {
          setParseError("Could not read this file — make sure it's a valid .xlsx or .csv export.");
        } finally {
          setParsing(false);
        }
      };
      reader.readAsBinaryString(file);
    },
    [rmRows]
  );

  function onFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function removeRow(key) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidCount = rows.length - validRows.length;

  async function importAll() {
    setImporting(true);
    const created = [];
    const failed = [];

    for (const row of validRows) {
      try {
        const available = Number(row.matchedRow.qty_available) || 0;
        const { error: issueErr } = await supabase.from("material_issues").insert({
          material_id: row.matchedRow.material_id,
          qty_issued: row.qty,
          qty_before: available,
          qty_after: available - row.qty,
          issue_date: row.issueDate,
          issued_to: row.issuedTo,
          remarks: row.remarks,
        });
        if (issueErr) throw issueErr;

        const { error: stockErr } = await supabase
          .from("rm_stock")
          .update({ qty_available: available - row.qty, updated_at: new Date().toISOString() })
          .eq("id", row.matchedRow.id);
        if (stockErr) throw stockErr;

        // keep the in-memory row's available qty current, in case the same
        // material appears again later in this same import batch
        row.matchedRow.qty_available = available - row.qty;

        created.push({ key: row.key, material: row.materialName, qty: row.qty });
      } catch (err) {
        failed.push({ key: row.key, material: row.materialName, error: err.message });
      }
    }

    setImportResults({ created, failed });
    setRows((prev) => prev.filter((r) => !created.some((c) => c.key === r.key)));
    setImporting(false);
    if (created.length > 0) onImported();
  }

  function downloadTemplate() {
    const headers = ["Date", "Material Name", "Qty to Issue", "Issued To", "Remarks"];
    const example = [
      [todayStr().split("-").reverse().join("-"), "Core Veneer", 50, "Production Floor", ""],
      [todayStr().split("-").reverse().join("-"), "PF Resin", 10, "Production Floor", "Batch 12"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Issues");
    XLSX.writeFile(wb, "O2D_FMS_Bulk_Material_Issue_Template.xlsx");
  }

  return (
    <div className="biu-overlay" onClick={onClose}>
      <div className="biu-card" onClick={(e) => e.stopPropagation()}>
        <style>{`
          .biu-overlay { position: fixed; inset: 0; background: rgba(12,13,20,0.5); backdrop-filter: blur(3px); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; }
          .biu-card { width: 100%; max-width: 760px; max-height: 88vh; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(10,11,20,0.3); overflow: hidden; display: flex; flex-direction: column; }
          .biu-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid #f0f1f6; background: #fbfbfd; }
          .biu-header h4 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 16px; }
          .biu-close { border: none; background: #f1f2f6; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5b5f72; }
          .biu-body { padding: 20px 22px 22px 22px; overflow-y: auto; }

          .biu-toolbar { display: flex; gap: 10px; margin-bottom: 14px; }
          .biu-template-btn { border: 1px solid #f3c6c3; background: #fdeceb; color: #c23c33; border-radius: 10px; padding: 9px 16px; font-weight: 700; font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
          .biu-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; background: #fff; border: 2px dashed #e1e3ec; border-radius: 16px; padding: 28px; text-align: center; margin-bottom: 16px; cursor: pointer; }
          .biu-drop:hover { border-color: #c23c33; background: #fffafa; }
          .biu-drop input { display: none; }
          .biu-drop-icon { color: #c23c33; margin-bottom: 8px; }
          .biu-drop-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
          .biu-drop-sub { font-size: 11.5px; color: #9295a8; }
          .biu-filename { font-size: 12px; color: #5b5f72; margin-top: 8px; display: flex; align-items: center; gap: 6px; }

          .biu-error { background: #fdeceb; color: #c23c33; padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 12.5px; font-weight: 600; }
          .biu-summary { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
          .biu-chip { font-size: 12px; font-weight: 700; padding: 6px 13px; border-radius: 20px; }
          .biu-chip-valid { background: #eafaf1; color: #1a8a4c; }
          .biu-chip-invalid { background: #fdeceb; color: #c23c33; }

          .biu-row-card { background: #fff; border: 1px solid #eceef4; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
          .biu-row-card.has-error { border-color: #f3c6c3; background: #fffafa; }
          .biu-row-main { flex: 1; min-width: 200px; }
          .biu-row-title { font-size: 12.5px; font-weight: 700; }
          .biu-row-sub { font-size: 11px; color: #9295a8; margin-top: 2px; }
          .biu-row-qty { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #c23c33; font-size: 13px; }
          .biu-row-errors { width: 100%; }
          .biu-error-line { font-size: 11px; color: #c23c33; font-weight: 600; display: flex; align-items: flex-start; gap: 5px; margin-top: 4px; }
          .biu-del-btn { border: 1px solid #e6e8f0; background: #fff; width: 26px; height: 26px; border-radius: 8px; cursor: pointer; color: #c23c33; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

          .biu-import-btn { width: 100%; border: none; padding: 12px; border-radius: 12px; font-weight: 700; font-size: 13.5px; cursor: pointer; background: linear-gradient(135deg, #c23c33, #a12e26); color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; }
          .biu-import-btn:disabled { opacity: 0.6; cursor: not-allowed; }

          .biu-result-card { background: #fbfbfd; border: 1px solid #eceef4; border-radius: 14px; padding: 14px 16px; margin-top: 14px; }
          .biu-result-line { font-size: 12.5px; padding: 5px 0; display: flex; align-items: center; gap: 8px; }
          .biu-result-ok { color: #1a8a4c; }
          .biu-result-fail { color: #c23c33; }
          .biu-spin { animation: biu-spin-anim 0.9s linear infinite; }
          @keyframes biu-spin-anim { to { transform: rotate(360deg); } }
        `}</style>

        <div className="biu-header">
          <h4><PackageMinus size={18} style={{ marginRight: 8, verticalAlign: -3 }} />Bulk Material Issue Upload</h4>
          <button className="biu-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="biu-body">
          <div className="biu-toolbar">
            <button className="biu-template-btn" onClick={downloadTemplate}><Download size={14} /> Download Template</button>
          </div>

          <label className="biu-drop">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileInput} />
            <div className="biu-drop-icon"><UploadCloud size={26} /></div>
            <div className="biu-drop-title">Click to upload Material Issue file</div>
            <div className="biu-drop-sub">.xlsx or .csv — use the template above for the right columns</div>
            {fileName && <div className="biu-filename"><FileSpreadsheet size={12} /> {fileName}</div>}
          </label>

          {parsing && <div className="biu-error" style={{ background: "#fff4de", color: "#b5620f" }}><Loader2 size={13} className="biu-spin" style={{ verticalAlign: -2, marginRight: 6 }} />Reading file...</div>}
          {parseError && <div className="biu-error">{parseError}</div>}

          {rows.length > 0 && (
            <>
              <div className="biu-summary">
                <span className="biu-chip biu-chip-valid">{validRows.length} row(s) ready to import</span>
                {invalidCount > 0 && <span className="biu-chip biu-chip-invalid">{invalidCount} row(s) need fixes</span>}
              </div>

              {rows.map((r) => (
                <div className={`biu-row-card ${r.errors.length > 0 ? "has-error" : ""}`} key={r.key}>
                  <div className="biu-row-main">
                    <div className="biu-row-title">{r.materialName || "—"}</div>
                    <div className="biu-row-sub">{r.issueDate} · {r.issuedTo || "no destination"}{r.remarks ? ` · ${r.remarks}` : ""}</div>
                  </div>
                  <div className="biu-row-qty">-{r.qty} {r.matchedRow?.raw_materials?.unit || ""}</div>
                  <button className="biu-del-btn" onClick={() => removeRow(r.key)}><Trash2 size={12} /></button>
                  {r.errors.length > 0 && (
                    <div className="biu-row-errors">
                      {r.errors.map((e, i) => (
                        <div className="biu-error-line" key={i}><AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button className="biu-import-btn" disabled={importing || validRows.length === 0} onClick={importAll}>
                <PackageMinus size={15} /> {importing ? "Issuing..." : `Issue ${validRows.length} Material(s) → Deduct from Stock`}
              </button>
            </>
          )}

          {importResults && (
            <div className="biu-result-card">
              {importResults.created.map((c) => (
                <div className="biu-result-line biu-result-ok" key={c.key}><CheckCircle2 size={13} /> {c.material} — issued {c.qty}</div>
              ))}
              {importResults.failed.map((f, i) => (
                <div className="biu-result-line biu-result-fail" key={i}><AlertTriangle size={13} /> {f.material}: {f.error}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
