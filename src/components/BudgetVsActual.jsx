import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { dbGet, dbPatch } from '../utils/api';
import { fmt, toInt } from '../utils/formatting';
import { notify } from './Shared';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const DEFAULT_BUDGETS = [
  { cat: "Grey Structure", key: "grey", budget: 0 },
  { cat: "Finishing", key: "finishing", budget: 0 },
  { cat: "Contractors", key: "contractors", budget: 0 },
  { cat: "Miscellaneous", key: "misc", budget: 0 }
];

export default function BudgetVsActual({ projectId }) {
  const { S, T } = useTheme();
  const { isAdmin } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);
  const [totalBudget, setTotalBudget] = useState(0);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [tempBudgets, setTempBudgets] = useState(DEFAULT_BUDGETS);
  const [tempTotal, setTempTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const [m, c, proj] = await Promise.all([
        dbGet("material_purchases", `&project_id=eq.${projectId}`),
        dbGet("contractors", `&project_id=eq.${projectId}`),
        dbGet("projects", `&id=eq.${projectId}`),
      ]);
      setMaterials(m);
      setContractors(c);

      const project = proj[0] || {};
      setTotalBudget(project.budget || 0);

      // Read category budgets from projects.budget_categories JSON column
      const saved = project.budget_categories;
      if (saved && typeof saved === 'object') {
        const merged = DEFAULT_BUDGETS.map(d => ({
          ...d,
          budget: saved[d.key] || 0,
        }));
        setBudgets(merged);
      }
    } catch (e) {
      setFetchError(e.message || 'Failed to load budget data');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRefreshOnMount(["material_purchases", "contractors", "projects"], fetchData);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "contractors" || table === "projects") fetchData();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchData]);

  const matActual = useMemo(() => {
    const result = { grey: 0, finishing: 0, misc: 0 };
    materials.forEach(m => {
      if (m.category === "grey") result.grey += m.total || 0;
      else if (m.category === "misc") result.misc += m.total || 0;
      else result.finishing += m.total || 0;
    });
    return result;
  }, [materials]);

  const contractorActual = useMemo(() => contractors.reduce((s, c) => s + (c.amount_paid || 0), 0), [contractors]);
  const totalSpent = matActual.grey + matActual.finishing + matActual.misc + contractorActual;
  const totalPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const variance = totalSpent - totalBudget;
  const remaining = totalBudget - totalSpent;

  const getActual = (key) => {
    if (key === "grey") return matActual.grey;
    if (key === "finishing") return matActual.finishing;
    if (key === "contractors") return contractorActual;
    if (key === "misc") return matActual.misc;
    return 0;
  };

  const saveBudgets = async () => {
    const newTotal = toInt(tempTotal, 0);
    try {
      // Store category budgets as JSON on the projects table
      const budgetCategories = {};
      tempBudgets.forEach(b => { budgetCategories[b.key] = toInt(b.budget, 0); });

      await dbPatch("projects", projectId, {
        budget: newTotal,
        budget_categories: budgetCategories,
      });

      setTotalBudget(newTotal);
      setBudgets(tempBudgets.map(b => ({ ...b, budget: toInt(b.budget, 0) })));
      notify("Budgets saved");
      setEditing(false);
    } catch (e) {
      notify("Error saving budgets: " + e.message, "error");
    }
  };

  const autoDistribute = () => {
    const currentAllocated = tempBudgets.reduce((s, b) => b.key !== 'misc' ? s + toInt(b.budget, 0) : s, 0);
    const remainder = Math.max(0, toInt(tempTotal, 0) - currentAllocated);
    setTempBudgets(prev => prev.map(b => b.key === 'misc' ? { ...b, budget: remainder } : b));
  };

  const D = {
    surface: T.card, surfaceLow: T.card, surfaceLowest: T.card,
    surfaceHigh: T.cardBorder, surfaceHighest: T.cardBorder,
    outline: T.cardBorder, white: T.text, gold: T.financial,
    green: T.success, muted: T.textMuted, error: T.danger,
  };

  if (loading) return <div style={{ padding: "60px 48px" }}><div style={{ width: 32, height: 32, border: `3px solid ${T.cardBorder}`, borderTop: `3px solid ${T.text}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto" }} /></div>;

  if (fetchError) return (
    <div style={{ padding: "60px 48px", textAlign: "center" }}>
      <p style={{ color: T.danger, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>{fetchError}</p>
      <button onClick={fetchData} style={{ ...S.btnGhost, marginTop: 12 }}>Retry</button>
    </div>
  );

  return (
    <div style={{ padding: "32px 48px", animation: "fadeUp 0.4s ease" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ fontFamily: "'Inter',sans-serif", fontSize: 36, fontWeight: 300, letterSpacing: -0.5, color: D.white, margin: 0 }}>Budget vs Actual</h2>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: D.muted, marginTop: 8 }}>Fiscal Report // Project: KGM-{projectId?.slice(0, 8) || "\u2014"}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: D.muted, margin: 0 }}>Last Synced</p>
          <p style={{ fontFamily: "'Inter',sans-serif", color: D.white, fontWeight: 300, marginTop: 4 }}>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 40 }}>
        {[
          { label: "Total Budgeted", value: fmt(totalBudget), sub: "Allocated Funds", color: D.white },
          { label: "Actual Spent", value: fmt(totalSpent), sub: `${totalPct}% Utilized`, color: D.gold },
          { label: "Variance", value: `${variance >= 0 ? "+" : ""}${fmt(variance)}`, sub: variance <= 0 ? "Under Budget" : "Over Budget", color: variance <= 0 ? D.green : D.error },
          { label: "Remaining Funds", value: fmt(remaining), sub: "Contingency Incl.", color: D.white },
        ].map((k, i) => (
          <div key={i} style={{ background: D.surfaceLow, border: `1px solid ${D.outline}`, padding: 24 }}>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: D.muted, margin: "0 0 8px" }}>{k.label}</p>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 300, color: k.color, letterSpacing: 0.5 }}>{k.value}</p>
            <div style={{ height: 1, background: D.outline, marginTop: 16 }} />
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: k.color === D.green ? D.green : k.color === D.gold ? D.gold : D.muted, marginTop: 8 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Visual Charts Section */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 40 }}>
        <div style={{ background: D.surfaceLow, border: `1px solid ${D.outline}`, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: D.white, fontWeight: 600, margin: 0 }}>Structural Spend Analysis</h3>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, background: D.white }} /><span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: D.muted, letterSpacing: 1, textTransform: "uppercase" }}>Budget</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, background: D.gold }} /><span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: D.muted, letterSpacing: 1, textTransform: "uppercase" }}>Actual</span></div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {budgets.filter(b => b.budget > 0 || getActual(b.key) > 0).map(b => {
              const actual = getActual(b.key);
              const budgetPct = totalBudget > 0 ? Math.round((b.budget / totalBudget) * 100) : 0;
              const actualPct = b.budget > 0 ? Math.round((actual / b.budget) * 100) : 0;
              const isOver = actual > b.budget;
              return (
                <div key={b.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Inter',sans-serif", fontSize: 10, color: D.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                    <span>{b.cat}</span>
                    <span style={{ color: isOver ? D.error : D.muted }}>{isOver ? "Over Budget" : `${actualPct}% Progress`}</span>
                  </div>
                  <div style={{ position: "relative", height: 16, background: "#1a1c1c" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", background: D.white, opacity: 0.1, width: `${Math.min(budgetPct, 100)}%` }} />
                    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", background: D.white, width: `${Math.min(budgetPct, 100)}%` }} />
                    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", borderRight: `2px solid ${D.gold}`, width: `${Math.min(actualPct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: D.surfaceLow, border: `1px solid ${D.outline}`, padding: 32 }}>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: D.white, fontWeight: 600, margin: "0 0 32px" }}>Budget Distribution</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {budgets.filter(b => b.budget > 0).map((b, i) => {
              const pct = totalBudget > 0 ? Math.round((b.budget / totalBudget) * 100) : 0;
              const colors = [D.white, "#c6c6c7", "#919191", "#5d5f5f"];
              return (
                <div key={b.key} style={{ height: 48 + (i === 0 ? 16 : 0), background: colors[i % colors.length], display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, color: D.surface, letterSpacing: 1, textTransform: "uppercase" }}>{pct}% {b.cat.replace(" Structure", "").toUpperCase()}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${D.outline}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: D.muted, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 4px" }}>Largest Category</p>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: D.white, margin: 0 }}>{budgets.reduce((max, b) => b.budget > (max?.budget || 0) ? b : max, budgets[0])?.cat || "\u2014"}</p>
              </div>
              <div>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, color: D.muted, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 4px" }}>Critical Path</p>
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: D.gold, margin: 0 }}>{budgets.reduce((max, b) => getActual(b.key) > getActual(max?.key || "") ? b : max, budgets[0])?.cat || "\u2014"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Table */}
      <div style={{ background: D.surfaceLow, border: `1px solid ${D.outline}` }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${D.outline}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: D.white, fontWeight: 600, margin: 0 }}>Cost Itemization Matrix</h3>
          {isAdmin && <button onClick={() => { setTempBudgets(budgets.map(b => ({ ...b }))); setTempTotal(totalBudget); setEditing(true); }} style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", background: "transparent", border: `1px solid ${D.outline}`, color: D.muted, padding: "6px 16px", cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = D.white; e.currentTarget.style.color = D.surface; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = D.muted; }}>Set Budgets</button>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: D.surfaceLow, borderBottom: `1px solid ${D.outline}` }}>
              {["Category", "Budgeted Amt", "Actual Amt", "Variance", "Status"].map((h, i) => (
                <th key={i} style={{ padding: "14px 24px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: D.muted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => {
              const actual = getActual(b.key);
              const v = b.budget - actual;
              const isOver = actual > b.budget;
              const isPending = b.budget === 0;
              return (
                <tr key={b.key} style={{ borderBottom: `1px solid ${D.outline}`, transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = D.surfaceLowest}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "16px 24px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: D.white, fontWeight: 500 }}>{b.cat}</td>
                  <td style={{ padding: "16px 24px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: D.white }}>{fmt(b.budget)}</td>
                  <td style={{ padding: "16px 24px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: D.gold, fontWeight: 600 }}>{fmt(actual)}</td>
                  <td style={{ padding: "16px 24px", fontFamily: "'Inter',sans-serif", fontSize: 14, color: isOver ? D.error : isPending ? D.muted : D.green, fontWeight: 600 }}>{isPending ? "Pending" : `${v >= 0 ? "+" : ""}${fmt(v)}`}</td>
                  <td style={{ padding: "16px 24px" }}>
                    <span style={{
                      fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", padding: "3px 8px",
                      border: `1px solid ${isOver ? D.error : isPending ? D.outline : D.green}40`,
                      color: isOver ? D.error : isPending ? D.muted : D.green,
                      background: isOver ? D.error + "15" : isPending ? "transparent" : D.green + "15"
                    }}>
                      {isOver ? "Over Budget" : isPending ? "In Progress" : "Within Budget"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(20px)" }}
          onClick={() => setEditing(false)}>
          <div style={{ background: D.surfaceLow, border: "none", padding: 32, width: "100%", maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: D.white, fontWeight: 600, marginBottom: 24 }}>Set Budgets</div>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: D.muted, marginBottom: 6, marginTop: 12 }}>Total Project Budget (PKR)</div>
            <input type="number" min="0" style={{ ...S.inp, fontWeight: 700 }} value={tempTotal} onChange={e => setTempTotal(e.target.value)} />
            {tempBudgets.map((b, i) => (
              <div key={b.key} style={{ marginTop: 12 }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: D.muted, marginBottom: 6 }}>{b.cat}</div>
                <input type="number" min="0" style={S.inp} value={tempBudgets[i].budget} onChange={e => setTempBudgets(prev => prev.map((x, j) => j === i ? { ...x, budget: e.target.value } : x))} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button style={{ ...S.btnGold, flex: 1, padding: "12px" }} onClick={saveBudgets}>Save Budgets</button>
              <button style={{ ...S.btnGhost, flex: 1, padding: "12px" }} onClick={autoDistribute}>Auto Distribute</button>
              <button style={{ ...S.btnGhost, flex: 1, padding: "12px" }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
