"use client";

import { useState, useEffect } from "react";
import { setSystemQrAction } from "./actions";
import SystemQrModal from "./system-qr-modal";

// Minimal System QR step. One row: red "Upload" until a card exists, green "View" after.
// Upload opens the compact QR Cleaner; once it produces a verified card we save it and flip to
// green. View pops the card full-screen. Customer name is prefilled from the project.
export default function SystemQrTool({ accessId, customerName, systemQr }) {
  const [saved, setSaved] = useState(systemQr || null);
  const [mode, setMode] = useState("idle");   // idle | upload
  const [viewing, setViewing] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    function onMsg(e) {
      if (e?.data?.type === "iotSystemQr" && e.data.dataUrl) {
        setSaved(e.data.dataUrl);
        setMode("idle");                       // collapse the uploader once we have a card
        setSystemQrAction(accessId, e.data.dataUrl).then((r) => {
          if (r?.ok) { setFlash(true); setTimeout(() => setFlash(false), 2500); }
        });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

  const src = `/widgets/qr-cleaner.html?embed=1&project=${encodeURIComponent(accessId)}${customerName ? `&customer=${encodeURIComponent(customerName)}` : ""}`;
  const accent = saved ? "#2f7d5a" : "#C9A96E";

  return (
    <div className="sqp" style={{ "--sq": accent }}>
      <div className="sqp-head">
        <span className="sqp-ic" style={{ background: saved ? "#e7f6ec" : "#f8f0e0", color: saved ? accent : "#8a6d2f" }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4M17 21h1"/></svg>
        </span>
        <div className="sqp-tt">
          <span className="sqp-title">System QR</span>
          <span className="sqp-sub">{saved ? "Activation card ready" : "Upload the device QR to generate the card"}</span>
        </div>
        {flash && <span className="sqp-flash">Saved ✓</span>}
        {mode === "upload" ? (
          <button type="button" className="sqp-btn ghost" onClick={() => setMode("idle")}>Close</button>
        ) : saved ? (
          <>
            <button type="button" className="sqp-btn view" onClick={() => setViewing(true)}>View</button>
            <button type="button" className="sqp-replace" title="Replace" onClick={() => setMode("upload")}>↻</button>
          </>
        ) : (
          <button type="button" className="sqp-btn upload" onClick={() => setMode("upload")}>Upload</button>
        )}
      </div>

      {mode === "upload" && (
        <div className="sqp-body">
          <iframe src={src} title="System QR" className="sqp-frame" allow="camera" />
        </div>
      )}

      {viewing && <SystemQrModal src={saved} onClose={() => setViewing(false)} />}

      <style>{`
        /* Match the FlowStep bare cards exactly (.flow-bare-head): same padding, icon, border, radius
           — so the whole install flow reads as one uniform stack of rows. */
        .sqp{border:1px solid #d9d4ca;border-left:3px solid var(--sq);border-radius:12px;background:#fff;margin:0;overflow:hidden;font-family:inherit}
        .sqp-head{display:flex;align-items:center;gap:10px;padding:11px 16px}
        .sqp-ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex-shrink:0}
        .sqp-tt{display:flex;flex-direction:column;min-width:0;flex:1}
        .sqp-title{font-weight:800;font-size:.9rem;color:#0B0F1A}
        .sqp-sub{font-size:.76rem;color:#6f7686}
        .sqp-flash{font-size:.76rem;font-weight:800;color:#1c8a45;white-space:nowrap}
        .sqp-btn{height:30px;padding:0 16px;border:none;border-radius:8px;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit;color:#fff;white-space:nowrap}
        .sqp-btn.upload{background:#C9A96E;color:#0B0F1A}
        .sqp-btn.view{background:#2f7d5a}
        .sqp-btn.ghost{background:#fff;border:1px solid #d9d4ca;color:#41485a}
        .sqp-btn:hover{filter:brightness(1.06)}
        .sqp-replace{width:30px;height:30px;flex-shrink:0;border:1px solid #d9d4ca;border-radius:8px;background:#fff;color:#6f7686;cursor:pointer;font-size:.9rem;line-height:1}
        .sqp-replace:hover{border-color:#2f7d5a;color:#2f7d5a}
        .sqp-body{border-top:1px solid #eee}
        .sqp-frame{width:100%;height:640px;border:none;background:#0B0F1A;display:block}
      `}</style>
    </div>
  );
}
