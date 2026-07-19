"use client";

import { useState, useEffect, useId } from "react";

// A fullscreen, step-by-step walkthrough. Flow: two quick intro questions (which phone? got your
// QR?) BEFORE any phone appears, then the phone-framed steps. Each step shows a real screenshot
// (step.image) if present, otherwise an animated scene (step.art). Generic — any guide article
// renders through this; the intro questions are specific to the mobile-app setup by design.
export default function GuideWalkthrough({ title = "Setup Guide", intro, steps = [], flow = {}, projects = [], projectRef, loggedIn = false, onUnlock, onClose }) {
  // Which extra screens this guide uses. A plain how-to guide turns them all off and is just steps.
  const askPlatform = !!flow.askPlatform;
  const needsSystem = !!flow.needsSystem;
  const wantConsent = !!flow.consent;
  const wantAddMore = !!flow.addMore;
  const hasIntro    = askPlatform || needsSystem;
  const [phase, setPhase]     = useState(hasIntro ? "ask" : "steps");
  const [qi, setQi]           = useState(askPlatform ? 0 : 1);  // 0 = phone, 1 = which system
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
  function next() { if (last) setPhase(wantAddMore ? "add-more" : "done"); else go(i + 1); }
  function back() {
    if (i !== 0) { go(i - 1); return; }
    // Step 1 → back to whichever intro screen this guide actually has.
    if (wantConsent) setPhase("consent");
    else if (hasIntro) { setPhase("ask"); setQi(needsSystem ? 1 : 0); }
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

  function pickPlatform(p) { setPlatform(p); if (needsSystem) setQi(1); else toConsent(null); }
  // System first (its ZIP is the password), then the shared-account notice, then step 1.
  function toConsent(proj) { if (proj) setSystem(proj); if (wantConsent) setPhase("consent"); else startSteps(); }
  function startSteps() { setPhase("steps"); setI(0); setDir(1); }

  return (
    <div className="gw-scrim" onClick={(e) => { if (e.target.classList.contains("gw-scrim")) onClose?.(); }}>
      <style>{CSS}</style>
      <div className="gw-card">
        <button className="gw-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="gw-kicker gw-kicker-abs">{title}</div>

        {phase === "ask" ? (
          <AskFlow qi={qi} askPlatform={askPlatform} needsSystem={needsSystem} platform={platform} projects={projects} projectRef={projectRef} onUnlock={onUnlock} onPlatform={pickPlatform} onContinue={toConsent} onBack={() => setQi(0)} />
        ) : phase === "consent" ? (
          <SharedAccount password={password} onAgree={startSteps} onBack={() => { setPhase("ask"); setQi(1); }} />
        ) : phase === "add-more" ? (
          <AddMore platform={platform} onDone={() => setPhase("done")} />
        ) : phase === "done" ? (
          <Finish title={title} loggedIn={loggedIn} onClose={onClose} onRestart={() => { setPhase(hasIntro ? "ask" : "steps"); setQi(askPlatform ? 0 : 1); setI(0); }} />
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

            <div className={`gw-body${step.device === "monitor" ? " wide" : ""}`} key={i} style={{ "--dir": dir }}>
              <DeviceFrame art={step.art} image={step.image} imageAndroid={step.imageAndroid} tap={step.tap} pattern={step.pattern} device={step.device} platform={platform} href={step.store ? STORE[platform] || STORE.ios : null} />
              <StepText label={`Step ${i + 1} of ${total}`} step={step} password={password} platform={platform} />
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

// Device mockup: a screenshot (or animated scene) + "tap here" highlights, framed as either a
// phone (portrait, app screens) or a monitor (landscape, the recorder's own screen). `tap` is one
// box or an array of them. The dim is a single SVG mask with a hole per box — stacking one shadow
// per box would darken the other holes. Highlight coordinates are percentages, so they survive
// the switch between frames unchanged.
// The G-shape unlock gesture, drawn over a real pattern screen. `pattern` places the 3x3 grid as
// percentages of the screen: {x, y} = grid centre, gap = spacing between dots. A screenshot can
// show where the grid is but not how to drag through it, so the path animates on a loop.
function PatternOverlay({ pattern }) {
  const { x = 50, y = 50, gap = 7, order = [3, 1, 7, 9, 6, 5] } = pattern || {};
  // The viewBox is stretched to the screen's aspect, so x and y percentages aren't the same
  // physical distance — the grid takes a spacing per axis, and dots are ellipses, not circles.
  const gx = pattern?.gapX ?? gap;
  const gy = pattern?.gapY ?? gap;
  const pos = (n) => {
    const col = (n - 1) % 3, row = Math.floor((n - 1) / 3);
    return [x + (col - 1) * gx, y + (row - 1) * gy];
  };
  const d = order.map((n, i) => `${i ? "L" : "M"}${pos(n).join(" ")}`).join(" ");
  return (
    <svg className="gw-patov" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const [cx, cy] = pos(n);
        return <ellipse key={n} cx={cx} cy={cy} rx={gx * 0.3} ry={gy * 0.3} fill="none" stroke="rgba(201,169,110,.5)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
      })}
      <path d={d} className="gw-patov-path" fill="none" stroke="#E8CB94" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {order.map((n, i) => {
        const [cx, cy] = pos(n);
        return <ellipse key={`o${i}`} cx={cx} cy={cy} rx={gx * 0.13} ry={gy * 0.13} fill="#E8CB94" />;
      })}
    </svg>
  );
}

function DeviceFrame({ art, image, imageAndroid, tap, pattern, platform, href, device = "phone" }) {
  // Android screenshots are supplied per step as they're captured; until then the iOS shot stands
  // in, since the Annke app's layout is near-identical across platforms.
  const shot = platform === "android" && imageAndroid ? imageAndroid : image;
  const uid = useId().replace(/:/g, "");
  const taps = !tap ? [] : Array.isArray(tap) ? tap : [tap];
  const isMonitor = device === "monitor";
  // A recorder screen is dense — default the box smaller than a phone's full-width button.
  const box = (t) => ({ w: t.w || (isMonitor ? 30 : 74), h: t.h || (isMonitor ? 8 : 7) });
  // On the "get the app" step the whole mockup is the store link.
  const Frame = href ? "a" : "div";
  const frameProps = href ? { href, target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <Frame className={`${isMonitor ? "gw-monitor" : `gw-phone${platform === "android" ? " android" : ""}`}${href ? " link" : ""}`} {...frameProps}>
      {!isMonitor && (platform === "android"
        ? <div className="gw-phone-hole" />      /* Android: centred punch-hole camera */
        : <div className="gw-phone-notch" />)}
      <div className="gw-screen">
        {/* When a pattern overlay is drawing the grid, the scene must not draw one too — the
            standalone "pattern" art has its own grid at its own coordinates and the two stack. */}
        <Scene art={pattern && art === "pattern" ? "device" : art} image={shot} platform={platform} />
        {pattern && <PatternOverlay pattern={pattern} />}
        {taps.length > 0 && (
          <>
            <svg className="gw-dim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <mask id={`gwm${uid}`}>
                  <rect width="100" height="100" fill="#fff" />
                  {taps.map((t, n) => {
                    const b = box(t);
                    return <rect key={n} x={t.x - b.w / 2} y={t.y - b.h / 2} width={b.w} height={b.h} rx="1" fill="#000" />;
                  })}
                </mask>
              </defs>
              <rect width="100" height="100" fill="rgba(10,14,22,.58)" mask={`url(#gwm${uid})`} />
            </svg>
            {taps.map((t, n) => {
              const b = box(t);
              return (
                <span
                  key={n}
                  className="gw-tap"
                  style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
                  aria-hidden="true"
                />
              );
            })}
          </>
        )}
      </div>
      {isMonitor && <><div className="gw-mon-neck" /><div className="gw-mon-foot" /></>}
    </Frame>
  );
}

// Step caption. {PASSWORD} in the text becomes the system's app password (Cam + ZIP) as a chip with
// a copy button. A step's "why" is always on screen — people skip anything they have to tap for.
function StepText({ label, step, password, platform }) {
  const [copied, setCopied] = useState(false);
  const parts = String(step.text || "").split("{PASSWORD}");
  const store = step.store ? STORE[platform] || STORE.ios : null;

  function copy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(password).then(() => setCopied(true)).catch(() => { legacyCopy(password); setCopied(true); });
    } else { legacyCopy(password); setCopied(true); }
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="gw-text">
      <div className="gw-stepno">{label}</div>
      <h2 className="gw-title">{step.title}</h2>
      <p className="gw-desc">
        {parts.length > 1 ? (
          <>
            {parts[0]}
            <span className="gw-pass-wrap">
              <code className="gw-pass">{password}</code>
              <button className={`gw-copy${copied ? " on" : ""}`} onClick={copy} title="Copy">
                {copied ? "Copied" : "Copy"}
              </button>
            </span>
            {parts[1]}
          </>
        ) : step.text}
      </p>
      {step.store && (
        // Only their own store — showing both just asks them to make a decision they already made
        // at the first question.
        <div className="gw-stores">
          {(() => {
            const os = platform === "android" ? "android" : "ios";
            return (
              <a className="gw-store" href={STORE[os]} target="_blank" rel="noopener noreferrer">
                {os === "ios" ? (
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="none"><path d="M16.4 12.9c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 6 1 8 .6 1 1.4 2 2.4 2s1.3-.6 2.5-.6 1.5.6 2.6.6 1.7-1 2.4-2c.7-1 1-2 1-2.1-.1 0-1.9-.7-1.9-2.7ZM14.6 6.3c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.3 1.2-.5.5-.9 1.4-.8 2.3.9 0 1.8-.5 2.3-1.1Z"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="none"><path d="M3.6 2.2a1 1 0 0 0-.5.9v17.8a1 1 0 0 0 .5.9l9.3-9.8L3.6 2.2ZM14.2 10.5l2.9-3-9.3-5.3a1 1 0 0 0-.4-.1l6.8 8.4ZM14.2 13.5l-6.8 8.4a1 1 0 0 0 .4-.1l9.3-5.3-2.9-3ZM18.3 8.4l-3.2 3.6 3.2 3.6 2.4-1.4a1.3 1.3 0 0 0 0-2.3l-2.4-1.5Z"/></svg>
                )}
                {os === "ios" ? "Open the App Store" : "Open Google Play"}
              </a>
            );
          })()}
        </div>
      )}
      {step.why && <div className="gw-why">{step.why}</div>}
    </div>
  );
}

// Annke Vision store listings. Verified IDs — Annke also ships View / Sight / Home, so a wrong
// link installs the wrong app and nothing in the guide works from step 2 on.
const STORE = {
  ios: "https://apps.apple.com/us/app/annke-vision/id1121463741",
  android: "https://play.google.com/store/apps/details?id=com.anni.annkevision",
};

// Clipboard fallback for insecure origins / in-app browsers where navigator.clipboard is missing.
function legacyCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) { /* the password is on screen either way */ }
}

// Shared-account notice. Shown after the system is picked (its ZIP is the password) and before
// step 1, so the password is a policy they've accepted rather than a surprise demand mid-form.
function SharedAccount({ password, onAgree, onBack }) {
  const [copied, setCopied] = useState(false);

  // Copying is the gate for "I understand", so the unlock can't depend on the clipboard call
  // succeeding — it fails on insecure origins and some in-app browsers, which would trap them.
  // Attempt it, fall back to execCommand, and unlock on the click either way.
  function copy() {
    const done = () => setCopied(true);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(password).then(done).catch(() => { legacyCopy(password); done(); });
    } else {
      legacyCopy(password);
      done();
    }
  }

  return (
    <div className="gw-ask">
      <div className="gw-ask-step">Before you start</div>
      <h2 className="gw-ask-q">We need access for 7 days</h2>
      <div className="gw-sa">
        <p>For the first seven days after your install, our team signs in to the app alongside you to verify the system. During that window we will:</p>
        <ul className="gw-sa-list">
          <li>Check the voltage and power on every camera</li>
          <li>Verify recording and playback on all channels</li>
          <li>Confirm the system is stable and program every feature</li>
        </ul>
        <p>That is why we set the password together — so you never hand us a private one. After the seven days, you are more than welcome to change the password.</p>
      </div>
      <div className="gw-sa-pass">
        <span className="gw-sa-lbl">Your password</span>
        <code className="gw-pass">{password}</code>
        <button className={`gw-copy big${copied ? " on" : " nudge"}`} onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
        {!copied && (
          <span className="gw-point" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
            Tap to copy
          </span>
        )}
      </div>
      <div className="gw-qr-actions">
        <button className="gw-back" onClick={onBack}>← Back</button>
        <button className="gw-next" onClick={onAgree} disabled={!copied} title={copied ? "" : "Copy the password first"}>
          I understand →
        </button>
      </div>
    </div>
  );
}

// Two intro screens before the phone: which platform, then which system (shows that system's QR).
function AskFlow({ qi, askPlatform, needsSystem, platform, projects, projectRef, onUnlock, onPlatform, onContinue, onBack }) {
  const nQ = (askPlatform ? 1 : 0) + (needsSystem ? 1 : 0);
  const shown = askPlatform ? qi + 1 : 1;
  return (
    <div className="gw-ask" key={qi}>
      <div className="gw-ask-step">{nQ > 1 ? `Step ${shown} of ${nQ}` : "Before you start"}</div>
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
        <SystemPicker projects={projects} projectRef={projectRef} onUnlock={onUnlock} onContinue={onContinue} onBack={onBack} />
      )}
    </div>
  );
}

// "Which system?" — list the customer's systems, show the picked one's QR. No system → contact us.
function SystemPicker({ projects = [], onContinue, onBack, onUnlock, projectRef }) {
  const [found, setFound] = useState([]);          // systems unlocked here with an ID + PIN
  const all = [...(projects || []), ...found];
  const withQr = all.filter((p) => p.system_qr);
  const [sel, setSel] = useState(withQr[0]?.access_id || "");
  const proj = withQr.find((p) => p.access_id === sel) || withQr[0];

  // Nothing to show and an unlock path available → ask for the project ID + PIN. This is the
  // public-link case: the steps are open to anyone, but the QR needs the project's credentials.
  if (withQr.length === 0 && onUnlock) {
    return <QrUnlock projectRef={projectRef} onUnlock={onUnlock} onFound={(p) => { setFound([p]); setSel(p.access_id); }} onBack={onBack} />;
  }

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
      <p className="gw-ask-sub">Pick your system, then save the QR to your photos — you’ll need it near the end.</p>
      {withQr.length > 1 && (
        <select className="gw-qr-select" value={sel} onChange={(e) => setSel(e.target.value)}>
          {withQr.map((p) => <option key={p.access_id} value={p.access_id}>{p.customer || p.access_id}</option>)}
        </select>
      )}
      {proj && (
        <>
          {/* A download link, not a lightbox — step 10 asks them to pick this from their Album,
              so getting it into their photos is the whole point of this screen. */}
          <a
            className="gw-qr-card gw-qr-tap"
            href={proj.system_qr}
            download={`IOT-TECHS-QR-${proj.access_id || "system"}.png`}
            title="Tap to save"
          >
            <img className="gw-qr-img" src={proj.system_qr} alt="Your System QR code" draggable={false} />
            <div className="gw-qr-name">{proj.customer || proj.access_id}</div>
            <div className="gw-qr-hint">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              Tap to save
            </div>
          </a>
          <p className="gw-qr-note">On iPhone you can also press and hold the code, then choose “Save to Photos.”</p>
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
// Project ID + PIN gate for the QR on the public guide. Same credentials as the project page —
// this doesn't create a new way in, it just asks for the existing one at the point of need.
function QrUnlock({ projectRef, onUnlock, onFound, onBack }) {
  const [ref, setRef]   = useState(projectRef || "");
  const [pin, setPin]   = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  const MSG = {
    no_project: "We couldn't find that project. Check the ID and try again.",
    wrong_pin:  "That PIN doesn't match. Try again.",
    no_pin:     "This project has no PIN set yet — please contact support.",
    no_qr:      "This system doesn't have a QR code yet — please contact support.",
  };

  async function submit(e) {
    e.preventDefault();
    if (!ref.trim() || !pin.trim()) return;
    setBusy(true); setErr("");
    const r = await onUnlock(ref.trim(), pin.trim());
    setBusy(false);
    if (r?.ok) onFound(r.project);
    else setErr(MSG[r?.error] || "Something went wrong. Try again.");
  }

  return (
    <div className="gw-qrhelp">
      <h2 className="gw-ask-q">Find your system</h2>
      <p className="gw-ask-sub">Enter your Project ID and PIN to pull up your QR code. They’re on your welcome card.</p>
      <form className="gw-unlock" onSubmit={submit}>
        <input className="gw-unlock-in" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Project ID (or last 4)" autoComplete="off" autoFocus={!projectRef} />
        <input className="gw-unlock-in" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" inputMode="numeric" autoComplete="off" autoFocus={!!projectRef} />
        {err && <div className="gw-unlock-err">{err}</div>}
        <div className="gw-qr-actions">
          <button type="button" className="gw-back" onClick={onBack}>← Back</button>
          <button type="submit" className="gw-next" disabled={busy || !ref.trim() || !pin.trim()}>{busy ? "Checking…" : "Show my QR →"}</button>
        </div>
      </form>
    </div>
  );
}

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
  { image: "/guides/annke/share-03.png", title: "Check your phone", text: "“You have 1 new sharing” appears at the top. Tap it.", tap: { x: 50, y: 13, w: 97, h: 5 } },
  { image: "/guides/annke/share-04.png", title: "Check the number", text: "Make sure the number is theirs, then tap the system to choose cameras.",
    tap: [{ x: 50, y: 25, w: 92, h: 5 }, { x: 50, y: 18, w: 92, h: 6 }],
    why: "Only accept a request from a number you recognise. Accepting gives that person live view of your cameras." },
  { image: "/guides/annke/share-05.png", title: "Pick cameras",     text: "Tick the cameras to share, then tap Finish.", tap: [{ x: 50, y: 16, w: 60, h: 4 }, { x: 50, y: 95, w: 92, h: 5 }] },
  { image: "/guides/annke/share-04.png", title: "Accept",           text: "You’re back here. Tap Accept — they’re in.", tap: { x: 75, y: 34, w: 48, h: 5 } },
];

function AddMore({ platform, onDone }) {
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
          <DeviceFrame art={sstep.art} image={sstep.image} imageAndroid={sstep.imageAndroid} tap={sstep.tap} pattern={sstep.pattern} device={sstep.device} platform={platform} />
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

function Finish({ title, onClose, onRestart, loggedIn }) {
  return (
    <div className="gw-finish">
      <div className="gw-burst">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      </div>
      <h2>All done!</h2>
      <p>You&rsquo;ve finished {title}. You can revisit this guide anytime from Support.</p>
      <div className="gw-finish-btns">
        <button className="gw-back" onClick={onRestart}>&#8634; Start over</button>
        {/* Signed-in people go back to the library they came from; a visitor on a texted link has
            no library to return to, so they just close. */}
        {loggedIn
          ? <a className="gw-next" href="/support" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Support library</a>
          : <button className="gw-next" onClick={onClose}>Done</button>}
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
    // The admin unlock pattern: a 3x3 grid with the G-shape (3→1→7→9→6→5) drawing itself on a
    // loop. This one can't be a screenshot — the gesture is the instruction.
    case "pattern": {
      const P = { 1: [22, 22], 2: [50, 22], 3: [78, 22], 4: [22, 50], 5: [50, 50], 6: [78, 50], 7: [22, 78], 8: [50, 78], 9: [78, 78] };
      const order = [3, 1, 7, 9, 6, 5];
      const d = order.map((n, i) => `${i ? "L" : "M"}${P[n][0]} ${P[n][1]}`).join(" ");
      return (
        <div className="sc sc-pattern">
          <svg viewBox="0 0 100 100" className="sc-pat-svg">
            <path d={d} fill="none" stroke="#C9A96E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sc-pat-path" />
            {Object.entries(P).map(([n, [x, y]]) => (
              <g key={n}>
                <circle cx={x} cy={y} r="7" fill="none" stroke={order.includes(Number(n)) ? "#C9A96E" : "#3a4356"} strokeWidth="2" />
                <circle cx={x} cy={y} r="2.6" fill={order.includes(Number(n)) ? "#C9A96E" : "#3a4356"} />
                <text x={x} y={y - 11} textAnchor="middle" fontSize="7" fill="#6f7686">{n}</text>
              </g>
            ))}
          </svg>
          <div className="sc-cap">3 → 1 → 7 → 9 → 6 → 5</div>
        </div>
      );
    }
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
.sc-pattern{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%;height:100%;background:#12172a}
.sc-pat-svg{width:min(230px,72%);height:auto}
.sc-pat-path{stroke-dasharray:260;stroke-dashoffset:260;animation:scPat 3.2s ease-in-out infinite}
@keyframes scPat{0%{stroke-dashoffset:260}55%,85%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}
.gw-patov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;filter:drop-shadow(0 0 4px rgba(201,169,110,.9))}
.gw-patov-path{stroke-dasharray:600;stroke-dashoffset:600;animation:gwPatDraw 3.4s ease-in-out infinite}
@keyframes gwPatDraw{0%{stroke-dashoffset:600}45%,80%{stroke-dashoffset:0}95%,100%{stroke-dashoffset:0;opacity:0}}
.gw-dim{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4}
.gw-tap{position:absolute;transform:translate(-50%,-50%);border-radius:9px;border:2px solid #E8CB94;
  pointer-events:none;z-index:5;animation:gwTapGlow 1.6s ease-in-out infinite}
@keyframes gwTapGlow{
  0%,100%{box-shadow:0 0 14px 3px rgba(201,169,110,.7),inset 0 0 12px rgba(201,169,110,.25)}
  50%    {box-shadow:0 0 26px 7px rgba(232,203,148,1),inset 0 0 18px rgba(232,203,148,.45)}
}
/* "no QR" → show my System QR */
.gw-qrhelp{padding:44px 30px 30px}
.gw-qr-select{margin:0 auto 16px;display:block;min-width:220px;max-width:100%;height:42px;border:1.5px solid #e6e8ee;border-radius:10px;background:#fff;color:#0e1320;font-family:inherit;font-size:.9rem;padding:0 12px;cursor:pointer}
.gw-qr-card{display:inline-flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#fff;border:1px solid #eef0f4;border-radius:16px;box-shadow:0 14px 34px -16px rgba(0,0,0,.28)}
.gw-qr-tap{border:1px solid #eef0f4;cursor:pointer;font-family:inherit;transition:transform .12s,box-shadow .12s,border-color .12s}
.gw-qr-tap:hover{transform:translateY(-2px);border-color:#C9A96E;box-shadow:0 18px 40px -16px rgba(176,143,79,.5)}
.gw-qr-img{width:min(300px,72vw);height:min(300px,72vw);object-fit:contain;border-radius:8px;background:#fff}
.gw-qr-name{font-size:.85rem;font-weight:700;color:#2C3347}
.gw-qr-hint{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 16px;border-radius:9px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-size:.8rem;font-weight:800}
.gw-qr-card:hover .gw-qr-hint{filter:brightness(1.06)}
.gw-qr-note{margin:10px auto 0;max-width:340px;font-size:.76rem;line-height:1.5;color:#6f7686}
.gw-unlock{display:flex;flex-direction:column;gap:10px;max-width:320px;margin:0 auto}
.gw-unlock-in{height:46px;padding:0 14px;border:1.5px solid #e6e8ee;border-radius:11px;font-size:1rem;font-family:inherit;color:#0e1320;text-align:center;background:#fff}
.gw-unlock-in:focus{outline:none;border-color:#C9A96E}
.gw-unlock-err{padding:9px 12px;border-radius:9px;background:#fdecec;border:1px solid #f2c4c4;color:#a3312d;font-size:.82rem;font-weight:600}
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
/* The reason is always on screen and red — it's an instruction, not a footnote. */
.gw-why{margin-top:12px;padding:11px 13px;border-radius:10px;background:#fdecec;border:1px solid #f2c4c4;font-size:.85rem;line-height:1.55;color:#a3312d;font-weight:600}
.gw-pass-wrap{display:inline-flex;align-items:center;gap:6px;vertical-align:middle}
.gw-sa{max-width:440px;margin:0 auto;text-align:left}
.gw-sa p{font-size:.92rem;line-height:1.6;color:#2C3347;margin:0 0 10px}
.gw-sa-list{margin:0 0 12px;padding:0;list-style:none}
.gw-sa-list li{position:relative;padding:0 0 0 24px;margin-bottom:7px;font-size:.92rem;line-height:1.55;color:#2C3347}
.gw-sa-list li::before{content:"";position:absolute;left:6px;top:.62em;width:6px;height:6px;border-radius:50%;background:#C9A96E}
.gw-sa-pass{display:flex;align-items:center;justify-content:center;gap:9px;margin:18px auto 0;padding:14px 18px;max-width:440px;border-radius:12px;background:#fdecec;border:1px solid #f2c4c4}
.gw-sa-lbl{font-size:.78rem;font-weight:800;color:#a3312d;text-transform:uppercase;letter-spacing:.4px}
.gw-sa-pass{flex-wrap:wrap}
/* Copying is required before continuing, so the button pulses until they do. */
.gw-copy.big{height:34px;padding:0 16px;font-size:.84rem}
.gw-copy.nudge{background:linear-gradient(135deg,#C9A96E,#b08f4f);border-color:#b08f4f;color:#fff;animation:gwCopyPulse 1.5s ease-in-out infinite}
@keyframes gwCopyPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,.55);transform:scale(1)}
  50%    {box-shadow:0 0 0 8px rgba(201,169,110,0);transform:scale(1.06)}
}
.gw-point{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;font-weight:700;color:#b08f4f;animation:gwPoint 1.5s ease-in-out infinite}
@keyframes gwPoint{0%,100%{transform:translateX(0)}50%{transform:translateX(-5px)}}
.gw-next:disabled{opacity:.4;cursor:not-allowed;filter:grayscale(.5)}
.gw-stores{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.gw-store{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 20px;border-radius:11px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:800;font-size:.88rem;text-decoration:none}
.gw-store:hover{filter:brightness(1.06)}
.gw-store.alt{background:#fff;border:1.5px solid #e6e0d4;color:#6f7686}
.gw-store.alt:hover{border-color:#C9A96E;color:#b08f4f;filter:none}
.gw-phone.link{display:flex;text-decoration:none;transition:transform .14s}
.gw-phone.link:hover{transform:translateY(-3px)}
.gw-copy{height:26px;padding:0 10px;border:1px solid rgba(201,169,110,.5);border-radius:7px;background:#fff;color:#7a5f2a;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.gw-copy:hover{background:#faf4e8}
.gw-copy.on{background:#e7f6ec;border-color:#2f7d5a;color:#1c8a45}
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
/* Android frame: squarer corners, thinner bezel, punch-hole selfie camera instead of a notch. */
.gw-phone.android{border-radius:22px;padding:8px}
.gw-phone.android .gw-screen{border-radius:16px}
.gw-phone-hole{position:absolute;top:15px;left:50%;transform:translateX(-50%);width:9px;height:9px;border-radius:50%;background:#0b0f18;box-shadow:0 0 0 1.5px rgba(255,255,255,.07);z-index:3}
/* Monitor frame — the recorder's own screen. Landscape 16:9 with a bezel, neck and foot, so a
   customer instantly knows "this is the box on the wall", not their phone. */
.gw-monitor{position:relative;width:100%;max-width:420px;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.gw-monitor .gw-screen{width:100%;aspect-ratio:16/9;flex:none;border-radius:6px;background:#0b0f18;border:9px solid #161b26;box-shadow:0 20px 46px -14px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.06)}
.gw-mon-neck{width:52px;height:18px;background:linear-gradient(180deg,#161b26,#11151f)}
.gw-mon-foot{width:132px;height:9px;border-radius:0 0 7px 7px;background:linear-gradient(180deg,#161b26,#0b0f18);box-shadow:0 6px 14px -6px rgba(0,0,0,.6)}
/* A landscape screen needs the full width, so the caption drops underneath instead of beside. */
.gw-body.wide{grid-template-columns:1fr;gap:18px;justify-items:center}
.gw-body.wide .gw-text{text-align:center;max-width:520px}
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
