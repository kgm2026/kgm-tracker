import { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { dbGet } from '../utils/api';
import { fmt } from '../utils/formatting';
import { KPICard, LoadingSpinner } from './Shared';
import { useRefreshOnMount } from '../hooks/useRefreshOnMount';

const CHART_COLORS = ["#ffb866", "#63b3ed", "#48bb78", "#fc8181", "#d6bcfa", "#f6ad55", "#68d391", "#f687b3"];

export default function MaterialSummary({ projectId }) {
  const { S, T, theme } = useTheme();
  const { thS, tdS } = S;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("cost");

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

  const totalCost = useMemo(() => entries.reduce((s, e) => s + (e.total || 0), 0), [entries]);
  const totalQty = useMemo(() => entries.reduce((s, e) => s + (e.qty || 0), 0), [entries]);
  const uniqueSuppliers = useMemo(() => new Set(entries.map(e => (e.supplier || "").trim().toLowerCase()).filter(Boolean)).size, [entries]);

  const matSummary = useMemo(() => {
    const acc = {};
    entries.forEach(e => {
      const key = (e.material || "Other").trim().toLowerCase();
      const name = (e.material || "Other").trim().replace(/\b\w/g, c => c.toUpperCase());
      if (!acc[key]) acc[key] = { name, count: 0, cost: 0, qty: 0, unit: e.unit || "", suppliers: new Set() };
      acc[key].count++;
      acc[key].cost += e.total || 0;
      acc[key].qty += e.qty || 0;
      if (e.supplier) acc[key].suppliers.add(e.supplier.trim().toLowerCase());
    });
    const list = Object.values(acc).map(m => ({ ...m, suppliers: m.suppliers.size }));
    if (sortBy === "cost") return list.sort((a, b) => b.cost - a.cost);
    if (sortBy === "count") return list.sort((a, b) => b.count - a.count);
    if (sortBy === "qty") return list.sort((a, b) => b.qty - a.qty);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, sortBy]);

  const supplierSummary = useMemo(() => {
    const acc = {};
    entries.forEach(e => {
      const rawName = (e.supplier || "Unknown").trim();
      const key = rawName.toLowerCase();
      if (!acc[key]) acc[key] = { name: rawName, count: 0, cost: 0 };
      if (rawName.length > acc[key].name.length || (rawName !== acc[key].name && rawName[0] === rawName[0].toUpperCase())) {
        acc[key].name = rawName;
      }
      acc[key].count++;
      acc[key].cost += e.total || 0;
    });
    return Object.values(acc).sort((a, b) => b.cost - a.cost);
  }, [entries]);

  const pieData = useMemo(() => matSummary.slice(0, 8).map(m => ({ name: m.name.length > 18 ? m.name.slice(0, 18) + "…" : m.name, value: m.cost })), [matSummary]);

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <div className="kgm-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        <KPICard label="Total Cost" value={fmt(totalCost)} />
        <KPICard label="Entries" value={entries.length} />
        <KPICard label="Unique Materials" value={matSummary.length} />
        <KPICard label="Suppliers" value={uniqueSuppliers} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: pieData.length > 1 ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 20 }}>
        {pieData.length > 1 && (
          <div style={S.card}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: T.text, textTransform: "uppercase", fontWeight: 800, marginBottom: 16 }}>Cost Distribution</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={4} stroke={T.card} strokeWidth={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: theme === "dark" ? "#1c2028" : "#ffffff", border: `1px solid ${theme === "dark" ? "#474747" : "#cccccc"}`, fontSize: 12, color: T.text }} itemStyle={{ color: T.text }} labelStyle={{ color: T.textMuted, fontSize: 10 }} />
                <Legend wrapperStyle={{ color: T.text, fontSize: 12, paddingTop: 8 }} formatter={value => <span style={{ color: T.text, fontSize: 11 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={S.card}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.text, textTransform: "uppercase", fontWeight: 800, marginBottom: 16 }}>Top Suppliers by Spend</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Supplier", "Orders", "Total"].map(h => <th key={h} style={{ ...thS, fontSize: 9 }}>{h}</th>)}</tr></thead>
              <tbody>
                {supplierSummary.slice(0, 8).map((s, i) => {
                  const pct = totalCost > 0 ? Math.round((s.cost / totalCost) * 100) : 0;
                  return (
                    <tr key={s.name} style={{ background: i % 2 === 0 ? T.tableBg1 : T.tableBg2 }}>
                      <td style={{ ...tdS, fontWeight: 700, color: T.text, fontSize: 12 }}>{s.name}</td>
                      <td style={{ ...tdS, color: T.textMuted }}>{s.count}</td>
                      <td style={{ ...tdS }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: T.text, fontWeight: 700, fontSize: 12 }}>{fmt(s.cost)}</span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...S.card, marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, color: T.text, textTransform: "uppercase", fontWeight: 800 }}>Material Breakdown</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ label: "By Cost", val: "cost" }, { label: "By Count", val: "count" }, { label: "A-Z", val: "name" }].map(s => (
              <button key={s.val} onClick={() => setSortBy(s.val)} style={{ ...S.btnGhost, padding: "4px 10px", fontSize: 10, color: sortBy === s.val ? T.text : T.textMuted, borderColor: sortBy === s.val ? T.text : T.cardBorder }}>{s.label}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Material", "Purchases", "Total Qty", "Total Cost", "% of Spend", "Suppliers"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {matSummary.map((m, i) => (
                <tr key={m.name} style={{ background: i % 2 === 0 ? T.tableBg1 : T.tableBg2 }}>
                  <td style={tdS}><span style={{ fontWeight: 700, color: T.text }}>{m.name}</span></td>
                  <td style={tdS}>{m.count}</td>
                  <td style={tdS}>{m.qty > 0 ? `${m.qty.toLocaleString()} ${m.unit}` : "—"}</td>
                  <td style={{ ...tdS, color: T.text, fontWeight: 700 }}>{fmt(m.cost)}</td>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 80, height: 6, background: T.cardBorder, borderRadius: 3 }}>
                        <div style={{ width: `${totalCost ? Math.round((m.cost / totalCost) * 100) : 0}%`, height: "100%", background: T.text, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{totalCost ? Math.round((m.cost / totalCost) * 100) : 0}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, color: T.textMuted }}>{m.suppliers > 0 ? m.suppliers : "—"}</td>
                </tr>
              ))}
              {matSummary.length === 0 && <tr><td colSpan={6} style={{ ...tdS, textAlign: "center", color: T.textMuted, padding: 28 }}>No material data yet.</td></tr>}
            </tbody>
            <tfoot>
              <tr style={{ background: T.tableBg1, borderTop: `2px solid ${T.cardBorder}` }}>
                <td style={{ ...tdS, fontWeight: 800, color: T.text, letterSpacing: 1 }}>TOTAL</td>
                <td style={tdS}>{entries.length}</td>
                <td style={tdS}>{totalQty > 0 ? totalQty.toLocaleString() : "—"}</td>
                <td style={{ ...tdS, fontWeight: 800, color: T.text }}>{fmt(totalCost)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
