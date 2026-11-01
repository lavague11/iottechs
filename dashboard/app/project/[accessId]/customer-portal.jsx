"use client";
// Customer Portal V2 — the simplified customer-facing project dashboard (behind CUSTOMER_PORTAL_V2).
// A clean status home: appointment / current status, a read-only 5-step progress bar, the balance, and a
// short list of ONLY the documents that apply — each opening as a focused, URL-addressable full-screen
// overlay (no stage deck). It renders instead of <DeckView> for customers; everything it shows comes from
// the canonical engines (passed in already-computed), and every overlay mounts the SAME customer component
// the deck uses (via the `renderOverlay` the gateway supplies) so there is zero duplicated business logic.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { portalCards, viewFromParams } from "../../../lib/customer-portal";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => { try { return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); } catch { return d; } };
const fmtTime = (t) => { try { const [h, m] = String(t).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1; return `${hh}:${String(m).padStart(2, "0")} ${ap}`; } catch { return t; } };

// Status enum → the one dominant portal CTA (label + which overlay it opens). States with no customer move
// fall through to no CTA (read-only hero).
const STATUS_CTA = {
  AWAITING_SURVEY_APPROVAL: { label: "Review Site Survey", view: "survey" },
  AWAITING_SIGNATURE:       { label: "Review & Sign Proposal", view: "proposal", sign: true },
  CHANGES_REQUESTED:        { label: "Review Proposal", view: "proposal" },
  AWAITING_DEPOSIT:         { label: "Pay Deposit", view: "payment" },
  AWAITING_FINAL_PAYMENT:   { label: "Make Payment", view: "payment" },
};

// Calm status headline for the hero (the action lives on the button, so the heading states the situation).
const STATUS_HEADLINE = {
  INTAKE: "Getting started",
  BUILD_SURVEY: "Site survey in progress",
  AWAITING_SURVEY_APPROVAL: "Review your site survey",
  CREATE_PROPOSAL: "Preparing your proposal",
  SEND_PROPOSAL: "Preparing your proposal",
  AWAITING_SIGNATURE: "Your proposal is ready",
  CHANGES_REQUESTED: "Changes requested",
  AWAITING_DEPOSIT: "Deposit due",
  READY_TO_SCHEDULE: "Ready to schedule",
  INSTALL_SCHEDULED: "Installation scheduled",
  INSTALL_IN_PROGRESS: "Installation in progress",
  AWAITING_FINAL_PAYMENT: "Final payment due",
  COMPLETE: "Project complete",
  CLOSED_NOT_COMPLETED: "Project closed",
};

const CARD_COPY = {
  survey:     { title: "Site Survey",   sub: "Your property walkthrough.",            action: "View" },
  mockup:     { title: "System Preview", sub: "See how your system will look.",       action: "View" },
  proposal:   { title: "Proposal",       sub: null,                                   action: "Review" },
  phone:      { title: "Phone Setup",    sub: "Set up mobile access before install.", action: "Start" },
  install:    { title: "Installation",   sub: null,                                   action: "View" },
  closeout:   { title: "Closeout",       sub: "Review and sign off the completed work.", action: "Review" },
  completion: { title: "Completion",     sub: "Your project is complete.",            action: "Certificate" },
};

export default function CustomerPortal({
  accessId, project, status, finance, appt, phases = [], currentPhaseKey, ctx = {},
  signedDate = null, renderOverlay,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // URL drives the open overlay: ?view=<key> (or a legacy ?open=…). ?sign carries the signer intent through.
  const activeView = viewFromParams({ view: params.get("view"), open: params.get("open") });
  const signMode = params.get("sign") != null || String(params.get("open")) === "proposal" && params.get("sign") != null;

  const open = (view, extra = {}) => {
    const sp = new URLSearchParams();
    sp.set("view", view);
    if (extra.sign) sp.set("sign", "1");
    router.push(`${pathname}?${sp.toString()}`);
  };
  const close = () => router.replace(pathname);
  // Lock body scroll under an overlay.
  const scrollRef = useRef(0);
  useEffect(() => {
    if (activeView) { scrollRef.current = window.scrollY || 0; document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [activeView]);

  const cards = portalCards(ctx);
  const cta = status?.state ? STATUS_CTA[status.state] : null;

  return (
    <div className="cpv">
      <style>{CSS}</style>

      {/* Header — lean, same branding family as the rest of the app. */}
      <header className="cpv-head">
        <div className="cpv-brand">
          <span className="cpv-mark">IOT TECHS</span>
          <span className="cpv-proj">{project?.contact_name || project?.customer || "Your project"} · {String(accessId).slice(-4)}</span>
        </div>
        <a className="cpv-port" href="/my-projects">My projects</a>
      </header>

      <main className="cpv-main">
        {/* HERO — upcoming appointment first; else current status. One dominant CTA. */}
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
            <div className="cpv-kick">Current status</div>
            <div className="cpv-status">{STATUS_HEADLINE[status.state] || status.label}</div>
            {cta && <button className="cpv-cta" onClick={() => open(cta.view, { sign: cta.sign })}>{cta.label}</button>}
          </section>
        ) : null}

        {/* PROGRESS — read-only 5 steps. Not navigation. */}
        {phases.length > 0 && (
          <section className="cpv-prog" aria-label="Project progress">
            {phases.map((p) => {
              const cur = p.key === currentPhaseKey;
              const done = p.unlocked && !cur;
              return (
                <div key={p.key} className={`cpv-step${cur ? " cur" : done ? " done" : " future"}`}>
                  <span className="cpv-dot">{done ? "✓" : ""}</span>
                  <span className="cpv-slabel">{p.label}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* BALANCE — canonical; hidden entirely when there is no contract yet. */}
        {finance?.hasContract && (
          <section className="cpv-bal">
            <div className="cpv-kick">Project balance</div>
            {finance.paidInFull ? (
              <div className="cpv-paid">Paid in full ✓</div>
            ) : (
              <>
                <div className="cpv-balrows">
                  <div><span>Total</span><b>{money(finance.total)}</b></div>
                  <div><span>Paid</span><b>{money(finance.paid)}</b></div>
                  <div className="cpv-balrem"><span>Remaining</span><b>{money(finance.balance)}</b></div>
                </div>
                {finance.balance > 0 && <button className="cpv-cta" onClick={() => open("payment")}>Make payment</button>}
              </>
            )}
          </section>
        )}

        {/* CARDS — only what applies. */}
        {cards.length > 0 && (
          <section className="cpv-cards">
            <div className="cpv-kick">Your project</div>
            {cards.map((c) => {
              const copy = CARD_COPY[c.key] || { title: c.key, action: "View" };
              const sub = c.key === "proposal" ? proposalSub(c.state, signedDate)
                : c.key === "install" ? installSub(c.state, appt) : copy.sub;
              const onClick = c.key === "phone"
                ? () => { window.location.href = `/guide/mobile-setup?project=${accessId}`; }
                : () => open(c.view, { sign: c.key === "proposal" && c.state === "awaiting" });
              return (
                <button key={c.key} className="cpv-card" onClick={onClick}>
                  <div className="cpv-card-main">
                    <div className="cpv-card-title">{copy.title}{c.key === "proposal" && c.state === "signed" ? " ✓" : ""}</div>
                    {sub && <div className="cpv-card-sub">{sub}</div>}
                  </div>
                  <span className="cpv-card-act">{c.key === "proposal" && c.state === "signed" ? "View" : copy.action} →</span>
                </button>
              );
            })}
          </section>
        )}
      </main>

      {/* OVERLAY — focused full-screen; URL-addressable; Back/X returns to the portal. */}
      {activeView && (
        <div className="cpv-ovl" role="dialog" aria-modal="true">
          <div className="cpv-ovl-bar">
            <button className="cpv-ovl-x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <span className="cpv-ovl-title">{activeView === "payment" ? "Payment" : (CARD_COPY[activeView] || {}).title || "Details"}</span>
          </div>
          <div className="cpv-ovl-body">
            {activeView === "install"
              ? <InstallDetail appt={appt} />
              : (renderOverlay ? renderOverlay(activeView, { sign: signMode }) : null)}
          </div>
        </div>
      )}
    </div>
  );
}

function InstallDetail({ appt }) {
  if (!appt) return <div className="cpv-empty">No appointment scheduled yet. Your team will be in touch to set a date.</div>;
  return (
    <div className="cpv-install">
      <div className="cpv-kick">{apptType(appt)}</div>
      <div className="cpv-install-when">{fmtDate(appt.date)}{appt.time ? ` · ${fmtTime(appt.time)}` : ""}</div>
      {appt.location && <div className="cpv-install-row"><span>Location</span><b>{appt.location}</b></div>}
      {appt.notes && <div className="cpv-install-notes">{appt.notes}</div>}
    </div>
  );
}

function apptType(appt) {
  if (appt?.kind === "install" || /install/i.test(appt?.title || "")) return "Installation";
  if (appt?.kind === "survey" || /survey/i.test(appt?.title || "")) return "Site Survey";
  return appt?.title || "Appointment";
}
function proposalSub(state, signedDate) {
  if (state === "signed") return signedDate ? `Signed ${fmtDate(String(signedDate).slice(0, 10))}` : "Signed";
  if (state === "awaiting") return "Review and sign your proposal.";
  return "Your proposal is ready.";
}
function installSub(state, appt) {
  if (state === "complete") return "Installation complete.";
  if (state === "in_progress") return "Installation in progress.";
  if (state === "scheduled") return appt ? `Scheduled ${fmtDate(appt.date)}` : "Scheduled.";
  return "Awaiting scheduling.";
}

const CSS = `
.cpv{position:fixed;inset:0;overflow-y:auto;background:#0b0e11;color:#e9ecf2;font:15px/1.5 "Hanken Grotesk",system-ui,-apple-system,sans-serif}
.cpv-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:rgba(10,13,17,.86);backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.08)}
.cpv-brand{display:flex;flex-direction:column;min-width:0}
.cpv-mark{font-weight:800;letter-spacing:.08em;font-size:13px;color:var(--gold,#C9A96E)}
.cpv-proj{font-size:12.5px;color:#9aa3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-port{font-size:13px;color:#cfd4dd;text-decoration:none;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:6px 12px;white-space:nowrap}
.cpv-main{max-width:620px;margin:0 auto;padding:18px 16px 80px;display:flex;flex-direction:column;gap:16px}
.cpv-kick{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b93a4;margin-bottom:8px}
.cpv-hero{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-left:3px solid var(--tone,var(--gold,#C9A96E));border-radius:16px;padding:18px 20px}
.cpv-status{font-size:1.5rem;font-weight:700;letter-spacing:-.01em;color:#f2f4f8}
.cpv-appt-type{font-size:1.3rem;font-weight:700;color:#f2f4f8}
.cpv-appt-when{font-size:1.05rem;color:#e8c061;margin-top:3px}
.cpv-appt-where{font-size:.95rem;color:#9aa3b2;margin-top:3px}
.cpv-cta{margin-top:14px;display:inline-block;background:var(--gold,#C9A96E);color:#101418;font-weight:700;font-size:15px;border:0;border-radius:11px;padding:12px 20px;cursor:pointer;width:100%}
.cpv-cta:hover{filter:brightness(1.06)}
.cpv-prog{display:flex;align-items:flex-start;justify-content:space-between;gap:4px;padding:6px 4px}
.cpv-step{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;position:relative}
.cpv-step:not(:last-child)::after{content:"";position:absolute;top:9px;left:calc(50% + 12px);right:calc(-50% + 12px);height:2px;background:rgba(255,255,255,.12)}
.cpv-step.done:not(:last-child)::after{background:var(--gold,#C9A96E)}
.cpv-dot{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;background:rgba(255,255,255,.12);color:#0b0e11;z-index:1}
.cpv-step.done .cpv-dot{background:var(--gold,#C9A96E)}
.cpv-step.cur .cpv-dot{background:#e8c061;box-shadow:0 0 0 4px rgba(201,169,110,.25)}
.cpv-slabel{font-size:11px;color:#8b93a4}
.cpv-step.cur .cpv-slabel{color:#f2f4f8;font-weight:700}
.cpv-bal{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px 20px}
.cpv-balrows{display:flex;flex-direction:column;gap:7px}
.cpv-balrows>div{display:flex;justify-content:space-between;font-size:15px;color:#c7cdd8}
.cpv-balrows b{font-variant-numeric:tabular-nums;color:#f2f4f8}
.cpv-balrem{border-top:1px solid rgba(255,255,255,.1);padding-top:8px;margin-top:2px;font-weight:700}
.cpv-balrem b{color:#e8c061}
.cpv-paid{font-size:1.3rem;font-weight:700;color:#5dc47f}
.cpv-cards{display:flex;flex-direction:column;gap:10px}
.cpv-card{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:15px 18px;cursor:pointer;color:inherit;font-family:inherit}
.cpv-card:hover{background:rgba(255,255,255,.07)}
.cpv-card-title{font-size:16px;font-weight:700;color:#f2f4f8}
.cpv-card-sub{font-size:13px;color:#9aa3b2;margin-top:2px}
.cpv-card-act{color:var(--gold,#C9A96E);font-weight:700;font-size:14px;white-space:nowrap}
.cpv-ovl{position:fixed;inset:0;z-index:40;background:#0b0e11;display:flex;flex-direction:column}
.cpv-ovl-bar{position:sticky;top:0;display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(10,13,17,.92);border-bottom:1px solid rgba(255,255,255,.08)}
.cpv-ovl-x{background:none;border:0;color:#cfd4dd;cursor:pointer;display:flex;padding:4px}
.cpv-ovl-title{font-weight:700;color:#f2f4f8}
.cpv-ovl-body{flex:1;overflow-y:auto}
.cpv-install{padding:22px 18px;max-width:620px;margin:0 auto}
.cpv-install-when{font-size:1.2rem;font-weight:700;color:#e8c061;margin-bottom:12px}
.cpv-install-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08);font-size:15px}
.cpv-install-row b{color:#f2f4f8}
.cpv-install-notes{margin-top:12px;color:#c7cdd8;white-space:pre-wrap}
.cpv-empty{padding:28px 18px;color:#9aa3b2;text-align:center}
`;
