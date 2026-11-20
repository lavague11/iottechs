"use client";

import { useState } from "react";
import { acceptStageAction } from "./proposal-actions";

// The fork the customer meets straight after their activation QR, inside Completion: set the app up
// now, or say they're done. Two actions, nothing else.
//
// "Complete my project" IS the customer walkthrough acceptance (`qc_customer`) — the same lifecycle
// fact the closeout walkthrough records, through the same server action, which re-checks the role,
// re-checks ownership, refuses unless every device passed QC, and captures the QC fingerprint
// itself. Nothing is written client-side and no gate is loosened; this is only a friendlier door to
// it. It is offered ONLY when `canComplete` (that gate is already satisfiable) so the button can
// never fail on a server refusal the customer can't act on.
//
// The confirm step is inline rather than the shared ConfirmDialog: this is an acceptance, not a
// deletion, so it needs to SAY what is being agreed to — and the shared dialog's confirm button is
// styled destructive-red, which is the wrong signal for finishing a job.
const fmtWhen = (t) => {
  try { return new Date(String(t).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); }
  catch { return ""; }
};

export default function CompletionChoice({ accessId, guideHref, canComplete = false, signed = false, signedAt = null, preview = false, onDone }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function complete() {
    if (busy || preview) return;
    setBusy(true); setErr(null);
    const r = await acceptStageAction(accessId, "qc_customer", true);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setAsking(false);
    onDone?.(r.acceptances, r.stage);
  }

  const phone = (
    <a className="cch-btn" href={guideHref}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
      Set up my phone
    </a>
  );

  return (
    <div className="cch">
      <style>{CCH_CSS}</style>

      {signed ? (
        <>
          <div className="cch-done">
            <span className="cch-tick" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
            <span>Project completed{signedAt ? ` · ${fmtWhen(signedAt)}` : ""}</span>
          </div>
          <div className="cch-row">{phone}</div>
        </>
      ) : asking ? (
        // Spell out what they are agreeing to — this records their acceptance of the finished work.
        <div className="cch-ask">
          <p className="cch-ask-t">You&rsquo;re confirming the work is finished and everything is working as expected.</p>
          {err && <p className="cch-err">{err}</p>}
          <div className="cch-row">
            <button type="button" className="cch-btn" disabled={busy} onClick={() => { setAsking(false); setErr(null); }}>Cancel</button>
            <button type="button" className="cch-btn pri" disabled={busy} onClick={complete}>{busy ? "Completing…" : "Confirm"}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="cch-row">
            {phone}
            {canComplete && (
              <button type="button" className="cch-btn pri" disabled={preview} onClick={() => setAsking(true)}>Complete my project</button>
            )}
          </div>
          {/* Render only when real: no dead "complete" button while the team is still checking. */}
          {!canComplete && <p className="cch-wait">Your team is finishing their final checks — you&rsquo;ll be able to close this out shortly.</p>}
          {err && <p className="cch-err">{err}</p>}
        </>
      )}
    </div>
  );
}

const CCH_CSS = `
.cch{margin-top:12px}
.cch-row{display:flex;gap:10px;flex-wrap:wrap}
.cch-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 18px;border:1px solid var(--line,#E4E4DF);border-radius:11px;background:#fff;color:var(--ink,#101418);font:600 14.5px/1 inherit;text-decoration:none;cursor:pointer;flex:1 1 auto;min-width:150px}
.cch-btn:hover{border-color:var(--ink,#101418)}
.cch-btn.pri{background:var(--gold,#C9A96E);border-color:var(--gold,#C9A96E);color:#1a1205;font-weight:700}
.cch-btn.pri:hover{background:var(--gold-deep,#A8842F);border-color:var(--gold-deep,#A8842F);color:#fff}
.cch-btn:disabled{opacity:.6;cursor:default}
.cch-ask{border:1px solid var(--line,#E4E4DF);border-radius:12px;padding:14px 15px;background:var(--raise,#FBFBFA)}
.cch-ask-t{margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--ink-soft,#3A4048)}
.cch-done{display:flex;align-items:center;gap:9px;font-size:14.5px;font-weight:650;color:var(--green,#2E7D5B);margin-bottom:10px}
.cch-tick{display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#e9f3ed;flex:0 0 auto}
.cch-wait{margin:10px 0 0;font-size:13px;color:var(--meta,#787D84)}
.cch-err{margin:10px 0 0;font-size:13px;color:var(--red,#C4553D)}
`;
