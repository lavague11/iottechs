"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "../components/admin-shell";
import FaceScan from "../components/face-scan";
import { Wordmark } from "../components/brand";

// Self-service enrolment: consent → scan ID → capture face → cross-match → store.
// The face engine is warmed on mount so the model download isn't in the critical
// path when the user taps "Capture". Photos + embeddings post to /api/enroll,
// which keys them to the signed-in user and re-checks the ID↔face match server-side.
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

function loadOnce(src, id) {
  return new Promise((res) => {
    if (document.getElementById(id)) return res();
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => res();
    document.head.appendChild(s);
  });
}
function fileToImage(file) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
}
function downscaleToDataUrl(img, maxEdge = 1600, q = 0.9) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

export default function EnrollClient({ user, alerts, current, invite }) {
  const [step, setStep]       = useState(current?.status === "verified" ? "done" : "consent");
  const [consent, setConsent] = useState(false);
  const [idType, setIdType]   = useState(current?.id_type === "passport" ? "passport" : "drivers_license");
  const [idImage, setIdImage] = useState(null);
  const [idEmbed, setIdEmbed] = useState(null);
  const [idFields, setIdFields] = useState(null);
  const [idVerdict, setIdVerdict] = useState(null);
  const [idBusy, setIdBusy]   = useState(false);
  const [idNote, setIdNote]   = useState("");
  const [faceState, setFaceState] = useState("idle");
  const [faceImage, setFaceImage] = useState(null);
  const [faceEmbed, setFaceEmbed] = useState(null);
  const [matchScore, setMatchScore] = useState(null);
  const [engineMsg, setEngineMsg] = useState("Warming up…");
  const [camReady, setCamReady] = useState(false);
  const [camErr, setCamErr]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const [result, setResult]   = useState(current?.status === "verified" ? { status: "verified" } : null);

  const idFileRef = useRef(null);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  // Warm the engines on mount — the big perceived-speed win.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([loadOnce("/face-engine.js", "iot-face-js"), loadOnce("/barcode-reader.js", "iot-barcode-js")]);
      try { await window.IOTFace?.ready(); } catch {}
      if (alive) setEngineMsg(window.IOTFace?.status().ready ? "" : "Face engine unavailable — try again on a supported browser.");
    })();
    return () => { alive = false; stopCam(); };
  }, []);

  function stopCam() {
    const s = streamRef.current; if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setCamReady(false);
  }
  async function startCam() {
    setCamErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      streamRef.current = s;
      const v = videoRef.current;
      if (v) { v.srcObject = s; await v.play().catch(() => {}); setCamReady(true); }
    } catch (e) { setCamErr("Camera blocked. Allow camera access, or use a device with a front camera."); }
  }

  async function pickId(e) {
    const file = e.target.files?.[0]; if (idFileRef.current) idFileRef.current.value = "";
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) { setIdNote("Use a JPG, PNG or WEBP photo."); return; }
    setIdBusy(true); setIdNote("Reading…"); setIdEmbed(null);
    try {
      const img = await fileToImage(file);
      const dataUrl = downscaleToDataUrl(img, 1600);
      setIdImage(dataUrl);
      const emb = await window.IOTFace.embed(img);
      if (!emb) { setIdNote("No face found on that ID — get the portrait fully in frame, avoid glare."); setIdBusy(false); return; }
      setIdEmbed(emb);
      setIdNote("Portrait captured ✓");
      // Best-effort: read the printed fields (non-blocking).
      try {
        const b64 = dataUrl.split(",")[1];
        const res = await fetch("/api/verify-document", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frontImageBase64: b64, mediaType: "image/jpeg" }),
        });
        if (res.ok) { const j = await res.json(); setIdFields(j.fields || null); setIdVerdict({ status: j.status, blockers: j.blockers, expiry: j.expiry }); }
      } catch {}
    } catch (e) { setIdNote("Couldn't read that photo."); }
    setIdBusy(false);
  }

  async function goFace() { setStep("face"); setTimeout(startCam, 60); }

  async function capture() {
    if (!camReady || faceState === "scanning") return;
    setErr(""); setFaceState("scanning");
    const v = videoRef.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    const emb = await window.IOTFace.embed(c);
    if (!emb) { setFaceState("fail"); setErr("No face detected — center your face and try again."); return; }
    const faceUrl = c.toDataURL("image/jpeg", 0.9);
    setFaceImage(faceUrl); setFaceEmbed(emb);
    let score = null;
    if (idEmbed && idEmbed.kind === emb.kind && idEmbed.vec.length === emb.vec.length) {
      score = window.IOTFace.cosine(idEmbed.vec, emb.vec); setMatchScore(score);
    }
    setFaceState(score == null || score >= 0.34 ? "ok" : "fail");
  }

  async function submit() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/enroll", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true, consent_version: "v1", id_type: idType, token: invite?.token,
          id_image: idImage, id_embedding: idEmbed, id_fields: idFields, id_verdict: idVerdict,
          face_image: faceImage, face_embedding: faceEmbed, enroll_score: matchScore,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || "Enrolment failed."); setBusy(false); return; }
      stopCam(); setResult(j); setStep("done");
    } catch (e) { setErr("Connection error — try again."); }
    setBusy(false);
  }

  const idName = idType === "passport" ? "passport" : "driver's licence";

  const body = (
    <>
      <style>{CSS}</style>
      <div className="apx-wrap enr">
        <div className="welcome">
          <h1>Face <em>Enrollment</em></h1>
          <p className="enr-sub">
            {invite ? `Hi${invite.name ? " " + invite.name.split(" ")[0] : ""} — verify your account` : "Verify your account"} with your {idName} and a face scan. Your photos are encrypted; only you and an admin can ever access them. You can remove them anytime.
          </p>
        </div>

        {engineMsg && step !== "done" && <div className="enr-warm">{engineMsg}</div>}

        <div className="enr-steps">
          {["consent", "id", "face", "done"].map((s, i) => (
            <div key={s} className={`enr-pip${step === s ? " on" : ""}${["consent","id","face","done"].indexOf(step) > i ? " done" : ""}`}>
              <span>{i + 1}</span>{["Consent", "Your ID", "Face", "Done"][i]}
            </div>
          ))}
        </div>

        {step === "consent" && (
          <div className="enr-card">
            <p className="enr-p">We&rsquo;ll store an encrypted copy of your {idName} and a face image, used only to verify it&rsquo;s you when you sign in. We never sell it, and you can delete it whenever you want.</p>
            <label className="enr-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I consent to face &amp; ID verification for my account.</span>
            </label>
            <button className="enr-btn" disabled={!consent} onClick={() => setStep("id")}>Continue</button>
          </div>
        )}

        {step === "id" && (
          <div className="enr-card">
            <h2>Scan your ID</h2>
            <div className="enr-idtype">
              {[["drivers_license", "Driver's licence"], ["passport", "Passport"]].map(([v, l]) => (
                <button key={v} className={`enr-chip${idType === v ? " on" : ""}`} onClick={() => setIdType(v)}>{l}</button>
              ))}
            </div>
            <input ref={idFileRef} type="file" accept="image/*" capture="environment" hidden onChange={pickId} />
            {idImage ? (
              <div className="enr-idshot">
                <img src={idImage} alt="ID" />
                <div>
                  <div className={`enr-idnote${idEmbed ? " ok" : ""}`}>{idBusy ? "Reading…" : idNote}</div>
                  {idFields?.first_name && <div className="enr-idmeta">{[idFields.first_name, idFields.last_name].filter(Boolean).join(" ")}{idFields.expiry_date ? ` · exp ${idFields.expiry_date}` : ""}</div>}
                  <button className="enr-mini" onClick={() => idFileRef.current?.click()}>Retake</button>
                </div>
              </div>
            ) : (
              <button className="enr-drop" onClick={() => idFileRef.current?.click()}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="4"/></svg>
                <span>Photograph or upload your {idName}</span>
              </button>
            )}
            <div className="enr-row2">
              <button className="enr-btn ghost" onClick={() => setStep("consent")}>Back</button>
              <button className="enr-btn" disabled={!idEmbed} onClick={goFace}>Continue</button>
            </div>
          </div>
        )}

        {step === "face" && (
          <div className="enr-card">
            <h2>Capture your face</h2>
            <div className="enr-facewrap">
              <video ref={videoRef} className="enr-video" playsInline muted />
              <div className="enr-facescan"><FaceScan state={faceState} size={140} /></div>
            </div>
            {camErr && <div className="enr-err">{camErr}</div>}
            {matchScore != null && (
              <div className={`enr-match ${faceState === "ok" ? "ok" : "bad"}`}>
                {faceState === "ok" ? "Matches your ID ✓" : "Doesn't match your ID closely enough — retake, or continue to save for review."}
              </div>
            )}
            {err && <div className="enr-err">{err}</div>}
            <div className="enr-row2">
              <button className="enr-btn ghost" onClick={() => { stopCam(); setFaceState("idle"); setFaceEmbed(null); setMatchScore(null); setStep("id"); }}>Back</button>
              {!faceEmbed
                ? <button className="enr-btn" disabled={!camReady || faceState === "scanning"} onClick={capture}>{faceState === "scanning" ? "Scanning…" : "Capture"}</button>
                : <>
                    <button className="enr-btn ghost" onClick={() => { setFaceEmbed(null); setFaceImage(null); setMatchScore(null); setFaceState("idle"); }}>Retake</button>
                    <button className="enr-btn" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Finish enrollment"}</button>
                  </>}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="enr-card enr-done">
            <div className={`enr-badge ${result?.status === "verified" ? "ok" : "pend"}`}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {result?.status === "verified" ? <path d="M20 6 9 17l-5-5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>}
              </svg>
            </div>
            <h2>{result?.status === "verified" ? "You're verified" : "Saved for review"}</h2>
            <p className="enr-p">{result?.message || (result?.status === "verified"
              ? "Your face and ID are on file. Face ID sign-in is now enabled for your account."
              : "An admin will review your enrollment shortly.")}</p>
            <button className="enr-btn ghost" onClick={() => { setResult(null); setStep("consent"); setIdImage(null); setIdEmbed(null); setFaceEmbed(null); setFaceImage(null); setMatchScore(null); setConsent(false); }}>Re-enroll</button>
          </div>
        )}
      </div>
    </>
  );

  if (invite) {
    return (
      <div className="apx enr-standalone" style={{ minHeight: "100vh" }}>
        <div className="enr-topbar"><a href="/" aria-label="IOT TECHS"><Wordmark height={24} /></a></div>
        {body}
      </div>
    );
  }
  return <AdminShell user={user} alerts={alerts} active="enroll">{body}</AdminShell>;
}

const CSS = `
.apx .enr-sub{color:var(--muted);font-size:.9rem;margin-top:4px;max-width:74ch;line-height:1.55}
.apx .enr-warm{margin:14px 0 0;font-size:.82rem;color:#8a5f00;background:#fef8ec;border:1px solid #f0dfb5;border-radius:10px;padding:8px 12px}
.apx .enr-steps{display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap}
.apx .enr-pip{display:flex;align-items:center;gap:7px;font-size:.78rem;font-weight:700;color:var(--muted)}
.apx .enr-pip span{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:.72rem;border:1.5px solid var(--line);background:#fff}
.apx .enr-pip.on{color:var(--ink)}.apx .enr-pip.on span{border-color:#C9A96E;background:#C9A96E;color:#fff}
.apx .enr-pip.done span{border-color:#1c8a45;background:#1c8a45;color:#fff}
.apx .enr-card{margin-top:16px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 22px 20px;max-width:560px}
.apx .enr-card h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;margin:0 0 8px}
.apx .enr-p{color:var(--muted);font-size:.9rem;line-height:1.55;margin:0 0 14px}
.apx .enr-consent{display:flex;align-items:flex-start;gap:10px;font-size:.9rem;font-weight:600;margin:8px 0 18px;cursor:pointer}
.apx .enr-consent input{margin-top:2px;width:18px;height:18px;accent-color:#C9A96E}
.apx .enr-btn{height:44px;padding:0 22px;border:none;border-radius:11px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-weight:800;font-size:.9rem;font-family:inherit;cursor:pointer}
.apx .enr-btn:disabled{opacity:.5;cursor:default}
.apx .enr-btn.ghost{background:#fff;border:1.5px solid var(--line);color:var(--ink)}
.apx .enr-row2{display:flex;gap:10px;margin-top:18px}
.apx .enr-idtype{display:flex;gap:8px;margin-bottom:14px}
.apx .enr-chip{padding:8px 15px;border:1.5px solid var(--line);border-radius:100px;background:#fff;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit;color:var(--muted)}
.apx .enr-chip.on{border-color:#C9A96E;background:#fdf8ee;color:var(--ink)}
.apx .enr-drop{width:100%;display:flex;flex-direction:column;align-items:center;gap:9px;padding:30px;border:1.5px dashed var(--line);border-radius:12px;background:var(--bg-soft,#faf9f7);color:var(--muted);font-weight:600;font-size:.9rem;cursor:pointer;font-family:inherit}
.apx .enr-drop:hover{border-color:#C9A96E;color:var(--ink)}
.apx .enr-idshot{display:flex;gap:14px;align-items:flex-start}
.apx .enr-idshot img{width:150px;height:95px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.apx .enr-idnote{font-size:.86rem;font-weight:700;color:var(--muted)}
.apx .enr-idnote.ok{color:#1c8a45}
.apx .enr-idmeta{font-size:.8rem;color:var(--muted);margin-top:4px}
.apx .enr-mini{margin-top:8px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;color:var(--muted)}
.apx .enr-facewrap{position:relative;width:100%;max-width:340px;aspect-ratio:4/3;margin:0 auto;border-radius:14px;overflow:hidden;background:#0B0F1A}
.apx .enr-video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.apx .enr-facescan{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.apx .enr-match{margin-top:12px;font-size:.86rem;font-weight:700;padding:9px 12px;border-radius:10px}
.apx .enr-match.ok{color:#1c6b3a;background:#eaf6ee}
.apx .enr-match.bad{color:#8a5f00;background:#fef8ec}
.apx .enr-err{margin-top:12px;font-size:.85rem;color:#c0392b;background:#fbeeec;border-radius:10px;padding:9px 12px}
.apx .enr-done{text-align:center;display:flex;flex-direction:column;align-items:center}
.apx .enr-badge{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin-bottom:8px}
.apx .enr-badge.ok{background:#eaf6ee;color:#1c8a45}
.apx .enr-badge.pend{background:#fef8ec;color:#8a5f00}
.apx.enr-standalone{background:radial-gradient(1100px 500px at 50% -10%,#f4f5f8,#eceef3)}
.apx .enr-topbar{display:flex;justify-content:center;padding:22px 16px 2px}
`;
