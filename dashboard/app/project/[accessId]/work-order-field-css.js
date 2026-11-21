// The technician's field view. Sized for a phone held in one hand on a job site: 44px+ tap targets,
// one decision per popup, status carried by colour AND by a word (never colour alone).
export const WFD_CSS = `
.wfd{margin-top:14px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.wfd-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.wfd-checkin{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--dv-ink,#101418);color:#fff;font:700 .88rem/1 inherit;cursor:pointer}
.wfd-checkin:disabled{opacity:.5;cursor:default}
.wfd-in{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:700;color:var(--dv-green,#2E7D5B);background:#e9f3ed;border:1px solid #cfe6d8;border-radius:100px;padding:7px 13px}
.wfd-prog{font-size:.8rem;font-weight:600;color:var(--dv-meta,#787D84);font-variant-numeric:tabular-nums}
.wfd-queue{margin-left:auto;font-size:.72rem;font-weight:700;color:#6b5412;background:#fbf4e3;border:1px solid #ecd9a8;border-radius:100px;padding:5px 11px}
.wfd-hint{font-size:.8rem;color:var(--dv-meta,#787D84);margin-bottom:8px}
.wfd-unassigned{margin-bottom:10px;padding:10px 12px;border-radius:9px;background:#fbf4e3;border:1px solid #ecd9a8;color:#6b5412;font-size:.82rem;font-weight:600;line-height:1.45}
.wfd-unassigned.rejected{background:#fbe9e6;border-color:#e3b4ab;color:var(--dv-red,#C4553D)}

/* Who is on site, and the office's decision about someone who shouldn't be. */
.woc2{margin:12px 0 0}
.woc2-ask{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 13px;margin-bottom:8px;border-radius:10px;background:#fbf4e3;border:1px solid #ecd9a8}
.woc2-ask-t{flex:1 1 220px;min-width:0;font-size:.84rem;color:#6b5412}
.woc2-ask-t b{color:var(--dv-ink,#101418)}
.woc2-ask-b{display:flex;gap:7px;margin-left:auto}
.woc2-no{height:32px;padding:0 12px;border:1px solid #ecd9a8;border-radius:8px;background:#fff;color:#6b5412;font:600 .78rem/1 inherit;cursor:pointer}
.woc2-rej{height:32px;padding:0 12px;border:1px solid #e3b4ab;border-radius:8px;background:#fff;color:var(--dv-red,#C4553D);font:600 .78rem/1 inherit;cursor:pointer}
.woc2-yes{height:32px;padding:0 15px;border:0;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font:700 .78rem/1 inherit;cursor:pointer}
.woc2-no:disabled,.woc2-rej:disabled,.woc2-yes:disabled{opacity:.5;cursor:default}
.woc2-err{margin-bottom:8px;padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.woc2-here{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.woc2-lbl{font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.woc2-chip{display:inline-flex;align-items:baseline;gap:6px;padding:5px 11px;border-radius:100px;background:#e9f3ed;border:1px solid #cfe6d8;font-size:.78rem;color:var(--dv-green,#2E7D5B)}
.woc2-chip b{color:var(--dv-ink,#101418);font-weight:700}
.woc2-chip.pending{background:#fbf4e3;border-color:#ecd9a8;color:#6b5412}
.woc2-chip.rejected{background:var(--dv-line-soft,#EDEDE9);border-color:var(--dv-line,#E4E4DF);color:var(--dv-meta,#787D84)}
.woc2-chip i{font-style:normal;font-size:.66rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.85}

/* ---- End of day, sign-off, close ---- */
.wcl{margin-top:14px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF);display:flex;flex-direction:column;gap:9px}
.wcl-row{display:flex;align-items:center;gap:11px;flex-wrap:wrap;padding:11px 13px;border-radius:10px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF)}
.wcl-row.quiet{background:#fff}
.wcl-row.done{border-top:2px solid var(--dv-green,#2E7D5B)}
.wcl-t{flex:1 1 220px;min-width:0;font-size:.84rem;color:var(--dv-ink,#101418)}
.wcl-t b{font-weight:700}
.wcl-wait{font-size:.8rem;color:var(--dv-meta,#787D84)}
.wcl-when{font-style:normal;font-size:.76rem;color:var(--dv-meta,#787D84)}
.wcl-cta{height:40px;padding:0 18px;border:0;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font:700 .84rem/1 inherit;cursor:pointer;white-space:nowrap}
.wcl-cta.sign{background:var(--dv-green,#2E7D5B)}
.wcl-cta:disabled{opacity:.5;cursor:default}
.wcl-ghost{height:34px;padding:0 13px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-meta,#787D84);font:600 .78rem/1 inherit;cursor:pointer;white-space:nowrap}
.wcl-ghost:hover{border-color:var(--dv-ink,#101418);color:var(--dv-ink,#101418)}
.wcl-confirm{display:inline-flex;align-items:center;gap:7px;font-size:.76rem;color:var(--dv-meta,#787D84)}
.wcl-keep{height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:#fff;color:var(--dv-meta,#787D84);font:600 .72rem/1 inherit;cursor:pointer}
.wcl-danger{height:28px;padding:0 11px;border:0;border-radius:100px;background:var(--dv-red,#C4553D);color:#fff;font:600 .72rem/1 inherit;cursor:pointer}
.wcl-logs{border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;overflow:hidden}
.wcl-lbl{display:block;padding:8px 13px;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);background:var(--dv-paper,#F4F4F2)}
.wcl-log{display:grid;grid-template-columns:1fr auto auto auto;gap:12px;align-items:baseline;padding:9px 13px;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.82rem;color:var(--dv-meta,#787D84)}
.wcl-log b{color:var(--dv-ink,#101418);font-weight:700}
.wcl-ln{font-variant-numeric:tabular-nums}
.wcl-amt{font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.wcl-pending{padding:8px 13px;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:#fbf4e3;color:#6b5412;font-size:.76rem;font-weight:600}
.wcl-closed{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 13px;border-radius:10px;background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-size:.84rem;font-weight:600}
.wcl-closed span{flex:1 1 auto}
.wcl-err{padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.wcl-done{padding:8px 11px;border-radius:8px;background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-size:.78rem;font-weight:600}
@media (max-width:600px){
  .wcl-row{flex-direction:column;align-items:stretch}
  /* In a column flex these would GROW to fill the box, leaving a tall gap above the buttons. */
  .wcl-t,.wcl-closed span,.woc2-ask-t{flex:0 0 auto}
  .wcl-cta,.wcl-ghost{width:100%}
  .wcl-log{grid-template-columns:1fr auto;row-gap:2px}
  .wcl-closed{flex-direction:column;align-items:stretch}
  .woc2-ask{flex-direction:column;align-items:stretch}
  .woc2-ask-b{margin-left:0}
  .woc2-no,.woc2-rej,.woc2-yes{flex:1 1 0}
}
.wfd-err{margin-bottom:10px;padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}

.wfd-lines{display:flex;flex-direction:column;border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;overflow:hidden}
.wfd-line{display:grid;grid-template-columns:12px 1fr auto auto;gap:11px;align-items:center;min-height:52px;padding:10px 13px;border:0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:#fff;font:inherit;text-align:left;cursor:pointer}
.wfd-line:first-child{border-top:none}
.wfd-line:active{background:var(--dv-line-soft,#EDEDE9)}
.wfd-line.complete{background:#f6fbf8}
.wfd-line.attention{background:#fdf6f4}
.wfd-dot{width:10px;height:10px;border-radius:50%;background:var(--dv-faint,#A1A6AC)}
.wfd-dot.complete{background:var(--dv-green,#2E7D5B)}
.wfd-dot.attention{background:var(--dv-red,#C4553D)}
.wfd-name{display:flex;align-items:center;gap:7px;min-width:0;font-size:.88rem;font-weight:600;color:var(--dv-ink,#101418)}
.wfd-tag{font-size:.58rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:100px;background:rgba(201,169,110,.18);color:#6b5412;flex-shrink:0}
.wfd-tag.cam{display:inline-flex;padding:3px 6px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.wfd-state{font-size:.76rem;font-weight:600;color:var(--dv-meta,#787D84);white-space:nowrap}
.wfd-pay{font-size:.82rem;font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;white-space:nowrap}

.wfd-ov{position:fixed;inset:0;z-index:4200;display:flex;align-items:center;justify-content:center;background:rgba(16,20,24,.5);padding:18px}
.wfd-pop{width:100%;max-width:420px;max-height:92vh;overflow:auto;background:var(--dv-paper,#fff);border-radius:16px;box-shadow:0 24px 60px rgba(16,20,24,.32);font-family:inherit}
.wfd-ph{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.wfd-ph b{font-size:1rem;color:var(--dv-ink,#101418);min-width:0}
.wfd-x{margin-left:auto;width:32px;height:32px;border:0;background:none;color:var(--dv-meta,#787D84);font-size:1.6rem;line-height:1;cursor:pointer;border-radius:8px}
.wfd-choices{display:flex;flex-direction:column;gap:8px;padding:14px 16px}
.wfd-choice{height:50px;border:1.5px solid var(--dv-line,#E4E4DF);border-radius:11px;background:#fff;color:var(--dv-ink,#101418);font:700 .92rem/1 inherit;cursor:pointer}
.wfd-choice.on.complete{border-color:var(--dv-green,#2E7D5B);background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.wfd-choice.on.attention{border-color:var(--dv-red,#C4553D);background:#fbe9e6;color:var(--dv-red,#C4553D)}
.wfd-choice.on.incomplete{border-color:var(--dv-ink,#101418);background:var(--dv-line-soft,#EDEDE9)}
.wfd-steps{display:flex;flex-direction:column;gap:6px;padding:0 16px 12px}
.wfd-step{display:flex;align-items:center;gap:10px;height:42px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-meta,#787D84);font:600 .84rem/1 inherit;cursor:pointer;text-align:left}
.wfd-step.on{border-color:var(--dv-green,#2E7D5B);background:#f1f8f4;color:var(--dv-ink,#101418)}
.wfd-step-n{width:22px;height:22px;border-radius:7px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84);display:grid;place-items:center;font-size:.72rem;font-weight:700;flex-shrink:0}
.wfd-step.on .wfd-step-n{background:var(--dv-green,#2E7D5B);color:#fff}
/* Stage 3 — one camera button, thumbnails tagged after the shot, and photos are optional. */
.wfd-shots{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding:0 16px 12px}
.wfd-thumb{margin:0;width:84px}
.wfd-thumb img{width:84px;height:84px;object-fit:cover;border-radius:9px;border:1px solid var(--dv-line,#E4E4DF);display:block}
.wfd-thumb figcaption{margin-top:4px;font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);text-align:center}
.wfd-cam{width:84px;height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);cursor:pointer;font:600 .68rem/1 inherit}
.wfd-tagger{padding:0 16px 12px;display:flex;flex-direction:column;gap:7px}
.wfd-tagger>span{font-size:.72rem;font-weight:700;color:var(--dv-meta,#787D84)}
.wfd-tagrow{display:flex;gap:7px;flex-wrap:wrap}
.wfd-tagrow button{height:36px;padding:0 14px;border:1.5px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);font:700 .8rem/1 inherit;cursor:pointer}
.wfd-tagrow button:hover{border-color:var(--dv-gold,#C9A96E)}
.wfd-tagrow .wfd-tagx{color:var(--dv-meta,#787D84);font-weight:600}
/* The status the steps imply, stated once so the technician can see what Save will record. */
.wfd-derived{padding:0 16px 10px;font-size:.74rem;font-weight:700;color:var(--dv-meta,#787D84)}
.wfd-tag.flag{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.wfd-line.attention .wfd-dot.attention{background:var(--dv-red,#C4553D)}

.wfd-shot{display:flex;flex-direction:column;gap:5px}
.wfd-shot-lbl{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.wfd-shot img{width:100%;height:96px;object-fit:cover;border-radius:9px;border:1px solid var(--dv-line,#E4E4DF);display:block}
.wfd-shot-add{height:96px;border:1.5px dashed var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);cursor:pointer;display:grid;place-items:center}
.wfd-shot-add:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.wfd-note{display:flex;gap:8px;align-items:flex-start;padding:0 16px 12px}
.wfd-note textarea{flex:1 1 auto;min-height:72px;resize:vertical;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);padding:9px 11px;font:inherit;font-size:.88rem;outline:none}
.wfd-note textarea:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.wfd-gate{margin:0 16px 10px;padding:8px 11px;border-radius:8px;background:#fbf4e3;border:1px solid #ecd9a8;color:#6b5412;font-size:.78rem;font-weight:600}
.wfd-pf{display:flex;gap:9px;padding:12px 16px;border-top:1px solid var(--dv-line,#E4E4DF)}
.wfd-cancel{flex:0 0 auto;height:46px;padding:0 18px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:700 .86rem/1 inherit;cursor:pointer}
.wfd-save{flex:1 1 auto;height:46px;border:0;border-radius:10px;background:var(--dv-ink,#101418);color:#fff;font:700 .9rem/1 inherit;cursor:pointer}
.wfd-save:disabled{opacity:.4;cursor:default}

@media (max-width:600px){
  .wfd-ov{padding:0;align-items:flex-end}
  .wfd-pop{max-width:100%;border-radius:16px 16px 0 0;max-height:94vh}
  .wfd-line{grid-template-columns:10px 1fr auto;gap:9px}
  .wfd-pay{grid-column:2/4;justify-self:end;font-size:.76rem}
  .wfd-checkin{flex:1 1 auto}
}
`;
