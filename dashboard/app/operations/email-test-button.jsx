"use client";

import { useState, useTransition } from "react";
import { sendTestEmailAction } from "./email-actions";

// Admin-only email diagnostic. Sends a real test to the admin's own address so delivery can be
// confirmed once RESEND_API_KEY is set; before that it reports the off state instead of pretending.
export default function EmailTestButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState(null);

  const send = () => start(async () => {
    setRes(null);
    const r = await sendTestEmailAction();
    setRes(r);
  });

  return (
    <div className="panel mb">
      <div className="panel-head">
        <h3>Email</h3>
        <button className="btn btn-ghost btn-sm" onClick={send} disabled={pending}>
          {pending ? "Sending" : "Send Test"}
        </button>
      </div>
      <div className="em-body">
        {!res && (
          <p className="em-hint">
            Send a test email to your own address to confirm delivery. Requires
            <code> RESEND_API_KEY</code> — until it's set this reports the off state.
          </p>
        )}
        {res && res.ok && res.enabled === false && (
          <p className="em-line em-off">
            <span className="em-dot em-dot-off" />
            Email is off — no <code>RESEND_API_KEY</code>. Once set, this would send to <b>{res.to}</b>.
          </p>
        )}
        {res && res.ok && res.enabled && (
          <p className="em-line em-good">
            <span className="em-dot em-dot-good" />
            Sent to <b>{res.to}</b>. Check your inbox.
          </p>
        )}
        {res && !res.ok && (
          <p className="em-line em-bad">
            <span className="em-dot em-dot-bad" />
            {res.error || "Send failed."}
          </p>
        )}
      </div>
      <style>{EM_CSS}</style>
    </div>
  );
}

const EM_CSS = `
.apx .em-body{padding:14px 18px}
.apx .em-hint{font-size:.82rem;color:var(--muted);margin:0;line-height:1.5}
.apx .em-hint code,.apx .em-line code{font-family:var(--font-mono,monospace);font-size:.78rem;background:var(--bg-tint);padding:1px 5px;border-radius:5px}
.apx .em-line{display:flex;align-items:center;gap:9px;font-size:.85rem;margin:0}
.apx .em-dot{width:8px;height:8px;border-radius:100px;flex-shrink:0}
.apx .em-dot-off{background:#8a909c}
.apx .em-dot-good{background:#1c8a45}
.apx .em-dot-bad{background:#c0392b}
.apx .em-good{color:#1c8a45}
.apx .em-bad{color:#c0392b}
.apx .em-off{color:var(--muted)}
`;
