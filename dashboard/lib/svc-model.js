// Service call — the structured diagnostic model (pure, no DB, shared by server and client).
//
// A service call is a chain, not a note box:
//   REPORTED → AFFECTED EQUIPMENT → TESTS → ROOT CAUSE → REPAIR → OUTCOME → ESTIMATE → REPORT
// The whole chain lives in ONE document on the call (service_calls.diagnosis, JSON) — the web view,
// the estimate suggestions and the printed report are all derived from it here, so they can't drift.
//
// Document shape (see emptyDiagnosis):
//   { callType, systems: [key], devices: [{ id, label, kind }], findings: [Finding], visit: { arrival,
//     departure, techs: [name] }, billing: repair|diagnostic|estimate|warranty, recommendations, internalNotes }
//   Finding = { id, deviceIds: [id], system, symptoms: [key], observed, tests: [{ key, result, note }],
//              rootCauses: [key], finding, recommendation, work: [key], outcome, notes }
// One finding can cover many devices (four cameras dead on one PoE switch = one finding, four devices).

export * from "./svc-status.js";
import { SVC_STATUS_ALIAS, svcStatusIndex, svcStatusLabel } from "./svc-status.js";

export const SVC_CALL_TYPES = ["Service Call", "Troubleshooting", "System Check", "Camera Repair", "NVR / DVR Repair", "Cabling Repair", "Network Repair", "Add-On Install", "Warranty Visit", "Other"];

export const SVC_SYSTEMS = [
  { key: "cctv",    label: "Cameras / CCTV" },
  { key: "nvr",     label: "NVR / DVR" },
  { key: "cabling", label: "Cabling" },
  { key: "network", label: "Network / Internet" },
  { key: "power",   label: "Power" },
  { key: "display", label: "Monitor / Display" },
  { key: "app",     label: "Mobile App / Remote Viewing" },
  { key: "access",  label: "Access Control" },
  { key: "alarm",   label: "Alarm" },
  { key: "audio",   label: "Audio" },
  { key: "other",   label: "Other" },
];

// Symptoms per system. `other` on every list opens a free-text observation.
export const SVC_SYMPTOMS = {
  cctv:    ["No video", "Offline", "Intermittent", "No power", "Poor image", "Blurry / out of focus", "Night vision issue", "IR reflection", "Black-and-white only", "Color-at-night issue", "Flickering", "Image artifacts", "Camera moved / misaligned", "Physically damaged", "Water damage", "Audio issue", "Motion detection issue", "Human/vehicle analytics issue", "Missing recording", "Playback issue", "Other"],
  nvr:     ["Not powering on", "Rebooting", "Cameras offline", "No recording", "Missing playback", "Hard drive error", "Storage full", "Network offline", "Remote viewing offline", "HDMI/display issue", "Password/login", "Firmware issue", "Channel issue", "PoE port failure", "Fan/overheating", "Other"],
  cabling: ["Failed test", "Intermittent", "Open pair", "Short", "Bad termination", "Damaged connector", "Cut cable", "Water damage", "Crushed cable", "Excessive length", "Poor cable quality", "Unknown"],
  network: ["ISP offline", "Router offline", "LAN issue", "DHCP issue", "Static IP conflict", "DNS issue", "Gateway issue", "Port blocked", "Wi-Fi issue", "Insufficient bandwidth", "High latency", "Packet loss", "P2P/cloud issue", "Customer changed router", "Customer changed ISP", "Credentials changed", "Network healthy", "Other"],
  power:   ["No AC power", "Bad outlet", "Bad power supply", "Bad transformer", "PoE unavailable", "PoE overload", "UPS issue", "Breaker issue", "Other"],
  display: ["No signal", "Wrong input", "HDMI cable", "Monitor failed", "Resolution issue", "Other"],
  app:     ["Can't log in", "Cameras offline in app", "Live view fails", "Playback fails", "Notifications missing", "Other"],
  access:  ["Door won't unlock", "Reader not responding", "Credential rejected", "Intercom no audio", "Other"],
  alarm:   ["False alarms", "Sensor offline", "Panel offline", "Keypad issue", "Siren issue", "Other"],
  audio:   ["No sound", "One zone out", "Distortion", "Source issue", "Other"],
  other:   ["Other"],
};

// Root causes are a separate axis from symptoms — the centre of the system (reporting hangs off it).
export const SVC_ROOT_CAUSES = [
  { key: "camera_hw",   label: "Camera hardware" },
  { key: "nvr_hw",      label: "NVR/DVR hardware" },
  { key: "hdd",         label: "Hard drive" },
  { key: "cable",       label: "Cable" },
  { key: "termination", label: "Termination / RJ45" },
  { key: "poe_port",    label: "PoE port" },
  { key: "poe_switch",  label: "PoE switch" },
  { key: "power",       label: "Power supply" },
  { key: "lan",         label: "Network LAN" },
  { key: "router",      label: "Router" },
  { key: "isp",         label: "ISP" },
  { key: "cloud",       label: "Cloud/P2P" },
  { key: "netconfig",   label: "DNS/network configuration" },
  { key: "credentials", label: "Credentials" },
  { key: "firmware",    label: "Firmware" },
  { key: "display",     label: "Display/HDMI" },
  { key: "environment", label: "Environmental" },
  { key: "customer",    label: "Customer-caused" },
  { key: "third_party", label: "Third-party equipment" },
  { key: "unknown",     label: "Unknown" },
];

export const SVC_TESTS = [
  { key: "cam_direct",   label: "Camera direct-connect", systems: ["cctv", "nvr", "cabling"] },
  { key: "cable_tester", label: "Cable tester",          systems: ["cctv", "cabling", "network"] },
  { key: "continuity",   label: "Cable continuity",      systems: ["cctv", "cabling", "network"] },
  { key: "reterminate",  label: "Reterminate RJ45",      systems: ["cctv", "cabling", "network"] },
  { key: "swap_camera",  label: "Swap camera",           systems: ["cctv"] },
  { key: "swap_channel", label: "Swap NVR channel",      systems: ["cctv", "nvr"] },
  { key: "swap_poe",     label: "Swap NVR PoE port",     systems: ["cctv", "nvr", "power"] },
  { key: "swap_switch",  label: "Swap switch port",      systems: ["cctv", "network", "power"] },
  { key: "verify_poe",   label: "Verify PoE",            systems: ["cctv", "nvr", "power"] },
  { key: "voltage",      label: "Verify voltage",        systems: ["power", "nvr", "cctv"] },
  { key: "ping",         label: "Ping",                  systems: ["network", "app", "nvr", "cctv"] },
  { key: "lan",          label: "LAN connectivity",      systems: ["network", "app", "nvr"] },
  { key: "internet",     label: "Internet connectivity", systems: ["network", "app", "nvr"] },
  { key: "speed",        label: "Speed test",            systems: ["network", "app"] },
  { key: "packet_loss",  label: "Packet-loss test",      systems: ["network", "app"] },
  { key: "nvr_reboot",   label: "NVR reboot",            systems: ["nvr", "cctv", "app"] },
  { key: "factory",      label: "Factory reset",         systems: ["nvr", "cctv"] },
  { key: "firmware",     label: "Firmware check",        systems: ["nvr", "cctv", "app"] },
  { key: "hdd_health",   label: "HDD health",            systems: ["nvr"] },
  { key: "recording",    label: "Recording test",        systems: ["nvr", "cctv"] },
  { key: "playback",     label: "Playback test",         systems: ["nvr", "cctv", "app"] },
  { key: "remote",       label: "Remote viewing test",   systems: ["app", "network", "nvr"] },
  { key: "mobile",       label: "Mobile app test",       systems: ["app", "network"] },
  { key: "hdmi",         label: "HDMI/display test",     systems: ["display", "nvr"] },
];
export const SVC_TEST_RESULTS = ["PASS", "FAIL", "NOT TESTED"];

export const SVC_WORK = [
  { key: "reboot",        label: "Rebooted" },
  { key: "reterminated",  label: "Reterminated" },
  { key: "connector",     label: "Replaced connector" },
  { key: "camera",        label: "Replaced camera" },
  { key: "cable",         label: "Replaced cable" },
  { key: "nvr",           label: "Replaced NVR" },
  { key: "hdd",           label: "Replaced HDD" },
  { key: "poe_port",      label: "Changed PoE port" },
  { key: "switch",        label: "Changed switch" },
  { key: "credentials",   label: "Reset credentials" },
  { key: "firmware",      label: "Updated firmware" },
  { key: "network",       label: "Reconfigured network" },
  { key: "remote",        label: "Reconfigured remote viewing" },
  { key: "adjusted",      label: "Adjusted camera" },
  { key: "cleaned",       label: "Cleaned lens" },
  { key: "focus",         label: "Adjusted focus" },
  { key: "recording",     label: "Restored recording" },
  { key: "other",         label: "Other" },
];

export const SVC_OUTCOMES = [
  { key: "working",     label: "Working",              billable: true },
  { key: "repaired",    label: "Repaired",             billable: true },
  { key: "replaced",    label: "Replaced",             billable: true },
  { key: "temporary",   label: "Temporary fix",        billable: true },
  { key: "needs_repair",label: "Needs repair",         followUp: true },
  { key: "needs_replace",label:"Needs replacement",    followUp: true },
  { key: "parts",       label: "Parts required",       followUp: true },
  { key: "return",      label: "Return visit required",followUp: true },
  { key: "declined",    label: "Customer declined" },
  { key: "no_fault",    label: "No fault found" },
  { key: "third_party", label: "Third-party / ISP issue" },
  { key: "warranty",    label: "Warranty" },
  { key: "unable",      label: "Unable to diagnose" },
];
export const SVC_BILLING = [
  { key: "repair",     label: "Repair performed" },
  { key: "diagnostic", label: "Diagnostic only" },
  { key: "estimate",   label: "Estimate only" },
  { key: "warranty",   label: "Warranty / No charge" },
];

const byKey = (list) => Object.fromEntries(list.map((x) => [x.key, x.label]));
export const SYSTEM_LABEL = byKey(SVC_SYSTEMS);
export const CAUSE_LABEL = byKey(SVC_ROOT_CAUSES);
export const TEST_LABEL = byKey(SVC_TESTS);
export const WORK_LABEL = byKey(SVC_WORK);
export const OUTCOME_LABEL = byKey(SVC_OUTCOMES);

let _n = 0;
export const newId = (p = "f") => `${p}${Date.now().toString(36)}${(_n++).toString(36)}`;

export function emptyDiagnosis() {
  return { callType: "Service Call", systems: [], devices: [], findings: [], deviceState: {}, narrative: { incident: "", summary: "", rootCause: "", recommendation: "" }, options: [],
    visit: { arrival: null, departure: null, techs: [] }, billing: "repair", recommendations: "", internalNotes: "" };
}
export function emptyOption(type = "repair") {
  return { id: newId("o"), title: type === "replace" ? "Full replacement" : type === "temporary" ? "Temporary repair" : type === "none" ? "No action" : type === "third_party" ? "Third-party resolution" : "Repair", type, description: "", bullets: [], costSource: "none", low: null, high: null, warranty: "", reliability: "", recommended: false };
}
export function emptyFinding(system = "cctv", deviceIds = []) {
  return { id: newId(), deviceIds, system, symptoms: [], observed: "", tests: [], rootCauses: [], finding: "", recommendation: "", work: [], outcome: "", notes: "" };
}

// Devices known to a call: the linked project's survey cameras + recorder. Cameras carry the
// survey's own tag/name; the ids are stable across saves so findings keep pointing at them.
export function devicesFromCameras(cameras = [], { nvrCount = 1 } = {}) {
  const out = cameras.map((c, i) => ({ id: `cam:${c.tag || i + 1}`, label: c.label || `Camera ${i + 1}`, kind: "camera" }));
  for (let i = 1; i <= nvrCount; i++) out.push({ id: `nvr:${i}`, label: nvrCount > 1 ? `NVR ${i}` : "NVR", kind: "nvr" });
  return out;
}

// Arrival / departure → minutes on site. Same-day clock times ("HH:MM") or ISO strings.
export function timeOnSite(arrival, departure) {
  const toMin = (v) => {
    if (!v) return null;
    const s = String(v);
    const m = s.match(/(\d{1,2}):(\d{2})(?!.*\d{1,2}:\d{2})/);   // last HH:MM in the string
    if (!m) return null;
    const d = s.length > 5 ? Date.parse(s) : NaN;
    if (!Number.isNaN(d)) return Math.round(d / 60000);
    return +m[1] * 60 + +m[2];
  };
  const a = toMin(arrival), b = toMin(departure);
  if (a == null || b == null) return { minutes: null, label: "" };
  let mins = b - a;
  if (String(arrival).length <= 5 && mins < 0) mins += 24 * 60;
  if (mins < 0) return { minutes: null, label: "" };
  const h = Math.floor(mins / 60), m = mins % 60;
  return { minutes: mins, label: (h ? `${h}h ` : "") + `${m}m` };
}

// Warranty from the linked project's record, never from free text: completed_at (or install_date)
// + warranty_months. "unknown" when the project has no completion date.
export function warrantyStatus(project, now = new Date()) {
  if (!project) return { status: "unknown", until: null };
  const start = project.completed_at || project.install_date || null;
  const months = Number(project.warranty_months);
  if (!start || !(months > 0)) return { status: "unknown", until: null };
  const d = new Date(String(start).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { status: "unknown", until: null };
  d.setMonth(d.getMonth() + months);
  const until = d.toISOString().slice(0, 10);
  return { status: d.getTime() >= now.getTime() ? "in" : "out", until, months };
}

// ---- Estimate generator ------------------------------------------------------------------------
// Root cause → lines from the owner's service rate card (`rates` = [{ desc, price }], lib/spec.js
// SVC_RATES / whatever the office edits later). A cause with no rate-card match still yields a line,
// priced 0 and flagged needsPrice, so the office fills it in rather than the system inventing a
// number. Device-scoped lines (camera, cable) take the affected-device count as quantity.
const CAUSE_LINES = {
  camera_hw:   [{ rate: "Camera replacement", perDevice: true }],
  nvr_hw:      [{ rate: "NVR replacement" }],
  hdd:         [{ rate: "HDD replacement" }],
  cable:       [{ rate: "Cable rerun", perDevice: true }],
  termination: [{ rate: "Patch cable", perDevice: true }],
  poe_port:    [{ rate: "Reprogramming" }],
  poe_switch:  [{ custom: "PoE switch replacement" }],
  power:       [{ custom: "Power supply replacement" }],
  lan:         [{ rate: "Reprogramming" }],
  router:      [{ rate: "WiFi reconnect" }],
  cloud:       [{ rate: "Reprogramming" }],
  netconfig:   [{ rate: "Reprogramming" }],
  credentials: [{ rate: "Reprogramming" }],
  firmware:    [{ rate: "Reprogramming" }],
  display:     [{ custom: "Monitor / HDMI" }],
  // isp, environment, customer, third_party, unknown → diagnostic visit only
};
const BASE_LINES = ["Diagnostic", "Roll out"];

export function suggestEstimate(doc, rates = []) {
  if (!doc || doc.billing === "warranty") return [];
  const rateOf = (desc) => rates.find((r) => String(r.desc).toLowerCase() === desc.toLowerCase());
  const lines = new Map();   // desc → { desc, qty, price, needsPrice, why }
  const add = (desc, qty, price, why, needsPrice = false) => {
    const cur = lines.get(desc);
    if (cur) { cur.qty += qty; if (why && !cur.why.includes(why)) cur.why.push(why); return; }
    lines.set(desc, { desc, qty, price, needsPrice, why: why ? [why] : [] });
  };
  for (const d of BASE_LINES) { const r = rateOf(d); if (r) add(d, 1, r.price, null); }
  for (const f of doc.findings || []) {
    const n = Math.max(1, (f.deviceIds || []).length);
    for (const cause of f.rootCauses || []) {
      for (const spec of CAUSE_LINES[cause] || []) {
        const qty = spec.perDevice ? n : 1;
        if (spec.rate) { const r = rateOf(spec.rate); add(spec.rate, qty, r ? r.price : 0, CAUSE_LABEL[cause], !r); }
        else add(spec.custom, qty, 0, CAUSE_LABEL[cause], true);
      }
    }
  }
  return [...lines.values()].map((l) => ({ ...l, qty: Math.min(l.qty, 99) }));
}

// ---- Report -------------------------------------------------------------------------------------
// Customer-facing sections from the same document. Internal notes never appear here.
const join = (arr, sep = ", ") => arr.filter(Boolean).join(sep);
const deviceNames = (doc, ids) => join((ids || []).map((id) => (doc.devices || []).find((d) => d.id === id)?.label || id));

export function reportSections(call, doc) {
  if (!doc) return [];
  const findings = doc.findings || [];
  const S = [];
  const put = (title, lines) => { const clean = (lines || []).filter((l) => l && String(l).trim()); if (clean.length) S.push({ title, lines: clean }); };

  put("Reported issue", [call?.issue]);
  const affected = new Set(); findings.forEach((f) => (f.deviceIds || []).forEach((id) => affected.add(id)));
  put("Affected equipment", [deviceNames(doc, [...affected]), ...(doc.systems || []).filter((s) => !findings.some((f) => f.system === s)).map((s) => SYSTEM_LABEL[s])]);
  put("Diagnostic tests", findings.flatMap((f) => (f.tests || []).filter((t) => t.result && t.result !== "NOT TESTED").map((t) => `${TEST_LABEL[t.key] || t.key} — ${t.result}${t.note ? ` (${t.note})` : ""}${f.deviceIds?.length && findings.length > 1 ? ` · ${deviceNames(doc, f.deviceIds)}` : ""}`)));
  put("Findings", findings.map((f) => {
    const who = f.deviceIds?.length ? `${deviceNames(doc, f.deviceIds)}: ` : "";
    const sym = join(f.symptoms);
    return `${who}${f.finding || (sym ? `${sym}${f.observed ? ` — ${f.observed}` : ""}` : f.observed)}`;
  }));
  put("Root cause", [...new Set(findings.flatMap((f) => f.rootCauses || []))].map((c) => CAUSE_LABEL[c] || c));
  put("Work performed", findings.flatMap((f) => [...(f.work || []).map((w) => WORK_LABEL[w] || w), f.notes].filter(Boolean)).filter((v, i, a) => a.indexOf(v) === i));
  put("Outcome", findings.filter((f) => f.outcome).map((f) => `${f.deviceIds?.length ? deviceNames(doc, f.deviceIds) + " — " : ""}${OUTCOME_LABEL[f.outcome] || f.outcome}`));
  put("Recommendations", [doc.recommendations, ...findings.map((f) => f.recommendation)].filter((v, i, a) => v && a.indexOf(v) === i));
  return S;
}

// Follow-up needed? (an outcome that leaves work open)
export function needsFollowUp(doc) {
  const open = new Set(SVC_OUTCOMES.filter((o) => o.followUp).map((o) => o.key));
  return (doc?.findings || []).some((f) => open.has(f.outcome));
}

// Stable serialization for the signature fingerprint (key order independent).
export function stableJson(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableJson(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

// Clean an incoming document at the boundary: known keys only, capped lengths, valid enum values.
export function sanitizeDiagnosis(input) {
  const doc = emptyDiagnosis();
  if (!input || typeof input !== "object") return doc;
  const str = (v, n = 2000) => String(v ?? "").slice(0, n);
  const sysKeys = new Set(SVC_SYSTEMS.map((s) => s.key));
  doc.callType = SVC_CALL_TYPES.includes(input.callType) ? input.callType : "Service Call";
  doc.systems = [...new Set((Array.isArray(input.systems) ? input.systems : []).filter((s) => sysKeys.has(s)))];
  doc.devices = (Array.isArray(input.devices) ? input.devices : []).slice(0, 64).map((d) => ({ id: str(d?.id, 60), label: str(d?.label, 80), kind: ["camera", "nvr", "switch", "display", "other"].includes(d?.kind) ? d.kind : "other" })).filter((d) => d.id);
  const devIds = new Set(doc.devices.map((d) => d.id));
  const causeKeys = new Set(SVC_ROOT_CAUSES.map((c) => c.key)), testKeys = new Set(SVC_TESTS.map((t) => t.key)), workKeys = new Set(SVC_WORK.map((w) => w.key)), outKeys = new Set(SVC_OUTCOMES.map((o) => o.key));
  doc.findings = (Array.isArray(input.findings) ? input.findings : []).slice(0, 40).map((f) => {
    const system = sysKeys.has(f?.system) ? f.system : "other";
    const allowed = new Set(SVC_SYMPTOMS[system] || []);
    return {
      id: str(f?.id, 40) || newId(),
      deviceIds: [...new Set((Array.isArray(f?.deviceIds) ? f.deviceIds : []).filter((id) => devIds.has(id)))],
      system,
      symptoms: [...new Set((Array.isArray(f?.symptoms) ? f.symptoms : []).filter((s) => allowed.has(s)))],
      observed: str(f?.observed, 600),
      tests: (Array.isArray(f?.tests) ? f.tests : []).filter((t) => testKeys.has(t?.key)).slice(0, 40).map((t) => ({ key: t.key, result: SVC_TEST_RESULTS.includes(t.result) ? t.result : "NOT TESTED", note: str(t.note, 200) })),
      rootCauses: [...new Set((Array.isArray(f?.rootCauses) ? f.rootCauses : []).filter((c) => causeKeys.has(c)))],
      finding: str(f?.finding, 800),
      recommendation: str(f?.recommendation, 600),
      work: [...new Set((Array.isArray(f?.work) ? f.work : []).filter((w) => workKeys.has(w)))],
      outcome: outKeys.has(f?.outcome) ? f.outcome : "",
      notes: str(f?.notes, 800),
    };
  });
  const v = input.visit || {};
  doc.visit = { arrival: str(v.arrival, 40) || null, departure: str(v.departure, 40) || null, techs: (Array.isArray(v.techs) ? v.techs : []).slice(0, 6).map((t) => str(t, 80)).filter(Boolean) };
  doc.billing = SVC_BILLING.some((b) => b.key === input.billing) ? input.billing : "repair";
  doc.recommendations = str(input.recommendations, 1500);
  doc.internalNotes = str(input.internalNotes, 3000);
  // Per-device state (status + the service module's short fields) — only for known devices.
  const statusKeys = new Set(SVC_DEVICE_STATUS.map((x) => x.key));
  doc.deviceState = {};
  for (const [id, st] of Object.entries(input.deviceState && typeof input.deviceState === "object" ? input.deviceState : {})) {
    if (!devIds.has(id) || !st || typeof st !== "object") continue;
    const fields = {};
    for (const [k, v] of Object.entries(st.fields && typeof st.fields === "object" ? st.fields : {})) if (/^[a-z]{2,16}$/.test(k) && v != null && String(v).trim()) fields[k] = str(v, 80);
    doc.deviceState[id] = { status: statusKeys.has(st.status) ? st.status : "", fields };
  }
  const nv = input.narrative && typeof input.narrative === "object" ? input.narrative : {};
  doc.narrative = { incident: str(nv.incident, 1500), summary: str(nv.summary, 800), rootCause: str(nv.rootCause, 1500), recommendation: str(nv.recommendation, 1000) };
  const optTypes = new Set(SVC_OPTION_TYPES.map((o) => o.key)), costSources = new Set(["estimate", "proposal", "range", "none"]);
  const num = (v) => (v === "" || v == null || Number.isNaN(+v) || +v < 0 ? null : Math.round(+v * 100) / 100);
  doc.options = (Array.isArray(input.options) ? input.options : []).slice(0, 4).map((o) => ({
    id: str(o?.id, 40) || newId("o"), title: str(o?.title, 80), type: optTypes.has(o?.type) ? o.type : "repair",
    description: str(o?.description, 600), bullets: (Array.isArray(o?.bullets) ? o.bullets : []).slice(0, 8).map((b) => str(b, 160)).filter(Boolean),
    costSource: costSources.has(o?.costSource) ? o.costSource : "none", low: num(o?.low), high: num(o?.high),
    warranty: str(o?.warranty, 60), reliability: str(o?.reliability, 60), recommended: !!o?.recommended,
  }));
  if (doc.options.filter((o) => o.recommended).length > 1) doc.options.forEach((o, i) => { o.recommended = i === doc.options.findIndex((x) => x.recommended); });
  return doc;
}

// ---- Per-device status + cause category (report badges) --------------------------------------
export const SVC_DEVICE_STATUS = [
  { key: "OK",                short: "OK",       tone: "ok" },
  { key: "FAILED",            short: "FAIL",     tone: "fail" },
  { key: "DEGRADED",          short: "DEGRADED", tone: "warn" },
  { key: "INTERMITTENT",      short: "INTERMIT", tone: "warn" },
  { key: "RESTORED",          short: "RESTORED", tone: "ok" },
  { key: "NEEDS_REPAIR",      short: "REPAIR",   tone: "warn" },
  { key: "NEEDS_REPLACEMENT", short: "REPLACE",  tone: "fail" },
  { key: "NOT_TESTED",        short: "—",        tone: "muted" },
];
const OUTCOME_TO_STATUS = { working: "OK", repaired: "RESTORED", replaced: "RESTORED", temporary: "DEGRADED", needs_repair: "NEEDS_REPAIR", needs_replace: "NEEDS_REPLACEMENT", parts: "NEEDS_REPAIR", return: "NEEDS_REPAIR", declined: "FAILED", no_fault: "OK", third_party: "DEGRADED", warranty: "NEEDS_REPAIR", unable: "FAILED" };
export const SVC_CAUSE_CATEGORY = [
  { key: "CABLE",           label: "Cable",           tone: "fail" },
  { key: "CAMERA",          label: "Camera Fault",    tone: "ink" },
  { key: "NVR_DVR",         label: "NVR Fault",       tone: "ink" },
  { key: "HARD_DRIVE",      label: "Hard Drive",      tone: "ink" },
  { key: "POWER",           label: "Power Fault",     tone: "warn" },
  { key: "POE",             label: "PoE",             tone: "warn" },
  { key: "NETWORK",         label: "Network",         tone: "slate" },
  { key: "ISP",             label: "ISP",             tone: "slate" },
  { key: "CONFIGURATION",   label: "Configuration",   tone: "slate" },
  { key: "FIRMWARE",        label: "Firmware",        tone: "slate" },
  { key: "PHYSICAL_DAMAGE", label: "Physical Damage", tone: "fail" },
  { key: "ENVIRONMENTAL",   label: "Environmental",   tone: "slate" },
  { key: "THIRD_PARTY",     label: "Third Party",     tone: "slate" },
  { key: "CUSTOMER_CAUSED", label: "Customer Caused", tone: "slate" },
  { key: "UNKNOWN",         label: "Unknown",         tone: "slate" },
  { key: "RESTORED",        label: "Restored",        tone: "ok" },
  { key: "UNAFFECTED",      label: "Unaffected",      tone: "ok" },
];
const CAUSE_TO_CATEGORY = { camera_hw: "CAMERA", nvr_hw: "NVR_DVR", hdd: "HARD_DRIVE", cable: "CABLE", termination: "CABLE", poe_port: "POE", poe_switch: "POE", power: "POWER", lan: "NETWORK", router: "NETWORK", isp: "ISP", cloud: "NETWORK", netconfig: "CONFIGURATION", credentials: "CONFIGURATION", firmware: "FIRMWARE", display: "CONFIGURATION", environment: "ENVIRONMENTAL", customer: "CUSTOMER_CAUSED", third_party: "THIRD_PARTY", unknown: "UNKNOWN" };
export const causeCategoryOf = (rootCauseKey) => CAUSE_TO_CATEGORY[rootCauseKey] || null;
export const CAUSE_CATEGORY_LABEL = Object.fromEntries(SVC_CAUSE_CATEGORY.map((c) => [c.key, c.label]));
export const DEVICE_STATUS_META = Object.fromEntries(SVC_DEVICE_STATUS.map((d) => [d.key, d]));
// Service modules define the short per-device columns; the shared regions stay the same.
export const SVC_MODULE_FIELDS = {
  cctv:    [["cable", "Cable"], ["power", "Power"], ["video", "Video"]],
  nvr:     [["power", "Power"], ["storage", "Storage"], ["network", "Network"], ["recording", "Recording"]],
  network: [["link", "Link"], ["ip", "IP"], ["internet", "Internet"], ["latency", "Latency"]],
  power:   [["ac", "AC"], ["output", "Output"]],
  access:  [["reader", "Reader"], ["lock", "Lock"], ["credential", "Credential"]],
  alarm:   [["panel", "Panel"], ["sensor", "Sensor"], ["comm", "Comm"]],
  audio:   [["source", "Source"], ["amp", "Amp"], ["zone", "Zone"]],
};
export const moduleFields = (system) => SVC_MODULE_FIELDS[system] || [];
export const SVC_OPTION_TYPES = [
  { key: "repair", label: "Repair" }, { key: "replace", label: "Replace" }, { key: "temporary", label: "Temporary repair" }, { key: "none", label: "No action" }, { key: "third_party", label: "Third-party resolution" },
];
const DIAG_BADGE = { cctv: "CCTV Diagnostic", nvr: "NVR Diagnostic", cabling: "Cabling Diagnostic", network: "Network Diagnostic", power: "Power Diagnostic", display: "Display Diagnostic", app: "Remote Viewing Diagnostic", access: "Access Control Diagnostic", alarm: "Alarm Diagnostic", audio: "Audio Diagnostic", other: "Service Diagnostic" };

// One row per known device, derived from findings + per-device state. Never invents: a device with
// no finding and no state is NOT_TESTED; a device in a finding inherits the finding's outcome status
// and first root cause as its badge.
export function deviceRows(doc) {
  if (!doc) return [];
  return (doc.devices || []).map((dv, i) => {
    const f = (doc.findings || []).find((x) => (x.deviceIds || []).includes(dv.id)) || null;
    const st = doc.deviceState?.[dv.id] || {};
    const status = st.status || (f ? (OUTCOME_TO_STATUS[f.outcome] || (f.rootCauses?.length ? "FAILED" : "NOT_TESTED")) : "NOT_TESTED");
    let cause = f?.rootCauses?.length ? causeCategoryOf(f.rootCauses[0]) : null;
    if (!cause && (status === "RESTORED")) cause = "RESTORED";
    if (!cause && status === "OK") cause = "UNAFFECTED";
    return { n: i + 1, id: dv.id, label: dv.label, kind: dv.kind, status, fields: st.fields || {}, finding: f ? (f.finding || [f.symptoms.join(", "), f.observed].filter(Boolean).join(" — ")) : "", cause, system: f?.system || (doc.systems || [])[0] || "other" };
  });
}

// Factual summary from the rows only ("6 of 8 non-operational · 3 cable · 2 camera · 2 unaffected").
export function autoSummary(doc) {
  const rows = deviceRows(doc);
  if (!rows.length) return "";
  const down = rows.filter((r) => ["FAILED", "NEEDS_REPLACEMENT", "NEEDS_REPAIR"].includes(r.status));
  const degraded = rows.filter((r) => ["DEGRADED", "INTERMITTENT"].includes(r.status));
  const restored = rows.filter((r) => r.status === "RESTORED");
  const ok = rows.filter((r) => r.status === "OK");
  const parts = [];
  if (down.length) parts.push(`${down.length} of ${rows.length} non-operational`);
  if (degraded.length) parts.push(`${degraded.length} degraded`);
  const byCause = {};
  for (const r of [...down, ...degraded]) if (r.cause && !["RESTORED", "UNAFFECTED"].includes(r.cause)) byCause[r.cause] = (byCause[r.cause] || 0) + 1;
  for (const [k, n] of Object.entries(byCause).sort((a, b) => b[1] - a[1])) parts.push(`${n} ${CAUSE_CATEGORY_LABEL[k].toLowerCase()}`);
  if (restored.length) parts.push(`${restored.length} restored on-site`);
  if (ok.length) parts.push(`${ok.length} unaffected`);
  return parts.join(" · ");
}

// Scope lines from a proposal payload (the accepted option, else the first): "8× Camera".
export function proposalScopeLines(payload, acceptedOptions = null) {
  const opts = payload?.options || [];
  const acc = Array.isArray(acceptedOptions) && acceptedOptions.length ? opts.filter((o) => acceptedOptions.includes(o.id)) : opts.slice(0, 1);
  const lines = [];
  for (const o of acc) for (const svc of o.services || []) for (const it of svc.items || []) if (it?.name && !it.waived) lines.push(`${+it.qty > 1 ? `${it.qty}× ` : ""}${it.name}`);
  return lines.slice(0, 20);
}

// ---- The document: regions rendered by svc-report.jsx and the PDF. Empty regions are omitted. ----
//   proposal: { number, version, total, scope: [], fingerprint } | null   (linked PROP-xxxx, computed server-side)
export function documentModel({ call, doc, invoice = null, payments = [], warranty = null, proposal = null, showCharges = true }) {
  doc = doc || emptyDiagnosis();
  const rows = deviceRows(doc);
  const findings = doc.findings || [];
  const items = invoice?.items || [];
  const estTotal = items.reduce((s, r) => s + (+r.qty || 0) * (+r.price || 0), 0);
  const hasEstimate = showCharges && doc.billing !== "warranty" && items.length > 0 && estTotal > 0;
  const options = doc.options || [];
  const type = doc.billing === "warranty" ? "Warranty Service Report"
    : (options.length || hasEstimate || proposal) ? "Service Call Proposal"
    : findings.length ? "Service Diagnostic" : "Service Call Report";
  const badge = DIAG_BADGE[(findings[0]?.system) || (doc.systems || [])[0]] || null;
  const status = SVC_STATUS_ALIAS[call.stage] || call.stage;
  const signed = !!(call.tech_signed_at || call.customer_signed_at);
  const draft = !signed && svcStatusIndex(status) < svcStatusIndex("findings_ready");
  const regions = [];
  const put = (key, title, body) => { if (body) regions.push({ key, title, ...body }); };

  const incident = doc.narrative?.incident || [call.issue, ...findings.map((f) => f.observed)].filter(Boolean).join(" ");
  put("INCIDENT", doc.billing === "warranty" ? "Reported Issue" : "Incident", incident ? { text: incident } : null);
  const sys = rows[0]?.system || (doc.systems || [])[0] || "other";
  const fields = moduleFields(sys);
  put("EQUIPMENT_FINDINGS", `Per-${sys === "cctv" ? "Camera" : "Device"} Findings`, rows.length ? { columns: fields, rows } : null);
  put("SUMMARY", "Summary", (doc.narrative?.summary || autoSummary(doc)) ? { text: doc.narrative?.summary || autoSummary(doc) } : null);
  const rootCause = doc.narrative?.rootCause || findings.map((f) => f.finding).filter(Boolean).join(" ") || [...new Set(findings.flatMap((f) => f.rootCauses || []))].map((c) => CAUSE_LABEL[c]).join(", ");
  put("ROOT_CAUSE", "Root Cause", rootCause ? { text: rootCause } : null);
  const tests = findings.flatMap((f) => (f.tests || []).filter((t) => t.result && t.result !== "NOT TESTED").map((t) => `${TEST_LABEL[t.key] || t.key} — ${t.result}${t.note ? ` (${t.note})` : ""}`));
  put("TESTS", "Diagnostic Tests", tests.length ? { lines: [...new Set(tests)] } : null);
  const work = findings.flatMap((f) => [...(f.work || []).map((w) => WORK_LABEL[w] || w), f.notes].filter(Boolean)).filter((v, i, a) => a.indexOf(v) === i);
  put("WORK_PERFORMED", "Work Performed", work.length ? { lines: work } : null);
  const costOf = (o) => o.costSource === "estimate" && hasEstimate ? { text: money(estTotal), value: estTotal }
    : o.costSource === "proposal" && proposal?.total != null ? { text: money(proposal.total), value: proposal.total }
    : o.costSource === "range" && o.low != null && o.high != null ? { text: `${money(o.low)} – ${money(o.high)}`, value: null }
    : { text: "—", value: null };
  put("REPAIR_OPTIONS", options.length > 1 ? "Repair vs Replace" : "Option", options.length ? { options: options.map((o) => ({ ...o, cost: costOf(o) })) } : null);
  put("COST_COMPARISON", "Cost Comparison", options.length > 1 ? { rows: options.map((o) => ({ title: o.title, description: o.description, cost: costOf(o).text, warranty: o.warranty || "—", reliability: o.reliability || "—", recommended: o.recommended })) } : null);
  const rec = doc.narrative?.recommendation || doc.recommendations || options.find((o) => o.recommended)?.title || findings.map((f) => f.recommendation).filter(Boolean).join(" ");
  put("RECOMMENDATION", "Recommendation", rec ? { text: rec, proposal: proposal ? { number: proposal.number, total: proposal.total } : null, estimateTotal: !proposal && hasEstimate ? estTotal : null } : null);
  put("SCOPE", "Scope", proposal?.scope?.length ? { lines: proposal.scope, number: proposal.number } : hasEstimate ? { lines: items.map((r) => `${+r.qty > 1 ? `${r.qty}× ` : ""}${r.desc}`), number: null } : null);
  const paid = payments.reduce((s, p) => s + (+p.amount || 0), 0);
  put("CHARGES", doc.billing === "estimate" ? "Estimate" : "Charges", hasEstimate && !proposal ? { items, total: estTotal, paid, due: Math.max(0, estTotal - paid) } : doc.billing === "warranty" ? { text: "Warranty visit — no charge." } : null);
  put("WARRANTY", "Warranty", warranty && warranty.status !== "unknown" ? { text: warranty.status === "in" ? `In warranty · until ${warranty.until}` : `Out of warranty · ended ${warranty.until}` } : null);
  const isProposal = type === "Service Call Proposal";
  put("ACCEPTANCE", "Acceptance", draft ? null : { text: isProposal ? `Signature acknowledges the findings above and authorizes IOT TECHS / La Vague Inc. to proceed${proposal ? ` under proposal ${proposal.number}` : hasEstimate ? " under the estimate above" : ""}.` : "Signature acknowledges the findings and work described above.", customer: { name: call.customer_signed_name, at: call.customer_signed_at }, tech: { name: call.tech_signed_name, at: call.tech_signed_at } });
  const page2 = new Set(["REPAIR_OPTIONS", "COST_COMPARISON", "RECOMMENDATION", "SCOPE", "CHARGES", "WARRANTY", "ACCEPTANCE"]);
  return { type, badge, status, statusLabel: svcStatusLabel(status), draft, refProposal: proposal?.number || null,
    pages: [regions.filter((r) => !page2.has(r.key)), regions.filter((r) => page2.has(r.key))].filter((p) => p.length) };
}
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export { money as svcMoney };
