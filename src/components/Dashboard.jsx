import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { fmt } from '../utils/formatting';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

export default function Dashboard({ selectedProject, onNavigate }) {
  const { T } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const projFilter = selectedProject && selectedProject !== "all" ? `&project_id=eq.${selectedProject}` : "";
      const projectFilter = selectedProject && selectedProject !== "all" ? `&id=eq.${selectedProject}` : "";
      const [materials, payments, projects, contractors] = await Promise.all([
        dbGet("material_purchases", `&order=date.asc${projFilter}`),
        dbGet("payment_log", `&order=created_at.desc${projFilter}`),
        dbGet("projects", projectFilter), // Filter by selected project for correct budget
        dbGet("contractors", projFilter),
      ]);

      const matTotal = materials.reduce((s, m) => s + (Number(m.total) || 0), 0);
      const contractorPayments = payments.filter(p => !p.payment_type || p.payment_type === "contractor");
      const supplierPayments = payments.filter(p => p.payment_type === "supplier");
      const totalContractorPayments = contractorPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const totalSupplierPayments = supplierPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const totalBudget = projects.reduce((s, p) => s + (Number(p.budget) || 0), 0);
      const totalUnpaid = materials.reduce((s, m) => s + (Number(m.unpaid) || 0), 0);
      const totalSpent = matTotal + totalContractorPayments + totalSupplierPayments;
      const budgetRemaining = totalBudget - totalSpent;

      const paidCount = materials.filter(m => m.status === "Paid").length;
      const progress = materials.length > 0 ? Math.round((paidCount / materials.length) * 100) : 0;

      // Prepare Chart Data (Cumulative Spend over time)
      let cumulative = 0;
      const chartData = materials.map(m => {
        cumulative += (Number(m.total) || 0);
        return { date: m.date, value: cumulative };
      }).filter((_, i) => i % Math.ceil(materials.length / 20) === 0); // Downsample for performance

      // Recent materials (reverse for list)
      const recentMaterials = [...materials].sort((a, b) => (b.num || 0) - (a.num || 0)).slice(0, 5);

      const contractorMap = {};
      contractors.forEach(c => {
        contractorMap[c.name.toLowerCase()] = { ...c, totalPaid: 0, status: c.work_status || "In Progress" };
      });
      contractorPayments.forEach(p => {
        const key = (p.contractor_name || "").toLowerCase();
        if (contractorMap[key]) contractorMap[key].totalPaid += Number(p.amount) || 0;
      });
      const contractorList = Object.values(contractorMap).slice(0, 5);

      setData({
        totalBudget, totalUnpaid, totalSpent, budgetRemaining, progress,
        projectCount: projects.length, contractorCount: contractors.length,
        recentMaterials, contractorList,
        chartData
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedProject]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useRefreshOnMount(["material_purchases", "payment_log", "contractors", "projects"], fetchAll);

  useEffect(() => {
    const handler = (e) => {
      const table = e.detail?.table;
      if (table === "material_purchases" || table === "payment_log" || table === "contractors" || table === "projects") fetchAll();
    };
    window.addEventListener("kgm-db-changed", handler);
    return () => window.removeEventListener("kgm-db-changed", handler);
  }, [fetchAll]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: T.textMuted }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 120, height: 2, background: T.cardBorder, overflow: "hidden", margin: "0 auto 16px" }}>
          <div style={{ width: "30%", height: "100%", background: T.text, animation: "slide 1.2s ease infinite" }} />
        </div>
        <style>{`@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
        Loading dashboard…
      </div>
    </div>
  );

  if (!data) return <div style={{ color: T.danger, padding: 24 }}>Failed to load data.</div>;

  const {
    totalBudget, totalUnpaid, totalSpent, budgetRemaining, progress,
    contractorCount, recentMaterials, contractorList, chartData
  } = data;

  const kpiData = [
    { label: "Total Capital Spent", value: fmt(totalSpent), sub: `PROJECT BUDGET: ${fmt(totalBudget)}`, isPrimary: true, hasChart: true },
    { label: "Outstanding Liabilities", value: fmt(totalUnpaid), sub: "ACCOUNTS PAYABLE", isPrimary: false },
    { label: "Allocated Budget", value: fmt(totalBudget), sub: budgetRemaining >= 0 ? `REMAINING: ${fmt(budgetRemaining)}` : `OVER BUDGET: ${fmt(Math.abs(budgetRemaining))}`, isPrimary: true },
    { label: "Operational Progress", value: `${progress}%`, sub: `${contractorCount} ACTIVE CONTRACTORS`, isPrimary: false, isProgress: true, progressVal: progress },
  ];

  return (
    <div style={{ background: T.bodyBg, minHeight: "100%", padding: "32px 48px", animation: "fadeUp 0.4s ease" }}>
      <style>{`
        .dash-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
        .main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 32px; }
        .mob-card { display: none; }
        .desktop-table { display: table; }
        @media (max-width: 1024px) { .dash-grid { grid-template-columns: repeat(2, 1fr); } .main-grid { grid-template-columns: 1fr; } }
        @media (max-width: 640px) { 
          .dash-grid { grid-template-columns: 1fr; } 
          .desktop-table { display: none !important; }
          .mob-card { display: flex; }
        }
      `}</style>

      {/* KPI Section */}
      <div className="dash-grid" style={{ marginBottom: 48 }}>
        {kpiData.map((kpi, i) => (
          <div key={i} style={{
            background: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 8,
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: 160,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 2 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.textMuted, fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div style={{ zIndex: 2 }}>
              <div style={{ color: kpi.isPrimary ? T.financial : T.text, fontSize: 32, fontWeight: 700, fontFamily: "'Inter',sans-serif", lineHeight: 1.1, letterSpacing: -0.5 }}>{kpi.value}</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: T.textMuted, marginTop: 8, fontWeight: 500 }}>{kpi.sub}</div>
              {kpi.isProgress && (
                <div style={{ width: "100%", height: 4, background: T.cardBorder, marginTop: 16, borderRadius: 2 }}>
                  <div style={{ width: `${kpi.progressVal}%`, height: "100%", background: T.financial, borderRadius: 2 }} />
                </div>
              )}
            </div>
            {kpi.hasChart && chartData && (
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "100%", height: "50%", opacity: 0.15, pointerEvents: "none" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <Area type="monotone" dataKey="value" stroke={T.financial} fill={T.financial} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main Data Grid */}
      <div className="main-grid">
        {/* Material Ledger */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 18, color: T.text, margin: 0 }}>Material Ledger</h3>
            <span onClick={() => onNavigate?.("materials")} style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.financial, cursor: "pointer", fontWeight: 500 }}>View All Logs</span>
          </div>
          <div style={{ overflowX: "auto", background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 8, boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}>
            <table className="desktop-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.tableBg2, borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Ref ID</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Description</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Qty / Rate</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Value</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
                {recentMaterials.map((m, i) => (
                  <tr key={m.id || i} style={{ borderBottom: `1px solid ${T.cardBorder}`, transition: "background 0.15s", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.tableBg2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "14px 20px", color: T.textMuted, fontSize: 12, fontWeight: 500 }}>#{m.num || "—"}</td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ color: T.text, fontWeight: 500 }}>{m.material || "—"}</div>
                      <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>{m.supplier || "—"}</div>
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right", color: T.textMuted, fontSize: 12 }}>{m.qty ? `${m.qty} ${m.unit || ""} @ ${m.rate}` : "—"}</td>
                    <td style={{ padding: "14px 20px", textAlign: "right", color: T.text, fontWeight: 600 }}>{fmt(m.total || 0)}</td>
                  </tr>
                ))}
                {recentMaterials.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: T.textMuted }}>No material purchases recorded yet.</td></tr>
                )}
              </tbody>
            </table>
            
            {/* Mobile Card View */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentMaterials.map((m, i) => (
                <div key={m.id || i} className="mob-card" style={{
                  background: T.card, padding: 16, flexDirection: "column", borderBottom: `1px solid ${T.cardBorder}`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>#{m.num} · {m.date}</span>
                    <span style={{ color: T.text, fontWeight: 600 }}>{fmt(m.total)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{m.material}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: T.textMuted }}>
                    <span>{m.supplier}</span>
                    <span>{m.qty ? `${m.qty} ${m.unit} @ ${m.rate}` : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contractors Sidebar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 18, color: T.text, margin: 0 }}>Contractors</h3>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.textMuted }}>groups</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {contractorList.map((c, i) => {
              const isActive = c.status === "In Progress" || c.status === "Completed";
              return (
                <div key={i} style={{
                  background: T.card,
                  padding: "16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  borderRadius: 8,
                  border: `1px solid ${T.cardBorder}`,
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.financial}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.cardBorder}>
                  <div>
                    <h4 style={{ color: T.text, fontSize: 14, fontWeight: 600, margin: 0 }}>{c.name}</h4>
                    <p style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", margin: "4px 0 0", fontWeight: 500, letterSpacing: 0.5 }}>{c.trade || "General"}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>{fmt(c.totalPaid || c.contract_value || 0)}</div>
                    <div style={{ fontSize: 10, color: isActive ? T.success : T.textMuted, textTransform: "uppercase", fontWeight: 600, marginTop: 2 }}>{c.status}</div>
                  </div>
                </div>
              );
            })}
            {contractorList.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13, background: T.card, borderRadius: 8, border: `1px solid ${T.cardBorder}` }}>No contractors recorded yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
