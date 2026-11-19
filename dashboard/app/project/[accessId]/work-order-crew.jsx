"use client";

// Who is on site, and what to do about someone who shouldn't be (docs/WORK_ORDERS.md, Stage 3
// addendum). Two things, both office-only:
//
//   • The checked-in list — everyone who arrived today, assigned or not, with the time. A job runs on
//     knowing who is actually there, which is not the same as who was scheduled.
//   • The prompt — a technician PINned in with their own account and started work on a job nobody put
//     them on. The work is already saved and logged; what the office decides is whether it is PAID.
//     Assign puts them on the crew and releases it, Not now leaves the prompt, Reject voids the money
//     and keeps the record.
import { useState } from "react";
import { decideCheckinAction } from "./work-order-actions";

const clock = (s) => {
  const m = String(s || "").match(/[T ](\d{2}):(\d{2})/);
  if (!m) return "";
  let h = +m[1]; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
};

export default function WorkOrderCrew({ accessId, doc, canDecide, onDoc }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const here = doc.checkins || [];
  const prompts = canDecide ? (doc.pendingCheckins || []) : [];
  if (!here.length && !prompts.length) return null;

  async function decide(id, decision) {
    setBusy(id); setErr(null);
    const r = await decideCheckinAction(accessId, id, decision);
    setBusy(null);
    if (r?.error) { setErr(r.error); return; }
    if (r.doc) onDoc?.(r.doc);
  }

  return (
    <div className="woc2">
      {/* The prompt, one per undecided arrival. It is the first thing in the section because it is the
          only part that needs a decision. */}
      {prompts.map((c) => (
        <div key={c.id} className="woc2-ask">
          <div className="woc2-ask-t"><b>{c.name}</b> checked in at {clock(c.in_at)} and isn't on this job.</div>
          <div className="woc2-ask-b">
            <button type="button" className="woc2-no" disabled={busy === c.id} onClick={() => decide(c.id, "not_now")}>Not now</button>
            <button type="button" className="woc2-rej" disabled={busy === c.id} onClick={() => decide(c.id, "reject")}>Reject</button>
            <button type="button" className="woc2-yes" disabled={busy === c.id} onClick={() => decide(c.id, "assign")}>Assign</button>
          </div>
        </div>
      ))}
      {err && <div className="woc2-err">{err}</div>}

      {here.length > 0 && (
        <div className="woc2-here">
          <span className="woc2-lbl">On site today</span>
          {here.map((c) => (
            <span key={c.id} className={`woc2-chip${c.assigned || c.decision === "assigned" ? "" : c.decision === "rejected" ? " rejected" : " pending"}`}>
              <b>{c.name}</b> {clock(c.in_at)}
              {!c.assigned && c.decision !== "assigned" && <i>{c.decision === "rejected" ? "rejected" : "pending"}</i>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
