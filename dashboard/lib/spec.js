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

// ---- Unified 5-phase view — shown to EVERY role (2026-07-13; split to 5 on 2026-07-15). ----
// The backend still runs all 9 stages (auto-advance, requirements, history all unchanged); this is
// a pure view grouping that merges them into 5 steps on the progress bar, and each phase co-renders
// the tools of its member stages. `primary` is where a phase-dot click lands when the project isn't
// currently inside that phase.
// status: the word shown in the project-header pill for each phase (Consulting=Pending,
// Proposal=Reviewing, Install=In Progress, Completion=Finalizing). "Complete"/100% is a
// separate terminal state reached only once the balance is paid and the system is released.
// `techLabel` — the technician's wording for the same bar (their phase 2 is accepting the work
// order, not building the proposal): Survey → Accept → Install → Completion.
export const PHASES = [
  { key: "ph_survey",   label: "Consulting",  short: "Consulting",  techLabel: "Survey",     status: "Pending",     members: ["inquiry", "site_survey"],       primary: "site_survey" },
  { key: "ph_proposal", label: "Proposal",    short: "Proposal",    techLabel: "Accept",     status: "Reviewing",   members: ["proposal", "approval_deposit"], primary: "proposal" },
  { key: "ph_install",  label: "Install",     short: "Install",     techLabel: "Install",    status: "In Progress", members: ["schedule", "install"],          primary: "install" },
  // Split into two closing steps (2026-07-15): Closeout = the last hands-on work (System QR handover,
  // QC, final payment); Completion = a read-only "you're all done" wrap-up. Same for every role.
  { key: "ph_wrap",     label: "Closeout",    short: "Closeout",    techLabel: "Closeout",   status: "Finalizing",  members: ["qc", "payment"],                primary: "qc" },
  { key: "ph_complete", label: "Completion",  short: "Completion",  techLabel: "Completion", status: "Finalizing",  members: ["completion"],                   primary: "completion" },
];
export const phaseStatusWord = (phaseKey) => PHASES.find((p) => p.key === phaseKey)?.status || "Pending";
export const phaseLabelOf    = (phaseKey) => PHASES.find((p) => p.key === phaseKey)?.label || phaseKey;
export function phasesForType(type) {
  const present = new Set(stagesForType(type).map((s) => s.key));
  return PHASES
    .map((p) => ({ ...p, members: p.members.filter((m) => present.has(m)) }))
    .filter((p) => p.members.length > 0)
    .map((p) => ({ ...p, primary: p.members.includes(p.primary) ? p.primary : p.members[p.members.length - 1] }));
}
// Master lifecycle stage → its 4-phase key (for the "current" bar marker + co-render grouping).
export const masterToPhaseKey = (masterKey) =>
  (PHASES.find((p) => p.members.includes(masterKey)) || PHASES[0]).key;

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
// Kept in sync with the actual stored codes: SC/AU/NW/AC were minted by the intake before this catalog
// existed, so they stay; ST/TP/AS/etc. are added so every service resolves to a real label + icon.
export const SERVICE_CODES = {
  SC: "Security Cameras",
  AU: "Commercial Audio",
  SS: "Sound System",
  NW: "Networking",
  ST: "NVR & Storage",
  TP: "Toast / POS",
  AS: "Alarm System",
  AC: "Access Control",
  WX: "Wiring",
  CX: "Custom",
  MX: "Mixed",
};

// ---- ONE canonical service catalog -------------------------------------------------------------
// Bridges the three taxonomies that had drifted apart: the intake labels (New Project / Customers /
// Import forms), the stored 2-letter service_code, the proposal-builder service key, and the row icon.
// `match` recognizes a free-typed / label service so intake never mis-files a job (e.g. Toast → cameras).
export const SERVICE_CATALOG = [
  { code: "SC", label: "Security Cameras / CCTV",     proposal: "camera", icon: "cam",    match: /camera|cctv|surveil|\bcam\b/i },
  { code: "AU", label: "Commercial Audio",            proposal: "sound",  icon: "audio",  match: /audio|sound|speaker|sonos/i },
  { code: "NW", label: "Networking & Cat6",           proposal: "wiring", icon: "net",    match: /network|cat\s?6|cat\s?5|ethernet|wi-?fi|wiring|low-?volt/i },
  { code: "AC", label: "Access Control / Door Entry", proposal: "access", icon: "lock",   match: /access|door|entry|intercom|keypad|\bfob\b/i },
  { code: "ST", label: "NVR & Storage",               proposal: "camera", icon: "hdd",    match: /\bnvr\b|storage|\bdvr\b|record/i },
  { code: "TP", label: "Toast / POS Cabling",         proposal: "toast",  icon: "pos",    match: /toast|\bpos\b|point of sale/i },
  { code: "AS", label: "Alarm / Security System",     proposal: "alarm",  icon: "shield", match: /alarm|\badt\b|sensor|security system/i },
  { code: "MX", label: "Other",                       proposal: "custom", icon: "box",    match: /./ },
];
// Aliases so the older stored codes / other-form keys still resolve to a catalog entry.
const _CODE_ALIAS = { SS: "AU", WX: "NW", CX: "MX" };
function _catalogByCode(code) {
  const c = String(code || "").toUpperCase();
  return SERVICE_CATALOG.find((s) => s.code === c) || SERVICE_CATALOG.find((s) => s.code === _CODE_ALIAS[c]) || null;
}
// Free text / an intake label → the right stored service_code. Unknown falls to "MX" (Other) — never
// silently to cameras, which was the bug (Toast, Storage, Other all became Security Cameras).
export function serviceCodeFromText(text) {
  const t = String(text || "");
  if (!t.trim()) return "MX";
  return (SERVICE_CATALOG.find((s) => s.match.test(t)) || SERVICE_CATALOG[SERVICE_CATALOG.length - 1]).code;
}
// A project's stored service_code → the proposal-builder service key it should open on.
export function proposalServiceForCode(code) {
  return (_catalogByCode(code) || SERVICE_CATALOG[0]).proposal;
}
// A project's stored service_code → the row-icon key (cam/audio/net/lock/hdd/pos/shield/box).
export function serviceIconForCode(code) {
  return (_catalogByCode(code) || SERVICE_CATALOG[0]).icon;
}
// service_code → its full display label (falls back through SERVICE_CODES, then the raw code).
export function serviceCodeLabel(code) {
  return _catalogByCode(code)?.label || SERVICE_CODES[String(code || "").toUpperCase()] || code || "Service";
}

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

// ---- Service-call rate card (owner-set, 2026-07-24). Retail pricing — ship it server-side to
// admin/manager builders only; a tech's browser must never receive it. "Camera replacement" is
// $75 camera + $25 mount under the hood; billed as one line.
export const SVC_RATES = [
  { desc: "Diagnostic",         price: 150 },
  { desc: "Roll out",           price: 50 },
  { desc: "Patch cable",        price: 100 },
  { desc: "Cable rerun",        price: 150 },
  { desc: "Camera replacement", price: 100 },
  { desc: "WiFi reconnect",     price: 99 },
  { desc: "Line drop",          price: 150 },
  { desc: "NVR replacement",    price: 99 },
  { desc: "NVR",                price: 150 },
  { desc: "HDD replacement",    price: 99 },
  { desc: "Reprogramming",      price: 99 },
];
