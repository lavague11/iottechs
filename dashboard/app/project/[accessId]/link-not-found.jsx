"use client";

import { useEffect, useState } from "react";

// Playful full-screen "no project here" page — a security camera panning around looking for
// a signal it never finds, an "Oops" line, a Go-home button, and a 10-second auto-redirect
// with a live countdown ring. No masthead — this is a dead end, so keep it light, not formal.
export default function LinkNotFound() {
  const [count, setCount] = useState(10);

  useEffect(() => {
    const tick = setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    const go = setTimeout(() => { window.location.href = "/"; }, 10000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, []);

  const R = 20, C = 2 * Math.PI * R;

  return (
    <div className="lnf-root">
      <div className="lnf-stars" />
      <div className="lnf-card">
        {/* Panning "searching" camera looking for a signal */}
        <div className="lnf-scene">
          <span className="lnf-blip lnf-b1" />
          <span className="lnf-blip lnf-b2" />
          <span className="lnf-blip lnf-b3" />
          <svg className="lnf-cam" viewBox="0 0 120 120" width="150" height="150">
            {/* sweep cone */}
            <g className="lnf-sweep">
              <path d="M60 60 L60 8 A52 52 0 0 1 104 34 Z" fill="url(#cone)" opacity="0.5" />
            </g>
            <defs>
              <linearGradient id="cone" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#C9A96E" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#C9A96E" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* camera body, rocking as it "searches" */}
            <g className="lnf-body">
              <rect x="34" y="46" width="46" height="26" rx="7" fill="#e9edf5" />
              <rect x="76" y="52" width="16" height="14" rx="4" fill="#cfd6e4" />
              <circle cx="47" cy="59" r="8.5" fill="#0B0F1A" />
              <circle cx="47" cy="59" r="4" fill="#2b3856" />
              <circle cx="45" cy="57" r="1.6" fill="#C9A96E" />
              <rect x="55" y="74" width="4" height="16" rx="2" fill="#aeb7c9" />
              <rect x="46" y="88" width="22" height="5" rx="2.5" fill="#aeb7c9" />
            </g>
          </svg>
        </div>

        <div className="lnf-oops">Oops.</div>
        <h1 className="lnf-title">This project isn&apos;t here.</h1>
        <p className="lnf-sub">The link may be expired, mistyped, or the project was removed. Let&apos;s get you back home.</p>

        <a href="/" className="lnf-btn">
          Take me home
          <span className="lnf-ring">
            <svg viewBox="0 0 48 48" width="30" height="30">
              <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(11,15,26,.25)" strokeWidth="4" />
              <circle cx="24" cy="24" r={R} fill="none" stroke="#0B0F1A" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={C} strokeDashoffset={C * (1 - count / 10)}
                      transform="rotate(-90 24 24)" style={{ transition: "stroke-dashoffset 1s linear" }} />
            </svg>
            <span className="lnf-count">{count}</span>
          </span>
        </a>
        <div className="lnf-auto">Auto-redirecting in {count}s…</div>
      </div>

      <style>{`
        .lnf-root{position:fixed;inset:0;background:radial-gradient(1200px 700px at 50% -10%,#16203a 0%,#0B0F1A 55%,#070a12 100%);
          display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden;font-family:'Bricolage Grotesque',system-ui,sans-serif}
        .lnf-stars{position:absolute;inset:0;background-image:
          radial-gradient(1.5px 1.5px at 12% 30%,rgba(255,255,255,.5),transparent),
          radial-gradient(1.5px 1.5px at 78% 18%,rgba(201,169,110,.6),transparent),
          radial-gradient(1px 1px at 40% 70%,rgba(255,255,255,.4),transparent),
          radial-gradient(1.5px 1.5px at 88% 62%,rgba(255,255,255,.35),transparent),
          radial-gradient(1px 1px at 25% 85%,rgba(201,169,110,.5),transparent);
          animation:lnfTwinkle 4s ease-in-out infinite alternate}
        @keyframes lnfTwinkle{from{opacity:.5}to{opacity:1}}
        .lnf-card{position:relative;text-align:center;max-width:440px;width:100%}
        .lnf-scene{position:relative;height:170px;display:flex;align-items:center;justify-content:center;margin-bottom:6px}
        .lnf-cam{filter:drop-shadow(0 18px 30px rgba(0,0,0,.5))}
        .lnf-body{transform-origin:59px 78px;animation:lnfSearch 3.4s ease-in-out infinite}
        @keyframes lnfSearch{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}
        .lnf-sweep{transform-origin:60px 60px;animation:lnfSweep 3.4s ease-in-out infinite}
        @keyframes lnfSweep{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}
        .lnf-blip{position:absolute;width:7px;height:7px;border-radius:50%;background:#C9A96E;box-shadow:0 0 10px #C9A96E}
        .lnf-b1{top:22px;left:38%;animation:lnfBlip 2.6s ease-in-out infinite}
        .lnf-b2{top:44px;left:70%;animation:lnfBlip 2.6s ease-in-out .8s infinite}
        .lnf-b3{top:16px;left:60%;animation:lnfBlip 2.6s ease-in-out 1.6s infinite}
        @keyframes lnfBlip{0%,100%{opacity:0;transform:scale(.4)}20%{opacity:1;transform:scale(1)}60%{opacity:0;transform:scale(.4)}}
        .lnf-oops{font-size:3.4rem;font-weight:800;letter-spacing:-.03em;
          background:linear-gradient(180deg,#fff,#C9A96E);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
        .lnf-title{color:#fff;font-size:1.35rem;font-weight:700;margin:10px 0 8px}
        .lnf-sub{color:#9aa5bd;font-size:.92rem;line-height:1.5;margin:0 auto 26px;max-width:340px}
        .lnf-btn{display:inline-flex;align-items:center;gap:12px;background:#C9A96E;color:#0B0F1A;font-weight:800;font-size:1rem;
          padding:12px 14px 12px 24px;border-radius:100px;text-decoration:none;box-shadow:0 12px 30px -8px rgba(201,169,110,.5);transition:transform .15s,box-shadow .15s}
        .lnf-btn:hover{transform:translateY(-2px);box-shadow:0 16px 38px -8px rgba(201,169,110,.6)}
        .lnf-ring{position:relative;display:grid;place-items:center;width:30px;height:30px}
        .lnf-count{position:absolute;font-size:.72rem;font-weight:800;color:#0B0F1A}
        .lnf-auto{margin-top:16px;color:#5f6b85;font-size:.78rem}
        @media(max-width:480px){.lnf-oops{font-size:2.6rem}}
      `}</style>
    </div>
  );
}
