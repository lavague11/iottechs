"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveSvcDiagnosisAction, signSvcReportAction, unsignSvcReportAction, createFollowUpAction } from "../actions";
import { SVC_CALL_TYPES, SVC_SYSTEMS, SVC_SYMPTOMS, SVC_ROOT_CAUSES, SVC_TESTS, SVC_WORK, SVC_OUTCOMES, SVC_BILLING, CAUSE_LABEL, OUTCOME_LABEL, emptyDiagnosis, emptyFinding, emptyOption, timeOnSite, suggestEstimate, needsFollowUp, newId, SVC_DEVICE_STATUS, SVC_OPTION_TYPES, moduleFields, deviceRows, autoSummary, documentModel } from "../../../lib/svc-model";
import SvcDocumentEditor from "./svc-document-editor";
import MicButton from "../../components/mic-button";
import { SVC_PHOTO_CATEGORIES } from "../../../lib/svc-model";

// The diagnostic chain for one call, autosaved server-side (debounced). Progressive: devices →
// system → symptoms → tests → root cause → work → outcome, one card per finding; one finding can
// cover many devices. Signed reports are frozen. Retail suggestions (Estimate) stay admin/manager.

const Chip = ({ on, children, onClick, tone = "", title }) => (
  <button type="button" className={`sd-chip${on ? " on" : ""}${tone ? ` ${tone}` : ""}`} onClick={onClick} title={title} aria-pressed={!!on}>{children}</button>
);
// Server rows carry SQLite local time ("YYYY-MM-DD HH:MM:SS"); the save action returns an ISO instant.
const hhmm = (v) => { const s = String(v || ""); if (/Z$|[+-]\d\d:\d\d$/.test(s)) { const d = new Date(s); return Number.isNaN(d) ? s.slice(11, 16) : d.toTimeString().slice(0, 5); } return s.slice(11, 16); };
const NEXT_RESULT = { undefined: "PASS", PASS: "FAIL", FAIL: "NOT TESTED", "NOT TESTED": undefined };

// A text field (input or textarea) with the shared multilingual dictation mic docked in the corner —
// the same MicButton the Bug Report tool uses. Speaking appends to whatever is typed.
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

// Photos on the call — capture or attach, categorize, caption. Reuses /api/media (kind service-photo),
// the same upload path as the Bug Report tool; stores { url, category, caption } on the diagnosis doc.
function PhotoStrip({ photos, projectId, locked, onAdd, onPatch, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(0);
  async function pick(e) {
    const files = [...(e.target.files || [])]; e.target.value = "";
    for (const file of files) {
      setBusy((n) => n + 1);
      try {
        const fd = new FormData(); fd.append("file", file, file.name || "photo.jpg"); fd.append("kind", "service-photo"); if (projectId) fd.append("project", projectId);
        const j = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (j?.ok && j.url) onAdd({ url: j.url, category: "Other", caption: "" });
      } finally { setBusy((n) => n - 1); }
    }
  }
  return (
    <div className="sd-photos">
      <div className="sd-lab">Photos{busy > 0 ? " · uploading…" : ""}</div>
      <div className="sd-photo-grid">
        {(photos || []).map((ph, i) => (
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
            <span>Photo</span>
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
    // Known devices from the linked system are merged in (ids are stable) so old findings keep pointing at them.
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
  const [pickFor, setPickFor] = useState(null);       // finding id whose devices the survey picker edits
  const hasSurvey = !!(surveyMap && surveyMap.floors && surveyMap.floors.length && surveyMap.markers && surveyMap.markers.length);
  const locked = !!(call.tech_signed_at || call.customer_signed_at);
  const timer = useRef(null);

  // Autosave: 800ms after the last change. Server is canonical; the page can be closed at any time.
  const update = (fn) => { if (locked) return; setDoc((d) => { const n = fn(structuredClone(d)); return n; }); setDirty(true); };
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
  function addFinding() {
    const f = emptyFinding(doc.systems[0] || "cctv", []);
    update((d) => { d.findings.push(f); return d; });
    setOpen(f.id);
  }
  function addDevice() {
    const label = newDev.trim(); if (!label) return;
    update((d) => { d.devices.push({ id: `dev:${newId("d")}`, label: label.slice(0, 80), kind: "other" }); return d; });
    setNewDev("");
  }
  function sign(who, name) { startTx(async () => { const r = await signSvcReportAction(call.svc_id, who, name); if (r?.ok) router.refresh(); else setSaveErr(r?.error || "Could not sign."); }); }
  function unsign() { startTx(async () => { const r = await unsignSvcReportAction(call.svc_id); if (r?.ok) router.refresh(); }); }
  function followUpNow() { startTx(async () => { const r = await createFollowUpAction(call.svc_id); if (r?.ok) router.push(`/service-calls/${r.svcId}`); }); }

  const summary = (f) => [f.deviceIds.map((id) => doc.devices.find((d) => d.id === id)?.label.split(" — ")[0] || id).join(", "), f.symptoms[0], f.rootCauses.map((c) => CAUSE_LABEL[c]).join(" + "), OUTCOME_LABEL[f.outcome]].filter(Boolean).join(" · ") || "New finding";

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

      {/* Visit */}
      <div className="sd-row4">
        <label className="sd-f"><span>Type</span>
          <select className="apx-input" value={doc.callType} onChange={(e) => update((d) => { d.callType = e.target.value; return d; })} disabled={locked}>{SVC_CALL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="sd-f"><span>Billing</span>
          <select className="apx-input" value={doc.billing} onChange={(e) => update((d) => { d.billing = e.target.value; return d; })} disabled={locked}>{SVC_BILLING.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></label>
        <label className="sd-f"><span>Arrived</span><input className="apx-input" type="time" value={doc.visit.arrival || ""} onChange={(e) => update((d) => { d.visit.arrival = e.target.value || null; return d; })} disabled={locked} /></label>
        <label className="sd-f"><span>Departed {onSite.label && <em>{onSite.label}</em>}</span><input className="apx-input" type="time" value={doc.visit.departure || ""} onChange={(e) => update((d) => { d.visit.departure = e.target.value || null; return d; })} disabled={locked} /></label>
      </div>
      {warranty && warranty.status !== "unknown" && (
        <div className={`sd-warranty ${warranty.status}`}>{warranty.status === "in" ? "In warranty" : "Out of warranty"} · until {warranty.until}</div>
      )}

      {/* Systems */}
      <div className="sd-sec"><span className="sd-lab">System</span>
        <div className="sd-chips">{SVC_SYSTEMS.map((s) => <Chip key={s.key} on={doc.systems.includes(s.key)} onClick={() => update((d) => { d.systems = toggle(d.systems, s.key); return d; })}>{s.label}</Chip>)}</div>
      </div>

      {/* Equipment */}
      <div className="sd-sec"><span className="sd-lab">Equipment{call.project_access_id ? <a className="sd-survey-link" href={`/project/${call.project_access_id}?deck=1&stage=survey`} target="_blank" rel="noreferrer">Open survey ↗</a> : null}</span>
        <div className="sd-chips">
          {doc.devices.map((dv) => <span key={dv.id} className={`sd-dev sd-dev-${dv.kind}`}>{dv.label}</span>)}
          {!locked && <span className="sd-adddev"><input className="apx-input" placeholder="+ Device" value={newDev} onChange={(e) => setNewDev(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDevice(); } }} /></span>}
        </div>
      </div>

      {/* Findings */}
      {doc.findings.map((f) => {
        const isOpen = open === f.id;
        const tests = SVC_TESTS.filter((t) => t.systems.includes(f.system));
        return (
          <div className={`sd-find${isOpen ? " open" : ""}`} key={f.id}>
            <button type="button" className="sd-find-h" onClick={() => setOpen(isOpen ? null : f.id)}>
              <b>{summary(f)}</b>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {isOpen && (
              <div className="sd-find-b">
                <div className="sd-step"><span className="sd-lab">Affected</span>
                  <div className="sd-chips">
                    {doc.devices.map((dv) => <Chip key={dv.id} on={f.deviceIds.includes(dv.id)} onClick={() => setF(f.id, (x) => { x.deviceIds = toggle(x.deviceIds, dv.id); })}>{dv.label}</Chip>)}
                    {doc.devices.length > 1 && <>
                      <button type="button" className="sd-mini" onClick={() => setF(f.id, (x) => { x.deviceIds = doc.devices.map((d) => d.id); })}>All</button>
                      <button type="button" className="sd-mini" onClick={() => setF(f.id, (x) => { x.deviceIds = []; })}>None</button>
                    </>}
                    {hasSurvey && !locked && <button type="button" className="sd-mini sd-survey-btn" onClick={() => setPickFor(f.id)}>Pick on survey</button>}
                  </div>
                </div>
                <div className="sd-step"><span className="sd-lab">Symptom</span>
                  <select className="apx-input sd-sys" value={f.system} onChange={(e) => setF(f.id, (x) => { x.system = e.target.value; x.symptoms = []; x.tests = []; })} disabled={locked} aria-label="System">{SVC_SYSTEMS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <div className="sd-chips">{(SVC_SYMPTOMS[f.system] || []).map((s) => <Chip key={s} on={f.symptoms.includes(s)} onClick={() => setF(f.id, (x) => { x.symptoms = toggle(x.symptoms, s); })}>{s}</Chip>)}</div>
                  {(f.symptoms.includes("Other") || f.observed) && <MicField placeholder="Observed" value={f.observed} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.observed = v; })} />}
                </div>
                <div className="sd-step"><span className="sd-lab">Tests</span>
                  <div className="sd-chips">
                    {tests.map((t) => { const r = f.tests.find((x) => x.key === t.key); return (
                      <Chip key={t.key} on={!!r} tone={r ? `r-${r.result.replace(" ", "")}` : ""} title="Tap: PASS → FAIL → NOT TESTED → clear"
                        onClick={() => setF(f.id, (x) => { const cur = x.tests.find((y) => y.key === t.key); const nx = NEXT_RESULT[cur?.result]; x.tests = x.tests.filter((y) => y.key !== t.key); if (nx) x.tests.push({ key: t.key, result: nx, note: cur?.note || "" }); })}>
                        {t.label}{r ? <i>{r.result}</i> : null}
                      </Chip>); })}
                  </div>
                  {f.tests.filter((t) => t.result === "FAIL").map((t) => (
                    <input key={t.key} className="apx-input sd-note" placeholder={`${SVC_TESTS.find((x) => x.key === t.key)?.label} — note`} value={t.note} onChange={(e) => setF(f.id, (x) => { const y = x.tests.find((z) => z.key === t.key); if (y) y.note = e.target.value; })} disabled={locked} />
                  ))}
                </div>
                <div className="sd-step"><span className="sd-lab">Root cause</span>
                  <div className="sd-chips">{SVC_ROOT_CAUSES.map((c) => <Chip key={c.key} on={f.rootCauses.includes(c.key)} tone="cause" onClick={() => setF(f.id, (x) => { x.rootCauses = toggle(x.rootCauses, c.key); })}>{c.label}</Chip>)}</div>
                  <MicField placeholder="Finding" value={f.finding} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.finding = v; })} />
                  <MicField placeholder="Recommendation" value={f.recommendation} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.recommendation = v; })} />
                </div>
                <div className="sd-step"><span className="sd-lab">Work</span>
                  <div className="sd-chips">{SVC_WORK.map((w) => <Chip key={w.key} on={f.work.includes(w.key)} onClick={() => setF(f.id, (x) => { x.work = toggle(x.work, w.key); })}>{w.label}</Chip>)}</div>
                  {(f.work.includes("other") || f.notes) && <MicField placeholder="Notes" value={f.notes} disabled={locked} onValue={(v) => setF(f.id, (x) => { x.notes = v; })} />}
                </div>
                {f.deviceIds.length > 0 && (
                  <div className="sd-step"><span className="sd-lab">Per device</span>
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
                  </div>
                )}
                <div className="sd-step sd-out"><span className="sd-lab">Outcome</span>
                  <select className="apx-input" value={f.outcome} onChange={(e) => setF(f.id, (x) => { x.outcome = e.target.value; })} disabled={locked} aria-label="Outcome">
                    <option value="">—</option>{SVC_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {!locked && <button type="button" className="sd-del" onClick={() => update((d) => { d.findings = d.findings.filter((x) => x.id !== f.id); return d; })} aria-label="Remove finding">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                  </button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!locked && <button type="button" className="svc-inv-add" onClick={addFinding}>+ Finding</button>}

      <MicField textarea placeholder="Recommendations" value={doc.recommendations} disabled={locked} onValue={(v) => update((d) => { d.recommendations = v; return d; })} />
      <div className="sd-internal-wrap"><MicField textarea placeholder="Internal notes" value={doc.internalNotes} disabled={locked} title="Never on the customer report" onValue={(v) => update((d) => { d.internalNotes = v; return d; })} /></div>

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

      {pickFor && hasSurvey && (() => {
        const f = doc.findings.find((x) => x.id === pickFor);
        const sel = new Set(f?.deviceIds || []);
        const toggle = (id) => setF(pickFor, (x) => { const set = new Set(x.deviceIds); set.has(id) ? set.delete(id) : set.add(id); x.deviceIds = [...set]; });
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
                        <button type="button" key={m.id} className={`sd-pick-dot${sel.has(m.id) ? " on" : ""}`} style={{ left: `${m.x}%`, top: `${m.y}%` }} title={m.label} onClick={() => toggle(m.id)}>
                          {(doc.devices.find((d) => d.id === m.id)?.label || m.label || "").replace(/\s.*/, "").slice(0, 4) || "•"}
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

const CSS = `
.apx .sd-save{margin-left:auto;font-size:.74rem;font-weight:600;color:var(--muted)}
.apx .sd-err{color:#c9382b}
.apx .sd-link{font-size:.78rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:5px 12px}
.apx .sd-link:hover{border-color:#C9A96E;background:#f8f0e0}
.apx .sd-locked{display:flex;align-items:center;gap:10px;font-size:.82rem;font-weight:700;color:#1c8a45;background:#e7f6ec;border-radius:9px;padding:8px 12px;margin-bottom:12px}
.apx .sd-ghost{margin-left:auto;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px 10px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;color:var(--ink)}
.apx .sd-row4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
@media(max-width:640px){.apx .sd-row4{grid-template-columns:1fr 1fr}}
.apx .sd-f{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--muted)}
.apx .sd-f em{font-style:normal;color:var(--ink);margin-left:6px}
.apx .sd-f .apx-input{height:36px;padding:0 9px;font-size:.84rem}
.apx .sd-warranty{display:inline-block;font-size:.74rem;font-weight:800;border-radius:20px;padding:3px 10px;margin-bottom:10px}
.apx .sd-warranty.in{color:#1c8a45;background:#e7f6ec}
.apx .sd-warranty.out{color:#b3541e;background:#fdf0e5}
.apx .sd-sec{margin-bottom:12px}
.apx .sd-lab{display:block;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.apx .sd-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.apx .sd-chip{font-size:.78rem;font-weight:600;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:20px;padding:6px 11px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;min-height:34px}
.apx .sd-chip:hover{border-color:#C9A96E}
.apx .sd-chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.apx .sd-chip.cause.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f)}
.apx .sd-chip i{font-style:normal;font-size:.62rem;font-weight:800;letter-spacing:.04em;padding:1px 6px;border-radius:10px;background:rgba(255,255,255,.18)}
.apx .sd-chip.r-PASS{background:#1c8a45;border-color:#1c8a45;color:#fff}
.apx .sd-chip.r-FAIL{background:#c9382b;border-color:#c9382b;color:#fff}
.apx .sd-chip.r-NOTTESTED{background:#8a94a8;border-color:#8a94a8;color:#fff}
.apx .sd-dev{font-size:.78rem;font-weight:600;color:var(--ink);background:var(--bg-soft,#f4f4f2);border:1px solid var(--line);border-radius:20px;padding:6px 11px}
.apx .sd-dev-nvr{background:#f8f0e0;color:#8a6d2f}
.apx .sd-adddev .apx-input{height:34px;width:130px;padding:0 10px;font-size:.8rem;border-radius:20px}
.apx .sd-find{border:1px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:hidden}
.apx .sd-find.open{border-color:#C9A96E}
.apx .sd-find-h{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:#fff;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink)}
.apx .sd-find-h b{font-size:.86rem;font-weight:700}
.apx .sd-find-b{padding:4px 13px 13px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:12px}
.apx .sd-step{display:flex;flex-direction:column;gap:6px;padding-top:8px}
.apx .sd-step .apx-input{height:36px;padding:0 10px;font-size:.84rem}
.apx .sd-sys{max-width:260px}
.apx .sd-note{border-left:3px solid #c9382b}
.apx .sd-mini{font-size:.7rem;font-weight:800;color:var(--muted);background:none;border:none;cursor:pointer;font-family:inherit;padding:4px 6px}
.apx .sd-mini:hover{color:var(--ink)}
.apx .sd-out{flex-direction:row;align-items:flex-end;gap:8px}
.apx .sd-out .sd-lab{width:100%}
.apx .sd-out select{flex:1;max-width:280px}
.apx .sd-del{width:36px;height:36px;border:none;border-radius:8px;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center;margin-left:auto}
.apx .sd-del:hover{background:#fdecec;color:#c9382b}
.apx .sd-out{flex-wrap:wrap}
.apx .sd-devrows{display:flex;flex-direction:column;gap:6px}
.apx .sd-devrow{display:grid;grid-template-columns:minmax(90px,1.2fr) 130px repeat(auto-fit,minmax(80px,1fr));gap:6px;align-items:center}
.apx .sd-devrow b{font-size:.8rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apx .sd-devrow .apx-input{height:32px;padding:0 8px;font-size:.78rem}
@media(max-width:640px){.apx .sd-devrow{grid-template-columns:1fr 1fr}.apx .sd-devrow b{grid-column:1/-1}}
.apx .sd-ta{margin-top:10px;padding:9px 10px;font-size:.86rem;resize:vertical}
.apx .sd-internal{background:#fbf8f0;border-style:dashed}
.apx .sd-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.apx .sd-sign{display:flex;gap:6px;align-items:center;margin-left:auto}
.apx .sd-sign .apx-input{height:38px;width:170px;padding:0 10px;font-size:.84rem}

.apx .sd-mf{position:relative}
.apx .sd-mf .apx-input{padding-right:34px}
.apx .sd-mf-mic{position:absolute;right:6px;top:6px;display:inline-flex}
.apx .sd-internal-wrap .apx-input{background:#fbf8f0;border-style:dashed}
.apx .sd-photos{margin-top:12px}
.apx .sd-photo-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.apx .sd-photo{position:relative;width:132px;display:flex;flex-direction:column;gap:4px}
.apx .sd-photo img{width:132px;height:96px;object-fit:cover;border-radius:9px;border:1px solid var(--line)}
.apx .sd-photo-x{position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(16,20,24,.7);color:#fff;font-size:15px;line-height:1;cursor:pointer}
.apx .sd-photo-cat{height:28px;padding:0 6px;font-size:.72rem}
.apx .sd-photo-capin{height:28px;padding:0 8px;font-size:.76rem}
.apx .sd-photo-cap{font-size:.72rem;color:var(--muted)}
.apx .sd-photo-add{width:132px;height:96px;border:1.5px dashed var(--line);border-radius:9px;background:none;color:var(--gold-deep,#b08f4f);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
.apx .sd-photo-add:hover{border-color:#C9A96E;background:#fdfaf2}

.apx .sd-survey-btn{color:var(--gold-deep,#b08f4f)}
.apx .sd-survey-link{margin-left:10px;font-size:.72rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;text-transform:none;letter-spacing:0}
.apx .sd-survey-link:hover{text-decoration:underline}
.sd-pick{width:100%;max-width:560px;max-height:90vh;overflow-y:auto;background:#fff;border-radius:18px;padding:24px 22px;position:relative;box-shadow:0 30px 80px -30px rgba(14,19,32,.5);color:var(--ink)}
.sd-pick-x{position:absolute;top:13px;right:15px;background:none;border:none;font-size:1.05rem;color:var(--muted);cursor:pointer;width:30px;height:30px;border-radius:8px}
.sd-pick-x:hover{background:var(--bg-soft,#f4f4f2)}
.sd-pick h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.2rem;margin:0 0 14px}
.sd-pick-fl-nm{font-size:.78rem;font-weight:700;color:var(--muted);margin:10px 0 4px}
.sd-pick-plan{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg-soft,#f4f4f2)}
.sd-pick-plan img{display:block;width:100%}
.sd-pick-noimg{padding:40px;text-align:center;color:var(--muted);font-size:.85rem}
.sd-pick-dot{position:absolute;transform:translate(-50%,-50%);min-width:26px;height:26px;padding:0 6px;border-radius:13px;border:2px solid #fff;background:#5a6378;color:#fff;font-size:.66rem;font-weight:800;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.4)}
.sd-pick-dot.on{background:var(--gold-deep,#b08f4f);outline:2px solid var(--gold,#C9A96E);outline-offset:1px}
.sd-pick-foot{display:flex;align-items:center;justify-content:space-between;margin-top:16px;font-size:.84rem;color:var(--muted)}
`;
