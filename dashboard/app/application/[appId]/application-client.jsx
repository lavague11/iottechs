"use client";

import { useState } from "react";
import { Wordmark } from "../../components/brand";

// Applicant status page — same shape as the project page the customers see: hero, stage strip,
// collapsible cards, timeline. This is what "apply, then watch where it stands" looks like.
const STEPS = [
  { key: "applied",   label: "Applied",   stages: ["applied"] },
  { key: "reviewing", label: "In review", stages: ["reviewing"] },
  { key: "interview", label: "Interview", stages: ["interview"] },
  { key: "decision",  label: "Decision",  stages: ["offer", "hired", "declined"] },
];
const EVENT_ICON = { applied: "📋", stage: "→", interview: "🗓", offer: "✉", hired: "✓", declined: "•", onboarding: "☑", note: "✎" };
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : ""; }

function Card({ title, chip, children, open: initial = true }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={`aq-card${open ? " open" : ""}`}>
      <button className="aq-card-h" onClick={() => setOpen((v) => !v)}>
        <span className="aq-card-t">{title}</span>
        {chip && <span className="aq-chip">{chip}</span>}
        <svg className="aq-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      {open && <div className="aq-card-b">{children}</div>}
    </div>
  );
}

export default function ApplicationClient({ app, events = [], staff, viewerName }) {
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.stages.includes(app.stage)));
  const first = (viewerName || app.name || "").trim().split(/\s+/)[0];
  const hired = app.stage === "hired";
  const declined = app.stage === "declined";
  const ob = app.onboarding || {};
  const obItems = [
    ["w9", "W-9 on file"], ["license", "Driver's license copy"], ["insurance", "Insurance / eligibility"],
    ["background", "Background check"], ["gear", "Tools & equipment issued"], ["training", "Safety + systems training"],
  ];

  const headline = hired ? `Welcome aboard${first ? `, ${first}` : ""}.`
    : declined ? `Thanks for applying${first ? `, ${first}` : ""}.`
    : `Hi ${first || "there"} — here's where your application stands.`;

  return (
    <div className="aq-root">
      <header className="aq-top">
        <a href="/" className="aq-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
        <div className="aq-top-right">
          <span className="aq-id mono">{app.app_id}</span>
          <a href="/" className="aq-exit">Home</a>
        </div>
      </header>

      <main className="aq-main">
        <div className="aq-hero">
          <div className="aq-hero-tag">{app.position_label}</div>
          <h1>{headline}</h1>
          {declined && app.decline_reason && <p className="aq-note-line">{app.decline_reason}</p>}
          {!declined && !hired && <p className="aq-note-line">We review every application ourselves. You&rsquo;ll see each step here as it happens.</p>}
          {staff && <p className="aq-staffnote">Staff preview of the applicant view. Manage this in the <a href={`/onboarding/${app.app_id}`}>hiring portal</a>.</p>}
        </div>

        {/* Stage strip — the project page's language, four plain steps */}
        <div className="aq-card aq-stagebar">
          {STEPS.map((s, n) => (
            <div key={s.key} className={`aq-stage${n < stepIdx ? " done" : ""}${n === stepIdx ? " on" : ""}${declined && n === STEPS.length - 1 ? " bad" : ""}`}>
              <span className="aq-stage-dot" />
              <span className="aq-stage-lbl">{n === STEPS.length - 1 && (hired || declined) ? app.stage_label : s.label}</span>
            </div>
          ))}
        </div>

        {app.interview_at && !declined && (
          <div className="aq-banner">
            <b>Interview scheduled</b> — {app.interview_at}. We&rsquo;ll call you at {app.phone || "the number you gave us"}.
          </div>
        )}

        {hired && (
          <Card title="Onboarding checklist" chip={`${obItems.filter(([k]) => ob[k]).length} of ${obItems.length}`}>
            <ul className="aq-checks">
              {obItems.map(([k, label]) => (
                <li key={k} className={ob[k] ? "done" : ""}>
                  <span className="aq-check-box">{ob[k] ? "✓" : ""}</span>{label}
                </li>
              ))}
            </ul>
            <p className="aq-hint">We&rsquo;ll tick these off as we go — bring anything outstanding to your first day.</p>
          </Card>
        )}

        <Card title="What you sent us" open={false}>
          <dl className="aq-dl">
            <dt>Applying for</dt><dd>{app.position_label}</dd>
            <dt>Experience</dt><dd>{app.experience || "—"}</dd>
            {app.skills && (<><dt>Systems</dt><dd>{app.skills}</dd></>)}
            <dt>Availability</dt><dd>{app.availability || "—"}{app.start_date ? ` · from ${app.start_date}` : ""}</dd>
            <dt>Ready with</dt>
            <dd>{[app.has_license && "License", app.has_vehicle && "Vehicle", app.has_tools && "Tools"].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Phone</dt><dd>{app.phone ? <a href={`tel:${app.phone}`}>{app.phone}</a> : "—"}</dd>
            {app.email && (<><dt>Email</dt><dd><a href={`mailto:${app.email}`}>{app.email}</a></dd></>)}
            {app.address && (<><dt>Based in</dt><dd>{app.address}</dd></>)}
          </dl>
          {app.about && <p className="aq-about">{app.about}</p>}
        </Card>

        <Card title="Progress">
          <ul className="aq-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="aq-tl-dot">{EVENT_ICON[e.kind] || "•"}</span>
                <div><div className="aq-tl-detail">{e.detail || e.kind}</div><div className="aq-tl-meta">{fmt(e.at)}</div></div>
              </li>
            ))}
          </ul>
        </Card>

        <p className="aq-help">Questions? Call us and mention <span className="mono">{app.app_id}</span>.</p>
      </main>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.aq-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--bg-soft:#f6f7f9;--green:#1c8a45;
  min-height:100vh;background:radial-gradient(1100px 480px at 50% -10%,#f0f2f7 0%,#fff 55%);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55}
.aq-top{display:flex;align-items:center;justify-content:space-between;max-width:680px;margin:0 auto;padding:20px 20px 0}
.aq-brand{display:inline-flex}
.aq-top-right{display:flex;align-items:center;gap:14px}
.aq-id{font-size:.8rem;font-weight:800;color:var(--gold-deep);letter-spacing:.5px}
.aq-exit{color:var(--ink);text-decoration:none;font-size:.84rem;font-weight:700;border:1.5px solid var(--line);border-radius:10px;padding:8px 16px;background:#fff}
.aq-exit:hover{border-color:var(--gold);background:#fdfaf2}
.aq-main{max-width:680px;margin:0 auto;padding:18px 20px 60px}
.aq-hero{margin:8px 0 18px}
.aq-hero-tag{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-deep)}
.aq-hero h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.7rem;margin:5px 0 6px}
.aq-note-line{color:var(--muted);margin:0}
.aq-staffnote{margin:10px 0 0;font-size:.82rem;color:var(--muted);background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.aq-staffnote a{color:var(--gold-deep);font-weight:700}
.aq-card{background:#fff;border:1px solid var(--line);border-radius:16px;margin-bottom:14px;box-shadow:0 18px 44px -34px rgba(14,19,32,.3);overflow:hidden}
.aq-card-h{width:100%;display:flex;align-items:center;gap:10px;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink)}
.aq-card-t{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem}
.aq-chip{font-size:.72rem;font-weight:800;color:var(--gold-deep);background:#f8f0e0;border-radius:20px;padding:2px 10px}
.aq-caret{margin-left:auto;color:var(--muted);transition:transform .18s}
.aq-card.open .aq-caret{transform:rotate(0)}
.aq-card:not(.open) .aq-caret{transform:rotate(180deg)}
.aq-card-b{padding:0 20px 18px}
/* stage strip */
.aq-stagebar{display:flex;gap:2px;overflow-x:auto;padding:18px 8px}
.aq-stage{flex:1;min-width:74px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative}
.aq-stage:not(:last-child)::after{content:"";position:absolute;top:8px;left:calc(50% + 11px);right:calc(-50% + 11px);height:2px;background:var(--line)}
.aq-stage.done:not(:last-child)::after{background:var(--gold)}
.aq-stage-dot{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid var(--line);z-index:1}
.aq-stage.done .aq-stage-dot{background:var(--gold);border-color:var(--gold)}
.aq-stage.on .aq-stage-dot{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,169,110,.22)}
.aq-stage.on.bad .aq-stage-dot{border-color:#c9382b;box-shadow:0 0 0 4px rgba(201,56,43,.18)}
.aq-stage-lbl{font-size:.68rem;font-weight:700;color:var(--muted);text-align:center;white-space:nowrap}
.aq-stage.on .aq-stage-lbl{color:var(--ink)}
.aq-banner{background:#e6eefc;border:1px solid #c9dbf7;color:#2540c0;border-radius:12px;padding:12px 16px;font-size:.9rem;margin-bottom:14px}
/* details */
.aq-dl{display:grid;grid-template-columns:110px 1fr;gap:9px 12px;margin:0;font-size:.9rem}
.aq-dl dt{color:var(--muted);font-weight:600}
.aq-dl dd{margin:0}
.aq-dl a{color:var(--gold-deep);text-decoration:none}
.aq-dl a:hover{text-decoration:underline}
.aq-about{margin:14px 0 0;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem;white-space:pre-wrap}
/* checklist */
.aq-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.aq-checks li{display:flex;align-items:center;gap:10px;font-size:.9rem;color:var(--muted)}
.aq-checks li.done{color:var(--ink);font-weight:600}
.aq-check-box{width:20px;height:20px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:.72rem;font-weight:800;color:#fff}
.aq-checks li.done .aq-check-box{background:var(--green);border-color:var(--green)}
.aq-hint{color:var(--muted);font-size:.82rem;margin:14px 0 0}
/* timeline */
.aq-timeline{list-style:none;margin:0;padding:0}
.aq-timeline li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.aq-timeline li:last-child{border-bottom:none}
.aq-tl-dot{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#f8f0e0;display:grid;place-items:center;font-size:.8rem}
.aq-tl-detail{font-size:.88rem;font-weight:600}
.aq-tl-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.aq-help{text-align:center;color:var(--muted);font-size:.84rem;margin:8px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px;font-weight:700}
@media(max-width:560px){.aq-hero h1{font-size:1.45rem}.aq-dl{grid-template-columns:1fr;gap:2px 0}.aq-dl dd{margin-bottom:8px}}
`;
