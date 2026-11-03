"use client";
// Customer Portal V2 — the simplified customer-facing project dashboard (behind CUSTOMER_PORTAL_V2).
// A clean status home: appointment / current status, a read-only 5-step progress bar, the balance, and a
// short list of ONLY the documents that apply — each opening as a focused, URL-addressable full-screen
// overlay (no stage deck). It renders instead of <DeckView> for customers; everything it shows comes from
// the canonical engines (passed in already-computed), and every overlay mounts the SAME customer component
// the deck uses (via the `renderOverlay` the gateway supplies) so there is zero duplicated business logic.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { portalCards, viewFromParams, payable, overlayAvailable } from "../../../lib/customer-portal";

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
  signedDate = null, renderOverlay, onRefresh, progressPct = null,
  previewRole = null, onPreviewRole, previewRoles = [], onLock, priceValidUntil = null, onRequestReopen,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);   // the "Portal" dropdown (staff previewing as a customer)

  // URL drives the open overlay: ?view=<key> (or a legacy ?open=…). ?sign carries the signer intent through.
  const requestedView = viewFromParams({ view: params.get("view"), open: params.get("open") });
  const signMode = params.get("sign") != null;
  // The URL selects a view; it NEVER overrides availability. A ?view the project can't meaningfully show
  // (payment with nothing due, survey with no survey, completion before eligibility, phone — a link not an
  // overlay) is treated as closed, and the effect below returns the customer to the portal home.
  const activeView = requestedView && overlayAvailable(requestedView, ctx, finance) ? requestedView : null;

  // Preserve every other query param (session/preview token, etc.) — only the overlay keys change, so a
  // refresh inside an overlay stays authorized and deep links keep working.
  const open = (view, extra = {}) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("open");
    sp.set("view", view);
    if (extra.sign) sp.set("sign", "1"); else sp.delete("sign");
    router.push(`${pathname}?${sp.toString()}`);
  };
  // Closing an overlay returns to the portal AND pulls fresh canonical state (balance/status/next action), so
  // a just-completed sign / payment / QC signoff / completion is reflected immediately, never stale.
  const close = () => {
    const sp = new URLSearchParams(params.toString());
    ["view", "open", "sign"].forEach((k) => sp.delete(k));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    onRefresh?.();
  };
  // A direct link to an unavailable/unknown/non-overlay view (incl. ?view=phone) → strip it and land on the
  // portal home. Never a blank overlay. Runs only when a view was requested but resolved unavailable.
  useEffect(() => {
    if (requestedView && !activeView) {
      const sp = new URLSearchParams(params.toString());
      ["view", "open", "sign"].forEach((k) => sp.delete(k));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [requestedView, activeView, params, pathname, router]);
  // Lock body scroll under an overlay.
  const scrollRef = useRef(0);
  useEffect(() => {
    if (activeView) { scrollRef.current = window.scrollY || 0; document.body.style.overflow = "hidden"; }
    else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [activeView]);

  const cards = portalCards(ctx, finance);
  let cta = status?.state ? STATUS_CTA[status.state] : null;
  // Defensive: never offer "Make Payment" in the hero unless money is actually collectible now (matches the
  // balance card). Guards the edge case where the status engine says payment-due but there is no billable
  // contract (e.g. a legacy project with install facts but no published proposal).
  if (cta?.view === "payment" && !payable(finance)) cta = null;

  return (
    <div className="cpv">
      <style>{CSS}</style>

      {/* Header — lean, same branding family as the rest of the app. */}
      <header className="cpv-head">
        <div className="cpv-brand">
          <span className="cpv-mark">IOT TECHS</span>
          <span className="cpv-proj">{project?.contact_name || project?.customer || "Your project"} · {String(accessId).slice(-4)}</span>
        </div>
        {previewRole ? (
          // Staff previewing as a customer: keep the Portal dropdown so they can switch role / exit the
          // preview — never a one-way trip into the customer gateway.
          <div className="cpv-portwrap">
            <button className="cpv-port" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}>
              Portal <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: menuOpen ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {menuOpen && (
              <>
                <div className="cpv-menu-scrim" onClick={() => setMenuOpen(false)} />
                <div className="cpv-menu" role="menu">
                  <button role="menuitem" onClick={() => { setMenuOpen(false); onPreviewRole?.(null); }}>Exit preview</button>
                  {previewRoles.length > 0 && <div className="cpv-menu-head">Preview as</div>}
                  {previewRoles.map((r) => (
                    <button key={r} role="menuitem" className={r === previewRole ? "on" : ""} onClick={() => { setMenuOpen(false); onPreviewRole?.(r); }}>{r[0].toUpperCase() + r.slice(1)}</button>
                  ))}
                  {onLock && <button role="menuitem" className="cpv-menu-lock" onClick={() => { setMenuOpen(false); onLock(); }}>Lock</button>}
                </div>
              </>
            )}
          </div>
        ) : (
          <a className="cpv-port" href="/my-projects">My projects</a>
        )}
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
            <div className="cpv-hero-top">
              <div className="cpv-status">{STATUS_HEADLINE[status.state] || status.label}</div>
              {priceValidUntil && <PriceValid until={priceValidUntil} onRequestReopen={onRequestReopen} />}
            </div>
            {cta && <button className="cpv-cta" onClick={() => open(cta.view, { sign: cta.sign })}>{cta.label}</button>}
          </section>
        ) : null}

        {/* PROGRESS — read-only, styled to match the staff deck rail (segmented underline bars + labels).
            Non-interactive: it answers "how far along am I", it is NOT navigation. */}
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
                {payable(finance) && <button className="cpv-cta" onClick={() => open("payment")}>Make payment</button>}
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
        <div className={`cpv-ovl v-${activeView}`} role="dialog" aria-modal="true">
          <div className="cpv-ovl-bar">
            <span className="cpv-ovl-title">{activeView === "payment" ? "Payment" : (CARD_COPY[activeView] || {}).title || "Details"}</span>
            <button className="cpv-ovl-x" onClick={close} aria-label="Close">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
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

// Price-lock countdown + info. The proposal price is honored for 7 days from issue; after that it may be
// re-evaluated. Shown beside the status headline while the proposal is unsigned.
function PriceValid({ until, onRequestReopen }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 864e5);
  const expired = days < 0;
  const text = expired ? "Price expired"
    : `Price valid · ${days > 1 ? `${days} days left` : days === 1 ? "1 day left" : "expires today"}`;
  async function reopen() {
    if (busy || !onRequestReopen) return;
    setBusy(true);
    try { const r = await onRequestReopen(); setSent(!r?.error); } catch { setSent(false); } finally { setBusy(false); }
  }
  return (
    <div className="cpv-pricewrap">
      <button className={`cpv-pricepill${expired ? " exp" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>{text}</span>
      </button>
      {open && (
        <>
          <div className="cpv-pricescrim" onClick={() => setOpen(false)} />
          <div className="cpv-pricepop" role="dialog">
            {expired ? (
              sent ? (
                <p>Thanks — your team has been notified and will refresh your quote. <button className="cpv-pricepop-ok" onClick={() => setOpen(false)}>Close</button></p>
              ) : (
                <>
                  <p>This price has <b>expired</b>. Equipment and supply costs change often, so your quote may need to be re-evaluated. Ask us to refresh it and we'll send an updated proposal.</p>
                  {onRequestReopen
                    ? <button className="cpv-pricepop-reopen" disabled={busy} onClick={reopen}>{busy ? "Sending…" : "Request to reopen"}</button>
                    : <button className="cpv-pricepop-ok" onClick={() => setOpen(false)}>Got it</button>}
                </>
              )
            ) : (
              <>
                <p>We can only hold this price for <b>7 days</b> from when your proposal is sent. Equipment and supply costs change often, so after that it may be re-evaluated — we recommend locking in your price as soon as possible.</p>
                <button className="cpv-pricepop-ok" onClick={() => setOpen(false)}>Got it</button>
              </>
            )}
          </div>
        </>
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
.cpv{--ink:#101418;--ink-soft:#3A4048;--meta:#787D84;--faint:#A1A6AC;--paper:#F4F4F2;--raise:#FBFBFA;--line:#E4E4DF;--line-soft:#EDEDE9;--gold:#C9A96E;--gold-deep:#A8842F;--gold-text:#8A6A1F;--green:#2E7D5B;
  position:fixed;inset:0;overflow-y:auto;background:#fff;color:var(--ink);font:15px/1.5 "Hanken Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif}
.cpv-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;background:rgba(255,255,255,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.cpv-brand{display:flex;flex-direction:column;min-width:0}
.cpv-mark{font-weight:800;letter-spacing:-.01em;font-size:14px;color:var(--ink)}
.cpv-proj{font-size:12.5px;color:var(--meta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-port{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:var(--ink-soft);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:7px 14px;white-space:nowrap;background:var(--raise);cursor:pointer;font-family:inherit}
.cpv-port:hover{border-color:var(--ink);color:var(--ink)}
.cpv-portwrap{position:relative}
.cpv-menu-scrim{position:fixed;inset:0;z-index:9}
.cpv-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:10;min-width:172px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 34px rgba(16,20,24,.14);padding:5px;display:flex;flex-direction:column;gap:1px}
.cpv-menu button{width:100%;text-align:left;background:none;border:0;border-radius:8px;padding:9px 11px;font:500 13px/1 inherit;color:var(--ink-soft);cursor:pointer}
.cpv-menu button:hover{background:var(--line-soft);color:var(--ink)}
.cpv-menu button.on{color:var(--ink);font-weight:700}
.cpv-menu-head{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);padding:8px 11px 4px}
.cpv-menu-lock{margin-top:3px;border-top:1px solid var(--line)!important;border-radius:0 0 8px 8px}
.cpv-main{max-width:640px;margin:0 auto;padding:20px 16px 90px;display:flex;flex-direction:column;gap:16px}
.cpv-kick{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--meta);margin-bottom:9px}
.cpv-hero{background:var(--raise);border:1px solid var(--line);border-left:3px solid var(--tone,var(--gold));border-radius:16px;padding:20px 22px}
.cpv-hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cpv-status{font-size:1.6rem;font-weight:750;letter-spacing:-.02em;color:var(--ink);text-wrap:balance}
.cpv-pricewrap{position:relative;flex:0 0 auto;margin-top:5px}
.cpv-pricepill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;font-family:inherit;font-size:12px;font-weight:600;color:var(--gold-text);white-space:nowrap;cursor:pointer}
.cpv-pricepill:hover{border-color:var(--gold)}
.cpv-pricepill svg{color:var(--meta);flex:0 0 auto}
.cpv-pricepill.exp{background:var(--red,#C4553D);border-color:var(--red,#C4553D);color:#fff}
.cpv-pricepill.exp svg{color:#fff}
.cpv-pricepill.exp:hover{background:#A6432F;border-color:#A6432F}
.cpv-pricescrim{position:fixed;inset:0;z-index:9}
.cpv-pricepop{position:absolute;top:calc(100% + 8px);right:0;z-index:10;width:min(300px,78vw);background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 38px rgba(16,20,24,.18);padding:14px 15px}
.cpv-pricepop p{margin:0 0 11px;font-size:13px;line-height:1.5;color:var(--ink-soft);font-weight:500;letter-spacing:0;text-transform:none}
.cpv-pricepop b{color:var(--ink);font-weight:700}
.cpv-pricepop-ok{background:var(--ink);color:#fff;border:0;border-radius:8px;padding:7px 15px;font:600 13px inherit;cursor:pointer}
.cpv-pricepop-reopen{background:var(--red,#C4553D);color:#fff;border:0;border-radius:8px;padding:9px 15px;font:700 13px inherit;cursor:pointer;width:100%}
.cpv-pricepop-reopen:hover{background:#A6432F}
.cpv-pricepop-reopen:disabled{opacity:.6;cursor:default}
.cpv-appt-type{font-size:1.35rem;font-weight:750;letter-spacing:-.02em;color:var(--ink)}
.cpv-appt-when{font-size:1.05rem;font-weight:600;color:var(--gold-text);margin-top:4px}
.cpv-appt-where{font-size:.95rem;color:var(--meta);margin-top:3px}
.cpv-cta{margin-top:16px;display:block;background:var(--gold);color:#1a1205;font-weight:700;font-size:15px;border:0;border-radius:11px;padding:13px 20px;cursor:pointer;width:100%;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.cpv-cta:hover{background:var(--gold-deep);color:#fff}
/* Progress — deck-rail style: segmented top bars + small uppercase labels + % readout. Read-only. */
.cpv-prog{display:flex;align-items:flex-end;gap:14px;padding:4px 6px 2px}
.cpv-track{flex:1;display:flex;gap:5px;align-items:flex-end;min-width:0}
.cpv-seg{flex:1;min-width:0;text-align:left;padding-top:6px}
.cpv-bar{height:2px;border-radius:99px;background:var(--line);overflow:hidden;position:relative}
.cpv-bar i{position:absolute;inset:0;width:0;border-radius:99px;background:var(--ink);transition:width .7s cubic-bezier(.16,1,.3,1)}
.cpv-seg.cur .cpv-bar i{background:var(--gold)}
.cpv-lab{margin-top:9px;display:flex;align-items:center;gap:6px;font-family:var(--font-mono),"JetBrains Mono",ui-monospace,monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpv-seg.done .cpv-lab{color:var(--ink-soft)}
.cpv-seg.cur .cpv-lab{color:var(--ink)}
.cpv-lab b{font-weight:700}
.cpv-readout{flex:0 0 auto;font-family:var(--font-mono),"JetBrains Mono",ui-monospace,monospace;font-size:15px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;padding-bottom:1px}
.cpv-bal{background:var(--raise);border:1px solid var(--line);border-radius:16px;padding:16px 20px}
.cpv-balrows{display:flex;flex-direction:column;gap:7px}
.cpv-balrows>div{display:flex;justify-content:space-between;font-size:15px;color:var(--ink-soft)}
.cpv-balrows b{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:700}
.cpv-balrem{border-top:1px solid var(--line);padding-top:9px;margin-top:2px;font-weight:700}
.cpv-balrem span{color:var(--ink)}
.cpv-balrem b{color:var(--gold-text)}
.cpv-paid{font-size:1.3rem;font-weight:700;color:var(--green)}
.cpv-cards{display:flex;flex-direction:column;gap:10px}
.cpv-card{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;background:var(--raise);border:1px solid var(--line);border-radius:14px;padding:15px 18px;cursor:pointer;color:inherit;font-family:inherit}
.cpv-card:hover{border-color:var(--ink);background:#fff}
.cpv-card-title{font-size:16px;font-weight:700;color:var(--ink)}
.cpv-card-sub{font-size:13px;color:var(--meta);margin-top:2px}
.cpv-card-act{color:var(--gold-text);font-weight:700;font-size:14px;white-space:nowrap}
.cpv-ovl{position:fixed;inset:0;z-index:40;background:#fff;display:flex;flex-direction:column}
.cpv-ovl-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.cpv-ovl-x{background:none;border:0;color:var(--ink-soft);cursor:pointer;display:flex;padding:4px;flex:0 0 auto}
.cpv-ovl-x:hover{color:var(--ink)}
.cpv-ovl-title{font-weight:700;color:var(--ink)}
.cpv-ovl-body{flex:1;overflow-y:auto;background:#fff}
/* The proposal reads like a document — give it a touch more size than the dense staff view. */
.cpv-ovl.v-proposal .cpv-ovl-body{font-size:16.5px;line-height:1.55}
.cpv-install{padding:22px 18px;max-width:640px;margin:0 auto}
.cpv-install-when{font-size:1.2rem;font-weight:700;color:var(--gold-text);margin-bottom:12px}
.cpv-install-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:15px;color:var(--ink-soft)}
.cpv-install-row b{color:var(--ink)}
.cpv-empty{padding:28px 18px;color:var(--meta);text-align:center}
`;
