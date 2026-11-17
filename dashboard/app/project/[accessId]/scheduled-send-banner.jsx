"use client";
import { friendlyWhen } from "../../../lib/send-schedule";

// ONE scheduled-email row: "<label> scheduled for 8:30 AM tomorrow · Edit · Send now · Cancel".
// Every surface that can hold a pending customer email renders this — the Request Signature sheet, the
// staff project hub, and the proposal builder — so the wording, the three actions and the amber treatment
// can never drift apart. Presentation only: the host owns the schedule and does the work in the handlers.
//
// The amber surface is a single-class rule, so a host that needs a different tint (the hub's status hero
// sits on its own tinted card) overrides it with a two-class selector from its own stylesheet — no fork.
export default function ScheduledSendBanner({ at, label = "Email", busy = false, className = "", onEdit, onSendNow, onCancel }) {
  if (!at) return null;
  return (
    <div className={`ssb${className ? " " + className : ""}`}>
      <span className="ssb-t">{label} scheduled for {friendlyWhen(at)}</span>
      <span className="ssb-acts">
        {onEdit && <button type="button" disabled={busy} onClick={onEdit}>Edit</button>}
        {onSendNow && <button type="button" disabled={busy} onClick={onSendNow}>Send now</button>}
        {onCancel && <button type="button" className="ssb-cancel" disabled={busy} onClick={onCancel}>Cancel</button>}
      </span>
      <style>{SSB_CSS}</style>
    </div>
  );
}

const SSB_CSS = `
.ssb{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:10px;padding:10px 13px;border-radius:11px;background:#fbf3e3;border:1px solid #e8d7ab}
.ssb-t{font-size:12.5px;font-weight:600;color:#7a5b16;flex:1;min-width:155px}
.ssb-acts{display:inline-flex;gap:12px}
.ssb-acts button{border:0;background:none;color:#7a5b16;font:600 12.5px/1 inherit;cursor:pointer;padding:0}
.ssb-acts button:hover:not(:disabled){text-decoration:underline}
.ssb-acts button:disabled{opacity:.5;cursor:default}
.ssb-acts .ssb-cancel{color:#b23b3b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .ssb{background:#2a2412;border-color:#5a4c22}:root:not([data-theme="light"]) .ssb-t,:root:not([data-theme="light"]) .ssb-acts button{color:#e7cf96}:root:not([data-theme="light"]) .ssb-acts .ssb-cancel{color:#e09a9a}}
`;
