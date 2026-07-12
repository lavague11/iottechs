"use client";

import { useState, useEffect } from "react";
import { setSystemQrAction } from "./actions";
import SystemQrModal from "./system-qr-modal";

// System QR — the first step of the install work order. Admin/manager/tech upload a photo of the
// device's QR; the embedded QR Cleaner decodes it, regenerates a clean verified code, and wraps it
// in the branded IOT TECHS card. The finished card is handed back here (postMessage), saved to the
// project, and shown at completion. Customer name is prefilled from the project.
export default function SystemQrTool({ accessId, customerName, systemQr }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(systemQr || null);
  const [viewing, setViewing] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    function onMsg(e) {
      if (e?.data?.type === "iotSystemQr" && e.data.dataUrl) {
        setSaved(e.data.dataUrl);
        setSystemQrAction(accessId, e.data.dataUrl).then((r) => {
          if (r?.ok) { setFlash(true); setTimeout(() => setFlash(false), 2500); }
        });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accessId]);

  const src = `/widgets/qr-cleaner.html?embed=1&project=${encodeURIComponent(accessId)}${customerName ? `&customer=${encodeURIComponent(customerName)}` : ""}`;

  return (
    <div className="pv-tool-panel" style={{ "--tool-c": "#C9A96E" }}>
      <div className="pv-tool-head">
        <button type="button" className="pv-tool-toggle" onClick={() => setOpen((v) => !v)}>
          <span className="pv-tool-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4M17 21h1"/></svg>
          </span>
          <span className="pv-tool-title">System QR</span>
          <span className="pv-tool-sub">Upload the device QR → branded activation card</span>
          {saved && <span className="pv-tool-chip go">Saved</span>}
        </button>
        {saved && <button type="button" className="pv-tool-submit" onClick={() => setViewing(true)}>View</button>}
        <button type="button" className="pv-tool-chev-btn" onClick={() => setOpen((v) => !v)}>{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="pv-tool-body">
          <iframe
            src={src}
            title="System QR"
            style={{ width: "100%", height: 640, border: "none", borderRadius: 10, background: "#0B0F1A" }}
            allow="camera"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            {saved && (
              <button type="button" onClick={() => setViewing(true)}
                style={{ height: 34, padding: "0 16px", border: "none", borderRadius: 8, background: "linear-gradient(180deg,#E8CB94,#C9A96E)", color: "#0B0F1A", fontWeight: 800, fontSize: ".8rem", cursor: "pointer", fontFamily: "inherit" }}>
                View System QR
              </button>
            )}
            {flash && <span style={{ fontSize: ".8rem", fontWeight: 700, color: "#1c8a45" }}>Saved to project ✓</span>}
          </div>
        </div>
      )}
      {viewing && <SystemQrModal src={saved} onClose={() => setViewing(false)} />}
    </div>
  );
}
