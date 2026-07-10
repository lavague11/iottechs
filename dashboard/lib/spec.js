// Spec-aligned constants from the IOT App Revamp Build Spec (v1.0).
// Pure data — safe to import from both server and client components.

// ---- 9-stage project lifecycle ----
// OPEN: Inquiry → Site Survey → Proposal → Approval & Deposit
// IN_PROGRESS: Schedule → Install → QC
// CLOSED: Payment → Completion
export const STATUS_BUCKETS = {
  OPEN:        ["inquiry", "site_survey", "proposal", "approval_deposit"],
  IN_PROGRESS: ["schedule", "install", "qc"],
  CLOSED:      ["payment", "completion"],
};

export const STAGES = [
  { key: "inquiry",          label: "Inquiry",            short: "Inquiry",   bucket: "OPEN" },
  { key: "site_survey",      label: "Site Survey",        short: "Survey",    bucket: "OPEN" },
  { key: "proposal",         label: "Proposal",           short: "Proposal",  bucket: "OPEN" },
  { key: "approval_deposit", label: "Approval & Deposit", short: "Approval",  bucket: "OPEN" },
  // Renamed from "Schedule" per owner (2026-07-07): the stage covers deposit, procurement,
  // tech assignment, and appointment confirmation — "Fulfillment" fits; key stays "schedule".
  { key: "schedule",         label: "Fulfillment",        short: "Fulfillment", bucket: "IN_PROGRESS" },
  { key: "install",          label: "Install",            short: "Install",   bucket: "IN_PROGRESS" },
  { key: "qc",               label: "QC",                 short: "QC",        bucket: "IN_PROGRESS" },
  { key: "payment",          label: "Payment",            short: "Payment",   bucket: "CLOSED" },
  { key: "completion",       label: "Completion",         short: "Completion",bucket: "CLOSED" },
];

export const stageLabel      = (key) => STAGES.find((s) => s.key === key)?.label || key;
export const stageShortLabel = (key) => STAGES.find((s) => s.key === key)?.short || stageLabel(key);
export const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);

// Which stages apply per project type.
// A = New System (all 9), B = Upgrade (all 9), C = Service Call (6 — no pre-sale stages).
const TYPE_STAGES = {
  A: STAGES.map((s) => s.key),
  B: STAGES.map((s) => s.key),
  C: ["inquiry", "schedule", "install", "qc", "payment", "completion"],
};
export function stagesForType(type) {
  return (TYPE_STAGES[type] || TYPE_STAGES.A).map((k) => STAGES.find((s) => s.key === k));
}

// Technician's 4-stage view — different labels than the master lifecycle.
export const TECH_STAGES = [
  { key: "proposal", label: "Work Order Created" },
  { key: "install",  label: "Install" },
  { key: "qc",       label: "QC" },
  { key: "payment",  label: "Payout" },
];

// Gateway access rules (spec §03). PINs map to view types, not accounts.
// Login roles resolve to their own view; login ALWAYS wins over a PIN.
export const PIN_VIEW = {
  customer: "customer",
  tech:     "tech",
  vendor:   "vendor",
  readonly: "readonly",
};
export const LOGIN_VIEW = {
  admin:    "admin",
  manager:  "manager",
  sales:    "sales",
  tech:     "tech",
  customer: "customer",
};
// Cost/margin is admin/manager only — never exposed to these views (spec §06, §11).
export const COST_SAFE_VIEWS = new Set(["admin", "manager"]);

// ---- Service lines and their 2-letter codes (for the Access Portal ID) ----
export const SERVICE_CODES = {
  SC: "Security Cameras",
  SS: "Sound System",
  TP: "Toast POS",
  AS: "Alarm Systems",
  AC: "Access Control",
  WX: "Wiring",
  CX: "Custom",
  MX: "Mixed",
};

// ---- Project types ----
export const PROJECT_TYPES = {
  A: "New System",
  B: "Upgrade",
  C: "Service Call",
};

// ---- Roles. Vendor is kept per the resolved spec decision. ----
export const ROLES = [
  { key: "admin",    label: "Admin",       code: "AD" },
  { key: "manager",  label: "Manager",     code: "MG" },
  { key: "sales",    label: "Sales",       code: "SA" },
  { key: "tech",     label: "Technician",  code: "TX" },
  { key: "customer", label: "Customer",    code: "CX" },
  { key: "vendor",   label: "Vendor",      code: "VN" },
];

// ---- Access Portal ID: [type][2-letter service][4-char base36 counter] ----
export function makeAccessId(type, serviceCode, counter) {
  const n = counter.toString(36).toUpperCase().padStart(4, "0");
  return `${type}${serviceCode}${n}`;
}

// ===========================================================================
// Dashboard buckets (staff list view) — distinct from lifecycle stages.
// ===========================================================================
export const CATEGORIES = [
  { key: "open",      label: "Open Jobs" },
  { key: "pending",   label: "Pending Jobs" },
  { key: "upgrade",   label: "Upgrades" },
  { key: "service",   label: "Service Calls" },
  { key: "completed", label: "Completed" },
];

export const STATUS = {
  lead:          "Lead",
  survey:        "Site Survey",
  quoted:        "Quoted",
  approved:      "Approved",
  scheduled:     "Scheduled",
  installing:    "Installing",
  open:          "Open",
  dispatched:    "Dispatched",
  onsite:        "On Site",
  awaiting_parts:"Awaiting Parts",
  closed:        "Closed",
};

export const STATUS_TONE = {
  lead:          "gray",
  survey:        "blue",
  quoted:        "amber",
  approved:      "blue",
  scheduled:     "blue",
  installing:    "amber",
  open:          "gray",
  dispatched:    "blue",
  onsite:        "amber",
  awaiting_parts:"red",
  closed:        "green",
};

export const SECTION = {
  open:      "Active Projects",
  pending:   "Quotes & Proposals",
  upgrade:   "Upgrades",
  service:   "Service Requests",
  completed: "Completed",
};
