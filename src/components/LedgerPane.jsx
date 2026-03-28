import { fmt } from '../utils/formatting';

export function LedgerPane({ selected, T, D, getContractorLedger, getSupplierLedger, exportLedgerPDF }) {
  if (!selected) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 80 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16, color: D.outline, opacity: 0.5 }}></div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>Select a ledger from the list</div>
        </div>
      </div>
    );
  }

  if (selected.type === "contractor") {
    const { contractor: c, payments: cPays } = getContractorLedger(selected.name);
    const totalPaid = cPays.reduce((s, p) => s + (p.amount || 0), 0);
    const totalDebit = c?.contract_value || 0;
    const totalCredit = totalPaid;
    const utilization = totalDebit > 0 ? Math.round((totalCredit / totalDebit) * 100) : 0;

    return (
      <div style={{ animation: "fadeUp 0.3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48 }}>
          <div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: D.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              Ledgers <span style={{ fontSize: 14 }}>&#8250;</span> {selected.name}
            </div>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 700, color: D.white, letterSpacing: -0.5, margin: 0 }}>Transaction Registry</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportLedgerPDF} style={{ background: T.card, border: `1px solid ${D.outline}`, color: T.text, padding: "8px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.financial; e.currentTarget.style.color = T.financial; }} onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.color = T.text; }}>Export PDF</button>
          </div>
        </div>

        <div style={{ border: `1px solid ${D.outline}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${D.outline}`, background: T.tableBg2 }}>
              {["Ref ID", "Date", "Amount", "Method", "Reference", "Remarks"].map((h, i) => (
                <th key={i} style={{ padding: "12px 20px", textAlign: i === 2 ? "right" : "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {cPays.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${D.outline}`, transition: "background 0.15s", background: T.card }}
                  onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                  onMouseLeave={e => e.currentTarget.style.background = T.card}>
                  <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text }}>#{p.num || "—"}</td>
                  <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>{p.date || "—"}</td>
                  <td style={{ padding: "14px 20px", textAlign: "right", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, color: T.success }}>{fmt(p.amount)}</td>
                  <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text, textTransform: "uppercase" }}>{p.method || "—"}</td>
                  <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{p.reference || "—"}</td>
                  <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{p.remarks || "—"}</td>
                </tr>
              ))}
              {cPays.length === 0 && <tr><td colSpan={6} style={{ padding: 60, textAlign: "center", fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>No transactions recorded</td></tr>}
            </tbody>
          </table>
        </div>

        <SummaryBento totalDebit={totalDebit} totalCredit={totalCredit} utilization={utilization} cap={totalDebit} T={T} D={D} />
      </div>
    );
  }

  // Supplier ledger
  const { purchases: sp, payments: sy } = getSupplierLedger(selected.name);
  const totalBill = sp.reduce((s, p) => s + (p.total || 0), 0);
  const totalCredit = sp.reduce((s, p) => s + (p.unpaid || 0), 0);
  const totalPaidAmt = sy.reduce((s, p) => s + (p.amount || 0), 0);
  const utilization = totalBill > 0 ? Math.round((totalPaidAmt / totalBill) * 100) : 0;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48 }}>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: D.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            Ledgers <span style={{ fontSize: 14 }}>&#8250;</span> {selected.name}
          </div>
          <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 700, color: D.white, letterSpacing: -0.5, margin: 0 }}>Transaction Registry</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportLedgerPDF} style={{ background: T.card, border: `1px solid ${D.outline}`, color: T.text, padding: "8px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }} onMouseEnter={e => { e.currentTarget.style.borderColor = T.financial; e.currentTarget.style.color = T.financial; }} onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.color = T.text; }}>Export PDF</button>
        </div>
      </div>

      {/* Purchases */}
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: T.text, marginBottom: 16, letterSpacing: 0.5 }}>Material Purchases</div>
      <div style={{ border: `1px solid ${D.outline}`, marginBottom: 32, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${D.outline}`, background: T.tableBg2 }}>
            {["Ref ID", "Description", "Vendor", "Date", "Credit", "Debit"].map((h, i) => (
              <th key={i} style={{ padding: "12px 20px", textAlign: i >= 4 ? "right" : "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {sp.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: `1px solid ${D.outline}`, transition: "background 0.15s", background: T.card }}
                onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                onMouseLeave={e => e.currentTarget.style.background = T.card}>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text }}>#{p.num || "—"}</td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>{p.material || "—"}</td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted, textTransform: "uppercase" }}>{p.supplier || "—"}</td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{p.date || "—"}</td>
                <td style={{ padding: "14px 20px", textAlign: "right", fontFamily: "'Inter',sans-serif", fontSize: 13, color: T.financial }}>{p.unpaid ? fmt(p.unpaid) : "—"}</td>
                <td style={{ padding: "14px 20px", textAlign: "right", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, color: T.text }}>{fmt(p.total)}</td>
              </tr>
            ))}
            {sp.length === 0 && <tr><td colSpan={6} style={{ padding: 60, textAlign: "center", fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>No transactions</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Payments */}
      {sy.length > 0 && (
        <>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: T.success, marginBottom: 16, letterSpacing: 0.5 }}>Payments Made</div>
          <div style={{ border: `1px solid ${D.outline}`, marginBottom: 32, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${D.outline}`, background: T.tableBg2 }}>
                {["Ref ID", "Date", "Amount", "Method", "Reference"].map((h, i) => (
                  <th key={i} style={{ padding: "12px 20px", textAlign: i === 2 ? "right" : "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sy.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${D.outline}`, transition: "background 0.15s", background: T.card }}
                    onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                    onMouseLeave={e => e.currentTarget.style.background = T.card}>
                    <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text }}>#{p.num || "—"}</td>
                    <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{p.date || "—"}</td>
                    <td style={{ padding: "14px 20px", textAlign: "right", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700, color: T.success }}>{fmt(p.amount)}</td>
                    <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted, textTransform: "uppercase" }}>{p.method || "—"}</td>
                    <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{p.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SummaryBento totalDebit={totalBill} totalCredit={totalCredit} utilization={utilization} cap={totalBill} T={T} D={D} label="Recovery" />
    </div>
  );
}

function SummaryBento({ totalDebit, totalCredit, utilization, cap, T, D, label = "Utilization" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 16 }}>
      <div style={{ padding: 24, background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: D.muted, display: "block", marginBottom: 8 }}>Total Debits</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.5 }}>{fmt(totalDebit)}</span>
      </div>
      <div style={{ padding: 24, background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: D.muted, display: "block", marginBottom: 8 }}>Total Credits</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 24, fontWeight: 700, color: T.financial, letterSpacing: -0.5 }}>{fmt(totalCredit)}</span>
      </div>
      <div style={{ padding: 24, background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: T.text, display: "block", marginBottom: 16 }}>Net Flow Status</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", background: `${T.financial}15`, color: T.financial, padding: "4px 10px", borderRadius: 4 }}>{utilization < 90 ? "Within Estimates" : "Near Cap"}</span>
        </div>
        <div style={{ height: 6, background: T.bodyBg, marginTop: 8, borderRadius: 3 }}>
          <div style={{ height: "100%", background: T.financial, width: `${Math.min(utilization, 100)}%`, borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontFamily: "'Inter',sans-serif", fontSize: 11, color: D.muted }}>
          <span>{label}: {utilization}%</span>
          <span>Total: {fmt(cap)}</span>
        </div>
      </div>
    </div>
  );
}
