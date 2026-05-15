export const fmtPlain = (n) => "PKR " + Number(n || 0).toLocaleString("en-PK");

// fmt returns a plain string — components that need styled numbers wrap it themselves.
export const fmt = fmtPlain;

export const STATUS_COLORS = {
  Paid: "#48bb78", paid: "#48bb78",
  Unpaid: "#fc8181", unpaid: "#fc8181",
  Partial: "#ffffff", partial: "#ffffff",
  "Not Started": "#666666",
  "In Progress": "#63b3ed",
  Completed: "#48bb78"
};

export const MATERIALS_LIST = [
  "Bricks", "Cement", "Sand (Ravi)", "Crush (Sargoda)", "Iron / Rebar",
  "Plumbing Pipes", "Electrical Wire", "Tiles", "Marble", "Paint",
  "Putty", "Plaster", "Wood", "Doors", "Windows", "Waterproofing",
  "Steel", "Ghassu / Earth Removal", "Other"
];

export const MATERIAL_CATEGORY_MAP = {
  "bricks": "grey", "cement": "grey", "sand": "grey", "crush": "grey",
  "iron": "grey", "rebar": "grey", "steel": "grey", "ghassu": "grey",
  "earth removal": "grey", "plumbing pipes": "grey", "electrical wire": "grey",
  "waterproofing": "grey",
  "tiles": "finishing", "marble": "finishing", "paint": "finishing",
  "putty": "finishing", "plaster": "finishing", "wood": "finishing",
  "doors": "finishing", "windows": "finishing"
};

export function suggestCategory(materialName) {
  if (!materialName) return null;
  const lower = materialName.trim().toLowerCase();
  for (const [keyword, cat] of Object.entries(MATERIAL_CATEGORY_MAP)) {
    if (lower.includes(keyword)) return cat;
  }
  return null;
}


/**
 * Safely parse any date string into a local Date object.
 * Handles: "YYYY-MM-DD" (Supabase ISO), "DD/MM/YYYY", "MM/DD/YYYY", ISO timestamps.
 * Never passes bare ISO date strings to `new Date()` to avoid UTC-midnight timezone shift.
 */
export function parseDate(d) {
  if (!d) return new Date(0);
  const s = String(d).trim();
  // "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm..." — split manually to stay in local time
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // "DD/MM/YYYY"
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  // fallback
  const fb = new Date(s);
  return isNaN(fb) ? new Date(0) : fb;
}

/**
 * Format any date value as "15 Mar 2026" — consistent across UI and PDFs.
 * Returns "—" for null / invalid.
 */
export function fmtDate(d) {
  if (!d) return "—";
  const dt = parseDate(d);
  if (!dt || isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function toInt(v, def = 0) {
  if (v == null || v === "") return def;
  const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : def;
}

export function toFloat(v, def = 0) {
  if (v == null || v === "") return def;
  const n = typeof v === "number" ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : def;
}


export function formatDate(date) {
  if (!date) return "";
  const s = String(date).trim();
  if (s.includes("/")) return s; // already formatted
  // Return as YYYY-MM-DD for <input type="date"> compatibility
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s;
}
