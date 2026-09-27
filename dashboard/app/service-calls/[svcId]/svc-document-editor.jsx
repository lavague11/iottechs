"use client";

import { useState } from "react";
import { SVC_OPTION_TYPES, emptyOption, autoSummary, deviceRows, CAUSE_LABEL } from "../../../lib/svc-model";

// The customer-facing document, edited in place: narrative overrides (generated text shown as the
// placeholder — leave blank to keep the generated version) and the repair-vs-replace options. The
// technician's findings, tests and timestamps are never touched here; this only shapes the report.
export default function SvcDocumentEditor({ doc, call, locked, update, canManage }) {
  const [open, setOpen] = useState(false);
  const findings = doc.findings || [];
  const gen = {
    incident: [call.issue, ...findings.map((f) => f.observed)].filter(Boolean).join(" "),
    summary: autoSummary(doc),
    rootCause: findings.map((f) => f.finding).filter(Boolean).join(" ") || [...new Set(findings.flatMap((f) => f.rootCauses || []))].map((c) => CAUSE_LABEL[c]).join(", "),
    recommendation: doc.recommendations || findings.map((f) => f.recommendation).filter(Boolean).join(" "),
  };
  const setN = (k, v) => update((d) => { d.narrative = { ...(d.narrative || {}), [k]: v }; return d; });
  const setO = (id, fn) => update((d) => { const o = d.options.find((x) => x.id === id); if (o) fn(o); return d; });
  const rows = deviceRows(doc);

  return (
    <div className="sde">
      <button type="button" className="sde-h" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Document
        <span className="sde-sub">{rows.length ? `${rows.length} device${rows.length === 1 ? "" : "s"}` : ""}{doc.options?.length ? ` · ${doc.options.length} option${doc.options.length === 1 ? "" : "s"}` : ""}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="sde-b">
          {[["incident", "Incident"], ["summary", "Summary"], ["rootCause", "Root cause"], ["recommendation", "Recommendation"]].map(([k, l]) => (
            <label className="sde-f" key={k}><span>{l}{!doc.narrative?.[k] && gen[k] ? <em>generated</em> : null}</span>
              <textarea className="apx-input" rows={2} value={doc.narrative?.[k] || ""} placeholder={gen[k] || "—"} disabled={locked} onChange={(e) => setN(k, e.target.value)} />
            </label>
          ))}

          <div className="sde-opts">
            {(doc.options || []).map((o) => (
              <div className={`sde-opt${o.recommended ? " rec" : ""}`} key={o.id}>
                <div className="sde-opt-row">
                  <select className="apx-input" value={o.type} disabled={locked} aria-label="Option type" onChange={(e) => setO(o.id, (x) => { x.type = e.target.value; })}>{SVC_OPTION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  <input className="apx-input" placeholder="Title" value={o.title} disabled={locked} aria-label="Option title" onChange={(e) => setO(o.id, (x) => { x.title = e.target.value; })} />
                  <label className="sde-rec"><input type="radio" name="sde-rec" checked={!!o.recommended} disabled={locked} onChange={() => update((d) => { d.options.forEach((x) => { x.recommended = x.id === o.id; }); return d; })} /> Recommended</label>
                  {!locked && <button type="button" className="sde-x" aria-label="Remove option" onClick={() => update((d) => { d.options = d.options.filter((x) => x.id !== o.id); return d; })}>×</button>}
                </div>
                <input className="apx-input" placeholder="Description" value={o.description} disabled={locked} onChange={(e) => setO(o.id, (x) => { x.description = e.target.value; })} />
                <textarea className="apx-input" rows={2} placeholder="Points — one per line" value={o.bullets.join("\n")} disabled={locked} onChange={(e) => setO(o.id, (x) => { x.bullets = e.target.value.split("\n").slice(0, 8); })} />
                <div className="sde-opt-row">
                  <select className="apx-input" value={o.costSource} disabled={locked} aria-label="Cost" onChange={(e) => setO(o.id, (x) => { x.costSource = e.target.value; })}>
                    <option value="none">No price</option>
                    {canManage && <option value="estimate">Estimate total</option>}
                    {canManage && <option value="proposal">Proposal total</option>}
                    <option value="range">Range</option>
                  </select>
                  {o.costSource === "range" && <>
                    <input className="apx-input sde-num" type="number" min="0" step="1" placeholder="Low" value={o.low ?? ""} disabled={locked} aria-label="Low" onChange={(e) => setO(o.id, (x) => { x.low = e.target.value === "" ? null : +e.target.value; })} />
                    <input className="apx-input sde-num" type="number" min="0" step="1" placeholder="High" value={o.high ?? ""} disabled={locked} aria-label="High" onChange={(e) => setO(o.id, (x) => { x.high = e.target.value === "" ? null : +e.target.value; })} />
                  </>}
                  <input className="apx-input" placeholder="Warranty" value={o.warranty} disabled={locked} onChange={(e) => setO(o.id, (x) => { x.warranty = e.target.value; })} />
                  <input className="apx-input" placeholder="Reliability" value={o.reliability} disabled={locked} onChange={(e) => setO(o.id, (x) => { x.reliability = e.target.value; })} />
                </div>
              </div>
            ))}
            {!locked && (doc.options || []).length < 4 && (
              <div className="sde-add">
                <button type="button" className="svc-inv-add" onClick={() => update((d) => { d.options.push(emptyOption("repair")); return d; })}>+ Repair</button>
                <button type="button" className="svc-inv-add" onClick={() => update((d) => { d.options.push({ ...emptyOption("replace"), recommended: !d.options.some((x) => x.recommended) }); return d; })}>+ Replace</button>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.apx .sde{margin-top:12px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.apx .sde-h{width:100%;display:flex;align-items:center;gap:10px;padding:11px 13px;background:#fff;border:none;cursor:pointer;font-family:inherit;font-size:.9rem;font-weight:800;color:var(--ink);text-align:left}
.apx .sde-sub{font-size:.76rem;font-weight:600;color:var(--muted)}
.apx .sde-b{padding:4px 13px 13px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.apx .sde-f{display:flex;flex-direction:column;gap:4px;font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding-top:6px}
.apx .sde-f em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none;color:var(--gold-deep,#b08f4f);margin-left:8px}
.apx .sde-f textarea,.apx .sde-opt .apx-input{font-size:.84rem;padding:8px 10px}
.apx .sde-opt select.apx-input,.apx .sde-opt input.apx-input{height:34px;padding:0 9px}
.apx .sde-opts{display:flex;flex-direction:column;gap:10px}
.apx .sde-opt{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--line);border-left:3px solid #5a6378;border-radius:10px;background:var(--bg-soft,#f4f4f2)}
.apx .sde-opt.rec{border-left-color:var(--gold,#C9A96E)}
.apx .sde-opt-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.apx .sde-opt-row>.apx-input{flex:1;min-width:110px}
.apx .sde-opt-row>select.apx-input{flex:0 0 150px}
.apx .sde-num{flex:0 0 90px!important;min-width:0!important}
.apx .sde-rec{display:flex;align-items:center;gap:5px;font-size:.76rem;font-weight:700;color:var(--ink);white-space:nowrap}
.apx .sde-x{width:30px;height:30px;border:none;background:none;color:var(--muted);font-size:1.1rem;cursor:pointer;border-radius:7px}
.apx .sde-x:hover{background:#fdecec;color:#c9382b}
.apx .sde-add{display:flex;gap:8px}
`;
