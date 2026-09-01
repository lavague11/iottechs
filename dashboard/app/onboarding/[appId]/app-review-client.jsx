"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell from "../../components/admin-shell";
import { setAppStageAction, setAppReviewAction, addAppNoteAction, setAppOnboardingAction, hireApplicantAction, verifyEmergencyAction, setAppArchivedAction, setDispositionAction, advanceHiringAction } from "../actions";
import { gradeAssessmentAction } from "../../assessment/[appId]/actions";
import AssessmentResult from "./assessment-result";
import RecruitmentSteps from "./recruitment-steps";
import ComplianceReview from "./compliance-review";
import TrainingPanel from "./training-panel";
import { positionKey, effectiveDisposition, DISPOSITIONS, STAGE_SLA_DAYS, nextAction } from "../../../lib/hiring";

const STEPS = [
  { key: "applied",   label: "Applied",   set: "applied" },
  { key: "reviewing", label: "In review", set: "reviewing" },
  { key: "interview", label: "Interview", set: "interview" },
  { key: "offer",     label: "Offer",     set: "offer" },
];
const OB_ITEMS = [
  ["w9", "W-9 on file"], ["license", "Driver's license copy"], ["insurance", "Insurance / eligibility"],
  ["background", "Background check"], ["gear", "Tools & equipment issued"], ["training", "Safety + systems training"],
];
// Timeline glyphs — inline SVG only (no emoji), per the house standard.
const EVENT_PATHS = {
  applied:   <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h4" /></>,
  stage:     <path d="M5 12h13M13 7l5 5-5 5" />,
  interview: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  offer:     <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="m3 8 9 6 9-6" /></>,
  hired:     <path d="M20 6 9 17l-5-5" />,
  declined:  <><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></>,
  onboarding:<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></>,
  note:      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  disposition:<><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>,
  override:  <><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></>,
};
function EventIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {EVENT_PATHS[kind] || <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : "—"; }

export default function AppReviewClient({ user, alerts, app, events = [], reviewers = [], compliance = null, statusSince = null }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [note, setNote] = useState("");
  const [interviewAt, setInterviewAt] = useState(app.interview_at || "");
  const [declineArm, setDeclineArm] = useState(false);
  const [declineWhy, setDeclineWhy] = useState("");
  const posKey = positionKey(app.position);
  const [hireRole, setHireRole] = useState(posKey === "sales" ? "sales" : posKey === "office" ? "manager" : "tech");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [voidArm, setVoidArm] = useState(false);
  const [dispOpen, setDispOpen] = useState(false);

  // Candidate disposition (Active / On Hold / Withdrawn — or a terminal Hired/Not-Selected/Archived).
  const disp = effectiveDisposition(app);
  const dispSettable = ["active", "on_hold", "withdrawn"].includes(disp.key);   // terminal states aren't hand-set here
  // Days in the CURRENT stage, from the last transition — not the application date.
  const daysInStage = statusSince ? Math.floor((Date.now() - Date.parse(String(statusSince).replace(" ", "T"))) / 86400000) : null;
  const slaDays = STAGE_SLA_DAYS[app.status] ?? null;
  const overdue = daysInStage != null && slaDays != null && daysInStage > slaDays;

  const isAdmin = user.role === "admin";
  const archived = !!app.archived;
  const hired = app.stage === "hired";
  const declined = app.stage === "declined";
  // Only technician applicants run the assessment/Portal pipeline; every other position uses the
  // direct role-hire Decision card.
  const isTechTrack = posKey === "tech";
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === app.stage));
  const pct = (hired || declined) ? 100 : Math.round(((stepIdx + 1) / STEPS.length) * 100);
  const readoutLabel = hired ? "Hired" : declined ? "Closed" : (STEPS[stepIdx]?.label || "Applied");
  const ob = app.onboarding || {};
  const obDone = OB_ITEMS.filter(([k]) => ob[k]).length;
  const prof = ob.profile || null;        // what the new hire filled in themselves
  const signed = ob.signed || {};         // their typed signatures on the three agreements
  const emgVerified = ob.emergency_verified || null;

  const run = (fn) => startTx(async () => {
    const r = await fn();
    if (r?.ok) { if (r.warning) alert(r.warning); router.refresh(); }
    else if (r?.error) alert(r.error === "incomplete" ? "Finish the current stage first (see the Recruitment card)." : r.error);
  });

  // Deterministic next action for the header card (tech track only). CTA kinds map to real actions.
  const na = isTechTrack ? nextAction(app) : null;
  function doNextAction(kind) {
    if (kind === "advance") run(() => advanceHiringAction(app.app_id));
    else if (kind === "activate") run(() => setDispositionAction(app.app_id, "active"));
    else if (kind === "grade") run(() => gradeAssessmentAction(app.app_id));
  }

  return (
    <AdminShell user={user} alerts={alerts} active="onboarding">
      <div className="apx-wrap ob-detail">
        <Link href="/onboarding" className="ob-back">← Hiring</Link>

        <div className="ob-hero">
          <div>
            <div className="ob-hero-id mono">{app.app_id}</div>
            <h1>{app.name || "—"}</h1>
            <p className="ob-hero-sub">{app.position_label} · {app.experience || "experience not given"}{app.address ? ` · ${app.address}` : ""}</p>
          </div>
          <div className="ob-hero-chips">
            {/* Unified disposition badge — covers Active/On Hold/Withdrawn plus the terminal states.
                For the three settable states it opens a small menu (an axis separate from stage). */}
            <div className="ob-disp">
              <button className={`ob-badge disp t-${disp.tone}${dispSettable ? " ob-disp-btn" : ""}`}
                disabled={!dispSettable || pending} onClick={() => dispSettable && setDispOpen((o) => !o)}
                aria-haspopup="true" aria-expanded={dispOpen}>
                {disp.label}
                {dispSettable && <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.6" style={{ marginLeft: 4 }}><path d="m6 9 6 6 6-6" /></svg>}
              </button>
              {dispOpen && dispSettable && (
                <>
                  <div className="ob-disp-back" onClick={() => setDispOpen(false)} />
                  <div className="ob-disp-menu">
                    {DISPOSITIONS.map((d) => (
                      <button key={d.key} className={d.key === (app.disposition || "active") ? "on" : ""} disabled={pending}
                        onClick={() => {
                          setDispOpen(false);
                          if (d.key === (app.disposition || "active")) return;
                          if (d.key === "withdrawn" && !confirm(`Mark ${app.name || "this candidate"} as Withdrawn? Their pipeline stage is kept.`)) return;
                          run(() => setDispositionAction(app.app_id, d.key));
                        }}>{d.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Link href={`/application/${app.app_id}`} className="ob-view-btn">Applicant view</Link>
            {isAdmin && (archived
              ? <button className="ob-view-btn" disabled={pending} onClick={() => run(() => setAppArchivedAction(app.app_id, false))}>Restore</button>
              : voidArm
                ? <span className="ob-void-arm">
                    <button className="ob-btn bad" disabled={pending} onClick={() => { setVoidArm(false); run(() => setAppArchivedAction(app.app_id, true)); }}>Confirm void</button>
                    <button className="ob-btn ghost" onClick={() => setVoidArm(false)}>Cancel</button>
                  </span>
                : <button className="ob-view-btn ob-void-btn" onClick={() => setVoidArm(true)}>Void</button>)}
          </div>
        </div>
        {archived && <div className="ob-void-note">This application is voided — hidden from the hiring board and re-apply recovery. The record is kept for audit{app.archived_by ? ` (voided by ${app.archived_by})` : ""}.</div>}

        {/* Deck beacon rail — click a segment to advance the stage; % readout on the right */}
        <div className="panel ob-rail">
          <div className="ob-track">
            {STEPS.map((s, n) => {
              const mk = declined && n === STEPS.length - 1 ? "bad"
                : n < stepIdx ? "done"
                : n === stepIdx ? (hired ? "done" : "active")
                : "todo";
              return (
                <button key={s.key} className={`ob-seg ${mk}`} disabled={pending || hired}
                  onClick={() => run(() => setAppStageAction(app.app_id, s.set))} title={`Set ${s.label}`}>
                  <div className="ob-bar"><i /></div>
                  <div className="ob-lab"><span className="ob-beacon" /><span className="ob-seg-l">{s.label}</span></div>
                </button>
              );
            })}
          </div>
          <div className={`ob-readout${declined ? " bad" : ""}`}>
            <span className="ob-pct mono">{pct}%</span>
            <span className="ob-readout-l">{readoutLabel}</span>
            {daysInStage != null && !hired && !declined && (
              <span className={`ob-days${overdue ? " over" : ""}`}>In stage: {daysInStage}d{overdue ? " · Overdue" : ""}</span>
            )}
          </div>
        </div>

        {/* Deterministic next action — the single thing to do now, derived from candidate state. */}
        {na && (
          <div className={`panel ob-next t-${na.tone}`}>
            <div className="ob-next-in">
              <span className="ob-next-eyebrow">Next action</span>
              <span className="ob-next-label">{na.label}</span>
              {na.detail && <span className="ob-next-detail">{na.detail}</span>}
            </div>
            {na.cta && (na.cta.kind === "applicant_view"
              ? <Link href={`/application/${app.app_id}`} className="ob-next-cta">{na.cta.label}</Link>
              : <button className="ob-next-cta" disabled={pending} onClick={() => doNextAction(na.cta.kind)}>{pending ? "Working…" : na.cta.label}</button>)}
          </div>
        )}

        {/* The assessment + Portal-1 pipeline is the TECHNICIAN track (25-Q tech assessment,
            skills scorecards). Sales / PM / Subcontractor applicants don't take it — they get the
            direct role-hire Decision card below instead. */}
        {isTechTrack && <div style={{ marginBottom: 14 }}><AssessmentResult appId={app.app_id} assessment={app.assessment} /></div>}
        {isTechTrack && app.portal === 1 && <div style={{ marginBottom: 14 }}><RecruitmentSteps appId={app.app_id} status={app.status} steps={app.steps} assessment={app.assessment} canHire={user.role === "admin"} /></div>}
        {app.portal === 2 && <div style={{ marginBottom: 14 }}><ComplianceReview appId={app.app_id} status={app.status} compliance={compliance} /></div>}
        {(app.portal === 3 || app.status === "cleared") && <div style={{ marginBottom: 14 }}><TrainingPanel appId={app.app_id} status={app.status} training={app.training} /></div>}

        <div className="ob-grid">
          {/* Application */}
          <div className="panel ob-card">
            <button className="ob-card-h ob-toggle" onClick={() => setDetailsOpen((v) => !v)}>
              Application
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", transform: detailsOpen ? "none" : "rotate(180deg)", transition: "transform .18s" }}><polyline points="18 15 12 9 6 15" /></svg>
            </button>
            {detailsOpen && (
              <>
                <dl className="ob-dl">
                  <dt>Phone</dt><dd>{app.phone ? <a href={`tel:${app.phone}`}>{app.phone}</a> : "—"}</dd>
                  <dt>Email</dt><dd>{app.email ? <a href={`mailto:${app.email}`}>{app.email}</a> : "—"}</dd>
                  <dt>Based in</dt><dd>{app.address ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(app.address)}`} target="_blank" rel="noopener noreferrer">{app.address}</a> : "—"}</dd>
                  <dt>Availability</dt><dd>{app.availability || "—"}{app.start_date ? ` · from ${app.start_date}` : ""}</dd>
                  <dt>Ready with</dt><dd>{[app.has_license && "License", app.has_vehicle && "Vehicle", app.has_tools && "Tools"].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt>Résumé</dt><dd>{app.resume_name
                    ? <a href={`/api/apply/resume?id=${encodeURIComponent(app.app_id)}`} target="_blank" rel="noopener noreferrer">{app.resume_name} ↓</a>
                    : <span className="ob-none">Not attached</span>}</dd>
                  <dt>Applied</dt><dd>{fmt(app.created_at)}</dd>
                </dl>
                {app.skills && <div className="ob-block"><span className="ob-block-l">Systems / certs</span>{app.skills}</div>}
                {app.about && <div className="ob-block"><span className="ob-block-l">In their words</span>{app.about}</div>}
              </>
            )}
          </div>

          {/* Review */}
          <div className="panel ob-card">
            <div className="ob-card-h">Review</div>
            <label className="ob-l">Gut score</label>
            <div className="ob-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`ob-star${(app.rating || 0) >= n ? " on" : ""}`} disabled={pending}
                  onClick={() => run(() => setAppReviewAction(app.app_id, { rating: n }))} title={`${n} of 5`}>★</button>
              ))}
              {app.rating ? <span className="ob-star-n">{app.rating}/5</span> : <span className="ob-star-n dim">not rated</span>}
            </div>

            <label className="ob-l">Reviewer</label>
            <select className="apx-input ob-sel" value={app.reviewer_id || ""} disabled={pending}
              onChange={(e) => { const r = reviewers.find((x) => String(x.id) === e.target.value); run(() => setAppReviewAction(app.app_id, { reviewer_id: r?.id || null, reviewer_name: r?.name || null })); }}>
              <option value="">Unassigned</option>
              {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>

            <label className="ob-l">Interview</label>
            <div className="ob-row">
              <input className="apx-input" type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
              <button className="ob-btn gold" disabled={pending || !interviewAt}
                onClick={() => run(() => setAppReviewAction(app.app_id, { interview_at: interviewAt.replace("T", " ") }))}>Set</button>
            </div>
            {app.interview_at && <div className="ob-hint">Scheduled {app.interview_at} — the applicant sees this on their page.</div>}
          </div>
        </div>

        {/* Direct role-hire Decision card (Hire as Sales/Manager/Admin + create account). This is
            the hire path for NON-technician applicants, who skip the tech assessment pipeline.
            Technicians decide via RecruitmentSteps' Final Review instead (which moves stage+status+
            portal together), so this card — which writes only `stage` — is hidden for them to avoid
            the two-writer desync. */}
        {!hired && !isTechTrack && (
          <div className="panel ob-card">
            <div className="ob-card-h">Decision</div>
            <div className="ob-decide">
              <div className="ob-hire">
                <select className="apx-input ob-sel" value={hireRole} onChange={(e) => setHireRole(e.target.value)} disabled={pending || !isAdmin}>
                  <option value="tech">Hire as Technician</option>
                  <option value="sales">Hire as Sales</option>
                  <option value="manager">Hire as Manager</option>
                  <option value="admin">Hire as Admin</option>
                </select>
                <button className="ob-btn gold" disabled={pending || !isAdmin}
                  title={isAdmin ? "Creates their staff account" : "Only an admin can create the account"}
                  onClick={() => run(() => hireApplicantAction(app.app_id, hireRole))}>Hire &amp; create account</button>
              </div>
              <div className="ob-decline">
                {declineArm ? (
                  <>
                    <input className="apx-input" placeholder="Reason (the applicant sees this)" value={declineWhy} onChange={(e) => setDeclineWhy(e.target.value)} />
                    <button className="ob-btn bad" disabled={pending} onClick={() => { setDeclineArm(false); run(() => setAppStageAction(app.app_id, "declined", declineWhy)); }}>Confirm</button>
                    <button className="ob-btn ghost" onClick={() => setDeclineArm(false)}>Cancel</button>
                  </>
                ) : (
                  <button className="ob-btn ghost" disabled={pending} onClick={() => setDeclineArm(true)}>Not moving forward</button>
                )}
              </div>
            </div>
            {!isAdmin && <div className="ob-hint">Managers can review and schedule; creating the staff account is an admin step.</div>}
          </div>
        )}

        {/* What the new hire submitted on their own onboarding page */}
        {["offer", "hired"].includes(app.stage) && (
          <div className="panel ob-card">
            <div className="ob-card-h">New hire submitted
              <span className="ob-count">{prof?.submitted_at ? "Details in" : "Waiting"}</span>
              <a className="ob-view-btn" href={`/compliance/${app.app_id}`} style={{ marginLeft: "auto" }}>Their onboarding page</a>
            </div>
            {prof?.submitted_at ? (
              <dl className="ob-dl">
                <dt>Legal name</dt><dd>{prof.legal_name || "—"}</dd>
                <dt>Date of birth</dt><dd>{prof.dob || "—"}</dd>
                <dt>Address</dt><dd>{prof.address || "—"}</dd>
                <dt>Emergency</dt>
                <dd>
                  {prof.emergency_name ? (
                    <div className="ob-emg">
                      <span>
                        {prof.emergency_name}{prof.emergency_rel ? ` (${prof.emergency_rel})` : ""}
                        {prof.emergency_phone && <> · <a href={`tel:${prof.emergency_phone}`}>{prof.emergency_phone}</a></>}
                      </span>
                      {emgVerified ? (
                        <>
                          <span className="ob-vok">✓ Verified · {emgVerified.by} · {fmt(emgVerified.at)}</span>
                          <button className="ob-vclear" disabled={pending} onClick={() => run(() => verifyEmergencyAction(app.app_id, false))}>Clear</button>
                        </>
                      ) : (
                        <button className="ob-vbtn" disabled={pending}
                          title="Call the contact, then mark it confirmed"
                          onClick={() => run(() => verifyEmergencyAction(app.app_id, true))}>Mark verified</button>
                      )}
                    </div>
                  ) : "—"}
                </dd>
                <dt>Licence</dt><dd>{prof.license_no ? `${prof.license_no}${prof.license_state ? ` · ${prof.license_state}` : ""}${prof.license_exp ? ` · exp ${prof.license_exp}` : ""}` : "—"}</dd>
                <dt>Sizes</dt><dd>{[prof.shirt && `Shirt ${prof.shirt}`, prof.jacket && `Jacket ${prof.jacket}`, prof.boot && `Boot ${prof.boot}`].filter(Boolean).join(" · ") || "—"}</dd>
              </dl>
            ) : (
              <div className="ob-hint">They haven&rsquo;t filled in their details yet — send them their onboarding link.</div>
            )}
            <div className="ob-sigs">
              {[["safety", "Safety policy"], ["handbook", "Employee handbook"], ["equipment", "Tool & equipment"]].map(([k, label]) => (
                <div key={k} className={`ob-sig${signed[k] ? " on" : ""}`}>
                  <span className="ob-check-box">{signed[k] ? "✓" : ""}</span>
                  <div><div className="ob-sig-t">{label}</div>
                    <div className="ob-sig-m">{signed[k] ? `${signed[k].name} · ${fmt(signed[k].at)}` : "Not signed"}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Office checklist — only once hired */}
        {hired && (
          <div className="panel ob-card">
            <div className="ob-card-h">Office checklist <span className="ob-count">{obDone} of {OB_ITEMS.length}</span></div>
            <div className="ob-checks">
              {OB_ITEMS.map(([k, label]) => (
                <button key={k} className={`ob-check${ob[k] ? " on" : ""}`} disabled={pending}
                  onClick={() => run(() => setAppOnboardingAction(app.app_id, { [k]: !ob[k] }))}>
                  <span className="ob-check-box">{ob[k] ? "✓" : ""}</span>{label}
                </button>
              ))}
            </div>
            {app.user_id && <div className="ob-hint">Staff account created — their login PIN and password are the last 4 / full digits of their phone until they change it.</div>}
          </div>
        )}

        {/* Timeline */}
        <div className="panel ob-card">
          <div className="ob-card-h">Timeline</div>
          <ul className="ob-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="ob-tl-dot"><EventIcon kind={e.kind} /></span>
                <div>
                  <div className="ob-tl-detail">{e.detail || e.kind}</div>
                  <div className="ob-tl-meta">{fmt(e.at)}{e.actor_name ? ` · ${e.actor_name}` : ""}{e.actor_role ? ` (${e.actor_role})` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="ob-note-row">
            <input className="apx-input" placeholder="Add a private note (the applicant never sees this)…" value={note}
              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && note.trim() && run(async () => { const r = await addAppNoteAction(app.app_id, note); if (r?.ok) setNote(""); return r; })} />
            <button className="ob-btn gold" disabled={pending || !note.trim()}
              onClick={() => run(async () => { const r = await addAppNoteAction(app.app_id, note); if (r?.ok) setNote(""); return r; })}>Add</button>
          </div>
        </div>
      </div>
      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .ob-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .ob-back:hover{text-decoration:underline}
.apx .ob-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin:14px 0 18px;flex-wrap:wrap}
.apx .ob-hero-id{font-size:.78rem;font-weight:700;color:var(--gold-deep,#b08f4f);letter-spacing:.5px}
.apx .ob-hero h1{margin:4px 0 6px;font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;font-weight:800}
.apx .ob-hero-sub{margin:0;color:var(--muted)}
.apx .ob-hero-chips{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.apx .ob-badge{font-size:.72rem;font-weight:800;text-transform:uppercase;padding:4px 12px;border-radius:20px}
.apx .ob-badge.good,.apx .ob-badge.disp.t-good{color:#1c8a45;background:#e7f6ec}
.apx .ob-badge.bad,.apx .ob-badge.disp.t-bad{color:#c9382b;background:#fdecec}
.apx .ob-badge.disp.t-active{color:#1c8a45;background:#e7f6ec}
.apx .ob-badge.disp.t-warn{color:#B0801F;background:#F6EEDC}
.apx .ob-badge.disp.t-muted{color:#787D84;background:#EFEFEA}
.apx .ob-disp{position:relative;display:inline-flex}
.apx .ob-disp-btn{display:inline-flex;align-items:center;border:none;cursor:pointer;font-family:inherit}
.apx .ob-disp-btn:disabled{cursor:default}
.apx .ob-disp-back{position:fixed;inset:0;z-index:20}
.apx .ob-disp-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:21;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px -12px rgba(14,19,32,.3);padding:5px;min-width:150px;display:flex;flex-direction:column;gap:2px}
.apx .ob-disp-menu button{text-align:left;background:none;border:none;border-radius:7px;padding:8px 11px;font:inherit;font-size:.84rem;font-weight:600;color:var(--ink);cursor:pointer}
.apx .ob-disp-menu button:hover{background:var(--bg-soft,#F4F4F2)}
.apx .ob-disp-menu button.on{color:var(--gold-deep,#A8842F);background:#F6F0E2}
.apx .ob-days{margin-top:5px;font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.6rem;letter-spacing:.04em;color:var(--muted)}
.apx .ob-days.over{color:#c9382b;font-weight:700}
.apx .ob-next{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 18px;margin-bottom:16px;border-left:4px solid #C9A96E}
.apx .ob-next.t-warn{border-left-color:#B0801F;background:#FBF6EA}
.apx .ob-next.t-good{border-left-color:#2E7D5B;background:#F1F8F3}
.apx .ob-next.t-bad{border-left-color:#c9382b;background:#FBF1EF}
.apx .ob-next.t-muted{border-left-color:#A6ABB1}
.apx .ob-next-in{display:flex;flex-direction:column;gap:2px;min-width:0}
.apx .ob-next-eyebrow{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.apx .ob-next-label{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.02rem;color:var(--ink);line-height:1.2}
.apx .ob-next-detail{font-size:.83rem;color:var(--muted);line-height:1.4}
.apx .ob-next-cta{flex:none;font-size:.85rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#C9A96E,#b08f4f);border:none;border-radius:10px;padding:10px 18px;text-decoration:none;cursor:pointer;white-space:nowrap}
.apx .ob-next-cta:disabled{opacity:.55;cursor:default}
.apx .ob-next.t-warn .ob-next-cta{background:linear-gradient(135deg,#C9A24E,#B0801F)}
.apx .ob-view-btn{font-size:.78rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#C9A96E,#b08f4f);border-radius:20px;padding:6px 16px;text-decoration:none;border:none;cursor:pointer}
.apx .ob-view-btn:disabled{opacity:.5;cursor:default}
.apx .ob-void-btn{background:#fff;color:#c9382b;border:1.5px solid #f0d3d0}
.apx .ob-void-btn:hover{background:#fdecec}
.apx .ob-void-arm{display:inline-flex;gap:8px;align-items:center}
.apx .ob-void-note{background:#fdecec;border:1px solid #f4d0cc;color:#a23028;border-radius:10px;padding:10px 14px;font-size:.85rem;font-weight:600;margin-bottom:16px}
.apx .ob-rail{display:flex;align-items:center;gap:18px;padding:16px 20px;margin-bottom:16px}
.apx .ob-track{flex:1;display:flex;gap:6px;min-width:0}
.apx .ob-seg{flex:1;min-width:0;display:flex;flex-direction:column;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;text-align:left}
.apx .ob-seg:disabled{cursor:default}
.apx .ob-bar{height:2px;border-radius:99px;background:var(--line);overflow:hidden;position:relative}
.apx .ob-bar i{position:absolute;inset:0;width:0;background:#C9A96E;border-radius:99px;transition:width .7s cubic-bezier(.16,1,.3,1)}
.apx .ob-seg.done .ob-bar i,.apx .ob-seg.active .ob-bar i{width:100%}
.apx .ob-seg.active .ob-bar i{background:var(--gold-deep,#b08f4f)}
.apx .ob-seg.bad .ob-bar i{width:100%;background:#c9382b}
.apx .ob-lab{margin-top:9px;display:flex;align-items:center;gap:7px;font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden}
.apx .ob-seg-l{overflow:hidden;text-overflow:ellipsis}
.apx .ob-seg.active .ob-lab,.apx .ob-seg.done .ob-lab{color:var(--ink)}
.apx .ob-beacon{width:7px;height:7px;flex:0 0 auto;border-radius:99px;background:#fff;border:1.5px solid var(--muted)}
.apx .ob-seg.done .ob-beacon{background:#C9A96E;border-color:var(--gold-deep,#b08f4f)}
.apx .ob-seg.active .ob-beacon{background:#C9A96E;border-color:var(--gold-deep,#b08f4f);animation:obBeacon 1.1s ease-in-out infinite}
.apx .ob-seg.bad .ob-beacon{background:#c9382b;border-color:#c9382b}
@keyframes obBeacon{0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.55)}55%{box-shadow:0 0 0 4px rgba(201,169,110,0)}}
.apx .ob-readout{flex:0 0 auto;text-align:right;display:flex;flex-direction:column;line-height:1}
.apx .ob-pct{font-size:20px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.apx .ob-readout.bad .ob-pct{color:#c9382b}
.apx .ob-readout-l{font-family:var(--font-mono),'JetBrains Mono',ui-monospace,monospace;font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:5px}
.apx .ob-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.apx .ob-grid{grid-template-columns:1fr}}
.apx .ob-card{padding:16px 18px;margin-bottom:16px}
.apx .ob-grid .ob-card{margin-bottom:0}
.apx .ob-card-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.apx .ob-toggle{width:100%;background:none;border:none;cursor:pointer;padding:0;color:var(--ink);text-align:left;font-size:1rem}
.apx .ob-count{font-size:.72rem;font-weight:800;color:var(--gold-deep,#b08f4f);background:#f8f0e0;border-radius:20px;padding:1px 8px}
.apx .ob-dl{display:grid;grid-template-columns:92px 1fr;gap:9px 12px;margin:0;font-size:.88rem}
.apx .ob-dl dt{color:var(--muted);font-weight:600}
.apx .ob-dl dd{margin:0}
.apx .ob-dl a{color:var(--gold-deep,#b08f4f);text-decoration:none}
.apx .ob-dl a:hover{text-decoration:underline}
.apx .ob-block{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:.88rem;white-space:pre-wrap}
.apx .ob-block-l{display:block;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:4px}
.apx .ob-l{display:block;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:14px 0 6px}
.apx .ob-l:first-of-type{margin-top:0}
.apx .ob-stars{display:flex;align-items:center;gap:4px}
.apx .ob-star{background:none;border:none;font-size:1.3rem;line-height:1;color:var(--line);cursor:pointer;padding:0 2px;font-family:inherit}
.apx .ob-star.on{color:#C9A96E}
.apx .ob-star:hover{color:#b08f4f}
.apx .ob-star-n{margin-left:8px;font-size:.8rem;font-weight:700;color:var(--ink)}
.apx .ob-star-n.dim{color:var(--muted);font-weight:500}
.apx .ob-sel{height:38px;padding:0 10px;font-size:.86rem;max-width:100%}
.apx .ob-row{display:flex;gap:8px}
.apx .ob-row .apx-input{flex:1;height:38px}
.apx .ob-hint{margin-top:10px;font-size:.78rem;color:var(--muted)}
.apx .ob-btn{height:38px;padding:0 18px;border-radius:9px;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit;border:none;white-space:nowrap}
.apx .ob-btn.gold{background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff}
.apx .ob-btn.ghost{background:#fff;border:1.5px solid var(--line);color:var(--ink)}
.apx .ob-btn.ghost:hover{border-color:var(--ink)}
.apx .ob-btn.bad{background:#c9382b;color:#fff}
.apx .ob-btn:disabled{opacity:.5;cursor:default}
.apx .ob-decide{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center}
.apx .ob-hire{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.apx .ob-decline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.apx .ob-decline .apx-input{height:38px;min-width:220px}
.apx .ob-checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:700px){.apx .ob-checks{grid-template-columns:1fr}}
.apx .ob-check{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1.5px solid var(--line);border-radius:11px;background:#fff;cursor:pointer;font-family:inherit;font-size:.86rem;font-weight:600;color:var(--muted);text-align:left}
.apx .ob-check:hover{border-color:#C9A96E}
.apx .ob-check.on{border-color:#1c8a45;background:#f4fbf6;color:var(--ink)}
.apx .ob-check-box{width:20px;height:20px;flex-shrink:0;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:.72rem;font-weight:800;color:#fff}
.apx .ob-check.on .ob-check-box{background:#1c8a45;border-color:#1c8a45}
.apx .ob-emg{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.apx .ob-vok{font-size:.72rem;font-weight:700;color:#1c8a45;background:#e7f6ec;border-radius:20px;padding:2px 10px}
.apx .ob-vbtn{font-size:.72rem;font-weight:800;color:#fff;background:linear-gradient(135deg,#C9A96E,#b08f4f);border:none;border-radius:20px;padding:4px 12px;cursor:pointer;font-family:inherit}
.apx .ob-vbtn:hover{filter:brightness(1.05)}
.apx .ob-vclear{font-size:.7rem;font-weight:700;color:var(--muted);background:none;border:none;cursor:pointer;font-family:inherit;text-decoration:underline}
.apx .ob-sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
@media(max-width:800px){.apx .ob-sigs{grid-template-columns:1fr}}
.apx .ob-sig{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--line);border-radius:11px;background:#fff}
.apx .ob-sig.on{border-color:#b9e3c8;background:#f7fcf9}
.apx .ob-sig-t{font-size:.84rem;font-weight:700}
.apx .ob-sig-m{font-size:.74rem;color:var(--muted)}
.apx .ob-timeline{list-style:none;margin:0 0 14px;padding:0}
.apx .ob-timeline li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.apx .ob-timeline li:last-child{border-bottom:none}
.apx .ob-tl-dot{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#f8f0e0;color:var(--gold-deep,#b08f4f);display:grid;place-items:center}
.apx .ob-tl-detail{font-size:.86rem;font-weight:600}
.apx .ob-tl-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.apx .ob-note-row{display:flex;gap:8px}
.apx .ob-note-row .apx-input{flex:1;height:38px}
`;
