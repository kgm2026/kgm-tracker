import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbGet, dbInsert, dbPatch, dbDelete } from '../utils/api';
import { fmt, fmtDate, STATUS_COLORS } from '../utils/formatting';
import { Label, LoadingSpinner, Overlay, notify } from './Shared';
import MaterialFormModal from './MaterialFormModal';
import ImportCsvModal from './ImportCsvModal';
import Pagination from './Pagination';
import { emitDataChange } from '../utils/aiCacheInvalidation';
import { detectAnomalies } from '../utils/anomalyDetector';
import { getSignedFileUrl, getStorageFileName, deleteFile } from '../utils/storage';
import InvoiceScanner from './InvoiceScanner';
import NLEntryBar from './NLEntryBar';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const BLANK_MAT = {
  date: "", material: "", category: "grey", supplier: "", unit: "",
  qty: "", rate: "", total: "", unpaid: "0", status: "Paid", notes: "", invoice_file: null, invoice_url: null
};

const BLANK_BULK_EDIT = {
  material: "",
  supplier: "",
  category: "",
  status: "",
  notes: "",
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
  const [invoiceViewer, setInvoiceViewer] = useState(null); // { data, name }
  const [openingInvoiceId, setOpeningInvoiceId] = useState(null);
  const [scannedQueue, setScannedQueue] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState(BLANK_BULK_EDIT);
  const [bulkSaving, setBulkSaving] = useState(false);
  const filteredRef = useRef([]);

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
    const handler = (e) => {
      if (e.detail?.tab === "materials") {
        setForm(BLANK_MAT);
        setEditId(null);
        setModal(true);
      }
    };
    window.addEventListener("kgm-open-new-entry", handler);
    return () => window.removeEventListener("kgm-open-new-entry", handler);
  }, []);

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
      status: e.status || "Paid", notes: e.notes || "",
      invoice_file: null,
      invoice_url: e.invoice_url || null,
    });
    setEditId(e.id); setModal(true);
  }, []);

  const handleSave = async (data, currentEditId) => {
    if (currentEditId) {
      await dbPatch("material_purchases", currentEditId, data);
      const updated = { ...entries.find(e => e.id === currentEditId), ...data };
      setEntries(prev => prev.map(e => e.id === currentEditId ? updated : e));
      notify("Entry updated");
      emitDataChange();
      const alerts = detectAnomalies(updated, entries);
      if (alerts.length > 0) setAnomalies(alerts);
      return { keepOpen: false };
    }

    const num = entries.length > 0 ? Math.max(...entries.map(e => e.num || 0)) + 1 : 1;
    const row = await dbInsert("material_purchases", { num, ...data, project_id: projectId });
    setEntries(prev => [...prev, row]);
    notify("Entry added");
    emitDataChange();
    const alerts = detectAnomalies(row, entries);
    if (alerts.length > 0) setAnomalies(alerts);

    if (scannedQueue.length > 0) {
      const [nextItem, ...rest] = scannedQueue;
      setScannedQueue(rest);
      setForm(nextItem);
      setEditId(null);
      return { keepOpen: true };
    }

    return { keepOpen: false };
  };

  const PENDING_DELETIONS = useRef(new Map());

  const del = async (e) => {
    if (PENDING_DELETIONS.current.has(e.id)) return;
    setEntries(prev => prev.map(x => x.id === e.id ? { ...x, _pendingDelete: true } : x));
    const deletePromise = new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        try {
          await dbDelete("material_purchases", e.id);
          if (e.invoice_url) deleteFile(e.invoice_url).catch(() => {});
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
    const pendingDeletions = PENDING_DELETIONS.current;
    return () => {
      for (const { timeoutId } of pendingDeletions.values()) { clearTimeout(timeoutId); }
      pendingDeletions.clear();
    };
  }, []);

  const closeMaterialModal = useCallback(() => {
    setModal(false);
    setEditId(null);
    setForm(BLANK_MAT);
    setScannedQueue([]);
  }, []);

  const openInvoiceViewer = useCallback(async (entry) => {
    if (!entry?.invoice_url) return;
    setOpeningInvoiceId(entry.id);
    try {
      const signedUrl = await getSignedFileUrl(entry.invoice_url);
      setInvoiceViewer({
        data: signedUrl,
        name: entry.invoice_name || getStorageFileName(entry.invoice_url) || 'invoice',
      });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setOpeningInvoiceId(null);
    }
  }, []);

  const exportCSV = () => {
    const data = filteredRef.current;
    const headers = ["#", "Date", "Material", "Category", "Supplier", "Qty", "Unit", "Rate", "Total", "Unpaid", "Status", "Notes"];
    const rows = data.map(e => [e.num, e.date, e.material, e.category, e.supplier, e.qty, e.unit, e.rate, e.total, e.unpaid, e.status, e.notes]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `materials_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    notify("CSV exported");
  };

  const handleScannedItem = useCallback((scannedData) => {
    const items = (Array.isArray(scannedData) ? scannedData : [scannedData]).filter(Boolean);
    if (items.length === 0) return;
    const [firstItem, ...rest] = items;
    setScannedQueue(rest);
    setForm(firstItem);
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
    const sorted = [...list].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    filteredRef.current = sorted;
    return sorted;
  }, [entries, debouncedSearch, catFilter, stFilter, sortCol, sortDir]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const selectedEntries = useMemo(() => entries.filter(e => selectedIds.has(e.id)), [entries, selectedIds]);
  const selectablePageIds = useMemo(() => paginated.filter(e => !e._pendingDelete).map(e => e.id), [paginated]);
  const allPageSelected = selectablePageIds.length > 0 && selectablePageIds.every(id => selectedIds.has(id));

  useEffect(() => { setPage(1); }, [debouncedSearch, catFilter, stFilter, sortCol, sortDir]);

  useEffect(() => {
    setSelectedIds(prev => {
      const validIds = new Set(entries.map(e => e.id));
      const next = new Set([...prev].filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [entries]);

  const toggleSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePageSelected = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) selectablePageIds.forEach(id => next.delete(id));
      else selectablePageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const openBulkEdit = () => {
    if (selectedEntries.length === 0) return notify("Select entries to edit", "error");
    setBulkForm(BLANK_BULK_EDIT);
    setBulkModal(true);
  };

  const saveBulkEdit = async () => {
    const payload = {};
    ["material", "supplier", "category", "status", "notes"].forEach(key => {
      const value = String(bulkForm[key] || "").trim();
      if (value) payload[key] = value;
    });
    if (Object.keys(payload).length === 0) return notify("Enter at least one field to update", "error");

    setBulkSaving(true);
    try {
      await Promise.all(selectedEntries.map(entry => dbPatch("material_purchases", entry.id, payload)));
      setEntries(prev => prev.map(entry => selectedIds.has(entry.id) ? { ...entry, ...payload } : entry));
      setSelectedIds(new Set());
      setBulkModal(false);
      setBulkForm(BLANK_BULK_EDIT);
      notify(`${selectedEntries.length} entries updated`);
      emitDataChange();
    } catch (e) {
      notify(e.message, "error");
    }
    setBulkSaving(false);
  };

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
          {isAdmin && selectedEntries.length > 0 && (
            <button onClick={openBulkEdit} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 700, background: "transparent", border: `1px solid ${T.financial}`, color: T.financial, padding: "6px 12px", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6, borderRadius: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
              Edit {selectedEntries.length}
            </button>
          )}
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
              <span>#{e.num} {"\u00B7"} {fmtDate(e.date)}</span>
              <span>{e.qty ? `${e.qty} ${e.unit || ""} @ ${fmt(e.rate)}` : ""}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => toggleSelected(e.id)}
                    disabled={e._pendingDelete}
                    aria-label={`Select entry ${e.num || e.id}`}
                  />
                )}
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{fmt(e.total)}</span>
              </div>
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
              {isAdmin && (
                <th style={{ padding: "12px 12px", width: 42 }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePageSelected}
                    aria-label="Select all visible entries"
                    style={{ cursor: "pointer" }}
                  />
                </th>
              )}
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
            {paginated.map((e) => {
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
                  {isAdmin && (
                    <td style={{ padding: "14px 12px", width: 42 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={() => toggleSelected(e.id)}
                        disabled={isPendingDelete}
                        aria-label={`Select entry ${e.num || e.id}`}
                        style={{ cursor: isPendingDelete ? "not-allowed" : "pointer" }}
                      />
                    </td>
                  )}
                  <td style={{ padding: "14px 20px", fontSize: 12, color: D.muted, fontFamily: "'Inter',sans-serif", fontWeight: 400, whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
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
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                        {e.invoice_url && (
                          <button
                            onClick={async ev => { ev.stopPropagation(); await openInvoiceViewer(e); }}
                            title="View invoice"
                            disabled={openingInvoiceId === e.id}
                            style={{ background: "transparent", border: `1px solid ${T.financial}60`, color: T.financial, padding: "4px 7px", fontSize: 10, cursor: openingInvoiceId === e.id ? "default" : "pointer", transition: "all 0.15s", fontFamily: "'Inter',sans-serif", fontWeight: 500, borderRadius: 4, display: "flex", alignItems: "center", gap: 2, opacity: openingInvoiceId === e.id ? 0.6 : 1 }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{openingInvoiceId === e.id ? 'progress_activity' : 'receipt_long'}</span>
                          </button>
                        )}
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
              <tr><td colSpan={isAdmin ? 10 : 9} style={{ padding: 60, textAlign: "center", color: D.muted, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>No entries found</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: T.tableBg2, borderTop: `1px solid ${D.outline}` }}>
                <td colSpan={isAdmin ? 7 : 6} style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 11, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>Total</td>
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
      {isAdmin && <MaterialFormModal S={S} D={D} T={T} modal={modal} setModal={setModal} editId={editId} setEditId={setEditId} form={form} setForm={setForm} onSave={handleSave} onClose={closeMaterialModal} entries={entries} />}

      {bulkModal && (
        <Overlay onClose={() => setBulkModal(false)} title={`Bulk Edit ${selectedEntries.length} Entries`}>
          <p style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
            Fill only the fields you want to change. Blank fields will be left untouched.
          </p>
          <Label>Material Name</Label>
          <input style={S.inp} value={bulkForm.material} onChange={e => setBulkForm(f => ({ ...f, material: e.target.value }))} placeholder="e.g. Cement" />
          <Label>Supplier Name</Label>
          <input style={S.inp} value={bulkForm.supplier} onChange={e => setBulkForm(f => ({ ...f, supplier: e.target.value }))} placeholder="e.g. ABC Traders" />
          <Label>Category</Label>
          <select style={S.inp} value={bulkForm.category} onChange={e => setBulkForm(f => ({ ...f, category: e.target.value }))}>
            <option value="">Leave unchanged</option>
            <option value="grey">Grey</option>
            <option value="finishing">Finishing</option>
            <option value="misc">Miscellaneous</option>
          </select>
          <Label>Status</Label>
          <select style={S.inp} value={bulkForm.status} onChange={e => setBulkForm(f => ({ ...f, status: e.target.value }))}>
            <option value="">Leave unchanged</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
          </select>
          <Label>Notes</Label>
          <input style={S.inp} value={bulkForm.notes} onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))} placeholder="Replace notes for selected entries" />
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button style={{ ...S.btnGold, flex: 1, opacity: bulkSaving ? 0.6 : 1 }} onClick={saveBulkEdit} disabled={bulkSaving}>
              {bulkSaving ? "Saving..." : "Update Selected"}
            </button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => setBulkModal(false)}>Cancel</button>
          </div>
        </Overlay>
      )}

      {/* Invoice viewer overlay */}
      {invoiceViewer && (
        <div onClick={() => setInvoiceViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 8, padding: 16, maxWidth: 860, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: T.text }}>{invoiceViewer.name || 'Invoice'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={invoiceViewer.data} download={invoiceViewer.name || 'invoice'} style={{ background: T.financial, color: '#000', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span> Download
                </a>
                <button onClick={() => setInvoiceViewer(null)} style={{ background: 'transparent', border: `1px solid ${T.cardBorder}`, borderRadius: 4, padding: '5px 10px', cursor: 'pointer', color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>Close</button>
              </div>
            </div>
            {invoiceViewer.name?.endsWith('.pdf') ? (
              <iframe src={invoiceViewer.data} title="Invoice PDF" style={{ flex: 1, minHeight: 520, border: 'none', borderRadius: 4 }} />
            ) : (
              <img src={invoiceViewer.data} alt="Invoice" style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 80px)', objectFit: 'contain', borderRadius: 4 }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
