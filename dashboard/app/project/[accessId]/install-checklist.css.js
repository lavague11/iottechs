// Styles for the Installation Work Order checklist (rendered via <style>{ICL_CSS}</style>).
// Restyled to the deck theme: flat, neutral, thin lines, ink primary button, restrained gold,
// semantic green/red. Deck tokens carry hex fallbacks so it also holds on the legacy page.
export const ICL_CSS = `
.icl-root{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:14px;padding:16px 16px 18px;font-family:inherit}
.icl-root.done{border-color:#cfe6d8}
.icl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.icl-title{display:block;font-size:1rem;font-weight:600;color:var(--dv-ink,#101418)}
.icl-sub{font-size:.8rem;color:var(--dv-meta,#787D84)}
.icl-head-r{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.icl-pricebtn{height:32px;padding:0 13px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink-soft,#3A4048);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.icl-pricebtn.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.icl-undoall{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink-soft,#3A4048);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.icl-undoall:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-ink,#101418)}
.icl-crew{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:8px 12px;margin:0 0 12px}
.icl-crew-lbl{font-size:.66rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);flex-shrink:0}
.icl-crew-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.icl-crew-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink,#101418);font-size:.78rem;font-weight:600;border-radius:100px;padding:4px 6px 4px 10px}
.icl-crew-x{width:16px;height:16px;border:none;border-radius:50%;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84);font-size:.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.icl-crew-x:hover{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.icl-crew-none{color:var(--dv-faint,#A1A6AC);font-weight:500;font-style:italic;font-size:.8rem}
.icl-crew-add{display:flex;gap:6px;align-items:center;margin-left:auto}
.icl-crew-in{width:150px;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink,#101418);padding:0 9px;font-size:.76rem;font-family:inherit;outline:none}
.icl-crew-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-crew-addbtn{height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);border-radius:8px;font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-crew-addbtn:disabled{opacity:.5;cursor:default}
.icl-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.icl-sum-cell{flex:1;min-width:150px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
.icl-sum-k{font-size:.66rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.icl-sum-v{font-size:1.12rem;font-weight:700;color:var(--dv-ink,#101418);display:flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums}
.icl-sum-sub{font-size:.68rem;color:var(--dv-faint,#A1A6AC)}
.icl-sum-unit{font-size:.72rem;font-weight:600;color:var(--dv-faint,#A1A6AC);margin-left:1px}
.icl-hrs-in{width:58px;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:1rem;font-weight:700;text-align:center;padding:0 4px;font-family:inherit;outline:none}
.icl-hrs-in.wide{width:82px;text-align:left}
.icl-hrs-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-paywrap{display:flex;align-items:center;gap:8px;flex-shrink:0}
.icl-earn{font-size:.82rem;font-weight:700;color:var(--dv-green,#2E7D5B);font-variant-numeric:tabular-nums;white-space:nowrap}
.icl-earn.done{color:var(--dv-green,#2E7D5B)}
.icl-earn-of{color:var(--dv-faint,#A1A6AC);font-weight:500}
.icl-payprog{background:#e9f3ed;border:1px solid #cfe6d8;border-radius:11px;padding:11px 14px;margin:0 0 12px;display:flex;flex-direction:column;gap:7px}
.icl-pp-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.icl-pp-earned{font-size:.98rem;font-weight:700;color:var(--dv-ink,#101418)}
.icl-pp-of{font-size:.78rem;font-weight:500;color:var(--dv-meta,#787D84)}
.icl-pp-pct{font-size:1.05rem;font-weight:700;color:var(--dv-green,#2E7D5B)}
.icl-pp-bar{height:8px;border-radius:100px;background:#d6ecdd;overflow:hidden}
.icl-pp-fill{height:100%;background:var(--dv-green,#2E7D5B);transition:width .35s ease}
.icl-pp-stats{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:.76rem;color:var(--dv-ink-soft,#3A4048)}
.icl-pp-stats b{color:var(--dv-ink,#101418);font-weight:700}
.icl-eod{margin-top:14px;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:12px}
.icl-eod-btn{height:38px;padding:0 18px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:500;cursor:pointer;font-family:inherit}
.icl-eod-btn:hover{filter:brightness(1.15)}
.icl-eod-log{margin-top:10px;display:flex;flex-direction:column;gap:6px}
.icl-eod-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:8px 11px}
.icl-eod-date{font-size:.8rem;font-weight:600;color:var(--dv-ink,#101418)}
.icl-eod-time{font-weight:500;color:var(--dv-faint,#A1A6AC)}
.icl-eod-meta{font-size:.76rem;color:var(--dv-green,#2E7D5B);font-weight:600}
.icl-eod-cum{color:var(--dv-faint,#A1A6AC);font-weight:500}
.icl-eod-del{width:26px;height:26px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:7px;color:var(--dv-red,#C4553D);cursor:pointer;font-size:.72rem;flex-shrink:0}
.icl-eod-del:hover{background:#fbe9e6;border-color:#e3b4ab}
.icl-eod-confirm{display:inline-flex;gap:5px;align-items:center;flex-shrink:0}
.icl-eod-yes{height:24px;padding:0 9px;border:none;border-radius:6px;background:var(--dv-red,#C4553D);color:#fff;font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-eod-no{height:24px;padding:0 9px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;background:#fff;color:var(--dv-ink-soft,#3A4048);font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-eod-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.icl-eod-for{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--dv-meta,#787D84);font-weight:500}
.icl-eod-date-in{height:34px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 9px;font-size:.8rem;font-family:inherit;color:var(--dv-ink,#101418);background:#fff;outline:none}
.icl-eod-date-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-bytech{margin-top:14px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.icl-bytech-hd{font-size:.66rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.icl-bytech-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:.86rem;color:var(--dv-ink,#101418);font-weight:500}
.icl-bytech-row b{color:var(--dv-ink,#101418);font-weight:700;font-variant-numeric:tabular-nums}
.icl-wolog{margin-top:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;overflow:hidden;background:#fff}
.icl-wolog-hd{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--dv-paper,#F4F4F2);border:none;padding:11px 14px;font-size:.72rem;font-weight:600;color:var(--dv-meta,#787D84);cursor:pointer;font-family:inherit;letter-spacing:.04em;text-transform:uppercase}
.icl-wolog-hd:hover{background:var(--dv-line-soft,#EDEDE9)}
.icl-wolog-caret{font-size:.64rem;color:var(--dv-faint,#A1A6AC)}
.icl-wolog-list{display:flex;flex-direction:column;max-height:280px;overflow-y:auto}
.icl-wolog-row{display:flex;align-items:flex-start;gap:9px;padding:8px 14px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.icl-wolog-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.icl-wolog-body{display:flex;flex-direction:column;gap:1px;min-width:0}
.icl-wolog-main{font-size:.8rem;color:var(--dv-ink,#101418)}
.icl-wolog-main b{font-weight:600}
.icl-wolog-time{font-size:.72rem;color:var(--dv-faint,#A1A6AC)}
.icl-pay-edit{display:flex;align-items:center;gap:1px;font-size:.84rem;font-weight:700;color:var(--dv-ink,#101418);flex-shrink:0}
.icl-pay-in{width:58px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.82rem;font-weight:700;text-align:right;padding:0 6px;font-family:inherit;outline:none;font-variant-numeric:tabular-nums}
.icl-pay-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-bulk{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:2px 0 4px}
.icl-bulk-lbl{font-size:.72rem;font-weight:600;color:var(--dv-meta,#787D84);letter-spacing:.03em}
.icl-bulk-btn{height:28px;padding:0 12px;border-radius:100px;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink-soft,#3A4048);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-bulk-btn:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.icl-bulk-btn.all{border-color:#cfe6d8;color:var(--dv-green,#2E7D5B);background:#e9f3ed}
.icl-bulk-btn.all:hover{filter:brightness(.98)}
.icl-bulk-btn.reset{border-color:#e3b4ab;color:var(--dv-red,#C4553D);background:#fff}
.icl-bulk-btn.reset:hover{background:#fbe9e6}
.icl-confirm{display:flex;align-items:center;gap:10px;padding:9px 12px 11px 55px;flex-wrap:wrap}
.icl-confirm span{font-size:.8rem;color:var(--dv-ink-soft,#3A4048)}
.icl-cf-yes{height:30px;padding:0 14px;border:none;border-radius:8px;background:var(--dv-red,#C4553D);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-cf-yes:hover{filter:brightness(1.08)}
.icl-cf-no{height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink-soft,#3A4048);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-addbtn.req{border-color:var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-gold-deep,#A8842F)}
.icl-addbtn.req:hover{border-color:var(--dv-gold,#C9A96E)}
.icl-reqs{margin-top:14px}
.icl-req{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;padding:10px 13px;margin-bottom:8px}
.icl-req-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.icl-req-name{font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418)}
.icl-req-type{font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dv-gold-deep,#A8842F);background:var(--dv-line-soft,#EDEDE9);border-radius:100px;padding:1px 7px;margin-left:6px}
.icl-req-meta{font-size:.76rem;color:var(--dv-meta,#787D84)}
.icl-req-act{display:flex;align-items:center;gap:7px;flex-shrink:0}
.icl-req-yes{height:32px;padding:0 14px;border:none;border-radius:8px;background:var(--dv-green,#2E7D5B);color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-req-yes:hover{filter:brightness(1.08)}
.icl-req-no{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-req-wait{font-size:.74rem;font-weight:600;color:var(--dv-gold-deep,#A8842F);background:var(--dv-line-soft,#EDEDE9);border-radius:100px;padding:4px 11px;white-space:nowrap}
.icl-progress{display:flex;align-items:center;gap:10px;min-width:150px}
.icl-pct{font-size:.86rem;font-weight:700;color:var(--dv-gold-deep,#A8842F);white-space:nowrap}
.icl-pct.done{color:var(--dv-green,#2E7D5B)}
.icl-bar{width:110px;height:8px;border-radius:100px;background:var(--dv-line-soft,#EDEDE9);overflow:hidden}
.icl-bar-fill{height:100%;background:var(--dv-gold,#C9A96E);transition:width .35s ease}
.icl-bar-fill.done{background:var(--dv-green,#2E7D5B)}
.icl-payline{margin:0 0 10px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink,#101418);border-radius:9px;padding:9px 13px;font-size:.82rem;font-weight:500}
.icl-payline b{color:var(--dv-ink,#101418);font-weight:700}
.icl-sec{margin:14px 0 8px;font-size:.72rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);display:flex;align-items:center;gap:8px}
.icl-sec-n{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84);border-radius:100px;padding:1px 8px;font-size:.68rem}
.icl-sec-addon{color:#7c3aed}
.icl-sec-addon .icl-sec-n{background:#efe7fc;color:#7c3aed}
.icl-list{display:flex;flex-direction:column;gap:8px}
.icl-row{background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;overflow:hidden}
.icl-row.done{background:#f4faf6;border-color:#cfe6d8}
.icl-main{display:flex;align-items:center;gap:13px;padding:10px 12px}
.icl-ring{border:none;background:none;padding:0;cursor:pointer;flex-shrink:0;border-radius:50%;line-height:0}
.icl-ring:disabled{cursor:default}
.icl-ring:not(:disabled):hover .icl-ring-svg{transform:scale(1.06)}
.icl-ring-svg{transition:transform .12s}
/* "how far did you get?" step picker — a centered popup (not a clipped dropdown) */
.icl-stepmodal-bg{position:fixed;inset:0;z-index:200;background:rgba(11,15,26,.5);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
.icl-stepmodal{position:relative;width:min(360px,94vw);max-height:80vh;overflow-y:auto;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 24px 60px rgba(16,20,24,.34);padding:16px}
.icl-stepmodal-x{position:absolute;top:12px;right:12px;border:none;background:none;font-size:1rem;color:var(--dv-meta,#787D84);cursor:pointer}
.icl-stepmodal-name{font-size:1rem;font-weight:800;color:var(--dv-ink,#101418);padding-right:24px}
.icl-stepmodal-h{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin:4px 0 8px}
.icl-steppop-opt{width:100%;display:flex;align-items:center;gap:9px;padding:8px 9px;border:none;background:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.82rem;color:var(--dv-ink,#101418);text-align:left}
.icl-steppop-opt:hover{background:var(--dv-paper,#F4F4F2)}
.icl-steppop-opt.reached{color:var(--dv-ink,#101418)}
.icl-steppop-opt.on{background:color-mix(in srgb,var(--icl-c,#C9A96E) 14%,#fff);font-weight:700}
.icl-steppop-n{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);font-size:.66rem;font-weight:800}
.icl-steppop-opt.reached .icl-steppop-n{background:var(--icl-c,#C9A96E);color:#fff}
.icl-steppop-chk{margin-left:auto;color:var(--dv-green,#2E7D5B);font-weight:800}
.icl-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.icl-name{font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icl-step{font-size:.78rem;color:var(--dv-meta,#787D84)}
.icl-step.done{color:var(--dv-green,#2E7D5B);font-weight:600}
.icl-step b{color:var(--dv-gold-deep,#A8842F);font-weight:600}
.icl-step-done{color:var(--dv-green,#2E7D5B);font-weight:600}
.icl-pay{font-size:.84rem;font-weight:700;color:var(--dv-ink,#101418);flex-shrink:0;font-variant-numeric:tabular-nums}
.icl-acts{display:flex;align-items:center;gap:4px;flex-shrink:0}
.icl-noteb,.icl-undo,.icl-del{width:32px;height:32px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:8px;color:var(--dv-meta,#787D84);cursor:pointer;display:flex;align-items:center;justify-content:center}
.icl-noteb:hover,.icl-undo:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-ink,#101418)}
.icl-noteb.has{background:var(--dv-raise,#FBFBFA);border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.icl-del:hover{border-color:#e3b4ab;color:var(--dv-red,#C4553D);background:#fbe9e6}
.icl-note{padding:0 12px 11px 55px}
.icl-note-in{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);padding:8px 10px;font-size:.8rem;font-family:inherit;outline:none;resize:vertical}
.icl-note-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-note-show{border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);border-radius:8px;color:var(--dv-ink-soft,#3A4048);padding:7px 11px;font-size:.78rem;text-align:left;width:100%;cursor:pointer;font-family:inherit}
.icl-note-ro{font-size:.78rem;color:var(--dv-meta,#787D84)}
.icl-addbtn{margin-top:12px;height:40px;width:100%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-addbtn:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.icl-addform{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;padding:10px}
.icl-add-in{flex:2;min-width:180px;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 11px;font-size:.82rem;font-family:inherit;outline:none;background:#fff;color:var(--dv-ink,#101418)}
.icl-add-in:focus{border-color:var(--dv-gold,#C9A96E)}
.icl-add-sel,.icl-add-pay{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 10px;font-size:.82rem;font-family:inherit;outline:none;background:#fff;color:var(--dv-ink,#101418)}
.icl-add-pay{width:100px}
.icl-add-save{height:38px;padding:0 18px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-add-save:disabled{opacity:.5;cursor:default}
.icl-add-cancel{height:38px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink-soft,#3A4048);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.icl-empty{padding:20px;text-align:center;color:var(--dv-meta,#787D84);font-size:.86rem}
.icl-ro{margin-top:12px;font-size:.74rem;color:var(--dv-meta,#787D84);font-style:italic}
`;
