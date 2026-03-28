import { useState, useEffect, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { fmt, fmtPlain } from '../utils/formatting';
import { LoadingSpinner, notify } from './Shared';
import { addKgmFooter, formatPKDate, formatDateStrForFilename, safeFilenamePart } from '../utils/pdfUtils';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

export default function SupplierBalances({ projectId }) {
  const { S, T } = useTheme();
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [m, p] = await Promise.all([
      dbGet("material_purchases", `&project_id=eq.${projectId}`),
      dbGet("payment_log", `&project_id=eq.${projectId}&payment_type=eq.supplier`)
    ]);
    setPurchases(m);
    setPayments(p);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["material_purchases", "payment_log"], fetchData);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "payment_log") fetchData();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  const suppliers = useMemo(() => {
    const map = {};
    for (const p of purchases) {
      const rawName = (p.supplier || "—").trim();
      const key = rawName.toLowerCase();
      
      if (!map[key]) map[key] = { name: rawName, total: 0, unpaid: 0, items: 0 };
      
      // If we find a "nicer" version of the name (e.g. "Ch Zaheer" vs "ch zaheer"), keep the nicer one
      if (rawName.length > map[key].name.length || (rawName !== map[key].name && rawName[0] === rawName[0].toUpperCase())) {
          map[key].name = rawName;
      }

      map[key].total += p.total || 0;
      map[key].unpaid += p.unpaid || 0;
      map[key].items++;
    }
    return Object.values(map).filter(s => s.name !== "—" || s.total > 0).sort((a, b) => b.unpaid - a.unpaid);
  }, [purchases]);

  const totals = useMemo(() => ({
    grandTotal: suppliers.reduce((s, x) => s + x.total, 0),
    grandPaid: suppliers.reduce((s, x) => s + (x.total - x.unpaid), 0),
    grandRemaining: suppliers.reduce((s, x) => s + x.unpaid, 0),
  }), [suppliers]);

  const exportSupplierPDF = (supplierName) => {
    const suppPurchases = purchases.filter(p => (p.supplier || "").trim().toLowerCase() === supplierName.toLowerCase());
    const suppPayments = payments.filter(p => (p.supplier_name || p.contractor_name || "").trim().toLowerCase() === supplierName.toLowerCase());
    if (suppPurchases.length === 0) { notify("No data to export", "error"); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const dateStr = formatPKDate();
    const black = [0, 0, 0], white = [255, 255, 255], gray = [245, 245, 245], red = [220, 53, 69], green = [40, 167, 69];
    doc.setFillColor(...black); doc.rect(0, 0, W, 22, "F");
    doc.setFillColor(...white); doc.rect(0, 22, W, 1, "F");
    doc.setTextColor(...white); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("KGM Constructions", 10, 10);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Supplier Statement", 10, 17);
    doc.setTextColor(180, 180, 180);
    doc.text(dateStr, W - 10, 10, { align: "right" });
    doc.text(supplierName, W - 10, 17, { align: "right" });
    const totalBill = suppPurchases.reduce((s, p) => s + (p.total || 0), 0);
    const totalUnpaid = suppPurchases.reduce((s, p) => s + (p.unpaid || 0), 0);
    const totalPaid = totalBill - totalUnpaid;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`Supplier: ${supplierName}`, 10, 32);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Total Billed: ${fmtPlain(totalBill)}  |  Total Paid: ${fmtPlain(totalPaid)}  |  Balance Due: ${fmtPlain(totalUnpaid)}`, 10, 38);
    autoTable(doc, {
      startY: 44, head: [["#", "Date", "Material", "Category", "Qty", "Rate", "Total", "Unpaid", "Status"]],
      body: suppPurchases.map(p => [p.num || "", p.date || "", p.material || "", (p.category || "").toUpperCase(), p.qty ? `${p.qty} ${p.unit || ""}` : "—", p.rate ? fmtPlain(p.rate) : "—", fmtPlain(p.total || 0), p.unpaid ? fmtPlain(p.unpaid) : "—", p.status || "Paid"]),
      foot: [["", "", "", "", "", "TOTAL", fmtPlain(totalBill), fmtPlain(totalUnpaid), ""]],
      styles: { fontSize: 8, cellPadding: 3, font: "helvetica" }, headStyles: { fillColor: black, textColor: white, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: black, textColor: white, fontStyle: "bold" }, alternateRowStyles: { fillColor: gray },
      columnStyles: { 6: { halign: "right", fontStyle: "bold" }, 7: { halign: "right", textColor: red } }, margin: { left: 10, right: 10 }
    });
    if (suppPayments.length > 0) {
      const totalPayments = suppPayments.reduce((s, p) => s + (p.amount || 0), 0);
      doc.addPage();
      doc.setFillColor(...black); doc.rect(0, 0, W, 18, "F");
      doc.setTextColor(...white); doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(`Payment History — ${supplierName}`, 10, 11);
      doc.setTextColor(180, 180, 180); doc.setFontSize(8);
      doc.text(dateStr, W - 10, 11, { align: "right" });
      autoTable(doc, {
        startY: 24, head: [["#", "Date", "Amount", "Method", "Reference", "Remarks"]],
        body: suppPayments.map(p => [p.num || "", p.date || "", fmtPlain(p.amount || 0), p.method || "", p.reference || "—", p.remarks || "—"]),
        foot: [["", "TOTAL PAID", fmtPlain(totalPayments), "", "", ""]],
        styles: { fontSize: 8, cellPadding: 3, font: "helvetica" }, headStyles: { fillColor: black, textColor: white, fontStyle: "bold", fontSize: 7.5 },
        footStyles: { fillColor: green, textColor: white, fontStyle: "bold" }, alternateRowStyles: { fillColor: gray },
        columnStyles: { 2: { halign: "right", textColor: green, fontStyle: "bold" } }, margin: { left: 10, right: 10 }
      });
    }
    addKgmFooter(doc, {
      leftText: `KGM Constructions · ${supplierName} · Generated ${dateStr}`,
      pageBarHeight: 6,
      barColor: black,
      textColor: [150, 150, 150],
      fontSize: 7,
    });

    doc.save(`KGM_${safeFilenamePart(supplierName, { separator: "_" })}_${formatDateStrForFilename(dateStr)}.pdf`);
    notify("Statement exported");
  };

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card, 
    surfaceHigh: T.card, surfaceHighest: T.cardBorder,
    outline: T.cardBorder, white: T.text, gold: T.financial,
    green: T.success, muted: T.textMuted, error: T.danger,
  };

  if (loading) return <LoadingSpinner />;

  // Dynamic text color for the Gold Card based on theme mode
  // goldCardTextColor removed — card now always uses white text on blue background

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <style>{`.blueprint-grid { display: none; }`}</style>

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${D.outline}`, paddingBottom: 24, marginBottom: 32 }}>
        <div>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>Financial Oversight</span>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: D.white, margin: "8px 0 0" }}>Supplier Balances</h3>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, display: "block", fontWeight: 600 }}>Total Outstanding</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 32, fontWeight: 700, color: D.white, letterSpacing: -1 }}>{fmt(totals.grandRemaining)}</span>
        </div>
      </div>

      {/* Main Table Matrix */}
      {suppliers.length === 0 ? (
        <div style={{ textAlign: "center", color: D.muted, padding: 80, fontFamily: "'Inter',sans-serif", fontSize: 13, background: T.card, borderRadius: 8, border: `1px solid ${T.cardBorder}` }}>No supplier data yet</div>
      ) : (
        <div style={{ background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1)" }}>
          {/* Header Row */}
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr 2fr 2fr 2fr 1fr", background: T.tableBg2, borderBottom: `1px solid ${D.outline}`, padding: "14px 24px" }}>
            {["Supplier / Vendor", "Total Invoiced", "Total Paid", "Current Balance", "Payment Progress", "Status"].map((h, i) => (
              <span key={i} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.textMuted, fontWeight: 600 }}>{h}</span>
            ))}
          </div>

          {/* Supplier Rows */}
          {suppliers.map((s) => {
            const paid = s.total - s.unpaid;
            const pct = s.total > 0 ? Math.min(100, Math.round((paid / s.total) * 100)) : 0;
            const isExpanded = expanded === s.name;
            const statusLabel = pct >= 100 ? "PAID" : pct > 50 ? "DUE SOON" : pct > 0 ? "OVERDUE" : "UNPAID";
            const statusColor = pct >= 100 ? T.success : pct > 50 ? T.warning : T.danger;
            const statusBg = pct >= 100 ? `${T.success}15` : pct > 50 ? `${T.warning}15` : `${T.danger}15`;
            const barColor = pct >= 100 ? T.success : pct > 50 ? T.warning : T.danger;

            const suppPurchases = purchases.filter(p => (p.supplier || "").trim().toLowerCase() === s.name.toLowerCase()).slice(0, 5);
            const suppPayments = payments.filter(p => (p.supplier_name || "").trim().toLowerCase() === s.name.toLowerCase()).slice(0, 5);

            return (
              <div key={s.name}>
                <div onClick={() => setExpanded(isExpanded ? null : s.name)}
                  style={{ display: "grid", gridTemplateColumns: "3fr 2fr 2fr 2fr 2fr 1fr", padding: "20px 24px", alignItems: "center", borderBottom: `1px solid ${D.outline}`, cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 16, color: D.muted, transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>▸</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: D.white }}>{s.name}</span>
                  </div>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>{fmt(s.total)}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>{fmt(paid)}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: D.white }}>{fmt(s.unpaid)}</span>
                  <div style={{ paddingRight: 32 }}>
                    <div style={{ width: "100%", height: 6, background: T.bodyBg, borderRadius: 3 }}>
                      <div style={{ height: "100%", background: barColor, width: `${pct}%`, transition: "width 0.4s", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, color: D.muted, marginTop: 6, display: "block" }}>{pct}% PAID</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 4, color: statusColor, background: statusBg }}>{statusLabel}</span>
                  </div>
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                  <div style={{ background: T.bodyBg, borderBottom: `1px solid ${D.outline}`, padding: "24px 48px", borderTop: `1px solid ${D.outline}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <h4 style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: D.white, margin: 0, letterSpacing: 0.5 }}>Recent Transactions: {s.name}</h4>
                      <button onClick={() => exportSupplierPDF(s.name)} style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, background: T.card, border: `1px solid ${D.outline}`, color: D.white, padding: "8px 16px", borderRadius: 6, cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.financial; e.currentTarget.style.color = T.financial; }} onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.color = D.white; }}>Export Statement (PDF)</button>
                    </div>

                    {/* Purchases */}
                    {suppPurchases.length > 0 && (
                      <div style={{ marginBottom: 24, background: T.card, borderRadius: 8, border: `1px solid ${T.cardBorder}`, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: D.muted, background: T.tableBg2, padding: "10px 16px", borderBottom: `1px solid ${D.outline}` }}>
                          <span>DATE</span><span>REFERENCE</span><span>DESCRIPTION</span><span style={{ textAlign: "right" }}>AMOUNT</span>
                        </div>
                        {suppPurchases.map((p, j) => (
                          <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr", fontFamily: "'Inter',sans-serif", fontSize: 13, padding: "12px 16px", borderBottom: j === suppPurchases.length - 1 ? "none" : `1px solid ${D.outline}` }}>
                            <span style={{ color: D.muted }}>{p.date || "—"}</span>
                            <span style={{ color: T.text }}>#{p.num || "—"}</span>
                            <span style={{ color: T.text }}>{p.material || "—"}</span>
                            <span style={{ textAlign: "right", fontWeight: 600, color: T.text }}>{fmt(p.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payments */}
                    {suppPayments.length > 0 && (
                      <div style={{ background: T.card, borderRadius: 8, border: `1px solid ${T.cardBorder}`, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: D.muted, background: T.tableBg2, padding: "10px 16px", borderBottom: `1px solid ${D.outline}` }}>
                          <span>DATE</span><span>REFERENCE</span><span>METHOD</span><span style={{ textAlign: "right" }}>AMOUNT</span>
                        </div>
                        {suppPayments.map((p, j) => (
                          <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", fontFamily: "'Inter',sans-serif", fontSize: 13, padding: "12px 16px", borderBottom: j === suppPayments.length - 1 ? "none" : `1px solid ${D.outline}` }}>
                            <span style={{ color: D.muted }}>{p.date || "—"}</span>
                            <span style={{ color: T.text }}>{p.reference || "—"}</span>
                            <span style={{ color: D.muted }}>{p.method || "—"}</span>
                            <span style={{ textAlign: "right", fontWeight: 600, color: T.success }}>-{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Secondary Metric Bento Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginTop: 48 }}>
        {/* Aging Distribution */}
        <div style={{ background: T.card, padding: 24, border: `1px solid ${D.outline}`, borderRadius: 8, boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1)" }}>
          <h5 style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 20 }}>Aging Distribution</h5>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { label: "0-30 Days", value: totals.grandPaid, pct: 70, color: T.success },
              { label: "31-60 Days", value: Math.round(totals.grandRemaining * 0.6), pct: 25, color: T.warning },
              { label: "60+ Days", value: Math.round(totals.grandRemaining * 0.4), pct: 10, color: T.danger },
            ].map((a, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Inter',sans-serif", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: D.muted, fontWeight: 500 }}>{a.label}</span>
                  <span style={{ color: T.text, fontWeight: 600 }}>{fmt(a.value)}</span>
                </div>
                <div style={{ width: "100%", height: 6, background: T.bodyBg, borderRadius: 3 }}>
                  <div style={{ height: "100%", background: a.color, width: `${a.pct}%`, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Utilization */}
        <div style={{ background: T.card, padding: 24, border: `1px solid ${D.outline}`, borderRadius: 8, boxShadow: "0 1px 3px 0 rgba(0,0,0,0.1)" }}>
          <h5 style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 20 }}>Credit Utilization</h5>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 8 }}>
            <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                <circle cx="50" cy="50" r="44" fill="transparent" stroke={T.bodyBg} strokeWidth="8" />
                <circle cx="50" cy="50" r="44" fill="transparent" stroke={T.financial} strokeWidth="8" strokeDasharray="276" strokeDashoffset="69" strokeLinecap="round" />
              </svg>
              <span style={{ position: "absolute", fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 700, color: T.text }}>75%</span>
            </div>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted, display: "block" }}>Total Outstanding</span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: T.text }}>{fmt(totals.grandRemaining)}</span>
            </div>
          </div>
        </div>

        {/* Cash Required */}
        <div style={{ background: T.financial, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", borderRadius: 8, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}>
          <div>
            <h5 style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: "white", marginBottom: 8, opacity: 0.9 }}>Cash Required</h5>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 32, fontWeight: 700, color: "white", letterSpacing: -1 }}>{fmt(totals.grandRemaining)}</span>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: "white", opacity: 0.8, marginTop: 8, lineHeight: 1.4 }}>Total outstanding balance that needs to be cleared across all suppliers.</p>
          </div>
          <button style={{ background: "white", border: "none", color: T.financial, padding: "10px 16px", borderRadius: 6, fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 16, transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>Update Forecast</button>
        </div>
      </div>
    </div>
  );
}
