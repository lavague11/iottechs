"use client";

// End of day, sign-off and close (docs/WORK_ORDERS.md, Stage 4 — requirements 22, 24, 25).
//
// Three things in one quiet strip, each appearing only when it is real:
//   • End of day — banks today's work into a locked daily log. It does NOT close the job; installs
//     run over days. The office can close a day for a technician who has gone home (requirement 23).
//   • The daily log — what has already been banked, per person per day.
//   • Sign-off and close — once every line is complete the customer signs, which closes the work
//     order. The office can also close it by hand, because a job can end without a signature.
import { useState } from "react";
import { endDayAction, signWorkOrderCustomerAction, closeWorkOrderAction } from "./work-order-actions";
import SignPad from "./work-order-signpad";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayText = (d) => {
  const m = String(d || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d || "");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MON[+m[2] - 1]} ${+m[3]}`;
};

// `canSignoff` is the office taking the customer's signature in person at the walkthrough — the
// common case. The customer's own route into this is their portal card (work-order-signoff.jsx),
// which never shows them the work order itself.
export default function WorkOrderCloseout({ accessId, doc, role, showMoney, canSignoff, canClose, onDoc }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [signOpen, setSignOpen] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const [done, setDone] = useState(null);

  const allDone = !!doc.progress?.allDone;
  const closed = doc.status === "closed";
  const signed = !!doc.customerSignature;
  const logs = doc.dayLogs || [];
  const unlocked = doc.unlocked || { payable: 0, pending: 0 };
  const mine = doc.myUnlocked || { payable: 0, pending: 0 };
  // Anyone on site who hasn't banked their day — the office's list, and the technician's own prompt.
  const openDays = (doc.checkins || []).filter((c) => !logs.some((l) => String(l.name).toLowerCase() === String(c.name).toLowerCase() && l.day === c.day));

  async function run(fn, after) {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (r?.error) { setErr(r.error); return r; }
    if (r?.doc) onDoc?.(r.doc);
    after?.(r);
    return r;
  }
  const endMyDay = () => run(() => endDayAction(accessId), (r) => setDone(`Day closed · ${r.lines} line${r.lines === 1 ? "" : "s"}${showMoney ? ` · ${money(r.total)}` : ""}`));
  const endFor = (c) => run(() => endDayAction(accessId, { forName: c.name, forUserId: c.user_id ?? null }));
  const sign = (s) => run(() => signWorkOrderCustomerAction(accessId, s), () => setSignOpen(false));
  const close = () => run(() => closeWorkOrderAction(accessId, false), () => setAskClose(false));
  const reopen = () => run(() => closeWorkOrderAction(accessId, true));

  if (!doc.version) return null;

  return (
    <div className="wcl">
      {err && <div className="wcl-err">{err}</div>}
      {done && <div className="wcl-done">{done}</div>}

      {/* The technician's own End of day. Only while they are on site with work not yet banked. */}
      {doc.myDayOpen && !closed && (
        <div className="wcl-row">
          <span className="wcl-t">Your work today isn't banked yet.{showMoney && mine.payable > 0 ? ` ${money(mine.payable)} ready.` : ""}</span>
          <button type="button" className="wcl-cta" disabled={busy} onClick={endMyDay}>End of day</button>
        </div>
      )}

      {/* Requirement 23 — the office can close a day for someone who has gone home. */}
      {canClose && !closed && openDays.filter((c) => !doc.myDayOpen || String(c.name).toLowerCase() !== String(doc.myCheckin?.name || "").toLowerCase()).map((c) => (
        <div key={c.id} className="wcl-row quiet">
          <span className="wcl-t"><b>{c.name}</b> hasn't ended their day ({dayText(c.day)}).</span>
          <button type="button" className="wcl-ghost" disabled={busy} onClick={() => endFor(c)}>End it for them</button>
        </div>
      ))}

      {/* What has been banked. Money only for those allowed to see it. */}
      {logs.length > 0 && (
        <div className="wcl-logs">
          <span className="wcl-lbl">Daily log</span>
          {logs.map((l) => (
            <div key={l.id} className="wcl-log">
              <b>{l.name}</b>
              <span>{dayText(l.day)}</span>
              <span className="wcl-ln">{l.lines_completed} line{l.lines_completed === 1 ? "" : "s"}</span>
              {showMoney && <span className="wcl-amt">{money(l.payout_total)}</span>}
            </div>
          ))}
          {showMoney && unlocked.pending > 0 && (
            <div className="wcl-pending">{money(unlocked.pending)} held — waiting on an assignment decision.</div>
          )}
        </div>
      )}

      {/* Requirements 24 + 25. The sign-off appears only when every line is complete; closing follows. */}
      {closed ? (
        <div className="wcl-closed">
          <span>Closed{doc.closedBy ? ` by ${doc.closedBy}` : ""}{signed ? ` · signed off by ${doc.customerSignature.name}` : ""}</span>
          {canClose && <button type="button" className="wcl-ghost" disabled={busy} onClick={reopen}>Reopen</button>}
        </div>
      ) : signed ? (
        <div className="wcl-row"><span className="wcl-t">Signed off by <b>{doc.customerSignature.name}</b>.</span></div>
      ) : allDone ? (
        <div className="wcl-row done">
          <span className="wcl-t">Every line is complete.</span>
          <span className="wcl-wait">Awaiting the customer's sign-off.</span>
          {canSignoff && <button type="button" className="wcl-cta sign" disabled={busy} onClick={() => setSignOpen(true)}>Sign off</button>}
          {canClose && (askClose ? (
            <span className="wcl-confirm">Close without a signature?
              <button type="button" className="wcl-keep" onClick={() => setAskClose(false)}>Keep open</button>
              <button type="button" className="wcl-danger" disabled={busy} onClick={close}>Close</button>
            </span>
          ) : <button type="button" className="wcl-ghost" disabled={busy} onClick={() => setAskClose(true)}>Close</button>)}
        </div>
      ) : null}

      {signOpen && (
        <SignPad
          heading="Sign off the work"
          subheading="Confirming the work on this order is complete."
          agree="I confirm the work described has been completed to my satisfaction."
          busy={busy}
          onCancel={() => setSignOpen(false)}
          onConfirm={sign}
        />
      )}
    </div>
  );
}
