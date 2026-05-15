import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { fmt, parseDate } from '../utils/formatting';
import { LoadingSpinner } from './Shared';
import { exportLedgerPDF } from './LedgerPdfExport';
import { LedgerPane } from './LedgerPane';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

export default function Ledgers({ projectId, projectName }) {
  const { S, T } = useTheme();
  const [contractors, setContractors] = useState([]);
  const [payments, setPayments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [c, p, m] = await Promise.all([
      dbGet("contractors", `&project_id=eq.${projectId}`),
      dbGet("payment_log", `&project_id=eq.${projectId}&order=num.asc`),
      dbGet("material_purchases", `&project_id=eq.${projectId}&order=num.asc`)
    ]);
    setContractors(c);
    setPayments(p);
    setPurchases(m);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["contractors", "payment_log", "material_purchases"], fetchData);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "payment_log" || table === "contractors") fetchData();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  const supplierNames = useMemo(() => {
    const seen = new Set();
    return purchases
      .map(p => (p.supplier || "").trim())
      .filter(s => { if (!s) return false; const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort();
  }, [purchases]);

  const ledgerItems = useMemo(() => {
    const items = [];
    contractors.forEach((c) => {
      const paid = payments
        .filter(p => p.payment_type === "contractor" && p.contractor_id === c.contractor_id)
        .reduce((s, p) => s + (p.amount || 0), 0);
      items.push({
        id: `LDR-C-${c.id}`, type: "contractor", name: c.name,
        label: c.trade || "Contractor", value: paid,
        lastUpdated: c.start_date || "—", isContractor: true
      });
    });
    supplierNames.forEach((s) => {
      const key = s.trim().toLowerCase();
      const total = purchases.filter(p => (p.supplier || "").trim().toLowerCase() === key).reduce((sum, p) => sum + (p.total || 0), 0);
      const lastDate = purchases.filter(p => (p.supplier || "").trim().toLowerCase() === key).map(p => p.date).filter(Boolean).pop() || "—";
      items.push({
        id: `LDR-S-${s}`, type: "supplier", name: s,
        label: "Supplier", value: total, lastUpdated: lastDate, isSupplier: true
      });
    });
    return items;
  }, [contractors, supplierNames, purchases, payments]);

  const filteredLedgers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgerItems;
    return ledgerItems.filter(l => l.name.toLowerCase().includes(q) || l.label.toLowerCase().includes(q));
  }, [ledgerItems, search]);

  const getContractorLedger = useCallback((name) => {
    const c = contractors.find(x => x.name.toLowerCase() === name.toLowerCase());
    const cPays = payments.filter(p => p.payment_type === "contractor" && (p.contractor_name || "").toLowerCase() === name.toLowerCase()).sort((a, b) => parseDate(a.date) - parseDate(b.date));
    return { contractor: c, payments: cPays };
  }, [contractors, payments]);

  const getSupplierLedger = useCallback((name) => {
    const sp = purchases.filter(p => (p.supplier || "").toLowerCase() === name.toLowerCase()).sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const sy = payments.filter(p => p.payment_type === "supplier" && (p.supplier_name || "").toLowerCase() === name.toLowerCase()).sort((a, b) => parseDate(a.date) - parseDate(b.date));
    return { purchases: sp, payments: sy };
  }, [purchases, payments]);

  const handleExportPDF = () => exportLedgerPDF({ selected, projectName, getContractorLedger, getSupplierLedger });

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card,
    surfaceHigh: T.cardBorder, surfaceHighest: T.cardBorder,
    outline: T.cardBorder, white: T.text, gold: T.financial,
    green: T.success, muted: T.textMuted, error: T.danger,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 80px)", overflow: "hidden", background: T.bodyBg }}>
      {/* Left Pane */}
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${D.outline}`, display: "flex", flexDirection: "column", background: T.card }}>
        <div style={{ padding: 24, borderBottom: `1px solid ${D.outline}` }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span className="material-symbols-outlined" style={{ color: D.muted, fontSize: 18, marginRight: 8 }}>search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Ledgers..." style={{ width: "100%", background: "transparent", border: "none", fontFamily: "'Inter',sans-serif", fontSize: 13, color: T.text, outline: "none", padding: "4px 0" }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredLedgers.map((l) => {
            const isActive = selected?.name === l.name && selected?.type === l.type;
            return (
              <div key={l.id} onClick={() => setSelected({ type: l.type, name: l.name })}
                style={{ padding: "20px 24px", borderBottom: `1px solid ${D.outline}`, cursor: "pointer", background: isActive ? T.navActiveBg : "transparent", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.tableBg2; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 0.5, fontWeight: 600, textTransform: "uppercase", color: D.muted }}>{l.id}</span>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.financial }} />}
                </div>
                <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: isActive ? T.financial : T.text, margin: "0 0 4px" }}>{l.name}</h3>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: D.muted, margin: "0 0 12px" }}>Updated: {l.lastUpdated}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 700, color: T.text }}>{fmt(l.value)}</span>
                  <span style={{ fontSize: 14, color: D.muted, opacity: isActive ? 1 : 0, transition: "opacity 0.15s" }}>&#8250;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Pane */}
      <div style={{ flex: 1, overflowY: "auto", padding: 48, background: T.bodyBg }}>
        <LedgerPane selected={selected} T={T} D={D} getContractorLedger={getContractorLedger} getSupplierLedger={getSupplierLedger} exportLedgerPDF={handleExportPDF} />
      </div>
    </div>
  );
}
