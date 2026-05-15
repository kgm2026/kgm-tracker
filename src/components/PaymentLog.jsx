import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbGet, dbInsert, dbPatch, dbDelete } from '../utils/api';
import { fmt, toInt } from '../utils/formatting';
import { Overlay, Label, LoadingSpinner, notify } from './Shared';
import { invalidateTable } from '../utils/cache';
import Pagination from './Pagination';
import { emitDataChange } from '../utils/aiCacheInvalidation';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const BLANK_P = {
  date: "", payment_type: "supplier", contractor_id: "", contractor_name: "",
  supplier_name: "", amount: "", method: "Cash", reference: "", remarks: ""
};

const excessPaymentNote = (paymentId) => `Auto-added supplier overpayment from payment_log:${paymentId}`;

export default function PaymentLog({ projectId }) {
  const { S, T } = useTheme();
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK_P);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [l, c, m] = await Promise.all([
      dbGet("payment_log", `&project_id=eq.${projectId}&order=num.asc`),
      dbGet("contractors", `&project_id=eq.${projectId}`),
      dbGet("material_purchases", `&project_id=eq.${projectId}&select=supplier`)
    ]);
    setLogs(l);
    setContractors(c);
    const supplierMap = {};
    m.forEach(x => {
      const raw = (x.supplier || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!supplierMap[key] || raw.length > supplierMap[key].length || (raw !== supplierMap[key] && raw[0] === raw[0].toUpperCase())) {
        supplierMap[key] = raw;
      }
    });
    setSuppliers(Object.values(supplierMap).sort());
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["payment_log", "contractors", "material_purchases"], fetchData);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "payment_log" || table === "contractors" || table === "material_purchases") fetchData();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tab === "payments") {
        setForm(BLANK_P);
        setModal(true);
      }
    };
    window.addEventListener("kgm-open-new-entry", handler);
    return () => window.removeEventListener("kgm-open-new-entry", handler);
  }, []);

  const save = async () => {
    if (!form.date || !form.amount) return notify("Date and amount required", "error");
    if (form.payment_type === "supplier" && !form.supplier_name.trim()) return notify("Supplier name required", "error");
    if (form.payment_type === "contractor" && !form.contractor_id) return notify("Please select a contractor", "error");
    setSaving(true);
    try {
      const num = logs.length > 0 ? Math.max(...logs.map(l => l.num || 0)) + 1 : 1;
      const data = {
        num, date: form.date,
        contractor_id: form.payment_type === "contractor" ? form.contractor_id : null,
        contractor_name: form.payment_type === "contractor" ? form.contractor_name : form.supplier_name,
        supplier_name: form.payment_type === "supplier" ? form.supplier_name : null,
        payment_type: form.payment_type, amount: toInt(form.amount, 0),
        retention_amount: form.payment_type === "contractor" ? toInt(form.retention_amount || 0, 0) : 0,
        method: form.method, reference: form.reference, remarks: form.remarks, project_id: projectId
      };
      const row = await dbInsert("payment_log", data);
      setLogs(prev => [...prev, row]);

      if (form.payment_type === "supplier") {
        const allUnpaid = await dbGet("material_purchases", `&project_id=eq.${projectId}&unpaid=gt.0&order=num.asc`);
        const supplierLower = form.supplier_name.trim().toLowerCase();
        const unpaidEntries = allUnpaid.filter(e => (e.supplier || "").trim().toLowerCase() === supplierLower);
        let remaining = toInt(form.amount, 0);
        const updates = [];
        for (const entry of unpaidEntries) {
          if (remaining <= 0) break;
          const eu = entry.unpaid || 0;
          if (remaining >= eu) {
            updates.push({ id: entry.id, data: { unpaid: 0, status: "Paid" } });
            remaining -= eu;
          } else {
            const nu = eu - remaining;
            updates.push({ id: entry.id, data: { unpaid: nu, status: "Partial" } });
            remaining = 0;
          }
        }
        await Promise.all(updates.map(u => dbPatch("material_purchases", u.id, u.data)));
        if (remaining > 0) {
          const latestMaterialRows = await dbGet("material_purchases", `&project_id=eq.${projectId}&order=num.desc&limit=1`);
          const nextMaterialNum = latestMaterialRows.length > 0 ? (latestMaterialRows[0].num || 0) + 1 : 1;
          await dbInsert("material_purchases", {
            num: nextMaterialNum,
            date: form.date,
            material: "Supplier overpayment / advance",
            category: "misc",
            supplier: form.supplier_name,
            qty: 1,
            unit: "adjustment",
            rate: remaining,
            total: remaining,
            unpaid: 0,
            status: "Paid",
            notes: excessPaymentNote(row.id),
            project_id: projectId,
          });
          notify(`PKR ${remaining.toLocaleString()} exceeds total unpaid for ${form.supplier_name} and was added to project cost.`);
        }
      } else if (form.payment_type === "contractor" && form.contractor_id) {
        const c = contractors.find(x => x.contractor_id === form.contractor_id);
        if (c) {
          const newPaid = (c.amount_paid || 0) + toInt(form.amount, 0);
          const newDue = Math.max(0, (c.contract_value || 0) - newPaid);
          const newStatus = newDue <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
          await dbPatch("contractors", c.id, { amount_paid: newPaid, amount_due: newDue, payment_status: newStatus });
        }
      }
      setModal(false);
      setForm(BLANK_P);
      notify("Payment logged");
      if (form.payment_type === "supplier") {
        invalidateTable("material_purchases");
      } else if (form.payment_type === "contractor") {
        invalidateTable("contractors");
      }
      invalidateTable("payment_log");
      emitDataChange();
    } catch (e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const del = async (l) => {
    setLogs(prev => prev.filter(x => x.id !== l.id));
    const timeout = setTimeout(async () => {
      try {
        await dbDelete("payment_log", l.id);
        // Reverse auto-balanced side-effects
        if (l.payment_type === "supplier" && l.supplier_name) {
          const supplierLower = l.supplier_name.trim().toLowerCase();
          const allEntries = await dbGet("material_purchases", `&project_id=eq.${projectId}&order=num.asc`);
          const excessEntries = allEntries.filter(e => e.notes === excessPaymentNote(l.id));
          const excessTotal = excessEntries.reduce((sum, e) => sum + (Number(e.total) || 0), 0);
          if (excessEntries.length > 0) {
            await Promise.all(excessEntries.map(e => dbDelete("material_purchases", e.id)));
          }
          const supplierEntries = allEntries.filter(e => (e.supplier || "").trim().toLowerCase() === supplierLower && e.notes !== excessPaymentNote(l.id));
          let remaining = Math.max(0, (l.amount || 0) - excessTotal);
          const updates = [];
          // Walk entries in reverse order (newest first) to undo the FIFO application
          for (const entry of [...supplierEntries].reverse()) {
            if (remaining <= 0) break;
            const currentUnpaid = entry.unpaid || 0;
            const originalTotal = entry.total || 0;
            const maxRestore = originalTotal - currentUnpaid;
            if (maxRestore <= 0) continue;
            const restore = Math.min(remaining, maxRestore);
            const newUnpaid = currentUnpaid + restore;
            const newStatus = newUnpaid >= originalTotal ? "Unpaid" : newUnpaid > 0 ? "Partial" : "Paid";
            updates.push({ id: entry.id, data: { unpaid: newUnpaid, status: newStatus } });
            remaining -= restore;
          }
          if (updates.length > 0) {
            await Promise.all(updates.map(u => dbPatch("material_purchases", u.id, u.data)));
            invalidateTable("material_purchases");
          }
        } else if (l.payment_type === "contractor" && l.contractor_id) {
          const c = contractors.find(x => x.contractor_id === l.contractor_id);
          if (c) {
            const newPaid = Math.max(0, (c.amount_paid || 0) - (l.amount || 0));
            const newDue = Math.max(0, (c.contract_value || 0) - newPaid);
            const newStatus = newDue <= 0 ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";
            await dbPatch("contractors", c.id, { amount_paid: newPaid, amount_due: newDue, payment_status: newStatus });
            invalidateTable("contractors");
          }
        }
      } catch (err) {
        setLogs(prev => [...prev, l].sort((a, b) => (a.num || 0) - (b.num || 0)));
        notify(`Failed to delete payment: ${err.message}`, "error");
      }
    }, 4000);
    const onUndo = () => {
      clearTimeout(timeout);
      setLogs(prev => [...prev, l].sort((a, b) => (a.num || 0) - (b.num || 0)));
    };
    notify("Payment deleted", "undo", onUndo);
  };

  const totalPaid = logs.reduce((s, l) => s + (l.amount || 0), 0);
  const filtered = logs.filter(l => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (l.supplier_name || l.contractor_name || "").toLowerCase().includes(q) || (l.reference || "").toLowerCase().includes(q) || String(l.num || "").includes(q);
  });

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card,
    surfaceHigh: T.cardBorder, outline: T.cardBorder, white: T.text,
    gold: T.financial, green: T.success, blue: T.financial,
    muted: T.textMuted, error: T.danger,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ animation: "fadeUp 0.4s ease", padding: "32px 48px" }}>
      <style>{`.blueprint-grid { display: none; }`}</style>

      {/* Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: `1px solid ${D.outline}`, marginBottom: 32, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
        {[
          { label: "Total Disbursed", value: fmt(totalPaid), color: T.financial },
          { label: "Total Payments", value: logs.length, color: T.text },
          { label: "Contractors Paid", value: logs.filter(l => l.payment_type === "contractor").length, color: T.text },
          { label: "Suppliers Paid", value: logs.filter(l => l.payment_type === "supplier").length, color: T.success },
        ].map((s, i) => (
          <div key={i} style={{ padding: 24, borderRight: i < 3 ? `1px solid ${D.outline}` : "none", background: T.card }}>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, margin: 0, fontWeight: 600 }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: s.color, marginTop: 8, fontFamily: "'Inter',sans-serif", letterSpacing: -0.5 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, background: T.card, padding: 16, borderRadius: 8, border: `1px solid ${D.outline}`, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${D.outline}`, paddingBottom: 4 }}>
            <span style={{ fontSize: 16, color: D.muted, marginRight: 8 }}>🔍</span>
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search transactions..." style={{ background: "transparent", border: "none", color: T.text, padding: "4px 0", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", width: 260 }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={fetchData} style={{ background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "8px 16px", fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 500, borderRadius: 6, cursor: "pointer", transition: "all 0.15s" }}>Refresh</button>
          {isAdmin && <button onClick={() => { setForm(BLANK_P); setModal(true); }} style={{ background: T.financial, color: "#ffffff", border: "none", padding: "8px 20px", fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600, borderRadius: 6, cursor: "pointer", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>Log Payment</button>}
        </div>
      </div>

      {/* Mobile Card View */}
      <style>{`
        .pay-desktop { display: block; }
        .pay-mobile-cards { display: none; }
        @media (max-width: 640px) {
          .pay-desktop { display: none !important; }
          .pay-mobile-cards { display: flex !important; }
          .pay-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <div className="pay-mobile-cards" style={{ display: "none", flexDirection: "column", gap: 12 }}>
        {paginated.map((l) => (
          <div key={l.id} style={{ background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{l.supplier_name || l.contractor_name || "\u2014"}</div>
                <div style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>{l.payment_type === "supplier" ? "Supplier" : "Contractor"} {"\u00B7"} #{l.num}</div>
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.financial }}>{fmt(l.amount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: D.muted }}>
              <span>{l.date || "\u2014"} {"\u00B7"} {l.method || "\u2014"}</span>
              {isAdmin && <button onClick={() => del(l)} style={{ background: "transparent", border: `1px solid ${T.danger}40`, color: T.danger, padding: "3px 10px", fontSize: 10, cursor: "pointer" }}>Del</button>}
            </div>
          </div>
        ))}
        {paginated.length === 0 && <div style={{ padding: 40, textAlign: "center", color: D.muted }}>No payments found</div>}
      </div>

      {/* Data Table (Desktop) */}
      <div className="pay-desktop" style={{ background: T.card, border: `1px solid ${D.outline}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.tableBg2, borderBottom: `1px solid ${D.outline}` }}>
              {["Date", "Recipient", "Amount (PKR)", "Category", "Method", "Reference #", "Status", ""].map((h, i) => (
                <th key={i} style={{ padding: "14px 20px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((l) => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${D.outline}`, transition: "background 0.15s", background: T.card }}
                onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                onMouseLeave={e => e.currentTarget.style.background = T.card}>
                <td style={{ padding: "14px 20px", fontSize: 13, fontFamily: "'Inter',sans-serif", color: D.muted, whiteSpace: "nowrap" }}>{l.date || "—"}</td>
                <td style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{l.supplier_name || l.contractor_name || "—"}</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: D.muted, marginTop: 2 }}>{l.payment_type === "supplier" ? "Supplier" : "Contractor"} · #{l.num}</span>
                  </div>
                </td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, color: T.financial, whiteSpace: "nowrap" }}>{fmt(l.amount)}</td>
                <td style={{ padding: "14px 20px" }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, textTransform: "uppercase", background: T.tableBg2, color: D.muted, padding: "4px 8px", borderRadius: 4, border: `1px solid ${D.outline}` }}>{l.payment_type === "supplier" ? "Material" : "Labor"}</span>
                </td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text }}>{l.method || "—"}</td>
                <td style={{ padding: "14px 20px", fontFamily: "'Inter',sans-serif", fontSize: 12, color: D.muted }}>{l.reference || "—"}</td>
                <td style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.success }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, color: T.success }}>Settled</span>
                  </div>
                </td>
                <td style={{ padding: "14px 20px" }}>
                  {isAdmin && <button onClick={() => del(l)} style={{ background: "transparent", border: `1px solid ${T.danger}40`, color: T.danger, padding: "4px 8px", borderRadius: 4, fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${T.danger}10`; e.currentTarget.style.borderColor = T.danger; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = `${T.danger}40`; }}>Delete</button>}
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 60, textAlign: "center", fontFamily: "'Inter',sans-serif", fontSize: 13, color: D.muted }}>No payments found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}

      {/* Modal */}
      {modal && (
        <Overlay onClose={() => setModal(false)} title="Log Payment">
          <Label>Date</Label>
          <input type="date" style={S.inp} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          <Label>Payment Type</Label>
          <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 16 }}>
            {["supplier", "contractor"].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, payment_type: t, contractor_id: "", contractor_name: "", supplier_name: "" }))} style={{ flex: 1, padding: "10px", cursor: "pointer", fontWeight: 600, fontSize: 13, borderRadius: 6, border: form.payment_type === t ? `1px solid ${T.financial}` : `1px solid ${D.outline}`, background: form.payment_type === t ? `${T.financial}10` : "transparent", color: form.payment_type === t ? T.financial : D.muted, transition: "all 0.15s" }}>{t === "supplier" ? "Material Supplier" : "Contractor"}</button>
            ))}
          </div>
          {form.payment_type === "supplier" ? (
            <>
              <Label>Supplier Name</Label>
              <select style={S.inp} value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}>
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {suppliers.length === 0 && <div style={{ fontSize: 11, color: D.muted, marginTop: 4 }}>No suppliers found. Add material purchases first.</div>}
            </>
          ) : (
            <>
              <Label>Contractor</Label>
              <select style={S.inp} value={form.contractor_id} onChange={e => { const c = contractors.find(x => x.contractor_id === e.target.value); setForm(f => ({ ...f, contractor_id: e.target.value, contractor_name: c ? c.name : "" })); }}>
                <option value="">Select contractor</option>
                {contractors.map(c => <option key={c.id} value={c.contractor_id}>{c.name} ({c.trade})</option>)}
              </select>
            </>
          )}
          <Label>Amount (PKR)</Label>
          <input type="number" min="0" style={{ ...S.inp, color: T.financial, fontWeight: 700 }} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500000" />
          {form.payment_type === "contractor" && (
             <div style={{ marginTop: 12 }}>
               <Label>Retention Held (PKR)</Label>
               <input type="number" min="0" style={S.inp} value={form.retention_amount || ""} onChange={e => setForm(f => ({ ...f, retention_amount: e.target.value }))} placeholder="Optional retention amount" />
               <div style={{ fontSize: 11, color: D.muted, marginTop: 4 }}>This amount is held back and not included in the payment disbursement.</div>
             </div>
          )}
          <Label>Method</Label>
          <select style={S.inp} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select>
          <Label>Reference</Label>
          <input style={S.inp} value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
          <Label>Remarks</Label>
          <input style={S.inp} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="e.g. Advance payment, partial settlement..." />
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button style={{ ...S.btnGold, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? "Saving..." : "Log Payment"}</button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => setModal(false)}>Cancel</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
