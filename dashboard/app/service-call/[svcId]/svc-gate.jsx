"use client";

import { useState, useEffect, useRef } from "react";
import { startPinCanvas } from "../../project/[accessId]/gateway-pin-canvas";

// Customer service-call PIN gate — the SAME animated starfield keypad the project gateway uses
// (gw2-* structural CSS is global; GW2_LIGHT_CSS below is the light-card override, copied from the
// project gate). The Service Call ID is already in the URL, so we only collect the PIN; a valid
// PIN mints the scoped cookie server-side and we reload into the tracker.
export default function SvcGate({ svcId }) {
  const [pin, setPin]             = useState("");
  const [dotState, setDotState]   = useState(""); // "" | "ok" | "err"
  const [attempts, setAttempts]   = useState(0);
  const [locked, setLocked]       = useState(false);
  const [busy, setBusy]           = useState(false);
  const [bannerMsg, setBannerMsg] = useState("");
  const [showHelp, setShowHelp]   = useState(false);
  const [cardWarp, setCardWarp]   = useState(false);
  const [granted, setGranted]     = useState(false);
  const [needsClear, setNeedsClear] = useState(false);
  const canvasRef = useRef(null);
  const canvasCtrl = useRef(null);
  const pinRef = useRef(""), needsClearRef = useRef(false), lockedRef = useRef(false), busyRef = useRef(false);

  function syncPin(v) { pinRef.current = v; setPin(v); }
  function syncLocked(v) { lockedRef.current = v; setLocked(v); }
  function syncBusy(v) { busyRef.current = v; setBusy(v); }
  function syncClear(v) { needsClearRef.current = v; setNeedsClear(v); }

  useEffect(() => {
    const ctrl = startPinCanvas(canvasRef.current);
    canvasCtrl.current = ctrl;
    return ctrl.cleanup;
  }, []);

  function addDigit(d) {
    if (lockedRef.current || busyRef.current) return;
    let base = pinRef.current;
    if (needsClearRef.current) { syncClear(false); setDotState(""); setBannerMsg(""); base = ""; syncPin(""); }
    if (base.length >= 4) return;
    const next = base + d;
    syncPin(next);
    if (next.length === 4) setTimeout(() => doSubmit(next), 0);
  }
  function delDigit() {
    if (lockedRef.current || busyRef.current) return;
    syncPin(pinRef.current.slice(0, -1));
  }

  async function doSubmit(code) {
    syncBusy(true);
    let ok = false;
    try {
      const res = await fetch("/api/svc-pin-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svcId, pin: code }),
      });
      const j = await res.json();
      ok = !!j.ok;
    } catch (_) { ok = false; }

    if (ok) {
      setDotState("ok"); syncBusy(false);
      setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 240);
      setTimeout(() => setGranted(true), 1550);
      setTimeout(() => window.location.reload(), 2400);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setDotState("err");
      const left = 3 - next;
      if (left <= 0) {
        setBannerMsg("Locked — contact support");
        syncLocked(true);
        setTimeout(() => setShowHelp(true), 550);
      } else {
        setBannerMsg(left + (left === 1 ? " attempt" : " attempts") + " left");
        setTimeout(() => { syncClear(true); syncBusy(false); }, 2600);
      }
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); delDigit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const displayPin = needsClear ? "" : pin;

  return (
    <div className="gw2-root gw2-light">
      <style>{GW2_LIGHT_CSS}</style>
      <div className="gw2-aura" />
      <div className="gw2-grid" />
      <canvas ref={canvasRef} className="gw2-net" />

      {granted && (
        <div className="gw2-granted">
          <div className="gw2-gck">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
          </div>
          <h2>ACCESS GRANTED</h2>
          <p>Opening your service call</p>
        </div>
      )}

      <div className={`gw2-card${cardWarp ? " gw2-warp" : ""}${dotState === "ok" ? " gw2-unlocked" : ""}`}>
        <div className="gw2-ring" />
        <div className="gw2-brand">
          <div className="gw2-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" /><circle cx="12" cy="15.5" r="1.4" />
            </svg>
          </div>
          <h1>IOT&nbsp;TECHS</h1>
          <div className="gw2-subtag">Service Call · {svcId}</div>
        </div>

        <div className={`gw2-prompt${dotState === "ok" ? " ok" : dotState === "err" ? " err" : ""}`}>
          {dotState === "ok" ? "Access granted" : dotState === "err" ? "Incorrect PIN" : "Enter your PIN"}
        </div>
        {bannerMsg && <div className="gw2-banner">{bannerMsg}</div>}
        <div className="gw2-dots">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`gw2-dot${displayPin.length > i ? " fill" : ""}${displayPin.length > i && dotState ? " " + dotState : ""}`} />
          ))}
        </div>
        <div className={`gw2-keys${locked ? " gw2-locked" : ""}`}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="gw2-key" onClick={() => addDigit(String(n))} disabled={locked || busy}>{n}</button>
          ))}
          <span className="gw2-key" style={{ visibility: "hidden" }} aria-hidden />
          <button className="gw2-key" onClick={() => addDigit("0")} disabled={locked || busy}>0</button>
          <button className="gw2-key gw2-del" onClick={delDigit} disabled={locked || busy}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 5H9.2a2 2 0 0 0-1.5.7l-4.4 5.6a1.1 1.1 0 0 0 0 1.4l4.4 5.6a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" /><path d="M17 9.5l-5 5M12 9.5l5 5" />
            </svg>
          </button>
        </div>

        <div className="gw2-actions">
          <a className="gw2-lbtn" href="/report-issue">Report a new issue</a>
          <button className="gw2-lbtn gw2-help-btn" onClick={() => setShowHelp(true)}>Need help?</button>
        </div>
      </div>

      {showHelp && (
        <div className="gw2-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHelp(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd">
              <span>Need help?</span>
              <button className="gw2-mclose" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="gw2-mbd">
              <p>Your PIN is the <strong>last 4 digits of your phone number</strong>. Still stuck? Reach our team and mention <strong>{svcId}</strong>.</p>
              <a className="gw2-hrow" href="sms:+16463960775">
                <div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg></div>
                <div><div className="gw2-hk">Text us</div><div className="gw2-hv">646-396-0775</div></div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const GW2_LIGHT_CSS = `
.gw2-light .gw2-card{background:#fff;border:1px solid rgba(14,19,32,.06);border-radius:22px;
  box-shadow:0 44px 90px -26px rgba(0,0,0,.72),0 2px 8px rgba(0,0,0,.18);
  backdrop-filter:none;-webkit-backdrop-filter:none;}
.gw2-light .gw2-ring{border-radius:22px;}
.gw2-light .gw2-brand h1{color:#0e1320;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;letter-spacing:2px;}
.gw2-light .gw2-subtag{color:#b08f4f;}
.gw2-light .gw2-mark{background:linear-gradient(145deg,#2C3347,#0e1320);border:1px solid rgba(201,169,110,.28);
  box-shadow:0 8px 20px rgba(14,19,32,.18);}
.gw2-light .gw2-prompt{color:#6b7280;}
.gw2-light .gw2-prompt.ok{color:#1c8a45;}
.gw2-light .gw2-prompt.err{color:#c0392b;}
.gw2-light .gw2-dot{border-color:rgba(176,143,79,.45);}
.gw2-light .gw2-dot.fill{background:#C9A96E;border-color:#C9A96E;box-shadow:0 0 12px rgba(201,169,110,.5);}
.gw2-light .gw2-dot.fill.ok{background:#1c8a45;border-color:#1c8a45;box-shadow:0 0 14px rgba(28,138,69,.5);}
.gw2-light .gw2-dot.fill.err{background:#c0392b;border-color:#c0392b;box-shadow:0 0 12px rgba(192,57,43,.5);}
.gw2-light .gw2-key{background:#f4f5f7;border:1px solid #e6e8ee;color:#0e1320;
  box-shadow:0 1px 2px rgba(14,19,32,.05);}
.gw2-light .gw2-key:hover:not(:disabled){border-color:rgba(201,169,110,.55);background:#faf4e8;}
.gw2-light .gw2-del{color:#b08f4f;}
.gw2-light .gw2-banner{background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.32);color:#c0392b;}
.gw2-light .gw2-lbtn{background:#f4f5f7;border:1px solid #e6e8ee;color:#2C3347;text-decoration:none;}
.gw2-light .gw2-lbtn:hover{border-color:rgba(201,169,110,.55);background:#faf4e8;}
.gw2-light .gw2-help-btn{color:#b08f4f;}
`;
