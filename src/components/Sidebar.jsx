import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import kgmLogo from '../assets/kgm-homes-logo.jpeg';

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 64;

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "materials", label: "Material Purchases", icon: "shopping_cart" },
  { id: "matsummary", label: "Material Summary", icon: "pie_chart" },
  { id: "contractors", label: "Contractors", icon: "engineering" },
  { id: "payments", label: "Payment Log", icon: "payments" },
  { id: "suppliers", label: "Supplier Balances", icon: "account_balance_wallet" },
  { id: "budget", label: "Budget vs Actual", icon: "analytics" },
  { id: "boq", label: "BOQ", icon: "table_chart" },
  { id: "ledgers", label: "Ledgers", icon: "menu_book" },
  { id: "aiinsights", label: "AI Insights", icon: "psychology" },

  { id: "progress", label: "Progress", icon: "photo_camera" }
];

const NEW_ENTRY_OPTIONS = [
  { id: "materials", label: "New Material", icon: "shopping_cart" },
  { id: "contractors", label: "New Contractor", icon: "engineering" },
  { id: "payments", label: "New Payment", icon: "payments" },
];

export { TABS, SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED };

export default function Sidebar({ tab, setTab }) {
  const { T } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const newEntryRef = useRef(null);

  const expanded = !collapsed || hovered;
  const railWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const panelWidth = collapsed && hovered ? SIDEBAR_EXPANDED : railWidth;

  useEffect(() => {
    const handler = (e) => {
      if (newEntryRef.current && !newEntryRef.current.contains(e.target)) setShowNewEntry(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--kgm-sidebar-width", `${railWidth}px`);
    return () => document.documentElement.style.removeProperty("--kgm-sidebar-width");
  }, [railWidth]);

  return (
    <aside
      onMouseEnter={() => { if (collapsed) setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", flexDirection: "column", position: "fixed",
        left: 0, top: 0, width: panelWidth, height: "100vh",
        background: T.sidebarBg, borderRight: `1px solid ${T.sidebarBorder}`,
        zIndex: 50, fontFamily: "'Inter',sans-serif", fontSize: 11,
        letterSpacing: 2, textTransform: "uppercase",
        transition: "width 0.2s ease, box-shadow 0.2s ease", overflow: "hidden",
        boxShadow: collapsed && hovered ? "0 12px 48px rgba(15, 23, 42, 0.28)" : "none",
      }}
      data-sidebar-width={railWidth}
    >
      {/* Logo + Collapse Toggle */}
      <div style={{ padding: expanded ? "24px 24px" : "24px 12px 12px", borderBottom: `1px solid ${T.sidebarBorder}`, display: "flex", flexDirection: "column", alignItems: expanded ? "flex-start" : "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <img src={kgmLogo} alt="KGM Homes logo" style={{ width: 36, height: 36, minWidth: 36, objectFit: "cover", border: `1px solid ${T.sidebarBorder}` }} />
          {expanded && <h1 style={{ fontWeight: 300, letterSpacing: "0.3em", color: T.text, fontSize: 12, margin: 0, whiteSpace: "nowrap" }}>KGM HOMES</h1>}
        </div>
        {expanded && <p style={{ color: T.navInactiveText, fontSize: 9, letterSpacing: "0.2em", margin: 0 }}>Project Tracker v1.0</p>}
        <button onClick={() => setCollapsed(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: T.navInactiveText, padding: 0, width: expanded ? "auto" : 32, display: "flex", alignItems: "center", justifyContent: "center" }} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, transform: expanded ? "rotate(0)" : "rotate(180deg)", transition: "transform 0.2s" }}>menu_open</span>
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, paddingTop: 24 }}>
        {TABS.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} title={!expanded ? t.label : undefined} style={{
            display: "flex", alignItems: "center",
            gap: expanded ? 16 : 0,
            padding: expanded ? "16px 24px" : "16px 0",
            justifyContent: expanded ? "flex-start" : "center",
            cursor: "pointer", transition: "all 0.15s",
            borderLeft: tab === t.id ? `2px solid ${T.text}` : "2px solid transparent",
            background: tab === t.id ? T.navActiveBg : "transparent",
            color: tab === t.id ? T.navActiveText : T.navInactiveText,
            whiteSpace: "nowrap",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
            {expanded && <span>{t.label}</span>}
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div style={{ padding: expanded ? "24px 24px" : "16px 12px", borderTop: `1px solid ${T.sidebarBorder}`, position: "relative" }} ref={newEntryRef}>
        {showNewEntry && expanded && (
          <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: T.card, border: `1px solid ${T.cardBorder}`, marginBottom: 4, zIndex: 10 }}>
            {NEW_ENTRY_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => { setShowNewEntry(false); setTab(opt.id); window.dispatchEvent(new CustomEvent("kgm-open-new-entry", { detail: { tab: opt.id } })); }} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "12px 24px", background: "none", border: "none",
                color: T.text, cursor: "pointer", fontFamily: "'Inter',sans-serif",
                fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                textAlign: "left", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.navActiveBg}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {expanded ? (
          <button onClick={() => setShowNewEntry(o => !o)} style={{
            width: "100%", background: T.text, color: T.page,
            padding: "12px 0", fontFamily: "'Inter',sans-serif",
            fontWeight: 700, fontSize: 10, letterSpacing: 2,
            textTransform: "uppercase", cursor: "pointer", border: "none",
          }}>New Entry</button>
        ) : (
          <button onClick={() => setHovered(true)} style={{
            width: "100%", background: T.text, color: T.page,
            padding: "8px 0", cursor: "pointer", border: "none",
            fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }} title="New Entry">+</button>
        )}
      </div>
    </aside>
  );
}
