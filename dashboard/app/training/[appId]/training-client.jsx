"use client";

import { useState } from "react";
import { Wordmark } from "../../components/brand";
import { TRAINING_MODULES, P3_FLOW, FIELD_JOBS_REQUIRED, CERT_TIERS, QUALIFICATIONS, statusLabel, trainingProgress } from "../../../lib/hiring";
import { acknowledgeModuleAction } from "./actions";

export default function TrainingClient({ appId, firstName, status, training, staff }) {
  const [mods, setMods] = useState(training?.modules || {});
  const prog = trainingProgress({ modules: mods });
  const approved = status === "approved";
  const tier = CERT_TIERS.find((t) => t.key === training?.tier);
  const badges = QUALIFICATIONS.filter((q) => (training?.badges || []).includes(q.key));

  return (
    <div className="tx">
      <header className="tx-top">
        <a href="/go" aria-label="IOT TECHS home" className="tx-brand"><Wordmark height={22} /></a>
        <a href={`/application/${appId}`} className="tx-exit">My application</a>
      </header>
      <main className="tx-wrap">
        <div className="tx-hero">
          <div className="tx-tag">Technician Training</div>
          <h1>{approved ? `You're an Approved Technician${firstName ? `, ${firstName}` : ""}.` : `Learn the IOT TECHS way${firstName ? `, ${firstName}` : ""}.`}</h1>
          <p>{approved ? "You're cleared to receive and perform work orders at your approved level. Congratulations." : "Work through each module, then supervised field jobs. Once you're signed off, you'll be certified."}</p>
          {staff && <p className="tx-staff">Staff preview of the trainee's view.</p>}
        </div>

        {approved && tier && (
          <div className="tx-cert">
            <div className="tx-cert-badge"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5z"/><path d="m9 12 2 2 4-4"/></svg></div>
            <div><b>{tier.label}</b><span>{tier.note}</span></div>
          </div>
        )}
        {badges.length > 0 && (
          <div className="tx-badges">{badges.map((b) => <span key={b.key} className="tx-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M20 6 9 17l-5-5"/></svg>{b.label} Certified</span>)}</div>
        )}

        <div className="tx-rail">
          {P3_FLOW.map((s) => {
            const idx = P3_FLOW.indexOf(s), cur = P3_FLOW.indexOf(status);
            const state = idx < cur ? "done" : idx === cur ? "cur" : "todo";
            return <div key={s} className={`tx-rail-s ${state}`}><span className="tx-rail-dot" /><span className="tx-rail-l">{statusLabel(s)}</span></div>;
          })}
        </div>

        <div className="tx-prog"><div className="tx-prog-bar"><i style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div><span>{prog.done} of {prog.total} modules</span></div>

        <div className="tx-mods">
          {TRAINING_MODULES.map((m) => <Module key={m.key} appId={appId} m={m} saved={mods[m.key] || {}} onDone={() => setMods((p) => ({ ...p, [m.key]: { ...(p[m.key] || {}), status: "done" } }))} />)}
        </div>
      </main>
      <style>{CSS}</style>
    </div>
  );
}

function Module({ appId, m, saved, onDone }) {
  const done = saved.status === "done";
  const [open, setOpen] = useState(!done);
  const [busy, setBusy] = useState(false);
  const isField = m.type === "field";
  const fieldCount = saved.count || 0;

  async function ack() {
    setBusy(true);
    try { const r = await acknowledgeModuleAction(appId, m.key); if (r?.ok) onDone(); } catch {}
    setBusy(false);
  }

  return (
    <div className={`tx-mod${done ? " done" : ""}`}>
      <button className="tx-mod-h" onClick={() => setOpen((v) => !v)}>
        <span className="tx-mod-check">{done ? "✓" : ""}</span>
        <span className="tx-mod-l"><b>{m.label}</b><span>{m.summary}</span></span>
        <span className={`tx-mod-st${done ? " ok" : ""}`}>{isField ? `${fieldCount}/${FIELD_JOBS_REQUIRED} jobs` : done ? "Done" : "To do"}</span>
      </button>
      {open && (
        <div className="tx-mod-b">
          <ul>{m.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          {isField
            ? <div className="tx-field-note">Your supervising lead signs off each completed job. {fieldCount >= FIELD_JOBS_REQUIRED ? "You've met the requirement." : `${FIELD_JOBS_REQUIRED - fieldCount} to go.`}</div>
            : done
              ? <div className="tx-ackd">Acknowledged{saved.acknowledged_by ? ` by ${saved.acknowledged_by}` : ""}.</div>
              : <button className="tx-ack" disabled={busy} onClick={ack}>{busy ? "Saving…" : "Acknowledge"}</button>}
        </div>
      )}
    </div>
  );
}

const CSS = `
.tx{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A6ABB1;--line:#E4E4DF;--gold:#C9A96E;--gold-deep:#A8842F;
  --paper:#F4F4F2;--raise:#FBFBFA;--green:#2E7D5B;--sage:#3F8F6A;min-height:100vh;background:var(--paper);color:var(--ink);
  font-family:var(--font-sans,'Instrument Sans',system-ui,sans-serif)}
.tx-top{position:sticky;top:0;z-index:10;background:rgba(244,244,242,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);
  display:flex;align-items:center;justify-content:space-between;padding:12px 22px}
.tx-brand{display:inline-flex;color:var(--ink)}.tx-exit{color:var(--muted);text-decoration:none;font-size:.85rem}
.tx-wrap{max-width:660px;margin:0 auto;padding:26px 22px 80px}
.tx-tag{font-family:var(--font-mono,ui-monospace);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--sage)}
.tx-hero h1{margin:6px 0 8px;font-size:1.7rem;font-weight:800;letter-spacing:-.02em}
.tx-hero p{margin:0;color:var(--ink-soft);font-size:.96rem;line-height:1.55}
.tx-staff{margin-top:8px !important;color:var(--gold-deep) !important;font-size:.84rem !important}
.tx-cert{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#3F8F6A,#2E7355);color:#fff;border-radius:14px;padding:16px 18px;margin:20px 0 10px}
.tx-cert-badge{opacity:.9}.tx-cert b{display:block;font-size:1.15rem}.tx-cert span{font-size:.85rem;opacity:.9}
.tx-badges{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
.tx-badge{display:inline-flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;color:var(--sage);background:#E4F0EA;border-radius:999px;padding:5px 11px}
.tx-rail{display:flex;gap:4px;overflow-x:auto;margin:20px 0 14px;padding-bottom:4px}
.tx-rail-s{flex:1 0 auto;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:70px}
.tx-rail-dot{width:12px;height:12px;border-radius:50%;background:#E0E0DB;border:2px solid #E0E0DB}
.tx-rail-s.done .tx-rail-dot{background:var(--sage);border-color:var(--sage)}
.tx-rail-s.cur .tx-rail-dot{background:#fff;border-color:var(--sage);box-shadow:0 0 0 3px #D8ECE1}
.tx-rail-l{font-size:.66rem;color:var(--muted);text-align:center;line-height:1.15}
.tx-rail-s.cur .tx-rail-l{color:var(--sage);font-weight:700}
.tx-prog{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.tx-prog-bar{flex:1;height:8px;background:#E7E7E2;border-radius:5px;overflow:hidden}
.tx-prog-bar i{display:block;height:100%;background:var(--sage);border-radius:5px;transition:width .3s}
.tx-prog span{font-size:.82rem;color:var(--muted);white-space:nowrap}
.tx-mods{display:flex;flex-direction:column;gap:9px}
.tx-mod{background:var(--raise);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.tx-mod.done{border-color:#CBE0D3}
.tx-mod-h{width:100%;display:flex;align-items:center;gap:11px;padding:14px 16px;background:none;border:none;cursor:pointer;font:inherit;text-align:left}
.tx-mod-check{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;color:#fff;font-size:.7rem;font-weight:700;flex:none}
.tx-mod.done .tx-mod-check{background:var(--sage);border-color:var(--sage)}
.tx-mod-l{flex:1;min-width:0}.tx-mod-l b{display:block;font-size:.98rem;color:var(--ink)}.tx-mod-l span{font-size:.82rem;color:var(--muted)}
.tx-mod-st{font-family:var(--font-mono,ui-monospace);font-size:.66rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);background:#EEEEEA;padding:3px 9px;border-radius:999px;flex:none}
.tx-mod-st.ok{color:var(--sage);background:#E6F0EA}
.tx-mod-b{padding:2px 16px 16px}
.tx-mod-b ul{margin:0 0 12px;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.tx-mod-b li{font-size:.88rem;color:var(--ink-soft);line-height:1.4}
.tx-ack{background:var(--sage);color:#fff;border:none;border-radius:9px;padding:10px 18px;min-height:44px;font:inherit;font-weight:700;font-size:.86rem;cursor:pointer}
.tx-ack:disabled{opacity:.5}
.tx-ackd{font-size:.85rem;color:var(--sage);font-weight:600}
.tx-field-note{font-size:.85rem;color:var(--ink-soft);background:var(--paper);border-radius:9px;padding:10px 12px}
`;
