import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { TABS } from './Sidebar';

const PRIMARY_TAB_IDS = ["dashboard", "materials", "contractors", "payments"];

export default function MobileNav({ tab, setTab }) {
  const { T } = useTheme();
  const [showMore, setShowMore] = useState(false);
  const menuRef = useRef(null);

  const primaryTabs = TABS.filter(item => PRIMARY_TAB_IDS.includes(item.id));
  const extraTabs = TABS.filter(item => !PRIMARY_TAB_IDS.includes(item.id));
  const moreActive = showMore || !PRIMARY_TAB_IDS.includes(tab);

  useEffect(() => {
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const changeTab = (nextTab) => {
    setShowMore(false);
    setTab(nextTab);
  };

  return (
    <>
      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.28)", zIndex: 54 }}
        />
      )}

      {showMore && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: "calc(78px + env(safe-area-inset-bottom))",
            background: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 14,
            padding: 8,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.26)",
            zIndex: 55,
            display: "grid",
            gap: 4,
          }}
        >
          {extraTabs.map(item => (
            <button
              key={item.id}
              onClick={() => {
                changeTab(item.id);
              }}
              style={{
                background: tab === item.id ? T.navActiveBg : "transparent",
                border: "none",
                color: tab === item.id ? T.navActiveText : T.text,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontFamily: "'Inter',sans-serif",
                fontSize: 13,
                fontWeight: 600,
                textAlign: "left",
                cursor: "pointer",
                borderRadius: 10,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <nav style={{
        display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
        background: T.header, borderTop: `1px solid ${T.headerBorder}`,
        justifyContent: "space-around", padding: "10px 8px max(10px, env(safe-area-inset-bottom))",
        zIndex: 56, gap: 4,
      }} className="kgm-mobile-nav">
        {primaryTabs.map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              style={{
                flex: 1,
                minWidth: 0,
                background: active ? T.navActiveBg : "transparent",
                border: "none",
                color: active ? T.navActiveText : T.navInactiveText,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "8px 4px",
                borderRadius: 12,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                {item.label === "Contractors" ? "Crew" : item.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setShowMore(prev => !prev)}
          style={{
            flex: 1,
            minWidth: 0,
            background: moreActive ? T.navActiveBg : "transparent",
            border: "none",
            color: moreActive ? T.navActiveText : T.navInactiveText,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "8px 4px",
            borderRadius: 12,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{showMore ? "close" : "apps"}</span>
          <span style={{ fontSize: 9, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
            More
          </span>
        </button>
      </nav>
    </>
  );
}
