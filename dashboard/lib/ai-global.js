// Global command center — the app-wide navigation map. PURE + zero-token: a phrase → an app route the
// staff shell can push to. The global bar (app/components/global-command-bar.jsx) resolves app routes here
// first, then falls back to the shared command interpreter (router + Haiku) for opening a project by name
// or an in-project section. It NEVER edits data — edits happen in a project's own builder; a global edit
// phrasing is answered with "open the project first".
const norm = (s) => String(s || "").toLowerCase().trim();

// Ordered: the most specific phrasings first. Each entry is tested against the whole command text.
export const APP_ROUTES = [
  { re: /\b(action\s*center|operations|ops\b)/, href: "/operations", label: "Action Center" },
  { re: /\b(outstanding|unpaid|overdue)\b.*\b(invoice|invoices|bill|bills|balance)|receivables?\b/, href: "/receivables", label: "Receivables" },
  { re: /\b(service\s*calls?)\b/, href: "/service-calls", label: "Service Calls" },
  { re: /\b(site\s*surveys?)\b/, href: "/support/surveys", label: "Site Surveys" },
  { re: /\b(all\s*projects|projects?)\b/, href: "/projects", label: "Projects" },
  { re: /\b(ticket|tickets|work\s*queue)\b/, href: "/tickets", label: "Tickets" },
  { re: /\b(sales|pipeline|leads?)\b/, href: "/sales", label: "Sales" },
  { re: /\b(customers?|clients?|crm)\b/, href: "/customers", label: "Customers" },
  { re: /\b(inventory|stock|parts)\b/, href: "/inventory", label: "Inventory" },
  { re: /\b(expenses?)\b/, href: "/expenses", label: "Expenses" },
  { re: /\b(pcp\b|pcp\s*ledger)/, href: "/pcp", label: "PCP Ledger" },
  { re: /\b(finance|finances|financials?|revenue|money)\b/, href: "/finances", label: "Finances" },
  { re: /\b(technicians?|crew|\btechs?\b)\b/, href: "/tech", label: "Technicians" },
  { re: /\b(monitoring|\badt\b)\b/, href: "/adt-applications", label: "Monitoring" },
  { re: /\b(hiring|recruit(ing|ment)?|applicants?|candidates?)\b/, href: "/hiring", label: "Hiring" },
  { re: /\b(users?|staff|team\s*members?)\b/, href: "/users", label: "Users" },
  { re: /\b(activity|audit\s*log|event\s*log)\b/, href: "/activity", label: "Activity" },
  { re: /\b(id\s*scan(ner)?|scan\s+an?\s+(id|licen[sc]e|driver))\b/, href: "/id-scan", label: "ID Scanner" },
  { re: /\b(dev\s*roadmap|roadmap|\bdev\b)\b/, href: "/dev", label: "Dev Roadmap" },
  { re: /\b(bugs?|bug\s*reports?)\b/, href: "/bugs", label: "Bugs" },
  { re: /\b(dashboard|home)\b/, href: "/dashboard", label: "Dashboard" },
];

export function resolveAppRoute(text) {
  const t = norm(text);
  if (!t) return null;
  for (const r of APP_ROUTES) if (r.re.test(t)) return { href: r.href, label: r.label };
  return null;
}

// Does this read like a navigation / "take me somewhere" request (vs. a create/edit command)?
export function looksLikeNav(text) {
  const t = norm(text);
  return /^(open|go to|take me to|show( me)?|pull up|jump to|navigate to|bring up|where('?s| is| are)|find|see)\b/.test(t) || /\b(screen|page|section|tab|list)\b/.test(t);
}

// Does this read like a proposal EDIT (rename/price/description/discount/add an item)? The global bar never
// edits, but when a project is open it can send the user to that project's proposal where the edit bar lives.
export function looksLikeEdit(text) {
  const t = norm(text);
  return /\b(rename|relabel|rewrite|describe|description|discount|price|cheaper|add (a |an |\d)|remove|delete|change|edit|move)\b/.test(t)
    && /\b(camera|cameras|item|items|line|product|proposal|price|discount|description|section|nvr|dvr|speaker|sensor)\b/.test(t);
}
