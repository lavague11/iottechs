"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { loginAction } from "./actions";
import { startPinCanvas } from "../project/[accessId]/gateway-pin-canvas";
import { TaglinePill } from "../components/brand";

function speedStatus(mbps) {
  const n = parseFloat(mbps);
  if (isNaN(n)) return null;
  if (n >= 50)  return { label: "Fast",   color: "#5DB87A" };
  if (n >= 10)  return { label: "Good",   color: "#C9A96E" };
  if (n >= 2)   return { label: "Slow",   color: "#E09A3A" };
  return { label: "Poor", color: "#E05A5A" };
}

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

  useEffect(() => {
    const ctrl = startPinCanvas(canvasRef.current);
    canvasCtrl.current = ctrl;
    return ctrl.cleanup;
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

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.target);
    startTransition(async () => {
      const result = await loginAction(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        // success — trigger warp
        setTimeout(() => { setCardWarp(true); if (canvasCtrl.current) canvasCtrl.current.startWarp(); }, 100);
        setTimeout(() => setGranted(true), 1200);
      }
    });
  }

  return (
    <div className="gw2-root">
      <style>{CSS}</style>
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
          <h1>IOT&nbsp;TECHS</h1>
          <TaglinePill tone="dark" style={{ borderColor: "rgba(255,255,255,.3)", margin: "6px 0 4px" }} />
          <div className="gw2-subtag">Staff Portal</div>
        </div>

        <form className="lg-form" onSubmit={handleSubmit}>
          <input type="hidden" name="next" value={next} />
          <div className="lg-field">
            <label className="lg-label">Email, Phone, or Username</label>
            <input name="identifier" type="text" className="lg-input" placeholder="Enter email or username" autoComplete="username" required disabled={pending || granted} />
          </div>
          <div className="lg-field">
            <label className="lg-label">Password</label>
            <input name="password" type="password" className="lg-input" placeholder="••••••••" autoComplete="current-password" required disabled={pending || granted} />
          </div>
          {error && (
            <div className="lg-err">
              {error}
              {error.toLowerCase().includes("invalid") && (
                <> — <a href="/forgot" className="lg-err-link">Reset password</a></>
              )}
            </div>
          )}
          <button className="lg-btn" type="submit" disabled={pending || granted}>
            {pending ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div className="gw2-actions">
          <button className="gw2-lbtn" onClick={() => setShowLoc(true)}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity=".5"/></svg>
            Network
          </button>
          <button className="gw2-lbtn gw2-help-btn" onClick={() => setShowHelp(true)}>Need help?</button>
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
              <p>Forgot your password? Reset it yourself, or reach our team and we&apos;ll get you back in fast.</p>
              <a className="gw2-hrow" href="/forgot"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><div><div className="gw2-hk">Reset my password</div><div className="gw2-hv">Verify with the last 4 of your phone</div></div></a>
              <a className="gw2-hrow" href="mailto:support@iot-techs.com?subject=Login%20help%20-%20IOT%20TECHS"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg></div><div><div className="gw2-hk">Email support</div><div className="gw2-hv">support@iot-techs.com</div></div></a>
              <a className="gw2-hrow" href="sms:+16463960775"><div className="gw2-hic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg></div><div><div className="gw2-hk">Text us</div><div className="gw2-hv">646-396-0775</div></div></a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.gw2-root *{box-sizing:border-box;margin:0;padding:0}
.gw2-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#060b14;overflow:hidden;font-family:'Hanken Grotesk',system-ui,sans-serif}
.gw2-aura{position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 40%,rgba(30,50,100,.45) 0%,transparent 70%)}
.gw2-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(50,87,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(50,87,255,.06) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 80% 70% at 50% 50%,#000 30%,transparent 100%)}
.gw2-net{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.5}
.gw2-card{position:relative;z-index:10;width:340px;background:rgba(10,16,30,.92);border:1px solid rgba(201,169,110,.22);border-radius:20px;padding:32px 28px 24px;backdrop-filter:blur(20px);box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);display:flex;flex-direction:column;gap:20px;transition:transform .6s cubic-bezier(.22,1,.36,1),opacity .6s}
.gw2-warp{transform:scale(1.04) translateY(-6px);opacity:0;pointer-events:none}
.gw2-ring{position:absolute;inset:-1px;border-radius:21px;background:conic-gradient(from 200deg,transparent 60%,rgba(201,169,110,.5) 75%,rgba(201,169,110,.8) 80%,rgba(201,169,110,.5) 85%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:1px;animation:gw2Rotate 3s linear infinite;pointer-events:none}
@keyframes gw2Rotate{to{transform:rotate(360deg)}}
.gw2-brand{text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}
.gw2-brand h1{color:#f0e8d6;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:1.45rem;font-weight:800;letter-spacing:2px}
.gw2-subtag{color:rgba(201,169,110,.6);font-size:.7rem;letter-spacing:3px;font-weight:600}
.lg-form{display:flex;flex-direction:column;gap:12px}
.lg-field{display:flex;flex-direction:column;gap:5px}
.lg-label{color:rgba(255,255,255,.45);font-size:.72rem;letter-spacing:1px;font-weight:600}
.lg-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 13px;color:#f0e8d6;font-size:.9rem;font-family:inherit;outline:none;transition:border-color .2s,background .2s}
.lg-input:focus{border-color:rgba(201,169,110,.5);background:rgba(255,255,255,.07)}
.lg-input::placeholder{color:rgba(255,255,255,.2)}
.lg-input:disabled{opacity:.5}
.lg-err{background:rgba(210,60,60,.12);border:1px solid rgba(210,60,60,.3);border-radius:8px;padding:9px 12px;color:#ff8a8a;font-size:.8rem;text-align:center}
.lg-err-link{color:#ffc0c0;font-weight:700;text-decoration:underline;text-underline-offset:2px}
.lg-err-link:hover{color:#fff}
.lg-btn{background:linear-gradient(135deg,#c9a96e,#b08f4f);color:#0a1020;border:none;border-radius:10px;padding:12px;font-size:.9rem;font-weight:700;font-family:inherit;cursor:pointer;transition:opacity .2s,transform .1s;letter-spacing:.5px}
.lg-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}
.lg-btn:disabled{opacity:.5;cursor:default}
.gw2-actions{display:flex;justify-content:space-between;align-items:center}
.gw2-lbtn{background:none;border:none;color:rgba(201,169,110,.5);font-size:.72rem;font-family:inherit;cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:5px;transition:color .15s}
.gw2-lbtn:hover{color:rgba(201,169,110,.85)}
.gw2-help-btn{color:rgba(255,255,255,.3)}
.gw2-help-btn:hover{color:rgba(255,255,255,.6)}
.gw2-granted{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;animation:gw2FadeIn .4s ease forwards}
.gw2-gck{width:72px;height:72px;border-radius:50%;background:rgba(93,184,122,.15);border:1.5px solid rgba(93,184,122,.4);display:grid;place-items:center;color:#5DB87A}
.gw2-granted h2{color:#f0e8d6;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:1.1rem;letter-spacing:3px}
.gw2-granted p{color:rgba(201,169,110,.6);font-size:.8rem;letter-spacing:1px}
@keyframes gw2FadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
/* Modals */
.gw2-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100}
.gw2-modal{background:#0e1828;border:1px solid rgba(201,169,110,.2);border-radius:16px;width:320px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.6)}
.gw2-mhd{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07);font-size:.72rem;letter-spacing:2px;color:rgba(201,169,110,.7);font-weight:700}
.gw2-mclose{background:none;border:none;color:rgba(255,255,255,.3);font-size:1rem;cursor:pointer;line-height:1;padding:2px 6px}
.gw2-mclose:hover{color:#fff}
.gw2-mbd{padding:20px 18px;display:flex;flex-direction:column;gap:12px}
.gw2-mbd p{color:rgba(255,255,255,.5);font-size:.8rem;line-height:1.6}
.gw2-hrow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);text-decoration:none;color:inherit;transition:background .15s}
.gw2-hrow:hover{background:rgba(255,255,255,.08)}
.gw2-hic{font-size:1.2rem;width:32px;text-align:center}
.gw2-hk{color:#f0e8d6;font-size:.82rem;font-weight:600}
.gw2-hv{color:rgba(201,169,110,.7);font-size:.75rem;margin-top:1px}
/* Diagnostics */
.gw2-loc-bd{padding:0}
.gw2-lrow{display:flex;justify-content:space-between;align-items:flex-start;padding:13px 18px;border-bottom:1px solid rgba(255,255,255,.06)}
.gw2-lrow.last{border-bottom:none}
.gw2-lk{color:rgba(255,255,255,.35);font-size:.72rem;letter-spacing:.5px;font-weight:600;padding-top:2px}
.gw2-lv{text-align:right}
.gw2-lv-main{color:#f0e8d6;font-size:.8rem}
.gw2-lv-sub{color:rgba(255,255,255,.3);font-size:.68rem;margin-top:2px}
.gw2-lskel{display:inline-block;height:12px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.08) 25%,rgba(255,255,255,.14) 50%,rgba(255,255,255,.08) 75%);background-size:200% 100%;animation:gw2Shimmer 1.4s infinite}
@keyframes gw2Shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.gw2-speed-row{display:flex;align-items:center;gap:7px;justify-content:flex-end}
.gw2-speed-badge{font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:100px;border:1px solid;letter-spacing:.5px}
.gw2-speed-reload{background:none;border:none;color:rgba(255,255,255,.3);cursor:pointer;padding:2px;display:flex;align-items:center}
.gw2-speed-reload:hover{color:rgba(255,255,255,.7)}
@keyframes gw2SpinIcon{to{transform:rotate(360deg)}}
.mono{font-family:Menlo,Consolas,monospace;letter-spacing:.3px}
`;
