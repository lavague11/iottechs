"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { loginAction, signupAction, start2faAction, verify2faAction, resend2faAction } from "./actions";
import { startPinCanvas } from "../project/[accessId]/gateway-pin-canvas";

// Password field with a show/hide eye toggle on the right. Passes every input prop straight through,
// so it drops in for both the uncontrolled login field and the controlled sign-up fields.
function PwInput({ className = "lg-input", ...props }) {
  const [show, setShow] = useState(false);
  return (
    <span className="lg-pw">
      <input {...props} type={show ? "text" : "password"} className={className} />
      <button type="button" className="lg-pw-eye" tabIndex={-1} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>
        {show
          ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </span>
  );
}
import FaceScan from "../components/face-scan";
import { GW2_LIGHT_CSS } from "../components/gateway-screen";
import { Wordmark, BrandLink } from "../components/brand";

function speedStatus(mbps) {
  const n = parseFloat(mbps);
  if (isNaN(n)) return null;
  if (n >= 50)  return { label: "Fast",   color: "#5DB87A" };
  if (n >= 10)  return { label: "Good",   color: "#C9A96E" };
  if (n >= 2)   return { label: "Slow",   color: "#E09A3A" };
  return { label: "Poor", color: "#E05A5A" };
}

// Signup input helpers — capitalize each name word, live-format the phone, and validate email/password.
const suTitle = (s) => String(s || "").replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const suPhone = (s) => { const d = String(s || "").replace(/\D/g, "").slice(0, 10); if (!d) return ""; if (d.length <= 3) return d; if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`; return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pwStrong = (p) => String(p || "").length >= 6 && /[A-Z]/.test(p);

export default function LoginClient({ next }) {
  const [error, setError]         = useState(null);
  const [pending, startTransition] = useTransition();
  const [cardWarp, setCardWarp]   = useState(false);
  const [granted, setGranted]     = useState(false);
  const [showHelp, setShowHelp]   = useState(false);
  const [showLoc,  setShowLoc]    = useState(false);
  const [speedTesting, setSpeedTesting] = useState(false);
  const [locData, setLocData]     = useState({ city:"—", state:"—", lat:null, lng:null, ip:"—", provider:"—", speed:null, device:null });
  const speedRunId = useRef(0);
  const canvasRef  = useRef(null);
  const canvasCtrl = useRef(null);
  const [mode, setMode]           = useState("password"); // password | phone | face | pin | signup — default is the white Sign-In card
  const [faceState, setFaceState] = useState("idle");
  const [faceMsg, setFaceMsg]     = useState("");
  const [pinId, setPinId]         = useState("");
  const [pinErr, setPinErr]       = useState("");
  // phone + SMS 2FA (the default): enter the number → text a code → verify
  const [phone, setPhone]         = useState("");
  const [phStep, setPhStep]       = useState("enter");   // enter | code
  const [code, setCode]           = useState("");
  const [masked, setMasked]       = useState("");
  const [noAccount, setNoAccount] = useState(false);
  const [su, setSu]               = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const suSet = (k, v) => setSu((p) => ({ ...p, [k]: v }));
  const faceVideoRef  = useRef(null);
  const faceStreamRef = useRef(null);

  useEffect(() => {
    const ctrl = startPinCanvas(canvasRef.current);
    canvasCtrl.current = ctrl;
    return ctrl.cleanup;
  }, []);

  // Surface a Google sign-in error passed back in ?err= (then clean it out of the URL).
  useEffect(() => {
    try {
      const err = new URLSearchParams(window.location.search).get("err");
      const MSG = {
        google_off: "Google sign-in isn’t turned on yet.",
        google_denied: "Google sign-in was cancelled.",
        google_state: "That sign-in expired — please try again.",
        google_email: "Your Google email isn’t verified.",
        disabled: "That account is disabled — contact an admin.",
        google: "Google sign-in failed — please try again.",
      };
      if (err && MSG[err]) {
        setMode("password"); setError(MSG[err]);
        const u = new URL(window.location.href); u.searchParams.delete("err"); window.history.replaceState({}, "", u);
      }
    } catch {}
  }, []);

  // prefetch location + speed
  useEffect(() => {
    let cancelled = false;
    const ua = navigator.userAgent;
    const isTablet = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const isMobile = !isTablet && /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    setLocData(p => ({ ...p, device: isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop" }));
    async function fetchIp() {
      const apis = [
        { url:"https://ipinfo.io/json",   parse:(d) => ({ city:d.city||"—", state:d.region||"—", lat:d.loc?parseFloat(d.loc.split(",")[0]):null, lng:d.loc?parseFloat(d.loc.split(",")[1]):null, ip:d.ip||"—", provider:d.org||"—" }) },
        { url:"https://ipapi.co/json/",   parse:(d) => ({ city:d.city||"—", state:d.region_code||"—", lat:d.latitude||null, lng:d.longitude||null, ip:d.ip||"—", provider:d.org||"—" }) },
      ];
      for (const api of apis) {
        try { const r = await fetch(api.url,{cache:"no-store"}); if(!r.ok) continue; const d=await r.json(); const p=api.parse(d); if(!cancelled&&(p.ip!=="—"||p.city!=="—")){setLocData(prev=>({...prev,...p}));return;} } catch {}
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
    setLocData(p => ({ ...p, speed:null }));
    async function measurePhase(parallel, size) {
      const t0 = performance.now();
      const bytes = await Promise.all(Array.from({length:parallel},()=>fetch(`https://speed.cloudflare.com/__down?bytes=${size}`,{cache:"no-store"}).then(r=>r.arrayBuffer()).then(b=>b.byteLength).catch(()=>0)));
      const total = bytes.reduce((a,b)=>a+b,0);
      const secs  = (performance.now()-t0)/1000;
      return total>0 ? (total*8)/1e6/secs : null;
    }
    try { await fetch("https://speed.cloudflare.com/__down?bytes=200000",{cache:"no-store"}); } catch {}
    if (gone()) return;
    const p1 = await measurePhase(4,1000000);
    if (!gone()&&p1) setLocData(p=>({...p,speed:p1.toFixed(1)}));
    if (gone()) return;
    const p2 = await measurePhase(4,3000000);
    if (!gone()) { if(p2) setLocData(p=>({...p,speed:(p1?(p1+p2)/2:p2).toFixed(1)})); setSpeedTesting(false); }
  }

  // Success animation, then navigate CLIENT-SIDE to the destination the server action returned.
  // We deliberately don't use a server-side redirect() — the Hostinger CDN intermittently drops the
  // redirect response for POST server-actions ("This page couldn't load"). A plain client navigation
  // is what the project-gate login has always used, and it goes through reliably.
  function grantAndGo(dest) {
    setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 100);
    setTimeout(() => setGranted(true), 1200);
    setTimeout(() => window.location.assign(dest || "/dashboard"), 1550);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.target);
    startTransition(async () => {
      const result = await loginAction(fd);
      if (result?.error) setError(result.error);
      else grantAndGo(result?.dest);
    });
  }

  // Phone step 1 — request a code (or fall back to password if 2FA is off/unavailable).
  function handlePhone(e) {
    e.preventDefault(); setError(null); setNoAccount(false);
    startTransition(async () => {
      const r = await start2faAction(phone);
      if (r?.sent) { setMasked(r.masked || ""); setCode(""); setPhStep("code"); }
      else if (r?.fallback) { setMode("password"); }   // 2FA off / Twilio down → sign in with a password instead
      else if (r?.error) { setError(r.error); if (r.noAccount) setNoAccount(true); }
    });
  }
  // Phone step 2 — verify the texted code (server signs in + redirects on success).
  function handleCode(e) {
    e.preventDefault(); setError(null);
    startTransition(async () => {
      const r = await verify2faAction(phone, code, next);
      if (r?.error) setError(r.error);
      else grantAndGo(r?.dest);
    });
  }
  function handleResend() {
    setError(null);
    startTransition(async () => { const r = await resend2faAction(phone); if (r?.error) setError(r.error); });
  }

  function handleSignup(e) {
    e.preventDefault();
    setError(null);
    if (!su.name.trim())                              { setError("Please enter your name."); return; }
    if (!EMAIL_RE.test(su.email.trim()))             { setError("Enter a valid email address."); return; }
    if (su.phone.replace(/\D/g, "").length !== 10)   { setError("Enter a valid 10-digit phone number."); return; }
    if (!pwStrong(su.password))                       { setError("Password needs 6+ characters and a capital letter."); return; }
    if (su.password !== su.confirm)                   { setError("Passwords don't match."); return; }
    const fd = new FormData(e.target);
    startTransition(async () => {
      const result = await signupAction(fd);
      if (result?.error) setError(result.error);
      else grantAndGo(result?.dest);
    });
  }

  // ---- Face ID (same 1:N flow as the PIN gate) ----
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
  // "Use PIN" path — customers with a project link enter their ID, then their PIN on the gate.
  function findProject() {
    const id = pinId.trim().toUpperCase();
    if (!id) { setPinErr("Enter your Project or Service Call ID."); return; }
    setPinErr("");
    window.location.href = (/^SVC/i.test(id) ? "/service-call/" : "/project/") + encodeURIComponent(id);
  }
  useEffect(() => { if (mode !== "face") stopFaceCam(); return stopFaceCam; }, [mode]);
  // Opening Face ID starts the scan immediately — no extra tap.
  useEffect(() => { if (mode === "face" && faceState === "idle") { const t = setTimeout(runFaceScan, 300); return () => clearTimeout(t); } }, [mode]); // eslint-disable-line

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
      const res = await fetch("/api/face-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embedding: emb, image: live.image }) });
      const j = await res.json();
      if (j.ok) {
        setFaceState("ok"); setFaceMsg("Welcome, " + j.name);
        // Let the green Face-ID success animation finish BEFORE the warp takes over.
        setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 1000);
        setTimeout(() => setGranted(true), 2100);
        setTimeout(() => window.location.assign(next || j.home || "/dashboard"), 2650);
      } else { setFaceState("fail"); setFaceMsg(j.error || "Not recognized. Use your password."); }
    } catch (e) {
      stopFaceCam();
      const secure = location.protocol === "https:" || location.hostname === "localhost";
      setFaceState("fail");
      setFaceMsg(secure ? "Camera unavailable — allow access, or use your password." : "Face ID needs a secure (HTTPS) connection.");
    }
  }

  return (
    <div className="gw2-root gw2-light">
      <style>{CSS + GW2_LIGHT_CSS}</style>
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

      <div className={`gw2-card${cardWarp ? " gw2-warp" : ""}`}>
        <div className="gw2-ring" />
        <div className="gw2-brand">
          <div className="gw2-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"/><circle cx="12" cy="15.5" r="1.4"/>
            </svg>
          </div>
          <h1><BrandLink style={{ justifyContent: "center" }}><Wordmark height={30} techsColor="#C9A96E" /></BrandLink></h1>
          <div className="gw2-subtag">Secure Access</div>
        </div>

        {mode === "phone" ? (
          phStep === "enter" ? (
          <form className="lg-form" onSubmit={handlePhone}>
            <div className="lg-field">
              <label className="lg-label">Phone number</label>
              <input value={phone} onChange={(e) => setPhone(suPhone(e.target.value))} type="tel" inputMode="tel" className="lg-input" placeholder="(555) 123-4567" autoComplete="tel" autoFocus required disabled={pending || granted} />
            </div>
            {error && <div className="lg-err">{error}{noAccount && <> — <button type="button" className="lg-err-link" onClick={() => { setMode("signup"); setError(null); }}>Create account</button></>}</div>}
            <button className="lg-btn" type="submit" disabled={pending || granted}>{pending ? "Sending…" : "Text me a code →"}</button>
          </form>
          ) : (
          <form className="lg-form" onSubmit={handleCode}>
            <div className="lg-field">
              <label className="lg-label">Enter the code texted to {masked}</label>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} type="text" inputMode="numeric" autoComplete="one-time-code" className="lg-input" placeholder="6-digit code" autoFocus required disabled={pending || granted} />
            </div>
            {error && <div className="lg-err">{error}</div>}
            <button className="lg-btn" type="submit" disabled={pending || granted || code.length < 4}>{pending ? "Verifying…" : "Verify →"}</button>
            <div className="lg-2fa-sub">
              <button type="button" className="gw2-lbtn" onClick={handleResend} disabled={pending}>Resend code</button>
              <button type="button" className="gw2-lbtn" onClick={() => { setPhStep("enter"); setError(null); }}>← Change number</button>
            </div>
          </form>
          )
        ) : mode === "password" ? (
        <>
        <form className="gw2-lf" onSubmit={handleSubmit}>
          <input type="hidden" name="next" value={next} />
          <div className="gw2-prompt">Sign in</div>
          <div className="gw2-lf-fields">
            <input name="identifier" type="text" className="gw2-lf-input" placeholder="Email, phone, or username" autoComplete="username" defaultValue={phone} autoFocus required disabled={pending || granted} />
            <PwInput name="password" className="gw2-lf-input" placeholder="Password" autoComplete="current-password" required disabled={pending || granted} />
          </div>
          {error && (
            <div className="gw2-lf-err">
              {error}
              {error.toLowerCase().includes("invalid") && (
                <> — <a href="/forgot" className="lg-err-link">Reset password</a></>
              )}
            </div>
          )}
          <button className="gw2-lf-btn" type="submit" disabled={pending || granted}>
            {pending ? "Signing in…" : "Sign In →"}
          </button>
        </form>
        <div className="gw2-or"><span>or</span></div>
        <a className="gw2-google" href="/api/auth/google?ctx=login">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </a>
        </>
        ) : mode === "face" ? (
        <div className="lgf">
          <div className={`lgf-prompt${faceState === "ok" ? " ok" : faceState === "fail" ? " err" : ""}`}>
            {faceState === "scanning" ? "Scanning…" : faceState === "ok" ? "Recognized" : "Look at the camera"}
          </div>
          {faceMsg && <div className="lgf-msg">{faceMsg}</div>}
          <div className="lgf-stage">
            <video ref={faceVideoRef} className="lgf-vid" playsInline muted />
            <FaceScan state={faceState} size={168} />
          </div>
          <button className="lg-btn" type="button" onClick={runFaceScan} disabled={granted || faceState === "scanning"}>
            {faceState === "scanning" ? "Scanning…" : "Scan my face"}
          </button>
        </div>
        ) : mode === "signup" ? (
        <form className="lg-form" onSubmit={handleSignup}>
          <input type="hidden" name="next" value={next} />
          <div className="lg-field"><label className="lg-label">Full name</label><input name="name" type="text" className="lg-input" placeholder="Your name" autoComplete="name" required disabled={pending || granted} value={su.name} onChange={(e) => suSet("name", suTitle(e.target.value))} /></div>
          <div className="lg-field"><label className="lg-label">Email</label><input name="email" type="email" className="lg-input" placeholder="you@email.com" autoComplete="email" required disabled={pending || granted} value={su.email} onChange={(e) => suSet("email", e.target.value.trim())} />{su.email && !EMAIL_RE.test(su.email) && <div className="lg-mini no">Invalid email</div>}</div>
          <div className="lg-field"><label className="lg-label">Phone</label><input name="phone" type="tel" className="lg-input" placeholder="(555) 123-4567" autoComplete="tel" inputMode="tel" required disabled={pending || granted} value={su.phone} onChange={(e) => suSet("phone", suPhone(e.target.value))} /></div>
          <div className="lg-field"><label className="lg-label">Password</label><PwInput name="password" placeholder="6+ characters, 1 capital" autoComplete="new-password" required disabled={pending || granted} value={su.password} onChange={(e) => suSet("password", e.target.value)} />{su.password && <div className={`lg-mini ${pwStrong(su.password) ? "ok" : "no"}`}>{pwStrong(su.password) ? "Looks good" : "Needs 6+ characters & a capital"}</div>}</div>
          <div className="lg-field"><label className="lg-label">Confirm password</label><PwInput name="confirm" placeholder="••••••••" autoComplete="new-password" required disabled={pending || granted} value={su.confirm} onChange={(e) => suSet("confirm", e.target.value)} />{su.confirm && <div className={`lg-mini ${su.password === su.confirm ? "ok" : "no"}`}>{su.password === su.confirm ? "Passwords match" : "No match"}</div>}</div>
          {error && <div className="lg-err">{error}</div>}
          <button className="lg-btn" type="submit" disabled={pending || granted}>{pending ? "Creating…" : "Create account →"}</button>
        </form>
        ) : (
        <div className="lgf">
          <div className="lgf-prompt">Find your project</div>
          <div className="lg-field">
            <label className="lg-label">Project or Service Call ID</label>
            <input className="lg-input" value={pinId} onChange={(e) => setPinId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && findProject()} placeholder="e.g. 00SK or SVC0005" autoComplete="off" spellCheck={false} />
          </div>
          {pinErr && <div className="lg-err">{pinErr}</div>}
          <button className="lg-btn" type="button" onClick={findProject}>Find it →</button>
        </div>
        )}

        <div className="gw2-actions">
          {mode === "phone" ? (
            <>
              <button className="gw2-lbtn" onClick={() => { setMode("password"); setError(null); }}>Password</button>
              <button className="gw2-lbtn" onClick={() => { setMode("face"); setFaceState("idle"); setFaceMsg(""); warmFace(); }}>Face ID</button>
              <button className="gw2-lbtn" onClick={() => { setMode("pin"); setPinErr(""); }}>Use PIN</button>
            </>
          ) : mode === "password" ? (
            <>
              <button className="gw2-lbtn" onClick={() => { setMode("phone"); setError(null); }}>Phone</button>
              <button className="gw2-lbtn" onClick={() => { setMode("face"); setFaceState("idle"); setFaceMsg(""); warmFace(); }}>Face ID</button>
              <button className="gw2-lbtn" onClick={() => { setMode("pin"); setPinErr(""); }}>Use PIN</button>
            </>
          ) : (
            <button className="gw2-lbtn" onClick={() => { setMode("phone"); setError(null); }}>← {mode === "signup" ? "Sign in" : "Back"}</button>
          )}
          <button className="gw2-lbtn gw2-help-btn" onClick={() => setShowHelp(true)}>help</button>
        </div>
      </div>

      {showLoc && (
        <div className="gw2-overlay" onClick={e => { if (e.target === e.currentTarget) setShowLoc(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd"><span>NETWORK DIAGNOSTICS</span><button className="gw2-mclose" onClick={() => setShowLoc(false)}>✕</button></div>
            <div className="gw2-mbd gw2-loc-bd">
              <div className="gw2-lrow"><div className="gw2-lk">Location</div><div className="gw2-lv"><div className="gw2-lv-main">{locData.city !== "—" ? `${locData.city}, ${locData.state}` : <span className="gw2-lskel" style={{width:120}} />}</div>{locData.lat && <div className="gw2-lv-sub">{locData.lat.toFixed(4)}, {locData.lng.toFixed(4)}</div>}</div></div>
              <div className="gw2-lrow"><div className="gw2-lk">Network Provider</div><div className="gw2-lv"><div className="gw2-lv-main">{locData.provider !== "—" ? locData.provider : <span className="gw2-lskel" style={{width:140}} />}</div></div></div>
              <div className="gw2-lrow"><div className="gw2-lk">Speed</div><div className="gw2-lv"><div className="gw2-speed-row">{locData.speed !== null && (() => { const s = speedStatus(locData.speed); return s ? <span className="gw2-speed-badge" style={{color:s.color,borderColor:s.color+"55"}}>{s.label}</span> : null; })()}<div className="gw2-lv-main">{locData.speed === null ? <span className="gw2-lskel" style={{width:70}} /> : `${locData.speed} Mbps`}</div><button className="gw2-speed-reload" onClick={runSpeedTest} disabled={speedTesting}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={speedTesting?{animation:"gw2SpinIcon 0.9s linear infinite"}:{}}><path d="M20 8A8.5 8.5 0 1 0 20.8 15"/><path d="M20 2v6h-6"/></svg></button></div></div></div>
              <div className="gw2-lrow"><div className="gw2-lk">IP Address</div><div className="gw2-lv"><div className="gw2-lv-main mono">{locData.ip !== "—" ? locData.ip.split(".").map((p,i) => i<2?p:"***").join(".") : <span className="gw2-lskel" style={{width:90}} />}</div></div></div>
              <div className="gw2-lrow last"><div className="gw2-lk">Device Type</div><div className="gw2-lv"><div className="gw2-lv-main">{locData.device || <span className="gw2-lskel" style={{width:70}} />}</div></div></div>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="gw2-overlay" onClick={e => { if (e.target === e.currentTarget) setShowHelp(false); }}>
          <div className="gw2-modal">
            <div className="gw2-mhd"><span>Need help signing in?</span><button className="gw2-mclose" onClick={() => setShowHelp(false)}>✕</button></div>
            <div className="gw2-mbd">
              <button className="gw2-hrow" onClick={() => { setShowHelp(false); setError(null); setMode("signup"); }} style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></div><div><div className="gw2-hk">Create an account</div><div className="gw2-hv">New customer? Start here</div></div></button>
              <a className="gw2-hrow" href="/forgot"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><div><div className="gw2-hk">Reset my password</div><div className="gw2-hv">Verify with the last 4 of your phone</div></div></a>
              <a className="gw2-hrow" href="mailto:support@iot-techs.com?subject=Login%20help%20-%20IOT%20TECHS"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></div><div><div className="gw2-hk">Email support</div><div className="gw2-hv">support@iot-techs.com</div></div></a>
              <a className="gw2-hrow" href="sms:+16463960775"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg></div><div><div className="gw2-hk">Text us</div><div className="gw2-hv">646-396-0775</div></div></a>
              <button className="gw2-hrow" onClick={() => { setShowHelp(false); setShowLoc(true); }} style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity=".5"/></svg></div><div><div className="gw2-hk">Network diagnostics</div><div className="gw2-hv">Check your connection</div></div></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The gw2 shell, sign-in form (gw2-lf*), brand/lock badge, keypad, footer chips and modals ALL come
// from globals.css + the shared GW2_LIGHT_CSS (imported), so /login is identical to the project lock
// screen. Only the login-only secondary modes (phone/SMS code, sign-up, Face ID) keep their own lg-*
// / lgf-* styles here, with matching light-card overrides.
const CSS = `
.lg-form{display:flex;flex-direction:column;gap:12px}
.lg-field{display:flex;flex-direction:column;gap:5px}
.lg-label{color:rgba(255,255,255,.5);font-size:.72rem;letter-spacing:1px;font-weight:600}
.lg-mini{font-size:.72rem;font-weight:600;margin-top:1px}
.lg-mini.ok{color:#7ad39a}
.lg-mini.no{color:#ff8a8a}
.lg-input{background:rgba(255,255,255,.05);border:1px solid rgba(201,169,110,.22);border-radius:9px;padding:11px 14px;color:#FAF8F4;font-size:14px;font-family:inherit;outline:none;width:100%;transition:border-color .18s,background .18s}
.lg-input:focus{border-color:#C9A96E}
.lg-input::placeholder{color:rgba(255,255,255,.22)}
.lg-input:disabled{opacity:.5}
.lg-pw{position:relative;display:flex}
.lg-pw .lg-input,.lg-pw .gw2-lf-input{flex:1;min-width:0;width:100%;padding-right:42px}
.lg-pw-eye{position:absolute;top:50%;right:6px;transform:translateY(-50%);display:grid;place-items:center;width:32px;height:32px;border:none;background:none;color:rgba(255,255,255,.4);cursor:pointer;border-radius:8px;transition:color .15s,background .15s}
.lg-pw-eye:hover{color:rgba(201,169,110,.9);background:rgba(255,255,255,.06)}
.lg-2fa-sub{display:flex;justify-content:space-between;align-items:center;margin-top:2px}
.lg-err{background:rgba(210,60,60,.12);border:1px solid rgba(210,60,60,.3);border-radius:8px;padding:9px 12px;color:#ff8a8a;font-size:.8rem;text-align:center}
.lg-err-link{color:#ffc0c0;font-weight:700;text-decoration:underline;text-underline-offset:2px}
.lg-err-link:hover{color:#fff}
.lg-btn{background:#C9A96E;color:#0B0F1A;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;letter-spacing:.04em;transition:background .18s}
.lg-btn:hover:not(:disabled){background:#b8944f}
.lg-btn:disabled{opacity:.5;cursor:default}
/* Face ID mode */
.lgf{display:flex;flex-direction:column;gap:14px}
.lgf-prompt{text-align:center;font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(201,169,110,.7)}
.lgf-prompt.ok{color:#5DB87A}
.lgf-prompt.err{color:#E05A5A}
.lgf-msg{text-align:center;font-size:.8rem;line-height:1.5;color:rgba(255,255,255,.72);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:8px 11px}
.lgf-stage{position:relative;width:168px;height:168px;margin:2px auto 0;display:grid;place-items:center}
.lgf-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none}
.lgf-hint{text-align:center;font-size:.72rem;color:rgba(255,255,255,.42);margin-top:2px}
/* Several sign-in options can wrap on the narrow card */
.gw2-actions{flex-wrap:wrap;gap:8px;justify-content:center}
/* Light-card overrides for the login-only classes (the shell + gw2-lf form use GW2_LIGHT_CSS) */
.gw2-light .lg-label{color:#6b7280}
.gw2-light .lg-input{background:#f4f5f7;border:1px solid #e6e8ee;color:#0e1320}
.gw2-light .lg-input::placeholder{color:#9aa0ab}
.gw2-light .lg-input:focus{border-color:#C9A96E;background:#fff}
.gw2-light .lg-input:disabled{opacity:.55}
.gw2-light .lg-pw-eye{color:#9aa0ab}
.gw2-light .lg-pw-eye:hover{color:#b08f4f;background:#faf4e8}
.gw2-light .lg-btn{background:#C9A96E;color:#0e1320}
.gw2-light .lg-btn:hover:not(:disabled){background:#b08f4f;color:#fff}
.gw2-light .lgf-prompt{color:#6b7280}
.gw2-light .lgf-prompt.ok{color:#1c8a45}
.gw2-light .lgf-prompt.err{color:#c0392b}
.gw2-light .lgf-msg{color:#2C3347;background:#f4f5f7;border:1px solid #e6e8ee}
.gw2-light .lg-mini.ok{color:#1c8a45}
.gw2-light .lg-mini.no{color:#c0392b}
.gw2-light .lg-err{background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.28);color:#c0392b}
.gw2-light .lg-err-link{color:#8f2018}
.gw2-light .lg-err-link:hover{color:#c0392b}
.gw2-light .gw2-or{display:flex;align-items:center;gap:12px;margin:16px 0;color:#9aa0ab;font-size:.78rem;letter-spacing:.02em}
.gw2-light .gw2-or::before,.gw2-light .gw2-or::after{content:"";flex:1;height:1px;background:#e6e8ee}
.gw2-light .gw2-google{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;background:#fff;border:1px solid #e0e3ea;border-radius:12px;padding:12px 16px;font:inherit;font-size:.92rem;font-weight:600;color:#2C3347;text-decoration:none;transition:border-color .14s,box-shadow .14s}
.gw2-light .gw2-google:hover{border-color:#C9A96E;box-shadow:0 5px 16px -9px rgba(14,19,32,.3)}
.gw2-light .gw2-google svg{flex:none}
`;
