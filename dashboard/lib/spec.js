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

// Customer's condensed 5-phase view of the master 9-stage lifecycle. The office still runs all 9
// (survey, fulfillment, QC are real ops steps) — the customer just doesn't experience them as
// separate life events, so we group them into the moments they actually track: reach out → review
// quote → approve & deposit → watch it get built → paid & done. Same idea as TECH_STAGES: a pure
// view mapping, no backend/data change. `members` are the master stages each phase covers; `primary`
// is where a click lands when the phase isn't the current one (the phase's substantive/action step).
export const CUSTOMER_PHASES = [
  { key: "cx_start",    label: "Getting Started", short: "Getting Started", members: ["inquiry", "site_survey"],   primary: "site_survey" },
  { key: "cx_proposal", label: "Your Proposal",   short: "Proposal",        members: ["proposal"],                  primary: "proposal" },
  { key: "cx_approved", label: "Approved",        short: "Approved",        members: ["approval_deposit"],          primary: "approval_deposit" },
  { key: "cx_install",  label: "Installation",    short: "Installation",    members: ["schedule", "install", "qc"], primary: "install" },
  { key: "cx_done",     label: "Complete",        short: "Complete",        members: ["payment", "completion"],     primary: "payment" },
];

// The customer phases that actually apply to a project type — drop any phase whose master stages
// don't exist for that type (e.g. a Service Call has no proposal/approval), and keep `primary`
// pointing at a member that's really present.
export function customerStagesForType(type) {
  const present = new Set(stagesForType(type).map((s) => s.key));
  return CUSTOMER_PHASES
    .map((p) => ({ ...p, members: p.members.filter((m) => present.has(m)) }))
    .filter((p) => p.members.length > 0)
    .map((p) => ({ ...p, primary: p.members.includes(p.primary) ? p.primary : p.members[p.members.length - 1] }));
}

// Master lifecycle stage → the customer phase key that contains it (for the "current" bar marker).
export const masterToCustomerKey = (masterKey) =>
  (CUSTOMER_PHASES.find((p) => p.members.includes(masterKey)) || CUSTOMER_PHASES[0]).key;

// ---- Unified 4-phase view — shown to EVERY role (2026-07-13). ----
// The backend still runs all 9 stages (auto-advance, requirements, history all unchanged); this is
// a pure view grouping that merges them into 4 steps on the progress bar, and each phase co-renders
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
  { key: "ph_wrap",     label: "Completion",  short: "Completion",  techLabel: "Completion", status: "Finalizing",  members: ["qc", "payment", "completion"],  primary: "qc" },
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
