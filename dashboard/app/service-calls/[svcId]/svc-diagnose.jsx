"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveSvcDiagnosisAction, signSvcReportAction, unsignSvcReportAction, createFollowUpAction } from "../actions";
import { SVC_CALL_TYPES, SVC_SYSTEMS, SVC_SYMPTOMS, SVC_ROOT_CAUSES, SVC_TESTS, SVC_WORK, SVC_OUTCOMES, SVC_BILLING, CAUSE_LABEL, OUTCOME_LABEL, WORK_LABEL, SYSTEM_LABEL, TEST_LABEL, emptyDiagnosis, emptyFinding, timeOnSite, suggestEstimate, needsFollowUp, newId, SVC_DEVICE_STATUS, moduleFields, documentModel, suggestSymptoms, suggestTests, suggestRootCauses, suggestWork, issueLine, SVC_PHOTO_CATEGORIES } from "../../../lib/svc-model";
import SvcDocumentEditor from "./svc-document-editor";
import MicButton from "../../components/mic-button";
import { FieldRow, Selector } from "./svc-fields";
import { CSS } from "./svc-diagnose-css";

// The diagnostic chain for one call, autosaved server-side. Redesigned around progressive disclosure:
// at rest each issue shows the STORY (device · symptom → cause → outcome), and the full taxonomy of
// symptoms / tests / causes / work appears only when a field is tapped. One issue expanded at a time;
// the rest collapse to a one-liner. Signed reports are frozen; retail (Estimate) stays admin/manager.

const nowHHMM = () => new Date().toTimeString().slice(0, 5);
const hhmm = (v) => { const s = String(v || ""); if (/Z$|[+-]\d\d:\d\d$/.test(s)) { const d = new Date(s); return Number.isNaN(d) ? s.slice(11, 16) : d.toTimeString().slice(0, 5); } return s.slice(11, 16); };
const RESULT_CYCLE = { "NOT TESTED": "PASS", PASS: "FAIL", FAIL: "NOT TESTED" };
const OUTCOME_TONE = { working: "ok", repaired: "ok", replaced: "ok", no_fault: "ok", temporary: "warn", needs_repair: "warn", needs_replace: "warn", parts: "warn", return: "warn", warranty: "warn", third_party: "warn", declined: "muted", unable: "muted" };
const opts = (list) => list.map((x) => ({ key: x.key, label: x.label }));

// A text field (input or textarea) with the shared multilingual dictation mic docked in the corner.
function MicField({ value, onValue, placeholder, disabled, textarea = false, rows = 2, title }) {
  return (
    <div className={`sd-mf${textarea ? " ta" : ""}`}>
      {textarea
        ? <textarea className="apx-input" rows={rows} placeholder={placeholder} value={value} disabled={disabled} title={title} onChange={(e) => onValue(e.target.value)} />
        : <input className="apx-input" placeholder={placeholder} value={value} disabled={disabled} title={title} onChange={(e) => onValue(e.target.value)} />}
      {!disabled && <span className="sd-mf-mic"><MicButton value={value} onChange={onValue} size={15} /></span>}
    </div>
  );
}

// Photos on the call — contextual: call-level (findingId null) or bound to one issue. Reuses /api/media.
function PhotoStrip({ photos, findingId = null, projectId, locked, onAdd, onPatch, onRemove, compact = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const mine = (photos || []).map((ph, i) => ({ ph, i })).filter((x) => (x.ph.findingId || null) === findingId);
  async function pick(e) {
    const files = [...(e.target.files || [])]; e.target.value = "";
    for (const file of files) {
      setBusy((n) => n + 1);
      try {
        const fd = new FormData(); fd.append("file", file, file.name || "photo.jpg"); fd.append("kind", "service-photo"); if (projectId) fd.append("project", projectId);
        const j = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (j?.ok && j.url) onAdd({ url: j.url, category: "Other", caption: "", findingId });
      } finally { setBusy((n) => n - 1); }
    }
  }
  if (compact && !mine.length && locked) return null;
  return (
    <div className={`sd-photos${compact ? " compact" : ""}`}>
      {!compact && <div className="sd-lab">Photos{busy > 0 ? " · uploading…" : ""}</div>}
      <div className="sd-photo-grid">
        {mine.map(({ ph, i }) => (
          <div className="sd-photo" key={ph.url + i}>
            <img src={ph.url} alt={ph.caption || ph.category} loading="lazy" />
            {!locked && <button type="button" className="sd-photo-x" aria-label="Remove photo" onClick={() => onRemove(i)}>×</button>}
            {locked ? <span className="sd-photo-cap">{[ph.category, ph.caption].filter(Boolean).join(" — ")}</span> : (
              <>
                <select className="apx-input sd-photo-cat" value={ph.category} onChange={(e) => onPatch(i, { category: e.target.value })} aria-label="Photo category">
                  {SVC_PHOTO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input className="apx-input sd-photo-capin" placeholder="Caption" value={ph.caption} onChange={(e) => onPatch(i, { caption: e.target.value })} />
              </>
            )}
          </div>
        ))}
        {!locked && (
          <button type="button" className="sd-photo-add" onClick={() => inputRef.current?.click()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            <span>{busy > 0 ? "…" : "Photo"}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={pick} />
    </div>
  );
}

export default function SvcDiagnose({ call, devices: knownDevices = [], surveyMap = null, initialDoc = null, savedAt: initialSavedAt = null, user, canManage = false, rates = [], warranty = null, onEstimate = null }) {
  const router = useRouter();
  const [pending, startTx] = useTransition();
  const [doc, setDoc] = useState(() => {
    const d = initialDoc || emptyDiagnosis();
    const have = new Set(d.devices.map((x) => x.id));
    d.devices = [...d.devices, ...knownDevices.filter((x) => !have.has(x.id))];
    if (!d.visit.techs.length && call.assignee_name) d.visit.techs = [call.assignee_name];
    return d;
  });
  const [open, setOpen] = useState(() => (doc.findings[0]?.id || null));
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [saveErr, setSaveErr] = useState("");
  const [dirty, setDirty] = useState(false);
  const [custName, setCustName] = useState(call.contact_name || "");
  const [newDev, setNewDev] = useState("");
  const [quick, setQuick] = useState("");
  const [sheet, setSheet] = useState(null);          // { kind, fid } — which selector is open
  const [pickFor, setPickFor] = useState(null);       // issue id whose devices the survey picker edits
  const [menuFor, setMenuFor] = useState(null);       // issue id whose ⋯ menu is open
  const [showMeta, setShowMeta] = useState(false);    // Type / Billing / manual times
  const [showExtra, setShowExtra] = useState(false);  // overall recommendation + internal notes
  const hasSurvey = !!(surveyMap && surveyMap.floors && surveyMap.floors.length && surveyMap.markers && surveyMap.markers.length);
  const locked = !!(call.tech_signed_at || call.customer_signed_at);
  const timer = useRef(null);

  const update = (fn) => { if (locked) return; setDoc((d) => fn(structuredClone(d))); setDirty(true); };
  useEffect(() => {
    if (!dirty || locked) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveSvcDiagnosisAction(call.svc_id, doc).catch(() => null);
      if (r?.ok) { setSavedAt(r.savedAt); setSaveErr(""); setDirty(false); } else setSaveErr(r?.error || "Not saved — check connection.");
    }, 800);
    return () => clearTimeout(timer.current);
  }, [doc, dirty, locked, call.svc_id]);

  const onSite = timeOnSite(doc.visit.arrival, doc.visit.departure);
  const followUp = needsFollowUp(doc);
  const suggestions = useMemo(() => (canManage ? suggestEstimate(doc, rates) : []), [doc, rates, canManage]);
  const docType = useMemo(() => documentModel({ call, doc, showCharges: false }).type, [call, doc]);

  const setF = (id, fn) => update((d) => { const f = d.findings.find((x) => x.id === id); if (f) fn(f); return d; });
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const devLabel = (id) => doc.devices.find((d) => d.id === id)?.label?.split(" — ")[0] || id;

  function addFinding(seed = "") {
    const f = emptyFinding(doc.systems[0] || "cctv", []);
    if (seed) f.finding = seed.slice(0, 800);
    update((d) => { d.findings.push(f); return d; });
    setOpen(f.id);
  }
  function addDevice() {
    const label = newDev.trim(); if (!label) return;
    update((d) => { d.devices.push({ id: `dev:${newId("d")}`, label: label.slice(0, 80), kind: "other" }); return d; });
    setNewDev("");
  }
  function quickToIssue() { const t = quick.trim(); if (!t) return; addFinding(t); setQuick(""); }
  function addTest(fid, key) { setF(fid, (x) => { x.tests = [...x.tests, { key, result: "NOT TESTED", note: "", at: nowHHMM() }]; }); setSheet(null); }
  function sign(who, name) { startTx(async () => { const r = await signSvcReportAction(call.svc_id, who, name); if (r?.ok) router.refresh(); else setSaveErr(r?.error || "Could not sign."); }); }
  function unsign() { startTx(async () => { const r = await unsignSvcReportAction(call.svc_id); if (r?.ok) router.refresh(); }); }
  function followUpNow() { startTx(async () => { const r = await createFollowUpAction(call.svc_id); if (r?.ok) router.push(`/service-calls/${r.svcId}`); }); }

  const sysValue = doc.systems.length ? SYSTEM_LABEL[doc.systems[0]] + (doc.systems.length > 1 ? ` +${doc.systems.length - 1}` : "") : "";
  const multiIssue = doc.findings.length > 1;

  return (
    <div className="panel svc-card sd">
      <div className="svc-card-h">Diagnosis
        <span className="sd-save">{saveErr ? <b className="sd-err">{saveErr}</b> : locked ? "Signed" : dirty ? "Saving…" : savedAt ? `Saved ${hhmm(savedAt)}` : ""}</span>
        <Link href={`/service-calls/${call.svc_id}/report`} className="sd-link">{({ "Service Call Report": "Report", "Service Diagnostic": "Diagnostic", "Service Call Proposal": "Proposal", "Warranty Service Report": "Report" })[docType] || "Report"}</Link>
      </div>

      {locked && (
        <div className="sd-locked">
          Signed{call.tech_signed_name ? ` · tech ${call.tech_signed_name}` : ""}{call.customer_signed_name ? ` · customer ${call.customer_signed_name}` : ""}
          {canManage && <button type="button" className="sd-ghost" onClick={unsign} disabled={pending}>Unsign</button>}
        </div>
      )}

      {/* Visit — Start / End, on-site time. Type + Billing + manual times hide under details. */}
      <div className="sd-visit">
        <div className="sd-visit-main">
          {doc.visit.arrival ? <span className="sd-visit-t">Arrived <b>{hhmm(doc.visit.arrival)}</b>{onSite.label ? <em> · {onSite.label}</em> : null}</span> : <span className="sd-visit-t sd-muted">Not started</span>}
          {!locked && (!doc.visit.arrival
            ? <button type="button" className="svc-inv-btn ghost" onClick={() => update((d) => { d.visit.arrival = nowHHMM(); return d; })}>Start visit</button>
            : !doc.visit.departure
              ? <button type="button" className="svc-inv-btn ghost" onClick={() => update((d) => { d.visit.departure = nowHHMM(); return d; })}>End visit</button>
              : <span className="sd-visit-t sd-muted">Departed <b>{hhmm(doc.visit.departure)}</b></span>)}
          <button type="button" className="sd-more" onClick={() => setShowMeta((v) => !v)} aria-label="Visit details" title="Visit details">•••</button>
        </div>
        {showMeta && (
          <div className="sd-meta">
            <label className="sd-f"><span>Type</span>
              <select className="apx-input" value={doc.callType} onChange={(e) => update((d) => { d.callType = e.target.value; return d; })} disabled={locked}>{SVC_CALL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="sd-f"><span>Billing</span>
              <select className="apx-input" value={doc.billing} onChange={(e) => update((d) => { d.billing = e.target.value; return d; })} disabled={locked}>{SVC_BILLING.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
            <label className="sd-f"><span>Arrived</span><input className="apx-input" type="time" value={doc.visit.arrival || ""} onChange={(e) => update((d) => { d.visit.arrival = e.target.value || null; return d; })} disabled={locked} /></label>
            <label className="sd-f"><span>Departed</span><input className="apx-input" type="time" value={doc.visit.departure || ""} onChange={(e) => update((d) => { d.visit.departure = e.target.value || null; return d; })} disabled={locked} /></label>
          </div>
        )}
      </div>
      {warranty && warranty.status !== "unknown" && (
        <div className={`sd-warranty ${warranty.status}`}>{warranty.status === "in" ? "In warranty" : "Out of warranty"} · until {warranty.until}</div>
      )}

      {/* System (call context) + Equipment */}
      <FieldRow label="System" value={sysValue} empty="Select system" disabled={locked} onClick={() => setSheet({ kind: "callsystem" })} />
      <div className="sd-sec sd-equip"><span className="sd-lab">Equipment{call.project_access_id ? <a className="sd-survey-link" href={`/project/${call.project_access_id}?deck=1&stage=survey`} target="_blank" rel="noreferrer">Open survey ↗</a> : null}</span>
        <div className="sd-chips">
          {doc.devices.map((dv) => <span key={dv.id} className={`sd-dev sd-dev-${dv.kind}`}>{dv.label}</span>)}
          {!doc.devices.length && <span className="sd-muted sd-nodev">None yet</span>}
          {!locked && <span className="sd-adddev"><input className="apx-input" placeholder="+ Device" value={newDev} onChange={(e) => setNewDev(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDevice(); } }} /></span>}
        </div>
      </div>

      {/* Quick diagnose — optional fast capture that seeds an issue. */}
      {!locked && (
        <div className="sd-quick">
          <div className="sd-mf"><input className="apx-input" placeholder="Describe what you found…" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickToIssue(); } }} />
            <span className="sd-mf-mic"><MicButton value={quick} onChange={setQuick} size={15} /></span></div>
          {quick.trim() && <button type="button" className="svc-inv-btn gold sd-quick-go" onClick={quickToIssue}>+ Issue</button>}
        </div>
      )}

      {/* Issues */}
      <div className="sd-lab sd-issues-lab">Issues</div>
      {doc.findings.map((f, idx) => {
        const isOpen = open === f.id;
        const { dev, chain } = issueLine(doc, f);
        const tone = f.outcome ? OUTCOME_TONE[f.outcome] || "warn" : "";
        const symptomValue = f.symptoms.filter((s) => s !== "Other").join(", ") || (f.observed ? "" : "");
        return (
          <div className={`sd-issue${isOpen ? " open" : ""}`} key={f.id}>
            <div className="sd-issue-h">
              <button type="button" className="sd-issue-tap" onClick={() => setOpen(isOpen ? null : f.id)}>
                <span className={`sd-dot ${tone || "muted"}`} />
                <b>Issue {idx + 1}</b>
                <span className="sd-issue-sum">{[dev, chain].filter(Boolean).join(" · ") || "New issue"}</span>
                <svg className="sd-issue-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {!locked && <div className="sd-menu-wrap">
                <button type="button" className="sd-menu-b" onClick={() => setMenuFor(menuFor === f.id ? null : f.id)} aria-label="Issue menu">•••</button>
                {menuFor === f.id && <div className="sd-menu" onMouseLeave={() => setMenuFor(null)}>
                  <button type="button" onClick={() => { update((d) => { const src = d.findings.find((x) => x.id === f.id); const c = structuredClone(src); c.id = newId(); d.findings.push(c); return d; }); setMenuFor(null); }}>Duplicate</button>
                  <button type="button" className="danger" onClick={() => { if (confirm("Delete this issue?")) update((d) => { d.findings = d.findings.filter((x) => x.id !== f.id); return d; }); setMenuFor(null); }}>Delete</button>
                </div>}
              </div>}
            </div>
            {isOpen && (
              <div className="sd-issue-b">
                <FieldRow label="Affected" value={f.deviceIds.map(devLabel).join(", ")} empty="Any device" disabled={locked} onClick={() => setSheet({ kind: "affected", fid: f.id })} />
                <FieldRow label="System" value={SYSTEM_LABEL[f.system]} disabled={locked} onClick={() => setSheet({ kind: "system", fid: f.id })} />
                <FieldRow label="Symptom" value={symptomValue} empty="Not set" disabled={locked} onClick={() => setSheet({ kind: "symptom", fid: f.id })} />
                {(f.symptoms.includes("Other") || f.observed) && <MicField placeholder="Observed" value={f.observed} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.observed = v; })} />}

                <FieldRow label="Tests" value={f.tests.length ? `${f.tests.length} test${f.tests.length === 1 ? "" : "s"}` : ""} empty="None" disabled={locked} onClick={() => setSheet({ kind: "tests", fid: f.id })} />
                {f.tests.length > 0 && <div className="sd-tests">
                  {f.tests.map((t, ti) => (
                    <div className="sd-test" key={ti}>
                      <span className="sd-test-nm">{TEST_LABEL[t.key] || t.key}{t.at ? <em> {t.at}</em> : null}</span>
                      <button type="button" className={`sd-test-r r-${t.result.replace(/ /g, "")}`} disabled={locked} onClick={() => setF(f.id, (x) => { x.tests[ti].result = RESULT_CYCLE[x.tests[ti].result] || "PASS"; })}>{t.result}</button>
                      {!locked && <button type="button" className="sd-test-re" title="Recheck" onClick={() => setF(f.id, (x) => { x.tests.push({ key: t.key, result: "NOT TESTED", note: "", at: nowHHMM() }); })}>↻</button>}
                      {!locked && <button type="button" className="sd-test-x" aria-label="Remove test" onClick={() => setF(f.id, (x) => { x.tests.splice(ti, 1); })}>×</button>}
                      {t.result === "FAIL" && <input className="apx-input sd-test-note" placeholder="Note" value={t.note} disabled={locked} onChange={(e) => setF(f.id, (x) => { x.tests[ti].note = e.target.value; })} />}
                    </div>
                  ))}
                </div>}

                <FieldRow label="Root cause" tone="cause" value={f.rootCauses.map((c) => CAUSE_LABEL[c]).join(" + ")} empty="Not identified" disabled={locked} onClick={() => setSheet({ kind: "cause", fid: f.id })} />
                <MicField placeholder="Finding — what you discovered" value={f.finding} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.finding = v; })} />
                <FieldRow label="Work" value={f.work.map((w) => WORK_LABEL[w]).join(", ")} empty="None" disabled={locked} onClick={() => setSheet({ kind: "work", fid: f.id })} />
                {(f.work.includes("other") || f.notes) && <MicField placeholder="Work note" value={f.notes} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.notes = v; })} />}
                <FieldRow label="Outcome" tone={tone} value={OUTCOME_LABEL[f.outcome]} empty="Open" disabled={locked} onClick={() => setSheet({ kind: "outcome", fid: f.id })} />
                <MicField placeholder="Recommendation for this issue" value={f.recommendation} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.recommendation = v; })} />

                {f.deviceIds.length > 0 && (
                  <details className="sd-perdev">
                    <summary>Per device</summary>
                    <div className="sd-devrows">
                      {f.deviceIds.map((id) => { const dv = doc.devices.find((d) => d.id === id); const st = doc.deviceState[id] || { status: "", fields: {} }; const cols = moduleFields(f.system); return (
                        <div className="sd-devrow" key={id}>
                          <b>{dv?.label || id}</b>
                          <select className="apx-input" value={st.status} aria-label={`${dv?.label || id} status`} disabled={locked}
                            onChange={(e) => update((d) => { d.deviceState[id] = { ...(d.deviceState[id] || { fields: {} }), status: e.target.value }; return d; })}>
                            <option value="">Status</option>{SVC_DEVICE_STATUS.map((o) => <option key={o.key} value={o.key}>{o.key.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
                          </select>
                          {cols.map(([k, l]) => <input key={k} className="apx-input" placeholder={l} value={st.fields?.[k] || ""} disabled={locked} aria-label={`${dv?.label || id} ${l}`}
                            onChange={(e) => update((d) => { const cur = d.deviceState[id] || { status: "", fields: {} }; d.deviceState[id] = { ...cur, fields: { ...(cur.fields || {}), [k]: e.target.value } }; return d; })} />)}
                        </div>); })}
                    </div>
                  </details>
                )}

                <PhotoStrip photos={doc.photos} findingId={f.id} projectId={call.project_access_id} locked={locked} compact
                  onAdd={(ph) => update((d) => { d.photos = [...(d.photos || []), ph]; return d; })}
                  onPatch={(i, patch) => update((d) => { d.photos = (d.photos || []).map((x, n) => (n === i ? { ...x, ...patch } : x)); return d; })}
                  onRemove={(i) => update((d) => { d.photos = (d.photos || []).filter((_, n) => n !== i); return d; })} />
              </div>
            )}
          </div>
        );
      })}
      {!locked && <button type="button" className="svc-inv-add" onClick={() => addFinding()}>+ Issue</button>}

      {/* Overall recommendation + internal notes — off by default. */}
      {(showExtra || multiIssue || doc.recommendations || doc.internalNotes) && (
        <div className="sd-extra">
          {(multiIssue || doc.recommendations) && <MicField textarea placeholder="Overall recommendation" value={doc.recommendations} disabled={locked} onValue={(v) => update((d) => { d.recommendations = v; return d; })} />}
          <div className="sd-internal-wrap"><MicField textarea placeholder="Internal notes — never on the customer report" value={doc.internalNotes} disabled={locked} title="Never on the customer report" onValue={(v) => update((d) => { d.internalNotes = v; return d; })} /></div>
        </div>
      )}
      {!showExtra && !multiIssue && !doc.recommendations && !doc.internalNotes && !locked && (
        <button type="button" className="sd-addnote" onClick={() => setShowExtra(true)}>+ Overall recommendation / notes</button>
      )}

      {/* Call-level photos not bound to any issue */}
      <PhotoStrip photos={doc.photos} projectId={call.project_access_id} locked={locked}
        onAdd={(ph) => update((d) => { d.photos = [...(d.photos || []), ph]; return d; })}
        onPatch={(i, patch) => update((d) => { d.photos = (d.photos || []).map((x, n) => (n === i ? { ...x, ...patch } : x)); return d; })}
        onRemove={(i) => update((d) => { d.photos = (d.photos || []).filter((_, n) => n !== i); return d; })} />

      <SvcDocumentEditor doc={doc} call={call} locked={locked} update={update} rates={rates} canManage={canManage} />

      {/* Actions */}
      <div className="sd-actions">
        {canManage && suggestions.length > 0 && onEstimate && !locked && (
          <button type="button" className="svc-inv-btn ghost" onClick={() => onEstimate(suggestions)} title={suggestions.map((l) => `${l.qty}× ${l.desc}`).join(", ")}>Estimate</button>
        )}
        {followUp && <button type="button" className="svc-inv-btn ghost" onClick={followUpNow} disabled={pending}>Follow-up</button>}
        {!call.tech_signed_at && <button type="button" className="svc-inv-btn ghost" onClick={() => sign("tech", user?.name)} disabled={pending}>Sign · tech</button>}
        {!call.customer_signed_at && (
          <span className="sd-sign">
            <input className="apx-input" placeholder="Customer name" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <button type="button" className="svc-inv-btn gold" onClick={() => sign("customer", custName)} disabled={pending || !custName.trim()}>Sign · customer</button>
          </span>
        )}
      </div>

      {/* Selectors — one at a time, choices revealed only on tap */}
      {sheet?.kind === "callsystem" && (
        <Selector title="System" multi options={opts(SVC_SYSTEMS)} selected={doc.systems} onClose={() => setSheet(null)}
          onToggle={(k) => update((d) => { d.systems = toggle(d.systems, k); return d; })} />
      )}
      {sheet?.kind === "system" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="System" options={opts(SVC_SYSTEMS)} selected={f?.system} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.system = k; x.symptoms = []; x.tests = []; })} />
      ); })()}
      {sheet?.kind === "symptom" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="Symptom" multi options={(SVC_SYMPTOMS[f?.system] || []).map((s) => ({ key: s, label: s }))} selected={f?.symptoms || []} suggested={suggestSymptoms(f?.system)} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.symptoms = toggle(x.symptoms, k); })} />
      ); })()}
      {sheet?.kind === "tests" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="Add test" options={SVC_TESTS.filter((t) => t.systems.includes(f?.system)).map((t) => ({ key: t.key, label: t.label }))} selected={[]} suggested={suggestTests(f?.system, f?.symptoms)} onClose={() => setSheet(null)}
          onToggle={(k) => addTest(sheet.fid, k)} />
      ); })()}
      {sheet?.kind === "cause" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="Root cause" multi options={opts(SVC_ROOT_CAUSES)} selected={f?.rootCauses || []} suggested={suggestRootCauses(f?.system, f?.symptoms, f?.tests)} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.rootCauses = toggle(x.rootCauses, k); })} />
      ); })()}
      {sheet?.kind === "work" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="Work performed" multi options={opts(SVC_WORK)} selected={f?.work || []} suggested={suggestWork(f?.rootCauses)} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.work = toggle(x.work, k); })} />
      ); })()}
      {sheet?.kind === "outcome" && (
        <Selector title="Outcome" options={opts(SVC_OUTCOMES)} selected={doc.findings.find((x) => x.id === sheet.fid)?.outcome} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.outcome = k; })} />
      )}
      {sheet?.kind === "affected" && (() => { const f = doc.findings.find((x) => x.id === sheet.fid); return (
        <Selector title="Affected devices" multi options={doc.devices.map((dv) => ({ key: dv.id, label: dv.label }))} selected={f?.deviceIds || []} onClose={() => setSheet(null)}
          onToggle={(k) => setF(sheet.fid, (x) => { x.deviceIds = toggle(x.deviceIds, k); })}>
          <div className="sd-sel-extra">
            <button type="button" className="sd-mini" onClick={() => setF(sheet.fid, (x) => { x.deviceIds = doc.devices.map((d) => d.id); })}>All</button>
            <button type="button" className="sd-mini" onClick={() => setF(sheet.fid, (x) => { x.deviceIds = []; })}>None</button>
            {hasSurvey && <button type="button" className="sd-mini sd-survey-btn" onClick={() => { const fid = sheet.fid; setSheet(null); setPickFor(fid); }}>Pick on survey</button>}
          </div>
        </Selector>
      ); })()}

      {pickFor && hasSurvey && (() => {
        const f = doc.findings.find((x) => x.id === pickFor);
        const sel = new Set(f?.deviceIds || []);
        const tog = (id) => setF(pickFor, (x) => { const set = new Set(x.deviceIds); set.has(id) ? set.delete(id) : set.add(id); x.deviceIds = [...set]; });
        return (
          <div className="svc-ov" onClick={(e) => { if (e.target === e.currentTarget) setPickFor(null); }}>
            <div className="sd-pick">
              <button type="button" className="sd-pick-x" onClick={() => setPickFor(null)} aria-label="Done">✕</button>
              <h2>Tap the affected devices</h2>
              {surveyMap.floors.map((fl, fi) => {
                const marks = surveyMap.markers.filter((m) => (m.floor || 0) === fi);
                if (!marks.length && surveyMap.floors.length > 1) return null;
                return (
                  <div className="sd-pick-floor" key={fi}>
                    {surveyMap.floors.length > 1 && <div className="sd-pick-fl-nm">{fl.name}</div>}
                    <div className="sd-pick-plan">
                      {fl.bg ? <img src={fl.bg} alt={fl.name} /> : <div className="sd-pick-noimg">No floor image</div>}
                      {marks.map((m) => (
                        <button type="button" key={m.id} className={`sd-pick-dot${sel.has(m.id) ? " on" : ""}`} style={{ left: `${m.x}%`, top: `${m.y}%` }} title={m.label} onClick={() => tog(m.id)}>
                          {(devLabel(m.id) || m.label || "").replace(/\s.*/, "").slice(0, 4) || "•"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="sd-pick-foot"><span>{(f?.deviceIds || []).length} selected</span><button type="button" className="svc-inv-btn gold" onClick={() => setPickFor(null)}>Done</button></div>
            </div>
          </div>
        );
      })()}

      <style>{CSS}</style>
    </div>
  );
}

