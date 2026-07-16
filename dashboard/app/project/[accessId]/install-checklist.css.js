// Styles for the Installation Work Order checklist, extracted verbatim from install-checklist.jsx
// (rendered via <style>{ICL_CSS}</style>). Kept as a JS template string so it stays scoped to the
// component rather than becoming global CSS.
export const ICL_CSS = `
.icl-root{background:var(--bg-paper);border:1px solid var(--line-warm);border-top:4px solid var(--gold);border-radius:14px;padding:16px 16px 18px;
  font-family:var(--font);box-shadow:0 10px 30px rgba(11,15,26,.06)}
.icl-root.done{border-top-color:var(--green)}
.icl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.icl-title{display:block;font-size:1rem;font-weight:800;color:var(--ink)}
.icl-sub{font-size:.8rem;color:#4a5270}
.icl-head-r{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.icl-pricebtn{height:32px;padding:0 13px;border-radius:8px;border:1px solid var(--line-warm);background:#fff;color:#4a5270;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.icl-pricebtn.on{background:var(--ink);border-color:var(--ink);color:var(--gold)}
.icl-undoall{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line-warm);background:#fff;color:#4a5270;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap}
.icl-undoall:hover{border-color:#4b6a9b;color:var(--ink)}
.icl-crew{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--ink);border-radius:10px;padding:8px 12px;margin:0 0 12px}
.icl-crew-lbl{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8;flex-shrink:0}
.icl-crew-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.icl-crew-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:.78rem;font-weight:700;border-radius:100px;padding:4px 6px 4px 10px}
.icl-crew-x{width:16px;height:16px;border:none;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font-size:.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.icl-crew-x:hover{background:var(--red)}
.icl-crew-none{color:#8a93a8;font-weight:600;font-style:italic;font-size:.8rem}
.icl-crew-add{display:flex;gap:6px;align-items:center;margin-left:auto}
.icl-crew-in{width:150px;height:28px;border:1px solid #3a4260;border-radius:8px;background:#151a2d;color:#fff;padding:0 9px;font-size:.76rem;font-family:inherit;outline:none}
.icl-crew-in:focus{border-color:var(--gold)}
.icl-crew-addbtn{height:28px;padding:0 11px;border:1px solid rgba(201,169,110,.5);background:rgba(201,169,110,.15);color:var(--gold);border-radius:8px;font-size:.72rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-crew-addbtn:disabled{opacity:.5;cursor:default}
.icl-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.icl-sum-cell{flex:1;min-width:150px;background:var(--ink);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.icl-sum-k{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8}
.icl-sum-v{font-size:1.12rem;font-weight:800;color:var(--gold);display:flex;align-items:center;gap:5px}
.icl-sum-sub{font-size:.68rem;color:#8a93a8}
.icl-sum-unit{font-size:.72rem;font-weight:700;color:#8a93a8;margin-left:1px}
.icl-hrs-in{width:58px;height:28px;border:1px solid #3a4260;border-radius:7px;background:#151a2d;color:var(--gold);font-size:1rem;font-weight:800;text-align:center;padding:0 4px;font-family:inherit;outline:none}
.icl-hrs-in.wide{width:82px;text-align:left}
.icl-hrs-in:focus{border-color:var(--gold)}
.icl-paywrap{display:flex;align-items:center;gap:8px;flex-shrink:0}
.icl-earn{font-size:.82rem;font-weight:800;color:var(--green);font-variant-numeric:tabular-nums;white-space:nowrap}
.icl-earn.done{color:var(--green)}
.icl-earn-of{color:#9aa1af;font-weight:600}
.icl-payprog{background:#f2f9f4;border:1px solid #bfe0c9;border-radius:11px;padding:11px 14px;margin:0 0 12px;display:flex;flex-direction:column;gap:7px}
.icl-pp-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.icl-pp-earned{font-size:.98rem;font-weight:800;color:var(--ink)}
.icl-pp-of{font-size:.78rem;font-weight:600;color:var(--muted)}
.icl-pp-pct{font-size:1.05rem;font-weight:800;color:var(--green)}
.icl-pp-bar{height:8px;border-radius:100px;background:#d6ecdd;overflow:hidden}
.icl-pp-fill{height:100%;background:linear-gradient(90deg,#5FB88A,var(--green));transition:width .35s ease}
.icl-pp-stats{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:.76rem;color:#4a5270}
.icl-pp-stats b{color:var(--ink);font-weight:800}
.icl-eod{margin-top:14px;border-top:1px dashed var(--line-warm);padding-top:12px}
.icl-eod-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:var(--ink);color:var(--gold);font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-eod-btn:hover{filter:brightness(1.15)}
.icl-eod-log{margin-top:10px;display:flex;flex-direction:column;gap:6px}
.icl-eod-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid #e2ddd2;border-radius:8px;padding:8px 11px}
.icl-eod-date{font-size:.8rem;font-weight:800;color:var(--ink)}
.icl-eod-time{font-weight:600;color:#8a93a8}
.icl-eod-meta{font-size:.76rem;color:var(--green);font-weight:700}
.icl-eod-cum{color:#8a93a8;font-weight:600}
.icl-eod-del{width:26px;height:26px;border:1px solid #e2ddd2;background:#fff;border-radius:7px;color:var(--red);cursor:pointer;font-size:.72rem;flex-shrink:0}
.icl-eod-del:hover{background:#fbeceb;border-color:#e0b0a8}
.icl-eod-confirm{display:inline-flex;gap:5px;align-items:center;flex-shrink:0}
.icl-eod-yes{height:24px;padding:0 9px;border:none;border-radius:6px;background:var(--red);color:#fff;font-size:.68rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-eod-no{height:24px;padding:0 9px;border:1px solid #d5d9e0;border-radius:6px;background:#fff;color:#41485a;font-size:.68rem;font-weight:700;cursor:pointer;font-family:inherit}
.icl-eod-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.icl-eod-for{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted);font-weight:600}
.icl-eod-date-in{height:34px;border:1px solid var(--line-warm);border-radius:8px;padding:0 9px;font-size:.8rem;font-family:inherit;color:var(--ink);background:#fff;outline:none}
.icl-eod-date-in:focus{border-color:var(--green)}
.icl-bytech{margin-top:14px;background:var(--ink);border-radius:11px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.icl-bytech-hd{font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a93a8}
.icl-bytech-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:.86rem;color:#fff;font-weight:600}
.icl-bytech-row b{color:var(--gold);font-weight:800;font-variant-numeric:tabular-nums}
.icl-wolog{margin-top:14px;border:1px solid #e2ddd2;border-radius:11px;overflow:hidden;background:#fff}
.icl-wolog-hd{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f7f5f0;border:none;padding:11px 14px;font-size:.78rem;font-weight:800;color:#4a5270;cursor:pointer;font-family:inherit;letter-spacing:.03em;text-transform:uppercase}
.icl-wolog-hd:hover{background:#f0ede6}
.icl-wolog-caret{font-size:.64rem;color:#8a93a8}
.icl-wolog-list{display:flex;flex-direction:column;max-height:280px;overflow-y:auto}
.icl-wolog-row{display:flex;align-items:flex-start;gap:9px;padding:8px 14px;border-top:1px solid #f0ede6}
.icl-wolog-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.icl-wolog-body{display:flex;flex-direction:column;gap:1px;min-width:0}
.icl-wolog-main{font-size:.8rem;color:var(--ink)}
.icl-wolog-main b{font-weight:800}
.icl-wolog-time{font-size:.72rem;color:#8a93a8}
.icl-pay-edit{display:flex;align-items:center;gap:1px;font-size:.84rem;font-weight:800;color:var(--ink);flex-shrink:0}
.icl-pay-in{width:58px;height:30px;border:1px solid var(--line-warm);border-radius:7px;background:#fff;color:var(--ink);font-size:.82rem;font-weight:800;text-align:right;padding:0 6px;font-family:inherit;outline:none;font-variant-numeric:tabular-nums}
.icl-pay-in:focus{border-color:var(--green)}
.icl-bulk{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 4px}
.icl-bulk-lbl{font-size:.72rem;font-weight:800;color:var(--muted);letter-spacing:.03em}
.icl-bulk-btn{height:28px;padding:0 12px;border-radius:100px;border:1px solid var(--line-warm);background:#fff;color:#4a5270;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.icl-bulk-btn:hover{border-color:var(--gold);color:#8a6d2f;background:#fff8ee}
.icl-bulk-btn.all{border-color:var(--green);color:var(--green);background:#f2f9f4;font-weight:800}
.icl-bulk-btn.all:hover{background:var(--green-soft)}
.icl-bulk-btn.reset{border-color:#e0b0a8;color:var(--red);background:#fff}
.icl-bulk-btn.reset:hover{background:#fbeceb}
.icl-confirm{display:flex;align-items:center;gap:10px;padding:9px 12px 11px 55px;flex-wrap:wrap}
.icl-confirm span{font-size:.8rem;color:#4a5270}
.icl-cf-yes{height:30px;padding:0 14px;border:none;border-radius:8px;background:var(--red);color:#fff;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-cf-yes:hover{filter:brightness(1.08)}
.icl-cf-no{height:30px;padding:0 12px;border:1px solid var(--line-warm);border-radius:8px;background:#fff;color:#4a5270;font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.icl-addbtn.req{border-color:#c9b58a;background:#fff8ee;color:#8a6d2f}
.icl-addbtn.req:hover{border-color:var(--gold);background:#fdf3e0}
.icl-reqs{margin-top:14px}
.icl-req{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;background:#fff8ee;border:1px solid #e5d3a1;border-radius:11px;padding:10px 13px;margin-bottom:8px}
.icl-req-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.icl-req-name{font-size:.86rem;font-weight:800;color:var(--ink)}
.icl-req-type{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8a6d2f;background:#f3e6c8;border-radius:100px;padding:1px 7px;margin-left:6px}
.icl-req-meta{font-size:.76rem;color:var(--muted)}
.icl-req-act{display:flex;align-items:center;gap:7px;flex-shrink:0}
.icl-req-yes{height:32px;padding:0 14px;border:none;border-radius:8px;background:var(--green);color:#fff;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-req-yes:hover{filter:brightness(1.08)}
.icl-req-no{height:32px;padding:0 12px;border:1px solid var(--line-warm);border-radius:8px;background:#fff;color:var(--red);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.icl-req-wait{font-size:.74rem;font-weight:800;color:#8a6d2f;background:#f3e6c8;border-radius:100px;padding:4px 11px;white-space:nowrap}
.icl-progress{display:flex;align-items:center;gap:10px;min-width:150px}
.icl-pct{font-size:.86rem;font-weight:800;color:#8a6d2f;white-space:nowrap}
.icl-pct.done{color:var(--green)}
.icl-bar{width:110px;height:8px;border-radius:100px;background:#e6e1d6;overflow:hidden}
.icl-bar-fill{height:100%;background:linear-gradient(90deg,#E8D5AE,var(--gold));transition:width .35s ease}
.icl-bar-fill.done{background:linear-gradient(90deg,#5FB88A,var(--green))}
.icl-payline{margin:0 0 10px;background:var(--ink);color:#fff;border-radius:9px;padding:9px 13px;font-size:.82rem;font-weight:600}
.icl-payline b{color:var(--gold);font-weight:800}
.icl-sec{margin:14px 0 8px;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#4a5270;display:flex;align-items:center;gap:8px}
.icl-sec-n{background:#e6e1d6;color:#4a5270;border-radius:100px;padding:1px 8px;font-size:.68rem}
.icl-sec-addon{color:#7c3aed}
.icl-sec-addon .icl-sec-n{background:#efe7fc;color:#7c3aed}
.icl-list{display:flex;flex-direction:column;gap:8px}
.icl-row{background:#fff;border:1px solid #e2ddd2;border-left:3px solid var(--icl-c);border-radius:11px;overflow:hidden}
.icl-row.done{background:#f2f9f4;border-color:#bfe0c9;border-left-color:var(--green)}
.icl-main{display:flex;align-items:center;gap:13px;padding:10px 12px}
.icl-ring{border:none;background:none;padding:0;cursor:pointer;flex-shrink:0;border-radius:50%;line-height:0}
.icl-ring:disabled{cursor:default}
.icl-ring:not(:disabled):hover .icl-ring-svg{transform:scale(1.06)}
.icl-ring-svg{transition:transform .12s}
.icl-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.icl-name{font-size:.88rem;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icl-step{font-size:.78rem;color:var(--muted)}
.icl-step.done{color:var(--green);font-weight:700}
.icl-step b{color:#8a6d2f;font-weight:800}
.icl-step-done{color:var(--green);font-weight:700}
.icl-pay{font-size:.84rem;font-weight:800;color:var(--ink);flex-shrink:0;font-variant-numeric:tabular-nums}
.icl-acts{display:flex;align-items:center;gap:4px;flex-shrink:0}
.icl-noteb,.icl-undo,.icl-del{width:32px;height:32px;border:1px solid #e2ddd2;background:#fff;border-radius:8px;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
.icl-noteb:hover,.icl-undo:hover{border-color:var(--icl-c);color:var(--ink)}
.icl-noteb.has{background:#fff8ee;border-color:#e5d3a1;color:#8a6d2f}
.icl-del:hover{border-color:#e0b0a8;color:var(--red);background:#fbeceb}
.icl-note{padding:0 12px 11px 55px}
.icl-note-in{width:100%;border:1px solid var(--line-warm);border-radius:8px;background:var(--bg-paper);color:var(--ink);padding:8px 10px;font-size:.8rem;font-family:inherit;outline:none;resize:vertical}
.icl-note-in:focus{border-color:var(--icl-c)}
.icl-note-show{border:1px solid #e5d3a1;background:#fff8ee;border-radius:8px;color:#7a5f1f;padding:7px 11px;font-size:.78rem;text-align:left;width:100%;cursor:pointer;font-family:inherit}
.icl-note-ro{font-size:.78rem;color:var(--muted)}
.icl-addbtn{margin-top:12px;height:40px;width:100%;border:1.5px dashed #b9c8de;background:#f4f7fb;color:#3a4a72;border-radius:10px;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-addbtn:hover{border-color:#4b6a9b;background:#eef3fa}
.icl-addform{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#f4f7fb;border:1px solid #ccd6e6;border-radius:10px;padding:10px}
.icl-add-in{flex:2;min-width:180px;height:38px;border:1px solid var(--line-warm);border-radius:8px;padding:0 11px;font-size:.82rem;font-family:inherit;outline:none}
.icl-add-sel,.icl-add-pay{height:38px;border:1px solid var(--line-warm);border-radius:8px;padding:0 10px;font-size:.82rem;font-family:inherit;outline:none;background:#fff}
.icl-add-pay{width:100px}
.icl-add-save{height:38px;padding:0 18px;border:none;border-radius:8px;background:var(--green);color:#fff;font-size:.8rem;font-weight:800;cursor:pointer;font-family:inherit}
.icl-add-save:disabled{opacity:.5;cursor:default}
.icl-add-cancel{height:38px;padding:0 14px;border:1px solid var(--line-warm);border-radius:8px;background:#fff;color:#4a5270;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.icl-empty{padding:20px;text-align:center;color:var(--muted);font-size:.86rem}
.icl-ro{margin-top:12px;font-size:.74rem;color:var(--muted);font-style:italic}
`;
