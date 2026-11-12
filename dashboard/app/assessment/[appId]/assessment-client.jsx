"use client";

import { useState, useEffect, useRef } from "react";
import { Wordmark } from "../../components/brand";
import { QUESTIONS, CATEGORIES, ASSESSMENT_META } from "../../../lib/assessment-bank";
import { saveAssessmentProgressAction, submitAssessmentAction, openAssessmentAction, syncAssessmentAction } from "./actions";

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const N = QUESTIONS.length;

// Deck-style exam: one question on screen at a time (swipe / arrows / buttons), a per-question
// flag-for-review, then a review screen (answered + flagged map) before submit. One-at-a-time
// keeps the whole question bank off the page, so it can't be selected/copied wholesale.
export default function AssessmentClient({ appId, firstName, responses: initial = {}, locked: lockedInit = false, staff = false, resuming = false, initialRemainingSec = null, initialLeaves = 0, limitSec = ASSESSMENT_META.timeLimitMin * 60 }) {
  const [resp, setResp] = useState(initial);
  const [locked, setLocked] = useState(lockedInit);
  const [saved, setSaved] = useState("idle");   // idle | saving | saved
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [left, setLeft] = useState(initialRemainingSec != null ? initialRemainingSec : limitSec);
  // Mid-exam refresh / return → straight back into the quiz (not the intro), with a resume notice.
  const [mode, setMode] = useState(resuming ? "quiz" : "intro");     // intro | quiz | review
  const [cur, setCur] = useState(0);             // 0-based question index
  const [leaves, setLeaves] = useState(initialLeaves);
  const [resumeShown, setResumeShown] = useState(resuming);   // "we noticed you left" overlay
  const [confirmSubmit, setConfirmSubmit] = useState(false);  // two-step submit when blanks remain
  // Server-anchored deadline: wall-clock ms when time runs out. Only anchored once the exam is open —
  // on resume it's seeded from the server's remaining seconds; a fresh load waits for Start. Re-synced
  // on every return, so no client clock / cleared storage / new window can extend it.
  const deadlineRef = useRef(resuming && initialRemainingSec != null ? Date.now() + initialRemainingSec * 1000 : null);
  const leftPageRef = useRef(false);   // dedup: one leave per departure until we're visible again
  // The optional per-question note is hidden behind "Add a note" — but if the candidate already
  // wrote one (resuming), keep it open so they can see it.
  const [noteOpen, setNoteOpen] = useState(() => { const o = {}; for (const k in initial) if (initial[k]?.explanation) o[k] = true; return o; });
  const saveT = useRef(null);
  const touchX = useRef(null);
  // Per-question timing: accrue seconds spent on the question currently on screen. qEnter marks when
  // it appeared; stampCurrent() folds the elapsed time into secsRef and resets. Persisted to
  // localStorage so a reload doesn't lose it. Folded into the submit payload as responses[n].secs.
  const qEnter = useRef(Date.now());
  const secsRef = useRef({});
  const timedOut = useRef(false);
  const autoSubmitted = useRef(false);
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(`asx_secs_${appId}`) || "{}"); if (s && typeof s === "object") secsRef.current = s; } catch {}
    qEnter.current = Date.now();
  }, [appId]);
  function stampCurrent() {
    const n = QUESTIONS[cur]?.n;
    const dt = Math.min((Date.now() - qEnter.current) / 1000, 1800);   // cap a left-open tab
    qEnter.current = Date.now();
    if (n != null && dt > 0.4) {
      secsRef.current[n] = (secsRef.current[n] || 0) + dt;
      try { localStorage.setItem(`asx_secs_${appId}`, JSON.stringify(secsRef.current)); } catch {}
    }
  }

  // Countdown off the SERVER-anchored deadline (deadlineRef), not a client/localStorage clock — so a
  // refresh, a cleared storage, or a fresh incognito window can't rewind it. Until the exam is opened
  // (intro screen) there's no deadline and the clock just holds at the full limit.
  useEffect(() => {
    const tick = () => { if (deadlineRef.current) setLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))); };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Resuming after a refresh/reopen: the unload beacon that counted this departure can land just after
  // the page re-rendered, so pull the authoritative remaining time + leave count once on mount.
  useEffect(() => {
    if (!resuming || locked) return;
    syncAssessmentAction(appId).then((r) => {
      if (!r?.ok) return;
      if (typeof r.remainingSec === "number") { deadlineRef.current = Date.now() + r.remainingSec * 1000; setLeft(r.remainingSec); }
      if (typeof r.leaves === "number") setLeaves(r.leaves);
    }).catch(() => {});
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Anti-cheat: count every departure (tab hidden / refresh / close) server-side via a beacon, and on
  // return re-sync the real remaining time + leave count and show the "we noticed you left" notice.
  useEffect(() => {
    if (mode === "intro" || locked) return;
    const beaconLeave = () => {
      if (leftPageRef.current) return;             // one count per departure
      leftPageRef.current = true;
      try {
        const body = JSON.stringify({ appId });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/assessment/leave", new Blob([body], { type: "application/json" }));
        else fetch("/api/assessment/leave", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
      } catch {}
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") beaconLeave();
      else {
        leftPageRef.current = false;
        // Pull the authoritative remaining time + leave count, then surface the resume notice.
        syncAssessmentAction(appId).then((r) => {
          if (r?.ok) {
            if (typeof r.remainingSec === "number") { deadlineRef.current = Date.now() + r.remainingSec * 1000; setLeft(r.remainingSec); }
            if (typeof r.leaves === "number") setLeaves(r.leaves);
          }
          setResumeShown(true);
        }).catch(() => setResumeShown(true));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", beaconLeave);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", beaconLeave); };
  }, [mode, locked, appId]);

  const answered = QUESTIONS.filter((q) => resp[q.n]?.answer).length;
  const allAnswered = answered === N;
  const flaggedCount = QUESTIONS.filter((q) => resp[q.n]?.flagged).length;

  // Debounced autosave: whenever responses change (after a real edit), persist. Using a
  // dirty-flag + [resp] effect — rather than saving inside each handler — means functional
  // updaters can't clobber each other (answer + flag in the same tick both land).
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current || locked) return;
    setSaved("saving");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      try { await saveAssessmentProgressAction(appId, resp); setSaved("saved"); } catch { setSaved("idle"); }
    }, 700);
    return () => clearTimeout(saveT.current);
  }, [resp, appId, locked]);

  function pick(n, answer) { dirty.current = true; setResp((p) => ({ ...p, [n]: { ...p[n], answer } })); }
  function explain(n, explanation) { dirty.current = true; setResp((p) => ({ ...p, [n]: { ...p[n], explanation } })); }
  function toggleFlag(n) { dirty.current = true; setResp((p) => ({ ...p, [n]: { ...p[n], flagged: !p[n]?.flagged } })); }

  // Selecting an answer auto-advances to the next question (last one → review). A short beat lets the
  // selection register first; any manual navigation cancels the pending advance.
  const advT = useRef(null);
  useEffect(() => () => clearTimeout(advT.current), []);
  function answerAndAdvance(n, key) {
    pick(n, key);
    if (noteOpen[n]) return;   // writing a note on this one — don't advance out from under them
    const at = cur;
    clearTimeout(advT.current);
    advT.current = setTimeout(() => {
      setErr(""); stampCurrent();
      if (at < N - 1) setCur(at + 1); else setMode("review");
    }, 260);
  }

  function go(delta) { clearTimeout(advT.current); setErr(""); stampCurrent(); setCur((c) => Math.min(N - 1, Math.max(0, c + delta))); }
  function jumpTo(i) { clearTimeout(advT.current); setErr(""); stampCurrent(); setCur(i); setMode("quiz"); }

  // Arrow-key navigation while taking the quiz (ignored when typing a note).
  useEffect(() => {
    if (mode !== "quiz") return;
    const h = (e) => {
      if (e.target.closest?.("textarea")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode]);

  const onTouchStart = (e) => { touchX.current = e.changedTouches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
    if (Math.abs(dx) < 55) return;         // ignore taps / small drags
    if (dx < 0) go(1); else go(-1);        // swipe left → next, swipe right → previous
  };

  // Blanks are allowed — a candidate may submit with questions unanswered (they're scored 0). The
  // review screen does a light two-step confirm for that; a timeout submit (force) just sends.
  function handleSubmitClick() {
    if (busy) return;
    if (!allAnswered && !confirmSubmit) { setConfirmSubmit(true); return; }
    submit();
  }

  async function submit(force = false) {
    stampCurrent();
    setBusy(true); setErr("");
    // Fold per-question seconds into the payload. opened_at is server-owned now, so we don't send it.
    const payload = {};
    for (const q of QUESTIONS) {
      const rr = resp[q.n]; const secs = Math.round(secsRef.current[q.n] || 0);
      if (rr || secs) payload[q.n] = { ...(rr || {}), ...(secs ? { secs } : {}) };
    }
    try {
      const r = await submitAssessmentAction(appId, payload, { timedOut: force || timedOut.current });
      if (r?.ok) {
        try { localStorage.removeItem(`asx_secs_${appId}`); } catch {}
        // Send them straight to their application page (status + next steps) instead of a dead-end
        // "submitted, close this page" screen. Keep busy=true so the button stays put during the nav.
        try { window.location.assign(`/application/${appId}`); return; } catch { setLocked(true); }
      }
      else setErr(r?.error === "locked" ? "This assessment was already submitted." : "Could not submit — please try again.");
    } catch { setErr("Could not submit — please try again."); }
    setBusy(false);
  }
  // Timer hit zero → auto-submit once with whatever's answered, flagged as timed out.
  useEffect(() => {
    if (left === 0 && !locked && mode !== "intro" && !autoSubmitted.current) {
      autoSubmitted.current = true; timedOut.current = true; submit(true);
    }
  }, [left, locked, mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const guard = (e) => { if (!e.target.closest?.("textarea")) e.preventDefault(); };

  const header = (
    <header className="asx-top">
      <a href="/go" aria-label="IOT TECHS home" className="asx-brand"><Wordmark height={22} /></a>
      <div className="asx-timer" title="Time remaining"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>{mm}:{ss}</div>
    </header>
  );

  // Shown when the candidate returns after leaving (tab switch / refresh / close). After 2+ departures
  // it escalates to a final warning. The leave count is server-owned, so it survives refreshes.
  const warnFinal = leaves >= 2;
  const resumeOverlay = (resumeShown && mode !== "intro" && !locked) ? (
    <div className="asx-resume" role="dialog" aria-modal="true" aria-label="You left the assessment">
      <div className={`asx-resume-card${warnFinal ? " warn" : ""}`}>
        <div className={`asx-resume-ic${warnFinal ? " warn" : ""}`}>
          {warnFinal
            ? <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            : <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
        </div>
        <h2>{warnFinal ? "Final warning" : "We noticed you left the page"}</h2>
        <p>{warnFinal
          ? "Do not leave the assessment again. Every time you leave is recorded for the review team."
          : "Continue where you left off — your answers are saved."}</p>
        <div className="asx-resume-time">Time remaining <b>{mm}:{ss}</b></div>
        {leaves > 0 && <div className="asx-resume-leaves">You&rsquo;ve left the page {leaves} time{leaves === 1 ? "" : "s"}.</div>}
        <button className="asx-resume-btn" onClick={() => setResumeShown(false)}>Continue assessment</button>
      </div>
    </div>
  ) : null;

  // ── Submitted ────────────────────────────────────────────────────────────
  if (locked) return (
    <div className="asx"><div className="asx-wrap asx-done">
      <div className="asx-done-mark"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></div>
      <h1>Assessment submitted</h1>
      <p>Thanks{firstName ? `, ${firstName}` : ""} — your answers are in. Our team will review your results and reach out with next steps. You can close this page.</p>
      <a className="asx-link" href={`/application/${appId}`}>Back to my application</a>
    </div><style>{CSS}</style></div>
  );

  // ── Intro ────────────────────────────────────────────────────────────────
  if (mode === "intro") return (
    <div className="asx" onCopy={guard} onContextMenu={guard} onCut={guard}>
      {header}
      <main className="asx-wrap asx-introwrap">
        <div className="asx-tag">Technician Pre-Hire Assessment</div>
        <h1 className="asx-introh">{firstName ? `${firstName}, tell us how you work.` : "Technician Assessment"}</h1>
        <p className="asx-introp">{N} questions · {ASSESSMENT_META.timeLimitMin} minutes. Answer honestly — your progress saves as you go.</p>
        <ul className="asx-introlist">
          <li>One question at a time — swipe or use the arrows to move.</li>
          <li>Flag any question to come back to it before you submit.</li>
          <li>You&rsquo;ll review everything on one screen before sending.</li>
        </ul>
        {staff && <p className="asx-staff">Staff preview — answers you submit here count as a real submission.</p>}
        <button className="asx-start" onClick={async () => {
          qEnter.current = Date.now();
          const r = await openAssessmentAction(appId).catch(() => null);
          if (r?.error === "locked") { setLocked(true); return; }
          if (r?.ok && typeof r.remainingSec === "number") { deadlineRef.current = Date.now() + r.remainingSec * 1000; setLeft(r.remainingSec); setLeaves(r.leaves || 0); }
          leftPageRef.current = false; setMode("quiz"); setCur(0);
        }}>Start</button>
      </main>
      <style>{CSS}</style>
    </div>
  );

  // ── Review ───────────────────────────────────────────────────────────────
  if (mode === "review") return (
    <div className="asx" onCopy={guard} onContextMenu={guard} onCut={guard}>
      {header}
      {resumeOverlay}
      <main className="asx-wrap asx-review">
        <h1 className="asx-reviewh">Review your answers</h1>
        <p className="asx-reviewp">
          {answered} of {N} answered{flaggedCount ? ` · ${flaggedCount} flagged` : ""}.
          {allAnswered ? " You're ready to submit — tap any number to look again." : " You can submit now — any blanks are scored 0 — or tap a number to finish them."}
        </p>
        <div className="asx-grid">
          {QUESTIONS.map((q, i) => {
            const r = resp[q.n] || {};
            const cls = `asx-chip ${r.answer ? "done" : "todo"}${r.flagged ? " flagged" : ""}`;
            return (
              <button key={q.n} className={cls} onClick={() => jumpTo(i)} title={r.flagged ? "Flagged for review" : r.answer ? "Answered" : "Not answered"}>
                {q.n}
                {r.flagged && <span className="asx-chip-flag"><svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor"><path d="M5 3v18M5 4h11l-2 4 2 4H5" /></svg></span>}
              </button>
            );
          })}
        </div>
        <div className="asx-legend">
          <span><i className="lg done" /> Answered</span>
          <span><i className="lg todo" /> Not answered</span>
          <span><i className="lg flagged" /> Flagged</span>
        </div>
        {confirmSubmit && !allAnswered && <div className="asx-confirmnote">{N - answered} question{N - answered === 1 ? "" : "s"} left blank — they'll be scored 0. Tap submit again to confirm.</div>}
        {err && <div className="asx-err">{err}</div>}
      </main>
      <footer className="asx-foot">
        <div className="asx-foot-in">
          <button className="asx-nav" onClick={() => setMode("quiz")}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Questions</button>
          <span className={`asx-sv ${saved}`}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span>
          <button className="asx-submit" disabled={busy} onClick={handleSubmitClick}>{busy ? "Submitting…" : allAnswered ? "Submit assessment" : confirmSubmit ? `Submit — ${N - answered} blank` : "Submit"}</button>
        </div>
      </footer>
      <style>{CSS}</style>
    </div>
  );

  // ── Quiz (one question) ──────────────────────────────────────────────────
  const q = QUESTIONS[cur];
  const r = resp[q.n] || {};
  return (
    <div className="asx" onCopy={guard} onContextMenu={guard} onCut={guard}>
      {header}
      {resumeOverlay}
      <main className="asx-wrap">
        <div className="asx-progress">
          <div className="asx-progress-top">
            <span className="asx-qcount">Question {cur + 1} of {N}</span>
            <span className="asx-cat-inline">{CAT_LABEL[q.cat]}</span>
          </div>
          <div className="asx-pbar"><i style={{ width: `${((cur + 1) / N) * 100}%` }} /></div>
        </div>

        <div className="asx-deck" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className={`asx-q${r.answer ? " done" : ""}`}>
            <div className="asx-q-h">
              <span className="asx-q-n">{q.n}</span>
              <p className="asx-q-p">{q.prompt}</p>
              <button type="button" className={`asx-flag${r.flagged ? " on" : ""}`} onClick={() => toggleFlag(q.n)} title={r.flagged ? "Flagged — tap to unflag" : "Flag for review"} aria-pressed={r.flagged}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill={r.flagged ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </button>
            </div>
            <div className="asx-choices">
              {Object.entries(q.choices).map(([key, val]) => {
                const text = typeof val === "string" ? val : val.t;
                const on = r.answer === key;
                return (
                  <button type="button" key={key} className={`asx-choice${on ? " on" : ""}`} onClick={() => answerAndAdvance(q.n, key)}>
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
      </main>

      <footer className="asx-foot">
        <div className="asx-foot-in">
          <button className="asx-nav" onClick={() => go(-1)} disabled={cur === 0}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back
          </button>
          <button className="asx-mid" onClick={() => setMode("review")} title="Jump to any question">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            <span>{answered}/{N}<span className={`asx-sv ${saved}`}>{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : ""}</span></span>
          </button>
          {cur < N - 1
            ? <button className="asx-next" onClick={() => go(1)}>Next<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></button>
            : <button className="asx-next" onClick={() => setMode("review")}>Review<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg></button>}
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
  font-family:var(--font-sans,'Instrument Sans',system-ui,sans-serif);padding-bottom:80px;
  -webkit-user-select:none;-moz-user-select:none;user-select:none;-webkit-touch-callout:none}
/* Candidates may still type/edit their own note — re-enable selection only inside the textarea. */
.asx-explain textarea{-webkit-user-select:text;-moz-user-select:text;user-select:text}
.asx-top{position:sticky;top:0;z-index:20;background:rgba(244,244,242,.9);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:12px 22px}
.asx-brand{display:inline-flex;color:var(--ink);text-decoration:none}
.asx-timer{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono,ui-monospace);font-size:.82rem;
  color:var(--muted);font-variant-numeric:tabular-nums}
.asx-wrap{max-width:640px;margin:0 auto;padding:22px 22px}
.asx-tag{font-family:var(--font-mono,ui-monospace);font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep)}
.asx-staff{margin-top:14px;font-size:.85rem;color:var(--gold-deep)}
/* intro */
.asx-introwrap{padding-top:34px}
.asx-introh{margin:8px 0 10px;font-size:1.8rem;font-weight:800;letter-spacing:-.02em;line-height:1.08}
.asx-introp{margin:0 0 18px;color:var(--ink-soft);font-size:1rem;line-height:1.55}
.asx-introlist{list-style:none;margin:0 0 24px;padding:0;display:flex;flex-direction:column;gap:11px}
.asx-introlist li{position:relative;padding-left:26px;color:var(--ink-soft);font-size:.94rem;line-height:1.45}
.asx-introlist li::before{content:"";position:absolute;left:4px;top:7px;width:8px;height:8px;border-radius:50%;background:var(--gold)}
.asx-start{background:var(--gold-deep);color:#fff;border:none;border-radius:11px;padding:14px 40px;font:inherit;
  font-weight:700;font-size:1rem;cursor:pointer;transition:.15s}
.asx-start:hover{background:#96742a;transform:translateY(-1px)}
/* progress */
.asx-progress{margin-bottom:16px}
.asx-progress-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.asx-qcount{font-family:var(--font-mono,ui-monospace);font-size:.76rem;letter-spacing:.04em;color:var(--ink-soft);font-weight:700}
.asx-cat-inline{font-family:var(--font-mono,ui-monospace);font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:right}
.asx-pbar{height:4px;border-radius:99px;background:var(--line);overflow:hidden}
.asx-pbar i{display:block;height:100%;background:var(--gold-deep);border-radius:99px;transition:width .35s cubic-bezier(.16,1,.3,1)}
/* question card */
.asx-deck{touch-action:pan-y}
.asx-q{background:var(--raise);border:1px solid var(--line);border-radius:16px;padding:20px 19px;box-shadow:0 20px 46px -34px rgba(16,20,24,.32);transition:border-color .15s}
.asx-q.done{border-color:#D8CFB9}
.asx-q-h{display:flex;gap:11px;align-items:flex-start;margin-bottom:15px}
.asx-q-n{flex:none;width:26px;height:26px;border-radius:8px;background:var(--paper);border:1px solid var(--line);
  display:grid;place-items:center;font-family:var(--font-mono,ui-monospace);font-size:.78rem;font-weight:700;color:var(--gold-deep)}
.asx-q-p{flex:1;margin:2px 0 0;font-size:1.06rem;font-weight:600;line-height:1.4;color:var(--ink)}
.asx-flag{flex:none;width:32px;height:32px;border-radius:9px;border:1px solid var(--line);background:var(--paper);
  color:var(--faint);display:grid;place-items:center;cursor:pointer;transition:.13s;margin-top:-2px}
.asx-flag:hover{border-color:var(--gold);color:var(--gold-deep)}
.asx-flag.on{background:#FBEDE9;border-color:var(--red);color:var(--red)}
.asx-choices{display:flex;flex-direction:column;gap:8px}
.asx-choice{display:flex;align-items:center;gap:10px;text-align:left;background:var(--paper);border:1px solid var(--line);
  border-radius:11px;padding:12px 14px;min-height:50px;box-sizing:border-box;cursor:pointer;font:inherit;color:var(--ink-soft);transition:.12s}
.asx-choice:hover{border-color:var(--gold);background:#fff}
.asx-choice.on{border-color:var(--gold-deep);background:#F6F0E2;color:var(--ink)}
.asx-radio{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--faint);display:grid;place-items:center}
.asx-choice.on .asx-radio{border-color:var(--gold-deep)}
.asx-dot{width:8px;height:8px;border-radius:50%;background:var(--gold-deep)}
.asx-key{font-family:var(--font-mono,ui-monospace);font-weight:700;font-size:.8rem;color:var(--muted);flex:none}
.asx-choice.on .asx-key{color:var(--gold-deep)}
.asx-ctext{font-size:.94rem;line-height:1.4}
.asx-explain{margin-top:14px}
.asx-explain label{display:block;font-size:.78rem;font-weight:700;color:var(--ink-soft);margin-bottom:5px}
.asx-explain label span{font-weight:400;color:var(--faint)}
.asx-explain textarea{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:9px;padding:9px 11px;
  font:inherit;font-size:16px;color:var(--ink);background:var(--paper);outline:none;resize:vertical;scroll-margin-bottom:100px}
.asx-explain textarea:focus{border-color:var(--gold)}
.asx-addnote{margin-top:14px;display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:2px 0;
  cursor:pointer;font:inherit;font-size:.82rem;font-weight:600;color:var(--muted);transition:color .12s}
.asx-addnote:hover{color:var(--gold-deep)}
.asx-addnote svg{color:var(--faint)}.asx-addnote:hover svg{color:var(--gold-deep)}
/* review */
.asx-reviewh{margin:6px 0 8px;font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
.asx-reviewp{margin:0 0 20px;color:var(--ink-soft);font-size:.95rem;line-height:1.5}
.asx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:10px}
.asx-chip{position:relative;aspect-ratio:1;border-radius:11px;border:1.5px solid var(--line);background:var(--raise);
  font-family:var(--font-mono,ui-monospace);font-weight:700;font-size:.9rem;color:var(--muted);cursor:pointer;transition:.12s}
.asx-chip:hover{transform:translateY(-2px)}
.asx-chip.done{background:#F6F0E2;border-color:var(--gold-deep);color:var(--gold-deep)}
.asx-chip.todo{border-style:dashed}
.asx-chip.flagged{box-shadow:0 0 0 2px var(--red)}
.asx-chip-flag{position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;display:grid;place-items:center}
.asx-legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:18px;font-size:.8rem;color:var(--muted)}
.asx-legend span{display:inline-flex;align-items:center;gap:7px}
.asx-legend .lg{width:14px;height:14px;border-radius:5px;border:1.5px solid var(--line);background:var(--raise)}
.asx-legend .lg.done{background:#F6F0E2;border-color:var(--gold-deep)}
.asx-legend .lg.todo{border-style:dashed}
.asx-legend .lg.flagged{box-shadow:0 0 0 2px var(--red);border-color:transparent}
.asx-err{margin-top:16px;background:#F6E7E2;color:var(--red);border-radius:10px;padding:11px 14px;font-size:.9rem;font-weight:600}
.asx-confirmnote{margin-top:16px;background:#FBF3E4;color:var(--gold-deep);border:1px solid #E7D4A6;border-radius:10px;padding:11px 14px;font-size:.88rem;font-weight:600}
/* resume / left-the-page overlay */
.asx-resume{position:fixed;inset:0;z-index:40;background:rgba(16,20,24,.55);backdrop-filter:blur(4px);display:grid;place-items:center;padding:22px}
.asx-resume-card{background:var(--raise);border:1px solid var(--line);border-radius:18px;max-width:420px;width:100%;padding:28px 26px;text-align:center;box-shadow:0 30px 70px -30px rgba(16,20,24,.5)}
.asx-resume-card.warn{border-color:var(--red)}
.asx-resume-ic{width:60px;height:60px;border-radius:50%;background:#F3ECDD;color:var(--gold-deep);display:grid;place-items:center;margin:0 auto 16px}
.asx-resume-ic.warn{background:#FBEDE9;color:var(--red)}
.asx-resume-card h2{margin:0 0 8px;font-size:1.3rem;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.asx-resume-card p{margin:0 0 16px;color:var(--ink-soft);font-size:.95rem;line-height:1.5}
.asx-resume-time{display:inline-flex;align-items:center;gap:8px;font-size:.9rem;color:var(--ink-soft);background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:9px 16px;margin-bottom:10px}
.asx-resume-time b{font-family:var(--font-mono,ui-monospace);font-size:1.05rem;color:var(--ink);font-variant-numeric:tabular-nums}
.asx-resume-leaves{font-size:.8rem;color:var(--muted);margin-bottom:18px}
.asx-resume-btn{background:var(--gold-deep);color:#fff;border:none;border-radius:11px;padding:13px 28px;font:inherit;font-weight:700;font-size:.98rem;cursor:pointer;transition:.15s}
.asx-resume-card.warn .asx-resume-btn{background:var(--red)}
.asx-resume-btn:hover{filter:brightness(1.07)}
/* footer nav */
.asx-foot{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(251,251,250,.94);backdrop-filter:blur(10px);
  border-top:1px solid var(--line)}
.asx-foot-in{max-width:640px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.asx-nav{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:none;border:1px solid var(--line);border-radius:10px;
  padding:10px 16px;min-height:44px;font:inherit;font-weight:700;font-size:.9rem;color:var(--ink-soft);cursor:pointer;transition:.13s}
.asx-nav:hover:not(:disabled){border-color:var(--gold);color:var(--gold-deep)}
.asx-nav:disabled{opacity:.4;cursor:not-allowed}
.asx-next{display:inline-flex;align-items:center;justify-content:center;gap:7px;background:var(--gold-deep);color:#fff;border:none;border-radius:10px;
  padding:11px 20px;min-height:44px;font:inherit;font-weight:700;font-size:.92rem;cursor:pointer;transition:.15s}
.asx-next:hover{background:#96742a}
.asx-mid{display:inline-flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;font:inherit;
  font-family:var(--font-mono,ui-monospace);font-size:.8rem;font-weight:700;color:var(--muted);transition:color .12s}
.asx-mid:hover{color:var(--gold-deep)}
.asx-mid>span{display:flex;flex-direction:column;align-items:center;line-height:1.2}
.asx-sv{font-size:.68rem;color:var(--green);font-weight:600}.asx-sv.saving{color:var(--faint)}
.asx-submit{background:var(--gold-deep);color:#fff;border:none;border-radius:10px;padding:12px 22px;min-height:44px;font:inherit;
  font-weight:700;font-size:.95rem;cursor:pointer;transition:.15s}
.asx-submit:hover:not(:disabled){background:#96742a}
.asx-submit:disabled{opacity:.45;cursor:not-allowed}
/* submitted */
.asx-done{text-align:center;padding-top:60px}
.asx-done-mark{width:64px;height:64px;border-radius:50%;background:#E6F0EA;color:var(--green);display:grid;place-items:center;margin:0 auto 18px}
.asx-done h1{font-size:1.6rem;font-weight:800;margin:0 0 10px}
.asx-done p{color:var(--ink-soft);max-width:44ch;margin:0 auto 18px;line-height:1.55}
.asx-link{color:var(--gold-deep);font-weight:600;text-decoration:none}
@media(max-width:560px){.asx-introh{font-size:1.55rem}.asx-q-p{font-size:1rem}}
`;
