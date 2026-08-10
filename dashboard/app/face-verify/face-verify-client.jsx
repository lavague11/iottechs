"use client";

import AdminShell from "../components/admin-shell";

// Staff shell around the self-contained Face Verify tool. The tool itself is
// served (gated) at /face-verify/embed and runs in a full-bleed iframe so its
// own dark, camera-driven UI stays exactly as designed. allow="camera" hands
// the iframe permission to reach getUserMedia.
export default function FaceVerifyClient({ user, alerts }) {
  return (
    <AdminShell user={user} alerts={alerts} active="face-verify">
      <style>{CSS}</style>
      <div className="apx-wrap fv-wrap">
        <div className="welcome">
          <h1>Face <em>Verify</em></h1>
          <p className="fv-sub">
            1:1 facial verification — match a live face against the licence portrait on file. The face match runs
            entirely on this device; no face image is ever uploaded. Load the customer&rsquo;s ID in the <strong>Internal</strong> panel,
            then run the scan — a confident match returns <strong>Verified</strong>, a borderline read goes to <strong>Review</strong>.
            The <strong>Document check</strong> reads the licence text server-side to flag expiry, tampering, and
            screen/photocopy shots; only the verdict is shown, nothing is stored.
          </p>
        </div>

        <div className="fv-frame">
          <iframe
            title="Face Verify"
            src="/face-verify/embed"
            allow="camera; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </AdminShell>
  );
}

const CSS = `
.apx .fv-sub{color:var(--muted);font-size:.9rem;margin-top:4px;max-width:78ch;line-height:1.55}
.apx .fv-sub strong{color:var(--ink);font-weight:700}
/* Give the tool a tall, phone-shaped canvas — its layout is built for a portrait viewport. */
.apx .fv-frame{margin-top:18px;border:1px solid var(--line);border-radius:16px;overflow:hidden;
  background:#0B0F1A;box-shadow:0 20px 50px -30px rgba(11,15,26,.6)}
.apx .fv-frame iframe{display:block;width:100%;height:min(82vh,860px);border:0;background:#0B0F1A}
`;
