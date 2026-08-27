"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wordmark } from "../../components/brand";
import { QUESTIONS, CATEGORIES, ASSESSMENT_META } from "../../../lib/assessment-bank";
import { saveAssessmentProgressAction, submitAssessmentAction } from "./actions";

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export default function AssessmentClient({ appId, firstName, responses: initial = {}, locked: lockedInit = false, staff = false }) {
  const [resp, setResp] = useState(initial);
  const [locked, setLocked] = useState(lockedInit);
  const [saved, setSaved] = useState("idle");   // idle | saving | saved
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [left, setLeft] = useState(ASSESSMENT_META.timeLimitMin * 60);
  // The optional per-question note is hidden behind "Add a note" — but if the candidate already
  // wrote one (resuming), keep it open so they can see it.
  const [noteOpen, setNoteOpen] = useState(() => { const o = {}; for (const k in initial) if (initial[k]?.explanation) o[k] = true; return o; });
  const saveT = useRef(null);

  useEffect(() => { const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(t); }, []);

  const answered = QUESTIONS.filter((q) => resp[q.n]?.answer).length;
  const allAnswered = answered === QUESTIONS.length;

  const queueSave = useCallback((next) => {
    if (locked) return;
    setSaved("saving");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      try { await saveAssessmentProgressAction(appId, next); setSaved("saved"); } catch { setSaved("idle"); }
    }, 700);
  }, [appId, locked]);

  function pick(n, answer) { const next = { ...resp, [n]: { ...resp[n], answer } }; setResp(next); queueSave(next); }
  function explain(n, explanation) { const next = { ...resp, [n]: { ...resp[n], explanation } }; setResp(next); queueSave(next); }

  async function submit() {
    if (!allAnswered) { setErr(`Please answer all ${QUESTIONS.length} questions — ${QUESTIONS.length - answered} left.`); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true); setErr("");
    try {
      const r = await submitAssessmentAction(appId, resp);
      if (r?.ok) setLocked(true); else setErr(r?.error === "locked" ? "This assessment was already submitted." : "Could not submit — please try again.");
    } catch { setErr("Could not submit — please try again."); }
    setBusy(false);
  }

  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  let lastCat = null;

  if (locked) return (
    <div className="asx"><div className="asx-wrap asx-done">
      <div className="asx-done-mark"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
      <h1>Assessment submitted</h1>
      <p>Thanks{firstName ? `, ${firstName}` : ""} — your answers are in. Our team will review your results and reach out with next steps. You can close this page.</p>
      <a className="asx-link" href={`/application/${appId}`}>Back to my application</a>
    </div><style>{CSS}</style></div>
  );

  // Discourage copying the questions: block copy + right-click everywhere except the note field.
  const guard = (e) => { if (!e.target.closest?.("textarea")) e.preventDefault(); };

  return (
    <div className="asx" onCopy={guard} onContextMenu={guard} onCut={guard}>
      <header className="asx-top">
        <a href="/go" aria-label="IOT TECHS home" className="asx-brand"><Wordmark height={22} /></a>
        <div className="asx-timer" title="Recommended time"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>{mm}:{ss}</div>
      </header>

      <main className="asx-wrap">
        <div className="asx-hero">
          <div className="asx-tag">Technician Pre-Hire Assessment</div>
          <h1>{firstName ? `${firstName}, tell us how you work.` : "Technician Assessment"}</h1>
          <p>{QUESTIONS.length} questions · {ASSESSMENT_META.timeLimitMin} minutes. Answer honestly — your progress saves as you go.</p>
          {staff && <p className="asx-staff">Staff preview — answers you submit here count as a real submission.</p>}
        </div>

        <div className="asx-qs">
          {QUESTIONS.map((q) => {
            const showCat = q.cat !== lastCat; lastCat = q.cat;
            const r = resp[q.n] || {};
            return (
              <div key={q.n}>
                {showCat && <div className="asx-cat">{CAT_LABEL[q.cat]}</div>}
                <div className={`asx-q${r.answer ? " done" : ""}`}>
                  <div className="asx-q-h"><span className="asx-q-n">{q.n}</span><p className="asx-q-p">{q.prompt}</p></div>
                  <div className="asx-choices">
                    {Object.entries(q.choices).map(([key, val]) => {
                      const text = typeof val === "string" ? val : val.t;
                      const on = r.answer === key;
                      return (
                        <button type="button" key={key} className={`asx-choice${on ? " on" : ""}`} onClick={() => pick(q.n, key)}>
                          <span className="asx-radio">{on && <span className="asx-dot" />}</span>
                          <span className="asx-key">{key}</span><span className="asx-ctext">{text}</span>
                        </button>
                      );
                    })}
                  </div>
                  {q.type === "scored" && (
                    noteOpen[q.n] ? (
                      <div className="asx-explain">
                        <label>Your note <span>optional</span></label>
                        <textarea rows={2} value={r.explanation || ""} onChange={(e) => explain(q.n, e.target.value)} placeholder="Add anything about your reasoning…" autoFocus />
                      </div>
                    ) : (
                      <button type="button" className="asx-addnote" onClick={() => setNoteOpen((o) => ({ ...o, [q.n]: true }))}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                        Add a note
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {err && <div className="asx-err">{err}</div>}
      </main>

      <footer className="asx-foot">
        <div className="asx-foot-in">
          <div className="asx-prog"><span className="asx-prog-n">{answered}<span className="asx-prog-d">/{QUESTIONS.length}</span></span> answered
            <span className={`asx-sv ${saved}`}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span></div>
          <button className="asx-submit" disabled={busy || !allAnswered} onClick={submit}>{busy ? "Submitting…" : "Submit assessment"}</button>
        </div>
      </footer>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.asx{--ink:#101418;--ink-soft:#3A4048;--muted:#787D84;--faint:#A6ABB1;--line:#E4E4DF;--line-soft:#EDEDE9;
  --gold:#C9A96E;--gold-deep:#A8842F;--paper:#F4F4F2;--raise:#FBFBFA;--green:#2E7D5B;--red:#C4553D;
  min-height:100vh;background:var(--paper);color:var(--ink);
  font-family:var(--font-sans,'Instrument Sans',system-ui,sans-serif);padding-bottom:88px;
  -webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-touch-callout:none}
/* Candidates may still type/edit their own note — re-enable selection only inside the textarea. */
.asx-explain textarea{-webkit-user-select:text;-moz-user-select:text;user-select:text}
.asx-top{position:sticky;top:0;z-index:20;background:rgba(244,244,242,.9);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:12px 22px}
.asx-brand{display:inline-flex;color:var(--ink);text-decoration:none}
.asx-timer{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono,ui-monospace);font-size:.82rem;
  color:var(--muted);font-variant-numeric:tabular-nums}
.asx-wrap{max-width:720px;margin:0 auto;padding:26px 22px}
.asx-hero{margin-bottom:22px}
.asx-tag{font-family:var(--font-mono,ui-monospace);font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep)}
.asx-hero h1{margin:6px 0 8px;font-size:1.7rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.asx-hero p{margin:0;color:var(--ink-soft);font-size:.98rem;line-height:1.55}
.asx-staff{margin-top:10px !important;font-size:.85rem !important;color:var(--gold-deep) !important}
.asx-qs{display:flex;flex-direction:column;gap:14px}
.asx-cat{font-family:var(--font-mono,ui-monospace);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);margin:22px 0 2px;padding-top:12px;border-top:1px solid var(--line)}
.asx-cat:first-child{border-top:0;padding-top:0;margin-top:0}
.asx-q{background:var(--raise);border:1px solid var(--line);border-radius:14px;padding:16px 17px;transition:border-color .15s}
.asx-q.done{border-color:#D8CFB9}
.asx-q-h{display:flex;gap:11px;align-items:flex-start;margin-bottom:12px}
.asx-q-n{flex:none;width:26px;height:26px;border-radius:8px;background:var(--paper);border:1px solid var(--line);
  display:grid;place-items:center;font-family:var(--font-mono,ui-monospace);font-size:.78rem;font-weight:700;color:var(--gold-deep)}
.asx-q-p{margin:2px 0 0;font-size:1rem;font-weight:600;line-height:1.45;color:var(--ink)}
.asx-choices{display:flex;flex-direction:column;gap:7px}
.asx-choice{display:flex;align-items:center;gap:10px;text-align:left;background:var(--paper);border:1px solid var(--line);
  border-radius:10px;padding:11px 13px;min-height:48px;box-sizing:border-box;cursor:pointer;font:inherit;color:var(--ink-soft);transition:.12s}
.asx-choice:hover{border-color:var(--gold);background:#fff}
.asx-choice.on{border-color:var(--gold-deep);background:#F6F0E2;color:var(--ink)}
.asx-radio{flex:none;width:17px;height:17px;border-radius:50%;border:2px solid var(--faint);margin-top:1px;display:grid;place-items:center}
.asx-choice.on .asx-radio{border-color:var(--gold-deep)}
.asx-dot{width:8px;height:8px;border-radius:50%;background:var(--gold-deep)}
.asx-key{font-family:var(--font-mono,ui-monospace);font-weight:700;font-size:.8rem;color:var(--muted);flex:none;margin-top:1px}
.asx-choice.on .asx-key{color:var(--gold-deep)}
.asx-ctext{font-size:.92rem;line-height:1.4}
.asx-explain{margin-top:12px}
.asx-explain label{display:block;font-size:.78rem;font-weight:700;color:var(--ink-soft);margin-bottom:5px}
.asx-explain label span{font-weight:400;color:var(--faint)}
.asx-explain textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:9px;padding:9px 11px;
  font:inherit;font-size:.9rem;color:var(--ink);background:var(--paper);outline:none;resize:vertical}
.asx-explain textarea:focus{border-color:var(--gold)}
.asx-addnote{margin-top:12px;display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:2px 0;
  cursor:pointer;font:inherit;font-size:.82rem;font-weight:600;color:var(--muted);transition:color .12s}
.asx-addnote:hover{color:var(--gold-deep)}
.asx-addnote svg{color:var(--faint)}.asx-addnote:hover svg{color:var(--gold-deep)}
.asx-err{margin-top:16px;background:#F6E7E2;color:var(--red);border-radius:10px;padding:11px 14px;font-size:.9rem;font-weight:600}
.asx-foot{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(251,251,250,.94);backdrop-filter:blur(10px);
  border-top:1px solid var(--line)}
.asx-foot-in{max-width:720px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.asx-prog{font-size:.88rem;color:var(--muted);display:flex;align-items:center;gap:9px}
.asx-prog-n{font-family:var(--font-mono,ui-monospace);font-weight:800;font-size:1.05rem;color:var(--ink)}
.asx-prog-d{color:var(--faint);font-weight:500}
.asx-sv{font-size:.76rem;color:var(--green)}.asx-sv.saving{color:var(--faint)}
.asx-submit{background:var(--gold-deep);color:#fff;border:none;border-radius:10px;padding:12px 22px;font:inherit;
  font-weight:700;font-size:.95rem;cursor:pointer;transition:.15s}
.asx-submit:hover:not(:disabled){background:#96742a}
.asx-submit:disabled{opacity:.45;cursor:not-allowed}
.asx-done{text-align:center;padding-top:60px}
.asx-done-mark{width:64px;height:64px;border-radius:50%;background:#E6F0EA;color:var(--green);display:grid;place-items:center;margin:0 auto 18px}
.asx-done h1{font-size:1.6rem;font-weight:800;margin:0 0 10px}
.asx-done p{color:var(--ink-soft);max-width:44ch;margin:0 auto 18px;line-height:1.55}
.asx-link{color:var(--gold-deep);font-weight:600;text-decoration:none}
`;
