"use client";

import { useState } from "react";
import { TRAINING_MODULES, P3_FLOW, FIELD_JOBS_REQUIRED, CERT_TIERS, QUALIFICATIONS, statusLabel, nextP3Status, trainingProgress } from "../../../lib/hiring";
import { startTrainingAction, advanceTrainingAction, signFieldJobAction, setCertAction, approveTechnicianAction, revokeCertificationAction } from "../../training/[appId]/actions";

export default function TrainingPanel({ appId, status, training }) {
  const [status0, setStatus] = useState(status);
  const [t, setT] = useState(training || { modules: {}, tier: null, badges: [] });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const prog = trainingProgress(t);
  const approved = status0 === "approved";

  async function call(k, fn, opt) {
    setBusy(k); setMsg("");
    try { const r = await fn(); if (r?.ok) opt?.(r); else setMsg(r?.error || "Failed."); } catch { setMsg("Failed."); }
    setBusy("");
  }
  const start = () => call("start", () => startTrainingAction(appId), (r) => setStatus(r.status));
  const advance = () => call("adv", () => advanceTrainingAction(appId), (r) => setStatus(r.status));
  const signField = () => call("field", () => signFieldJobAction(appId, ""), (r) => setT((p) => ({ ...p, modules: { ...p.modules, field_training: { ...(p.modules?.field_training || {}), count: r.count, status: r.count >= FIELD_JOBS_REQUIRED ? "done" : "in_progress" } } })));
  const toggleBadge = (key) => { const has = (t.badges || []).includes(key); const badges = has ? t.badges.filter((b) => b !== key) : [...(t.badges || []), key]; setT((p) => ({ ...p, badges })); call("badge", () => setCertAction(appId, { badges })); };
  const setTier = (tier) => { setT((p) => ({ ...p, tier })); call("tier", () => setCertAction(appId, { tier })); };
  const approve = () => call("approve", () => approveTechnicianAction(appId, t.tier || "technician"), () => location.reload());
  // Two-step: confirm the intent, then require a reason — mirrors the reject-reason prompt in
  // compliance-review.jsx. Nothing is ever hard-deleted; this just drops back to Final Certification.
  const revoke = () => {
    if (!confirm("Revoke this technician's certification? They lose dispatch eligibility immediately.")) return;
    const reason = prompt("Reason for revoking (kept in the Job Log)") || "";
    if (!reason.trim()) return;
    call("revoke", () => revokeCertificationAction(appId, reason), () => location.reload());
  };

  if (status0 === "cleared") return (
    <div className="tp"><div className="tp-h"><h3>Training</h3></div>
      <p className="tp-cleared">Cleared for training. Start the program to enter Portal 3.</p>
      <button className="tp-start" disabled={busy === "start"} onClick={start}>{busy === "start" ? "Starting…" : "Start training program"}</button>
      {msg && <div className="tp-msg">{msg}</div>}<style>{CSS}</style></div>
  );

  const fieldCount = t.modules?.field_training?.count || 0;
  const canApprove = prog.allModules && prog.fieldDone;

  return (
    <div className="tp">
      <div className="tp-h"><h3>Training</h3><span className="tp-cur">Now: {statusLabel(status0)}</span></div>

      <div className="tp-rail">
        {P3_FLOW.map((s) => { const idx = P3_FLOW.indexOf(s), cur = P3_FLOW.indexOf(status0); const st = idx < cur ? "done" : idx === cur ? "cur" : "todo";
          return <div key={s} className={`tp-rs ${st}`}><span className="tp-dot" /><span>{statusLabel(s)}</span></div>; })}
      </div>
      {!approved && nextP3Status(status0) !== "approved" && <button className="tp-adv" disabled={busy === "adv"} onClick={advance}>Advance → {statusLabel(nextP3Status(status0))}</button>}

      <div className="tp-mods">
        {TRAINING_MODULES.map((m) => {
          const s = t.modules?.[m.key] || {}; const done = s.status === "done";
          return (
            <div className="tp-mod" key={m.key}>
              <span className={`tp-mcheck${done ? " ok" : ""}`}>{done ? "✓" : ""}</span>
              <span className="tp-mname">{m.label}</span>
              {m.type === "field"
                ? <span className="tp-field"><b>{fieldCount}/{FIELD_JOBS_REQUIRED}</b><button className="tp-sign" disabled={busy === "field" || done} onClick={signField}>+ Sign off job</button></span>
                : <span className={`tp-mst${done ? " ok" : ""}`}>{done ? "Acknowledged" : "Pending trainee"}</span>}
            </div>
          );
        })}
      </div>

      <div className="tp-cert">
        <div className="tp-sub">Certification tier</div>
        <div className="tp-tiers">{CERT_TIERS.map((ct) => <button key={ct.key} className={`tp-tier${t.tier === ct.key ? " on" : ""}`} onClick={() => setTier(ct.key)}>{ct.label}</button>)}</div>
        <div className="tp-sub">Qualification badges</div>
        <div className="tp-quals">{QUALIFICATIONS.map((q) => <button key={q.key} className={`tp-qual${(t.badges || []).includes(q.key) ? " on" : ""}`} onClick={() => toggleBadge(q.key)}>{q.label}</button>)}</div>
      </div>

      <div className="tp-approve">
        <button className="tp-approve-b" disabled={busy === "approve" || approved || !canApprove} onClick={approve}>
          {approved ? "✓ Approved Technician" : "Approve as Technician"}
        </button>
        {approved && <button className="tp-revoke-b" disabled={busy === "revoke"} onClick={revoke}>{busy === "revoke" ? "Revoking…" : "Revoke"}</button>}
        {!canApprove && !approved && <span className="tp-approve-n">Finish all modules + {FIELD_JOBS_REQUIRED} field jobs first.</span>}
        {msg && <span className="tp-approve-n err">{msg}</span>}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.tp{--sage:#3F8F6A;--sage-deep:#2E7355;--gold-deep:#A8842F;--red:#C4553D;--line:#E4E4DF;--muted:#787D84;--ink:#101418;--paper:#F4F4F2;
  border:1px solid var(--line);border-radius:14px;background:#fff;padding:16px 18px;font-family:var(--font-sans,'Instrument Sans',sans-serif);margin-top:14px}
.tp-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.tp-h h3{margin:0;font-size:1.05rem;font-weight:800;color:var(--ink)}.tp-cur{font-size:.78rem;color:var(--sage-deep);font-weight:600}
.tp-cleared{color:var(--muted);font-size:.9rem;margin:0 0 12px}
.tp-start{background:var(--sage);color:#fff;border:none;border-radius:9px;padding:11px 20px;font:inherit;font-weight:700;font-size:.9rem;cursor:pointer}
.tp-rail{display:flex;gap:3px;overflow-x:auto;margin-bottom:10px;padding-bottom:4px}
.tp-rs{flex:1 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px;font-size:.64rem;color:var(--muted);text-align:center}
.tp-dot{width:11px;height:11px;border-radius:50%;background:#E0E0DB;border:2px solid #E0E0DB}
.tp-rs.done .tp-dot{background:var(--sage);border-color:var(--sage)}.tp-rs.cur .tp-dot{background:#fff;border-color:var(--sage);box-shadow:0 0 0 3px #D8ECE1}
.tp-rs.cur{color:var(--sage-deep);font-weight:700}
.tp-adv{background:#fff;color:var(--sage-deep);border:1px solid var(--line);border-radius:8px;padding:7px 13px;font:inherit;font-weight:700;font-size:.8rem;cursor:pointer;margin-bottom:12px}
.tp-mods{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.tp-mod{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--paper)}
.tp-mcheck{width:20px;height:20px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;color:#fff;font-size:.66rem;font-weight:700;flex:none}
.tp-mcheck.ok{background:var(--sage);border-color:var(--sage)}
.tp-mname{flex:1;font-size:.88rem;font-weight:600;color:var(--ink)}
.tp-mst{font-size:.7rem;color:var(--muted)}.tp-mst.ok{color:var(--sage)}
.tp-field{display:flex;align-items:center;gap:8px}.tp-field b{font-family:var(--font-mono,ui-monospace);font-size:.8rem}
.tp-sign{background:var(--sage);color:#fff;border:none;border-radius:6px;padding:4px 9px;font:inherit;font-size:.72rem;font-weight:700;cursor:pointer}
.tp-sign:disabled{opacity:.4}
.tp-cert{border-top:1px solid var(--line);padding-top:12px;margin-bottom:14px}
.tp-sub{font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:0 0 7px}
.tp-tiers,.tp-quals{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px}
.tp-tier,.tp-qual{border:1px solid var(--line);background:#fff;border-radius:7px;padding:6px 12px;font:inherit;font-size:.78rem;font-weight:600;color:var(--ink);cursor:pointer}
.tp-tier.on{background:var(--sage);color:#fff;border-color:transparent}
.tp-qual.on{background:#E4F0EA;color:var(--sage-deep);border-color:transparent}
.tp-approve{display:flex;align-items:center;gap:12px}
.tp-approve-b{background:var(--sage-deep);color:#fff;border:none;border-radius:9px;padding:11px 20px;font:inherit;font-weight:700;font-size:.9rem;cursor:pointer}
.tp-approve-b:disabled{opacity:.45;cursor:not-allowed}
.tp-revoke-b{background:#fff;color:var(--red);border:1px solid var(--line);border-radius:9px;padding:11px 16px;font:inherit;font-weight:700;font-size:.85rem;cursor:pointer}
.tp-revoke-b:disabled{opacity:.5;cursor:default}
.tp-approve-n{font-size:.8rem;color:var(--muted)}.tp-approve-n.err{color:var(--red)}
.tp-msg{color:var(--red);font-size:.83rem;margin-top:8px}
`;
