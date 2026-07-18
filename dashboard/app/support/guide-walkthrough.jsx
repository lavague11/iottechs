"use client";

import { useState, useEffect } from "react";

// A fullscreen, step-by-step walkthrough. Flow: two quick intro questions (which phone? got your
// QR?) BEFORE any phone appears, then the phone-framed steps. Each step shows a real screenshot
// (step.image) if present, otherwise an animated scene (step.art). Generic — any guide article
// renders through this; the intro questions are specific to the mobile-app setup by design.
export default function GuideWalkthrough({ title = "Setup Guide", intro, steps = [], projects = [], onClose }) {
  const [phase, setPhase]     = useState("ask");   // 'ask' → 'steps' → 'add-more' → 'done'
  const [qi, setQi]           = useState(0);       // intro question (0 = phone, 1 = which system)
  const [platform, setPlatform] = useState(null);  // 'ios' | 'android'
  const [system, setSystem]   = useState(null);     // the system they picked (drives the password)
  const [i, setI]             = useState(0);        // step index
  const [dir, setDir]         = useState(1);        // slide direction for entry animation
  const total = steps.length;
  const step = steps[i] || {};
  const last = i === total - 1;
  // App password = "Cam" + the system's ZIP, so we can get in during the first week of tuning.
  const zip = system?.zip || (projects || []).find((p) => p.zip)?.zip || "";
  const password = zip ? `Cam${zip}` : "Cam + your ZIP";

  const go = (n) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(total - 1, n))); };
  function next() { if (last) setPhase("add-more"); else go(i + 1); }   // end → "add anyone else?"
  function back() {
    if (i === 0) { setPhase("ask"); setQi(1); }   // step 1 → back to the system picker
    else go(i - 1);
  }

  // Keyboard: ← → move through steps, Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (phase === "steps" && e.key === "ArrowRight") next();
      else if (phase === "steps" && e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, i, last]);

  function pickPlatform(p) { setPlatform(p); setQi(1); }
  function startSteps(proj) { if (proj) setSystem(proj); setPhase("steps"); setI(0); setDir(1); }

  return (
    <div className="gw-scrim" onClick={(e) => { if (e.target.classList.contains("gw-scrim")) onClose?.(); }}>
      <style>{CSS}</style>
      <div className="gw-card">
        <button className="gw-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="gw-kicker gw-kicker-abs">{title}</div>

        {phase === "ask" ? (
          <AskFlow qi={qi} platform={platform} projects={projects} onPlatform={pickPlatform} onContinue={startSteps} onBack={() => setQi(0)} />
        ) : phase === "add-more" ? (
          <AddMore onDone={() => setPhase("done")} />
        ) : phase === "done" ? (
          <Finish title={title} onClose={onClose} onRestart={() => { setPhase("steps"); setI(0); }} />
        ) : (
          <>
            <div className="gw-head">
              <div className="gw-progresswrap"><div className="gw-progress" style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
              <div className="gw-dots">
                {steps.map((_, n) => (
                  <button key={n} className={`gw-dot${n === i ? " on" : ""}${n < i ? " past" : ""}`} onClick={() => go(n)} aria-label={`Step ${n + 1}`} />
                ))}
              </div>
            </div>

            <div className="gw-body" key={i} style={{ "--dir": dir }}>
              <PhoneFrame art={step.art} image={step.image} tap={step.tap} platform={platform} />
              <StepText label={`Step ${i + 1} of ${total}`} step={step} password={password} />
            </div>

            <div className="gw-foot">
              <button className="gw-back" onClick={back}>← Back</button>
              <div className="gw-count">{i + 1} / {total}</div>
              <button className="gw-next" onClick={next}>{last ? "Finish ✓" : "Next →"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Reusable phone mockup: a screenshot (or animated scene) + an optional "tap here" highlight.
function PhoneFrame({ art, image, tap, platform }) {
  return (
    <div className="gw-phone">
      <div className="gw-phone-notch" />
      <div className="gw-screen">
        <Scene art={art} image={image} platform={platform} />
        {tap && (
          <span
            className="gw-tap"
            style={{ left: `${tap.x}%`, top: `${tap.y}%`, width: `${tap.w || 74}%`, height: `${tap.h || 7}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

// Step caption with an optional "?" that reveals the "why" behind a step.
// {PASSWORD} in the text is swapped for the system's app password (Cam + ZIP) and shown as a chip.
function StepText({ label, step, password }) {
  const [why, setWhy] = useState(false);
  const parts = String(step.text || "").split("{PASSWORD}");
  return (
    <div className="gw-text">
      <div className="gw-stepno">{label}</div>
      <h2 className="gw-title">
        {step.title}
        {step.why && (
          <button className={`gw-why-btn${why ? " on" : ""}`} onClick={() => setWhy((w) => !w)} aria-label="Why?" title="Why?">?</button>
        )}
      </h2>
      <p className="gw-desc">
        {parts.length > 1
          ? <>{parts[0]}<code className="gw-pass">{password}</code>{parts[1]}</>
          : step.text}
      </p>
      {step.why && why && <div className="gw-why">{step.why}</div>}
    </div>
  );
}

// Two intro screens before the phone: which platform, then which system (shows that system's QR).
function AskFlow({ qi, platform, projects, onPlatform, onContinue, onBack }) {
  return (
    <div className="gw-ask" key={qi}>
      <div className="gw-ask-step">Step {qi + 1} of 2</div>
      {qi === 0 ? (
        <>
          <h2 className="gw-ask-q">Which phone do you have?</h2>
          <div className="gw-choices">
            <button className={`gw-choice${platform === "ios" ? " on" : ""}`} onClick={() => onPlatform("ios")}>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" stroke="none"><path d="M16.4 12.9c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 6 1 8 .6 1 1.4 2 2.4 2s1.3-.6 2.5-.6 1.5.6 2.6.6 1.7-1 2.4-2c.7-1 1-2 1-2.1-.1 0-1.9-.7-1.9-2.7ZM14.6 6.3c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.3 1.2-.5.5-.9 1.4-.8 2.3.9 0 1.8-.5 2.3-1.1Z"/></svg>
              iPhone
            </button>
            <button className={`gw-choice${platform === "android" ? " on" : ""}`} onClick={() => onPlatform("android")}>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" stroke="none"><path d="M6 9v7a1.5 1.5 0 0 0 1.5 1.5H8V20a1 1 0 0 0 2 0v-2.5h4V20a1 1 0 0 0 2 0v-2.5h.5A1.5 1.5 0 0 0 18 16V9H6ZM4.5 9A1.5 1.5 0 0 0 3 10.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 9ZM19.5 9A1.5 1.5 0 0 0 18 10.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 19.5 9ZM15.6 3.9l1-1.5a.3.3 0 0 0-.5-.3l-1 1.6a6 6 0 0 0-4.2 0l-1-1.6a.3.3 0 0 0-.5.3l1 1.5A5.3 5.3 0 0 0 6.3 8h11.4a5.3 5.3 0 0 0-2.1-4.1ZM9.5 6.2a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Zm5 0a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Z"/></svg>
              Android
            </button>
          </div>
        </>
      ) : (
        <SystemPicker projects={projects} onContinue={onContinue} onBack={onBack} />
      )}
    </div>
  );
}

// "Which system?" — list the customer's systems, show the picked one's QR. No system → contact us.
function SystemPicker({ projects = [], onContinue, onBack }) {
  const withQr = (projects || []).filter((p) => p.system_qr);
  const [sel, setSel] = useState(withQr[0]?.access_id || "");
  const [zoom, setZoom] = useState(false);
  const proj = withQr.find((p) => p.access_id === sel);

  if (withQr.length === 0) {
    return (
      <div className="gw-qrhelp">
        <h2 className="gw-ask-q">Which system?</h2>
        <p className="gw-ask-sub">We don't see a QR for your systems yet. Please contact support and we'll get you set up.</p>
        <div className="gw-qr-actions">
          <button className="gw-back" onClick={onBack}>← Back</button>
          <a className="gw-next" href="mailto:support@iot-techs.com?subject=Mobile%20app%20QR%20help" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Contact support</a>
        </div>
      </div>
    );
  }
  return (
    <div className="gw-qrhelp">
      <h2 className="gw-ask-q">Which system?</h2>
      <p className="gw-ask-sub">Pick your system, then scan this QR from the app.</p>
      {withQr.length > 1 && (
        <select className="gw-qr-select" value={sel} onChange={(e) => setSel(e.target.value)}>
          {withQr.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer || p.access_id}</option>)}
        </select>
      )}
      {proj && (
        <>
          <button className="gw-qr-card gw-qr-tap" onClick={() => setZoom(true)} title="Tap to enlarge">
            <img className="gw-qr-img" src={proj.system_qr} alt="Your System QR code" draggable={false} />
            <div className="gw-qr-name">{proj.customer || proj.access_id}</div>
            <div className="gw-qr-hint">Tap to enlarge</div>
          </button>
          {zoom && <QrZoom proj={proj} onClose={() => setZoom(false)} />}
        </>
      )}
      <div className="gw-qr-actions">
        <button className="gw-back" onClick={onBack}>← Back</button>
        <button className="gw-next" onClick={() => onContinue(proj)}>Got it →</button>
      </div>
    </div>
  );
}

// Full-screen QR viewer: big code, download, and an X to close. Used from the guide's system picker.
function QrZoom({ proj, onClose }) {
  const file = `IOT-TECHS-QR-${(proj.access_id || "system")}.png`;
  return (
    <div className="gw-qrzoom-bg" onClick={(e) => { if (e.target.classList.contains("gw-qrzoom-bg")) onClose(); }}>
      <div className="gw-qrzoom">
        <button className="gw-qrzoom-x" onClick={onClose} aria-label="Close">✕</button>
        <img className="gw-qrzoom-img" src={proj.system_qr} alt="Your System QR code" draggable={false} />
        <div className="gw-qrzoom-name">{proj.customer || proj.access_id}</div>
        <a className="gw-qrzoom-dl" href={proj.system_qr} download={file}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          Save QR
        </a>
      </div>
    </div>
  );
}

// End question: offer to add another person to the system.
// Adding another person = the Annke "share" flow. They install the app, scan your QR, tap
// Apply for Sharing; you approve the request on your phone and pick which cameras to share.
const SHARE_STEPS = [
  { image: "/guides/annke/01.png",       title: "They get the app",   text: "Have them install Annke Vision." },
  { image: "/guides/annke/11.png",       title: "They scan your QR",  text: "They scan your System QR.",           tap: { x: 50, y: 50, w: 58, h: 30 } },
  { image: "/guides/annke/share-01.png", title: "Apply for Sharing",  text: "They tap Apply for Sharing.",         tap: { x: 50, y: 66, w: 70, h: 6 } },
  { image: "/guides/annke/share-02.png", title: "Request sent",       text: "They tap OK.",                        tap: { x: 50, y: 58, w: 40, h: 6 } },
  { art: "notify", title: "Check your phone", text: "A new Share request shows at the top. Tap it." },
  { art: "name",   title: "Pick cameras",     text: "Choose which cameras to share. Done!" },
];

function AddMore({ onDone }) {
  const [mode, setMode] = useState("ask");   // 'ask' | 'share'
  const [j, setJ] = useState(0);
  const [dir, setDir] = useState(1);
  const sstep = SHARE_STEPS[j] || {};
  const slast = j === SHARE_STEPS.length - 1;
  const sgo = (n) => { setDir(n > j ? 1 : -1); setJ(Math.max(0, Math.min(SHARE_STEPS.length - 1, n))); };

  if (mode === "share") {
    return (
      <>
        <div className="gw-head">
          <div className="gw-progresswrap"><div className="gw-progress" style={{ width: `${((j + 1) / SHARE_STEPS.length) * 100}%` }} /></div>
          <div className="gw-dots">
            {SHARE_STEPS.map((_, n) => (
              <button key={n} className={`gw-dot${n === j ? " on" : ""}${n < j ? " past" : ""}`} onClick={() => sgo(n)} aria-label={`Share step ${n + 1}`} />
            ))}
          </div>
        </div>
        <div className="gw-body" key={j} style={{ "--dir": dir }}>
          <PhoneFrame art={sstep.art} image={sstep.image} tap={sstep.tap} />
          <StepText label={`Sharing · ${j + 1} of ${SHARE_STEPS.length}`} step={sstep} />
        </div>
        <div className="gw-foot">
          <button className="gw-back" onClick={() => (j === 0 ? setMode("ask") : sgo(j - 1))}>← Back</button>
          <div className="gw-count">{j + 1} / {SHARE_STEPS.length}</div>
          <button className="gw-next" onClick={() => (slast ? onDone() : sgo(j + 1))}>{slast ? "Done ✓" : "Next →"}</button>
        </div>
      </>
    );
  }
  return (
    <div className="gw-ask">
      <h2 className="gw-ask-q">Add anyone else to the system?</h2>
      <p className="gw-ask-sub">Give family or staff access to view the cameras.</p>
      <div className="gw-choices">
        <button className="gw-choice" onClick={() => { setJ(0); setDir(1); setMode("share"); }}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
          Yes
        </button>
        <button className="gw-choice" onClick={onDone}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>
          No, I'm done
        </button>
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

// ---- Phone-screen content: a real screenshot (step.image) if given, else an animated scene ----
function Scene({ art, image, platform }) {
  const [failed, setFailed] = useState(false);
  // A supplied screenshot wins — but if it hasn't been uploaded yet (404), fall back to the scene.
  if (image && !failed) return <img className="sc-shot" src={image} alt="" draggable={false} onError={() => setFailed(true)} />;
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
        <div className="sc-cap">{platform === "android" ? "Google Play" : "App Store"}</div>
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
.gw-head{padding:40px 26px 0}
.gw-kicker{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:#b08f4f}
.gw-kicker-abs{position:absolute;top:22px;left:26px;z-index:4}
/* intro questions (no phone yet) */
.gw-ask{padding:60px 30px 40px;text-align:center;animation:gwSlide .35s both;--dir:1}
.gw-ask-step{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9aa0ab;margin-bottom:10px}
.gw-ask-q{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.7rem;color:#0e1320;margin:0 0 8px;line-height:1.15}
.gw-ask-sub{font-size:.9rem;color:#5b6472;line-height:1.55;max-width:400px;margin:0 auto 22px}
.gw-choices{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:20px}
.gw-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;width:150px;height:130px;border:1.5px solid #e6e8ee;border-radius:16px;background:#fff;color:#0e1320;font-family:inherit;font-size:.95rem;font-weight:700;cursor:pointer;transition:all .15s}
.gw-choice svg{color:#b08f4f;transition:transform .15s}
.gw-choice:hover{border-color:#C9A96E;background:#faf4e8;transform:translateY(-2px);box-shadow:0 14px 30px -14px rgba(176,143,79,.5)}
.gw-choice:hover svg{transform:scale(1.08)}
.gw-choice.on{border-color:#C9A96E;background:#faf4e8}
.gw-ask-back{margin-top:24px;background:none;border:none;color:#9aa0ab;font-family:inherit;font-size:.85rem;font-weight:600;cursor:pointer}
.gw-ask-back:hover{color:#0e1320}
/* screenshot inside the phone */
.sc-shot{width:100%;height:100%;object-fit:contain;object-position:top center;display:block;background:#fff}
/* "tap here" highlight — the screen dims and a glowing rectangle spotlights the target.
   The huge spread shadow darkens everything OUTSIDE the box (clipped by .gw-screen). */
.gw-tap{position:absolute;transform:translate(-50%,-50%);border-radius:9px;border:2px solid #E8CB94;
  box-shadow:0 0 0 9999px rgba(10,14,22,.55),0 0 18px 4px rgba(201,169,110,.85),inset 0 0 14px rgba(201,169,110,.3);
  pointer-events:none;z-index:5;animation:gwTapGlow 1.6s ease-in-out infinite}
@keyframes gwTapGlow{
  0%,100%{box-shadow:0 0 0 9999px rgba(10,14,22,.55),0 0 14px 3px rgba(201,169,110,.7),inset 0 0 12px rgba(201,169,110,.25)}
  50%    {box-shadow:0 0 0 9999px rgba(10,14,22,.55),0 0 26px 7px rgba(232,203,148,1),inset 0 0 18px rgba(232,203,148,.45)}
}
/* "no QR" → show my System QR */
.gw-qrhelp{padding:44px 30px 30px}
.gw-qr-select{margin:0 auto 16px;display:block;min-width:220px;max-width:100%;height:42px;border:1.5px solid #e6e8ee;border-radius:10px;background:#fff;color:#0e1320;font-family:inherit;font-size:.9rem;padding:0 12px;cursor:pointer}
.gw-qr-card{display:inline-flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#fff;border:1px solid #eef0f4;border-radius:16px;box-shadow:0 14px 34px -16px rgba(0,0,0,.28)}
.gw-qr-tap{border:1px solid #eef0f4;cursor:pointer;font-family:inherit;transition:transform .12s,box-shadow .12s,border-color .12s}
.gw-qr-tap:hover{transform:translateY(-2px);border-color:#C9A96E;box-shadow:0 18px 40px -16px rgba(176,143,79,.5)}
.gw-qr-img{width:220px;height:220px;object-fit:contain;border-radius:8px;background:#fff}
.gw-qr-name{font-size:.85rem;font-weight:700;color:#2C3347}
.gw-qr-hint{font-size:.72rem;font-weight:700;color:#b08f4f}
.gw-qr-actions{display:flex;justify-content:center;gap:12px;margin-top:24px}
/* full-screen QR viewer */
.gw-qrzoom-bg{position:fixed;inset:0;z-index:5000;background:rgba(8,11,20,.8);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px;animation:gwIn .2s ease}
.gw-qrzoom{position:relative;background:#fff;border-radius:20px;padding:26px 28px 22px;max-width:92vw;text-align:center;box-shadow:0 40px 90px rgba(0,0,0,.5)}
.gw-qrzoom-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border:none;border-radius:9px;background:#f0f1f4;color:#5b6472;font-size:1.1rem;cursor:pointer;line-height:1}
.gw-qrzoom-x:hover{background:#e2e5ec;color:#0e1320}
.gw-qrzoom-img{width:min(78vw,360px);height:min(78vw,360px);object-fit:contain;display:block;margin:6px auto 0}
.gw-qrzoom-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.1rem;color:#0e1320;margin-top:8px}
.gw-qrzoom-dl{display:inline-flex;align-items:center;gap:7px;margin-top:14px;height:42px;padding:0 22px;border-radius:11px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:700;font-size:.9rem;text-decoration:none}
.gw-qrzoom-dl:hover{filter:brightness(1.06)}
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
.gw-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.5rem;color:#0e1320;line-height:1.15;margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gw-why-btn{width:24px;height:24px;flex-shrink:0;border-radius:50%;border:1.5px solid #d8c39a;background:#faf4e8;color:#b08f4f;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:.85rem;line-height:1;cursor:pointer;transition:all .12s}
.gw-why-btn:hover,.gw-why-btn.on{background:#C9A96E;color:#fff;border-color:#C9A96E}
.gw-why{margin-top:12px;padding:11px 13px;border-radius:10px;background:#faf4e8;border:1px solid rgba(201,169,110,.35);font-size:.85rem;line-height:1.55;color:#7a5f2a;animation:gwSlide .25s both;--dir:1}
.gw-desc{font-size:.95rem;line-height:1.6;color:#2C3347;margin:0}
.gw-pass{display:inline-block;font-family:Menlo,Consolas,monospace;font-size:1rem;font-weight:700;letter-spacing:.5px;color:#7a5f2a;background:#faf4e8;border:1px solid rgba(201,169,110,.45);border-radius:7px;padding:2px 9px;user-select:all}
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
