"use client";

import { useState } from "react";
import GuideWalkthrough from "../../support/guide-walkthrough";
import { unlockGuideQrAction } from "./actions";

// Standalone host for the walkthrough. On the Support page the guide opens as an overlay over the
// admin shell; here it IS the page, so closing it shows a restart card rather than nothing.
export default function GuidePageClient({ title, steps, flow, projects, projectRef, loggedIn }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="gpg">
      {open ? (
        <GuideWalkthrough
          title={title}
          steps={steps}
          flow={flow}
          projects={projects}
          projectRef={projectRef}
          loggedIn={loggedIn}
          onUnlock={unlockGuideQrAction}
          onClose={() => { if (loggedIn) window.location.href = "/dashboard"; else setOpen(false); }}
        />
      ) : (
        <div className="gpg-done">
          <h1>All set</h1>
          <p>You can reopen these steps any time from this link.</p>
          <button className="gpg-btn" onClick={() => setOpen(true)}>Start over</button>
        </div>
      )}
      <style>{`
        .gpg{min-height:100vh;background:#0B0F1A}
        .gpg-done{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;color:#fff;font-family:'Hanken Grotesk',sans-serif}
        .gpg-done h1{font-family:'Bricolage Grotesque',sans-serif;font-size:1.9rem;font-weight:800;margin:0}
        .gpg-done p{color:#9aa3b2;margin:0;font-size:.95rem}
        .gpg-btn{margin-top:10px;height:44px;padding:0 24px;border:none;border-radius:11px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:800;font-size:.9rem;cursor:pointer;font-family:inherit}
      `}</style>
    </div>
  );
}
