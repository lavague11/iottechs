"use client";
import { useState, useEffect } from "react";
import { scheduleDefaults, tomorrowLocalAt, toLocalInput, friendlyWhen } from "../../../lib/send-schedule";

// Shared "Send now / Schedule send" chooser for staff → customer approval emails (signature requests and
// add-on approvals). Same 8:30 AM default, same quick picks, same late-hour nudge everywhere. Presentation
// only: the host passes onSendNow / onSchedule(iso) and does the actual send/store.
//
// Props: open, title, subtitle?, busy?, customerTz?, onSendNow, onSchedule(iso), onClose.
export default function SendScheduler({ open, title, subtitle = "", busy = false, customerTz = "", onSendNow, onSchedule, onClose }) {
  const [mode, setMode] = useState("choose");   // "choose" | "schedule"
  const [val, setVal] = useState("");           // datetime-local value
  const [late, setLate] = useState(false);
  const [edited, setEdited] = useState(false);  // user changed the time → stop showing the "it's late" default note

  // On each open, recompute the default + late state and preselect scheduling when it's late.
  useEffect(() => {
    if (!open) return;
    const d = scheduleDefaults({ tz: customerTz });
    setVal(d.defaultLocal);
    setLate(d.late);
    setMode(d.late ? "schedule" : "choose");
    setEdited(false);
  }, [open, customerTz]);

  if (!open) return null;

  const pick = (date) => { setVal(toLocalInput(date)); setEdited(true); };
  const schedule = () => { if (val) onSchedule?.(new Date(val).toISOString()); };
  const showLateNote = late && !edited && mode === "schedule";

  return (
    <div className="ssc-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="ssc" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ssc-h">{title}</div>
        {subtitle && <div className="ssc-sub">{subtitle}</div>}
        {showLateNote && <div className="ssc-late">It’s late — scheduled for {friendlyWhen(val)}. Switch to Send now to send it anyway.</div>}

        {mode === "choose" ? (
          <div className="ssc-acts">
            <button type="button" className="ssc-primary" disabled={busy} onClick={() => onSendNow?.()}>Send now</button>
            <button type="button" className="ssc-ghost" disabled={busy} onClick={() => setMode("schedule")}>Schedule send</button>
            <button type="button" className="ssc-text" disabled={busy} onClick={() => onClose?.()}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="ssc-picks">
              <button type="button" className="ssc-chip" disabled={busy} onClick={() => pick(tomorrowLocalAt(8, 30))}>Tomorrow 8:30 AM</button>
              <button type="button" className="ssc-chip" disabled={busy} onClick={() => pick(tomorrowLocalAt(12, 0))}>Tomorrow 12 PM</button>
            </div>
            <label className="ssc-fld"><span>Send at</span>
              <input type="datetime-local" value={val} disabled={busy} onChange={(e) => { setVal(e.target.value); setEdited(true); }} />
            </label>
            <div className="ssc-acts">
              <button type="button" className="ssc-primary" disabled={busy || !val} onClick={schedule}>Schedule</button>
              <button type="button" className="ssc-ghost" disabled={busy} onClick={() => onSendNow?.()}>Send now</button>
              <button type="button" className="ssc-text" disabled={busy} onClick={() => (late ? onClose?.() : setMode("choose"))}>{late ? "Cancel" : "Back"}</button>
            </div>
          </>
        )}
      </div>
      <style>{SSC_CSS}</style>
    </div>
  );
}

const SSC_CSS = `
.ssc-bg{position:fixed;inset:0;z-index:80;background:rgba(14,18,30,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.ssc{width:100%;max-width:400px;background:var(--dv-bg,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 20px 60px rgba(14,18,30,.34);padding:18px}
.ssc-h{font-size:1rem;font-weight:700;color:var(--dv-ink,#101418)}
.ssc-sub{margin-top:4px;font-size:.84rem;color:var(--dv-meta,#787D84)}
.ssc-late{margin-top:12px;padding:9px 11px;border-radius:10px;background:#fbf3e3;border:1px solid #e8d7ab;color:#7a5b16;font-size:.8rem;line-height:1.35}
.ssc-picks{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.ssc-chip{flex:1;min-width:130px;padding:9px 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .82rem/1 inherit;cursor:pointer}
.ssc-chip:hover:not(:disabled){border-color:#C9A96E}
.ssc-fld{display:flex;flex-direction:column;gap:5px;margin-top:12px}
.ssc-fld>span{font-size:.72rem;letter-spacing:.4px;text-transform:uppercase;color:var(--dv-meta,#787D84);font-weight:700}
.ssc-fld input{padding:10px 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:inherit;font-size:.9rem}
.ssc-acts{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.ssc-primary{flex:1;min-width:110px;padding:11px 14px;border:0;border-radius:10px;background:#C9A96E;color:#1b1710;font:700 .88rem/1 inherit;cursor:pointer}
.ssc-ghost{flex:1;min-width:110px;padding:11px 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:700 .88rem/1 inherit;cursor:pointer}
.ssc-ghost:hover:not(:disabled){border-color:#C9A96E}
.ssc-text{padding:11px 10px;border:0;background:none;color:var(--dv-meta,#787D84);font:600 .84rem/1 inherit;cursor:pointer}
.ssc-primary:disabled,.ssc-ghost:disabled,.ssc-text:disabled,.ssc-chip:disabled{opacity:.5;cursor:default}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .ssc{background:#14171f}:root:not([data-theme="light"]) .ssc-late{background:#2a2412;border-color:#5a4c22;color:#e7cf96}}
`;
