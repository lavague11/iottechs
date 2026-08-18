// ADT project catalog — the equipment a customer can request. Each item carries an ADT "point"
// value (ADT's equipment-allowance model) AND a retail `price` shown on the intake. Prices are
// pulled from the ADT Tool commission catalog where the item matches; a few (marked ~) are best-fit
// estimates — verify: 2GIG GC2 panel, Eero mesh, Nest Hub Max, Emergency Pendant, Google fee, LTE radio.
// The intake totals both points and price; the internal margin/credit math lives in the Quote stage.
export const ADT_GROUPS = [
  {
    key: "panels",
    label: "Panels & Connectivity",
    items: [
      { id: "panel5",     name: "5in Control Panel",                              points: 5,   price: 450 },
      { id: "panel7",     name: "7in Control Panel",                              points: 7,   price: 550 },
      { id: "touch7",     name: "Secondary Touchscreen — Command 7in",            points: 4,   price: 349 },
      { id: "touchpad",   name: "ADT Command — Wireless Touchpad (WLTP100)",      points: 2.5, price: 249 },
      { id: "lte",        name: "LTE Cell Radio — Verizon",                       points: 0,   price: 0 },
      { id: "eero",       name: "ADT Control — Eero 6+ Dual-Band Wi-Fi Mesh",     points: 0,   price: 199 },
      { id: "gc2",        name: "2GIG Control Panel GC2",                         points: 0,   price: 240 },
      { id: "translator", name: "Wireless Translator",                           points: 2.5, price: 99 },
    ],
  },
  {
    key: "sensors",
    label: "Intrusion Sensors",
    items: [
      { id: "contact", name: "Door / Window Contact",              points: 1, price: 159 },
      { id: "motion",  name: "ADT Command — Wireless Motion Detector", points: 2, price: 299 },
      { id: "glass",   name: "Glass Break Detector",               points: 2, price: 299 },
      { id: "shock",   name: "Shock Sensor",                       points: 2, price: 199 },
    ],
  },
  {
    key: "safety",
    label: "Life Safety",
    items: [
      { id: "smoke", name: "Smoke Detector", points: 2, price: 299 },
    ],
  },
  {
    key: "video",
    label: "Cameras & Video",
    items: [
      { id: "doorbell",  name: "Google Doorbell Camera",             points: 6, price: 349 },
      { id: "camIn",     name: "ADT Google — Nest Indoor Camera",    points: 6, price: 299 },
      { id: "camOut",    name: "ADT Google — Nest Outdoor Camera (Wired)", points: 6, price: 399 },
      { id: "hubMax",    name: "ADT Google — Nest Hub Max Display",  points: 6, price: 299, scope: "residential" },
    ],
  },
  {
    key: "automation",
    label: "Smart Home & Automation",
    scope: "residential",   // home automation — hidden for commercial accounts
    items: [
      { id: "lock",    name: "Smart Door Lock",                    points: 5, price: 349 },
      { id: "thermo",  name: "Nest Thermostat",                    points: 5, price: 349 },
      { id: "garage",  name: "Garage Door Controller",             points: 5, price: 349 },
      { id: "lamp",    name: "ADT Control — Versa Lamp Module (Z-Wave)", points: 2, price: 129 },
      { id: "googleFee", name: "Google Integration Fee",           points: 0, price: 0 },
    ],
  },
  {
    key: "access",
    label: "Access & Panic",
    items: [
      { id: "keyfob",  name: "Keyfob",            points: 1, price: 159 },
      { id: "pendant", name: "Emergency Pendant", points: 1, price: 159 },
    ],
  },
  {
    key: "misc",
    label: "Misc",
    items: [
      { id: "yardSign", name: "ADT Yard Sign", points: 0, price: 0 },
    ],
  },
  {
    key: "existing",
    label: "Existing Equipment (takeover — 0 pts)",
    items: [
      { id: "exAuto",    name: "Existing Automation",           points: 0, price: 0 },
      { id: "exContact", name: "Existing Door / Window Contact", points: 0, price: 0 },
      { id: "exGlass",   name: "Existing Glassbreak Detector",  points: 0, price: 0 },
      { id: "exMotion",  name: "Existing Motion",               points: 0, price: 0 },
    ],
  },
];

// Flat id → item lookup (name + points), for totalling and rendering a saved selection.
export const ADT_ITEMS = Object.fromEntries(
  ADT_GROUPS.flatMap((g) => g.items.map((it) => [it.id, { ...it, group: g.key }]))
);

// Best-selling add-ons (from the ADT tool) — surfaced as one-tap quick-add chips on the intake so a
// rep can build the lineup fast. Ordered by how often they're sold; ids not valid for the chosen
// property type are filtered out at render.
export const ADT_BEST_SELLERS = ["doorbell", "camOut", "camIn", "lock", "contact", "smoke", "thermo"];

// Equipment groups tailored to the property type. Items/groups carry an optional `scope`
// ("residential" | "commercial"); anything without one shows for both. Commercial accounts drop the
// home-automation gear (smart lock, thermostat, garage, lamp modules, hub display); residential keeps
// the full list. Empty groups are removed. Defaults to residential.
export function adtGroupsFor(propertyType) {
  const t = propertyType === "commercial" ? "commercial" : "residential";
  const ok = (s) => !s || s === "both" || s === t;
  return ADT_GROUPS
    .filter((g) => ok(g.scope))
    .map((g) => ({ ...g, items: g.items.filter((it) => ok(it.scope)) }))
    .filter((g) => g.items.length);
}

// selection = { [itemId]: qty }. Returns total points + total price (retail) + the picked lines.
export function adtSummary(selection = {}) {
  const lines = [];
  let points = 0, price = 0;
  for (const [id, qty] of Object.entries(selection)) {
    const n = Math.max(0, Math.floor(+qty || 0));
    if (!n) continue;
    const it = ADT_ITEMS[id];
    if (!it) continue;
    const linePts = it.points * n;
    const linePrice = (it.price || 0) * n;
    points += linePts;
    price += linePrice;
    lines.push({ id, name: it.name, qty: n, points: it.points, price: it.price || 0, linePoints: Math.round(linePts * 10) / 10, linePrice });
  }
  return { points: Math.round(points * 10) / 10, price, count: lines.reduce((s, l) => s + l.qty, 0), lines };
}

// ADT catalog id → ADT Tool (calculator) item NAME, so an application's equipment can seed the Quote
// tool. Names must match the calculator's CATS exactly. Items with no calculator equivalent are omitted
// (LTE radio is folded into the panel; yard sign / google fee / takeover items carry no retail line).
export const ADT_TO_CALC = {
  panel5: "5in Screen", panel7: "7in Screen", touch7: "Touchscreen", touchpad: "Wireless Keypad",
  eero: "Wi-Fi Extender", gc2: "Hybrid Panel", translator: "Wireless Converter",
  contact: "Door Sensor", motion: "Motion", glass: "Glassbreak", shock: "Shock Sensor",
  smoke: "Smoke", doorbell: "Nest Doorbell", camIn: "Nest Indoor Cam", camOut: "Nest Outdoor Cam",
  hubMax: "Nest Hub", lock: "Door Lock", thermo: "Nest Thermostat", garage: "Garage Opener",
  lamp: "Lamp Module", keyfob: "Key Fob",
};
// Turn an application's equipment { itemId: qty } into { calcItemName: qty } for the Quote tool.
export function adtQuoteSeed(equipment = {}) {
  const seed = {};
  for (const [id, qty] of Object.entries(equipment)) {
    const n = Math.max(0, Math.floor(+qty || 0));
    const name = ADT_TO_CALC[id];
    if (n && name) seed[name] = (seed[name] || 0) + n;
  }
  return seed;
}

// Credit/approval status → label + color. One source of truth for the badge everywhere it shows.
export const ADT_STATUS_META = {
  submitted:  { label: "Submitted", color: "#5b6470" },
  in_review:  { label: "In review", color: "#b87300" },
  needs_docs: { label: "Needs docs", color: "#e67e22" },
  approved:   { label: "Approved",  color: "#1c8a45" },
  declined:   { label: "Declined",  color: "#c0392b" },
  installed:  { label: "Installed", color: "#2f7d5a" },
};
export const adtStatusMeta = (s) => ADT_STATUS_META[s] || ADT_STATUS_META.submitted;

// Reduce a full ADT Tool deal (deal_json) to the ONLY fields safe to send a customer's browser.
// The raw deal holds cost, fees, commission split, and rate multiples — none of that leaves the
// server. The customer gets: their equipment quantities, monthly rate, package, activation, the
// rep's applied credit, any promo, and retail-price overrides (retail only, never cost).
export function custDealFromDeal(deal) {
  if (!deal || typeof deal !== "object") return null;
  const retails = {};
  if (deal.prices && typeof deal.prices === "object") {
    for (const [i, v] of Object.entries(deal.prices)) {
      // stored as [labor, cost, retail]; keep retail only
      const p = Array.isArray(v) ? v[2] : null;
      if (p != null) retails[i] = p;
    }
  }
  return {
    cust:   deal.cust || "",
    mmr:    deal.mmr,
    pkg:    deal.pkg,
    nest:   deal.nest,
    fAct:   deal.fAct,
    promo:  deal.promo || "",
    exAll:  !!deal.exAll,
    qtys:   deal.qtys && typeof deal.qtys === "object" ? deal.qtys : {},
    given:  deal.cGiven,          // the rep's negotiated credit → customer's real due-at-install
    retails,
  };
}
