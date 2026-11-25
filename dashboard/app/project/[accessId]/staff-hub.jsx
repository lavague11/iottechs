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
import PortalHeader from "./portal-header";
import PortalBalance from "./portal-balance";
import PortalLog from "./portal-log";
import { getSignatureScheduleAction, requestSignatureEmailAction, cancelSignatureEmailAction } from "./proposal-actions";
import ScheduledSendBanner from "./scheduled-send-banner";
import RequestSignatureSheet from "./request-signature-sheet";
import { useContextMenu, ContextMenu } from "../../components/context-menu";
import { projectGroups, hasGroupToggle } from "../../../lib/roles";


const fmtDate = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); } catch { return d; } };
const fmtTime = (t) => { try { const [h, m] = String(t).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; } catch { return t; } };
const apptType = (a) => (a?.kind === "install" || /install/i.test(a?.title || "")) ? "Installation" : (a?.kind === "survey" || /survey/i.test(a?.title || "")) ? "Site Survey" : (a?.title || "Appointment");

const TITLES = { install: "Installation", schedule: "Scheduling", workorder: "Work Order", expenses: "Expenses", systemqr: "System QR" };
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
// fmtDate above takes a DATE ("2026-11-20"); a DB timestamp is "2026-11-20 06:04:59" and parsing that
// as `${d}T00:00:00` yields Invalid Date. Take the date part of either shape.
const fmtStamp = (d) => {
  const m = String(d || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? fmtDate(m[1]) : "";
};

export default function StaffHub({
  accessId, project, status, finance, appt, phases = [], currentPhaseKey, progressPct = null,
  budget = null, doneNote = null,
  sections = [], actions = [], primaryCta = null, onPrimaryAction = null, renderOverlay, onRefresh, onAdvanced, dashboardHref = null, contact = null, log = null, defaultGroup = "customer",
  onDemo = null, demoBusy = false,
  role = "", signOptionId = "", onStageJump = null,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [group, setGroup] = useState(defaultGroup);   // Project-tools filter: Customer-facing vs Internal (techs default to Internal)
  const [reqSignOpen, setReqSignOpen] = useState(false); // staff Request-Signature share sheet (opens here, not the proposal page)
  const [sigSched, setSigSched] = useState(null);        // scheduled signature email { scheduledSendAt } | null
  const [sigBusy, setSigBusy] = useState(false);
  // Right-click / long-press a stage step (Consulting · Install · Completion) to jump the project there.
  // Admin/manager only; moving BACKWARD confirms; the gateway maps the step → master stage and logs it.
  const stageMenu = useContextMenu();
  const canMoveStage = ["admin", "manager"].includes(role) && typeof onStageJump === "function";
  const STEP_ORDER = ["consulting", "install", "completion"];
  const doStageJump = (p) => {
    const ci = STEP_ORDER.indexOf(currentPhaseKey), ti = STEP_ORDER.indexOf(p.key);
    if (ti < 0) return;
    if (ti < ci && !window.confirm(`Move this project back to ${p.label}? Earlier steps will show as current again.`)) return;
    onStageJump?.(p.key);
  };

  // A scheduled signature-request email surfaces right on the hero (not only inside the share sheet), with
  // Edit · Send now · Cancel. Re-read whenever the share sheet closes so the line reflects any change.
  const awaitingSig = !!primaryCta?.inlineSign;
  useEffect(() => {
    if (!accessId || !awaitingSig) { setSigSched(null); return; }
    let live = true;
    getSignatureScheduleAction(accessId).then((r) => { if (live) setSigSched(r?.ok && r.scheduledSendAt ? r : null); }).catch(() => {});
    return () => { live = false; };
  }, [accessId, awaitingSig, reqSignOpen]);
  async function sigSendNow() {
    if (sigBusy) return; setSigBusy(true);
    await requestSignatureEmailAction(accessId, signOptionId).catch(() => null);
    setSigBusy(false); setSigSched(null); onRefresh?.();
  }
  async function sigCancel() {
    if (sigBusy) return; setSigBusy(true);
    await cancelSignatureEmailAction(accessId).catch(() => null);
    setSigBusy(false); setSigSched(null);
  }

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
  // The project/business name — shown centered in BOTH the hub header and every overlay bar, so the bar
  // reads consistently throughout (tool on the left, the project in the middle) instead of just "Tool · id".
  const projName = contact?.businessName || project?.contact_name || project?.customer || "Project";

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
/* The technician's own money — their payout for this job, their expenses, what is left. Three
   figures on one row, tabular so they line up; red only when the job has gone over. */
.cpv-budget{border:1px solid var(--line);border-radius:14px;padding:14px 18px;background:var(--raise)}
.cpv-budget-row{display:flex;gap:26px;flex-wrap:wrap;margin-top:8px}
.cpv-budget-row>div{display:flex;flex-direction:column;gap:2px}
.cpv-budget-row span{font-size:12px;color:var(--meta)}
.cpv-budget-row b{font-size:19px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.cpv-budget-row>div.over b{color:var(--red,#C4553D)}
.cpv-budget-note{margin-top:8px;font-size:12px;color:var(--meta)}
/* The field's end state. */
.cpv-donenote{display:flex;align-items:center;gap:8px;padding:13px 18px;border:1px solid #bfe0cd;border-radius:14px;background:#f6fbf8;color:var(--green);font-size:14px}
.cpv-donenote span{color:var(--meta);font-weight:600}
.cpv-rail{display:flex;flex-wrap:wrap;gap:8px}
.cpv-railbtn{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:1px solid var(--line);border-radius:10px;background:var(--raise);color:var(--ink);font:700 13.5px/1 inherit;text-decoration:none;cursor:pointer}
.cpv-railbtn:hover{border-color:var(--ink);background:#fff}
.cpv-railbtn svg{width:16px;height:16px;flex:0 0 auto}
.cpv-railbtn.pay{border-color:#bfe0cd;background:#f6fbf8;color:var(--green)}
.cpv-railbtn.pay:hover{border-color:var(--green)}
.cpv-collapse{margin-left:auto;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:999px;background:var(--raise);color:var(--meta);cursor:pointer}
.cpv-collapse:hover{border-color:var(--ink);color:var(--ink)}
.cpv-collapse + .cpv-portwrap{margin-left:8px}
/* The row itself is the shared ScheduledSendBanner; the hero only sets its spacing. */
.ssb.cpv-sig-sched{margin-top:12px}
.cpv-seg.movable{cursor:context-menu}
/* Phase 3 — frame every tool overlay as a calm page: a soft tint behind the tool's white cards,
   a slightly stronger title bar, and the project id for context. */
.cpv-ovl-body{background:var(--paper)}
/* Survey / planner tool fills the whole overlay height (match the deck), instead of a fixed ~382px slab.
   The System Planner must own a real height first, or the survey frame's flex:1 collapses to 1px (the
   canvas vanishes): make .syp fill the overlay and its active plan pane flex to fill between the floor
   bar and the nav footer. */
.cpv-ovl-body .syp{height:100%;min-height:0}
.cpv-ovl-body .syp-plan{flex:1 1 0;min-height:0;display:flex;flex-direction:column}
.cpv-ovl-body .syp-plan>.ss-tool-col{flex:1 1 0;min-height:0;display:flex!important;flex-direction:column;height:auto}
.cpv-ovl-body .ss-tool-col>.ss-tool-body{flex:1 1 0;min-height:0;display:flex!important;flex-direction:column}
.cpv-ovl-body .ss-tool-body>.ss-embed{flex:1 1 0;min-height:0;height:auto;display:flex;flex-direction:column}
.cpv-ovl-body .ss-tool-body .ss-embed-frame{flex:1 1 0;min-height:0;height:auto!important}
/* Overlay bar — consistent with the hub header: tool name LEFT, project name CENTERED, X RIGHT. */
/* fit-content() on the centre track, not a bare auto. An auto (or minmax(0,auto)) track takes its
   MAX-content width, so a long project name ("[JOURNEY-TEST] Maple Street Market") overflowed the
   grid and painted straight over the tool name on the left — measured at 72px of overlap on a 375px
   screen, with the name's own ellipsis never engaging because the track had grown to fit it rather
   than constraining it. fit-content(52%) caps the track, so the ellipsis finally does its job. */
.cpv-ovl-bar{display:grid;grid-template-columns:minmax(0,1fr) fit-content(52%) minmax(0,1fr);gap:10px;box-shadow:0 1px 0 rgba(16,20,24,.03)}
.cpv-ovl-tool{justify-self:start;min-width:0;font-weight:700;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-ovl-proj{justify-self:center;min-width:0;max-width:100%;overflow:hidden;display:inline-flex;align-items:baseline;gap:7px}
.cpv-ovl-projname{min-width:0;font-weight:800;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-ovl-ctx{font-size:12px;font-weight:600;color:var(--meta);font-family:var(--font-mono),ui-monospace,monospace;flex:0 0 auto}
.cpv-ovl-x{justify-self:end}
/* Redesign — full-width desktop, centered clickable title, progress under contact, grouped tools, balance last. */
.cpv-main{max-width:1040px;padding-bottom:8px}   /* no dead gap before the Log; the balance/payments bubble owns its own spacing */
.cpv-kick-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.cpv-kick-row .cpv-kick{margin-bottom:0}
.cpv-seg2{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--raise)}
.cpv-seg2 button{border:0;background:none;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.01em;padding:6px 15px;color:var(--meta);cursor:pointer}
.cpv-seg2 button.on{background:var(--ink);color:#fff}
.cpv-cardgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
/* Unified header bar — the whole bar is clickable and drops down the full contact details. */
/* Locked tool cards — visible but gated until their prerequisite is met. */
.cpv-card.locked{opacity:.6;cursor:default;background:var(--paper)}
.cpv-card.locked:hover{border-color:var(--line);background:var(--paper)}
.cpv-card.locked .cpv-card-act{color:var(--faint)}
/* Footer credit — full width, centered, clears the corner orbs (AI left, bug right). */
.cpv-credit{padding:14px 72px 26px;text-align:center;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--faint);border-top:1px solid var(--line-soft)}
.cpv-card-act.done{color:var(--green)}
`}</style>

      <PortalHeader accessId={accessId} projName={projName} contact={contact} brandHref={dashboardHref || "/dashboard"} brandLabel="Dashboard">
        <button className="cpv-port" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
          Portal <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: menuOpen ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {menuOpen && (
          <>
            <div className="cpv-menu-scrim" onClick={() => setMenuOpen(false)} />
            <div className="cpv-menu" role="menu">
              {dashboardHref && <button role="menuitem" onClick={() => { setMenuOpen(false); window.location.href = dashboardHref; }}>Dashboard</button>}
              {/* Admin only — makes a throwaway copy of this project and opens it, where every role can be
                  walked through for real. The host passes onDemo only when the viewer is an admin. */}
              {onDemo && <button role="menuitem" disabled={demoBusy} onClick={() => { setMenuOpen(false); onDemo(); }}>{demoBusy ? "Working…" : "Demo"}</button>}
            </div>
          </>
        )}
      </PortalHeader>

      <main className="cpv-main">
        {/* PROGRESS — immediately under the unified contact bar. */}
        {phases.length > 0 && (
          <section className="cpv-prog" aria-label="Project progress">
            <div className="cpv-track">
              {phases.map((p, i) => {
                // Fill flows across the segments from the overall percent, so the bar lines up exactly with
                // the readout (bug #83). Falls back to the stage pointer only if no percent was supplied.
                const span = 100 / phases.length;
                const fill = progressPct == null
                  ? (p.unlocked && p.key !== currentPhaseKey ? 100 : p.key === currentPhaseKey ? 50 : 0)
                  : Math.max(0, Math.min(100, (progressPct - i * span) / span * 100));
                const done = fill >= 100;
                const cur = fill > 0 && fill < 100;
                return (
                  <div key={p.key} className={`cpv-seg${done ? " done" : ""}${cur ? " cur" : ""}${canMoveStage ? " movable" : ""}`}
                    {...(canMoveStage ? stageMenu.triggerProps : {})}
                    title={canMoveStage ? "Right-click to move stage" : undefined}>
                    <div className="cpv-bar"><i style={{ width: fill + "%" }} /></div>
                    <div className="cpv-lab"><b>{done ? "✓" : i + 1}</b><span className="cpv-nm">{p.label}</span></div>
                  </div>
                );
              })}
            </div>
            {progressPct != null && <div className="cpv-readout">{progressPct}%</div>}
            {canMoveStage && (
              <ContextMenu open={stageMenu.open} point={stageMenu.point} onClose={stageMenu.close} title="Move stage"
                items={phases.map((p) => ({ label: `Move to ${p.label}`, checked: p.key === currentPhaseKey, onClick: () => doStageJump(p) }))} />
            )}
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
            {primaryCta && <button className="cpv-cta" onClick={() => primaryCta.inlineSign ? setReqSignOpen(true) : primaryCta.action ? onPrimaryAction?.(primaryCta.action) : open(primaryCta.view, { sign: primaryCta.sign, reqsign: primaryCta.reqsign })}>{primaryCta.label}</button>}
            {awaitingSig && (
              <ScheduledSendBanner at={sigSched?.scheduledSendAt} label="Signature email" busy={sigBusy} className="cpv-sig-sched"
                onEdit={() => setReqSignOpen(true)} onSendNow={sigSendNow} onCancel={sigCancel} />
            )}
          </section>
        ) : null}

        {/* ACTION RAIL — the quick moves that are not tools: call the site, open the activation QR,
            download the work order PDF, record a payment. This prop was accepted and its CSS written
            when the hub was built, but nothing ever rendered it, so every rail button the gateway
            computed — Call, Schedule, Record Payment — has been invisible since. The technician's
            "Work Order PDF" is the one that has to be reachable at every stage, which is what
            surfaced it. Each entry is a link, an overlay or a callback; a `tone` tints it. */}
        {actions.length > 0 && (
          <section className="cpv-rail" aria-label="Actions">
            {actions.map((a) => {
              const inner = <>{a.icon}{a.label}</>;
              const cls = `cpv-railbtn${a.tone ? " " + a.tone : ""}`;
              if (a.href) return <a key={a.key} className={cls} href={a.href}>{inner}</a>;
              return <button key={a.key} type="button" className={cls}
                onClick={() => (a.onClick ? a.onClick() : a.view ? open(a.view) : null)}>{inner}</button>;
            })}
          </section>
        )}

        {/* PROJECT tools — grouped Customer / Internal (admin sees both via the toggle). */}
        {sections.length > 0 && (() => {
          // What this ROLE may see decides the cards; what it HAS decides whether a toggle renders.
          // Both come from roles.js, so a tech can never be handed a Customer tab onto the client's
          // proposal. The old rule keyed off which groups happened to have cards, so whenever one half
          // was empty it fell through to showing EVERY card to everyone.
          const allowed = projectGroups(role);
          const mine = sections.filter((s) => allowed.includes(s.group || "customer"));
          const hasInternal = mine.some((s) => s.group === "internal");
          const hasCustomer = mine.some((s) => (s.group || "customer") === "customer");
          const showToggle = hasGroupToggle(role) && hasInternal && hasCustomer;
          // Locked tools (prerequisite not met yet) are hidden entirely, not shown greyed.
          const shown = (showToggle ? mine.filter((s) => (s.group || "customer") === group) : mine).filter((s) => !s.locked);
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
                {shown.map((c) => {
                  // `action: null` = there is genuinely nothing to press yet (a technician whose work
                  // order the office has not issued). It renders as a plain card, not a disabled
                  // button with an "Open →" that leads nowhere.
                  const inert = c.action === null;
                  const body = (
                    <>
                      <div className="cpv-card-main">
                        <div className="cpv-card-title">{c.title}{c.done && <svg className="cpv-card-ck" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Done" style={{ marginLeft: 6, verticalAlign: "-2px", color: "var(--green)" }}><path d="M20 6 9 17l-5-5"/></svg>}</div>
                        <div className="cpv-card-sub">{c.locked ? (c.lockMsg || "Locked") : c.sub}</div>
                      </div>
                      {!inert && (
                        <span className={`cpv-card-act${c.done ? " done" : ""}`}>
                          {c.locked
                            ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            : c.done ? (c.action || "View") : `${c.action || "Open"} →`}
                        </span>
                      )}
                    </>
                  );
                  return inert
                    ? <div key={c.key} className="cpv-card inert">{body}</div>
                    : <button key={c.key} className={`cpv-card${c.locked ? " locked" : ""}`} disabled={c.locked} onClick={() => !c.locked && open(c.view || c.key, { sign: c.sign })}>{body}</button>;
                })}
              </div>
            </section>
          );
        })()}

        {/* BALANCE + payment ledger — hidden until there is a contract, and never passed for a
            technician (page.jsx does not even compute the figures for one). */}
        <PortalBalance accessId={accessId} finance={finance} staff />

        {/* THE TECH'S OWN BUDGET — their payout for this job, their expenses, what is left. Renders
            only when the server said there is an honest number: paid per job, payouts visible on
            this work order, and a budget actually set. Never a $0 card. */}
        {budget?.show && (
          <section className="cpv-budget" aria-label="Job budget">
            <div className="cpv-kick">Job budget</div>
            <div className="cpv-budget-row">
              <div><span>Budget</span><b>{money(budget.budget)}</b></div>
              <div><span>Expenses</span><b>{money(budget.spent)}</b></div>
              <div className={budget.remaining < 0 ? "over" : ""}><span>Remaining</span><b>{money(budget.remaining)}</b></div>
            </div>
            {budget.pending > 0 && <div className="cpv-budget-note">{budget.pending} awaiting approval</div>}
          </section>
        )}

        {/* JOB COMPLETE — the DATE and the sign-off. The words "Job complete" are already the hero
            above it, so the note carries only what the hero does not. */}
        {doneNote && (doneNote.at || doneNote.by) && (
          <section className="cpv-donenote">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
            {doneNote.at && <b>{fmtStamp(doneNote.at)}</b>}
            {doneNote.by && <span>Signed off by {doneNote.by}</span>}
          </section>
        )}

        {reqSignOpen && (
          <RequestSignatureSheet accessId={accessId} optionId={signOptionId} role={role}
            onClose={() => setReqSignOpen(false)} onDone={() => { setReqSignOpen(false); onRefresh?.(); }} />
        )}

      </main>

      {/* JOB LOG — full width, collapsed by default; click to expand. */}
      <PortalLog log={log} />

      {/* Footer credit — very bottom, full width. */}
      <footer className="cpv-credit">Developed by Mpress 2026</footer>

      {/* OVERLAY — focused full-screen; URL-addressable; Back/X returns to the hub. */}
      {activeView && (
        <div className={`cpv-ovl v-${activeView}`} role="dialog" aria-modal="true">
          <div className="cpv-ovl-bar">
            <span className="cpv-ovl-tool">{activeTitle}</span>
            <span className="cpv-ovl-proj">
              <span className="cpv-ovl-projname">{projName}</span>
              <span className="cpv-ovl-ctx">{String(accessId).slice(-4)}</span>
            </span>
            <button className="cpv-ovl-x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="cpv-ovl-body">
            {activeView === "install"
              ? <InstallDetail appt={appt} />
              : (renderOverlay ? renderOverlay(activeView, close) : null)}
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
