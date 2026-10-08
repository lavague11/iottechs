// Styles for the PDF signer (vault-dark chrome around white paper pages). Tokens fall back to the
// project's dark palette so the signer matches the rest of the portal; no hand-typed one-offs beyond
// the DocuSign-style field colours (soft yellow tag, blue outline) the old modal already used.
export const ESG_CSS = `
.esg{--esg-bg:var(--dv-bg,#0b0f1a);--esg-bar:var(--dv-raise-dark,#121829);--esg-line:rgba(255,255,255,.1);--esg-ink:#eef0f5;--esg-meta:#9aa3b5;
  --esg-gold:var(--gold,#c9a96e);--esg-field:#F7DC6F;--esg-field-line:#3E6FB0;--esg-ok:#3aa564;--esg-err:#e0685a;
  position:fixed;inset:0;z-index:13000;background:var(--esg-bg);color:var(--esg-ink);display:flex;flex-direction:column;font-family:var(--font,system-ui,sans-serif)}
.esg *{box-sizing:border-box}
.esg-top{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--esg-bar);border-bottom:1px solid var(--esg-line);flex:0 0 auto}
.esg-title{flex:1;min-width:0;font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.esg-title small{color:var(--esg-meta);font-weight:500;margin-left:8px}
.esg-ico{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--esg-line);background:transparent;color:var(--esg-ink);cursor:pointer;flex:0 0 auto}
.esg-ico:hover:not(:disabled){border-color:var(--esg-gold)}
.esg-ico:disabled{opacity:.4;cursor:default}
.esg-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 10px 96px;background:#1a2030}
.esg-pages{margin:0 auto;max-width:1100px;min-width:100%;display:flex;flex-direction:column;gap:12px}
@media (min-width:900px){.esg-pages{min-width:0}}
.esg-page{position:relative;width:100%;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.45);border-radius:2px}
.esg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.esg-note{padding:48px 0;text-align:center;color:var(--esg-meta);font-size:.85rem}
.esg-note.err{color:var(--esg-err)}
.esg-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:var(--esg-bar);border-top:1px solid var(--esg-line)}
.esg-count{font-size:.78rem;color:var(--esg-meta);flex:1}
.esg-go{border:2px solid var(--esg-field-line);background:var(--esg-field);color:#1f1a05;font-weight:600;font-size:.9rem;font-family:inherit;border-radius:9px;padding:11px 22px;min-height:44px;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
.esg-go:disabled{background:transparent;border-color:var(--esg-line);color:var(--esg-meta);cursor:not-allowed}
.esg-ghost{border:1px solid var(--esg-line);background:transparent;color:var(--esg-ink);font-family:inherit;font-size:.85rem;border-radius:9px;padding:10px 16px;min-height:44px;cursor:pointer}

/* Fields laid over the page in percent. */
.esg-f{position:absolute;border:2px solid var(--esg-field-line);background:rgba(247,220,111,.72);border-radius:3px;display:flex;align-items:center;justify-content:center;gap:4px;color:#1f1a05;font-size:clamp(8px,1.5vw,12px);font-weight:600;padding:0;cursor:pointer;font-family:inherit;overflow:hidden}
.esg-f[data-ro="1"]{cursor:default}
.esg-f.on{box-shadow:0 0 0 3px rgba(62,111,176,.45);animation:esgPulse 1.4s ease-in-out infinite}
.esg-f.done{background:rgba(255,255,255,.0);border-color:var(--esg-ok)}
.esg-f.done img{max-width:100%;max-height:100%;object-fit:contain}
.esg-f.done span.v{color:#10204a;font-size:clamp(9px,1.8vw,14px);font-weight:700;white-space:nowrap}
@keyframes esgPulse{50%{box-shadow:0 0 0 6px rgba(62,111,176,.15)}}
.esg-f svg{flex:0 0 auto}

/* Capture sheet (P2) */
.esg-sheet-bg{position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;z-index:5}
.esg-sheet{width:min(560px,100%);background:var(--esg-bar);border:1px solid var(--esg-line);border-radius:14px 14px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;max-height:92vh;overflow:auto}
@media (min-width:700px){.esg-sheet-bg{align-items:center}.esg-sheet{border-radius:14px}}
.esg-tabs{display:flex;gap:6px}
.esg-tab{flex:1;border:1px solid var(--esg-line);background:transparent;color:var(--esg-meta);font-family:inherit;font-size:.82rem;font-weight:600;padding:9px;border-radius:8px;cursor:pointer}
.esg-tab.on{color:var(--esg-ink);border-color:var(--esg-gold)}
.esg-pad{position:relative;width:100%;height:min(46vh,260px);background:#fff;border-radius:10px;touch-action:none}
.esg-pad canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:10px}
.esg-pad .base{position:absolute;left:6%;right:6%;bottom:30%;border-bottom:1px solid #c9ccd6;pointer-events:none}
.esg-typed{height:min(46vh,260px);background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#10204a;font-size:clamp(34px,9vw,64px);padding:0 14px;white-space:nowrap;overflow:hidden}
.esg-row{display:flex;gap:8px;align-items:center}
.esg-row .sp{flex:1}
.esg-in{width:100%;border:1px solid var(--esg-line);background:#0e1322;color:var(--esg-ink);border-radius:8px;padding:12px;font-size:1rem;font-family:inherit}
.esg-in:focus{outline:none;border-color:var(--esg-gold)}
.esg-lbl{font-size:.64rem;letter-spacing:.06em;text-transform:uppercase;color:var(--esg-meta);font-weight:600}
.esg-acks{display:flex;flex-direction:column;gap:10px}
.esg-ack{display:flex;gap:10px;align-items:flex-start;font-size:.82rem;line-height:1.5;color:var(--esg-ink);cursor:pointer}
.esg-ack input{width:20px;height:20px;margin-top:1px;accent-color:var(--esg-field-line);flex:0 0 auto}
.esg-req{color:var(--esg-err);font-weight:700}
.esg-terms{max-height:220px;overflow:auto;border:1px solid var(--esg-line);border-radius:8px;padding:10px 12px;background:#0e1322}
.esg-terms p{margin:0 0 9px;font-size:.72rem;line-height:1.55;color:var(--esg-meta);white-space:pre-wrap}
.esg-terms b{color:var(--esg-ink)}
.esg-link{background:none;border:none;color:var(--esg-gold);font-family:inherit;font-size:.78rem;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;text-align:left}
.esg-err{color:var(--esg-err);font-size:.8rem}
.esg-fine{font-size:.66rem;color:var(--esg-meta);line-height:1.5}
`;
