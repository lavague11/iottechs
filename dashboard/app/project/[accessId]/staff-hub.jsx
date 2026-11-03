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
  sections = [], actions = [], primaryCta = null, renderOverlay, onRefresh, onExitHub, contact = null,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [contactOpen, setContactOpen] = useState(true);

  // URL drives the open overlay, exactly like the customer portal: ?view=<key>. Any section or rail action
  // that carries a `view` is openable (plus the synthetic `install` detail).
  const viewOf = (x) => x.view || x.key;
  const keys = new Set([...sections.map(viewOf), ...actions.map((a) => a.view).filter(Boolean), "install"]);
  const requested = (params.get("view") || "").toLowerCase();
  const activeView = requested && keys.has(requested) ? requested : null;
  const activeTitle = TITLES[activeView] || sections.find((s) => viewOf(s) === activeView)?.title || "Details";

  const open = (view, extra = {}) => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("open");
    sp.set("view", view);
    if (extra.sign) sp.set("sign", "1"); else sp.delete("sign");
    router.push(`${pathname}?${sp.toString()}`);
  };
  const close = () => {
    const sp = new URLSearchParams(params.toString());
    ["view", "open", "sign"].forEach((k) => sp.delete(k));
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
.cpv-collapse + .cpv-port{margin-left:8px}
`}</style>

      <header className="cpv-head">
        <div className="cpv-brand">
          <span className="cpv-mark">IOT TECHS</span>
          <span className="cpv-proj">{project?.contact_name || project?.customer || "Project"} · {String(accessId).slice(-4)}</span>
        </div>
        {contact && (
          <button className="cpv-collapse" onClick={() => setContactOpen((v) => !v)} aria-expanded={contactOpen} aria-label={contactOpen ? "Hide contact" : "Show contact"}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: contactOpen ? "none" : "rotate(180deg)" }}><path d="M18 15l-6-6-6 6"/></svg>
          </button>
        )}
        {/* Escape hatch — back to the classic stage deck (?classic=1). */}
        <button className="cpv-port" onClick={() => onExitHub?.()}>
          Deck
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </header>

      <main className="cpv-main">
        {contact && contactOpen && <ProjectContactCard customer={contact} open />}
        {/* HERO — appointment first; else the project status. One primary staff action. */}
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
            {primaryCta && <button className="cpv-cta" onClick={() => open(primaryCta.view, { sign: primaryCta.sign })}>{primaryCta.label}</button>}
          </section>
        ) : null}

        {/* ACTION RAIL — quick staff actions (record payment, schedule, call, email). */}
        {actions.length > 0 && (
          <section className="cpv-rail">
            {actions.map((a) => {
              const cls = `cpv-railbtn${a.tone ? ` ${a.tone}` : ""}`;
              const inner = <>{a.icon}{a.label}</>;
              if (a.href) return <a key={a.key} className={cls} href={a.href}>{inner}</a>;
              return <button key={a.key} className={cls} onClick={() => (a.view ? open(a.view) : a.onClick?.())}>{inner}</button>;
            })}
          </section>
        )}

        {/* PROGRESS — read-only rail, same as the portal. */}
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

        {/* BALANCE — canonical; hidden when there is no contract yet. Read-only in Phase 1. */}
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

        {/* CARDS — the staff sections; each opens the editable tool. */}
        {sections.length > 0 && (
          <section className="cpv-cards">
            <div className="cpv-kick">Project</div>
            {sections.map((c) => (
              <button key={c.key} className="cpv-card" onClick={() => open(c.view || c.key, { sign: c.sign })}>
                <div className="cpv-card-main">
                  <div className="cpv-card-title">{c.title}{c.done ? " ✓" : ""}</div>
                  {c.sub && <div className="cpv-card-sub">{c.sub}</div>}
                </div>
                <span className="cpv-card-act">{c.action || "Open"} →</span>
              </button>
            ))}
          </section>
        )}
      </main>

      {/* OVERLAY — focused full-screen; URL-addressable; Back/X returns to the hub. */}
      {activeView && (
        <div className={`cpv-ovl v-${activeView}`} role="dialog" aria-modal="true">
          <div className="cpv-ovl-bar">
            <span className="cpv-ovl-title">{activeTitle}</span>
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
