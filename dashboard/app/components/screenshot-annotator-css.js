export const CSS = `
.mk-scrim{position:fixed;inset:0;z-index:2147483200;background:#0b0d11;display:flex;flex-direction:column;
  font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e9edf2}
.mk-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;flex-wrap:wrap;
  background:#12151b;border-bottom:1px solid rgba(255,255,255,.08)}
.mk-seg{display:inline-flex;gap:2px;padding:3px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:11px}
.mk-tool{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:8px;
  background:transparent;color:#c2c7ce;cursor:pointer;line-height:0;transition:background .13s,color .13s}
.mk-tool:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.mk-tool.on{background:#fff;color:#12151b}
.mk-tool:disabled{opacity:.34;cursor:default}
.mk-tool:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(94,150,255,.7)}
.mk-sep{width:1px;height:26px;background:rgba(255,255,255,.12)}
.mk-spacer{flex:1}
.mk-desk{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mk-mobile{display:none}                 /* X + bottom dock — revealed only in the mobile query */
.mk-x{align-items:center;justify-content:center;width:40px;height:40px;border:0;border-radius:9px;background:transparent;color:#c2c7ce;cursor:pointer;line-height:0}
.mk-x:hover{background:rgba(255,255,255,.1);color:#fff}
.mk-dock{display:none;align-items:center;gap:4px;padding:6px;background:#12151b;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.5)}
.mk-morewrap{position:relative;display:inline-flex}
.mk-moremenu{left:auto;right:0;min-width:120px;padding:4px;flex-direction:column;gap:2px}
.mk-moremenu button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:none;color:#e9edf2;font:600 .82rem/1 inherit;padding:9px 10px;border-radius:8px;cursor:pointer}
.mk-moremenu button:hover:not(:disabled){background:rgba(255,255,255,.1)}
.mk-moremenu button:disabled{opacity:.4;cursor:default}
.mk-moremenu svg{width:16px;height:16px}
.mk-colwrap{position:relative;display:inline-flex}
.mk-swatch{width:36px;height:36px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.05);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.mk-swatch:hover{background:rgba(255,255,255,.1)}
.mk-dot{width:16px;height:16px;border-radius:50%}
.mk-pop{position:absolute;top:44px;left:0;z-index:5;background:#1b1f27;border:1px solid rgba(255,255,255,.14);border-radius:12px;
  padding:9px;box-shadow:0 16px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:8px}
.mk-pop.up{top:auto;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%)}
.mk-pop.up.mk-moremenu{left:auto;right:0;transform:none}
.mk-sw-row{display:flex;gap:6px}
.mk-sw{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.mk-sw.on{border-color:#fff;box-shadow:0 0 0 2px #1b1f27,0 0 0 3px #fff}
.mk-str-row{display:flex;gap:6px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}
.mk-str{flex:1;height:26px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mk-str.on{background:#fff}
.mk-str-bar{width:20px;border-radius:6px;background:#c2c7ce}
.mk-str.on .mk-str-bar{background:#12151b}
.mk-btn{height:36px;padding:0 16px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);
  color:#e9edf2;font:700 .84rem/1 inherit;cursor:pointer}
.mk-btn:hover{background:rgba(255,255,255,.12)}
.mk-btn.ghost{background:transparent}
.mk-btn.go{background:#e0574a;border-color:#e0574a;color:#fff}
.mk-btn.go:hover{background:#d34a3d}
.mk-btn:disabled{opacity:.45;cursor:default}
.mk-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden}
.mk-canvas{max-width:calc(100vw - 32px);max-height:calc(100vh - 92px);border-radius:6px;
  box-shadow:0 24px 70px rgba(0,0,0,.6);cursor:crosshair;touch-action:none;background:#fff;image-rendering:auto;will-change:transform}
/* Multi-screenshot paging — side arrows, a bottom page pill, and extra bottom room so nothing crowds. */
.mk-multi .mk-stage{padding-bottom:60px}
.mk-pnav{position:absolute;top:50%;transform:translateY(-50%);z-index:8;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,.16);border-radius:50%;background:rgba(18,21,27,.82);color:#e9edf2;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  box-shadow:0 8px 24px rgba(0,0,0,.45);transition:background .13s,transform .13s}
.mk-pnav:hover{background:rgba(34,39,48,.95);transform:translateY(-50%) scale(1.06)}
.mk-pnav:active{transform:translateY(-50%) scale(.94)}
.mk-pnav.prev{left:14px}
.mk-pnav.next{right:14px}
.mk-pageind{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:8;display:inline-flex;align-items:center;gap:8px;
  padding:7px 13px;border-radius:100px;background:rgba(18,21,27,.82);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  box-shadow:0 8px 24px rgba(0,0,0,.45)}
.mk-pagedot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.32);transition:background .15s,transform .15s}
.mk-pagedot.on{background:#fff;transform:scale(1.35)}
.mk-pagenum{font:700 .74rem/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#c8ccd2;letter-spacing:.02em;margin-left:2px;font-variant-numeric:tabular-nums}
.mk-zoom{position:absolute;right:14px;bottom:14px;z-index:7;display:flex;flex-direction:column;gap:6px}
.mk-multi .mk-zoom{bottom:64px}
.mk-ztool{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.14);
  border-radius:10px;background:rgba(18,21,27,.86);color:#e9edf2;cursor:pointer;backdrop-filter:blur(6px);font:700 .78rem/1 system-ui}
.mk-ztool:hover:not(:disabled){background:rgba(30,34,42,.92)}
.mk-ztool:disabled{opacity:.4;cursor:default}
.mk-zreset{font-variant-numeric:tabular-nums}
.mk-canvas.mk-t-text{cursor:text}
.mk-canvas.mk-t-crop{cursor:crosshair}
.mk-canvas.mk-t-pan{cursor:grab}
.mk-canvas.mk-t-pan:active{cursor:grabbing}
.mk-text-idle{left:-9999px!important;top:0!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;border:0!important}
.mk-fmt{position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:13;display:flex;align-items:center;gap:3px;padding:5px;
  background:#1b1f27;border:1px solid rgba(255,255,255,.14);border-radius:11px;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.mk-fb{min-width:34px;height:34px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:#c8ccd2;cursor:pointer;font:700 .92rem/1 system-ui,-apple-system,Segoe UI,sans-serif}
.mk-fb:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.mk-fb.on{background:#fff;color:#12151b}
.mk-fb:disabled{opacity:.4;cursor:default}
.mk-fsep{width:1px;height:20px;background:rgba(255,255,255,.14);margin:0 2px}
@media(max-width:640px){ .mk-fmt{top:calc(8px + env(safe-area-inset-top))} }
.mk-text-in{position:fixed;z-index:12;min-width:40px;min-height:1.2em;background:transparent;border:1px dashed rgba(120,160,255,.9);
  border-radius:4px;padding:2px 4px;outline:none;resize:none;overflow:hidden;white-space:pre;line-height:1.22;
  text-shadow:0 1px 3px rgba(0,0,0,.4);caret-color:currentColor}
@media (max-width:640px){
  /* Everything lives at the BOTTOM on mobile. The old top bar collided with the browser's address
     bar and hid Attach — so X + Attach float above the tool dock, in thumb reach, clear of chrome. */
  .mk-desk,.mk-desktop{display:none!important}
  .mk-mobile{display:inline-flex}
  .mk-bar{position:fixed;left:0;right:0;top:auto;bottom:calc(70px + env(safe-area-inset-bottom));
    padding:0 14px;min-height:0;background:transparent;border:0;justify-content:space-between;gap:8px;z-index:9}
  .mk-x{background:rgba(18,21,27,.9);border:1px solid rgba(255,255,255,.14);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .mk-btn{height:44px;padding:0 22px;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  .mk-dock{display:flex;position:fixed;left:50%;transform:translateX(-50%);
    bottom:calc(12px + env(safe-area-inset-bottom));z-index:8;max-width:calc(100vw - 8px)}
  /* fluid width so all 7 tools always fit — even on narrow / zoomed-display phones (~320px) */
  .mk-dock .mk-tool,.mk-dock .mk-swatch{width:min(44px, calc((100vw - 50px) / 8));height:44px}
  .mk-dock .mk-swatch{border:0;background:transparent}
  .mk-dock .mk-swatch:hover{background:rgba(255,255,255,.1)}
  .mk-stage{padding:8px 12px calc(128px + env(safe-area-inset-bottom))}
  .mk-canvas{max-width:calc(100vw - 24px);max-height:calc(100vh - 172px)}
  .mk-zoom{right:12px;bottom:calc(124px + env(safe-area-inset-bottom))}   /* above the X/Attach row */
  .mk-multi .mk-zoom{bottom:calc(124px + env(safe-area-inset-bottom))}
  /* bottom is full (dock + X/Attach) on mobile → page pill goes up top, keep the dock's bottom room */
  .mk-multi .mk-stage{padding-bottom:calc(128px + env(safe-area-inset-bottom))}
  .mk-pageind{top:calc(8px + env(safe-area-inset-top));bottom:auto}
  .mk-pnav{width:40px;height:40px}
  .mk-pnav.prev{left:8px}
  .mk-pnav.next{right:8px}
  /* while typing text, get the tool chrome out of the way so it can't cover the input */
  .mk-editing .mk-dock,.mk-editing .mk-bar,.mk-editing .mk-zoom{display:none}
  .mk-editing .mk-pnav,.mk-editing .mk-pageind{display:none}
}
`;
