import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

let toastId = 0;
export function notify(message, type = "success", onUndo) {
  const id = ++toastId;
  window.dispatchEvent(new CustomEvent("kgm-toast", { detail: { id, message, type, onUndo } }));
}

export function ToastContainer() {
  const { T } = useTheme();
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const t = e.detail;
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
    };
    window.addEventListener("kgm-toast", handler);
    return () => window.removeEventListener("kgm-toast", handler);
  }, []);

  return (
    <div style={{ position: "fixed", bottom: "max(20px, calc(60px + env(safe-area-inset-bottom)))", right: 20, zIndex: 2000, display: "flex", flexDirection: "column-reverse", gap: 8, maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#742a2a" : t.type === "undo" ? T.card : "#1a4731",
          border: `1px solid ${t.type === "error" ? "#fc8181" : t.type === "undo" ? T.text : "#48bb78"}`,
          borderRadius: 0, padding: "12px 16px", fontSize: 13, color: t.type === "undo" ? T.text : "#fff",
          boxShadow: "none", animation: "fadeUp 0.3s ease",
          display: "flex", alignItems: "center", gap: 10
        }}>
          <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{t.type === "error" ? "✕" : t.type === "undo" ? "↺" : "✓"}</span>
          <span style={{ flex: 1, letterSpacing: 0.5 }}>{t.message}</span>
          {t.type === "undo" && t.onUndo && (
            <button onClick={t.onUndo} style={{ background: T.text, border: "none", color: T.page, padding: "4px 12px", borderRadius: 0, fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>Undo</button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Overlay({ onClose, children, title }) {
  const { S, T } = useTheme();
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="overlay-title" className="kgm-overlay-bg" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="kgm-overlay-content" style={{ border: "none", padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span id="overlay-title" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: T.text }}>{title}</span>
          <button onClick={onClose} aria-label="Close dialog" style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Label({ children }) {
  const { T } = useTheme();
  return <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 9, letterSpacing: 2.5, color: T.textMuted, textTransform: "uppercase", fontWeight: 600, marginBottom: 5, marginTop: 12 }}>{children}</div>;
}

export function KPICard({ label, value, danger, green }) {
  const { S, T } = useTheme();
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={{ ...S.cardValue, color: danger ? "#fc8181" : green ? "#48bb78" : T.text }}>{value}</div>
    </div>
  );
}

export function LoadingSpinner({ text = "Loading..." }) {
  const { T } = useTheme();
  return (
    <div style={{ padding: 40, textAlign: "center", color: T?.textMuted || "#919191" }}>
      <div style={{ width: 120, height: 2, background: T?.cardBorder || "#1c2028", overflow: "hidden", margin: "0 auto 16px" }}>
        <div style={{ width: "30%", height: "100%", background: T?.text || "#ffffff", animation: "slide 1.2s ease infinite" }} />
      </div>
      <style>{`@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
      {text}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16, style = {} }) {
  return <div className="kgm-skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "12px" }}><Skeleton width={i === 0 ? 30 : i === 2 ? 120 : 60} height={12} /></td>
      ))}
    </tr>
  );
}
