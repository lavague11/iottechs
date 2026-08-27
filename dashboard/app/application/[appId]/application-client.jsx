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
// Inline-SVG timeline icons (no emojis — house rule). Keyed by event kind.
const EVENT_ICON = {
  applied:    <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /></>,
  stage:      <path d="M5 12h14M13 6l6 6-6 6" />,
  interview:  <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  offer:      <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>,
  hired:      <path d="M20 6 9 17l-5-5" />,
  declined:   <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
  onboarding: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m9 12 2 2 4-4" /></>,
  note:       <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
};
const EvIcon = ({ kind }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {EVENT_ICON[kind] || <circle cx="12" cy="12" r="3.5" />}
  </svg>
);
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
  const pct = declined ? 100 : Math.round(((stepIdx + 1) / STEPS.length) * 100);
  const readoutLabel = hired ? "Hired" : declined ? "Closed" : (STEPS[stepIdx]?.label || "Applied");
  const ob = app.onboarding || {};
  const onboardingDone = !!ob.profile?.submitted_at && ["safety", "handbook", "equipment"].every((k) => ob.signed?.[k]);
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
        <a href="/go" className="aq-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
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

        {/* Deck beacon rail — thin fill bars + beacon dots + mono labels + % readout */}
        <div className="aq-rail">
          <div className="aq-track">
            {STEPS.map((s, n) => {
              const mk = declined && n === STEPS.length - 1 ? "bad" : n < stepIdx ? "done" : n === stepIdx ? (hired ? "done" : "active") : "todo";
              return (
                <div key={s.key} className={`aq-seg ${mk}`}>
                  <div className="aq-bar"><i /></div>
                  <div className="aq-lab"><span className="aq-beacon" /><span className="aq-seg-l">{n === STEPS.length - 1 && (hired || declined) ? app.stage_label : s.label}</span></div>
                </div>
              );
            })}
          </div>
          <div className={`aq-readout${declined ? " bad" : ""}`}>
            <span className="aq-pct mono">{pct}%</span>
            <span className="aq-readout-l">{readoutLabel}</span>
          </div>
        </div>

        {app.interview_at && !declined && (
          <div className="aq-banner">
            <b>Interview scheduled</b> — {app.interview_at}. We&rsquo;ll call you at {app.phone || "the number you gave us"}.
          </div>
        )}

        {/* Onboarding opens at offer — this is the "fill out your paperwork" hand-off */}
        {["offer", "hired"].includes(app.stage) && (
          <a className="aq-cta" href={`/welcome/${app.app_id}`}>
            <div>
              <b>{onboardingDone ? "Your onboarding is complete" : "Finish your onboarding"}</b>
              <span>{onboardingDone ? "Details saved and all agreements signed — nothing left to do." : "Your details, emergency contact, and three agreements to sign. About five minutes."}</span>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </a>
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
                <span className="aq-tl-dot"><EvIcon kind={e.kind} /></span>
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
/* Matches the project-page (deck) design system: Instrument Sans (--font-sans), warm-paper palette. */
.aq-root{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A1A6AC;--line:#E4E4DF;--line-soft:#EDEDE9;
  --gold:#C9A96E;--gold-deep:#A8842F;--bg-soft:#F4F4F2;--raise:#FBFBFA;--green:#2E7D5B;--red:#C4553D;
  min-height:100vh;background:var(--bg-soft);color:var(--ink);font-family:var(--font-sans),'Instrument Sans',ui-sans-serif,system-ui,sans-serif;line-height:1.55}
.aq-top{display:flex;align-items:center;justify-content:space-between;max-width:680px;margin:0 auto;padding:20px 20px 0}
.aq-brand{display:inline-flex}
.aq-top-right{display:flex;align-items:center;gap:14px}
.aq-id{font-size:.8rem;font-weight:800;color:var(--gold-deep);letter-spacing:.5px}
.aq-exit{color:var(--ink);text-decoration:none;font-size:.84rem;font-weight:700;border:1.5px solid var(--line);border-radius:10px;padding:8px 16px;background:#fff}
.aq-exit:hover{border-color:var(--gold);background:#fdfaf2}
.aq-main{max-width:680px;margin:0 auto;padding:18px 20px 60px}
.aq-hero{margin:8px 0 18px}
.aq-hero-tag{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-deep)}
.aq-hero h1{font-family:var(--font-sans),'Instrument Sans',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.7rem;margin:5px 0 6px}
.aq-note-line{color:var(--muted);margin:0}
.aq-staffnote{margin:10px 0 0;font-size:.82rem;color:var(--muted);background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.aq-staffnote a{color:var(--gold-deep);font-weight:700}
.aq-card{background:#fff;border:1px solid var(--line);border-radius:16px;margin-bottom:14px;box-shadow:0 18px 44px -34px rgba(14,19,32,.3);overflow:hidden}
.aq-card-h{width:100%;display:flex;align-items:center;gap:10px;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink)}
.aq-card-t{font-family:var(--font-sans),'Instrument Sans',sans-serif;font-weight:800;font-size:1rem}
.aq-chip{font-size:.72rem;font-weight:800;color:var(--gold-deep);background:#f8f0e0;border-radius:20px;padding:2px 10px}
.aq-caret{margin-left:auto;color:var(--muted);transition:transform .18s}
.aq-card.open .aq-caret{transform:rotate(0)}
.aq-card:not(.open) .aq-caret{transform:rotate(180deg)}
.aq-card-b{padding:0 20px 18px}
/* deck beacon rail */
.aq-rail{background:var(--raise);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 44px -34px rgba(16,20,24,.3);display:flex;align-items:center;gap:18px;padding:18px 22px;margin-bottom:14px}
.aq-track{flex:1;display:flex;gap:6px;min-width:0}
.aq-seg{flex:1;min-width:0;display:flex;flex-direction:column}
.aq-bar{height:2px;border-radius:99px;background:var(--line);overflow:hidden;position:relative}
.aq-bar i{position:absolute;inset:0;width:0;background:var(--gold);border-radius:99px;transition:width .7s cubic-bezier(.16,1,.3,1)}
.aq-seg.done .aq-bar i,.aq-seg.active .aq-bar i{width:100%}
.aq-seg.active .aq-bar i{background:var(--gold-deep)}
.aq-seg.bad .aq-bar i{width:100%;background:var(--red)}
.aq-lab{margin-top:9px;display:flex;align-items:center;gap:7px;font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);white-space:nowrap;overflow:hidden}
.aq-seg-l{overflow:hidden;text-overflow:ellipsis}
.aq-seg.active .aq-lab,.aq-seg.done .aq-lab{color:var(--ink-soft)}
.aq-beacon{width:7px;height:7px;flex:0 0 auto;border-radius:99px;background:#fff;border:1.5px solid var(--faint)}
.aq-seg.done .aq-beacon{background:var(--gold);border-color:var(--gold-deep)}
.aq-seg.active .aq-beacon{background:var(--gold);border-color:var(--gold-deep);animation:aqBeacon 1.1s ease-in-out infinite}
.aq-seg.bad .aq-beacon{background:var(--red);border-color:var(--red)}
@keyframes aqBeacon{0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.55)}55%{box-shadow:0 0 0 4px rgba(201,169,110,0)}}
.aq-readout{flex:0 0 auto;text-align:right;display:flex;flex-direction:column;line-height:1}
.aq-pct{font-size:20px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.aq-readout.bad .aq-pct{color:var(--red)}
.aq-readout-l{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:5px}
.aq-banner{background:#e6eefc;border:1px solid #c9dbf7;color:#2540c0;border-radius:12px;padding:12px 16px;font-size:.9rem;margin-bottom:14px}
.aq-cta{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;border-radius:14px;padding:16px 20px;margin-bottom:14px;text-decoration:none;transition:transform .15s,box-shadow .2s}
.aq-cta:hover{transform:translateY(-2px);box-shadow:0 16px 34px -16px rgba(176,143,79,.7)}
.aq-cta b{display:block;font-size:1rem;font-family:var(--font-sans),'Instrument Sans',sans-serif}
.aq-cta span{display:block;font-size:.85rem;opacity:.92;margin-top:2px}
.aq-cta svg{margin-left:auto;flex-shrink:0}
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
.aq-tl-dot{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#F2ECDD;color:var(--gold-deep);display:grid;place-items:center}
.aq-tl-detail{font-size:.88rem;font-weight:600}
.aq-tl-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.aq-help{text-align:center;color:var(--muted);font-size:.84rem;margin:8px 0 0}
.mono{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:.5px;font-weight:700}
@media(max-width:560px){.aq-hero h1{font-size:1.45rem}.aq-dl{grid-template-columns:1fr;gap:2px 0}.aq-dl dd{margin-bottom:8px}}
`;
