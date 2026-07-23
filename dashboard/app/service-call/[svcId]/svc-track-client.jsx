"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "../../components/brand";
import { SVC_DIAG_ENTRIES, SVC_DIAG_NODES, SVC_ROUTE_LABEL } from "../../../lib/svc-diagnostic";
import { saveCustomerDiagnosticAction } from "./actions";

// Customer-facing stage wording (the internal keys stay the same on the staff side).
const STAGES = [
  { key: "submitted", label: "Received" },
  { key: "diagnosing", label: "Reviewing" },
  { key: "quoted", label: "Quote sent" },
  { key: "scheduled", label: "Scheduled" },
  { key: "onsite", label: "Technician on site" },
  { key: "resolved", label: "Resolved" },
  { key: "billed", label: "Invoice" },
  { key: "closed", label: "Closed" },
];
const CATEGORY = { camera: "Camera", dropout: "Cutting out", nvr: "Recorder", other: "Issue" };
const EVENT_ICON = { submitted: "📋", diagnostic: "🔎", note: "✎", stage: "→", assign: "👤", quote: "$", payment: "$", resolved: "✓", closed: "✓" };
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : ""; }

export default function SvcTrackClient({ call, events = [], diagnostics = [], viewerName, loggedIn, staff }) {
  const router = useRouter();
  const stageIdx = STAGES.findIndex((s) => s.key === call.stage);
  const first = (viewerName || "").trim().split(/\s+/)[0];

  // ---- TRACE customer diagnostic state ----
  const [diagOpen, setDiagOpen] = useState(false);
  const [node, setNode] = useState(null);         // current node id (null = entry picker)
  const [entryTitle, setEntryTitle] = useState("");
  const [path, setPath] = useState([]);           // [{question, answer}]
  const [started, setStarted] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function openDiag() { setDiagOpen(true); setNode(null); setPath([]); setEntryTitle(""); setSaved(false); }
  function closeDiag() { setDiagOpen(false); }
  function pickEntry(entry) { setEntryTitle(entry.title); setNode(entry.start); setPath([]); setStarted(new Date().toISOString()); }
  function answer(q, opt) { setPath((p) => [...p, { question: q, answer: opt.label }]); setNode(opt.next); }
  function restart() { setNode(null); setPath([]); setEntryTitle(""); setSaved(false); }

  const cur = node ? SVC_DIAG_NODES[node] : null;
  const isFix = cur && cur.type === "fix";

  async function sendReport() {
    if (!cur || !isFix) return;
    setSaving(true);
    const rec = {
      issue: entryTitle,
      steps: path,
      outcome: { route: cur.route, title: cur.title, action: cur.detail },
      started, completed: new Date().toISOString(),
    };
    const r = await saveCustomerDiagnosticAction(call.svc_id, rec);
    setSaving(false);
    if (r?.ok) { setSaved(true); router.refresh(); }
  }

  return (
    <div className="st-root">
      <header className="st-top">
        <a href="/" className="st-brand" aria-label="IOT TECHS home"><Wordmark height={24} /></a>
        <div className="st-top-right">
          <span className="st-id mono">{call.svc_id}</span>
          {loggedIn ? <a href="/my-projects" className="st-exit">Dashboard</a> : <a href="/" className="st-exit">Home</a>}
        </div>
      </header>

      <main className="st-main">
        {/* Hero */}
        <div className="st-hero">
          <div className="st-hero-tag">{CATEGORY[call.category] || "Service call"}{call.priority === "urgent" || call.priority === "high" ? <span className="st-hot"> · {call.priority}</span> : null}</div>
          <h1>{first ? `Hi ${first} — here's where things stand.` : "Here's where things stand."}</h1>
          {call.issue && <p className="st-issue">“{call.issue}”</p>}
          {staff && <p className="st-staffnote">Staff preview of the customer tracker. Manage this call in the <a href={`/service-calls/${call.svc_id}`}>staff portal</a>.</p>}
        </div>

        {/* Stage strip */}
        <div className="st-card st-stagebar">
          {STAGES.map((s, n) => (
            <div key={s.key} className={`st-stage${n < stageIdx ? " done" : ""}${n === stageIdx ? " on" : ""}`}>
              <span className="st-stage-dot" />
              <span className="st-stage-lbl">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Diagnostic call-to-action */}
        <div className="st-card st-diag-cta">
          <div className="st-diag-ico"><svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></div>
          <div className="st-diag-txt">
            <h2>Try a 60-second check</h2>
            <p>Answer a few quick questions — a lot of camera issues clear up on their own, and your answers go straight to our team either way.</p>
          </div>
          <button className="st-btn st-btn-gold" onClick={openDiag}>Start check</button>
        </div>

        {/* Past diagnostic runs */}
        {diagnostics.length > 0 && (
          <div className="st-card">
            <div className="st-card-h">Your checks</div>
            {diagnostics.map((d) => (
              <div className="st-diag-row" key={d.id}>
                <span className={`st-route st-route-${d.outcome?.route || "solved"}`}>{SVC_ROUTE_LABEL[d.outcome?.route] || "Done"}</span>
                <span className="st-diag-title">{d.outcome?.title || d.issue || "Diagnostic"}</span>
                <span className="st-diag-when">{fmt(d.completed || d.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div className="st-card">
          <div className="st-card-h">Progress</div>
          <ul className="st-timeline">
            {events.map((e) => (
              <li key={e.id}>
                <span className="st-tl-dot">{EVENT_ICON[e.kind] || "•"}</span>
                <div className="st-tl-body">
                  <div className="st-tl-detail">{e.detail || e.kind}</div>
                  <div className="st-tl-meta">{fmt(e.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="st-help">Questions? Call us and mention <span className="mono">{call.svc_id}</span>.</p>
      </main>

      {/* ---- Diagnostic modal ---- */}
      {diagOpen && (
        <div className="st-ov" onClick={(e) => { if (e.target === e.currentTarget) closeDiag(); }}>
          <div className="st-modal">
            <button className="st-modal-x" onClick={closeDiag} aria-label="Close">✕</button>

            {!node ? (
              // entry picker
              <div className="st-diag-pick">
                <div className="st-tag">Quick check</div>
                <h2>Where are you not seeing the cameras?</h2>
                <p className="st-pick-sub">Pick what matches — we&rsquo;ll walk you through it one step at a time.</p>
                {SVC_DIAG_ENTRIES.map((en) => (
                  <button className="st-pick" key={en.start} onClick={() => pickEntry(en)}>
                    <span className="st-pick-t">{en.title}</span>
                    <span className="st-pick-h">{en.hint}</span>
                  </button>
                ))}
              </div>
            ) : isFix ? (
              // outcome
              <div className="st-diag-out">
                <div className={`st-out-badge st-route-${cur.route}`}>{SVC_ROUTE_LABEL[cur.route] || "Done"}</div>
                <h2>{cur.title}</h2>
                <p className="st-out-detail">{cur.detail}</p>
                {saved ? (
                  <div className="st-out-saved">
                    <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
                    Sent to our team — it&rsquo;s on your service call.
                    <button className="st-btn st-btn-ghost" onClick={closeDiag} style={{ marginTop: 14 }}>Done</button>
                  </div>
                ) : (
                  <div className="st-out-actions">
                    {cur.route === "service" ? (
                      <button className="st-btn st-btn-gold" onClick={sendReport} disabled={saving}>{saving ? "Sending…" : "Send this to our team"}</button>
                    ) : (
                      <button className="st-btn st-btn-gold" onClick={sendReport} disabled={saving}>{saving ? "Saving…" : "Save this check"}</button>
                    )}
                    <button className="st-btn st-btn-ghost" onClick={restart}>Start over</button>
                  </div>
                )}
              </div>
            ) : (
              // question
              <div className="st-diag-q">
                <div className="st-q-step">{entryTitle} · step {path.length + 1}</div>
                <h2>{cur.q}</h2>
                {cur.widget === "speed" && <div className="st-q-hint">Tip: try loading a website on your phone over the same Wi-Fi to check.</div>}
                <div className="st-q-opts">
                  {cur.options.map((o, i) => (
                    <button key={i} className={`st-opt${i === cur.options.length - 1 ? " st-opt-last" : ""}`} onClick={() => answer(cur.q, o)}>{o.label}</button>
                  ))}
                </div>
                {path.length > 0 && <button className="st-back" onClick={() => { const p = [...path]; p.pop(); setPath(p); /* recompute node from last */ setNode(prevNodeFrom(entryTitle, p)); }}>← Back</button>}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

// Recompute the node to return to when stepping back: replay answers from the entry start.
function prevNodeFrom(entryTitle, remainingPath) {
  const entry = SVC_DIAG_ENTRIES.find((e) => e.title === entryTitle);
  if (!entry) return null;
  let n = entry.start;
  for (const step of remainingPath) {
    const node = SVC_DIAG_NODES[n];
    const opt = node?.options?.find((o) => o.label === step.answer);
    if (!opt) break;
    n = opt.next;
  }
  return n;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
.st-root{--ink:#0e1320;--muted:#5b6275;--line:#e6e8ee;--gold:#C9A96E;--gold-deep:#b08f4f;--bg-soft:#f6f7f9;--accent:#3257ff;
  min-height:100vh;background:radial-gradient(1100px 480px at 50% -10%,#f0f2f7 0%,#fff 55%);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.55}
.st-top{display:flex;align-items:center;justify-content:space-between;max-width:680px;margin:0 auto;padding:20px 20px 0}
.st-brand{display:inline-flex}
.st-top-right{display:flex;align-items:center;gap:14px}
.st-id{font-size:.8rem;font-weight:800;color:var(--gold-deep);letter-spacing:.5px}
.st-exit{color:var(--muted);text-decoration:none;font-size:.85rem;font-weight:600}
.st-exit:hover{color:var(--ink)}
.st-main{max-width:680px;margin:0 auto;padding:18px 20px 60px}
.st-hero{margin:8px 0 18px}
.st-hero-tag{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-deep)}
.st-hot{color:#c9382b;text-transform:capitalize}
.st-hero h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.02em;font-size:1.7rem;margin:5px 0 6px}
.st-issue{color:var(--muted);font-style:italic;margin:0}
.st-staffnote{margin:10px 0 0;font-size:.82rem;color:var(--muted);background:var(--bg-soft);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.st-staffnote a{color:var(--gold-deep);font-weight:700}
.st-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:14px;box-shadow:0 18px 44px -34px rgba(14,19,32,.3)}
.st-card-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1rem;margin-bottom:14px}
/* stage strip */
.st-stagebar{display:flex;gap:2px;overflow-x:auto;padding:18px 8px}
.st-stage{flex:1;min-width:72px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative}
.st-stage:not(:last-child)::after{content:"";position:absolute;top:8px;left:calc(50% + 11px);right:calc(-50% + 11px);height:2px;background:var(--line)}
.st-stage.done:not(:last-child)::after{background:var(--gold)}
.st-stage-dot{width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid var(--line);z-index:1}
.st-stage.done .st-stage-dot{background:var(--gold);border-color:var(--gold)}
.st-stage.on .st-stage-dot{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,169,110,.22)}
.st-stage-lbl{font-size:.68rem;font-weight:700;color:var(--muted);text-align:center;white-space:nowrap}
.st-stage.on .st-stage-lbl{color:var(--ink)}
/* diagnostic cta */
.st-diag-cta{display:flex;align-items:center;gap:16px}
.st-diag-ico{width:46px;height:46px;flex-shrink:0;border-radius:12px;background:#f8f0e0;display:grid;place-items:center}
.st-diag-ico svg{width:24px;height:24px;fill:none;stroke:var(--gold-deep);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.st-diag-txt{flex:1;min-width:0}
.st-diag-txt h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.05rem;margin:0 0 3px}
.st-diag-txt p{color:var(--muted);font-size:.86rem;margin:0}
/* diag rows */
.st-diag-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:.86rem}
.st-diag-row:last-child{border-bottom:none}
.st-diag-title{flex:1;font-weight:600}
.st-diag-when{color:var(--muted);font-size:.76rem}
.st-route{font-size:.68rem;font-weight:800;text-transform:uppercase;padding:2px 9px;border-radius:20px}
.st-route-solved{color:#1c8a45;background:#e7f6ec}
.st-route-service{color:#b3541e;background:#fdf0e5}
/* timeline */
.st-timeline{list-style:none;margin:0;padding:0}
.st-timeline li{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
.st-timeline li:last-child{border-bottom:none}
.st-tl-dot{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:#f8f0e0;display:grid;place-items:center;font-size:.8rem}
.st-tl-detail{font-size:.88rem;font-weight:600}
.st-tl-meta{font-size:.74rem;color:var(--muted);margin-top:1px}
.st-help{text-align:center;color:var(--muted);font-size:.84rem;margin:8px 0 0}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.5px;font-weight:700}
/* buttons */
.st-btn{display:inline-flex;align-items:center;justify-content:center;font-weight:700;border-radius:11px;cursor:pointer;border:none;font-size:.92rem;font-family:inherit;transition:transform .15s,background .2s,box-shadow .2s}
.st-btn-gold{background:var(--gold);color:var(--ink);padding:12px 20px;flex-shrink:0}
.st-btn-gold:hover{transform:translateY(-2px);background:var(--gold-deep);color:#fff;box-shadow:0 12px 24px -12px rgba(176,143,79,.6)}
.st-btn-gold:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none;background:var(--gold)}
.st-btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);padding:11px 20px}
.st-btn-ghost:hover{border-color:var(--ink)}
/* modal */
.st-ov{position:fixed;inset:0;background:rgba(14,19,32,.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.st-modal{width:100%;max-width:460px;background:#fff;border-radius:20px;padding:28px 26px;position:relative;box-shadow:0 30px 80px -30px rgba(14,19,32,.5);max-height:90vh;overflow-y:auto}
.st-modal-x{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.1rem;color:var(--muted);cursor:pointer;width:32px;height:32px;border-radius:8px}
.st-modal-x:hover{background:var(--bg-soft);color:var(--ink)}
.st-tag{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep);background:#f8f0e0;padding:5px 12px;border-radius:20px;margin-bottom:10px}
.st-modal h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;letter-spacing:-.01em;font-size:1.35rem;margin:0 0 8px;line-height:1.2}
.st-pick-sub{color:var(--muted);font-size:.9rem;margin:0 0 18px}
.st-pick{width:100%;display:flex;flex-direction:column;gap:2px;text-align:left;padding:15px 16px;border:1.5px solid var(--line);border-radius:13px;background:#fff;cursor:pointer;font-family:inherit;margin-bottom:10px;transition:border-color .15s,background .15s,transform .1s}
.st-pick:hover{border-color:var(--gold);background:#fdfaf2;transform:translateY(-1px)}
.st-pick-t{font-weight:800;font-size:1rem}
.st-pick-h{font-size:.82rem;color:var(--muted)}
.st-q-step{font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px}
.st-q-hint{background:var(--accent-soft,#eef1ff);color:#2540c0;border-radius:10px;padding:9px 13px;font-size:.82rem;margin:0 0 14px;font-weight:600}
.st-q-opts{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.st-opt{width:100%;text-align:left;padding:15px 16px;border:1.5px solid var(--line);border-radius:13px;background:#fff;cursor:pointer;font-family:inherit;font-size:.96rem;font-weight:600;transition:border-color .15s,background .15s,transform .1s}
.st-opt:hover{border-color:var(--gold);background:#fdfaf2;transform:translateY(-1px)}
.st-opt-last{border-style:dashed}
.st-back{margin-top:16px;background:none;border:none;color:var(--muted);font-size:.85rem;cursor:pointer;font-family:inherit;font-weight:600;padding:0}
.st-back:hover{color:var(--ink)}
/* outcome */
.st-out-badge{display:inline-block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:5px 13px;border-radius:20px;margin-bottom:12px}
.st-out-detail{color:var(--muted);font-size:.95rem;margin:0 0 22px}
.st-out-actions{display:flex;flex-direction:column;gap:10px}
.st-out-saved{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;color:#1c8a45;font-weight:700;font-size:.92rem}
.st-out-saved svg{width:34px;height:34px;fill:none;stroke:#1c8a45;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;background:#e7f6ec;border-radius:50%;padding:6px;box-sizing:content-box}
@media(max-width:560px){.st-diag-cta{flex-wrap:wrap}.st-diag-cta .st-btn{width:100%}.st-hero h1{font-size:1.45rem}}
`;
