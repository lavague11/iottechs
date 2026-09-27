// Customer identity helpers — pure, no DB. The canonical customer is a `users` row (role "customer");
// a project points at it through projects.customer_id. These helpers decide when two contact records
// are the SAME person: a strong identifier (normalized phone or email) matches. A name alone never does.

// Digits only; a leading US country code is dropped so "+1 646 396 0775" and "(646) 396-0775" agree.
export function normalizePhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}
// Trimmed, lower-cased; "" when blank.
export function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}
// A usable phone key (7+ digits) or "".
export function phoneKey(v) {
  const d = normalizePhone(v);
  return d.length >= 7 ? d : "";
}
// (646) 396-0775 for 10 digits; otherwise what was stored.
export function formatPhone(v) {
  const d = normalizePhone(v);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(v || "");
}

// Strong-identifier match between a typed contact and a candidate customer row.
// Returns "email" | "phone" | null. Names are deliberately ignored (two John Smiths are two people).
export function strongMatch(input, row) {
  const e = normalizeEmail(input?.email), re = normalizeEmail(row?.email);
  if (e && re && e === re) return "email";
  const p = phoneKey(input?.phone), rp = phoneKey(row?.phone);
  if (p && rp && p === rp) return "phone";
  return null;
}

// Rank customer rows for a search box. Exact phone/email → prefix on name/company → substring, with
// recency as the tie-break. Rows carry { name, email, phone, company, last_project_at }.
export function rankCustomers(q, rows) {
  const term = String(q || "").trim().toLowerCase();
  const termDigits = normalizePhone(term);
  const score = (r) => {
    const name = String(r.name || "").toLowerCase();
    const company = String(r.company || "").toLowerCase();
    const email = normalizeEmail(r.email);
    const phone = normalizePhone(r.phone);
    if (!term) return 1;
    if (email && email === term) return 100;
    if (termDigits.length >= 7 && phone && phone === termDigits) return 100;
    if (name.startsWith(term) || company.startsWith(term)) return 80;
    if (name.split(/\s+/).some((w) => w.startsWith(term)) || company.split(/\s+/).some((w) => w.startsWith(term))) return 70;
    if (termDigits.length >= 3 && phone.includes(termDigits)) return 60;
    if (email.startsWith(term)) return 55;
    if (name.includes(term) || company.includes(term) || email.includes(term)) return 40;
    return 0;
  };
  return rows
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(b.r.last_project_at || "").localeCompare(String(a.r.last_project_at || "")))
    .map((x) => x.r);
}

// One-line summary under a search result / selected client: "3 projects · Last Security Cameras · Sep 2026".
export function customerMeta(row, serviceLabel = (c) => c) {
  const n = Number(row?.projects || 0);
  const parts = [];
  if (n) parts.push(`${n} project${n === 1 ? "" : "s"}`);
  if (row?.last_service) {
    const when = row.last_project_at ? new Date(row.last_project_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
    parts.push(`Last ${serviceLabel(row.last_service)}${when ? ` · ${when}` : ""}`);
  }
  return parts.join(" · ");
}
