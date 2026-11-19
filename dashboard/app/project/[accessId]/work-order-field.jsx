"use client";

// The technician's half of the work order (docs/WORK_ORDERS.md, Stage 3): check in on site, then work
// the list. One row per line; tapping one opens the status popup. Built for a phone in a driveway —
// large tap targets, one decision per screen, and nothing lost when the signal goes.
//
// Owner's decision A (2026-11-19): the three-state popup keeps the install checklist's STEP path inside
// it. Complete fills the path; Incomplete can still say how far the crew got, so partial work pays.
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import MicButton from "../../components/mic-button";
import { LINE_STATUS, lineStatusGate, lineSteps } from "../../../lib/work-order-field";
import { checkInAction, setLineStatusAction, addLinePhotoAction, syncFieldQueueAction } from "./work-order-actions";
import { enqueue, readQueue, settle, online, opKeyOf } from "./work-order-queue";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_LABEL = { complete: "Complete", attention: "Needs attention", incomplete: "Incomplete" };

const Ic = ({ d, s = 16 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const CAM_D = "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8";
const PIN_D = "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6";

// Upload a photo through /api/media (HEIC-safe, server-side conversion) and return its URL. A data:
// URL must never reach a row, so the upload has to succeed before the status can.
async function uploadPhoto(file) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");
  const r = await fetch("/api/media", { method: "POST", body: fd, credentials: "same-origin" });
  if (!r.ok) throw new Error("Upload failed");
  const j = await r.json();
  return j?.url || j?.path || null;
}

export default function WorkOrderField({ accessId, doc, role, showMoney, onDoc, canAct }) {
  const [open, setOpen] = useState(null);          // the line whose popup is open
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const syncing = useRef(false);

  // Replay anything the device is still holding: on mount, and the moment the connection returns.
  const flush = useCallback(async () => {
    if (syncing.current || !online()) return;
    const q = await readQueue(accessId);
    if (!q.length) { setQueued(0); return; }
    syncing.current = true;
    try {
      const r = await syncFieldQueueAction(accessId, q);
      if (r?.doc) onDoc?.(r.doc);
      setQueued(await settle(accessId, r?.results || []));
    } catch { /* still offline — the queue keeps it */ }
    finally { syncing.current = false; }
  }, [accessId, onDoc]);

  useEffect(() => {
    readQueue(accessId).then((q) => setQueued(q.length));
    flush();
    const on = () => flush();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [accessId, flush]);

  async function checkIn() {
    setBusy(true); setErr(null);
    const pos = await new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { timeout: 6000, maximumAge: 60000 });
    });
    const r = await checkInAction(accessId, { lat: pos?.coords?.latitude ?? null, lng: pos?.coords?.longitude ?? null });
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    onDoc?.(r.doc);
  }

  // One field act: write it to the device queue, then try to send. Offline, the send throws and the op
  // simply stays queued — the tap is never lost, which is the whole requirement.
  async function mark(line, { status, pickStep, note }) {
    const op = { action: "status", lineKey: line.key, status, pickStep: pickStep ?? null, note: note || "", clientAt: new Date().toISOString() };
    setQueued(await enqueue(accessId, op));
    setBusy(true); setErr(null);
    try {
      const r = await setLineStatusAction(accessId, op);
      if (r?.error) { setErr(r.error); setBusy(false); return false; }
      if (r?.doc) onDoc?.(r.doc);
      setQueued(await settle(accessId, [{ key: opKeyOf(op), ok: true }]));
    } catch {
      setErr(null);   // offline is not an error — the op is queued and will replay
    }
    setBusy(false);
    setOpen(null);
    return true;
  }

  async function addPhoto(line, slot, file) {
    setBusy(true); setErr(null);
    try {
      const url = await uploadPhoto(file);
      if (!url) throw new Error("Upload failed");
      const r = await addLinePhotoAction(accessId, { lineKey: line.key, slot, mediaUrl: url });
      if (r?.error) { setErr(r.error); } else if (r?.doc) { onDoc?.(r.doc); setOpen((o) => (o ? r.doc.lines.find((l) => l.key === o.key) || o : o)); }
    } catch { setErr("Couldn't upload that photo — try again when you have signal."); }
    setBusy(false);
  }

  const p = doc.progress || {};
  return (
    <div className="wfd">
      <div className="wfd-top">
        {doc.checkedInToday ? (
          <span className="wfd-in"><Ic d={PIN_D} s={15} /> On site today</span>
        ) : (
          <button type="button" className="wfd-checkin" disabled={busy || !canAct} onClick={checkIn}><Ic d={PIN_D} s={16} /> I'm on site</button>
        )}
        <span className="wfd-prog">{p.done} / {p.total} steps{p.attention ? ` · ${p.attention} flagged` : ""}</span>
        {/* Requirement 21's visible half: the technician can see work is waiting to sync. */}
        {queued > 0 && <span className="wfd-queue" title="Saved on this phone — will sync when you have signal">{queued} pending sync</span>}
      </div>

      {err && <div className="wfd-err">{err}</div>}
      {/* A technician who isn't on this job's crew is told so plainly, once they have checked in. The
          work still saves — it is held pending until the office assigns them. */}
      {doc.myCheckin && !doc.myCheckin.assigned && doc.myCheckin.decision !== "assigned" && (
        <div className={`wfd-unassigned${doc.myCheckin.decision === "rejected" ? " rejected" : ""}`}>
          {doc.myCheckin.decision === "rejected"
            ? "Your work on this job wasn't approved — talk to the office."
            : "You're not assigned to this job — admin has been notified. Your work is saved and will count once they assign you."}
        </div>
      )}
      {!doc.checkedInToday && <div className="wfd-hint">Check in to start marking lines.</div>}

      <div className="wfd-lines">
        {doc.lines.filter((l) => !l.parentKey || l.kind !== "labor").map((l) => {
          const st = l.state?.status || LINE_STATUS.INCOMPLETE;
          const steps = lineSteps(l.kind).length;
          const done = Math.min(+l.state?.steps_done || 0, steps);
          return (
            <button key={l.key} type="button" className={`wfd-line ${st}`} onClick={() => setOpen(l)}>
              <span className={`wfd-dot ${st}`} aria-hidden="true" />
              <span className="wfd-name">
                {l.name}
                {l.cpe && <span className="wfd-tag">CPE</span>}
                {l.needsPhotos && <span className="wfd-tag cam"><Ic d={CAM_D} s={12} /></span>}
              </span>
              <span className="wfd-state">
                {st === LINE_STATUS.COMPLETE ? "Complete" : st === LINE_STATUS.ATTENTION ? "Flagged" : steps > 1 && done > 0 ? `${done} of ${steps}` : "—"}
              </span>
              {showMoney && <span className="wfd-pay">{money(l.total)}</span>}
            </button>
          );
        })}
      </div>

      {open && (
        <LinePopup
          line={doc.lines.find((l) => l.key === open.key) || open}
          checkedInToday={!!doc.checkedInToday}
          busy={busy}
          onClose={() => setOpen(null)}
          onMark={(v) => mark(open, v)}
          onPhoto={(slot, file) => addPhoto(open, slot, file)}
        />
      )}
    </div>
  );
}

// Requirement 17 — a centered popup, one decision. Incomplete is the default, so nothing is marked
// done by a stray tap. Needs attention asks for a note or a photo before it will save (18); a key line
// asks for before AND after before it will go Complete (19).
function LinePopup({ line, checkedInToday, busy, onClose, onMark, onPhoto }) {
  const steps = lineSteps(line.kind);
  const [status, setStatus] = useState(line.state?.status || LINE_STATUS.INCOMPLETE);
  const [pickStep, setPickStep] = useState(Math.min(+line.state?.steps_done || 0, steps.length));
  const [note, setNote] = useState("");
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const photos = line.photos || [];
  const shot = (slot) => photos.find((p) => p.slot === slot);
  // The SAME gate the server runs, so a disabled button and a refused save always agree.
  const gate = lineStatusGate({ status, checkedInToday, line, photos, note });

  // Portalled to <body> for the same reason as the signature sheet: inside the project page's overlay
  // this is a nested stacking context below the floating assistant dock, which would cover Save.
  const pop = (
    <div className="wfd-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wfd-pop" role="dialog" aria-modal="true" aria-label={line.name}>
        <div className="wfd-ph">
          <b>{line.name}</b>
          <button type="button" className="wfd-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="wfd-choices">
          {[LINE_STATUS.COMPLETE, LINE_STATUS.ATTENTION, LINE_STATUS.INCOMPLETE].map((s) => (
            <button key={s} type="button" className={`wfd-choice ${s}${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* Decision A — how far did you get? Only where the line has a real path, and only when it
            isn't being called Complete (Complete fills the path by definition). */}
        {status !== LINE_STATUS.COMPLETE && steps.length > 1 && (
          <div className="wfd-steps">
            {steps.map((label, i) => (
              <button key={label} type="button" className={`wfd-step${pickStep > i ? " on" : ""}`} onClick={() => setPickStep(pickStep === i + 1 ? i : i + 1)}>
                <span className="wfd-step-n">{i + 1}</span>{label}
              </button>
            ))}
          </div>
        )}

        {/* Requirement 19 — before and after, on the lines where a photo is the only proof. */}
        {line.needsPhotos && (
          <div className="wfd-shots">
            {["before", "after"].map((slot) => (
              <div key={slot} className={`wfd-shot${shot(slot) ? " has" : ""}`}>
                <span className="wfd-shot-lbl">{slot === "before" ? "Before" : "After"}</span>
                {shot(slot)
                  ? <img src={shot(slot).url} alt={`${slot} photo`} />
                  : <button type="button" className="wfd-shot-add" disabled={busy} onClick={() => (slot === "before" ? beforeRef : afterRef).current?.click()}><Ic d={CAM_D} s={20} /></button>}
                <input ref={slot === "before" ? beforeRef : afterRef} type="file" accept="image/*" capture="environment" hidden
                       onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPhoto(slot, f); }} />
              </div>
            ))}
          </div>
        )}

        {/* Requirement 18 — a flag needs evidence. Dictation, because a tech is holding a drill. */}
        {status === LINE_STATUS.ATTENTION && (
          <div className="wfd-note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong?" />
            <MicButton value={note} onChange={setNote} title="Dictate" />
          </div>
        )}

        {gate && <div className="wfd-gate">{gate}</div>}
        <div className="wfd-pf">
          <button type="button" className="wfd-cancel" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="wfd-save" disabled={busy || !!gate} onClick={() => onMark({ status, pickStep, note })}>Save</button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? pop : createPortal(pop, document.body);
}
