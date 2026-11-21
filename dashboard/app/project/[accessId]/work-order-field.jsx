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
import { LINE_STATUS, lineStatusGate, lineSteps, lineDisplayName, lineProgressOf, PROGRESS_LABEL, statusForSteps, isFlagged } from "../../../lib/work-order-field";
import { checkInAction, setLineStatusAction, addLinePhotoAction, syncFieldQueueAction } from "./work-order-actions";
import { enqueue, readQueue, settle, online, opKeyOf } from "./work-order-queue";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Stage 3 item 5: "Incomplete" is now "Not started". The three buttons at the foot of the popup are
// In progress / Needs attention / Complete — attention being a FLAG, not a rival status.
const PHOTO_TAGS = [["before", "Before"], ["after", "After"], ["detail", "Detail"]];

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
  async function mark(line, { status, pickStep, note, attention }) {
    const op = { action: "status", lineKey: line.key, status, pickStep: pickStep ?? null, note: note || "", attention: !!attention, clientAt: new Date().toISOString() };
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
        {(() => {
          const visible = doc.lines.filter((l) => !l.parentKey || l.kind !== "labor");
          return visible.map((l) => {
          const st = l.state?.status || LINE_STATUS.INCOMPLETE;
          const steps = lineSteps(l.kind).length;
          const done = Math.min(+l.state?.steps_done || 0, steps);
          const prog = lineProgressOf(l.kind, { status: st, stepsDone: done });
          const flagged = isFlagged(l);
          return (
            <button key={l.key} type="button" className={`wfd-line ${st}${flagged ? " attention" : ""}`} onClick={() => setOpen(l)}>
              <span className={`wfd-dot ${flagged ? "attention" : st}`} aria-hidden="true" />
              {/* Item 8: eight lines called "JBL Speaker Upgrade" are indistinguishable without their
                  position (and location, where the line carries one). */}
              <span className="wfd-name">
                {lineDisplayName(l, visible)}
                {l.cpe && <span className="wfd-tag">CPE</span>}
                {flagged && <span className="wfd-tag flag">Flagged</span>}
              </span>
              <span className="wfd-state">
                {prog === "complete" ? "Complete" : steps > 1 && done > 0 ? `${done} of ${steps}` : PROGRESS_LABEL[prog]}
              </span>
              {showMoney && <span className="wfd-pay">{money(l.total)}</span>}
            </button>
          );
          });
        })()}
      </div>

      {open && (
        <LinePopup
          line={doc.lines.find((l) => l.key === open.key) || open}
          allLines={doc.lines.filter((l) => !l.parentKey || l.kind !== "labor")}
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

// Stage 3 of docs/customer-flow-v2.md rebuilt this. Top to bottom: the step path, one camera button,
// Notes, the status buttons, Save (item 1). The steps ARE the progress bar — tapping step N selects 1..N,
// tapping a lower one rewinds, tapping the only selected one clears it (item 2) — and the status follows
// from them: none is Not started, some is In progress, all is Complete (item 3). "Needs attention" is a
// separate flag that can sit at any level, Complete included, and still reaches the office (item 4).
function LinePopup({ line, allLines = [], checkedInToday, busy, onClose, onMark, onPhoto }) {
  const steps = lineSteps(line.kind);
  const stored = Math.min(+line.state?.steps_done || 0, steps.length);
  const [pickStep, setPickStep] = useState(line.state?.status === LINE_STATUS.COMPLETE ? steps.length : stored);
  const [attention, setAttention] = useState(isFlagged(line));
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(null);   // a captured file waiting to be tagged (item 6)
  const camRef = useRef(null);

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const photos = line.photos || [];
  // The status is DERIVED, never picked independently of the steps.
  const status = statusForSteps(line.kind, pickStep);
  const progress = lineProgressOf(line.kind, { status, stepsDone: pickStep });
  // The SAME gate the server runs, so a disabled button and a refused save always agree.
  const gate = lineStatusGate({ status, checkedInToday, line, photos, note, attention });

  // Tapping step N fills 1..N; tapping the one that is already the tip clears back past it.
  const tapStep = (i) => setPickStep(pickStep === i + 1 ? i : i + 1);
  // The buttons drive the same number the steps do, so the two can never disagree.
  const setProgress = (p) => {
    if (p === "complete") { setPickStep(pickStep === steps.length ? 0 : steps.length); return; }
    // In progress: one step if there is nothing yet, keep the count if there is, clear if it is the state.
    if (progress === "in_progress") { setPickStep(0); return; }
    setPickStep(steps.length > 1 ? Math.max(1, Math.min(steps.length - 1, pickStep || 1)) : 0);
  };

  const pop = (
    <div className="wfd-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wfd-pop" role="dialog" aria-modal="true" aria-label={lineDisplayName(line, allLines)}>
        <div className="wfd-ph">
          <b>{lineDisplayName(line, allLines)}</b>
          <button type="button" className="wfd-x" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {/* 1 — the step path, as a progress bar. */}
        {steps.length > 1 && (
          <div className="wfd-steps">
            {steps.map((label, i) => (
              <button key={label} type="button" className={`wfd-step${pickStep > i ? " on" : ""}`} onClick={() => tapStep(i)}>
                <span className="wfd-step-n">{i + 1}</span>{label}
              </button>
            ))}
          </div>
        )}

        {/* 2 — ONE camera button. The tag is chosen after the shot, and photos are optional. */}
        <div className="wfd-shots">
          {photos.map((ph, i) => (
            <figure className="wfd-thumb" key={ph.id || ph.url || i}>
              <img src={ph.url} alt={`${ph.slot || "photo"} photo`} />
              <figcaption>{(PHOTO_TAGS.find(([k]) => k === ph.slot) || [, ph.slot || "Photo"])[1]}</figcaption>
            </figure>
          ))}
          <button type="button" className="wfd-cam" disabled={busy} onClick={() => camRef.current?.click()}>
            <Ic d={CAM_D} s={22} /><span>Photo</span>
          </button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
                 onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPending(f); }} />
        </div>
        {pending && (
          <div className="wfd-tagger">
            <span>Tag this photo</span>
            <div className="wfd-tagrow">
              {PHOTO_TAGS.map(([slot, label]) => (
                <button key={slot} type="button" disabled={busy} onClick={() => { const f = pending; setPending(null); onPhoto(slot, f); }}>{label}</button>
              ))}
              <button type="button" className="wfd-tagx" disabled={busy} onClick={() => setPending(null)}>Discard</button>
            </div>
          </div>
        )}

        {/* 3 — Notes: full width, free text, always available (item 7). */}
        <div className="wfd-note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes" />
          <MicButton value={note} onChange={setNote} title="Dictate" />
        </div>

        {/* 4 — the status row. Full width, tap again to clear; the flag is independent of the rest. */}
        <div className="wfd-choices">
          <button type="button" className={`wfd-choice incomplete${progress === "in_progress" ? " on" : ""}`} onClick={() => setProgress("in_progress")}>In progress</button>
          <button type="button" className={`wfd-choice attention${attention ? " on" : ""}`} aria-pressed={attention} onClick={() => setAttention((v) => !v)}>Needs attention</button>
          <button type="button" className={`wfd-choice complete${progress === "complete" ? " on" : ""}`} onClick={() => setProgress("complete")}>Complete</button>
        </div>
        <div className="wfd-derived">{PROGRESS_LABEL[progress]}{attention ? " · flagged" : ""}</div>

        {gate && <div className="wfd-gate">{gate}</div>}
        <div className="wfd-pf">
          <button type="button" className="wfd-cancel" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="wfd-save" disabled={busy || !!gate} onClick={() => onMark({ status, pickStep, note, attention })}>Save</button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? pop : createPortal(pop, document.body);
}
