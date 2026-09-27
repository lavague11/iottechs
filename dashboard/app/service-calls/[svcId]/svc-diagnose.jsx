"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveSvcDiagnosisAction, signSvcReportAction, unsignSvcReportAction, createFollowUpAction } from "../actions";
import { SVC_CALL_TYPES, SVC_SYSTEMS, SVC_SYMPTOMS, SVC_ROOT_CAUSES, SVC_TESTS, SVC_WORK, SVC_OUTCOMES, SVC_BILLING, SYSTEM_LABEL, CAUSE_LABEL, OUTCOME_LABEL, emptyDiagnosis, emptyFinding, timeOnSite, suggestEstimate, needsFollowUp, newId } from "../../../lib/svc-model";

// The diagnostic chain for one call, autosaved server-side (debounced). Progressive: devices →
// system → symptoms → tests → root cause → work → outcome, one card per finding; one finding can
// cover many devices. Signed reports are frozen. Retail suggestions (Estimate) stay admin/manager.

const Chip = ({ on, children, onClick, tone = "", title }) => (
  <button type="button" className={`sd-chip${on ? " on" : ""}${tone ? ` ${tone}` : ""}`} onClick={onClick} title={title} aria-pressed={!!on}>{children}</button>
);
// Server rows carry SQLite local time ("YYYY-MM-DD HH:MM:SS"); the save action returns an ISO instant.
const hhmm = (v) => { const s = String(v || ""); if (/Z$|[+-]\d\d:\d\d$/.test(s)) { const d = new Date(s); return Number.isNaN(d) ? s.slice(11, 16) : d.toTimeString().slice(0, 5); } return s.slice(11, 16); };
const NEXT_RESULT = { undefined: "PASS", PASS: "FAIL", FAIL: "NOT TESTED", "NOT TESTED": undefined };

export default function SvcDiagnose({ call, devices: knownDevices = [], initialDoc = null, savedAt: initialSavedAt = null, user, canManage = false, rates = [], warranty = null, onEstimate = null }) {
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
        <Link href={`/service-calls/${call.svc_id}/report`} className="sd-link">Report</Link>
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
      <div className="sd-sec"><span className="sd-lab">Equipment</span>
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
                  </div>
                </div>
                <div className="sd-step"><span className="sd-lab">Symptom</span>
                  <select className="apx-input sd-sys" value={f.system} onChange={(e) => setF(f.id, (x) => { x.system = e.target.value; x.symptoms = []; x.tests = []; })} disabled={locked} aria-label="System">{SVC_SYSTEMS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                  <div className="sd-chips">{(SVC_SYMPTOMS[f.system] || []).map((s) => <Chip key={s} on={f.symptoms.includes(s)} onClick={() => setF(f.id, (x) => { x.symptoms = toggle(x.symptoms, s); })}>{s}</Chip>)}</div>
                  {(f.symptoms.includes("Other") || f.observed) && <input className="apx-input" placeholder="Observed" value={f.observed} onChange={(e) => setF(f.id, (x) => { x.observed = e.target.value; })} disabled={locked} />}
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
                  <input className="apx-input" placeholder="Finding" value={f.finding} onChange={(e) => setF(f.id, (x) => { x.finding = e.target.value; })} disabled={locked} />
                  <input className="apx-input" placeholder="Recommendation" value={f.recommendation} onChange={(e) => setF(f.id, (x) => { x.recommendation = e.target.value; })} disabled={locked} />
                </div>
                <div className="sd-step"><span className="sd-lab">Work</span>
                  <div className="sd-chips">{SVC_WORK.map((w) => <Chip key={w.key} on={f.work.includes(w.key)} onClick={() => setF(f.id, (x) => { x.work = toggle(x.work, w.key); })}>{w.label}</Chip>)}</div>
                  {(f.work.includes("other") || f.notes) && <input className="apx-input" placeholder="Notes" value={f.notes} onChange={(e) => setF(f.id, (x) => { x.notes = e.target.value; })} disabled={locked} />}
                </div>
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

      <textarea className="apx-input sd-ta" rows={2} placeholder="Recommendations" value={doc.recommendations} onChange={(e) => update((d) => { d.recommendations = e.target.value; return d; })} disabled={locked} />
      <textarea className="apx-input sd-ta sd-internal" rows={2} placeholder="Internal notes" value={doc.internalNotes} onChange={(e) => update((d) => { d.internalNotes = e.target.value; return d; })} disabled={locked} title="Never on the customer report" />

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
.apx .sd-ta{margin-top:10px;padding:9px 10px;font-size:.86rem;resize:vertical}
.apx .sd-internal{background:#fbf8f0;border-style:dashed}
.apx .sd-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.apx .sd-sign{display:flex;gap:6px;align-items:center;margin-left:auto}
.apx .sd-sign .apx-input{height:38px;width:170px;padding:0 10px;font-size:.84rem}
`;
