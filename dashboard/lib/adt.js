// ADT project catalog — the equipment a customer can request, each carrying an ADT "point" value
// (ADT's equipment-allowance model). The intake form (Apply step of the ADT portal) totals points
// as the customer picks quantities. Points are the only value shown to the customer; pricing/plan
// allowances can be layered on later. Grouped for a clean picker. Source: owner-provided list.
export const ADT_GROUPS = [
  {
    key: "panels",
    label: "Panels & Connectivity",
    items: [
      { id: "panel5",     name: "5in Control Panel",                              points: 0 },
      { id: "panel7",     name: "7in Control Panel",                              points: 0 },
      { id: "touch7",     name: "Secondary Touchscreen — Command 7in",            points: 4 },
      { id: "touchpad",   name: "ADT Command — Wireless Touchpad (WLTP100)",      points: 2.5 },
      { id: "lte",        name: "LTE Cell Radio — Verizon",                       points: 0 },
      { id: "eero",       name: "ADT Control — Eero 6+ Dual-Band Wi-Fi Mesh",     points: 0 },
      { id: "gc2",        name: "2GIG Control Panel GC2",                         points: 0 },
      { id: "translator", name: "Wireless Translator",                           points: 2.5 },
    ],
  },
  {
    key: "sensors",
    label: "Intrusion Sensors",
    items: [
      { id: "contact", name: "Door / Window Contact",              points: 1 },
      { id: "motion",  name: "ADT Command — Wireless Motion Detector", points: 2 },
      { id: "glass",   name: "Glass Break Detector",               points: 2 },
      { id: "shock",   name: "Shock Sensor",                       points: 2 },
    ],
  },
  {
    key: "safety",
    label: "Life Safety",
    items: [
      { id: "smoke", name: "Smoke Detector", points: 2 },
    ],
  },
  {
    key: "video",
    label: "Cameras & Video",
    items: [
      { id: "doorbell",  name: "Google Doorbell Camera",             points: 6 },
      { id: "camIn",     name: "ADT Google — Nest Indoor Camera",    points: 6 },
      { id: "camOut",    name: "ADT Google — Nest Outdoor Camera (Wired)", points: 6 },
      { id: "hubMax",    name: "ADT Google — Nest Hub Max Display",  points: 6, scope: "residential" },
    ],
  },
  {
    key: "automation",
    label: "Smart Home & Automation",
    scope: "residential",   // home automation — hidden for commercial accounts
    items: [
      { id: "lock",    name: "Smart Door Lock",                    points: 5 },
      { id: "thermo",  name: "Nest Thermostat",                    points: 5 },
      { id: "garage",  name: "Garage Door Controller",             points: 5 },
      { id: "lamp",    name: "ADT Control — Versa Lamp Module (Z-Wave)", points: 2 },
      { id: "googleFee", name: "Google Integration Fee",           points: 0 },
    ],
  },
  {
    key: "access",
    label: "Access & Panic",
    items: [
      { id: "keyfob",  name: "Keyfob",            points: 1 },
      { id: "pendant", name: "Emergency Pendant", points: 1 },
    ],
  },
  {
    key: "misc",
    label: "Misc",
    items: [
      { id: "yardSign", name: "ADT Yard Sign", points: 0 },
    ],
  },
  {
    key: "existing",
    label: "Existing Equipment (takeover — 0 pts)",
    items: [
      { id: "exAuto",    name: "Existing Automation",           points: 0 },
      { id: "exContact", name: "Existing Door / Window Contact", points: 0 },
      { id: "exGlass",   name: "Existing Glassbreak Detector",  points: 0 },
      { id: "exMotion",  name: "Existing Motion",               points: 0 },
    ],
  },
];

// Flat id → item lookup (name + points), for totalling and rendering a saved selection.
export const ADT_ITEMS = Object.fromEntries(
  ADT_GROUPS.flatMap((g) => g.items.map((it) => [it.id, { ...it, group: g.key }]))
);

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

// selection = { [itemId]: qty }. Returns total points (rounded to 1 decimal) + the picked lines.
export function adtSummary(selection = {}) {
  const lines = [];
  let points = 0;
  for (const [id, qty] of Object.entries(selection)) {
    const n = Math.max(0, Math.floor(+qty || 0));
    if (!n) continue;
    const it = ADT_ITEMS[id];
    if (!it) continue;
    const linePts = it.points * n;
    points += linePts;
    lines.push({ id, name: it.name, qty: n, points: it.points, linePoints: Math.round(linePts * 10) / 10 });
  }
  return { points: Math.round(points * 10) / 10, count: lines.reduce((s, l) => s + l.qty, 0), lines };
}
