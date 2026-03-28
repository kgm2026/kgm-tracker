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

export const CHART_COLORS = ["#ffffff", "#cccccc", "#999999", "#666666", "#444444", "#333333"];

export function parseDate(d) {
  if (!d) return new Date(0);
  if (d.includes("/")) {
    const [dd, mm, yyyy] = d.split("/");
    return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  }
  return new Date(d);
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

export function parseDateInput(d) {
  // Keep backwards compatibility with the current `parseDate()` formats.
  return parseDate(d);
}

export function formatDate(date) {
  if (!date) return "";
  if (date.includes("/")) return date;
  const d = new Date(date);
  if (isNaN(d)) return date;
  return d.toISOString().split('T')[0];
}
