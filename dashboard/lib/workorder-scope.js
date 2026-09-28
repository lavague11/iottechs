// Work order scope (pure): the tech reads one proposal option in three passes — where everything goes
// (each placed block = one location), what to load on the truck (equipment, aggregated), and the work
// itself with payout rates (labor). Reads techPrice only — never retail. Shared by the work order view
// and the Work Order PDF so the sheet and the file can't disagree.
import { titleCase, serviceColor } from "./proposal.js";

export const LABOR_RX = /(cat6 drop|termination|mounting|programming|waterproof|cabling|tuning|wire run|setup|\blabor\b)/i;

export function workOrderScope(opt) {
  const locations = [];
  const equipMap = new Map(), laborMap = new Map();
  const bump = (map, name, qty, techPrice) => {
    const key = titleCase(String(name || "").replace(/\s*·\s*Slot \d+$/, ""));
    const cur = map.get(key) || { name: key, qty: 0, sum: 0, rate: +techPrice || 0 };
    cur.qty += qty;
    cur.sum += qty * (+techPrice || 0);
    if (+techPrice) cur.rate = +techPrice;
    map.set(key, cur);
  };
  (opt?.services || []).forEach((s) => {
    (s.items || []).forEach((it) => {
      const subs = it.sub || [];
      if (subs.length) {
        locations.push({ id: it.id, name: it.name, outdoor: !!it.outdoor, svc: s.label, color: serviceColor(s.key),
          gear: subs.filter((x) => !LABOR_RX.test(x.name)).map((x) => titleCase(x.name)).join(", ") });
        subs.forEach((x) => bump(LABOR_RX.test(x.name) ? laborMap : equipMap, x.name, +x.qty || 0, x.techPrice));
      } else {
        bump(LABOR_RX.test(it.name) ? laborMap : equipMap, it.name, +(it.qty ?? 1) || 0, it.techPrice);
      }
    });
  });
  const equipment = [...equipMap.values()], labor = [...laborMap.values()];
  const laborSum = labor.reduce((a, l) => a + l.sum, 0);
  const equipSum = equipment.reduce((a, e) => a + e.sum, 0);
  const notes = (opt?.services || []).map((s) => s.note).filter(Boolean);
  return { locations, equipment, labor, laborSum, equipSum, total: laborSum + equipSum, equipHasPay: equipSum > 0, ratesPending: laborSum + equipSum === 0, notes };
}
