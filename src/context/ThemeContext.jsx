import React, { createContext, useContext, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

// Modern Financial Color Palette (Stripe/Linear Inspired)
export const DARK = {
  page: "#0f172a", // Deep Slate (not pure black)
  header: "#0f172a", headerBorder: "#1e293b",
  card: "#1e293b", cardBorder: "#334155",
  input: "#0f172a", inputBorder: "#334155",
  tableBg1: "#0f172a", tableBg2: "#1e293b", tableHeaderBg: "#1e293b",
  text: "#f8fafc", textMuted: "#94a3b8", textAccent: "#ffffff",
  bodyBg: "#0f172a", tabBar: "#0f172a",
  financial: "#3b82f6", // Trustworthy Blue (Primary Action)
  success: "#10b981", // Emerald Green (Income/Positive)
  danger: "#f43f5e", // Rose Red (Expense/Negative)
  warning: "#f59e0b", // Amber (Alerts)
  overlay: "rgba(15, 23, 42, 0.8)", overlayBlur: "12px",
  sidebarBg: "#0f172a", sidebarBorder: "#1e293b",
  navActiveBg: "#1e293b", navActiveText: "#3b82f6", navInactiveText: "#64748b",
};

export const LIGHT = {
  page: "#f1f5f9", // Cool Grey Background (Modern SaaS feel)
  header: "#ffffff", headerBorder: "#e2e8f0",
  card: "#ffffff", cardBorder: "#e2e8f0", // Subtle borders
  input: "#ffffff", inputBorder: "#cbd5e1",
  tableBg1: "#ffffff", tableBg2: "#f8fafc", tableHeaderBg: "#f8fafc",
  text: "#0f172a", textMuted: "#64748b", textAccent: "#334155",
  bodyBg: "#f1f5f9", tabBar: "#ffffff",
  financial: "#2563eb", // Vibrant Royal Blue
  success: "#059669", // Deep Emerald
  danger: "#e11d48", // Rose Red
  warning: "#d97706", // Amber
  overlay: "rgba(255, 255, 255, 0.9)", overlayBlur: "12px",
  sidebarBg: "#ffffff", sidebarBorder: "#e2e8f0",
  navActiveBg: "#eff6ff", navActiveText: "#2563eb", navInactiveText: "#94a3b8",
};

export const makeStyles = (T) => ({
  page: { background: T.page, minHeight: "100vh", color: T.text, fontFamily: "'Inter','Helvetica Neue',sans-serif", width: "100%" },
  header: { background: T.header, borderBottom: `1px solid ${T.headerBorder}`, padding: "18px 28px" },
  body: { padding: "22px 28px" },
  card: { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: "8px", padding: "20px 24px", transition: "background 0.2s ease", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)" },
  cardLabel: { fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, color: T.textMuted, textTransform: "uppercase", marginBottom: 8, fontWeight: 600 },
  cardValue: { fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.5 },
  inp: { width: "100%", background: T.input, border: `1px solid ${T.inputBorder}`, color: T.text, padding: "10px 12px", fontSize: 14, borderRadius: "6px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s ease, box-shadow 0.2s ease", fontFamily: "'Inter',sans-serif" },
  btnGold: { background: T.financial, color: "#ffffff", border: "none", padding: "10px 24px", fontWeight: 600, fontSize: 13, letterSpacing: 0, cursor: "pointer", borderRadius: "6px", transition: "all 0.15s ease", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" },
  btnGhost: { background: "transparent", border: `1px solid ${T.cardBorder}`, color: T.text, padding: "10px 24px", fontWeight: 500, fontSize: 13, letterSpacing: 0, cursor: "pointer", borderRadius: "6px", transition: "all 0.15s ease" },
  btnDanger: { background: "#fee2e2", border: "1px solid #fecaca", color: "#b91c1c", padding: "6px 12px", fontSize: 12, fontWeight: 500, letterSpacing: 0, cursor: "pointer", borderRadius: "4px", transition: "all 0.15s ease" },
  btnEdit: { background: T.navActiveBg, border: `1px solid ${T.cardBorder}`, color: T.text, padding: "6px 12px", fontSize: 12, fontWeight: 500, letterSpacing: 0, cursor: "pointer", borderRadius: "4px", transition: "all 0.15s ease" },
  thS: { padding: "12px 16px", textAlign: "left", fontFamily: "'Inter',sans-serif", fontSize: 11, letterSpacing: 0.5, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap", background: T.tableBg2, borderBottom: `1px solid ${T.cardBorder}`, borderRadius: 0 },
  tdS: { padding: "14px 16px", fontSize: 13, whiteSpace: "nowrap", borderBottom: `1px solid ${T.cardBorder}`, color: T.text, fontFamily: "'Inter',sans-serif" },
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('kgm_theme') || "dark");
  const T = theme === "dark" ? DARK : LIGHT;
  const S = makeStyles(T);
  
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem('kgm_theme', next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, T, S, toggle: toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
