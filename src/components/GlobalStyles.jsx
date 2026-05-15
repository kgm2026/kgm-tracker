import { useTheme } from '../context/ThemeContext';

export default function GlobalStyles() {
  const { T, theme } = useTheme();

  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes scaleIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      html, body, #root { width: 100%; min-height: 100vh; background: ${T.bodyBg}; scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
      ::selection { background: ${theme === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}; color: inherit; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #474747; border-radius: 0; }
      ::-webkit-scrollbar-thumb:hover { background: ${T.textMuted}; }
      input[type=date]::-webkit-calendar-picker-indicator { filter: ${theme === "dark" ? "invert(0.5)" : "none"}; }
      select option { background: ${T.card}; color: ${T.text}; }

      button { transition: all 0.15s ease; }
      button:hover { filter: brightness(${theme === "dark" ? "1.12" : "0.92"}); }
      button:active { filter: brightness(${theme === "dark" ? "0.9" : "0.85"}); }

      input, select, textarea {
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      input:focus, select:focus, textarea:focus {
        border-color: ${T.text} !important;
        box-shadow: 0 1px 0 0 ${T.text} !important;
        outline: none;
      }

      table tbody tr { transition: background 0.15s ease; }
      table tbody tr:hover { background: ${theme === "dark" ? "#1c2028" : "#e8e8e8"} !important; }

      .kgm-overlay-bg { animation: fadeIn 0.2s ease; backdrop-filter: blur(${T.overlayBlur || "20px"}); }
      .kgm-overlay-content { animation: scaleIn 0.25s ease; background: ${T.overlay || T.card} !important; }

      .kgm-skeleton {
        background: linear-gradient(90deg, ${T.cardBorder} 25%, ${theme === "dark" ? "#252a32" : "#d0d0d0"} 50%, ${T.cardBorder} 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 0;
      }

      @media print { .no-print { display: none !important; } body { background: white; } * { color: black !important; background: white !important; border-color: #ccc !important; box-shadow: none !important; } }
      @media (max-width: 1023px) {
        aside[style] { display: none !important; }
        .kgm-main { margin-left: 0 !important; padding-bottom: calc(84px + env(safe-area-inset-bottom)); }
        .kgm-mobile-nav { display: flex !important; }
      }
      @media (max-width: 640px) {
        .kgm-header { padding: 14px 14px !important; height: auto !important; min-height: 76px; align-items: flex-start !important; gap: 12px; }
        .kgm-header-main { width: 100%; min-width: 0; gap: 14px !important; align-items: flex-start !important; flex-wrap: wrap; }
        .kgm-project-trigger { min-width: 0; max-width: 100%; }
        .kgm-project-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kgm-project-address { display: none; }
        .kgm-user-email { display: none; }
        .kgm-header-actions { width: 100%; flex-wrap: wrap; }
        .kgm-body { padding: 14px 12px !important; }
        .kgm-ledger-layout { flex-direction: column !important; }
        .kgm-ledger-sidebar { width: 100% !important; }
        table { font-size: 11px !important; }
        th, td { padding: 7px 8px !important; white-space: nowrap; }
      }
      @media (max-width: 480px) {
        .kgm-project-name { font-size: 15px !important; }
      }
    `}</style>
  );
}
