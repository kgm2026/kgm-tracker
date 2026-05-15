import { useState, useRef } from 'react';
import { Overlay, notify } from './Shared';
import { fmt, toInt } from '../utils/formatting';
import { dbInsert } from '../utils/api';

export default function ImportCsvModal({ S, D, projectId, entries, onImported }) {
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { notify("CSV is empty", "error"); return; }
      const parseRow = (line) => {
        const cols = []; let current = "", inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQuotes = !inQuotes; }
          else if (c === ',' && !inQuotes) { cols.push(current.trim()); current = ""; }
          else { current += c; }
        }
        cols.push(current.trim());
        return cols;
      };
      const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ""));
      const dateIdx = headers.findIndex(h => h === "date");
      const matIdx = headers.findIndex(h => h === "material");
      if (dateIdx === -1 || matIdx === -1) { notify("CSV must have 'Date' and 'Material' columns", "error"); return; }
      const findIdx = (name) => headers.findIndex(h => h === name);
      const catIdx = findIdx("category"), supIdx = findIdx("supplier"), qtyIdx = findIdx("qty"), rateIdx = findIdx("rate"), totalIdx = findIdx("total"), unpaidIdx = findIdx("unpaid"), statusIdx = findIdx("status"), notesIdx = findIdx("notes");
      const rows = [];
      let nextNum = entries.length > 0 ? Math.max(...entries.map(e => e.num || 0)) + 1 : 1;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseRow(lines[i]);
        const date = cols[dateIdx] || ""; const material = cols[matIdx] || "";
        if (!date || !material) continue;
        const qty = qtyIdx >= 0 ? parseFloat(cols[qtyIdx]) || null : null;
        const rate = rateIdx >= 0 ? parseFloat(cols[rateIdx]) || null : null;
        let total = totalIdx >= 0 ? toInt(cols[totalIdx], 0) : 0;
        if (!total && qty && rate) total = Math.round(qty * rate);
        rows.push({
          num: nextNum++, date, material,
          category: (catIdx >= 0 ? cols[catIdx] : "grey") || "grey",
          supplier: supIdx >= 0 ? cols[supIdx] : "", qty, rate, total,
          unpaid: unpaidIdx >= 0 ? toInt(cols[unpaidIdx], 0) : 0,
          status: (statusIdx >= 0 ? cols[statusIdx] : "Paid") || "Paid",
          notes: notesIdx >= 0 ? cols[notesIdx] : "", project_id: projectId
        });
      }
      if (rows.length === 0) { notify("No valid rows found", "error"); return; }
      setImportPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const results = [];
      const BATCH = 10;
      for (let i = 0; i < importPreview.length; i += BATCH) {
        const batch = importPreview.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(r => dbInsert("material_purchases", r)));
        results.push(...batchResults);
      }
      onImported(results);
      notify(`${results.length} entries imported`);
      setImportPreview(null);
    } catch (e) { notify("Import failed: " + e.message, "error"); }
    setImporting(false);
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4, borderRadius: 6 }}>Import</button>

      {importPreview && (
        <Overlay onClose={() => setImportPreview(null)} title={`Import Preview (${importPreview.length} rows)`}>
          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "Date", "Material", "Supplier", "Qty", "Total", "Status"].map((h, i) => <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: D.muted, fontWeight: 500, position: "sticky", top: 0, background: D.surface }}>{h}</th>)}</tr></thead>
              <tbody>
                {importPreview.slice(0, 50).map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? D.surface : D.surfaceLowest }}>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.muted }}>{r.num}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.muted }}>{r.date}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.white, fontWeight: 600 }}>{r.material}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.muted }}>{r.supplier || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.muted }}>{r.qty || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.gold, fontWeight: 700 }}>{fmt(r.total)}</td>
                    <td style={{ padding: "8px 12px", fontSize: 10, color: D.muted }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importPreview.length > 50 && <div style={{ padding: "8px 12px", fontSize: 11, color: D.muted, textAlign: "center" }}>...and {importPreview.length - 50} more rows</div>}
          </div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 16, fontFamily: "'Inter',sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>
            Total: <strong style={{ color: D.gold }}>{fmt(importPreview.reduce((s, r) => s + r.total, 0))}</strong> · {importPreview.length} entries
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...S.btnGold, flex: 1, opacity: importing ? 0.6 : 1 }} onClick={confirmImport} disabled={importing}>{importing ? "Importing..." : `Import ${importPreview.length} Entries`}</button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => setImportPreview(null)}>Cancel</button>
          </div>
        </Overlay>
      )}
    </>
  );
}
