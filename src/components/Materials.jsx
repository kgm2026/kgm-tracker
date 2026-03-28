import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbGet, dbInsert, dbPatch, dbDelete } from '../utils/api';
import { fmt, STATUS_COLORS, toFloat, toInt } from '../utils/formatting';
import { LoadingSpinner, notify } from './Shared';
import MaterialFormModal from './MaterialFormModal';
import ImportCsvModal from './ImportCsvModal';
import Pagination from './Pagination';
import { emitDataChange } from '../utils/aiCacheInvalidation';
import { detectAnomalies } from '../utils/anomalyDetector';
import InvoiceScanner from './InvoiceScanner';
import NLEntryBar from './NLEntryBar';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const BLANK_MAT = {
  date: "", material: "", category: "grey", supplier: "", unit: "",
  qty: "", rate: "", total: "", unpaid: "0", status: "Paid", notes: ""
};

export default function Materials({ projectId }) {
  const { S, T } = useTheme();
  const { isAdmin } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(BLANK_MAT);
  const [catFilter, setCatFilter] = useState(null);
  const [stFilter, setStFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortCol, setSortCol] = useState("num");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [anomalies, setAnomalies] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const data = await dbGet("material_purchases", `&project_id=eq.${projectId}&order=num.asc`);
    setEntries(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["material_purchases"], fetchData);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases") fetchData();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const totalCost = useMemo(() => entries.reduce((s, e) => s + (e.total || 0), 0), [entries]);
  const totalUnpaid = useMemo(() => entries.reduce((s, e) => s + (e.unpaid || 0), 0), [entries]);
  const paidCount = useMemo(() => entries.filter(e => (e.status || "").toLowerCase() === "paid").length, [entries]);

  const openEdit = useCallback((e) => {
    setForm({
      date: e.date || "", material: e.material || "", category: e.category || "grey",
      supplier: e.supplier || "", unit: e.unit || "",
      qty: e.qty != null ? String(e.qty) : "", rate: e.rate != null ? String(e.rate) : "",
      total: e.total != null ? String(e.total) : "", unpaid: e.unpaid != null ? String(e.unpaid) : "0",
      status: e.status || "Paid", notes: e.notes || ""
    });
    setEditId(e.id); setModal(true);
  }, []);

  const handleSave = async (data, editId) => {
    if (editId) {
      await dbPatch("material_purchases", editId, data);
      const updated = { ...entries.find(e => e.id === editId), ...data };
      setEntries(prev => prev.map(e => e.id === editId ? updated : e));
      notify("Entry updated");
      emitDataChange();
      const alerts = detectAnomalies(updated, entries);
      if (alerts.length > 0) setAnomalies(alerts);
    } else {
      const num = entries.length > 0 ? Math.max(...entries.map(e => e.num || 0)) + 1 : 1;
      const row = await dbInsert("material_purchases", { num, ...data, project_id: projectId });
      setEntries(prev => [...prev, row]);
      notify("Entry added");
      emitDataChange();
      const alerts = detectAnomalies(row, entries);
      if (alerts.length > 0) setAnomalies(alerts);
    }
  };

  const PENDING_DELETIONS = useRef(new Map());

  const del = async (e) => {
    setEntries(prev => prev.map(x => x.id === e.id ? { ...x, _pendingDelete: true } : x));
    const deletePromise = new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        try {
          await dbDelete("material_purchases", e.id);
          setEntries(prev => prev.filter(x => x.id !== e.id));
          PENDING_DELETIONS.current.delete(e.id);
          resolve({ success: true });
        } catch (err) {
          setEntries(prev => prev.map(x => x.id === e.id ? { ...x, _pendingDelete: false } : x));
          notify(`Failed to delete "${e.material}": ${err.message}`, "error");
          PENDING_DELETIONS.current.delete(e.id);
          resolve({ success: false, error: err });
        }
      }, 4000);
      PENDING_DELETIONS.current.set(e.id, { timeoutId, entry: e });
    });
    const onUndo = () => {
      const pending = PENDING_DELETIONS.current.get(e.id);
      if (pending) { clearTimeout(pending.timeoutId); PENDING_DELETIONS.current.delete(e.id); }
      setEntries(prev => prev.map(x => x.id === e.id ? { ...x, _pendingDelete: false } : x));
      notify(`"${e.material}" restored`);
    };
    notify(`"${e.material}" deleting...`, "undo", onUndo);
    return deletePromise;
  };

  useEffect(() => {
    return () => {
      for (const { timeoutId } of PENDING_DELETIONS.current.values()) { clearTimeout(timeoutId); }
      PENDING_DELETIONS.current.clear();
    };
  }, []);

  const exportCSV = () => {
    const headers = ["#", "Date", "Material", "Category", "Supplier", "Qty", "Unit", "Rate", "Total", "Unpaid", "Status", "Notes"];
    const rows = filtered.map(e => [e.num, e.date, e.material, e.category, e.supplier, e.qty, e.unit, e.rate, e.total, e.unpaid, e.status, e.notes]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `materials_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    notify("CSV exported");
  };

  const handleScannedItem = useCallback((scannedData) => {
    setForm(scannedData);
    setEditId(null);
    setModal(true);
  }, []);

  const handleImported = (results) => {
    setEntries(prev => [...prev, ...results].sort((a, b) => (a.num || 0) - (b.num || 0)));
  };

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = entries.filter(e => {
      const matchSearch = !q || (e.material || "").toLowerCase().includes(q) || (e.supplier || "").toLowerCase().includes(q) || (e.notes || "").toLowerCase().includes(q) || String(e.num || "").includes(q);
      return matchSearch && (!catFilter || e.category === catFilter) && (!stFilter || (e.status || "").toLowerCase() === stFilter.toLowerCase());
    });
    return [...list].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [entries, debouncedSearch, catFilter, stFilter, sortCol, sortDir]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [debouncedSearch, catFilter, stFilter, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIndicator = ({ col }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: 10 }}>{"\u2195"}</span>;
    return <span style={{ marginLeft: 4, fontSize: 10 }}>{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card,
    surfaceHigh: T.cardBorder, surfaceHighest: T.cardBorder,
    outline: T.cardBorder, white: T.text, gold: T.financial,
    green: T.success, blue: T.financial, muted: T.textMuted,
    bodyBg: T.bodyBg,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <style>{`
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
      `}</style>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "Monthly Expenditure", value: fmt(totalCost), accent: "left", color: T.text },
          { label: "Outstanding Balances", value: fmt(totalUnpaid), accent: "left", color: T.financial },
          { label: "Total Entries", value: entries.length, accent: "left", color: T.text },
          { label: "Paid Entries", value: paidCount, accent: "left", color: T.text },
        ].map((kpi, i) => (
          <div key={i} style={{ background: T.card, padding: 24, borderLeft: `2px solid ${i === 1 ? T.financial : i === 0 ? T.text : D.outline}`, borderRadius: "0 8px 8px 0", border: `1px solid ${D.outline}`, borderLeftWidth: 2, borderLeftColor: i === 1 ? T.financial : T.text, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, margin: 0, fontWeight: 600 }}>{kpi.label}</p>
            <h3 style={{ color: kpi.color, fontSize: 24, fontWeight: 700, fontFamily: "'Inter',sans-serif", marginTop: 8, letterSpacing: -0.5 }}>{kpi.value}</h3>
            <div style={{ marginTop: 16, height: 4, background: T.bodyBg, borderRadius: 2 }}>
              <div style={{ height: "100%", background: kpi.color, width: i === 1 ? `${totalCost > 0 ? Math.round((totalUnpaid / totalCost) * 100) : 0}%` : i === 3 ? `${entries.length > 0 ? Math.round((paidCount / entries.length) * 100) : 0}%` : "75%", borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Natural Language Entry Bar */}
      {isAdmin && <NLEntryBar onExtracted={handleScannedItem} />}

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          {anomalies.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              background: a.severity === "high" ? `${T.danger}12` : `${T.warning}12`,
              border: `1px solid ${a.severity === "high" ? T.danger : T.warning}30`,
              fontFamily: "'Inter',sans-serif",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: a.severity === "high" ? T.danger : T.warning }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 2 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>{a.detail}</div>
              </div>
              <button onClick={() => setAnomalies(prev => prev.filter((_, j) => j !== i))} style={{
                background: "transparent", border: "none", cursor: "pointer", color: T.textMuted, padding: 4,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${D.outline}`, paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 18, color: D.white, margin: 0 }}>Purchase Ledger</h2>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, border: `1px solid ${D.outline}`, padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>Real-Time Sync</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[{ label: "All", val: null }, { label: "Grey", val: "grey" }, { label: "Finishing", val: "finishing" }].map(f => (
            <button key={f.label} onClick={() => setCatFilter(f.val)} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, background: catFilter === f.val ? T.navActiveBg : "transparent", border: `1px solid ${D.outline}`, color: catFilter === f.val ? T.financial : D.muted, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s", borderRadius: 6 }}>{f.label}</button>
          ))}
          <div style={{ width: 1, height: 20, background: D.outline }} />
          {[{ label: "Paid", val: "Paid" }, { label: "Partial", val: "Partial" }, { label: "Unpaid", val: "Unpaid" }].map(f => (
            <button key={f.label} onClick={() => setStFilter(stFilter === f.val ? null : f.val)} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, background: stFilter === f.val ? T.navActiveBg : "transparent", border: `1px solid ${D.outline}`, color: stFilter === f.val ? T.financial : D.muted, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s", borderRadius: 6 }}>{f.label}</button>
          ))}
          <div style={{ width: 1, height: 20, background: D.outline }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Materials..." style={{ background: T.input, border: `1px solid ${T.inputBorder}`, color: D.white, padding: "6px 12px", fontSize: 12, outline: "none", width: 180, fontFamily: "'Inter',sans-serif", borderRadius: 6 }} />
          <div style={{ width: 1, height: 20, background: D.outline }} />
          {isAdmin && <button onClick={() => { setForm(BLANK_MAT); setEditId(null); setModal(true); }} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, background: T.financial, border: "none", color: "#fff", padding: "6px 16px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Add Entry
          </button>}
          {isAdmin && <InvoiceScanner onExtracted={handleScannedItem} />}
          {isAdmin && <ImportCsvModal S={S} D={D} projectId={projectId} entries={entries} onImported={handleImported} />}
          {isAdmin && <button style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4, borderRadius: 6 }} onClick={exportCSV}>Export</button>}
        </div>
      </div>

      {/* Mobile Card View */}
      <style>{`
        .mat-desktop { display: block; }
        .mat-mobile-cards { display: none; }
        @media (max-width: 640px) {
          .mat-desktop { display: none !important; }
          .mat-mobile-cards { display: flex !important; }
          .mat-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .mat-toolbar { flex-direction: column !important; align-items: stretch !important; }
          .mat-toolbar-filters { flex-wrap: wrap !important; }
        }
      `}</style>
      <div className="mat-mobile-cards" style={{ display: "none", flexDirection: "column", gap: 12 }}>
        {paginated.map((e) => (
          <div key={e.id} style={{ background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, padding: 16, opacity: e._pendingDelete ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{e.material || "\u2014"}</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{e.supplier || "\u2014"}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase", padding: "3px 8px",
                background: (e.status || "").toLowerCase() === "paid" ? `${T.success}15` : `${T.danger}15`,
                color: (e.status || "").toLowerCase() === "paid" ? T.success : T.danger,
              }}>{e.status || "\u2014"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textMuted, marginBottom: 8 }}>
              <span>#{e.num} {"\u00B7"} {e.date || "\u2014"}</span>
              <span>{e.qty ? `${e.qty} ${e.unit || ""} @ ${fmt(e.rate)}` : ""}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{fmt(e.total)}</span>
              {isAdmin && !e._pendingDelete && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => openEdit(e)} style={{ background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => del(e)} style={{ background: "transparent", border: `1px solid ${T.danger}40`, color: T.danger, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>Del</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {paginated.length === 0 && <div style={{ padding: 40, textAlign: "center", color: D.muted }}>No entries found</div>}
      </div>

      {/* Data Table (Desktop) */}
      <div className="mat-desktop" style={{ overflowX: "auto", background: T.card, borderRadius: 8, border: `1px solid ${D.outline}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.tableBg2, borderBottom: `1px solid ${D.outline}` }}>
              {[
                { label: "Date", col: "date" },
                { label: "Invoice #", col: "num" },
                { label: "Material Description", col: "material" },
                { label: "Supplier", col: "supplier" },
                { label: "Quantity", col: "qty", align: "right" },
                { label: "Unit Price", col: "rate", align: "right" },
                { label: "Total Amount", col: "total", align: "right" },
                { label: "Status", col: "status" },
                { label: "", col: null },
              ].map((h, i) => (
                <th key={i} onClick={() => h.col && toggleSort(h.col)} style={{ padding: "12px 20px", textAlign: h.align || "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.textMuted, fontWeight: 600, whiteSpace: "nowrap", cursor: h.col ? "pointer" : "default", userSelect: "none" }}>
                  {h.label}{h.col && <SortIndicator col={h.col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((e, i) => {
              const isPendingDelete = e._pendingDelete;
              return (
              <tr key={e.id} style={{
                background: isPendingDelete ? `${T.danger}10` : T.card,
                borderBottom: `1px solid ${D.outline}`,
                transition: "background 0.15s",
                cursor: isPendingDelete ? "not-allowed" : "pointer",
                opacity: isPendingDelete ? 0.6 : 1,
                textDecoration: isPendingDelete ? "line-through" : "none"
              }}
                onMouseEnter={ev => { if (!isPendingDelete) ev.currentTarget.style.background = T.tableBg2; }}
                onMouseLeave={ev => { if (!isPendingDelete) ev.currentTarget.style.background = T.card; }}>
                <td style={{ padding: "14px 20px", fontSize: 12, color: D.muted, fontFamily: "'Inter',sans-serif", fontWeight: 400, whiteSpace: "nowrap" }}>{e.date || "—"}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, fontFamily: "'Inter',sans-serif", color: D.white, whiteSpace: "nowrap" }}>#{e.num || "—"}</td>
                <td style={{ padding: "14px 20px", fontSize: 13, color: D.white, fontWeight: 500 }}>{e.material || "—"}{isPendingDelete && <span style={{ marginLeft: 8, fontSize: 10, color: T.danger, fontWeight: 600 }}>(Deleting...)</span>}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, color: D.muted, textTransform: "uppercase", letterSpacing: 0 }}>{e.supplier || "—"}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, color: D.muted, textAlign: "right", fontFamily: "'Inter',sans-serif" }}>{e.qty ? `${e.qty} ${e.unit || ""}` : "—"}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, color: D.muted, textAlign: "right", fontFamily: "'Inter',sans-serif" }}>{e.rate ? fmt(e.rate) : "—"}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, color: D.white, fontWeight: 600, textAlign: "right", fontFamily: "'Inter',sans-serif", whiteSpace: "nowrap" }}>{fmt(e.total)}</td>
                <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                  <span style={{
                    fontSize: 10, fontFamily: "'Inter',sans-serif", letterSpacing: 0, textTransform: "uppercase", fontWeight: 600, padding: "4px 8px", borderRadius: 4,
                    background: (e.status || "").toLowerCase() === "paid" ? `${T.success}15` : (e.status || "").toLowerCase() === "partial" ? `${T.warning}15` : `${T.danger}15`,
                    color: (e.status || "").toLowerCase() === "paid" ? T.success : (e.status || "").toLowerCase() === "partial" ? T.warning : T.danger,
                  }}>{e.status || "—"}</span>
                  {((e.status || "").toLowerCase() === "partial" || (e.status || "").toLowerCase() === "unpaid") && e.unpaid > 0 && (
                    <span style={{ fontSize: 10, color: T.danger, marginLeft: 8, fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>{fmt(e.unpaid)}</span>
                  )}
                </td>
                <td style={{ padding: "14px 20px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {isAdmin && !isPendingDelete && (
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button onClick={() => openEdit(e)} style={{ background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "4px 8px", fontSize: 10, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Inter',sans-serif", fontWeight: 500, borderRadius: 4 }}>Edit</button>
                      <button onClick={() => del(e)} style={{ background: "transparent", border: `1px solid ${T.danger}40`, color: T.danger, padding: "4px 8px", fontSize: 10, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Inter',sans-serif", fontWeight: 500, borderRadius: 4 }}>Del</button>
                    </div>
                  )}
                  {isPendingDelete && (
                    <span style={{ fontSize: 10, color: T.danger, fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>Deleting...</span>
                  )}
                </td>
              </tr>
              );
            })}
            {paginated.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 60, textAlign: "center", color: D.muted, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>No entries found</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: T.tableBg2, borderTop: `1px solid ${D.outline}` }}>
                <td colSpan={6} style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 11, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>Total</td>
                <td style={{ padding: "14px 20px", fontSize: 14, color: D.white, fontWeight: 700, textAlign: "right", fontFamily: "'Inter',sans-serif" }}>{fmt(filtered.reduce((s, e) => s + (e.total || 0), 0))}</td>
                <td style={{ padding: "14px 20px", fontSize: 12, color: T.danger, fontWeight: 600, textAlign: "right" }}>{fmt(filtered.reduce((s, e) => s + (e.unpaid || 0), 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filtered.length > pageSize && (
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}



      {isAdmin && <MaterialFormModal S={S} D={D} T={T} modal={modal} setModal={setModal} editId={editId} setEditId={setEditId} form={form} setForm={setForm} onSave={handleSave} entries={entries} />}
    </>
  );
}
