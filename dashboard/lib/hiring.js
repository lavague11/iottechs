// Technician hiring — the status engine. Pure, importable from anywhere (no DB/edge concerns).
// One candidate record threads three portals; `status` is the fine-grained source of truth and
// `portal` is derived from it. Legacy `stage` (applied|reviewing|interview|offer|hired|declined)
// is kept coarsely in sync so the older tracker/review screens keep working during the migration.

export const PORTALS = [
  { n: 1, key: "recruitment", label: "Recruitment", ask: "Should we hire you?" },
  { n: 2, key: "compliance",  label: "Compliance",  ask: "Are you cleared to work?" },
  { n: 3, key: "training",    label: "Training",    ask: "Trained to represent us?" },
];

// Ordered status ladder. tone: neutral | active | good | bad. `bridge` = leaving this portal.
export const HIRING_STATUSES = [
  // Portal 1 — Recruitment
  { key: "applied",           portal: 1, label: "Applied",            tone: "neutral" },
  { key: "assessment",        portal: 1, label: "Assessment",         tone: "active" },
  { key: "phone",             portal: 1, label: "Phone Interview",    tone: "active" },
  { key: "in_person",         portal: 1, label: "In-Person + Skills", tone: "active" },
  { key: "sop",               portal: 1, label: "Dispatch / SOP",     tone: "active" },
  { key: "ride_along",        portal: 1, label: "Ride-Along",         tone: "active" },
  { key: "final_review",      portal: 1, label: "Final Review",       tone: "active" },
  { key: "declined",          portal: 1, label: "Not Selected",       tone: "bad", terminal: true },
  // Portal 2 — Compliance
  { key: "documents_pending", portal: 2, label: "Documents Pending",  tone: "neutral" },
  { key: "background_pending",portal: 2, label: "Background Pending",  tone: "active" },
  { key: "compliance_review", portal: 2, label: "Compliance Review",  tone: "active" },
  { key: "cleared",           portal: 2, label: "Cleared for Training",tone: "good", bridge: true },
  // Portal 3 — Training & Certification
  { key: "new_hire",          portal: 3, label: "New Hire",           tone: "neutral" },
  { key: "onboarding",        portal: 3, label: "Onboarding",         tone: "active" },
  { key: "training",          portal: 3, label: "Training",           tone: "active" },
  { key: "supervised",        portal: 3, label: "Supervised Tech",    tone: "active" },
  { key: "final_cert",        portal: 3, label: "Final Certification",tone: "active" },
  { key: "approved",          portal: 3, label: "Approved Technician",tone: "good", terminal: true },
];

const BY_KEY = Object.fromEntries(HIRING_STATUSES.map((s) => [s.key, s]));

export function statusMeta(key) { return BY_KEY[key] || null; }
export function statusLabel(key) { return BY_KEY[key]?.label || key || "—"; }
export function portalOfStatus(key) { return BY_KEY[key]?.portal || 1; }
export function portalMeta(n) { return PORTALS.find((p) => p.n === n) || PORTALS[0]; }
export function statusesForPortal(n) { return HIRING_STATUSES.filter((s) => s.portal === n); }

// The single hire / advance transitions between portals.
export const HIRE_STATUS = "documents_pending";   // final_review → hire → Portal 2
export const START_TRAINING_STATUS = "new_hire";  // cleared → start training → Portal 3

// Map a legacy `stage` onto a modern status (for backfilling existing rows).
export function statusFromLegacyStage(stage) {
  switch (stage) {
    case "applied":   return "applied";
    case "reviewing": return "assessment";
    case "interview": return "phone";
    case "offer":     return "documents_pending";
    case "hired":     return "documents_pending";
    case "declined":  return "declined";
    default:          return "applied";
  }
}

// Map a modern status back to a coarse legacy `stage`, so older screens still read correctly.
export function legacyStageFromStatus(key) {
  const p = portalOfStatus(key);
  if (key === "declined") return "declined";
  if (key === "applied")  return "applied";
  if (p === 1)            return key === "phone" || key === "in_person" || key === "ride_along" || key === "final_review" ? "interview" : "reviewing";
  return "hired";   // any Portal 2/3 status = hired, in legacy terms
}

// Portal 1 evaluation steps — each is a scorecard the office fills in. The 25-Q assessment is its
// own thing (auto + AI graded); these four are human-scored on a shared 1–5 rubric.
export const STEP_RUBRICS = {
  phone:      { label: "Phone Interview",      criteria: [["communication", "Communication & professionalism"], ["reliability", "Reliability & availability"], ["experience", "Relevant experience"], ["motivation", "Motivation & fit"]] },
  in_person:  { label: "In-Person + Skills",   criteria: [["tools", "Tool & material knowledge"], ["handson", "Hands-on skill demonstrated"], ["problem", "Problem-solving"], ["professional", "Professionalism & appearance"]] },
  sop:        { label: "Dispatch / SOP",       criteria: [["scope", "Scope & authorization"], ["docs", "Documentation discipline"], ["escalation", "Escalation judgment"], ["customer", "Customer handling"]] },
  ride_along: { label: "Ride-Along / Field",   criteria: [["performance", "Real job performance"], ["process", "Follows process on site"], ["field_comm", "Communication in the field"], ["attitude", "Attitude & coachability"]] },
};
export const P1_EVAL_STEPS = ["phone", "in_person", "sop", "ride_along"];

// The full Portal 1 status flow, in order, for "advance to next step".
export const P1_FLOW = ["applied", "assessment", "phone", "in_person", "sop", "ride_along", "final_review"];
export function nextP1Status(cur) { const i = P1_FLOW.indexOf(cur); return i >= 0 && i < P1_FLOW.length - 1 ? P1_FLOW[i + 1] : cur; }

// Applications SHOULD store the position as one of the /apply keys (tech · sales · pm · sub · office),
// but older / manually-created rows carry the human label instead ("Technician", "Project Manager").
// Normalize any form to the canonical key so track decisions never hinge on the exact string — the
// bug where a "Technician"-labelled row silently skipped the whole tech assessment/recruitment track.
// Unknown/blank falls back to "tech": better to run the assessment than to hide it.
export function positionKey(position) {
  const p = String(position || "").trim().toLowerCase();
  if (p.startsWith("sale")) return "sales";
  if (p.includes("subcontract") || p === "sub") return "sub";
  if (p.includes("project manager") || p === "pm") return "pm";
  if (p.includes("office")) return "office";
  return "tech";   // tech / technician / helper / installer / blank / anything else
}
export const isTechPosition = (position) => positionKey(position) === "tech";

// ── Portal 2 · Compliance (1099 contractor) ──────────────────────────────
// Each item the new hire completes. type drives the candidate UI: upload | form | sign | w9 | deposit.
// Every item tracks a status: not_started → submitted → verified (or rejected, back to the candidate).
export const COMPLIANCE_ITEMS = [
  { key: "emergency", group: "About you", label: "Emergency contact", type: "form", required: true,
    fields: [["name", "Contact name"], ["phone", "Phone"], ["relationship", "Relationship"]] },
  { key: "license", group: "Documents", label: "Driver's license", type: "upload", required: true, parts: ["Front", "Back"], expires: true },
  { key: "insurance", group: "Documents", label: "Auto insurance card", type: "upload", required: true, expires: true },
  { key: "w9", group: "Tax & pay", label: "W-9 — taxpayer information", type: "w9", required: true },
  { key: "direct_deposit", group: "Tax & pay", label: "Direct deposit", type: "deposit", required: true },
  { key: "background_auth", group: "Authorizations", label: "Background check authorization", type: "sign", required: true,
    agreement: "I authorize IOT TECHS (and its background-check provider) to obtain and review consumer/criminal-history reports about me for the purpose of evaluating me for engagement, and I certify the information I have provided is true." },
  { key: "mvr_auth", group: "Authorizations", label: "Motor vehicle record authorization", type: "sign", required: true,
    agreement: "I authorize IOT TECHS to obtain my motor vehicle record (MVR) and to re-check it periodically while I perform driving-related work, and I will report any license suspension, restriction, or moving violation promptly." },
  { key: "vehicle_agreement", group: "Agreements", label: "Vehicle-use agreement", type: "sign", required: true,
    agreement: "I will operate any company or personal vehicle used for IOT TECHS work safely and legally, maintain a valid license and insurance, and be personally responsible for tolls, parking tickets, and moving violations I incur. Company vehicles are for work use only." },
  { key: "tools_agreement", group: "Agreements", label: "Tools & equipment agreement", type: "sign", required: true,
    agreement: "I am accountable for tools, equipment, and materials issued to me: I will check them out and in, report damaged or missing items immediately, and understand the cost of unreturned or negligently damaged equipment may be deducted or invoiced per company policy." },
  { key: "work_agreement", group: "Agreements", label: "Independent contractor agreement", type: "sign", required: true,
    agreement: "I acknowledge I am engaged as an independent contractor (1099), not an employee; I am responsible for my own taxes; I will perform work per IOT TECHS standards and scope; and either party may end the engagement per the terms provided separately." },
];

// Office-run checks (candidate authorizes above; the office records the outcome).
export const COMPLIANCE_CHECKS = [
  { key: "background", label: "Background check", authFrom: "background_auth" },
  { key: "mvr", label: "Motor vehicle record", authFrom: "mvr_auth" },
];

export const COMPLIANCE_STATUS_FLOW = ["documents_pending", "background_pending", "compliance_review", "cleared"];

// Progress over the candidate-facing items (checks are office-side).
export function complianceProgress(compliance = {}) {
  const items = compliance?.items || {};
  const req = COMPLIANCE_ITEMS.filter((i) => i.required);
  const st = (k) => items[k]?.status || "not_started";
  const submitted = req.filter((i) => ["submitted", "verified"].includes(st(i.key))).length;
  const verified = req.filter((i) => st(i.key) === "verified").length;
  const rejected = req.filter((i) => st(i.key) === "rejected").length;
  return { total: req.length, submitted, verified, rejected, allSubmitted: submitted === req.length, allVerified: verified === req.length };
}

// ── Portal 3 · Training & Certification ──────────────────────────────────
// Knowledge modules the trainee reads + acknowledges; Field Training is signed off by a lead.
export const TRAINING_MODULES = [
  { key: "company_standards", label: "Company Standards", type: "acknowledge", summary: "How we represent IOT TECHS.",
    points: ["Professional appearance & clean uniform", "Respectful, clear customer interaction", "Site cleanliness — leave it better than you found it", "Escalation procedures for problems", "Confidentiality of customer footage & site info"] },
  { key: "dispatch_protocol", label: "Dispatch Protocol", type: "acknowledge", summary: "A work order start to finish.",
    points: ["Accept work orders & check in on arrival", "Review the scope before starting", "Before photos", "Communicate with the customer", "Document problems as they arise", "Completion photos, QC, and checkout"] },
  { key: "technical_standards", label: "Technical Standards", type: "acknowledge", summary: "How we install to spec.",
    points: ["Camera placement & mounting standards", "Cat6 termination (T568B) & testing", "Anchors & fasteners matched to the substrate", "NVR setup & networking", "Access control & sound basics", "Systematic troubleshooting"] },
  { key: "vehicle_training", label: "Vehicle Training", type: "acknowledge", summary: "Company & personal vehicle use.",
    points: ["Pre-trip inspection", "Fuel & toll procedures", "Accident & ticket reporting", "Equipment storage & security", "Keys & cleanliness"] },
  { key: "tools_inventory", label: "Tools & Inventory", type: "acknowledge", summary: "Accountability for gear & materials.",
    points: ["Check equipment out and in", "Report damaged or missing items immediately", "Material tracking per job", "No personal use of company tools"] },
  { key: "safety", label: "Safety", type: "acknowledge", summary: "Job-site safety fundamentals.",
    points: ["Ladder & lift safety", "Drilling & cutting precautions", "PPE where required", "Electrical awareness / lockout", "Report unsafe conditions the same day"] },
  { key: "field_training", label: "Field Training", type: "field", summary: "Supervised real jobs, signed off by a lead.",
    points: ["Complete supervised installations", "Demonstrate the standards on real sites", "Lead sign-off required to advance"] },
];
export const FIELD_JOBS_REQUIRED = 3;

export const CERT_TIERS = [
  { key: "apprentice", label: "Approved Apprentice", note: "Supervised scope" },
  { key: "technician", label: "Approved Technician", note: "Solo work orders" },
  { key: "lead", label: "Approved Lead Technician", note: "Runs crews, signs off" },
];
export const QUALIFICATIONS = [
  { key: "camera", label: "Camera" }, { key: "access_control", label: "Access Control" }, { key: "sound", label: "Sound" },
  { key: "alarm", label: "Alarm" }, { key: "networking", label: "Networking" }, { key: "vehicle", label: "Vehicle Authorized" },
];

// Which qualification badge a project's service type demands of the tech doing it. A certified
// technician must hold these to be assigned (the office can override). Legacy/uncertified techs
// aren't gated. Vehicle is a separate authorization, not service-derived.
export const SERVICE_QUALS = {
  SC: ["camera"], SS: ["sound"], AS: ["alarm"], AC: ["access_control"], WX: ["networking"], TP: ["networking"], MX: [], CX: [],
};
export function requiredQualsForService(code) { return SERVICE_QUALS[String(code || "").toUpperCase()] || []; }

export const P3_FLOW = ["new_hire", "onboarding", "training", "supervised", "final_cert", "approved"];
export function nextP3Status(cur) { const i = P3_FLOW.indexOf(cur); return i >= 0 && i < P3_FLOW.length - 1 ? P3_FLOW[i + 1] : cur; }

export function trainingProgress(training = {}) {
  const m = training?.modules || {};
  const know = TRAINING_MODULES.filter((x) => x.type !== "field");
  const done = know.filter((x) => m[x.key]?.status === "done").length;
  const fieldCount = m.field_training?.count || 0;
  return { total: know.length, done, allModules: done === know.length, fieldCount, fieldDone: fieldCount >= FIELD_JOBS_REQUIRED };
}

// Resolve a row's portal+status, deriving from legacy stage when the columns aren't set yet.
export function resolveHiring(row) {
  const status = row?.status || statusFromLegacyStage(row?.stage);
  return { status, portal: portalOfStatus(status), meta: statusMeta(status) };
}
