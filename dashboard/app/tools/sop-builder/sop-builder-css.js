export const CSS = `
.sopb{--bg:#0c0e11;--card:#16181c;--line:#2a2d33;--mut:#9aa0ab;--acc:#C9A96E;--acc-ink:#101418;--acc-soft:rgba(201,169,110,.14);
  background:var(--bg);color:#f2f3f5;font:16px/1.45 -apple-system,system-ui,sans-serif;max-width:640px;margin:auto;padding:14px 16px var(--dock-lane,72px);min-height:100dvh;border-radius:14px}
.sopb *{box-sizing:border-box}
.sopb button,.sopb input,.sopb textarea{font:inherit;color:inherit}
.sopb button{cursor:pointer;touch-action:manipulation}
.sopb-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:12px;padding-top:2px}
.sopb-nav-back{display:inline-flex;align-items:center;gap:4px;justify-self:start;color:var(--mut);text-decoration:none;font-size:13px;font-weight:600;padding:6px 9px;border-radius:9px;white-space:nowrap}
.sopb-nav-back:hover{color:#f2f3f5;background:var(--card)}
.sopb-nav-logo{justify-self:center;color:#f2f3f5;display:inline-flex;text-decoration:none}
.sopb-nav-sp{justify-self:end}
.sopb-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.sopb-top h1{flex:1;font-size:24px;font-weight:800;letter-spacing:-.4px}
.sopb-ib{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:16px;color:#fff;display:inline-flex;align-items:center;justify-content:center}
.sopb-tabs{display:flex;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px;margin-bottom:16px}
.sopb-tabs button{flex:1;border:0;background:none;padding:10px;border-radius:10px;font-weight:700;color:var(--mut)}
.sopb-tabs button.on{background:var(--acc);color:var(--acc-ink)}
.sopb-sec{margin-bottom:18px}
.sopb-lbl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
.sopb-lbl b{background:#fff;color:#000;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
.sopb-up{display:block;position:relative;overflow:hidden;border:2px dashed #3a3a40;border-radius:16px;padding:18px;text-align:center;font-weight:700;transition:border-color .12s,background .12s}
.sopb-up.drop{border-color:var(--acc);background:rgba(255,214,10,.08)}
.sopb-up small{display:block;color:var(--mut);font-weight:500;font-size:12px;margin-top:3px}
.sopb-up svg{vertical-align:-3px;margin-right:4px}
.sopb-up input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
.sopb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.sopb-tile{position:relative;border-radius:12px;overflow:hidden;background:var(--card);aspect-ratio:1;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:grab}
.sopb-tile img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.sopb-tile .n{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.75);border-radius:7px;padding:2px 8px;font-size:13px;font-weight:800}
.sopb-tile .x{position:absolute;right:4px;top:4px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.75);color:#fff;display:inline-flex;align-items:center;justify-content:center;padding:0}
.sopb-tile .vid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;color:#fff;filter:drop-shadow(0 2px 8px rgba(0,0,0,.85));pointer-events:none}
.sopb-tile.drag{opacity:.35}
.ghost{position:fixed;z-index:50;pointer-events:none;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.7);transform:scale(1.08);outline:3px solid var(--acc)}
.ghost img{width:100%;height:100%;object-fit:cover}
.sopb-talk{position:relative}
.sopb-talk textarea{width:100%;min-height:140px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 52px 13px 13px;font-size:16px;resize:vertical;color:#f2f3f5}
.sopb-mic{position:absolute;right:10px;bottom:10px;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--acc);font-size:16px;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.sopb-mic.on{background:#c4553d;color:#fff;border-color:#c4553d;animation:sopbp 1.2s infinite}
@keyframes sopbp{0%{box-shadow:0 0 0 0 rgba(196,85,61,.55)}70%{box-shadow:0 0 0 12px rgba(196,85,61,0)}100%{box-shadow:0 0 0 0 rgba(196,85,61,0)}}
.sopb-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:52px;border-radius:16px;border:1px solid var(--line);background:var(--card);font-weight:800;font-size:17px;color:#fff}
.sopb-btn.go{background:var(--acc);border:0;color:var(--acc-ink)}
.sopb-btn.w{background:var(--card);color:#f2f3f5;border:1px solid var(--line)}
.sopb-btn:disabled{opacity:.45}
.sopb-row{display:flex;gap:8px}.sopb-row .sopb-btn{flex:1}
.sopb-status{text-align:center;color:var(--mut);font-size:14px;min-height:20px;margin-top:10px}
.sopb-titlein{width:100%;background:none;border:0;border-bottom:1px solid var(--line);font-size:22px;font-weight:800;padding:6px 0;margin-bottom:10px;color:#fff}
.sopb-meta{display:flex;gap:8px;margin-bottom:12px}
.sopb-metain{flex:1;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:14px;color:#fff}
.sopb-step{background:var(--card);border:1px solid var(--line);border-radius:18px;margin-bottom:12px;overflow:hidden}
.sopb-ph{position:relative;background:#000}
.sopb-ph img,.sopb-ph video{width:100%;max-height:340px;object-fit:contain;display:block;background:#000}
.sopb-ph .tag{position:absolute;left:8px;top:8px;background:var(--acc);color:#000;font-size:11px;font-weight:800;border-radius:7px;padding:3px 8px}
.sopb-ph .num{position:absolute;right:8px;top:8px;background:rgba(0,0,0,.75);border-radius:8px;padding:3px 9px;font-weight:800;font-size:13px}
.sopb-bd{padding:12px}
.sopb-bd input,.sopb-bd textarea{width:100%;background:transparent;border:1px solid transparent;border-radius:10px;padding:6px 8px;margin-left:-8px;color:#fff}
.sopb-bd input:focus,.sopb-bd textarea:focus{border-color:var(--line);background:#0b0b0c;outline:0}
.sopb-bd input{font-size:19px;font-weight:800}
.sopb-bd textarea{font-size:16px;resize:none;min-height:48px}
.sopb-acts{display:flex;gap:6px;margin-top:8px}
.sopb-acts button,.sopb-acts .sopb-fl{flex:1;min-height:42px;border-radius:12px;border:1px solid var(--line);background:#1c1f24;font-weight:700;font-size:14px;color:#f2f3f5;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.sopb-acts button:disabled{opacity:.45}
.sopb-acts button.ic{flex:0 0 46px}
.sopb-acts button.danger{background:#c4553d;border-color:#c4553d;color:#fff}
.sopb-acts .sopb-fl{position:relative;overflow:hidden;cursor:pointer}
.sopb-fl:focus-within{outline:2px solid var(--acc);outline-offset:2px}
.sopb-acts .sopb-fl[aria-disabled]{opacity:.45;cursor:default}
.sopb .sopb-fl input{position:absolute;width:1px;height:1px;margin:0;padding:0;opacity:0;pointer-events:none}
.sopb-upl{flex:1;min-height:42px;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--mut)}
.sopb-acts button.on{background:var(--acc);color:var(--acc-ink);border-color:var(--acc)}
.sopb-enhedit{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.sopb-enhedit input{flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-left:0;font-size:13px;font-weight:400;color:#f2f3f5}
.sopb-enhedit button{min-height:40px;padding:0 15px;border-radius:10px;border:1px solid var(--line);background:#1c1f24;color:#f2f3f5;font-weight:700;font-size:13px;white-space:nowrap}
.sopb-enhedit button.go{background:var(--acc);color:var(--acc-ink);border:0;align-self:flex-end}
.sopb-hd{display:flex;align-items:center;gap:6px;padding:8px 12px 0;color:var(--mut);font-size:13px}
.sopb-hd .sopb-h{touch-action:none;display:inline-flex;padding:4px 8px;cursor:grab}
.sopb-lib{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px;margin-bottom:10px;flex:1;text-align:left;color:#fff}
.sopb-lib img{width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#222}
.sopb-lib .t{font-weight:700}.sopb-lib .m{font-size:13px;color:var(--mut)}
.sopb-empty{text-align:center;color:var(--mut);padding:40px 0}
.sopb-sheet{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1200;display:flex;align-items:flex-end}
.sopb-sheet .in{background:#141416;width:100%;max-width:640px;margin:auto auto 0;border-radius:22px 22px 0 0;padding:18px 16px calc(20px + env(safe-area-inset-bottom))}
.sopb-hint{font-size:13px;color:var(--mut);margin-top:6px}
.sopb-implist{max-height:48vh;overflow:auto;margin-top:12px;display:flex;flex-direction:column;gap:8px}
.sopb-implist .sopb-lib{width:100%;margin-bottom:0}
.sopb-bd .sopb-tagin{font-size:12.5px;font-weight:500;color:var(--mut)}
.sopb-bd .sopb-tagin:focus{color:#f2f3f5}
.sopb-tagin{width:100%;background:transparent;border:1px solid transparent;border-radius:10px;padding:5px 8px;margin-left:-8px;margin-top:3px;font-size:12.5px;color:var(--mut)}
.sopb-tagin:focus{border-color:var(--line);background:var(--bg);outline:0;color:#f2f3f5}
.sopb-tag{display:inline-block;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(201,169,110,.3);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;margin:3px 4px 0 0;cursor:pointer}
.sopb-libsheet{max-width:640px}
.sopb-libhead{display:flex;align-items:center;justify-content:space-between}
.sopb-libtools{display:flex;align-items:center;gap:8px}
.sopb-tagbtn{min-height:36px;padding:0 13px;border-radius:10px;border:1px solid var(--line);background:#1c1f24;font-weight:700;font-size:13px;color:#f2f3f5}
.sopb-tagbtn:disabled{opacity:.45}
.sopb-tagbtn b{color:var(--mut);font-weight:600;margin-left:4px}
.sopb-libsearch{width:100%;margin-top:12px;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:15px;color:#f2f3f5}
.sopb-libgrid{max-height:52vh;overflow:auto;margin-top:12px;display:flex;flex-direction:column;gap:8px}
.sopb-libcard{display:flex;gap:11px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:9px}
.sopb-libthumb{width:62px;height:62px;border-radius:10px;overflow:hidden;background:#000;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.sopb-libthumb img,.sopb-libthumb video{width:100%;height:100%;object-fit:cover}
.sopb-libph{color:#333;display:inline-flex}
.sopb-libmeta{flex:1;min-width:0}
.sopb-libmeta .t{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sopb-libmeta .m{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sopb-libadd{width:auto;min-height:38px;padding:0 16px;flex-shrink:0}
.sopb-play{position:fixed;inset:0;background:#000;z-index:1300;display:flex;flex-direction:column;color:#fff}
.sopb-play .ph{padding:max(10px,env(safe-area-inset-top)) 12px 6px;display:flex;align-items:center;gap:10px}
.sopb-play .ph div{flex:1;min-width:0}.sopb-play .ph b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sopb-play .ph span{font-size:13px;color:var(--mut);font-weight:600}
.sopb-play .bars{display:flex;gap:3px;padding:0 12px}.sopb-play .bars i{flex:1;height:3px;border-radius:2px;background:#333}.sopb-play .bars i.on{background:var(--acc)}
.sopb-play .mid{flex:1;overflow:auto;padding:12px 16px}
.sopb-play .mid img,.sopb-play .mid video{width:100%;max-height:56dvh;object-fit:contain;border-radius:16px;background:#111;display:block;margin-bottom:14px}
.sopb-play h2{font-size:24px;font-weight:800;margin-bottom:8px}.sopb-play p{font-size:19px;line-height:1.45}
.sopb-play .nav{display:flex;gap:10px;padding:10px 12px calc(12px + env(safe-area-inset-bottom))}
.sopb-play .nav button{flex:1;min-height:56px;border-radius:14px;border:1px solid var(--line);background:var(--card);font-size:18px;font-weight:800;color:#fff}
.sopb-play .nav .nx{flex:2;background:#fff;color:#000;border:0}.sopb-play .nav button:disabled{opacity:.3}
.sopb-toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#fff;color:#000;border-radius:14px;padding:12px 16px;font-size:14px;font-weight:600;z-index:1400;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.6);display:flex;gap:12px;align-items:center}
.sopb-toast button{border:0;background:none;color:#0a84ff;font-weight:800}
@media (prefers-reduced-motion:reduce){.sopb *{animation:none!important}}
`;
