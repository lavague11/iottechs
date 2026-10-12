// Canonical global-search matcher — ONE place that ranks records for the header command search.
// Pure: the caller (app/api/search) gathers ROLE-SCOPED data and passes it in, so authorization is
// decided server-side before anything reaches here. This module only scores + groups.
//
// Normalized result: { type, id, title, subtitle, href, score, meta? }. Groups come back in a fixed
// order (projects first) with a per-group cap. Ranking favors direct entity hits (exact id/name,
// phone/email) over weak address/partial matches, so "0050" lands on ASC0050 and "nobo" on Nobo.

const digits = (s) => String(s || "").replace(/\D/g, "");
const lc = (s) => String(s || "").trim().toLowerCase();

// Best match score for a query against a record's fields (0 = no match). Higher = stronger.
function scoreFields(ql, qd, { id, name, phone, email, address, text }) {
  let best = 0;
  const bump = (n) => { if (n > best) best = n; };
  const idl = lc(id);
  if (idl) {
    if (idl === ql) bump(100);
    else if (ql.length >= 2 && idl.includes(ql)) bump(86);       // "0050" ∈ "asc0050"
  }
  const nm = lc(name);
  if (nm) {
    if (nm === ql) bump(92);
    else if (nm.startsWith(ql)) bump(80);
    else if (ql.length >= 2 && nm.includes(ql)) bump(62);
    // token starts-with ("farooq" → "Zain Farooq")
    else if (nm.split(/\s+/).some((t) => t.startsWith(ql))) bump(70);
  }
  if (qd.length >= 4 && digits(phone).includes(qd)) bump(76);
  const em = lc(email);
  if (em && ql.includes("@") ? em.includes(ql) : (ql.length >= 3 && em.includes(ql))) bump(74);
  if (ql.length >= 3 && lc(address).includes(ql)) bump(48);
  if (ql.length >= 3 && lc(text).includes(ql)) bump(40);         // weakest: body/subject text
  return best;
}

const TYPE_ORDER = ["project", "customer", "ticket", "service", "technician"];
const TYPE_LABEL = { project: "Projects", customer: "Customers", ticket: "Tickets", service: "Service Calls", technician: "Technicians" };

// input: { q, projects?, tickets?, serviceCalls?, technicians?, perGroup? }
export function searchEntities({ q, projects = [], tickets = [], serviceCalls = [], technicians = [], perGroup = 5 } = {}) {
  const ql = lc(q), qd = digits(q);
  if (!ql) return { groups: [], total: 0 };
  const out = [];

  for (const p of projects) {
    const s = scoreFields(ql, qd, { id: p.access_id, name: p.customer, phone: p.contact_phone, email: p.contact_email, address: p.address });
    if (s > 0) out.push({ type: "project", score: s, id: p.access_id, title: p.customer || p.access_id,
      subtitle: [p.access_id, p.service || p.service_code, p.stageLabel].filter(Boolean).join(" · "),
      href: `/project/${p.access_id}` });
  }

  // Customers derived from the (already role-scoped) projects — one per customer, richest contact kept.
  const custMap = new Map();
  for (const p of projects) {
    const key = lc(p.customer); if (!key) continue;
    const prev = custMap.get(key);
    if (!prev) custMap.set(key, { name: p.customer, phone: p.contact_phone || "", email: p.contact_email || "", address: p.address || "", count: 1 });
    else { prev.count++; prev.phone = prev.phone || p.contact_phone || ""; prev.email = prev.email || p.contact_email || ""; }
  }
  for (const c of custMap.values()) {
    const s = scoreFields(ql, qd, { name: c.name, phone: c.phone, email: c.email, address: c.address });
    if (s > 0) out.push({ type: "customer", score: s - 1, id: c.name, title: c.name,
      subtitle: [c.phone, c.email].filter(Boolean).join(" · ") || `${c.count} project${c.count === 1 ? "" : "s"}`,
      href: `/customers/${encodeURIComponent(c.name)}` });
  }

  for (const t of tickets) {
    const s = scoreFields(ql, qd, { name: t.subject, text: `${t.subject || ""} ${t.project_customer || ""}` });
    const s2 = scoreFields(ql, qd, { name: t.project_customer });
    const sc = Math.max(s, s2 - 4);
    if (sc > 0) out.push({ type: "ticket", score: sc, id: t.id, title: t.subject || "Ticket",
      subtitle: [t.project_customer, t.status, t.priority].filter(Boolean).join(" · "),
      href: `/tickets/${t.id}` });
  }

  for (const c of serviceCalls) {
    const name = c.customer || c.business_name || "Service call";
    const s = scoreFields(ql, qd, { id: c.id, name, phone: c.phone || c.contact_phone, address: c.address });
    if (s > 0) out.push({ type: "service", score: s, id: c.id, title: name,
      subtitle: [c.address, c.stage].filter(Boolean).join(" · ") || "Service call",
      href: `/service-calls/${c.id}` });
  }

  for (const u of technicians) {
    const s = scoreFields(ql, qd, { name: u.name, phone: u.phone, email: u.email });
    if (s > 0) out.push({ type: "technician", score: s, id: u.id, title: u.name,
      subtitle: ["Technician", u.phone].filter(Boolean).join(" · "),
      href: `/users/${u.id}` });
  }

  const groups = [];
  let total = 0;
  for (const type of TYPE_ORDER) {
    const items = out.filter((r) => r.type === type).sort((a, b) => b.score - a.score);
    total += items.length;
    if (items.length) groups.push({ type, label: TYPE_LABEL[type], items: items.slice(0, perGroup), more: items.length - Math.min(items.length, perGroup) });
  }
  return { groups, total };
}
