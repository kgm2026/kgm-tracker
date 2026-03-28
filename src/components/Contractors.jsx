import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbGet, dbInsert, dbPatch, dbDelete } from '../utils/api';
import { fmt, STATUS_COLORS, toInt } from '../utils/formatting';
import { Overlay, Label, LoadingSpinner, notify } from './Shared';
import { emitDataChange } from '../utils/aiCacheInvalidation';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const BLANK_C = {
  contractor_id: "", name: "", trade: "", contact: "", contract_value: "",
  amount_paid: "", amount_due: "", payment_status: "Partial",
  start_date: "", work_status: "Not Started", notes: "", role: "Contractor"
};

export default function Contractors({ projectId }) {
  const { S, T } = useTheme();
  const { isAdmin } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(BLANK_C);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [d, p] = await Promise.all([
      dbGet("contractors", `&project_id=eq.${projectId}`),
      dbGet("payment_log", `&project_id=eq.${projectId}&payment_type=eq.contractor`)
    ]);
    setContractors(d);
    setPayments(p);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["contractors", "payment_log"], fetchData);

  // Live sync — refresh when payments are logged from PaymentLog tab
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  const isPaymentLoggedThisMonth = useCallback((name) => {
    const now = new Date();
    return payments.some(p => {
      if ((p.contractor_name || "").toLowerCase() !== (name || "").toLowerCase()) return false;
      let d;
      if (p.date && p.date.includes("/")) {
        const [dd, mm, yyyy] = p.date.split("/");
        d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      } else { d = new Date(p.date); }
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [payments]);

  const openEdit = useCallback((c) => {
    setForm({
      contractor_id: c.contractor_id || "", name: c.name || "", trade: c.trade || "",
      contact: c.contact || "", contract_value: c.contract_value != null ? String(c.contract_value) : "",
      amount_paid: c.amount_paid != null ? String(c.amount_paid) : "",
      amount_due: c.amount_due != null ? String(c.amount_due) : "",
      payment_status: c.payment_status || "Partial",
      start_date: c.start_date || "", work_status: c.work_status || "Not Started",
      notes: c.notes || "", role: c.role || "Contractor"
    });
    setEditId(c.id); setModal(true);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        ...form, contract_value: toInt(form.contract_value, 0),
        amount_paid: toInt(form.amount_paid, 0),
        amount_due: toInt(form.amount_due, 0), project_id: projectId
      };
      if (editId) {
        await dbPatch("contractors", editId, data);
        setContractors(prev => prev.map(c => c.id === editId ? { ...c, ...data } : c));
        notify("Contractor updated");
        emitDataChange();
      } else {
        const row = await dbInsert("contractors", data);
        setContractors(prev => [...prev, row]);
        notify("Contractor added");
        emitDataChange();
      }
      setModal(false);
    } catch (e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const del = async (c) => {
    setContractors(prev => prev.filter(x => x.id !== c.id));
    const timeout = setTimeout(async () => {
      try { await dbDelete("contractors", c.id); }
      catch (err) {
        setContractors(prev => [...prev, c]);
        notify(`Failed to remove "${c.name}": ${err.message}`, "error");
      }
    }, 4000);
    const onUndo = () => {
      clearTimeout(timeout);
      setContractors(prev => [...prev, c]);
      notify(`"${c.name}" restored`);
    };
    notify(`"${c.name}" removed`, "undo", onUndo);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contractors.filter(c => {
      const matchSearch = !q || (c.name || "").toLowerCase().includes(q) || (c.trade || "").toLowerCase().includes(q) || (c.contractor_id || "").toLowerCase().includes(q);
      const matchTrade = !tradeFilter || (c.trade || "").toLowerCase().includes(tradeFilter.toLowerCase());
      return matchSearch && matchTrade;
    });
  }, [contractors, search, tradeFilter]);

  const trades = useMemo(() => [...new Set(contractors.map(c => c.trade).filter(Boolean))], [contractors]);

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card,
    surfaceHigh: T.cardBorder, outline: T.cardBorder, white: T.text,
    gold: T.financial, green: T.success, blue: T.financial,
    muted: T.textMuted, error: T.danger,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div style={{ padding: "32px 48px", animation: "fadeUp 0.4s ease" }}>
      {/* Page Header */}
      <header style={{ marginBottom: 48 }}>
        <h1 style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: D.white, margin: 0 }}>Contractors</h1>
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, letterSpacing: 0, color: D.muted, marginTop: 8 }}>Registry & Fiscal Performance Metrics</p>
      </header>

      {/* Filters Toolbar */}
      <section style={{ border: `1px solid ${D.outline}`, background: T.card, padding: 16, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 32, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>Search Registry</label>
            <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${D.outline}` }}>
              <span style={{ color: D.muted, fontSize: 16, marginRight: 8 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="CONTRACTOR NAME..." style={{ background: "transparent", border: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", letterSpacing: 0, color: D.white, outline: "none", padding: "6px 0", width: 180 }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, fontWeight: 600 }}>Trade Sector</label>
            <select value={tradeFilter || ""} onChange={e => setTradeFilter(e.target.value || null)} style={{ background: "transparent", border: "none", fontSize: 13, fontFamily: "'Inter',sans-serif", letterSpacing: 0, color: D.white, outline: "none", padding: "6px 0", cursor: "pointer", textTransform: "uppercase" }}>
              <option value="" style={{ background: T.card, color: T.text }}>All Disciplines</option>
              {trades.map(t => <option key={t} value={t} style={{ background: T.card, color: T.text }}>{t}</option>)}
            </select>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => { setForm(BLANK_C); setEditId(null); setModal(true); }}
            style={{ background: T.financial, color: "#ffffff", border: "none", padding: "10px 24px", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
            onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
            onMouseLeave={e => e.currentTarget.style.opacity = 1}>Add Contractor</button>
        )}
      </section>

      {/* Contractors Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        {filtered.map(c => {
          const pct = c.contract_value ? Math.round((c.amount_paid / c.contract_value) * 100) : 0;
          const isSalary = (c.role || "Contractor") === "Salary/Staff";
          const paidThisMonth = isSalary ? isPaymentLoggedThisMonth(c.name) : false;
          const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });
          const statusText = isSalary ? (paidThisMonth ? "Paid" : "Unpaid") : (c.work_status || "Not Started");
          const isActive = statusText === "In Progress" || statusText === "Paid";
          const isLate = statusText === "Unpaid" || statusText === "Not Started";
          const isComplete = statusText === "Completed";
          const borderColor = isComplete ? D.outline : isActive ? T.success : T.danger;
          const textColor = isComplete ? D.muted : isActive ? T.success : T.danger;
          const statusBg = isComplete ? "transparent" : isActive ? `${T.success}10` : `${T.danger}10`;

          return (
            <div key={c.id} style={{
              border: `1px solid ${D.outline}`, background: T.card, padding: 24,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              transition: "all 0.15s", cursor: "pointer", minHeight: 250, borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.financial; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, marginBottom: 4 }}>{isSalary ? "SALARY / STAFF" : (c.trade || "GENERAL").toUpperCase()}</p>
                    <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: -0.5, color: D.white, margin: 0 }}>{c.name}</h3>
                  </div>
                  <span style={{
                    border: `1px solid ${borderColor}`, color: textColor, background: statusBg,
                    padding: "4px 10px", fontFamily: "'Inter',sans-serif", borderRadius: 4,
                    fontSize: 10, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap"
                  }}>
                    {isSalary ? (paidThisMonth ? `${monthLabel} Paid` : `${monthLabel} Unpaid`) : statusText}
                  </span>
                </div>
                {!isSalary && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, color: D.muted }}>Project Completion</span>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, color: D.white }}>{pct}%</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: T.bodyBg, borderRadius: 3 }}>
                      <div style={{ height: "100%", background: isLate ? T.danger : T.success, width: `${Math.min(pct, 100)}%`, borderRadius: 3 }} />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted, marginBottom: 4 }}>Total Disbursed</p>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 20, fontWeight: 700, color: D.white, letterSpacing: -0.5 }}>{fmt(c.amount_paid || 0)}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {isAdmin && <button onClick={() => openEdit(c)} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, color: D.muted, background: "transparent", border: `1px solid ${D.outline}`, borderRadius: 4, padding: "4px 8px", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = T.financial; e.currentTarget.style.borderColor = T.financial; }} onMouseLeave={e => { e.currentTarget.style.color = D.muted; e.currentTarget.style.borderColor = D.outline; }}>Edit</button>}
                  {isAdmin && <button onClick={() => del(c)} style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 500, color: D.error, background: "transparent", border: `1px solid ${D.outline}`, borderRadius: 4, padding: "4px 8px", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = D.error; e.currentTarget.style.background = `${D.error}10`; }} onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.background = "transparent"; }}>Remove</button>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add New Card */}
        {isAdmin && (
          <div onClick={() => { setForm(BLANK_C); setEditId(null); setModal(true); }} style={{
            border: `1px dashed ${D.outline}`, background: "transparent", padding: 24,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, cursor: "pointer", transition: "all 0.15s", minHeight: 250, borderRadius: 8
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.financial; e.currentTarget.style.background = `${T.financial}05`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = D.outline; e.currentTarget.style.background = "transparent"; }}>
            <span style={{ fontSize: 32, color: D.muted, fontWeight: 300 }}>+</span>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: D.muted }}>Onboard New Contractor</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <Overlay onClose={() => { setModal(false); setEditId(null); }} title={editId ? "Edit Contractor" : "Add Contractor"}>
          <Label>Role</Label>
          <select style={S.inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option value="Contractor">Contractor (progress bar)</option>
            <option value="Salary/Staff">Salary / Staff (monthly paid status)</option>
          </select>
          {[["ID", "contractor_id", "text", "C-001"], ["Name", "name", "text", ""], ["Trade / Title", "trade", "text", ""], ["Contact", "contact", "text", ""], ["Contract Value / Monthly Salary", "contract_value", "number", "0"], ["Amount Paid", "amount_paid", "number", "0"], ["Amount Due", "amount_due", "number", "0"], ["Start Date", "start_date", "date", ""]].map(([l, k, t]) => (
            <div key={k}><Label>{l}</Label><input type={t} min={t === "number" ? "0" : undefined} style={S.inp} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} /></div>
          ))}
          {form.role === "Contractor" && <><Label>Work Status</Label><select style={S.inp} value={form.work_status} onChange={e => setForm(f => ({ ...f, work_status: e.target.value }))}><option>Not Started</option><option>In Progress</option><option>Completed</option></select></>}
          <Label>Notes</Label><input style={S.inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button style={{ ...S.btnGold, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? "Saving..." : editId ? "Save" : "Add"}</button>
            <button style={{ ...S.btnGhost, flex: 1 }} onClick={() => { setModal(false); setEditId(null); }}>Cancel</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
