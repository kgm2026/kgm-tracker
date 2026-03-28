import { useTheme } from '../context/ThemeContext';

const PAGE_SIZES = [25, 50, 100];

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }) {
  const { T } = useTheme();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const btnStyle = (disabled) => ({
    background: "transparent",
    border: `1px solid ${T.cardBorder}`,
    color: disabled ? T.cardBorder : T.textMuted,
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "'Inter',sans-serif",
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    transition: "all 0.15s",
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.textMuted, flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          style={{ background: "transparent", border: `1px solid ${T.cardBorder}`, color: T.text, padding: "4px 8px", fontSize: 12, fontFamily: "'Inter',sans-serif", cursor: "pointer", outline: "none" }}
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>Showing {from}–{to} of {total}</span>
        <button onClick={() => onPageChange(1)} disabled={page <= 1} style={btnStyle(page <= 1)} title="First page">{"\u00AB"}</button>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} style={btnStyle(page <= 1)} title="Previous">{"\u2039"}</button>
        <span style={{ padding: "0 8px", fontWeight: 600, color: T.text }}>Page {page} of {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={btnStyle(page >= totalPages)} title="Next">{"\u203A"}</button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} style={btnStyle(page >= totalPages)} title="Last page">{"\u00BB"}</button>
      </div>
    </div>
  );
}
