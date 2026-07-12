// Proposal domain model — pure module, safe to import from server (page.jsx, actions)
// and client (builder components). No DB, no React.
//
// Ported from the legacy calculator (public/proposal-v3.html CATALOG/optTotals) with
// the per-camera labor bundle priced per the owner: Cat6 Drop $150, Cat6 Termination $20,
// Camera Mounting $20, Camera Programming $20, Camera Waterproofing $20.

export const OPTION_LETTERS = ["A", "B", "C"];
export const OPTION_NAMES = ["Essential", "Recommended", "Premium"];

export const PROPOSAL_SERVICES = [
  { key: "camera", label: "Security Cameras" },
  { key: "sound",  label: "Sound System" },
  { key: "toast",  label: "Toast POS" },
  { key: "alarm",  label: "Alarm System" },
  { key: "access", label: "Access Control" },
  { key: "wiring", label: "Wiring / Low-Voltage" },
  { key: "custom", label: "Custom" },
];
export const serviceLabel = (k) => PROPOSAL_SERVICES.find((s) => s.key === k)?.label || k;

// Per-service color coding — matches the site survey tool's own group colors
// (public/widgets/site-survey.html GROUPS) so a service reads the same everywhere.
export const SERVICE_COLORS = {
  camera: "#C9A96E", // gold — cctv group
  sound:  "#B084E0", // purple — sound group
  toast:  "#E8743B", // orange — toast group
  alarm:  "#5FB8DB", // blue — alarm group
  access: "#6FBF73", // green — not a survey group; distinct color for access control
  wiring: "#9AA1AC",
  custom: "#9AA1AC",
};
export const serviceColor = (key) => SERVICE_COLORS[key] || SERVICE_COLORS.camera;

// Catalog defaults — always editable in the builder. cost is staff-only (0 = not entered).
export const PROPOSAL_CATALOG = {
  camera: [
    { name: "Camera",               price: 70,   cost: 0 },
    { name: "4K Bullet Camera",     price: 185,  cost: 0 },
    { name: "4K Dome Camera",       price: 175,  cost: 0 },
    { name: "4K Turret Camera",     price: 175,  cost: 0 },
    { name: "Cat6 Drop",            price: 150,  cost: 0 },
    { name: "Cat6 Termination",     price: 20,   cost: 0 },
    { name: "Camera Mounting",      price: 20,   cost: 0 },
    { name: "Camera Programming",   price: 20,   cost: 0 },
    { name: "Camera Waterproofing", price: 20,   cost: 0 },
    // Monitor add-ons for viewing the NVR feed directly — optional, not auto-bundled.
    // Customer Provided / Monitor + Mount / Monitor + Mount + Custom are the 3 picks in
    // each Display Slot (system bar) — the latter two are bundled, one line, one price.
    { name: "Customer Provided",         price: 0,   cost: 0 },
    { name: "Monitor + Mount",           price: 200, cost: 0 },
    { name: "Monitor + Mount + Custom",  price: 0,   cost: 0 },
    { name: "HDMI",                      price: 0,   cost: 0 },
    { name: "Second Display",            price: 0,   cost: 0 },
    { name: "NVR (8-Channel)",                price: 150, cost: 0 },
    { name: "NVR (16-Channel)",               price: 300, cost: 0 },
    { name: "NVR (32-Channel)",               price: 500, cost: 0 },
    { name: "NVR (32-Channel + 16-Port PoE)", price: 600, cost: 0 },
    { name: "2TB Storage Drive",              price: 90,  cost: 0 },
    { name: "4TB Storage Drive",              price: 180, cost: 0 },
    { name: "6TB Storage Drive",              price: 270, cost: 0 },
    { name: "8TB Storage Drive",              price: 360, cost: 0 },
  ],
  sound: [
    { name: "Ceiling Speaker",   price: 120, cost: 0 },
    { name: "Surface Speaker",   price: 135, cost: 0 },
    { name: "Speaker Wire Run",  price: 65,  cost: 0 },
    { name: "Amplifier (4-zone)",price: 480, cost: 0 },
    { name: "Volume Control",    price: 75,  cost: 0 },
    { name: "Tuning & Setup",    price: 120, cost: 0 },
  ],
  toast: [
    { name: "Toast Terminal",        price: 0,   cost: 0 },
    { name: "Kitchen Display (KDS)", price: 0,   cost: 0 },
    { name: "Cat6 Drop",             price: 150, cost: 0 },
    { name: "Network Switch",        price: 140, cost: 0 },
    { name: "Router / Firewall",     price: 220, cost: 0 },
    { name: "Cabling & Setup",       price: 120, cost: 0 },
  ],
  alarm: [
    { name: "Control Panel",       price: 320, cost: 0 },
    { name: "Door/Window Sensor",  price: 45,  cost: 0 },
    { name: "Motion Sensor",       price: 65,  cost: 0 },
    { name: "Glass-Break Sensor",  price: 70,  cost: 0 },
    { name: "Keypad",              price: 110, cost: 0 },
    { name: "Smoke / CO Detector", price: 85,  cost: 0 },
  ],
  access: [
    { name: "Card Reader",      price: 260, cost: 0 },
    { name: "Electric Strike",  price: 180, cost: 0 },
    { name: "Door Controller",  price: 340, cost: 0 },
    { name: "REX / Exit Button",price: 60,  cost: 0 },
    { name: "Maglock",          price: 210, cost: 0 },
  ],
  wiring: [
    { name: "Cat6 Drop",           price: 150, cost: 0 },
    { name: "Conduit Run (per ft)",price: 8,   cost: 0 },
    { name: "Patch Panel",         price: 160, cost: 0 },
    { name: "Rack & Dress",        price: 240, cost: 0 },
  ],
  custom: [],
};

// Per-camera labor bundle: every camera imported from the survey brings these along (qty = camera count).
export const CAMERA_BUNDLE = [
  { name: "Cat6 Drop",            price: 150 },
  { name: "Cat6 Termination",     price: 20 },
  { name: "Camera Mounting",      price: 20 },
  { name: "Camera Programming",   price: 20 },
  { name: "Camera Waterproofing", price: 20 },
];

// NVR models and storage drives are structurally load-bearing — their exact names are
// pattern-matched elsewhere (channel/bay counts, quick-pick lists in proposal-items-editor.jsx).
// They stay LOCKED in the catalog editor: price is editable, name and removal are not.
export const LOCKED_CATALOG_NAMES = new Set([
  "NVR (8-Channel)", "NVR (16-Channel)", "NVR (32-Channel)", "NVR (32-Channel + 16-Port PoE)",
  "2TB Storage Drive", "4TB Storage Drive", "6TB Storage Drive", "8TB Storage Drive",
]);

// ---- Editable default price book (the gear icon in the builder) --------------
// Baseline defaults derived from the catalog; the admin can override price, rename,
// hide, or add brand-new catalog entries. Company-wide (DB-backed, see proposal-actions.js
// getPriceBookAction/savePriceBookAction); localStorage is a client-side cache.
export const DEFAULT_PRICES = { Camera: 70 };
// Every service's catalog, not just camera's — effectiveCatalog() routes ALL services'
// default prices through this map, so Toast/Sound/Alarm/Access/Wiring need entries too.
Object.values(PROPOSAL_CATALOG).forEach((list) => (list || []).forEach((c) => { DEFAULT_PRICES[c.name] = c.price; }));
CAMERA_BUNDLE.forEach((b) => { DEFAULT_PRICES[b.name] = b.price; });

// Rows shown in the pricing modal's "Camera & labor" / "Recorder" / "Storage" sub-groups
// (the rest of PROPOSAL_CATALOG.camera — 4K Bullet/Dome/Turret — shows as regular catalog rows).
export const PRICE_FIELDS = [
  { group: "Camera & labor", names: ["Camera", "Cat6 Drop", "Cat6 Termination", "Camera Mounting", "Camera Programming", "Camera Waterproofing"] },
  { group: "Recorder (NVR)", names: ["NVR (8-Channel)", "NVR (16-Channel)", "NVR (32-Channel)", "NVR (32-Channel + 16-Port PoE)"] },
  { group: "Storage", names: ["2TB Storage Drive", "4TB Storage Drive", "6TB Storage Drive", "8TB Storage Drive"] },
];
const PRICE_FIELD_NAMES = new Set(PRICE_FIELDS.flatMap((g) => g.names));

const emptyBook = () => ({ prices: {}, names: {}, hidden: {}, custom: {} });

// Client-side cache of the company price book (localStorage). Shape: { prices, names,
// hidden, custom } — see lib/db.js getPriceBook/setPriceBook for the DB-backed source of truth.
const PRICE_KEY = "iot_price_defaults";
export function loadPriceBook() {
  try {
    if (typeof localStorage === "undefined") return emptyBook();
    const d = JSON.parse(localStorage.getItem(PRICE_KEY) || "{}") || {};
    return { prices: d.prices || {}, names: d.names || {}, hidden: d.hidden || {}, custom: d.custom || {} };
  } catch { return emptyBook(); }
}
export function savePriceBookCache(book) {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(PRICE_KEY, JSON.stringify(book || emptyBook())); } catch {}
}
// Back-compat aliases used by a couple of older call sites.
export const loadPriceOverrides = () => loadPriceBook().prices;
export const savePriceOverrides = (prices) => savePriceBookCache({ ...loadPriceBook(), prices });

// Effective price for a named item: admin override → catalog default → 0.
export function priceOf(name, book) {
  const b = book || loadPriceBook();
  const prices = b.prices || b; // tolerate being passed a flat prices map too
  const v = prices?.[name];
  return v != null && v !== "" ? +v : (DEFAULT_PRICES[name] ?? 0);
}
// Effective display name: admin rename → catalog default. Locked (NVR/drive) names never change.
export function displayNameOf(name, book) {
  if (LOCKED_CATALOG_NAMES.has(name)) return name;
  const b = book || loadPriceBook();
  return b.names?.[name] || name;
}
// The full editable catalog for one service: defaults (renamed/priced/minus hidden) + custom
// entries the admin added. Each row carries `baseName` (the stable key for locked items;
// custom items just use their own name) so the UI knows what's renamable/removable.
export function effectiveCatalog(serviceKey, book) {
  const b = book || loadPriceBook();
  const hidden = new Set(b.hidden?.[serviceKey] || []);
  const base = (PROPOSAL_CATALOG[serviceKey] || [])
    .filter((c) => LOCKED_CATALOG_NAMES.has(c.name) || !hidden.has(c.name))
    .map((c) => ({
      baseName: c.name,
      name: displayNameOf(c.name, b),
      price: priceOf(c.name, b),
      locked: LOCKED_CATALOG_NAMES.has(c.name),
      custom: false,
    }));
  const custom = (b.custom?.[serviceKey] || []).map((c) => ({ baseName: c.name, name: c.name, price: +c.price || 0, locked: false, custom: true }));
  return [...base, ...custom];
}

// Every service's catalog in one flat list, each row tagged with its `service` key — feeds
// the item-name autocomplete (search across all services, prioritize the one being edited).
export function allCatalogEntries(book) {
  const b = book || loadPriceBook();
  return PROPOSAL_SERVICES.flatMap((s) => effectiveCatalog(s.key, b).map((c) => ({ ...c, service: s.key })));
}

// Survey marker kind → proposal line item. Kinds from public/widgets/site-survey.html GROUPS.
const SURVEY_KIND_MAP = {
  cam:    { service: "camera", name: "Camera",               price: 70,  bundle: true, locate: true },
  nvr:    { service: "camera", name: "NVR (16-Channel)",     price: 300 },
  isp:    { service: "camera", name: "ISP",                  price: 0 },
  poe:    { service: "camera", name: "PoE Switch",           price: 140 },
  disp:   { service: "camera", name: "Display / Monitor",    price: 0 },
  spk:    { service: "sound",  name: "Speaker",              price: 120, locate: true },
  amp:    { service: "sound",  name: "Amplifier (4-zone)",   price: 480 },
  aux:    { service: "sound",  name: "Audio Input",          price: 0 },
  // Per the Toast Equipment Cable Guide: Pronto/Meraki and ISP are Toast-managed / customer-
  // provided (no cable charge); every other Toast device is hardwired and gets a Cat6 Drop
  // line ($150) plus its own numbered block, same as camera.
  pronto: { service: "toast",  name: "Pronto / Meraki",      price: 0 },
  tap:    { service: "toast",  name: "Access Point",         price: 140, locate: true, needsLine: true },
  tpoe:   { service: "toast",  name: "Network Switch",       price: 140, locate: true, needsLine: true },
  pos:    { service: "toast",  name: "Toast Terminal",       price: 0, locate: true, needsLine: true },
  kprint: { service: "toast",  name: "Kitchen Printer",      price: 0, locate: true, needsLine: true },
  kds:    { service: "toast",  name: "Kitchen Display (KDS)",price: 0, locate: true, needsLine: true },
  ssk:    { service: "toast",  name: "Self-Service Kiosk",   price: 0, locate: true, needsLine: true },
  tisp:   { service: "toast",  name: "ISP",                  price: 0 },
  door:   { service: "alarm",  name: "Door/Window Sensor",   price: 45,  locate: true },
  motion: { service: "alarm",  name: "Motion Sensor",        price: 65,  locate: true },
  glass:  { service: "alarm",  name: "Glass-Break Sensor",   price: 70,  locate: true },
  keypad: { service: "alarm",  name: "Keypad",               price: 110, locate: true },
  fire:   { service: "alarm",  name: "Smoke / CO Detector",  price: 85,  locate: true },
  aisp:   { service: "alarm",  name: "ISP",                  price: 0 },
  // misc annotation kinds (important / outlet / hazard / note) are intentionally skipped
};

let _iid = 1;
export const newItemId = () => "li" + Date.now().toString(36) + (_iid++).toString(36) + Math.random().toString(36).slice(2, 6);

export function blankOption(i) {
  return { id: OPTION_LETTERS[i], name: OPTION_NAMES[i] || "Option " + OPTION_LETTERS[i], services: [], note: "", includeMockup: false, includeSurvey: false };
}
export function blankPayload() {
  return { options: [blankOption(0)], discount: { type: "flat", value: 0 }, pcp_credit: 0 };
}

// ---- Survey import ---------------------------------------------------------
// Takes the parsed survey save (localStorage iottechs_sitesurvey_v2_<PID>) and returns
// service groups ready to merge into an option. Every individually-PLACED device
// (camera, speaker, access point, POS terminal, alarm sensor…) becomes its own named,
// numbered block (from its survey location name) — for cameras the labor bundle is
// indented sub-items; for everything else the single sub-item is the device itself:
//   Front Door Camera  $300          Front Door Access Point  $140
//     └ Camera, Cat6 Drop, …            └ Access Point $140
// Devices with no individual location (aggregated counts, e.g. PoE switches, printers)
// stay as flat count-based line items. Capitalize the first letter of each word,
// leaving the rest as-is so acronyms (NVR, Cat6, KDS, POS) and mixed-case survive.
export const titleCase = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

// Format a signature/acceptance timestamp for display. Values are stored as localtime
// "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now','localtime')), so format the parts directly —
// no timezone conversion. → "Jul 7, 2026 · 12:10 AM".
export function fmtSignStamp(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(s);
  const [, Y, Mo, D, H, Mi] = m;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = parseInt(H, 10); const ap = h < 12 ? "AM" : "PM"; h = h % 12; if (h === 0) h = 12;
  return `${months[parseInt(Mo, 10) - 1]} ${parseInt(D, 10)}, ${Y} · ${h}:${Mi} ${ap}`;
}
// Compact floor label — always the floor's position in the list ("FP1", "FP2", …),
// regardless of its actual survey name. Deliberately ignores any digit already in the
// name (e.g. a custom "Basement" next to a "Floor 2" would otherwise both resolve to "FP2").
function floorShort(index) {
  return `FP${index + 1}`;
}
// Floor plans with the count of importable devices on each (for the per-floor import picker).
export function surveyFloorSummary(survey) {
  return (survey?.floors || []).map((f, index) => ({
    index,
    name: floorShort(index),
    count: (f.markers || []).filter((m) => SURVEY_KIND_MAP[m.kind]).length,
  })).filter((f) => f.count > 0);
}

// A block's location name, avoiding a doubled suffix ("Access Point Access Point")
// when the survey pin was already named after the device itself.
function blockLabel(name, deviceLabel, fallbackNum) {
  if (!name) return `${deviceLabel} ${fallbackNum}`;
  return new RegExp(`\\b${deviceLabel}$`, "i").test(name.trim()) ? name : `${name} ${deviceLabel}`;
}

// "Back Door Camera" + floor "FP1" + io "O" -> "Back Door Camera — FP1 (O)". `io` is
// only passed for camera/Toast items (the owner's indoor/outdoor labeling convention).
function withLocSuffix(base, floor, io) {
  return [base, floor ? `— ${floor}` : null, io ? `(${io})` : null].filter(Boolean).join(" ");
}

// ISP, Pronto/Meraki, and the Network Switch are on every Toast job regardless of what's
// actually marked on the floor plan — per the owner, always present, in this fixed order.
// Skipped per-kind when the survey already placed a real one (so nothing doubles up).
const TOAST_BASELINE_KINDS = ["tisp", "pronto", "tpoe"];
const TOAST_BASELINE_BUILDERS = {
  tisp: (px, dn) => ({ id: newItemId(), name: dn("ISP"), qty: 1, price: px("ISP"), cost: 0 }),
  pronto: (px, dn) => ({ id: newItemId(), name: dn("Pronto / Meraki"), qty: 1, price: px("Pronto / Meraki"), cost: 0 }),
  tpoe: (px, dn) => ({
    id: newItemId(), name: dn("Network Switch"), qty: 1, price: 0, cost: 0,
    sub: [
      { id: newItemId(), name: dn("Network Switch"), qty: 1, price: px("Network Switch", 140), cost: 0 },
      { id: newItemId(), name: dn("Cat6 Drop"), qty: 1, price: px("Cat6 Drop", 150), cost: 0 },
    ],
  }),
};
export function toastBaselineItems(book, seenKinds = new Set()) {
  const px = (name, fallback) => priceOf(name, book) || (fallback ?? 0);
  const dn = (name) => displayNameOf(name, book);
  return TOAST_BASELINE_KINDS.filter((k) => !seenKinds.has(k)).map((k) => TOAST_BASELINE_BUILDERS[k](px, dn));
}

// `floorIndex` (optional): a single floor's index, an array of indices (the floor-plan
// checkbox picker), or omit/null for every floor. The FPn suffix always reflects each
// floor's true position in the survey, not its position within a picked subset.
export function surveyToImport(survey, floorIndex) {
  const book = loadPriceBook();
  const px = (name, fallback) => priceOf(name, book) || (fallback ?? 0);
  const dn = (name) => displayNameOf(name, book); // renamed catalog entries flow into new imports
  const all = survey?.floors || [];
  const pick = floorIndex == null ? all.map((f, i) => i) : (Array.isArray(floorIndex) ? floorIndex : [floorIndex]);
  const floors = pick.map((i) => (all[i] ? { f: all[i], i } : null)).filter(Boolean);
  const counts = {};   // kind -> qty (aggregated — no individual location)
  const cameras = [];  // one entry per camera marker (gets the labor bundle)
  const devices = [];  // one entry per other individually-placed marker (its own numbered block)
  const seenKinds = new Set();
  floors.forEach(({ f, i: fi }) => {
    (f.markers || []).forEach((m) => {
      const map = SURVEY_KIND_MAP[m.kind];
      if (!map) return;
      seenKinds.add(m.kind);
      // Every marker carries its placement mode from the survey tool ('out'/'in') — shown
      // as an (O)/(I) suffix on camera and Toast line items (per the owner's convention).
      const named = { name: m.name ? titleCase(m.name) : null, floor: floors.length > 1 ? floorShort(fi) : null, io: m.mode === "out" ? "O" : "I" };
      if (map.bundle) { cameras.push(named); return; }
      if (map.locate) { devices.push({ ...named, kind: m.kind }); return; }
      counts[m.kind] = (counts[m.kind] || 0) + 1;
    });
  });

  const byService = {};
  const svcFor = (key) =>
    (byService[key] = byService[key] || { key, label: serviceLabel(key), items: [], note: "" });

  // Cameras: the location is a group header (price 0, total = sum of its lines); the
  // camera hardware itself + the labor bundle are line items under it. Prices from the book.
  cameras.forEach((cam, i) => {
    const svc = svcFor("camera");
    const base = blockLabel(cam.name, "Camera", i + 1);
    const label = withLocSuffix(base, cam.floor, cam.io);
    svc.items.push({
      id: newItemId(), name: label, qty: 1, price: 0, cost: 0, outdoor: cam.io === "O",
      sub: [
        { id: newItemId(), name: dn("Camera"), qty: 1, price: px("Camera"), cost: 0 },
        ...CAMERA_BUNDLE.map((b) => ({ id: newItemId(), name: dn(b.name), qty: 1, price: px(b.name), cost: 0 })),
      ],
    });
  });
  // Exactly ONE recorder, sized to the camera count: ≤8 → 8-Ch, ≤16 → 16-Ch, else 32-Ch. Upgrading
  // is a swap, never a second NVR. An explicit "nvr" survey marker is skipped below so it can't
  // add a duplicate — the recorder is always derived from how many cameras there are.
  if (cameras.length) {
    const nvr = cameras.length <= 8 ? "NVR (8-Channel)" : cameras.length <= 16 ? "NVR (16-Channel)" : "NVR (32-Channel)";
    svcFor("camera").items.push({ id: newItemId(), name: nvr, qty: 1, price: px(nvr), cost: 0 });
  }

  // Other individually-placed devices (speakers, access points, POS terminals, alarm
  // sensors…): one numbered block per unit, same pattern as cameras — header = location
  // name, single sub-item = the device at its catalog/price-book price.
  const perKindNum = {};
  devices.forEach((dev) => {
    if (dev.kind === "nvr") return; // recorder is auto-sized from the camera count above (no dupes)
    const map = SURVEY_KIND_MAP[dev.kind];
    const svc = svcFor(map.service);
    perKindNum[dev.kind] = (perKindNum[dev.kind] || 0) + 1;
    const base = blockLabel(dev.name, dn(map.name), perKindNum[dev.kind]);
    // Indoor/outdoor suffix + red-outdoor-border are a Toast + camera convention only —
    // not shown for alarm/sound/access blocks even though they're also individually-placed.
    const isToastOrCam = map.service === "toast";
    const label = withLocSuffix(base, dev.floor, isToastOrCam ? dev.io : null);
    // Toast devices that need a hardwired line (per the Cable Guide) get a Cat6 Drop
    // sub-item at $150, same convention as the camera bundle.
    const sub = [{ id: newItemId(), name: dn(map.name), qty: 1, price: px(map.name, map.price), cost: 0 }];
    if (map.needsLine) sub.push({ id: newItemId(), name: dn("Cat6 Drop"), qty: 1, price: px("Cat6 Drop", 150), cost: 0 });
    svc.items.push({
      id: newItemId(), name: label, qty: 1, price: 0, cost: 0, outdoor: isToastOrCam && dev.io === "O",
      sub,
    });
  });

  // Everything else: aggregated counts only (no individual location names available).
  Object.entries(counts).forEach(([kind, qty]) => {
    const map = SURVEY_KIND_MAP[kind];
    const svc = svcFor(map.service);
    svc.items.push({ id: newItemId(), name: dn(map.name), qty, price: px(map.name, map.price), cost: 0 });
  });

  // Whenever Toast is part of this import, guarantee ISP / Pronto-Meraki / Network Switch
  // are present, ahead of whatever was actually placed — skipping any the survey already covers.
  if (byService.toast) {
    byService.toast.items = [...toastBaselineItems(book, seenKinds), ...byService.toast.items];
  }

  return Object.values(byService);
}

// ---- Totals ----------------------------------------------------------------
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const lineTotal = (it) => (+it.qty || 0) * (+it.price || 0);
// An item's full total includes its sub-items (a camera block = camera + drop + labor).
export const itemTotal = (it) => lineTotal(it) + (it.sub || []).reduce((s, x) => s + lineTotal(x), 0);
export const svcSubtotal = (svc) => (svc.items || []).reduce((s, it) => s + itemTotal(it), 0);
export function optionTotals(opt, taxRate = 0, discount = { type: "flat", value: 0 }, depositPct = 50, pcpCredit = 0) {
  const sub = (opt.services || []).reduce((s, svc) => s + svcSubtotal(svc), 0);
  const disc = discount?.type === "pct" ? sub * (+discount.value || 0) / 100 : (+discount?.value || 0);
  const credit = Math.max(0, +pcpCredit || 0);
  // Discount and PCP credit both reduce the taxable base (tax is charged on the net).
  const taxable = Math.max(0, sub - disc - credit);
  const tax = taxable * (+taxRate || 0) / 100;
  const grand = taxable + tax;
  return { sub: r2(sub), discount: r2(disc), pcpCredit: r2(credit), tax: r2(tax), grand: r2(grand), deposit: r2(grand * (+depositPct || 0) / 100) };
}
const itemCost = (it) => (+it.qty || 0) * (+it.cost || 0) + (it.sub || []).reduce((s, x) => s + (+x.qty || 0) * (+x.cost || 0), 0);
export const optionCost = (opt) =>
  r2((opt.services || []).reduce((s, svc) => s + (svc.items || []).reduce((a, it) => a + itemCost(it), 0), 0));

// ---- Tech work-order totals (parallel to the customer totals, but on techPrice) ----
// The technician's work order values every line at its `techPrice` (what the tech is paid
// for that line) instead of the customer `price`. Admin sets these at the install stage.
const techLine = (it) => (+it.qty || 0) * (+it.techPrice || 0);
export const techItemTotal = (it) => techLine(it) + (it.sub || []).reduce((s, x) => s + techLine(x), 0);
export const techSvcSubtotal = (svc) => (svc.items || []).reduce((s, it) => s + techItemTotal(it), 0);
export const techOptionTotal = (opt) => r2((opt.services || []).reduce((s, svc) => s + techSvcSubtotal(svc), 0));

// ---- Sanitize (server-side choke point — cost/margin never leave for non-staff) ----
const COST_ROLES = new Set(["admin", "manager"]);
const CUSTOMER_VISIBLE_STATUS = new Set(["sent", "changes_requested", "accepted", "declined"]);

// Technician work order: an internal labor/equipment doc. Every line is re-valued at its
// `techPrice` (defaults to 0 until admin fills it in); the customer `price`, internal `cost`,
// tax, and any customer discount are stripped entirely — a tech never sees what the customer pays.
function techWorkOrder(payload) {
  const toTech = ({ price, cost, techPrice, sub, ...it }) => ({
    ...it,
    techPrice: +techPrice || 0,
    ...(sub ? { sub: sub.map(({ price: p, cost: c, techPrice: tp, ...x }) => ({ ...x, techPrice: +tp || 0 })) } : {}),
  });
  return {
    options: (payload.options || []).map((o) => ({
      ...o,
      services: (o.services || []).map((s) => ({ ...s, items: (s.items || []).map(toTech) })),
    })),
    discount: { type: "flat", value: 0 },
  };
}

export function sanitizeProposal(row, role) {
  if (!row) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  let customerFlags = {};
  try { customerFlags = row.customer_flags ? JSON.parse(row.customer_flags) : {}; } catch { customerFlags = {}; }
  const base = {
    id: row.id, version: row.version, status: row.status,
    tax_rate: row.tax_rate, deposit_pct: row.deposit_pct,
    selected_option: row.selected_option, selected_at: row.selected_at,
    sent_at: row.sent_at, sent_by_name: row.sent_by_name, created_by_name: row.created_by_name,
    change_note: row.change_note, updated_at: row.updated_at, customerFlags,
    signed_name: row.signed_name, signed_at: row.signed_at, signature_data: row.signature_data,
    tech_signed_name: row.tech_signed_name, tech_signed_at: row.tech_signed_at,
    accepted_options: (() => { try { return JSON.parse(row.accepted_options || "[]"); } catch { return []; } })(),
    declined_options: (() => { try { return JSON.parse(row.declined_options || "{}"); } catch { return {}; } })(),
    declined_reason: row.declined_reason,
  };
  if (COST_ROLES.has(role)) return { ...base, payload };
  // Technician: the work order builds out as soon as the office SENDS the proposal to the customer
  // — the tech can see the full proposed scope and accept it, without waiting on the customer. Once
  // the customer accepts an option, the WO narrows to just the accepted option(s). Drafts (never
  // sent) stay hidden. Tech prices only; customer price/cost are never included.
  if (role === "tech") {
    const isSent = !!row.sent_at || (row.status && row.status !== "draft");
    if (!isSent) return { status: "draft", version: row.version };
    let accepted = [];
    try { accepted = JSON.parse(row.accepted_options || "[]"); } catch { accepted = []; }
    const wo = techWorkOrder(payload);
    const opts = wo.options || [];
    // Before acceptance nothing is selected yet → show the whole scope; after, filter to accepted.
    const options = accepted.length ? opts.filter((o) => accepted.includes(o.id)) : opts;
    return {
      id: row.id, version: row.version, status: row.status,
      selected_option: row.selected_option, accepted_options: accepted,
      sent_at: row.sent_at, updated_at: row.updated_at,
      tech_signed_name: row.tech_signed_name, tech_signed_at: row.tech_signed_at, tech_signature_data: row.tech_signature_data,
      workOrder: true, payload: { ...wo, options },
    };
  }
  const stripItem = ({ cost, ...it }) => (it.sub ? { ...it, sub: it.sub.map(({ cost: c, ...x }) => x) } : it);
  const stripCost = (p) => ({
    ...p,
    options: (p.options || []).map((o) => ({
      ...o,
      services: (o.services || []).map((s) => ({
        ...s,
        items: (s.items || []).map(stripItem),
      })),
    })),
  });
  if (role === "sales") return { ...base, payload: stripCost(payload) };
  // customer / everyone else: drafts are invisible beyond their existence
  if (!CUSTOMER_VISIBLE_STATUS.has(row.status)) return { status: "draft", version: row.version };
  return { ...base, payload: stripCost(payload) };
}

// ---- Validation (system boundary for writes) --------------------------------
export function validatePayload(payload) {
  if (!payload || !Array.isArray(payload.options)) return "Malformed proposal.";
  if (payload.options.length < 1 || payload.options.length > 3) return "Proposals need 1–3 options.";
  const seen = new Set();
  for (const o of payload.options) {
    if (!OPTION_LETTERS.includes(o.id) || seen.has(o.id)) return "Bad option id.";
    seen.add(o.id);
    if (String(o.name || "").length > 60) return "Option name too long.";
    for (const s of o.services || []) {
      if (String(s.label || "").length > 80) return "Service label too long.";
      for (const it of s.items || []) {
        const rows = [it, ...(it.sub || [])];
        if ((it.sub || []).length > 20) return "Too many sub-items.";
        for (const x of rows) {
          if (String(x.name || "").length > 120) return "Item name too long.";
          if (!(+x.qty >= 0 && +x.qty <= 9999)) return "Bad quantity.";
          if (!(+x.price >= 0 && +x.price <= 1000000)) return "Bad price.";
          if (x.cost != null && !(+x.cost >= 0 && +x.cost <= 1000000)) return "Bad cost.";
          if (x.techPrice != null && !(+x.techPrice >= 0 && +x.techPrice <= 1000000)) return "Bad tech price.";
        }
      }
    }
  }
  const d = payload.discount;
  if (d && !(["flat", "pct"].includes(d.type) && +d.value >= 0)) return "Bad discount.";
  if (payload.pcp_credit != null && !(+payload.pcp_credit >= 0 && +payload.pcp_credit <= 1000000)) return "Bad PCP credit.";
  return null;
}
