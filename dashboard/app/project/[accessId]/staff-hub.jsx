"use client";
// Staff Project Hub (Phase 1) — the clean, customer-style project home for STAFF, behind the STAFF_PROJECT_HUB
// flag / per-project `staff_view` override. It renders the SAME shell as Customer Portal V2 (imports its CSS,
// same `.cpv` scope) so it genuinely inherits that look: a status hero, the read-only progress rail, the
// balance, and a list of section cards. The difference from the customer portal: each card opens the EDITABLE
// staff tool (the gateway supplies `renderOverlay` with staff props), and there's a "Deck" escape hatch back
// to the classic stage deck. Presentation only — every overlay mounts the same component the deck uses, so no
// lifecycle / role / money logic is duplicated or changed.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PORTAL_CSS } from "./customer-portal";
import ProjectContactCard from "./project-contact-card";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); } catch { return d; } };
const fmtTime = (t) => { try { const [h, m] = String(t).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; } catch { return t; } };
const apptType = (a) => (a?.kind === "install" || /install/i.test(a?.title || "")) ? "Installation" : (a?.kind === "survey" || /survey/i.test(a?.title || "")) ? "Site Survey" : (a?.title || "Appointment");

const TITLES = { install: "Installation", schedule: "Scheduling", workorder: "Work Order", expenses: "Expenses" };

export default function StaffHub({
  accessId, project, status, finance, appt, phases = [], currentPhaseKey, progressPct = null,
  sections = [], actions = [], primaryCta = null, renderOverlay, onRefresh, onAdvanced, dashboardHref = null, contact = null, log = null, defaultGroup = "customer",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [contactOpen, setContactOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [group, setGroup] = useState(defaultGroup);   // Project-tools filter: Customer-facing vs Internal (techs default to Internal)
  const [logOpen, setLogOpen] = useState(false);      // Job Log collapsed by default, like the deck

  // URL drives the open overlay, exactly like the customer portal: ?view=<key>. Any section or rail action
  // that carries a `view` is openable (plus the synthetic `install` detail).
  const viewOf = (x) => x.view || x.key;
  const keys = new Set([...sections.map(viewOf), ...actions.map((a) => a.view).filter(Boolean), "install"]);
  const requested = (params.get("view") || "").toLowerCase();
  const activeView = requested && keys.has(requested) ? requested : null;
  const activeSection = sections.find((s) => viewOf(s) === activeView);
  // Tools that render their own prominent header set `ownHeader` — we drop the overlay's title text for
  // them (keeping the project id + X) so there's no duplicate heading.
  const activeTitle = activeSection?.ownHeader ? "" : (TITLES[activeView] || activeSection?.title || "Details");

  const open = (view, extra = {}) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("open");
    sp.set("view", view);
    if (extra.sign) sp.set("sign", "1"); else sp.delete("sign");
    if (extra.reqsign) sp.set("reqsign", "1"); else sp.delete("reqsign");
    router.push(`${pathname}?${sp.toString()}`);
  };
  const close = () => {
    const sp = new URLSearchParams(params.toString());
    ["view", "open", "sign", "reqsign"].forEach((k) => sp.delete(k));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    onRefresh?.();
  };
  // A ?view that no section matches → strip it, land on the hub home (never a blank overlay).
  useEffect(() => {
    if (requested && !activeView) {
      const sp = new URLSearchParams(params.toString());
      ["view", "open", "sign"].forEach((k) => sp.delete(k));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [requested, activeView, params, pathname, router]);
  // Lock body scroll under an overlay.
  useEffect(() => {
    if (activeView) document.body.style.overflow = "hidden"; else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [activeView]);

  return (
    <div className="cpv">
      <style>{PORTAL_CSS}</style>
      <style>{`
.cpv-rail{display:flex;flex-wrap:wrap;gap:8px}
.cpv-railbtn{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:1px solid var(--line);border-radius:10px;background:var(--raise);color:var(--ink);font:700 13.5px/1 inherit;text-decoration:none;cursor:pointer}
.cpv-railbtn:hover{border-color:var(--ink);background:#fff}
.cpv-railbtn svg{width:16px;height:16px;flex:0 0 auto}
.cpv-railbtn.pay{border-color:#bfe0cd;background:#f6fbf8;color:var(--green)}
.cpv-railbtn.pay:hover{border-color:var(--green)}
.cpv-collapse{margin-left:auto;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:999px;background:var(--raise);color:var(--meta);cursor:pointer}
.cpv-collapse:hover{border-color:var(--ink);color:var(--ink)}
.cpv-collapse + .cpv-portwrap{margin-left:8px}
/* Phase 3 — frame every tool overlay as a calm page: a soft tint behind the tool's white cards,
   a slightly stronger title bar, and the project id for context. */
.cpv-ovl-body{background:var(--paper)}
.cpv-ovl-bar{box-shadow:0 1px 0 rgba(16,20,24,.03)}
.cpv-ovl-title{font-size:15px}
.cpv-ovl-ctx{margin-left:8px;font-size:12px;font-weight:600;color:var(--meta);font-family:var(--font-mono),ui-monospace,monospace}
/* Redesign — full-width desktop, centered clickable title, progress under contact, grouped tools, balance last. */
.cpv-main{max-width:1040px}
.cpv-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center}
.cpv-htitle{justify-self:center;display:inline-flex;align-items:center;gap:7px;background:none;border:0;cursor:pointer;font-family:inherit;color:var(--ink);padding:6px 12px;border-radius:999px;max-width:100%;min-width:0}
.cpv-htitle:hover{background:var(--line-soft)}
.cpv-htitle-name{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-htitle-id{color:var(--meta);font-size:13px;font-family:var(--font-mono),ui-monospace,monospace;flex:0 0 auto}
.cpv-htitle svg{color:var(--meta);flex:0 0 auto}
.cpv-portwrap{justify-self:end}
.cpv-kick-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.cpv-kick-row .cpv-kick{margin-bottom:0}
.cpv-seg2{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--raise)}
.cpv-seg2 button{border:0;background:none;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.01em;padding:6px 15px;color:var(--meta);cursor:pointer}
.cpv-seg2 button.on{background:var(--ink);color:#fff}
.cpv-cardgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
/* Unified header bar — the whole bar is clickable and drops down the full contact details. */
.cpv-head{position:static}
.cpv-head[role="button"]{cursor:pointer}
.cpv-head[role="button"]:hover{background:var(--raise)}
.cpv-head.open{border-bottom:0}
.cpv-htitle{cursor:inherit;pointer-events:none}
.cpv-headdrop{border-bottom:1px solid var(--line);background:rgba(255,255,255,.75)}
.cpv-headdrop .pcc-flush{max-width:1040px;margin:0 auto}
/* Job Log — collapsed toggle at the bottom. */
.cpv-logtog{display:inline-flex;align-items:center;gap:9px;height:40px;padding:0 16px;border:1px solid var(--line);border-radius:12px;background:var(--raise);color:var(--ink);font:700 14px/1 inherit;cursor:pointer}
.cpv-logtog:hover{border-color:var(--ink);background:#fff}
.cpv-logchev{color:var(--meta);margin-left:2px}
.cpv-logbody{margin-top:12px}
/* Locked tool cards — visible but gated until their prerequisite is met. */
.cpv-card.locked{opacity:.6;cursor:default;background:var(--paper)}
.cpv-card.locked:hover{border-color:var(--line);background:var(--paper)}
.cpv-card.locked .cpv-card-act{color:var(--faint)}
/* Full-width Job Log — spans the whole page, below the centered content. */
.cpv-logsec{padding:8px 20px 56px}
`}</style>

      {/* Unified bar — click anywhere (except Portal) to drop down the full contact details. */}
      <div className={`cpv-head${contact && contactOpen ? " open" : ""}`} onClick={() => contact && setContactOpen((v) => !v)}
        role={contact ? "button" : undefined} aria-expanded={contact ? contactOpen : undefined} aria-label={contact ? (contactOpen ? "Hide contact details" : "Show contact details") : undefined}>
        <span className="cpv-mark">IOT TECHS</span>
        <span className="cpv-htitle">
          <span className="cpv-htitle-name">{contact?.businessName || project?.contact_name || project?.customer || "Project"}</span>
          <span className="cpv-htitle-id">· {String(accessId).slice(-4)}</span>
          {contact && <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: contactOpen ? "none" : "rotate(180deg)", pointerEvents: "none" }}><path d="M18 15l-6-6-6 6"/></svg>}
        </span>
        {/* Portal dropdown — stops propagation so it doesn't toggle the bar. */}
        <div className="cpv-portwrap" onClick={(e) => e.stopPropagation()}>
          <button className="cpv-port" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
            Portal <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: menuOpen ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {menuOpen && (
            <>
              <div className="cpv-menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="cpv-menu" role="menu">
                {dashboardHref && <button role="menuitem" onClick={() => { setMenuOpen(false); window.location.href = dashboardHref; }}>Dashboard</button>}
                <button role="menuitem" onClick={() => { setMenuOpen(false); onAdvanced?.(); }}>Advanced view</button>
              </div>
            </>
          )}
        </div>
      </div>
      {contact && contactOpen && (
        <div className="cpv-headdrop">
          <ProjectContactCard customer={contact} open flush />
        </div>
      )}

      <main className="cpv-main">
        {/* PROGRESS — immediately under the unified contact bar. */}
        {phases.length > 0 && (
          <section className="cpv-prog" aria-label="Project progress">
            <div className="cpv-track">
              {phases.map((p, i) => {
                const cur = p.key === currentPhaseKey;
                const done = p.unlocked && !cur;
                const fill = done ? 100 : cur ? 50 : 0;
                return (
                  <div key={p.key} className={`cpv-seg${done ? " done" : ""}${cur ? " cur" : ""}`}>
                    <div className="cpv-bar"><i style={{ width: fill + "%" }} /></div>
                    <div className="cpv-lab"><b>{done ? "✓" : i + 1}</b><span className="cpv-nm">{p.label}</span></div>
                  </div>
                );
              })}
            </div>
            {progressPct != null && <div className="cpv-readout">{progressPct}%</div>}
          </section>
        )}

        {/* STATUS hero — the current step + its one action. */}
        {appt ? (
          <section className="cpv-hero cpv-appt">
            <div className="cpv-kick">Upcoming appointment</div>
            <div className="cpv-appt-type">{apptType(appt)}</div>
            <div className="cpv-appt-when">{fmtDate(appt.date)}{appt.time ? ` · ${fmtTime(appt.time)}` : ""}</div>
            {appt.location && <div className="cpv-appt-where">{appt.location}</div>}
            <button className="cpv-cta" onClick={() => open("install")}>View appointment</button>
          </section>
        ) : status?.label ? (
          <section className="cpv-hero" style={{ "--tone": status.color || "var(--gold,#C9A96E)" }}>
            <div className="cpv-status">{status.label}</div>
            {primaryCta && <button className="cpv-cta" onClick={() => open(primaryCta.view, { sign: primaryCta.sign, reqsign: primaryCta.reqsign })}>{primaryCta.label}</button>}
          </section>
        ) : null}

        {/* PROJECT tools — grouped Customer / Internal (admin sees both via the toggle). */}
        {sections.length > 0 && (() => {
          const hasInternal = sections.some((s) => s.group === "internal");
          const hasCustomer = sections.some((s) => (s.group || "customer") === "customer");
          const showToggle = hasInternal && hasCustomer;
          const shown = showToggle ? sections.filter((s) => (s.group || "customer") === group) : sections;
          return (
            <section className="cpv-cards">
              <div className="cpv-kick-row">
                <span className="cpv-kick">Project</span>
                {showToggle && (
                  <div className="cpv-seg2" role="tablist">
                    <button role="tab" className={group === "customer" ? "on" : ""} onClick={() => setGroup("customer")}>Customer</button>
                    <button role="tab" className={group === "internal" ? "on" : ""} onClick={() => setGroup("internal")}>Internal</button>
                  </div>
                )}
              </div>
              <div className="cpv-cardgrid">
                {shown.map((c) => (
                  <button key={c.key} className={`cpv-card${c.locked ? " locked" : ""}`} disabled={c.locked} onClick={() => !c.locked && open(c.view || c.key, { sign: c.sign })}>
                    <div className="cpv-card-main">
                      <div className="cpv-card-title">{c.title}{c.done ? " ✓" : ""}</div>
                      <div className="cpv-card-sub">{c.locked ? (c.lockMsg || "Locked") : c.sub}</div>
                    </div>
                    <span className="cpv-card-act">
                      {c.locked
                        ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        : `${c.action || "Open"} →`}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })()}

        {/* BALANCE — at the very bottom. Hidden when there is no contract yet. */}
        {finance?.hasContract && (
          <section className="cpv-bal">
            <div className="cpv-kick">Project balance</div>
            {finance.paidInFull ? (
              <div className="cpv-paid">Paid in full ✓</div>
            ) : (
              <div className="cpv-balrows">
                <div><span>Total</span><b>{money(finance.total)}</b></div>
                <div><span>Paid</span><b>{money(finance.paid)}</b></div>
                <div className="cpv-balrem"><span>Remaining</span><b>{money(finance.balance)}</b></div>
              </div>
            )}
          </section>
        )}

      </main>

      {/* JOB LOG — full width of the page, collapsed by default (like the deck); click to expand. */}
      {log && (
        <section className="cpv-logsec">
          <button className="cpv-logtog" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Log
            <svg className="cpv-logchev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: logOpen ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {logOpen && <div className="cpv-logbody">{log}</div>}
        </section>
      )}

      {/* OVERLAY — focused full-screen; URL-addressable; Back/X returns to the hub. */}
      {activeView && (
        <div className={`cpv-ovl v-${activeView}`} role="dialog" aria-modal="true">
          <div className="cpv-ovl-bar">
            <span style={{ display: "inline-flex", alignItems: "baseline", minWidth: 0 }}>
              <span className="cpv-ovl-title">{activeTitle}</span>
              <span className="cpv-ovl-ctx">{String(accessId).slice(-4)}</span>
            </span>
            <button className="cpv-ovl-x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="cpv-ovl-body">
            {activeView === "install"
              ? <InstallDetail appt={appt} />
              : (renderOverlay ? renderOverlay(activeView) : null)}
          </div>
        </div>
      )}
    </div>
  );
}

function InstallDetail({ appt }) {
  if (!appt) return <div className="cpv-empty">No appointment scheduled yet. Schedule the install from the deck (full scheduling arrives here in Phase 2).</div>;
  return (
    <div className="cpv-install">
      <div className="cpv-kick">{apptType(appt)}</div>
      <div className="cpv-install-when">{fmtDate(appt.date)}{appt.time ? ` · ${fmtTime(appt.time)}` : ""}</div>
      {appt.location && <div className="cpv-install-row"><span>Location</span><b>{appt.location}</b></div>}
    </div>
  );
}
