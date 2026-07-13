"use client";

// Hero card at the top of the customer's project — one next step (or one status), never a 9-node
// bar to decode. Fed by lib/customer-action.js (which reads the same flow-matrix facts). When the
// step is the customer's, it's an action with a button that routes to the stage holding the real
// control; when it's the company's, it's a quiet status with no button.
export default function CustomerActionCard({ action, onGo, preview }) {
  if (!action) return null;
  const { tone, kicker, headline, sub, cta, target } = action;
  const isAction = tone === "action";
  const isDone = tone === "done";

  return (
    <div className={`cac-root cac-${tone}`}>
      <style>{CAC_CSS}</style>
      <span className="cac-kicker">{kicker}</span>
      <div className="cac-headline">{headline}</div>
      {sub && <div className="cac-sub">{sub}</div>}
      {isAction && cta && (
        <div className="cac-actions">
          <button type="button" className="cac-btn" disabled={preview} onClick={() => onGo?.(target)}>
            {cta}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          {preview && <span className="cac-preview">Disabled in preview.</span>}
        </div>
      )}
      {isDone && (
        <div className="cac-donecheck">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
      )}
    </div>
  );
}

const CAC_CSS = `
.cac-root{margin:16px 22px 0;background:#fff;border:1px solid #d9d4ca;border-radius:14px;padding:20px 22px;position:relative}
.cac-action{border-color:#d8c79a;box-shadow:0 8px 24px -14px rgba(201,169,110,.5)}
.cac-done{border-color:#bfe0c9}
.cac-kicker{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;padding:3px 10px;border-radius:100px;margin-bottom:11px}
.cac-action .cac-kicker{background:#f7f0df;color:#7a5f1f}
.cac-status .cac-kicker{background:#eef1f6;color:#5b6275;border:1px solid #dfe3ea}
.cac-done .cac-kicker{background:#eef7f0;color:#1d7a3a}
.cac-headline{font-size:1.22rem;font-weight:800;color:#0B0F1A;line-height:1.25;letter-spacing:-.01em}
.cac-sub{font-size:.92rem;color:#5b6275;line-height:1.55;margin-top:6px}
.cac-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:18px}
.cac-btn{display:inline-flex;align-items:center;gap:9px;height:46px;padding:0 22px;border:none;border-radius:11px;background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.95rem;font-weight:800;cursor:pointer;font-family:inherit}
.cac-btn:hover:not(:disabled){filter:brightness(1.05)}
.cac-btn:disabled{opacity:.55;cursor:default}
.cac-preview{font-size:.74rem;color:#8a93a8}
.cac-donecheck{position:absolute;top:20px;right:22px;width:34px;height:34px;border-radius:50%;background:#2f7d5a;color:#fff;display:flex;align-items:center;justify-content:center}
/* Done/status is a quiet confirmation, not a hero — keep it a slim strip: check + headline inline
   with the kicker, sub on the same compact block, minimal height. */
.cac-done, .cac-status{padding:11px 16px}
.cac-done .cac-kicker, .cac-status .cac-kicker{margin-bottom:0;margin-right:10px;vertical-align:middle}
.cac-done .cac-headline, .cac-status .cac-headline{display:inline;font-size:1rem}
.cac-done .cac-sub, .cac-status .cac-sub{font-size:.82rem;line-height:1.4;margin-top:3px}
.cac-done .cac-donecheck{top:50%;transform:translateY(-50%);right:14px;width:28px;height:28px}
`;
