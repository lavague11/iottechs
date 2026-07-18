"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutAction } from "../login/actions";
import AddressAutocomplete from "./address-autocomplete";
import { TaglinePill, Wordmark } from "./brand";

const TABS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "tickets",   label: "Tickets",   href: "/tickets" },
  { key: "sales",     label: "Sales",     href: "/sales" },
  { key: "tech",      label: "Tech",      href: "/tech" },
  { key: "customers", label: "Customers", href: "/customers" },
  { key: "inventory", label: "Inventory", href: "/inventory" },
  { key: "finances",  label: "Finances",  href: "/finances" },
  { key: "expenses",  label: "Expenses",  href: "/expenses" },
  { key: "users",     label: "Users",     href: "/users" },
  { key: "activity",  label: "Activity",  href: "/activity" },
  { key: "support",   label: "Support",   href: "/support" },
  { key: "dev",       label: "Dev",       href: "/dev" },
];

// Grouped nav for admin/manager — collapses the long flat bar into dropdowns,
// ordered by chain of command: Management → Customers → Technicians → Sales.
// (Tech & Sales roles keep their short flat navs — no dropdowns for 3 links.)
const NAV_GROUPS = [
  { key: "dash-grp", label: "Dashboard", items: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  ]},
  { key: "admin-grp", label: "Admin", items: [
    { key: "users",    label: "Users",        href: "/users" },
    { key: "activity", label: "Activity Log", href: "/activity" },
    { key: "dev",      label: "Dev Roadmap",  href: "/dev" },
    { key: "archives", label: "Archives",     href: "/archives" },
  ]},
  { key: "mgmt-grp", label: "Management", items: [
    { key: "finances",  label: "Finances",  href: "/finances" },
    { key: "expenses",  label: "Expenses",  href: "/expenses" },
    { key: "pcp",       label: "PCP Ledger", href: "/pcp" },
  ]},
  { key: "cust-grp", label: "Customers", items: [
    { key: "customers", label: "Customers", href: "/customers" },
    { key: "tickets",   label: "Tickets",   href: "/tickets" },
  ]},
  { key: "tech-grp", label: "Technicians", items: [
    { key: "tech",      label: "Tech Dashboard", href: "/tech" },
    { key: "inventory", label: "Inventory",      href: "/inventory" },
  ]},
  { key: "sales-grp", label: "Sales", items: [
    { key: "sales",     label: "Sales Pipeline", href: "/sales" },
  ]},
  { key: "ops-grp", label: "Operations", items: [
    { key: "operations", label: "Action Center", href: "/operations" },
  ]},
  { key: "support-grp", label: "Support", items: [
    { key: "support", label: "Support Library", href: "/support" },
  ]},
];

// Filter the grouped nav per role (manager: no Dashboard / Dev / Archives — admin-only).
function groupedNavFor(role) {
  let groups = NAV_GROUPS.map((g) => ({ ...g, items: [...g.items] }));
  if (role === "manager") {
    groups = groups.map((g) => ({ ...g, items: g.items.filter((it) => !["dashboard", "dev", "archives"].includes(it.key)) }));
  }
  return groups.filter((g) => g.items.length);
}

function relTime(ts) {
  if (!ts) return "";
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  if (isNaN(then)) return ts;
  const m = Math.round((Date.now() - then) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}

function NotifBell({ alerts }) {
  const { unread = 0, recent = [] } = alerts || {};
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  return (
    <div className={`notif-wrap${open ? " open" : ""}`} ref={ref}>
      <button className="notif-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      <div className="notif-panel">
        <div className="np-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Notifications</span>
          <Link href="/notifications" className="more" style={{ fontSize: ".78rem" }} onClick={() => setOpen(false)}>View all →</Link>
        </div>
        {recent.length === 0 && <div style={{ padding: "14px 12px", fontSize: ".86rem", color: "var(--muted)" }}>You're all caught up.</div>}
        {recent.map((n) => (
          <Link key={n.id} href={n.link || "/notifications"} className="np-item" onClick={() => setOpen(false)}>
            <span className="np-dot" style={n.read ? { background: "var(--line)" } : undefined} />
            <div><div className="np-title">{n.title}</div><div className="np-sub">{n.body || ""}{n.created_at ? ` · ${relTime(n.created_at)}` : ""}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  const first = (user?.name || "Staff").trim().split(/\s+/)[0];
  const avtr  = (user?.name || "S").trim()[0]?.toUpperCase() || "S";
  return (
    <div className={`user-wrap${open ? " open" : ""}`} ref={ref}>
      <div className="user-chip" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span className="avatar">{avtr}</span>
        <span className="u-name">{first}</span>
        <span className="caret">▾</span>
      </div>
      <div className="user-menu">
        <div className="um-head"><div className="n">{user?.name}</div><div className="e">{user?.email}</div></div>
        <Link href="/users"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg> Users</Link>
        <Link href="/activity"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Activity log</Link>
        <form action={logoutAction} style={{ margin: 0 }}>
          <button type="submit" className="danger" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, fontSize: ".92rem", fontWeight: 500, color: "var(--red)", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}

const NP_SERVICES = [
  "Security Cameras / CCTV", "Commercial Audio", "Networking & Cat6",
  "Access Control / Door Entry", "NVR & Storage", "Toast / POS Cabling", "Other",
];

function NewProjectModal({ onClose }) {
  const r = useRouter();
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", address: "", service: "Security Cameras / CCTV", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));


  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await res.json();
      if (j.ok) setDone(j);
      else setErr(j.error || "Could not create the project.");
    } catch { setErr("Connection error."); }
    setBusy(false);
  }
  function finish() { onClose(); r.refresh(); }

  return (
    <div className="np-overlay" onClick={(e) => { if (e.target.classList.contains("np-overlay")) onClose(); }}>
      <div className="np-box">
        <button className="np-x" onClick={onClose}>×</button>
        {done ? (
          <div style={{ textAlign: "center", padding: "6px 0" }}>
            <div className="np-check"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>
            <h2 className="np-h">Project created.</h2>
            <p className="np-p">A new inquiry has been opened for <b>{done.name || "the customer"}</b>.</p>
            <div className="np-card">
              <div className="np-card-row"><span>Project ID</span><b className="np-mono">{done.accessId}</b></div>
              {done.customerPin && <div className="np-card-row"><span>Customer PIN</span><b className="np-pin">{done.customerPin}</b></div>}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Link href={`/project/${done.accessId}`} className="np-submit" style={{ textAlign: "center", textDecoration: "none" }} onClick={finish}>Open Project →</Link>
              <button className="np-ghost" onClick={finish}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="np-head">
              <div className="np-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></div>
              <h2 className="np-h">New Project</h2>
              <p className="np-p">Capture the customer and the service they need. This opens a new inquiry.</p>
            </div>
            <form className="np-form" onSubmit={submit}>
              <div className="np-row2">
                <div className="np-f"><label>Contact Name</label><input className="apx-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
                <div className="np-f"><label>Company <span className="np-opt">(optional)</span></label><AddressAutocomplete types={["establishment"]} className="apx-input" value={f.company} onChange={(v) => set("company", v)} onPlace={(p) => setF((f) => ({ ...f, company: p.name || f.company, address: p.address || f.address }))} placeholder="Start typing a business name…" /></div>
              </div>
              <div className="np-row2">
                <div className="np-f"><label>Email</label><input className="apx-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
                <div className="np-f"><label>Phone</label><input className="apx-input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              </div>
              <div className="np-f"><label>Service Address</label><AddressAutocomplete className="apx-input" value={f.address} onChange={(v) => set("address", v)} placeholder="123 Main St, City, NJ" /></div>
              <div className="np-f"><label>Service Needed</label><select className="apx-input" value={f.service} onChange={(e) => set("service", e.target.value)}>{NP_SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div className="np-f"><label>Notes <span className="np-opt">(optional)</span></label><textarea className="apx-input" rows={2} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="What does the customer need?" /></div>
              {err && <div className="np-err">{err}</div>}
              <button className="np-submit" type="submit" disabled={busy}>{busy ? "Creating…" : "Create Project"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const ROLE_COLOR = {
  dashboard:    { accent: "#C9A96E", accentSoft: "#faf4e8" },
  tickets:      { accent: "#e74c3c", accentSoft: "#fdeaea" },
  sales:        { accent: "#9b59b6", accentSoft: "#f3eeff" },
  tech:         { accent: "#1c8a45", accentSoft: "#e7f6ec" },
  customers:    { accent: "#3257ff", accentSoft: "#eef1ff" },
  inventory:    { accent: "#e67e22", accentSoft: "#fef5e7" },
  finances:     { accent: "#27ae60", accentSoft: "#e8f8f5" },
  expenses:     { accent: "#c0392b", accentSoft: "#fadbd8" },
  activity:     { accent: "#8e44ad", accentSoft: "#f4ecf7" },
  manager:      { accent: "#2980b9", accentSoft: "#d6eaf8" },
  portal:       { accent: "#16a085", accentSoft: "#d1f2eb" },
  users:        { accent: "#d35400", accentSoft: "#fdebd0" },
};

// Fixed color per user role — never changes with the active tab
export const USER_ROLE_COLOR = {
  admin:    "#C9A96E",
  manager:  "#2980b9",
  sales:    "#9b59b6",
  tech:     "#1c8a45",
  customer: "#3257ff",
};
const ROLE_LABEL = { admin: "Admin", manager: "Manager", sales: "Sales", tech: "Tech", customer: "Customer" };

export default function AdminShell({ user, alerts, active, children }) {
  const [npOpen, setNpOpen] = useState(false);
  const router = useRef(null);
  const r = useRouter();
  const [q, setQ] = useState("");
  function onSearchKey(e) {
    if (e.key === "Enter" && q.trim()) r.push(`/portal?q=${encodeURIComponent(q.trim())}`);
  }
  const SALES_TABS = ["sales", "customers", "tickets"];
  const tabsByKey  = Object.fromEntries(TABS.map(t => [t.key, t]));
  // Techs don't approve expenses (that page is admin/manager only). Their "Expenses" tab points
  // to their own jobs, where they submit reimbursements per project — never the dead admin page.
  const TECH_NAV = [tabsByKey.tech, tabsByKey.tickets, { key: "expenses", label: "Expenses", href: "/tech" }];
  const allowed = user?.role === "tech"
    ? TECH_NAV.filter(Boolean)
    : user?.role === "sales"
      ? SALES_TABS.map(k => tabsByKey[k]).filter(Boolean)
      : user?.role === "manager"
        ? TABS.filter((t) => !["dashboard", "dev"].includes(t.key))
        : TABS;

  const roleColor = ROLE_COLOR[active] || ROLE_COLOR.dashboard;

  const isGrouped = ["admin", "manager"].includes(user?.role);
  const navModel  = isGrouped ? groupedNavFor(user.role) : null;
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);
  useEffect(() => {
    if (!openMenu) return;
    function onDoc(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  return (
    <div className="apx" style={{ "--accent-primary": roleColor.accent, "--accent-primary-soft": roleColor.accentSoft }}>
      <style>{CSS}</style>

      <header className="nav">
        <div className="apx-wrap nav-top">
          <Link href="/dashboard" className="apx-brand">
            <span className="name"><Wordmark height={20} /></span>
            <span className="admin-badge" style={{ background: USER_ROLE_COLOR[user?.role] || "#C9A96E" }}>{ROLE_LABEL[user?.role] || "Staff"}</span>
          </Link>

          <div className="nav-search">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" placeholder="Search projects, customers…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          </div>

          <div className="nav-right">
            <NotifBell alerts={alerts} />
            <UserMenu user={user} />
            {!["tech","sales"].includes(user?.role) && (
              <button className="btn btn-primary" onClick={() => setNpOpen(true)}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg> New Project
              </button>
            )}
          </div>
        </div>

        <div className="apx-wrap tabbar-wrap">
          <nav className={`tabbar${isGrouped ? " tabbar-grouped" : ""}`} ref={navRef}>
            {isGrouped
              ? navModel.map((g) =>
                  g.items.length === 1 ? (
                    <Link
                      key={g.key}
                      href={g.items[0].href}
                      className={`tab${active === g.items[0].key ? " on" : ""}`}
                      onClick={() => setOpenMenu(null)}
                    >
                      {g.label}
                    </Link>
                  ) : (
                    <div key={g.key} className="tab-group">
                      <button
                        className={`tab tab-trigger${g.items.some((it) => it.key === active) ? " on" : ""}${openMenu === g.key ? " open" : ""}`}
                        onClick={() => setOpenMenu((m) => (m === g.key ? null : g.key))}
                      >
                        {g.label}
                        <svg className="tab-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                      {openMenu === g.key && (
                        <div className="tab-menu">
                          {g.items.map((it) => (
                            <Link
                              key={it.key}
                              href={it.href}
                              className={`tab-menu-item${active === it.key ? " on" : ""}`}
                              onClick={() => setOpenMenu(null)}
                            >
                              {it.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )
              : allowed.map((t) => (
                  <Link key={t.key} href={t.href} className={`tab${active === t.key ? " on" : ""}`}>{t.label}</Link>
                ))}
          </nav>
        </div>
      </header>

      {children}

      {npOpen && <NewProjectModal onClose={() => setNpOpen(false)} />}

      <footer>
        <div className="apx-wrap foot-inner">
          <Link href="/dashboard" className="apx-brand foot-brand">
            <span className="name"><Wordmark height={18} techsColor="#C9A96E" /></span>
            <TaglinePill tone="dark" style={{ borderColor: "rgba(255,255,255,.3)" }} />
          </Link>
          <div>© 2026 IOT TECHS · La Vague Inc.</div>
          <div><Link href="/">Help</Link> · <Link href="/">Privacy</Link></div>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.apx{
  --bg:#ffffff;--bg-soft:#f6f7f9;--bg-tint:#f0f2f7;
  --ink:#0e1320;--slate:#2C3347;--muted:#5b6275;--line:#e6e8ee;
  --gold:#C9A96E;--gold-deep:#b08f4f;
  --accent:#3257ff;--accent-soft:#eef1ff;
  --green:#1c8a45;--green-soft:#e7f6ec;
  --red:#d23c3c;--red-soft:#fdeaea;
  --amber:#b45309;--amber-soft:#fef3c7;
  --purple:#7c3aed;--purple-soft:#f3eeff;
  --radius:16px;
  font-family:'Hanken Grotesk',sans-serif;background:var(--bg-soft);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh;
}
.apx *{margin:0;padding:0;box-sizing:border-box}
.apx a{text-decoration:none;color:inherit}
.apx-wrap{max-width:1200px;margin:0 auto;padding:0 26px}
.apx .display{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;line-height:1.02}

.apx header.nav{position:sticky;top:0;z-index:60;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.apx .nav-top{display:flex;align-items:center;justify-content:space-between;height:68px;gap:16px}
.apx-brand{display:flex;align-items:center;gap:11px}
.apx-brand.foot-brand{gap:14px}
.apx-brand .name{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.25rem;letter-spacing:-.02em}
.apx-brand .name b{color:var(--gold-deep)}
.apx-brand .admin-badge{font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--ink);color:#fff;border-radius:5px;padding:3px 7px;margin-left:4px}

.apx .tabbar-wrap{border-top:1px solid var(--line)}
.apx .tabbar{display:flex;gap:2px;height:46px;align-items:stretch;overflow-x:auto}
.apx .tab{display:inline-flex;align-items:center;padding:0 16px;font-size:.86rem;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;white-space:nowrap;transition:.15s}
.apx .tab:hover{color:var(--ink)}
.apx .tab.on{color:var(--ink);border-bottom-color:var(--accent-primary, var(--gold))}

.apx .tabbar-grouped{overflow:visible;gap:4px}
.apx .tab-group{position:relative;display:inline-flex;align-items:stretch}
.apx .tab-trigger{background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;cursor:pointer;gap:5px}
.apx .tab-chev{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.2;transition:transform .15s}
.apx .tab-trigger.open{color:var(--ink)}
.apx .tab-trigger.open .tab-chev{transform:rotate(180deg)}
.apx .tab-menu{position:absolute;top:100%;left:0;margin-top:-1px;background:#fff;border:1px solid var(--line);border-radius:11px;box-shadow:0 12px 32px rgba(14,19,32,.14);padding:6px;min-width:194px;z-index:80;animation:tabMenuIn .14s ease}
@keyframes tabMenuIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
.apx .tab-menu-item{display:block;padding:9px 12px;border-radius:8px;font-size:.85rem;font-weight:600;color:var(--muted);white-space:nowrap;transition:.12s}
.apx .tab-menu-item:hover{background:var(--bg-soft);color:var(--ink)}
.apx .tab-menu-item.on{color:var(--ink);background:var(--accent-primary-soft,#f0e8d8)}

.apx .nav-search{display:flex;align-items:center;gap:8px;background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:8px 14px;width:380px;max-width:38vw}
.apx .nav-search svg{width:14px;height:14px;stroke:var(--muted);fill:none;stroke-width:2;flex-shrink:0}
.apx .nav-search input{background:transparent;border:none;outline:none;font-family:inherit;font-size:.88rem;color:var(--ink);width:100%}
.apx .nav-search input::placeholder{color:var(--muted)}

.apx .nav-right{display:flex;align-items:center;gap:10px}
.apx .notif-wrap{position:relative}
.apx .notif-btn{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#fff;border:1px solid var(--line);cursor:pointer;transition:.18s;position:relative}
.apx .notif-btn:hover{border-color:var(--gold);box-shadow:0 6px 16px -8px rgba(14,19,32,.25)}
.apx .notif-btn svg{width:18px;height:18px;stroke:var(--ink);fill:none;stroke-width:2}
.apx .notif-badge{position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;border-radius:50%;background:var(--red);color:#fff;font-size:.62rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--bg-soft)}
.apx .notif-panel{position:absolute;right:0;top:calc(100% + 10px);width:310px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 50px -18px rgba(14,19,32,.3);padding:6px;opacity:0;visibility:hidden;transform:translateY(-6px);transition:.18s;z-index:80}
.apx .notif-wrap.open .notif-panel{opacity:1;visibility:visible;transform:translateY(0)}
.apx .np-head{font-weight:700;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 12px 8px}
.apx .np-item{display:flex;align-items:flex-start;gap:11px;padding:11px 12px;border-radius:10px;cursor:pointer;transition:.15s}
.apx .np-item:hover{background:var(--bg-soft)}
.apx .np-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:5px}
.apx .np-title{font-weight:600;font-size:.9rem;margin-bottom:2px}
.apx .np-sub{font-size:.8rem;color:var(--muted);line-height:1.35}

.apx .user-wrap{position:relative}
.apx .user-chip{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid var(--line);padding:6px 8px 6px 6px;border-radius:50px;cursor:pointer;transition:border-color .2s,box-shadow .2s}
.apx .user-chip:hover{border-color:var(--gold);box-shadow:0 8px 20px -12px rgba(14,19,32,.3)}
.apx .avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,var(--gold),var(--gold-deep));color:#fff;display:grid;place-items:center;font-weight:700;font-size:.9rem;font-family:'Bricolage Grotesque',sans-serif}
.apx .user-chip .u-name{font-weight:600;font-size:.92rem}
.apx .user-chip .caret{color:var(--muted);font-size:.7rem}
.apx .user-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:210px;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 50px -18px rgba(14,19,32,.3);padding:8px;opacity:0;visibility:hidden;transform:translateY(-6px);transition:.18s;z-index:80}
.apx .user-wrap.open .user-menu{opacity:1;visibility:visible;transform:translateY(0)}
.apx .user-menu .um-head{padding:10px 12px 12px;border-bottom:1px solid var(--line);margin-bottom:6px}
.apx .user-menu .um-head .n{font-weight:700;font-size:.95rem}
.apx .user-menu .um-head .e{color:var(--muted);font-size:.82rem}
.apx .user-menu a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;font-size:.92rem;font-weight:500;color:var(--ink)}
.apx .user-menu a:hover{background:var(--bg-soft)}
.apx .user-menu a.danger{color:var(--red)}
.apx .user-menu svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.9}

.apx .btn{display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-weight:600;font-size:.88rem;padding:9px 16px;border-radius:10px;cursor:pointer;border:none;transition:.18s;white-space:nowrap}
.apx .btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.2}
.apx .btn-primary{background:var(--ink);color:#fff}
.apx .btn-primary:hover{background:var(--slate)}
.apx .btn-ghost{background:#fff;border:1px solid var(--line);color:var(--ink)}
.apx .btn-ghost:hover{border-color:var(--gold);background:var(--bg-soft)}
.apx .btn-gold{background:var(--accent-primary, var(--gold));color:var(--ink)}
.apx .btn-gold:hover{background:var(--ink);color:var(--gold)}
.apx .btn-sm{padding:6px 12px;font-size:.82rem;border-radius:8px}

.apx .page-head{padding:30px 0 0}
.apx .page-head h1{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(1.3rem,2.4vw,1.7rem);font-weight:700;margin-bottom:5px}
.apx .page-head h1 em{font-style:normal;color:var(--gold-deep)}
.apx .page-head .ph-sub{font-size:.88rem;color:var(--muted)}

.apx .welcome{padding:34px 0 0}
.apx .welcome h1{font-size:clamp(1.35rem,2.6vw,1.8rem);font-weight:700;margin-bottom:6px}
.apx .welcome h1 em{font-style:normal;color:var(--gold-deep)}
.apx .welcome .w-sub{font-size:.88rem;color:var(--muted)}

.apx .kpi-row{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:22px 0}
.apx .kpi-row.k4{grid-template-columns:repeat(4,1fr)}
.apx .kpi-row.k5{grid-template-columns:repeat(5,1fr)}
.apx .kpi{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px 16px 14px}
.apx .kpi-link{display:block;transition:transform .15s,box-shadow .18s,border-color .18s}
.apx .kpi-link:hover{transform:translateY(-3px);box-shadow:0 14px 30px -16px rgba(14,19,32,.35);border-color:rgba(201,169,110,.5)}
.apx .kpi .k-label{font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.apx .kpi .k-val{font-family:'Bricolage Grotesque',sans-serif;font-size:1.75rem;font-weight:700;line-height:1;margin-bottom:5px}
.apx .kpi .k-sub{font-size:.74rem;color:var(--muted)}
.apx .kpi .k-sub b{font-weight:600;color:var(--ink)}
.apx .kpi.c-gold .k-val{color:var(--accent-primary, var(--gold-deep))}
.apx .kpi.c-green .k-val{color:var(--green)}
.apx .kpi.c-red .k-val{color:var(--red)}
.apx .kpi.c-blue .k-val{color:var(--accent)}
.apx .kpi.c-amber .k-val{color:var(--amber)}
.apx .kpi.c-purple .k-val{color:var(--purple)}

.apx .sec-head{display:flex;align-items:center;justify-content:space-between;margin:24px 0 14px;gap:16px;flex-wrap:wrap}
.apx .sec-head h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.15rem;font-weight:700}
.apx .filters{display:inline-flex;gap:4px;background:#fff;border:1px solid var(--line);border-radius:50px;padding:4px}
.apx .filters button{border:none;background:transparent;font-family:inherit;font-weight:600;font-size:.82rem;color:var(--muted);padding:6px 14px;border-radius:50px;cursor:pointer;transition:.15s}
.apx .filters button:hover{color:var(--ink)}
.apx .filters button.on{background:var(--ink);color:#fff}

.apx .actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.apx .action{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 15px;cursor:pointer;transition:transform .15s,box-shadow .18s,border-color .18s}
.apx .action:hover{transform:translateY(-3px);box-shadow:0 14px 30px -16px rgba(14,19,32,.35);border-color:rgba(201,169,110,.5)}
.apx .action .ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.apx .action .ic svg{width:15px;height:15px;fill:none;stroke-width:2}
.apx .action h3{font-family:'Bricolage Grotesque',sans-serif;font-size:.88rem;font-weight:700}
.apx .a-blue .ic{background:var(--accent-soft)} .apx .a-blue .ic svg{stroke:var(--accent)}
.apx .a-gold .ic{background:#faf4e8} .apx .a-gold .ic svg{stroke:var(--gold-deep)}
.apx .a-green .ic{background:var(--green-soft)} .apx .a-green .ic svg{stroke:var(--green)}
.apx .a-red .ic{background:var(--red-soft)} .apx .a-red .ic svg{stroke:var(--red)}
.apx .a-purple .ic{background:var(--purple-soft)} .apx .a-purple .ic svg{stroke:var(--purple)}

.apx .two-col{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;margin-bottom:18px}
.apx .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-bottom:18px}

.apx .panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.apx .panel.mb{margin-bottom:18px}
.apx .panel-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--line)}
.apx .panel-head h3{font-family:'Bricolage Grotesque',sans-serif;font-size:1rem;font-weight:700}
.apx .panel-head .ph-right{display:flex;align-items:center;gap:10px}
.apx .more{font-weight:600;color:var(--muted);font-size:.88rem}
.apx .more:hover{color:var(--gold-deep)}
.apx .tab-row{display:flex;gap:3px;background:var(--bg-soft);border-radius:8px;padding:3px}
.apx .tab-row button{border:none;background:transparent;font-family:inherit;font-size:.78rem;font-weight:600;color:var(--muted);padding:5px 11px;border-radius:6px;cursor:pointer;transition:.15s}
.apx .tab-row button.on{background:#fff;color:var(--ink);box-shadow:0 1px 4px rgba(14,19,32,.08)}
.apx .tab-row button:hover{color:var(--ink)}

.apx .apx-input{width:100%;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 14px;font-family:inherit;font-size:.92rem;color:var(--ink);outline:none;transition:border-color .18s,box-shadow .18s}
.apx .apx-input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,169,110,.15)}

.apx .empty{padding:26px 18px;text-align:center;color:var(--muted);font-size:.9rem}

.apx .pt-row{display:grid;grid-template-columns:1fr 120px 100px 86px;gap:10px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .pt-row.head-row{padding:8px 18px;background:var(--bg-soft)}
.apx .pt-row > div:first-child{min-width:0}
.apx .pt-row:last-child{border-bottom:none}
.apx .pt-row:not(.head-row):hover{background:var(--bg-soft)}
.apx .pt-row .col-lbl{font-size:.67rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.apx .pt-row .r-name{font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apx .pt-row .r-loc{font-size:.76rem;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apx .pt-row .r-val{font-size:.86rem;font-weight:600}
.apx .stage-pill{font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:100px;white-space:nowrap;display:inline-block}
.apx .s-install{background:var(--accent-soft);color:var(--accent)}
.apx .s-proposal{background:var(--amber-soft);color:var(--amber)}
.apx .s-qc{background:var(--purple-soft);color:var(--purple)}
.apx .s-done{background:var(--green-soft);color:var(--green)}
.apx .s-survey{background:#faf4e8;color:var(--gold-deep)}
.apx .pt-row .r-tech{font-size:.82rem;color:var(--muted)}
.apx .pt-row .r-open a{font-size:.8rem;font-weight:600;color:var(--gold-deep);padding:5px 11px;border:1px solid var(--line);border-radius:7px;transition:.15s;display:inline-block}
.apx .pt-row .r-open a:hover{border-color:var(--gold);background:var(--bg-soft)}

.apx .ticket{display:flex;align-items:flex-start;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);cursor:pointer;transition:.12s}
.apx .ticket:last-child{border-bottom:none}
.apx .ticket:hover{background:var(--bg-soft)}
.apx .t-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:6px}
.apx .t-dot.urgent{background:var(--red)} .apx .t-dot.medium{background:var(--amber)} .apx .t-dot.low{background:var(--muted)}
.apx .ticket .t-body{flex:1;min-width:0}
.apx .ticket .t-title{font-weight:600;font-size:.88rem;margin-bottom:2px}
.apx .ticket .t-meta{font-size:.76rem;color:var(--muted)}
.apx .tbadge{font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:100px;margin-left:auto;flex-shrink:0;align-self:center}
.apx .tbadge.urgent{background:var(--red-soft);color:var(--red)} .apx .tbadge.medium{background:var(--amber-soft);color:var(--amber)} .apx .tbadge.low{background:var(--bg-tint);color:var(--muted)}

.apx .tech-row{display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .tech-row:last-child{border-bottom:none}
.apx .tech-row:hover{background:var(--bg-soft)}
.apx .tech-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:.85rem;font-family:'Bricolage Grotesque',sans-serif;flex-shrink:0;border:2px solid var(--line)}
.apx .tech-row .t-info .t-name{font-weight:600;font-size:.9rem}
.apx .tech-row .t-info .t-role{font-size:.74rem;color:var(--muted)}
.apx .tech-row .t-jobs{font-size:.78rem;color:var(--muted);margin-left:auto;margin-right:12px}
.apx .sdot{display:inline-flex;align-items:center;gap:5px;font-size:.76rem;font-weight:600}
.apx .sdot::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%}
.apx .sdot.field::before{background:var(--green)} .apx .sdot.field{color:var(--green)}
.apx .sdot.office::before{background:var(--accent)} .apx .sdot.office{color:var(--accent)}

.apx .pr-row{display:grid;grid-template-columns:1fr 70px 70px 76px;gap:10px;align-items:center;padding:11px 18px;border-bottom:1px solid var(--line);transition:.12s}
.apx .pr-row:hover{background:var(--bg-soft)}
.apx .pr-row .pr-name{font-weight:600;font-size:.88rem}
.apx .pr-row .pr-id{font-size:.72rem;color:var(--muted);font-weight:400;margin-left:4px}
.apx .pr-row .pr-val{font-size:.88rem;font-weight:600;text-align:right}
.apx .pr-row .pr-bonus{font-size:.88rem;font-weight:600;text-align:right;color:var(--green)}
.apx .pay-badge{font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:100px;display:inline-block}
.apx .pay-badge.pending{background:var(--amber-soft);color:var(--amber)} .apx .pay-badge.paid{background:var(--green-soft);color:var(--green)}

.apx .act-row{display:flex;align-items:flex-start;gap:12px;padding:11px 18px;border-bottom:1px solid var(--line)}
.apx .act-row:last-child{border-bottom:none}
.apx .act-ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
.apx .act-ic svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2}
.apx .act-ic.blue{background:var(--accent-soft);color:var(--accent)}
.apx .act-ic.gold{background:#faf4e8;color:var(--gold-deep)}
.apx .act-ic.green{background:var(--green-soft);color:var(--green)}
.apx .act-ic.red{background:var(--red-soft);color:var(--red)}
.apx .act-ic.amber{background:var(--amber-soft);color:var(--amber)}
.apx .act-body .a-title{font-size:.86rem;font-weight:500;line-height:1.35}
.apx .act-body .a-title b{font-weight:700}
.apx .act-body .a-time{font-size:.73rem;color:var(--muted);margin-top:2px}

/* generic data table */
.apx .dtable{width:100%;border-collapse:collapse}
.apx .dtable th{text-align:left;font-size:.67rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);padding:11px 18px;background:var(--bg-soft);border-bottom:1px solid var(--line);white-space:nowrap}
.apx .dtable td{padding:12px 18px;border-bottom:1px solid var(--line);font-size:.88rem;vertical-align:middle}
.apx .dtable tr:last-child td{border-bottom:none}
.apx .dtable tbody tr{transition:.12s}
.apx .dtable tbody tr:hover{background:var(--bg-soft)}
.apx .dtable .mono{font-family:Menlo,Consolas,monospace;font-size:.82rem;letter-spacing:.3px}
.apx .dtable .idlink{color:var(--gold-deep);font-weight:600}
.apx .dtable .idlink:hover{text-decoration:underline}
.apx .dtable .num{text-align:right;font-weight:600}
.apx .dtable .name-cell{font-weight:600}

/* chips / badges */
.apx .chip{display:inline-block;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:100px;background:var(--bg-tint);color:var(--muted)}
.apx .chip.active{background:var(--accent-soft);color:var(--accent)}
.apx .chip.done{background:var(--green-soft);color:var(--green)}
.apx .chip.value{background:#faf4e8;color:var(--gold-deep)}
.apx .role-chip{display:inline-block;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:100px}
.apx .role-admin{background:var(--accent-primary-soft, #faf4e8);color:var(--accent-primary, var(--gold-deep))}
.apx .role-manager{background:var(--accent-soft);color:var(--accent)}
.apx .role-sales{background:var(--purple-soft);color:var(--purple)}
.apx .role-tech{background:var(--accent-primary-soft, var(--green-soft));color:var(--accent-primary, var(--green))}
.apx .role-customer{background:var(--bg-tint);color:var(--muted)}

/* customer list (full width rows) */
.apx .crow{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--line);cursor:pointer;transition:.12s}
.apx .crow:last-child{border-bottom:none}
.apx .crow:hover{background:var(--bg-soft)}
.apx .cav{width:38px;height:38px;border-radius:10px;background:var(--bg-tint);border:1px solid var(--line);display:grid;place-items:center;font-weight:700;font-size:.85rem;font-family:'Bricolage Grotesque',sans-serif;color:var(--gold-deep);flex-shrink:0}
.apx .crow .c-main{flex:1;min-width:0}
.apx .crow .c-name{font-weight:700;font-size:.95rem}
.apx .crow .c-contact{font-size:.78rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apx .crow .c-addr{font-size:.8rem;color:var(--muted)}
.apx .crow .c-chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.apx .crow .c-arr{color:var(--muted);font-size:.9rem;margin-left:6px;transition:transform .15s}
.apx .crow:hover .c-arr{transform:translateX(3px)}

/* portal customer chips */
.apx .chip-row{display:flex;flex-wrap:wrap;gap:8px}
.apx .pchip{border:1px solid var(--line);background:#fff;border-radius:9px;padding:8px 14px;font-family:inherit;font-size:.85rem;font-weight:600;color:var(--ink);cursor:pointer;transition:.15s}
.apx .pchip:hover{border-color:var(--gold);background:var(--bg-soft)}
.apx .pchip.sel{background:var(--ink);color:#fff;border-color:var(--ink)}

/* project cards grid (portal) */
.apx .pcard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding:16px 18px}
.apx .pcard{border:1px solid var(--line);border-radius:12px;padding:14px;transition:.15s}
.apx .pcard:hover{border-color:var(--gold);box-shadow:0 10px 24px -16px rgba(14,19,32,.3)}
.apx .pcard .pc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.apx .pcard .pc-id{font-family:Menlo,Consolas,monospace;font-size:.8rem;font-weight:700;color:var(--gold-deep)}
.apx .pcard .pc-meta{font-size:.8rem;color:var(--muted);margin-bottom:10px;min-height:34px}
.apx .pcard .pc-bot{display:flex;align-items:center;justify-content:space-between;font-size:.82rem}
.apx .pcard .pc-val{font-weight:700}
.apx .pcard .pc-stage{color:var(--muted)}

/* edit form (users) */
.apx .edit-row td{background:var(--bg-soft);padding:0}
.apx .edit-form{padding:18px}
.apx .edit-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;margin-bottom:12px}
.apx .edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.apx .edit-grid label{display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:600;color:var(--ink)}
.apx .edit-grid .opt{font-weight:400;color:var(--muted)}
.apx .edit-actions{display:flex;gap:8px}
.apx .edit-err{color:var(--red);font-size:.82rem;margin-bottom:10px}
.apx .usel{border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-family:inherit;font-size:.85rem;background:#fff;color:var(--ink);cursor:pointer}
.apx .save-flash{font-size:.8rem;font-weight:700;color:var(--green)}
.apx .uname-cell{display:flex;align-items:center;gap:11px;cursor:pointer}
.apx .uname-cell.locked{cursor:default}
.apx .uav{width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,var(--gold),var(--gold-deep));color:#fff;display:grid;place-items:center;font-weight:700;font-size:.82rem;font-family:'Bricolage Grotesque',sans-serif;flex-shrink:0}
.apx .uname-cell .un{font-weight:600;font-size:.9rem}
.apx .uname-cell .uh{font-size:.76rem;color:var(--muted)}

.apx .np-overlay{position:fixed;inset:0;background:rgba(14,19,32,.55);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.apx .np-box{position:relative;background:#fff;border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:26px 28px 28px;box-shadow:0 32px 80px -24px rgba(14,19,32,.5)}
.apx .np-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#9ca3af;line-height:1;padding:4px 8px;border-radius:8px}
.apx .np-x:hover{background:var(--bg-soft);color:var(--ink)}
.apx .np-head{margin-bottom:18px}
.apx .np-icon{width:44px;height:44px;border-radius:12px;background:var(--accent-soft);display:grid;place-items:center;margin-bottom:12px}
.apx .np-icon svg{width:20px;height:20px;stroke:var(--accent);fill:none;stroke-width:2}
.apx .np-h{font-family:'Bricolage Grotesque',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:6px}
.apx .np-p{color:var(--muted);font-size:.9rem}
.apx .np-form{display:grid;gap:13px}
.apx .np-row2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.apx .np-f{display:flex;flex-direction:column;gap:5px}
.apx .np-f label{font-size:.82rem;font-weight:600}
.apx .np-opt{font-weight:400;color:var(--muted)}
.apx .np-err{font-size:.85rem;color:var(--red);background:var(--red-soft);padding:8px 12px;border-radius:8px}
.apx .np-submit{flex:1;width:100%;padding:12px;background:var(--gold);color:var(--ink);border:none;border-radius:12px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;transition:.18s}
.apx .np-submit:hover:not(:disabled){background:var(--ink);color:var(--gold)}
.apx .np-submit:disabled{opacity:.6;cursor:not-allowed}
.apx .np-ghost{padding:12px 18px;background:#fff;border:1px solid var(--line);border-radius:12px;font-family:inherit;font-weight:600;cursor:pointer;color:var(--ink)}
.apx .np-ghost:hover{border-color:var(--gold);background:var(--bg-soft)}
.apx .np-check{width:54px;height:54px;border-radius:50%;background:var(--green-soft);display:grid;place-items:center;margin:0 auto 14px}
.apx .np-check svg{width:26px;height:26px;stroke:var(--green);fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.apx .np-card{background:var(--bg-soft);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 18px;text-align:left}
.apx .np-card-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0}
.apx .np-card-row span{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.apx .np-mono{font-family:Menlo,Consolas,monospace;letter-spacing:.06em}
.apx .np-pin{font-family:Menlo,Consolas,monospace;font-size:1.1rem;letter-spacing:.2em;color:var(--gold-deep)}
@media(max-width:620px){.apx .np-row2{grid-template-columns:1fr}}
.apx footer{background:var(--ink);color:#9aa1b3;margin-top:40px;padding:28px 0}
.apx .foot-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:.88rem}
.apx footer .apx-brand .name{color:#fff}
.apx footer a:hover{color:#fff}

@media(max-width:1100px){.apx .kpi-row,.apx .kpi-row.k5{grid-template-columns:repeat(3,1fr)}.apx .kpi-row.k4{grid-template-columns:repeat(2,1fr)}.apx .two-col{grid-template-columns:1fr}.apx .three-col{grid-template-columns:1fr 1fr}}
@media(max-width:720px){.apx .actions{grid-template-columns:1fr 1fr}.apx .three-col{grid-template-columns:1fr}.apx .kpi-row,.apx .kpi-row.k4,.apx .kpi-row.k5{grid-template-columns:1fr 1fr}.apx .nav-search{display:none}.apx .edit-grid{grid-template-columns:1fr}}
@media(max-width:560px){
  .apx-wrap{padding:0 14px}
  .apx .welcome{padding:22px 0 0}
  .apx .kpi-row,.apx .kpi-row.k4,.apx .kpi-row.k5{gap:10px}
  .apx .kpi{padding:13px 14px 12px;border-radius:13px}
  .apx .kpi .k-val{font-size:1.5rem}
  .apx .actions{gap:9px;margin-bottom:18px}
  .apx .action{padding:12px 13px}
  .apx .nav-top{height:58px;gap:10px}
  .apx-brand .name{font-size:1.05rem}
  .apx .nav-right{gap:7px}
  .apx .btn-primary{padding:9px 11px}
  .apx .tabbar{height:44px}
  .apx .tab{padding:0 12px;font-size:.82rem}
  .apx .panel-head{padding:13px 14px}
  .apx .ticket,.apx .act-row,.apx .tech-row,.apx .crow,.apx .pr-row,.apx .pt-row{padding-left:14px;padding-right:14px}
  /* project + payroll rows: drop the mid column so the name isn't crushed on a phone */
  .apx .pt-row{grid-template-columns:minmax(0,1fr) auto auto;gap:8px}
  .apx .pt-row > div:nth-child(3),.apx .pt-row .col-lbl:nth-child(3){display:none}
  .apx .pr-row{grid-template-columns:minmax(0,1fr) auto auto;gap:8px}
  .apx .pr-row .pr-bonus{display:none}
  .apx .crow .c-chips{flex-direction:column;gap:4px;align-items:flex-end}
}
`;
