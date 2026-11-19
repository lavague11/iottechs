"use client";

// The customer's sign-off on the finished work (docs/WORK_ORDERS.md, requirement 24).
//
// This is the ONLY part of a work order a customer ever meets. They are not shown the scope document,
// the payouts, the crew or the daily logs — just the fact that the work is finished and a place to
// say so. The read behind it (getWorkOrderSignoffAction) returns those few fields and nothing else.
import { useState, useEffect } from "react";
import SignPad from "./work-order-signpad";
import { getWorkOrderSignoffAction, signWorkOrderCustomerAction } from "./work-order-actions";

const stamp = (s) => {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
};

export default function WorkOrderSignoff({ accessId, defaultName = "", preview = false }) {
  const [state, setState] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    getWorkOrderSignoffAction(accessId).then((r) => { if (live && r?.ok) setState(r.state); }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  async function sign(s) {
    setBusy(true); setErr(null);
    const r = await signWorkOrderCustomerAction(accessId, s);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setOpen(false);
    const fresh = await getWorkOrderSignoffAction(accessId);
    if (fresh?.ok) setState(fresh.state);
  }

  // Render only when it is real: no work order, or work still outstanding, and there is nothing to say.
  if (state === undefined || !state) return null;
  if (!state.allDone && !state.signed) return null;

  return (
    <div className="wso">
      <style>{CSS}</style>
      {state.signed ? (
        <div className="wso-done">
          <span className="wso-tick" aria-hidden="true">✓</span>
          <span>Work signed off by <b>{state.signedBy}</b>{state.signedAt ? ` · ${stamp(state.signedAt)}` : ""}</span>
        </div>
      ) : (
        <div className="wso-ask">
          <div className="wso-copy">
            <b>The installation is finished.</b>
            <span>Sign off to confirm the work is complete.</span>
          </div>
          {err && <div className="wso-err">{err}</div>}
          <button type="button" className="wso-cta" disabled={busy || preview} onClick={() => setOpen(true)}>Sign off</button>
        </div>
      )}
      {open && (
        <SignPad
          heading="Sign off the work"
          agree="I confirm the work described has been completed to my satisfaction."
          defaultName={defaultName}
          busy={busy}
          serverError={err}
          onCancel={() => setOpen(false)}
          onConfirm={sign}
        />
      )}
    </div>
  );
}

const CSS = `
.wso{margin:12px 0}
.wso-ask{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:15px 17px;border:1px solid var(--dv-line,#E4E4DF);border-top:2px solid var(--dv-green,#2E7D5B);border-radius:12px;background:var(--dv-raise,#FBFBFA)}
.wso-copy{display:flex;flex-direction:column;gap:2px;flex:1 1 220px;min-width:0}
.wso-copy b{font-size:.95rem;color:var(--dv-ink,#101418)}
.wso-copy span{font-size:.82rem;color:var(--dv-meta,#787D84)}
.wso-cta{height:44px;padding:0 22px;border:0;border-radius:10px;background:var(--dv-green,#2E7D5B);color:#fff;font:700 .88rem/1 inherit;cursor:pointer;white-space:nowrap}
.wso-cta:disabled{opacity:.5;cursor:default}
.wso-done{display:flex;align-items:center;gap:11px;padding:14px 17px;border-radius:12px;background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-size:.86rem;font-weight:600}
.wso-done b{color:var(--dv-ink,#101418)}
.wso-tick{width:26px;height:26px;flex-shrink:0;border-radius:50%;background:var(--dv-green,#2E7D5B);color:#fff;display:grid;place-items:center;font-size:.9rem}
.wso-err{flex:1 1 100%;padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
@media (max-width:600px){ .wso-ask{flex-direction:column;align-items:stretch} .wso-cta{width:100%} }
`;
