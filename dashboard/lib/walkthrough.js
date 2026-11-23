// Install walkthrough — the checklist model.
//
// The pure shape of the job checklist a technician fills out on every install, taken from
// docs/camera-install-walkthrough.md. The plan is docs/install-tool-plan.md; the nine steps here are
// the same nine the training manual teaches, so a checklist section and a guide step share a key.
//
// FOUR OWNER DECISIONS ARE BUILT IN, not left to the UI:
//
//  1. PER-ITEM MERGE. Every tick is its own fact with its own timestamp, so two technicians ticking
//     at the same moment both land — no refusal, no last-writer-wins over somebody else's work.
//     `mergeWalkthrough` is the whole concurrency story (see the "Merging" section).
//  2. ONE SHARED CHECKLIST PER JOB, with a sign-off line PER TECHNICIAN on that job.
//  3. ALWAYS EDITABLE — during the install and after it, including after the survey locks. Nothing
//     here reads `frozen`, `submitted` or any acceptance.
//  4. PHOTOS ARE LINKED, NEVER COPIED. A photo item holds a reference (a media id or a device cid),
//     never image bytes. The blob stays small and one photo never exists twice.
//
// AND THE RULE THAT OUTRANKS THEM: this document NEVER BLOCKS AN INSTALL. No gate function may read
// it — not phaseGate, buildStageFacts, surveyStageSatisfied, installProgress, qcProgress or
// getToolMeta. tests/walkthrough-never-gates.test.mjs asserts exactly that and fails if it changes.

// ---------------------------------------------------------------- the nine steps

// key      — stable, shared with the training guide so a section can link to its reasoning
// num      — the number printed in the field doc ("01")
// title    — the section heading
// lookFor  — what to look at before starting (the manual's "use your eyes")
// does     — the method, one line per idea
// items    — the checkboxes. `photo: true` means the tick carries a photo LINK.
//            `field: "..."` means the item also captures a short free-text answer.
//            `fill` names what the survey can answer on the technician's behalf (stage 4).
export const WALKTHROUGH_STEPS = [
  {
    key: "survey", num: "01", title: "Site walk and survey",
    lookFor: "Building edges, parking lot and entrances to orient the survey; NVR spot; power; network; longest and shared cable routes; drilling surfaces; hazards.",
    does: [
      "Hold the phone flat and rotate the survey until the curb and building match what you see.",
      "Check a second landmark.",
      "Confirm camera count, names and locations against the work order.",
    ],
    items: [
      { key: "oriented", label: "Survey oriented using two landmarks" },
      { key: "cameras-confirmed", label: "Camera count and locations confirmed", field: "changes", fill: "deviceRoster" },
      { key: "nvr-spot", label: "NVR location: ventilation, mounting and cable entry suitable", fill: "headEnd" },
      { key: "outlets", label: "Two permanent outlets near the NVR (NVR + display); third if a Wi-Fi extender is planned" },
      { key: "network", label: "Router or wired network near the NVR", field: "lanRoute" },
      { key: "ext-cord", label: "Extension cord needed for temporary setup only" },
      { key: "routes", label: "Longest and shared routes identified", fill: "routeBundles" },
      { key: "surfaces", label: "Drilling surfaces noted", field: "surfaces", fill: "mountSurface" },
      { key: "hazards", label: "Hazards, hidden utilities or approvals needed", field: "hazards" },
      { key: "before-photos", label: "Before photos taken of each camera and NVR location", photo: true, fill: "devicePhotos" },
    ],
  },
  {
    key: "nvr", num: "02", title: "NVR and hard drive",
    lookFor: "Mounting spot, ventilation, permanent outlet, LAN and cable entry.",
    does: [
      "With power disconnected, install the hard drive.",
      "Mount the NVR, connect HDMI, LAN and power.",
      "Power up, get it online, initialize the drive and set time and recording.",
      "Extension cords are for approved temporary setup only.",
    ],
    items: [
      { key: "drive-power-off", label: "Hard drive installed with power off" },
      { key: "mounted", label: "NVR mounted and connected" },
      { key: "online", label: "NVR online" },
      { key: "drive-normal", label: "Hard drive recognized, status Normal" },
      { key: "enrollment", label: "QR / app enrollment done if assigned" },
      { key: "photo", label: "Photo of NVR and drive status uploaded", photo: true },
    ],
  },
  {
    key: "drill", num: "03", title: "Drill cable paths",
    lookFor: "Wood, drywall, metal, brick or concrete; hidden pipes and wires; fire-rated walls.",
    does: [
      "Pick the right drill and bit.",
      "Check for hidden utilities first.",
      "Mark and drill every approved hole in one pass.",
      "Sleeve, grommet and seal penetrations.",
      "If anything is uncertain or unsafe, stop and call the PM.",
    ],
    items: [
      { key: "utilities", label: "Hidden utilities checked before drilling" },
      { key: "one-batch", label: "All holes drilled in one batch" },
      { key: "sealed", label: "Exterior holes sealed" },
      { key: "dust", label: "Dust cleaned up" },
      { key: "photo", label: "Photo of each exterior entry", photo: true },
    ],
  },
  {
    key: "pull", num: "04", title: "Run Cat6 drops",
    lookFor: "Longest routes, shared paths, obstacles, support points, service-loop spots.",
    does: [
      "Start at the NVR. Pull the longest shared runs first, several cables together.",
      "Split only at each branch.",
      "Leave service slack at both ends.",
      "No kinks, crushing or over-pulling.",
      "Ceiling tiles and grid are not cable supports.",
    ],
    items: [
      { key: "longest-first", label: "Longest shared runs pulled first", fill: "routeBundles" },
      { key: "slack", label: "Service slack left at NVR and camera ends" },
      { key: "labeled", label: "Every cable labeled at both ends" },
      { key: "photo", label: "Photo of each run before it is closed up", photo: true },
    ],
  },
  {
    key: "terminate", num: "05", title: "NVR-side terminations",
    lookFor: "Which cable feeds which camera, and its NVR or PoE port.",
    does: ["Strip, terminate, label and test every NVR-side end before moving out to the cameras."],
    items: [
      { key: "terminated", label: "Every NVR-side end terminated and labeled" },
      { key: "tested", label: "Every cable tested: no opens, shorts, reversals or split pairs" },
      { key: "port-map", label: "Cable-to-port map noted in the work order", fill: "portMap" },
    ],
  },
  {
    key: "manage", num: "06", title: "Cable management",
    lookFor: "Loose loops, exposed cable, sharp edges, untidy bundles, unsupported spans.",
    does: [
      "Secure and organize every run with approved supports.",
      "Do not pinch or overtighten Cat6. Size clips and staples to the bundle.",
      "Never fasten to sprinkler pipes, electrical conduit or ceiling grid.",
      "Neat, straight, level.",
    ],
    items: [
      { key: "supported", label: "Every run supported, neat and straight" },
      { key: "not-crushed", label: "No crushed or overtightened cable" },
      { key: "photo", label: "Photo of finished cable runs", photo: true },
    ],
  },
  {
    key: "mount", num: "07", title: "Mount and verify each camera",
    lookFor: "Mount surface, view, and connection method (connector pocket hole, junction box or external route).",
    does: [
      "Terminate the camera end and test the cable before mounting.",
      "Conceal the RJ45 in an approved pocket hole, or protect it with a junction box.",
      "Mount with three correct screws, anchors where needed.",
      "Seal the outdoor connector. Aim and confirm live view.",
    ],
    // Per camera, not per job — the UI repeats this block for each camera in the survey roster.
    perDevice: "cam",
    items: [
      { key: "tested-first", label: "Camera end tested before mounting" },
      { key: "firm-level", label: "Mounted firm and level" },
      { key: "sealed", label: "Outdoor connector sealed", fill: "placement" },
      { key: "live", label: "Live image confirmed and aimed" },
      { key: "photo", label: "Photo uploaded under that camera name", photo: true, fill: "devicePhotos" },
    ],
  },
  {
    key: "inspect", num: "08", title: "Final NVR inspection",
    lookFor: "Offline cameras, wrong angles or names, recording faults, anything flagged earlier.",
    does: ["Go back to the NVR. Confirm every camera is online and aimed right, the drive says Normal, and recording plays back."],
    items: [
      { key: "all-live", label: "Every camera live on the monitor" },
      { key: "nvr-online", label: "NVR online" },
      { key: "drive-normal", label: "Hard drive status Normal" },
      { key: "replay", label: "One instant replay played back" },
      { key: "failures", label: "Remaining failures written up for the PM", field: "failures" },
    ],
  },
  {
    key: "closeout", num: "09", title: "Clean, return and PM closeout",
    lookFor: "Trash, cable scraps, tie tails, drill dust, tools left behind, unfinished work.",
    does: [
      "Clean the site and replace ceiling tiles.",
      "Check every tool back against the load-out table.",
      "Take completion photos.",
      "Mark the job ready and notify the PM.",
      "The PM handles channel naming, the customer app and handoff.",
    ],
    items: [
      { key: "clean", label: "Site clean, ceiling tiles replaced" },
      { key: "tools-back", label: "Every tool checked back in", fill: "loadout" },
      { key: "photos", label: "Completion photos uploaded", photo: true },
      { key: "exceptions", label: "Exceptions marked in the work order", field: "exceptions" },
      { key: "pm-notified", label: "PM notified" },
    ],
  },
];

export const STEP_KEYS = WALKTHROUGH_STEPS.map((s) => s.key);
export const stepByKey = (key) => WALKTHROUGH_STEPS.find((s) => s.key === key) || null;

// ---------------------------------------------------------------- load-out and materials

// Need / Packed / Back, exactly the three columns in the field doc. `need` is what the job implies
// (stage 5 pre-ticks it); Packed and Back are always the technician.
export const LOADOUT = [
  { group: "Drilling", items: ["Impact driver", "Drill/driver", "Hammer drill", "SDS drill (corded, with extension cord)", "Bits: wood, masonry, metal, Phillips", "Charged batteries"] },
  { group: "Cable pulling", items: ["Fish poles", "Fish tape", "Pull string", "Cable cutter"] },
  { group: "Termination", items: ["Cable stripper", "Pass-through RJ45 crimper", "Scout Pro 3 PoE tester + remote", "Toner + wand"] },
  { group: "Mounting and access", items: ["Extension ladder", "Step ladder", "Low-voltage stapler", "Fastback knife", "Marker and level"] },
  { group: "NVR setup", items: ["Monitor, HDMI cable, mouse", "Small screwdriver set", "Phone with camera app"] },
  { group: "Safety and cleanup", items: ["Safety glasses", "Gloves", "M12 vacuum", "Trash bags"] },
];

// `per` is the rate the field doc already states, so a quantity can be derived from the survey
// rather than typed. null = judgement, left to the technician.
export const MATERIALS = [
  { key: "cat6", label: "Outdoor-rated 100% copper Cat6 (ft)", per: null },
  { key: "rj45", label: "Pass-through RJ45 connectors", per: { of: "cam", each: 2, spares: 4 } },
  { key: "boots", label: "Weatherproof RJ45 boots / enclosures", per: { of: "camOutdoor", each: 1, spares: 2 } },
  { key: "jbox", label: "Junction boxes", per: null },
  { key: "clip1", label: "Single clips", per: null },
  { key: "clip2", label: "Double clips", per: null },
  { key: "clip34", label: "3/4-inch clips", per: null },
  { key: "zip", label: "Zip ties and mounting zip ties", per: null },
  { key: "velcro", label: "Velcro straps", per: null },
  { key: "staples", label: "Low-voltage staples", per: null },
  { key: "screws", label: "Anchors and screws", per: { of: "cam", each: 3, spares: 6 } },
  { key: "sleeves", label: "Sleeves and grommets", per: null },
  { key: "sealant", label: "Exterior sealant", per: null },
  { key: "tape", label: "Electrical tape", per: null },
  { key: "labels", label: "Cable labels", per: { of: "cam", each: 2, spares: 4 } },
  { key: "patch", label: "Patch cables", per: { of: "nvr", each: 1, spares: 1 } },
];

// Quantity a count implies, or null when the doc leaves it to judgement.
export function materialQty(mat, counts = {}) {
  if (!mat || !mat.per) return null;
  const n = +counts[mat.per.of] || 0;
  if (!n) return null;
  return n * mat.per.each + (mat.per.spares || 0);
}

// ---------------------------------------------------------------- the document

export const WALKTHROUGH_VERSION = 1;

// A blank checklist. `items` is a flat map so a tick is addressable on its own — that is what makes
// the per-item merge possible. Nothing in here depends on the survey being open or unlocked.
export function blankWalkthrough({ createdBy = null, at = null } = {}) {
  return {
    v: WALKTHROUGH_VERSION,
    createdAt: at || null,
    createdBy: createdBy || null,
    items: {},        // "step.item" or "step.item#cid" → { done, by, at }
    fields: {},       // "step.field"                   → { text, by, at }
    loadout: {},      // "Tool name"                    → { need, packed, back } each { v, by, at }
    materials: {},    // material key                   → { need, used } each { v, by, at }
    signoffs: {},     // technician id                  → { name, at, note }
    voidedAt: null,   // archive, never delete
  };
}

// "survey.oriented" or, for a per-camera step, "mount.live#cabc123".
export function itemId(stepKey, itemKey, cid = null) {
  return cid ? `${stepKey}.${itemKey}#${cid}` : `${stepKey}.${itemKey}`;
}
export function fieldId(stepKey, fieldKey) { return `${stepKey}.${fieldKey}`; }

// ---------------------------------------------------------------- merging (decision 1)

// Every tick carries its own timestamp, so two technicians who tick different items both keep their
// work, and two who tick the SAME item resolve to the later one. There is no document-level version
// to lose a race on — which is the point: nobody is ever told "someone else saved first, try again".
//
// `at` is an ISO string. A fact with no timestamp loses to one that has a timestamp, and when two
// are genuinely equal the incoming one wins (a retry of the same write is then idempotent).
function newer(a, b) {
  if (!a) return b; if (!b) return a;
  const ta = String(a.at || ""), tb = String(b.at || "");
  if (ta === tb) return b;
  return tb > ta ? b : a;
}
function mergeMap(mine = {}, theirs = {}, pick = newer) {
  const out = { ...mine };
  for (const k of Object.keys(theirs || {})) out[k] = pick(mine[k], theirs[k]);
  return out;
}
// The load-out and materials hold a small record per column, each with its own timestamp, so two
// technicians can tick "packed" and "back" on the same tool without one erasing the other.
function mergeCols(mine = {}, theirs = {}) {
  const out = { ...mine };
  for (const k of Object.keys(theirs || {})) {
    const a = mine[k] || {}, b = theirs[k] || {}, row = { ...a };
    for (const col of new Set([...Object.keys(a), ...Object.keys(b)])) row[col] = newer(a[col], b[col]);
    out[k] = row;
  }
  return out;
}

export function mergeWalkthrough(mine, theirs) {
  if (!mine) return theirs || null;
  if (!theirs) return mine;
  return {
    ...mine,
    v: Math.max(+mine.v || 1, +theirs.v || 1),
    createdAt: mine.createdAt || theirs.createdAt || null,
    createdBy: mine.createdBy || theirs.createdBy || null,
    items: mergeMap(mine.items, theirs.items),
    fields: mergeMap(mine.fields, theirs.fields),
    loadout: mergeCols(mine.loadout, theirs.loadout),
    materials: mergeCols(mine.materials, theirs.materials),
    // A sign-off is a person saying "I did my part". It is never overwritten by someone else, and
    // once given it stands — so the earliest wins and a second write cannot erase it.
    signoffs: mergeMap(mine.signoffs, theirs.signoffs, (a, b) => a || b),
    voidedAt: mine.voidedAt || theirs.voidedAt || null,
  };
}

// ---------------------------------------------------------------- reading it

export function isTicked(doc, id) { return !!(doc && doc.items && doc.items[id] && doc.items[id].done); }

// Every item this job actually has: the nine steps, with the per-camera step expanded over the
// cameras the survey knows about. `cams` is a list of { cid, name } from the survey roster.
export function allItemIds(cams = []) {
  const out = [];
  for (const step of WALKTHROUGH_STEPS) {
    for (const it of step.items) {
      if (step.perDevice) { for (const c of cams) if (c && c.cid) out.push(itemId(step.key, it.key, c.cid)); }
      else out.push(itemId(step.key, it.key));
    }
  }
  return out;
}

// Progress, for showing the technician where they are. It is NOT a gate and nothing may treat it as
// one — see the never-gates test.
export function walkthroughProgress(doc, cams = []) {
  const ids = allItemIds(cams);
  const done = ids.filter((id) => isTicked(doc, id)).length;
  return { done, total: ids.length, pct: ids.length ? Math.round((done / ids.length) * 100) : 0 };
}

export function stepProgress(doc, stepKey, cams = []) {
  const step = stepByKey(stepKey);
  if (!step) return { done: 0, total: 0 };
  const ids = step.perDevice
    ? cams.filter((c) => c && c.cid).flatMap((c) => step.items.map((it) => itemId(stepKey, it.key, c.cid)))
    : step.items.map((it) => itemId(stepKey, it.key));
  return { done: ids.filter((id) => isTicked(doc, id)).length, total: ids.length };
}

// ---------------------------------------------------------------- sign-off (decision 2)

// One shared checklist, one line per technician on the job. Signing is per person and additive: it
// never closes the document, and it never stops anyone else editing.
export function signOff(doc, { techId, name = "", note = "", at }) {
  if (!doc || !techId) return doc;
  const id = String(techId);
  if (doc.signoffs && doc.signoffs[id]) return doc;        // already signed — a sign-off is not re-done
  return { ...doc, signoffs: { ...(doc.signoffs || {}), [id]: { name: String(name || ""), note: String(note || ""), at: at || null } } };
}
export function signedBy(doc) { return Object.entries((doc && doc.signoffs) || {}).map(([id, s]) => ({ techId: id, ...s })); }

// ---------------------------------------------------------------- photos (decision 4)

// A photo item holds a REFERENCE. `mediaId` points at a row in `media`; `cid` points at a camera
// whose photo the survey already holds. Never bytes: a data URL here would duplicate a photo that
// already exists and grow the blob without limit.
export function photoRef(doc, id) {
  const it = doc && doc.items && doc.items[id];
  return it && it.photo ? it.photo : null;
}
export function isPhotoRef(ref) {
  if (!ref || typeof ref !== "object") return false;
  if (typeof ref.mediaId === "string" && ref.mediaId) return true;
  if (typeof ref.cid === "string" && ref.cid) return true;
  return false;
}
// Guards the write path: anything that looks like image bytes is refused outright.
export function rejectsInlineImage(ref) {
  const s = JSON.stringify(ref || "");
  return /data:image\//i.test(s) || /^"?[A-Za-z0-9+/]{2000,}={0,2}"?$/.test(s);
}
