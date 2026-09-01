"use client";

// Error boundary for the candidate page — a real recovery state instead of a broken/blank screen.
export default function Error({ error, reset }) {
  return (
    <div className="ce-wrap" role="alert">
      <div className="ce-card">
        <div className="ce-mark">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2>Couldn&rsquo;t load this candidate</h2>
        <p>Something went wrong fetching the application. Your data is safe — try again.</p>
        <div className="ce-actions">
          <button className="ce-btn" onClick={() => reset()}>Retry</button>
          <a className="ce-btn ghost" href="/onboarding">Back to Hiring</a>
        </div>
        {error?.digest && <p className="ce-ref">Reference: {error.digest}</p>}
      </div>
      <style>{`
        .ce-wrap{min-height:60vh;display:grid;place-items:center;padding:40px 20px;font-family:var(--font-sans,'Instrument Sans',sans-serif)}
        .ce-card{max-width:420px;text-align:center;background:#fff;border:1px solid #E4E4DF;border-radius:16px;padding:30px 26px}
        .ce-mark{width:52px;height:52px;border-radius:50%;background:#F6E7E2;color:#C4553D;display:grid;place-items:center;margin:0 auto 14px}
        .ce-card h2{margin:0 0 6px;font-size:1.15rem;font-weight:800;color:#101418}
        .ce-card p{margin:0;color:#787D84;font-size:.9rem;line-height:1.5}
        .ce-actions{display:flex;gap:9px;justify-content:center;margin-top:18px}
        .ce-btn{background:#A8842F;color:#fff;border:none;border-radius:9px;padding:9px 18px;font:inherit;font-weight:700;font-size:.85rem;cursor:pointer;text-decoration:none}
        .ce-btn.ghost{background:#fff;color:#101418;border:1px solid #E4E4DF}
        .ce-ref{margin-top:14px !important;font-size:.72rem;color:#A6ABB1;font-family:var(--font-mono,ui-monospace,monospace)}
      `}</style>
    </div>
  );
}
