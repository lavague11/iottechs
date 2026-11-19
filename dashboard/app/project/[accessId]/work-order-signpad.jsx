"use client";

// The one signature sheet a work order uses — the technician accepting the job, and the customer
// signing the finished work off. Same pad, same agreement pattern, so the two signatures on a work
// order look and behave alike.
//
// `requirePin` is the technician half (owner's rule, 2026-11-19): they re-enter their OWN PIN before
// the mark is taken. The PIN is handed straight to the action, checked against that account, and
// never stored — not here, not in the row, not in the log.
import { useState, useEffect, useRef } from "react";

export default function SignPad({
  heading, subheading = null, agree, defaultName = "", requirePin = false, busy = false, onCancel, onConfirm,
}) {
  const [name, setName] = useState(defaultName || "");
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(null);
  const padRef = useRef(null);
  const drawn = useRef(false);

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onCancel?.(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onCancel]);

  // Pointer events, so a finger, a stylus and a mouse all draw. The canvas is sized to its box at the
  // device pixel ratio, or the mark comes out soft on a phone.
  useEffect(() => {
    const c = padRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#101418";
    let down = false;
    const at = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const start = (e) => { down = true; drawn.current = true; c.setPointerCapture?.(e.pointerId); ctx.beginPath(); ctx.moveTo(...at(e)); };
    const move = (e) => { if (!down) return; e.preventDefault(); ctx.lineTo(...at(e)); ctx.stroke(); };
    const end = () => { down = false; };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", end); c.addEventListener("pointerleave", end);
    return () => { c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointerleave", end); };
  }, []);
  const clear = () => { const c = padRef.current; if (!c) return; c.getContext("2d").clearRect(0, 0, c.width, c.height); drawn.current = false; };

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Enter your name.");
    if (requirePin && !/^\d{4}$/.test(pin)) return setErr("Enter your 4-digit PIN.");
    if (!ok) return setErr("Tick the box to confirm.");
    onConfirm({ name: name.trim(), ...(requirePin ? { pin } : null), signatureData: drawn.current ? padRef.current.toDataURL("image/png") : null });
  }

  return (
    <div className="wof-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="wof-modal sign" role="dialog" aria-modal="true" aria-label={heading}>
        <div className="wof-mh">
          <span>{heading}</span>
          {subheading && <span className="wof-sub">{subheading}</span>}
          <button type="button" className="wof-x" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <div className="wof-mb">
          <label className="wof-f"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          {requirePin && (
            <label className="wof-f">
              <span>Your PIN</span>
              <input value={pin} type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••"
                     onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
          )}
          <div className="wof-pad">
            <canvas ref={padRef} aria-label="Signature pad" />
            <button type="button" className="wof-clear" onClick={clear} title="Clear" aria-label="Clear">Clear</button>
          </div>
          <label className="wof-agree">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>{agree}</span>
          </label>
          {err && <div className="wof-err">{err}</div>}
        </div>
        <div className="wof-mf">
          <button type="button" className="wof-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="wof-cta sign" disabled={busy} onClick={submit}>{busy ? "Signing…" : "Sign"}</button>
        </div>
      </div>
    </div>
  );
}
