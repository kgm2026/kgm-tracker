import { useTheme } from '../context/ThemeContext';

const MOBILE_TABS = [
  { id: "dashboard", icon: "dashboard" },
  { id: "materials", icon: "shopping_cart" },
  { id: "contractors", icon: "engineering" },
  { id: "payments", icon: "payments" },
  { id: "budget", icon: "analytics" },
];

export default function MobileNav({ tab, setTab }) {
  const { T } = useTheme();

  return (
    <nav style={{
      display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
      background: T.header, borderTop: `1px solid ${T.headerBorder}`,
      justifyContent: "space-around", padding: "12px 0 max(12px, env(safe-area-inset-bottom))",
      zIndex: 50,
    }} className="kgm-mobile-nav">
      {MOBILE_TABS.map(item => (
        <span key={item.id} className="material-symbols-outlined" onClick={() => setTab(item.id)} style={{ cursor: "pointer", fontSize: 24, color: tab === item.id ? T.text : T.navInactiveText, transition: "color 0.15s" }}>{item.icon}</span>
      ))}
    </nav>
  );
}
