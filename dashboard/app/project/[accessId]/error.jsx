"use client";

import { useEffect } from "react";

// Error boundary for the project route. Before this existed, any uncaught error in the project page —
// a server render throw (digest) or a client render crash (e.g. a malformed proposal payload) — fell
// through to Next's generic global-error card ("This page couldn't load"), which hid the real cause and
// gave the customer no way forward. This catches both, LOGS the actual error (never hidden), and offers
// a real recovery (Retry re-renders the segment; Reload does a full reload). It changes nothing about
// authorization — a PIN/session that was valid stays valid across the retry.
export default function Error({ error, reset }) {
  useEffect(() => {
    // Surface the real exception (message + digest) so it's visible in the console and server logs,
    // instead of being swallowed by a generic fallback.
    console.error("[project page] render error:", error);
  }, [error]);

  return (
    <div className="pe-wrap" role="alert">
      <div className="pe-card">
        <div className="pe-mark">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2>Couldn&rsquo;t load this page</h2>
        <p>Something went wrong displaying your project. Your access is still valid — try again.</p>
        <div className="pe-actions">
          <button className="pe-btn" onClick={() => reset()}>Retry</button>
          <button className="pe-btn ghost" onClick={() => { try { window.location.reload(); } catch { /* noop */ } }}>Reload</button>
        </div>
        {error?.digest && <p className="pe-ref">Reference: {error.digest}</p>}
      </div>
      <style>{`
        .pe-wrap{min-height:70vh;display:grid;place-items:center;padding:40px 20px;font-family:'Instrument Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
        .pe-card{max-width:420px;text-align:center;background:#fff;border:1px solid #E4E4DF;border-radius:16px;padding:30px 26px}
        .pe-mark{width:52px;height:52px;border-radius:50%;background:#F6E7E2;color:#C4553D;display:grid;place-items:center;margin:0 auto 14px}
        .pe-card h2{margin:0 0 6px;font-size:1.15rem;font-weight:800;color:#101418}
        .pe-card p{margin:0;color:#787D84;font-size:.9rem;line-height:1.5}
        .pe-actions{display:flex;gap:9px;justify-content:center;margin-top:18px}
        .pe-btn{background:#A8842F;color:#fff;border:none;border-radius:9px;padding:9px 18px;font:inherit;font-weight:700;font-size:.85rem;cursor:pointer}
        .pe-btn.ghost{background:#fff;color:#101418;border:1px solid #E4E4DF}
        .pe-ref{margin-top:14px !important;font-size:.72rem;color:#A6ABB1;font-family:ui-monospace,monospace}
      `}</style>
    </div>
  );
}
