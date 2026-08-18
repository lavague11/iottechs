"use client";

import { useState, useEffect, useRef } from "react";
import { startPinCanvas } from "../project/[accessId]/gateway-pin-canvas";
import FaceScan from "./face-scan";

// Shared secure-access gateway: animated starfield keypad + Face ID + network diagnostics.
// Used by the project gate (gateway-client) and the ADT account gate. attemptAccess({pinValue|
// emailOrPhone,password|loginRole}) resolves auth server-side; onAuthenticated(view) fires on grant.
function speedStatus(mbps) {
  const n = parseFloat(mbps);
  if (isNaN(n)) return null;
  if (n < 20)  return { label: "Slow",      color: "#7E8699" };
  if (n < 60)  return { label: "Moderate",  color: "#E09A3A" };
  if (n < 100) return { label: "Good",      color: "#C9A96E" };
  if (n < 200) return { label: "Great",     color: "#5DB87A" };
  return              { label: "Excellent", color: "#5BC4D8" };
}

// ---- Email / phone + password login form (inside gateway) ----
function LoginForm({ busy, onSubmit }) {
  const [cred, setCred]   = useState("");
  const [pass, setPass]   = useState("");
  const [err,  setErr]    = useState(null);
  const [sub,  setSub]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cred.trim() || !pass) return;
    setErr(null); setSub(true);
    const res = await onSubmit(cred.trim(), pass);
    setSub(false);
    if (!res.ok) setErr(res.error || "Invalid credentials.");
  }

  return (
    <form className="gw2-lf" onSubmit={handleSubmit}>
      <div className="gw2-prompt">Sign in</div>
      <div className="gw2-lf-fields">
        <input
          className="gw2-lf-input"
          type="text"
          autoComplete="username"
          value={cred}
          onChange={(e) => setCred(e.target.value)}
          disabled={busy || sub}
        />
        <input
          className="gw2-lf-input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          disabled={busy || sub}
        />
      </div>
      {err && <div className="gw2-lf-err">{err}</div>}
      <button className="gw2-lf-btn" type="submit" disabled={busy || sub || !cred.trim() || !pass}>
        {sub ? "Signing in…" : "Sign In →"}
      </button>
    </form>
  );
}

// Light-card override for the PIN gate — matches the home-page login modal (white card, gold
// accents, Bricolage heading, light-gray keypad) while keeping the animated dark starfield behind
// it. Scoped to .gw2-light so the staff /login screen (its own inline gw2 styles) stays dark.
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
.gw2-light .gw2-loc{color:#b08f4f;}
.gw2-light .gw2-loc:hover{border-color:rgba(201,169,110,.55) !important;background:#faf4e8 !important;box-shadow:none !important;}
.gw2-light .gw2-banner{background:rgba(224,90,90,.08);border:1px solid rgba(224,90,90,.32);color:#c0392b;}
.gw2-light .gw2-lbtn{background:#f4f5f7;border:1px solid #e6e8ee;color:#2C3347;}
.gw2-light .gw2-lbtn:hover{border-color:rgba(201,169,110,.55);background:#faf4e8;}
.gw2-light .gw2-help-btn{color:#b08f4f;}
.gw2-light .gw2-lf-input{background:#f4f5f7;border:1px solid #e6e8ee;color:#0e1320;}
.gw2-light .gw2-lf-input::placeholder{color:#9aa0ab;}
.gw2-light .gw2-lf-input:focus{border-color:#C9A96E;}
.gw2-light .gw2-lf-btn{background:#C9A96E;color:#0e1320;}
.gw2-light .gw2-lf-btn:hover:not(:disabled){background:#b08f4f;color:#fff;}
.gw2-light .gw2-face{display:flex;flex-direction:column;align-items:center;gap:12px;}
.gw2-light .gw2-face-stage{position:relative;width:172px;height:172px;display:grid;place-items:center;margin:2px 0;}
/* Camera runs here for the match, but stays invisible — the person sees only the animation. */
.gw2-light .gw2-face-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;}
.gw2-light .gw2-face-btn{width:100%;margin-top:2px;}
`;

// ---- PIN gateway screen (light card on the animated starfield) ----
export function GatewayScreen({ onAuthenticated, attemptAccess }) {
  const [pin, setPin]             = useState("");
  const [dotState, setDotState]   = useState(""); // "" | "ok" | "err"
  const [attempts, setAttempts]   = useState(0);
  const [locked, setLocked]       = useState(false);
  const [busy, setBusy]           = useState(false);
  const [bannerMsg, setBannerMsg] = useState("");
  const [mode, setMode]           = useState("pin");
  const [faceState, setFaceState] = useState("idle");  // idle | scanning | ok | fail
  const [faceMsg,   setFaceMsg]   = useState("");
  const [showHelp, setShowHelp]   = useState(false);
  const [showLoc,     setShowLoc]     = useState(false);
  const [speedTesting, setSpeedTesting] = useState(false);
  const [locData,  setLocData]    = useState({ city: "—", state: "—", lat: null, lng: null, ip: "—", provider: "—", speed: null, device: null });
  const speedRunId = useRef(0);
  const [cardWarp, setCardWarp]   = useState(false);
  const [granted, setGranted]     = useState(false);
  const [needsClear, setNeedsClear] = useState(false);
  const canvasRef    = useRef(null);
  const canvasCtrl   = useRef(null);
  // use refs so rapid taps read current value without waiting for re-render
  const pinRef       = useRef("");
  const needsClearRef = useRef(false);
  const lockedRef    = useRef(false);
  const busyRef      = useRef(false);
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);

  function syncPin(v)    { pinRef.current = v;        setPin(v); }
  function syncLocked(v) { lockedRef.current = v;     setLocked(v); }
  function syncBusy(v)   { busyRef.current = v;       setBusy(v); }
  function syncClear(v)  { needsClearRef.current = v; setNeedsClear(v); }

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
    const next = pinRef.current.slice(0, -1);
    syncPin(next);
  }

  async function doSubmit(code) {
    syncBusy(true);
    const res = await attemptAccess({ pinValue: code });
    if (res.ok) {
      setDotState("ok");
      syncBusy(false);
      setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 240);
      setTimeout(() => setGranted(true), 1550);
      setTimeout(() => onAuthenticated(res.view), 2400);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setDotState("err");
      const left = 3 - next;
      if (left <= 0) {
        setBannerMsg("Account locked — contact support");
        syncLocked(true);
        setTimeout(() => setShowHelp(true), 550);
      } else {
        setBannerMsg(left + (left === 1 ? " attempt" : " attempts") + " left");
        setTimeout(() => { syncClear(true); syncBusy(false); }, 3000);
      }
    }
  }

  // Background prefetch on mount — data ready before modal opens
  useEffect(() => {
    let cancelled = false;

    // Detect device type synchronously
    const ua = navigator.userAgent;
    const isTablet = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isMobile = !isTablet && /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    setLocData((prev) => ({ ...prev, device: isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop" }));

    // Fetch IP/location — ipinfo.io first, ipapi.co as fallback
    async function fetchIp() {
      const apis = [
        { url: "https://ipinfo.io/json", parse: (d) => ({
          city: d.city || "—", state: d.region || "—",
          lat: d.loc ? parseFloat(d.loc.split(",")[0]) : null,
          lng: d.loc ? parseFloat(d.loc.split(",")[1]) : null,
          ip: d.ip || "—", provider: d.org || "—",
        })},
        { url: "https://ipapi.co/json/", parse: (d) => ({
          city: d.city || "—", state: d.region_code || "—",
          lat: d.latitude || null, lng: d.longitude || null,
          ip: d.ip || "—", provider: d.org || "—",
        })},
      ];
      for (const api of apis) {
        try {
          const r = await fetch(api.url, { cache: "no-store" });
          if (!r.ok) continue;
          const d = await r.json();
          const parsed = api.parse(d);
          if (!cancelled && (parsed.ip !== "—" || parsed.city !== "—")) {
            setLocData((prev) => ({ ...prev, ...parsed }));
            return;
          }
        } catch {}
      }
    }
    fetchIp();

    runSpeedTest();
    return () => { cancelled = true; speedRunId.current++; };
  }, []);

  async function runSpeedTest() {
    const runId = ++speedRunId.current;
    const gone  = () => speedRunId.current !== runId;
    setSpeedTesting(true);
    setLocData((prev) => ({ ...prev, speed: null }));

    async function measurePhase(parallel, size) {
      const t0 = performance.now();
      const bytes = await Promise.all(
        Array.from({ length: parallel }, () =>
          fetch(`https://speed.cloudflare.com/__down?bytes=${size}`, { cache: "no-store" })
            .then((r) => r.arrayBuffer()).then((b) => b.byteLength).catch(() => 0)
        )
      );
      const total = bytes.reduce((a, b) => a + b, 0);
      const secs  = (performance.now() - t0) / 1000;
      return total > 0 ? (total * 8) / 1e6 / secs : null;
    }

    try { await fetch("https://speed.cloudflare.com/__down?bytes=200000", { cache: "no-store" }); } catch {}
    if (gone()) return;
    const p1 = await measurePhase(4, 1000000);
    if (!gone() && p1) setLocData((prev) => ({ ...prev, speed: p1.toFixed(1) }));
    if (gone()) return;
    const p2 = await measurePhase(4, 3000000);
    if (!gone()) {
      if (p2) setLocData((prev) => ({ ...prev, speed: (p1 ? (p1 + p2) / 2 : p2).toFixed(1) }));
      setSpeedTesting(false);
    }
  }

  function openLoc() { setShowLoc(true); }

  async function loginAs(role) {
    setBusy(true);
    const res = await attemptAccess({ loginRole: role });
    setBusy(false);
    if (res.ok) { setGranted(true); setTimeout(() => onAuthenticated(res.view), 700); }
  }

  // Warm the face engine when the user opens Face ID — models download while
  // they read the prompt, so the scan itself is fast (not blocked on a download).
  function warmFace() {
    if (window.IOTFace) { window.IOTFace.ready?.().catch(() => {}); return; }
    if (!document.getElementById("iot-face-js")) {
      const s = document.createElement("script");
      s.id = "iot-face-js"; s.src = "/face-engine.js"; s.async = true;
      s.onload = () => window.IOTFace?.ready?.().catch(() => {});
      document.head.appendChild(s);
    }
  }
  function stopFaceCam() {
    if (faceStreamRef.current) { faceStreamRef.current.getTracks().forEach((t) => t.stop()); faceStreamRef.current = null; }
  }
  // Drop the camera whenever we leave face mode (or unmount).
  useEffect(() => { if (mode !== "face") stopFaceCam(); return stopFaceCam; }, [mode]);
  // Opening Face ID starts the scan immediately — no extra tap.
  useEffect(() => { if (mode === "face" && faceState === "idle") { const t = setTimeout(runFaceScan, 300); return () => clearTimeout(t); } }, [mode]); // eslint-disable-line

  // Face-first login: capture a live frame behind the animation, embed it, and
  // 1:N match server-side. On a clean match the server mints the session and we
  // land on the user's home. Camera stays hidden (the person sees the animation).
  async function runFaceScan() {
    if (faceState === "scanning") return;
    setFaceMsg(""); setFaceState("scanning");
    let stream = null;
    try {
      if (!window.IOTFace) { warmFace(); await new Promise((r) => setTimeout(r, 400)); }
      await window.IOTFace?.ready?.();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      faceStreamRef.current = stream;
      const v = faceVideoRef.current;
      v.srcObject = stream; await v.play().catch(() => {});
      // Liveness — a natural head turn + real eye micro-motion (stops photos, IDs, still screens).
      const live = await window.IOTFace.scanLive(v, { onCue: (t) => setFaceMsg(t) });
      stopFaceCam();
      if (!live.ok) {
        setFaceState("fail");
        setFaceMsg("Couldn't confirm a live person — face the camera in good light and retry.");
        return;
      }
      const emb = live.embedding;
      const res = await fetch("/api/face-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding: emb }) });
      const j = await res.json();
      if (j.ok) {
        setFaceState("ok"); setFaceMsg("Welcome, " + j.name);
        // Finish the green Face-ID success animation, THEN warp + access-granted.
        setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 1000);
        setTimeout(() => setGranted(true), 2100);
        setTimeout(() => window.location.assign(j.home || "/dashboard"), 2650);
      }
      else { setFaceState("fail"); setFaceMsg(j.error || "Not recognized. Use your PIN."); }
    } catch (e) {
      stopFaceCam();
      const secure = location.protocol === "https:" || location.hostname === "localhost";
      setFaceState("fail");
      setFaceMsg(secure ? "Camera unavailable — allow access, or use your PIN." : "Face ID needs a secure (HTTPS) connection.");
    }
  }

  async function loginWithCredentials(emailOrPhone, password) {
    setBusy(true);
    const res = await attemptAccess({ emailOrPhone, password });
    setBusy(false);
    if (res.ok) {
      setDotState("ok");
      setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 240);
      setTimeout(() => setGranted(true), 1550);
      setTimeout(() => onAuthenticated(res.view), 2400);
    }
    return res;
  }

  // keyboard support
  useEffect(() => {
    function onKey(e) {
      if (mode !== "pin" || showHelp || locked || busy) return;
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
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.2 4.2L19 7"/>
            </svg>
          </div>
          <h2>ACCESS GRANTED</h2>
          <p>Welcome back</p>
        </div>
      )}

      <div className={`gw2-card${cardWarp ? " gw2-warp" : ""}${dotState === "ok" ? " gw2-unlocked" : ""}`}>
        <div className="gw2-ring" />
        <div className="gw2-brand">
          <div className="gw2-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"/><circle cx="12" cy="15.5" r="1.4"/>
            </svg>
          </div>
          <h1>IOT&nbsp;TECHS</h1>
          <div className="gw2-subtag">Secure Access</div>
        </div>

        {mode === "pin" ? (
          <>
            <div className={`gw2-prompt${dotState === "ok" ? " ok" : dotState === "err" ? " err" : ""}`}>
              {dotState === "ok" ? "Access granted" : dotState === "err" ? "Incorrect PIN" : "Enter your PIN"}
            </div>
            {bannerMsg && <div className="gw2-banner">{bannerMsg}</div>}
            <div className="gw2-dots">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`gw2-dot${displayPin.length > i ? " fill" : ""}${displayPin.length > i && dotState ? " " + dotState : ""}`} />
              ))}
            </div>
            <div className={`gw2-keys${locked ? " gw2-locked" : ""}`}>
              {[1,2,3,4,5,6,7,8,9].map((n) => (
                <button key={n} className="gw2-key" onClick={() => addDigit(String(n))} disabled={locked || busy}>{n}</button>
              ))}
              <button className="gw2-key gw2-loc" onClick={openLoc} aria-label="Network diagnostics">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity="0.5"/>
                </svg>
              </button>
              <button className="gw2-key" onClick={() => addDigit("0")} disabled={locked || busy}>0</button>
              <button className="gw2-key gw2-del" onClick={delDigit} disabled={locked || busy}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 5H9.2a2 2 0 0 0-1.5.7l-4.4 5.6a1.1 1.1 0 0 0 0 1.4l4.4 5.6a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/>
                </svg>
              </button>
            </div>
          </>
        ) : mode === "face" ? (
          <div className="gw2-face">
            <div className={`gw2-prompt${faceState === "ok" ? " ok" : faceState === "fail" ? " err" : ""}`}>
              {faceState === "scanning" ? "Scanning…" : faceState === "ok" ? "Recognized" : "Look at the camera"}
            </div>
            {faceMsg && <div className="gw2-banner">{faceMsg}</div>}
            <div className="gw2-face-stage">
              <video ref={faceVideoRef} className="gw2-face-vid" playsInline muted />
              <FaceScan state={faceState} size={172} />
            </div>
            <button className="gw2-lf-btn gw2-face-btn" onClick={runFaceScan} disabled={busy || faceState === "scanning"}>
              {faceState === "scanning" ? "Scanning…" : "Scan my face"}
            </button>
          </div>
        ) : (
          <LoginForm busy={busy} onSubmit={loginWithCredentials} />
        )}

        <div className="gw2-actions">
          {mode === "pin" && (
            <button className="gw2-lbtn" onClick={() => { setMode("face"); setFaceState("idle"); setFaceMsg(""); warmFace(); }}>Face ID</button>
          )}
          <button className="gw2-lbtn" onClick={() => setMode(mode === "pin" ? "login" : "pin")}>
            {mode === "pin" ? "Log in instead" : "← Use PIN"}
          </button>
          <button className="gw2-lbtn gw2-help-btn" onClick={() => setShowHelp(true)}>Need help?</button>
        </div>
      </div>

      {showLoc && (
        <div className="gw2-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLoc(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd">
              <span>NETWORK DIAGNOSTICS</span>
              <button className="gw2-mclose" onClick={() => setShowLoc(false)}>✕</button>
            </div>
            <div className="gw2-mbd gw2-loc-bd">
              <div className="gw2-lrow">
                <div className="gw2-lk">Location</div>
                <div className="gw2-lv">
                  <div className="gw2-lv-main">{locData.city !== "—" ? `${locData.city}, ${locData.state}` : <span className="gw2-lskel" style={{width:120}} />}</div>
                  {locData.lat && <div className="gw2-lv-sub">{locData.lat.toFixed(4)}, {locData.lng.toFixed(4)}</div>}
                </div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">Network Provider</div>
                <div className="gw2-lv"><div className="gw2-lv-main">{locData.provider !== "—" ? locData.provider : <span className="gw2-lskel" style={{width:140}} />}</div></div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">Speed</div>
                <div className="gw2-lv">
                  <div className="gw2-speed-row">
                    {locData.speed !== null && (() => { const s = speedStatus(locData.speed); return s ? <span className="gw2-speed-badge" style={{color: s.color, borderColor: s.color + "55"}}>{s.label}</span> : null; })()}
                    <div className="gw2-lv-main">{locData.speed === null ? <span className="gw2-lskel" style={{width:70}} /> : `${locData.speed} Mbps`}</div>
                    <button className="gw2-speed-reload" onClick={runSpeedTest} disabled={speedTesting} title="Re-test speed">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={speedTesting ? {animation:"gw2SpinIcon 0.9s linear infinite"} : {}}>
                        <path d="M20 8A8.5 8.5 0 1 0 20.8 15"/><path d="M20 2v6h-6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="gw2-lrow">
                <div className="gw2-lk">IP Address</div>
                <div className="gw2-lv"><div className="gw2-lv-main mono">{locData.ip !== "—" ? locData.ip.split(".").map((p,i) => i < 2 ? p : "***").join(".") : <span className="gw2-lskel" style={{width:90}} />}</div></div>
              </div>
              <div className="gw2-lrow last">
                <div className="gw2-lk">Device Type</div>
                <div className="gw2-lv"><div className="gw2-lv-main">{locData.device || <span className="gw2-lskel" style={{width:70}} />}</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="gw2-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowHelp(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd">
              <span>Need help signing in?</span>
              <button className="gw2-mclose" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="gw2-mbd">
              <p>Your PIN is the <strong>last 4 digits of your phone number</strong>. Still stuck? Reach our team and we&apos;ll get you back in fast.</p>
              <a className="gw2-hrow" href="mailto:support@iot-techs.com?subject=Login%20help%20-%20IOT%20TECHS">
                <div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></div>
                <div><div className="gw2-hk">Email support</div><div className="gw2-hv">support@iot-techs.com</div></div>
              </a>
              <a className="gw2-hrow" href="sms:+16463960775">
                <div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg></div>
                <div><div className="gw2-hk">Text us</div><div className="gw2-hv">646-396-0775</div></div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
