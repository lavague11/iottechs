"use client";

import { useState } from "react";

// System QR — the first step of the install work order. Admin/manager/tech upload a photo of the
// device's QR (iPhone HEIC, screen photo, etc.); the embedded QR Cleaner decodes it, regenerates a
// clean verified code, and wraps it in the branded IOT TECHS activation card the customer scans in
// the ANNKE Vision app. Collapsible (default closed) so it doesn't crowd the checklist.
export default function SystemQrTool({ accessId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pv-tool-panel" style={{ "--tool-c": "#C9A96E" }}>
      <div className="pv-tool-head">
        <button type="button" className="pv-tool-toggle" onClick={() => setOpen((v) => !v)}>
          <span className="pv-tool-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4M17 21h1"/></svg>
          </span>
          <span className="pv-tool-title">System QR</span>
          <span className="pv-tool-sub">Upload the device QR → branded, verified activation card</span>
        </button>
        <button type="button" className="pv-tool-chev-btn" onClick={() => setOpen((v) => !v)}>{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="pv-tool-body">
          <iframe
            src={`/widgets/qr-cleaner.html?embed=1&project=${encodeURIComponent(accessId)}`}
            title="System QR"
            style={{ width: "100%", height: 720, border: "none", borderRadius: 10, background: "#0B0F1A" }}
            allow="camera"
          />
        </div>
      )}
    </div>
  );
}
