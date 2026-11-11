// One source of truth for the Expenses feature — the fixed option lists, the vendor→colour map, category
// normalization, CSV parsing, and per-row validation. Pure + dependency-free so the modal, the table, the
// CSV importer, the server action and the tests all agree. Money is plain dollars (may carry cents and may
// be negative — a refund/credit).

export const EXPENSE_CATEGORIES = [
  "Equipment", "Tools", "Cable & Materials", "Software/Subscriptions", "Vehicle & Fuel",
  "Tolls & Parking", "Insurance", "Labor/Subcontractor", "Office & Supplies", "Marketing", "Rent", "Other",
];
export const PAYMENT_METHODS = ["PayPal", "Amazon", "Home Depot", "Zelle", "Other"];
export const ITEM_TYPES = [
  "Camera", "NVR/DVR", "Cable", "Connectors/Jacks", "Networking", "Access Control",
  "Audio", "Power Tool", "Hand Tool", "Ladder", "Battery/Charger", "Consumables", "Other",
];
export const SOURCES = ["PayPal", "Amazon", "Home Depot"];

// Type-or-pick suggestions so filing is fast (shown as a datalist on the Vendor / Description fields — the
// user can still type anything). Extend these lists freely.
export const COMMON_VENDORS = [
  "Annke", "Amazon", "Home Depot", "Lowe's", "Harbor Freight", "Best Buy", "Walmart", "Costco",
  "B&H Photo", "Newegg", "Graybar", "Anixter", "ADI Global", "Ubiquiti", "Hikvision Distributor",
  "Uline", "Shell", "EZ-Pass", "Verizon", "AT&T",
];
export const COMMON_DESCRIPTIONS = [
  "4K dome cameras", "Bullet cameras", "PTZ camera", "NVR recorder", "DVR recorder",
  "Surveillance hard drive", "PoE switch", "Network switch", "Router", "Cat6 cable", "Cat5e cable",
  "RG59 siamese cable", "BNC connectors", "RJ45 connectors / jacks", "Power supply", "UPS battery backup",
  "Mounting brackets", "Junction boxes", "Conduit", "Zip ties / consumables", "Drill / bit set",
  "Ladder", "Fuel", "Tolls & parking", "Monitor",
];

// Picking a Source pre-fills payment_method (and vendor for the marketplaces) when those are empty.
export const SOURCE_DEFAULTS = {
  "PayPal":     { payment_method: "PayPal" },
  "Amazon":     { payment_method: "Amazon", vendor: "Amazon" },
  "Home Depot": { payment_method: "Home Depot", vendor: "Home Depot" },
};

// Vendor colour coding — add new vendors here. `test(vendor)` matches; fg keeps text readable on the tint.
export const VENDOR_COLORS = [
  { key: "annke",     test: (v) => /annke|安科|zengen/i.test(v), bg: "#B2DFDB", fg: "#0b3b37", label: "Annke" },
  { key: "amazon",    test: (v) => /\bamazon\b/i.test(v),        bg: "#FFD814", fg: "#1a1a1a", label: "Amazon" },
  { key: "homedepot", test: (v) => /home\s*depot/i.test(v),      bg: "#F96302", fg: "#ffffff", label: "Home Depot" },
];
// → { bg, fg, label, key } for a vendor, or null for no tint.
export function vendorColor(vendor) {
  const v = String(vendor || "").trim();
  if (!v) return null;
  return VENDOR_COLORS.find((c) => c.test(v)) || null;
}

// Old category names → the fixed list. Anything unknown becomes "Other" (safe, non-destructive).
const CATEGORY_MIGRATION = {
  "materials": "Cable & Materials", "cable & materials": "Cable & Materials",
  "vehicle": "Vehicle & Fuel", "gas": "Vehicle & Fuel", "vehicle & fuel": "Vehicle & Fuel", "fuel": "Vehicle & Fuel",
  "software": "Software/Subscriptions", "software/subscriptions": "Software/Subscriptions", "subscriptions": "Software/Subscriptions",
  "tolls": "Tolls & Parking", "parking": "Tolls & Parking", "tolls & parking": "Tolls & Parking",
  "payroll": "Labor/Subcontractor", "labor": "Labor/Subcontractor", "subcontractor": "Labor/Subcontractor", "labor/subcontractor": "Labor/Subcontractor",
  "operations": "Other", "overhead": "Other", "office": "Office & Supplies", "office & supplies": "Office & Supplies", "supplies": "Office & Supplies",
};
const _catIndex = new Map(EXPENSE_CATEGORIES.map((c) => [c.toLowerCase(), c]));
// Map any input to exactly one of EXPENSE_CATEGORIES (default "Other"). Empty → "Other".
export function normalizeCategory(cat) {
  const k = String(cat || "").trim().toLowerCase();
  if (!k) return "Other";
  return _catIndex.get(k) || CATEGORY_MIGRATION[k] || "Other";
}

// A YYYY-MM-DD date from common inputs (ISO, M/D/YYYY, M-D-YY). Null when it can't be read.
export function normalizeDate(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : iso(d); }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[1] - 1, +m[2]); return isNaN(d) ? null : iso(d); }
  const d = new Date(s); return isNaN(d) ? null : iso(d);
}
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// An amount from "$1,234.56", "(436.00)" (accounting negative), "-55" → Number, or null if not a number.
export function parseAmount(input) {
  if (typeof input === "number") return isFinite(input) ? input : null;
  let s = String(input ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return isNaN(n) ? null : (neg ? -n : n);
}

// Validate + clean one expense (from the modal or a CSV row). Returns { cleaned, errors } where errors is
// keyed by field. A missing/zero amount and a bad date are errors; category is coerced (never an error).
export function validateExpense(raw) {
  const errors = {};
  const description = String(raw.description || "").trim();
  if (!description) errors.description = "Description is required.";
  const amount = parseAmount(raw.amount);
  if (amount === null) errors.amount = "Amount must be a number.";
  else if (amount === 0) errors.amount = "Amount can't be zero.";
  let spent_on = raw.spent_on ? normalizeDate(raw.spent_on) : null;
  if (raw.spent_on && !spent_on) errors.spent_on = "Unrecognized date.";
  const payment_method = cleanEnum(raw.payment_method, PAYMENT_METHODS);
  const item_type = cleanEnum(raw.item_type, ITEM_TYPES);
  const source = cleanEnum(raw.source, SOURCES);
  const cleaned = {
    description: description || "Expense",
    category: normalizeCategory(raw.category),
    amount: amount ?? 0,
    vendor: String(raw.vendor || "").trim() || null,
    spent_on,
    reference: String(raw.reference || "").trim() || null,
    payment_method, item_type, source,
    access_id: raw.access_id || null,
  };
  return { cleaned, errors };
}
function cleanEnum(v, list) {
  const s = String(v || "").trim();
  if (!s) return null;
  return list.find((x) => x.toLowerCase() === s.toLowerCase()) || null;
}

// ---- CSV ----------------------------------------------------------------------------------------------
export const CSV_COLUMNS = ["date", "description", "category", "amount", "vendor", "project", "reference", "payment_method", "source", "item_type"];
export const CSV_TEMPLATE = CSV_COLUMNS.join(",") + "\n" +
  "2026-01-22,Annke 4K dome cameras,Equipment,436.00,Annke,,8AB12345,PayPal,PayPal,Camera\n" +
  "2026-01-10,HDMI + RJ45 connectors,Connectors/Jacks,58.90,Amazon,,114-2876562-1537803,Amazon,Amazon,Connectors/Jacks\n";

// Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines, CRLF). Pure JS.
export function parseCSVText(text) {
  const rows = []; let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");   // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

// Parse a CSV into expense rows, mapping headers case-insensitively (header names may be snake or spaced).
// `project` column accepts a project access id (or blank for overhead). Returns [{...rawFields}] in order.
export function parseExpensesCSV(text) {
  const rows = parseCSVText(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (name) => header.indexOf(name);
  const get = (r, name) => { const i = idx(name); return i >= 0 ? String(r[i] ?? "").trim() : ""; };
  return rows.slice(1).map((r) => ({
    spent_on: get(r, "date"), description: get(r, "description"), category: get(r, "category"),
    amount: get(r, "amount"), vendor: get(r, "vendor"), access_id: get(r, "project"),
    reference: get(r, "reference"), payment_method: get(r, "payment_method"),
    source: get(r, "source"), item_type: get(r, "item_type"),
  }));
}

// ---- Duplicate matching (pure) -----------------------------------------------------------------------
// Soft match: same vendor + same amount within ±1 day. Hard match: same non-empty reference.
export function sameReference(a, b) {
  const ra = String(a || "").trim().toLowerCase(), rb = String(b || "").trim().toLowerCase();
  return !!ra && ra === rb;
}
export function softDuplicate(a, b) {
  const va = String(a.vendor || "").trim().toLowerCase(), vb = String(b.vendor || "").trim().toLowerCase();
  if (!va || va !== vb) return false;
  if (Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) > 0.005) return false;
  const da = a.spent_on ? Date.parse(a.spent_on) : NaN, db = b.spent_on ? Date.parse(b.spent_on) : NaN;
  if (isNaN(da) || isNaN(db)) return false;
  return Math.abs(da - db) <= 24 * 60 * 60 * 1000;
}
