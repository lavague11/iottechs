"use client";

import { useState, useEffect } from "react";

// A fullscreen, animated step-by-step walkthrough. Driven by a `steps` array (each with an `art`
// key selecting an animated scene + editable title/text). Built first for Mobile App Setup, but
// generic — any guide-kind support article renders through this.
export default function GuideWalkthrough({ title = "Setup Guide", intro, steps = [], onClose }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);       // slide direction for the entry animation
  const [done, setDone] = useState(false);
  const total = steps.length;
  const step = steps[i] || {};
  const last = i === total - 1;

  const go = (n) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(total - 1, n))); };

  // Keyboard: ← → to move, Esc to close.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight" && !last) go(i + 1);
      else if (e.key === "ArrowLeft" && i > 0) go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, last]);

  function next() {
    if (last) { setDone(true); return; }
    go(i + 1);
  }

  return (
    <div className="gw-scrim" onClick={(e) => { if (e.target.classList.contains("gw-scrim")) onClose?.(); }}>
      <style>{CSS}</style>
      <div className="gw-card">
        <button className="gw-x" onClick={onClose} aria-label="Close">✕</button>

        {done ? (
          <Finish title={title} onClose={onClose} onRestart={() => { setDone(false); setI(0); }} />
        ) : (
          <>
            <div className="gw-head">
              <div className="gw-kicker">{title}</div>
              <div className="gw-progresswrap"><div className="gw-progress" style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
              <div className="gw-dots">
                {steps.map((_, n) => (
                  <button key={n} className={`gw-dot${n === i ? " on" : ""}${n < i ? " past" : ""}`} onClick={() => go(n)} aria-label={`Step ${n + 1}`} />
                ))}
              </div>
            </div>

            <div className="gw-body" key={i} style={{ "--dir": dir }}>
              <div className="gw-phone">
                <div className="gw-phone-notch" />
                <div className="gw-screen"><Scene art={step.art} /></div>
              </div>
              <div className="gw-text">
                <div className="gw-stepno">Step {i + 1} of {total}</div>
                <h2 className="gw-title">{step.title}</h2>
                <p className="gw-desc">{step.text}</p>
                {i === 0 && intro && <div className="gw-intro">{intro}</div>}
              </div>
            </div>

            <div className="gw-foot">
              <button className="gw-back" onClick={() => go(i - 1)} disabled={i === 0}>← Back</button>
              <div className="gw-count">{i + 1} / {total}</div>
              <button className="gw-next" onClick={next}>{last ? "Finish ✓" : "Next →"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Finish({ title, onClose, onRestart }) {
  return (
    <div className="gw-finish">
      <div className="gw-burst">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      </div>
      <h2>All done!</h2>
      <p>You've finished {title}. You can revisit this guide anytime from Support.</p>
      <div className="gw-finish-btns">
        <button className="gw-back" onClick={onRestart}>↺ Replay</button>
        <button className="gw-next" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ---- Animated scenes (rendered inside the phone screen), keyed by step.art ----
function Scene({ art }) {
  switch (art) {
    case "download": return (
      <div className="sc sc-dl">
        <div className="sc-appicon">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
        </div>
        <div className="sc-arrow">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13" /><path d="M6 11l6 6 6-6" /></svg>
        </div>
        <div className="sc-bar"><span /></div>
        <div className="sc-cap">Installing…</div>
      </div>
    );
    case "account": return (
      <div className="sc sc-acct">
        <div className="sc-field f1" />
        <div className="sc-field f2" />
        <div className="sc-btn">Sign Up</div>
        <div className="sc-check">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
        </div>
      </div>
    );
    case "qr": return (
      <div className="sc sc-qr">
        <div className="sc-qrbox">
          <span className="sc-cnr tl" /><span className="sc-cnr tr" /><span className="sc-cnr bl" /><span className="sc-cnr br" />
          <div className="sc-qrgrid">
            {Array.from({ length: 36 }).map((_, n) => <i key={n} className={(n * 7 + 3) % 3 === 0 ? "on" : ""} />)}
          </div>
          <div className="sc-scan" />
        </div>
        <div className="sc-cap">Scanning QR…</div>
      </div>
    );
    case "device": return (
      <div className="sc sc-dev">
        <div className="sc-wave w1" /><div className="sc-wave w2" /><div className="sc-wave w3" />
        <div className="sc-nvr">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="8" rx="1.5" /><circle cx="6" cy="12" r="1" fill="#fff" /><path d="M10 12h9" /></svg>
        </div>
        <div className="sc-cap">Connecting…</div>
      </div>
    );
    case "name": return (
      <div className="sc sc-name">
        {["Front Door", "Back Lot", "Register"].map((n, k) => (
          <div className="sc-cam" key={n} style={{ animationDelay: `${0.15 + k * 0.28}s` }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            <span className="sc-lbl">{n}</span>
          </div>
        ))}
      </div>
    );
    case "notify": return (
      <div className="sc sc-notify">
        <div className="sc-bell">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <span className="sc-badge">1</span>
        </div>
        <div className="sc-toast"><b>Motion — Front Door</b><span>Just now</span></div>
      </div>
    );
    case "done":
    default: return (
      <div className="sc sc-done">
        <div className="sc-rays"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="sc-checkbig">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
        </div>
      </div>
    );
  }
}

const CSS = `
.gw-scrim{position:fixed;inset:0;z-index:4000;background:rgba(8,11,20,.62);backdrop-filter:blur(6px);display:grid;place-items:center;padding:18px;font-family:'Hanken Grotesk',system-ui,sans-serif}
.gw-card{position:relative;width:100%;max-width:720px;background:#fff;border-radius:22px;box-shadow:0 40px 100px -30px rgba(0,0,0,.6);overflow:hidden;animation:gwIn .28s cubic-bezier(.16,1,.3,1)}
@keyframes gwIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
.gw-x{position:absolute;top:14px;right:14px;z-index:5;width:32px;height:32px;border:none;border-radius:9px;background:rgba(14,19,32,.05);color:#5b6472;font-size:1rem;cursor:pointer;line-height:1}
.gw-x:hover{background:rgba(14,19,32,.1);color:#0e1320}
.gw-head{padding:22px 26px 0}
.gw-kicker{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:#b08f4f}
.gw-progresswrap{height:5px;border-radius:100px;background:#eef0f4;margin:12px 0 10px;overflow:hidden}
.gw-progress{height:100%;border-radius:100px;background:linear-gradient(90deg,#C9A96E,#e8cb94);transition:width .4s cubic-bezier(.16,1,.3,1)}
.gw-dots{display:flex;gap:7px}
.gw-dot{width:9px;height:9px;border-radius:50%;border:none;background:#e2e5ec;cursor:pointer;padding:0;transition:background .2s,transform .2s}
.gw-dot.past{background:#d8c39a}
.gw-dot.on{background:#C9A96E;transform:scale(1.3)}
.gw-body{display:grid;grid-template-columns:200px 1fr;gap:26px;align-items:center;padding:22px 26px 8px}
.gw-body>*{animation:gwSlide .4s cubic-bezier(.16,1,.3,1) both}
@keyframes gwSlide{from{opacity:0;transform:translateX(calc(var(--dir,1)*26px))}to{opacity:1;transform:none}}
.gw-text .gw-stepno{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa0ab;margin-bottom:6px}
.gw-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.5rem;color:#0e1320;line-height:1.15;margin:0 0 10px}
.gw-desc{font-size:.95rem;line-height:1.6;color:#2C3347;margin:0}
.gw-intro{margin-top:12px;padding:10px 12px;border-radius:10px;background:#faf4e8;border:1px solid rgba(201,169,110,.3);font-size:.82rem;color:#7a5f2a}
.gw-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 26px 22px;margin-top:8px;border-top:1px solid #eef0f4}
.gw-count{font-size:.8rem;color:#9aa0ab;font-weight:600}
.gw-back,.gw-next{height:42px;padding:0 20px;border-radius:11px;font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer;transition:all .15s}
.gw-back{background:#fff;border:1.5px solid #e6e8ee;color:#0e1320}
.gw-back:hover:not(:disabled){border-color:#C9A96E;color:#b08f4f}
.gw-back:disabled{opacity:.4;cursor:default}
.gw-next{background:linear-gradient(135deg,#C9A96E,#b08f4f);border:none;color:#fff;box-shadow:0 10px 24px -10px rgba(176,143,79,.7)}
.gw-next:hover{filter:brightness(1.06);transform:translateY(-1px)}
/* Phone frame */
.gw-phone{position:relative;width:200px;height:400px;margin:0 auto;border-radius:32px;background:linear-gradient(160deg,#161b26,#0b0f18);padding:11px;box-shadow:0 20px 46px -14px rgba(0,0,0,.55),inset 0 0 0 2px rgba(255,255,255,.05);display:flex;flex-direction:column}
.gw-phone-notch{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:78px;height:17px;background:#0b0f18;border-radius:0 0 12px 12px;z-index:3}
.gw-screen{position:relative;width:100%;flex:1;min-height:0;border-radius:22px;overflow:hidden;background:linear-gradient(170deg,#f7f8fa,#eef1f6);display:grid;place-items:center}
/* Scenes */
.sc{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#b08f4f}
.sc-cap{font-size:.72rem;font-weight:700;color:#8a93a3;letter-spacing:.02em}
/* download */
.sc-appicon{width:66px;height:66px;border-radius:17px;background:linear-gradient(145deg,#C9A96E,#a8843f);display:grid;place-items:center;box-shadow:0 10px 20px -6px rgba(168,132,63,.6);animation:scPop .5s cubic-bezier(.16,1,.3,1) both}
.sc-arrow{color:#C9A96E;animation:scBounce 1.1s ease-in-out infinite}
@keyframes scBounce{0%,100%{transform:translateY(-3px);opacity:.6}50%{transform:translateY(4px);opacity:1}}
.sc-bar{width:110px;height:6px;border-radius:100px;background:#e2e5ec;overflow:hidden}
.sc-bar span{display:block;height:100%;border-radius:100px;background:linear-gradient(90deg,#C9A96E,#e8cb94);animation:scFill 1.8s ease-in-out infinite}
@keyframes scFill{0%{width:8%}70%{width:100%}100%{width:100%}}
@keyframes scPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
/* account */
.sc-acct{gap:10px}
.sc-field{width:120px;height:15px;border-radius:6px;background:#fff;border:1px solid #e2e5ec}
.sc-field.f1{animation:scType .5s .1s both}
.sc-field.f2{animation:scType .5s .35s both}
@keyframes scType{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.sc-btn{width:120px;text-align:center;padding:8px;border-radius:8px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-size:.72rem;font-weight:700;animation:scType .5s .6s both}
.sc-check{position:absolute;bottom:52px;right:38px;width:40px;height:40px;border-radius:50%;background:#1c8a45;display:grid;place-items:center;box-shadow:0 8px 18px -6px rgba(28,138,69,.7);animation:scPop .45s .9s both}
/* qr */
.sc-qrbox{position:relative;width:118px;height:118px;background:#fff;border-radius:12px;padding:14px;box-shadow:0 8px 20px -8px rgba(0,0,0,.2)}
.sc-qrgrid{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:1fr;gap:2px;width:100%;height:100%}
.sc-qrgrid i{background:transparent;border-radius:1px}
.sc-qrgrid i.on{background:#0e1320}
.sc-scan{position:absolute;left:10px;right:10px;height:2.5px;top:14px;background:linear-gradient(90deg,transparent,#C9A96E,transparent);box-shadow:0 0 10px 2px rgba(201,169,110,.7);animation:scScan 1.9s ease-in-out infinite}
@keyframes scScan{0%,100%{top:16px}50%{top:100px}}
.sc-cnr{position:absolute;width:14px;height:14px;border:2.5px solid #C9A96E}
.sc-cnr.tl{top:4px;left:4px;border-right:none;border-bottom:none;border-radius:5px 0 0 0}
.sc-cnr.tr{top:4px;right:4px;border-left:none;border-bottom:none;border-radius:0 5px 0 0}
.sc-cnr.bl{bottom:4px;left:4px;border-right:none;border-top:none;border-radius:0 0 0 5px}
.sc-cnr.br{bottom:4px;right:4px;border-left:none;border-top:none;border-radius:0 0 5px 0}
/* device */
.sc-dev{justify-content:flex-end;padding-bottom:34px}
.sc-nvr{width:64px;height:40px;border-radius:9px;background:linear-gradient(145deg,#2C3347,#0e1320);display:grid;place-items:center;z-index:2;box-shadow:0 8px 18px -6px rgba(0,0,0,.4)}
.sc-wave{position:absolute;bottom:44px;left:50%;transform:translateX(-50%);border:2px solid rgba(201,169,110,.6);border-radius:50%;animation:scWave 2s ease-out infinite}
.sc-wave.w1{width:60px;height:60px;animation-delay:0s}
.sc-wave.w2{width:100px;height:100px;animation-delay:.5s}
.sc-wave.w3{width:140px;height:140px;animation-delay:1s}
@keyframes scWave{0%{opacity:0;transform:translateX(-50%) scale(.5)}40%{opacity:.7}100%{opacity:0;transform:translateX(-50%) scale(1)}}
/* name */
.sc-name{gap:9px;padding:0 18px;align-items:stretch}
.sc-cam{display:flex;align-items:center;gap:9px;padding:8px 10px;background:#fff;border-radius:9px;border:1px solid #e6e8ee;color:#b08f4f;animation:scType .5s both}
.sc-lbl{font-size:.72rem;font-weight:700;color:#2C3347}
/* notify */
.sc-notify{gap:18px}
.sc-bell{position:relative;color:#C9A96E;animation:scRing 2.4s ease-in-out infinite;transform-origin:50% 10%}
@keyframes scRing{0%,60%,100%{transform:rotate(0)}68%{transform:rotate(14deg)}76%{transform:rotate(-11deg)}84%{transform:rotate(7deg)}92%{transform:rotate(-4deg)}}
.sc-badge{position:absolute;top:-3px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:100px;background:#e04b4b;color:#fff;font-size:.62rem;font-weight:800;display:grid;place-items:center;animation:scPop .4s .5s both}
.sc-toast{width:130px;background:#fff;border-radius:10px;padding:8px 10px;box-shadow:0 10px 22px -8px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:2px;animation:scToast .5s .3s both}
.sc-toast b{font-size:.72rem;color:#0e1320}
.sc-toast span{font-size:.64rem;color:#9aa0ab}
@keyframes scToast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* done */
.sc-checkbig{width:78px;height:78px;border-radius:50%;background:linear-gradient(145deg,#22a75a,#158043);display:grid;place-items:center;box-shadow:0 12px 26px -8px rgba(28,138,69,.7);animation:scPop .5s .1s both;z-index:2}
.sc-rays{position:absolute;inset:0;display:grid;place-items:center}
.sc-rays i{position:absolute;width:3px;height:15px;border-radius:2px;background:#C9A96E;opacity:0;animation:scRay .7s .35s ease-out forwards}
.sc-rays i:nth-child(1){transform:rotate(0deg) translateY(-52px)}
.sc-rays i:nth-child(2){transform:rotate(45deg) translateY(-52px)}
.sc-rays i:nth-child(3){transform:rotate(90deg) translateY(-52px)}
.sc-rays i:nth-child(4){transform:rotate(135deg) translateY(-52px)}
.sc-rays i:nth-child(5){transform:rotate(180deg) translateY(-52px)}
.sc-rays i:nth-child(6){transform:rotate(225deg) translateY(-52px)}
.sc-rays i:nth-child(7){transform:rotate(270deg) translateY(-52px)}
.sc-rays i:nth-child(8){transform:rotate(315deg) translateY(-52px)}
@keyframes scRay{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
/* finish view */
.gw-finish{text-align:center;padding:44px 30px 34px;animation:gwSlide .4s both}
.gw-burst{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;background:linear-gradient(145deg,#22a75a,#158043);color:#fff;display:grid;place-items:center;box-shadow:0 16px 34px -10px rgba(28,138,69,.7);animation:scPop .5s both}
.gw-finish h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.6rem;color:#0e1320;margin:0 0 8px}
.gw-finish p{font-size:.95rem;color:#2C3347;line-height:1.6;max-width:400px;margin:0 auto 22px}
.gw-finish-btns{display:flex;justify-content:center;gap:12px}
@media(max-width:560px){
  .gw-body{grid-template-columns:1fr;gap:16px;text-align:center}
  .gw-phone{width:170px;height:340px}
  .gw-title{font-size:1.3rem}
}
`;
