// Styles for the work order editor. Deck tokens only (--dv-*) with hex fallbacks for the legacy page,
// matching the other tool panels: neutral surfaces, one thin boundary, ink primary, no gold rail.
export const WOE_CSS = `
.woe{font-family:inherit}
.woe-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:0 2px 12px}
.woe-hl{display:flex;align-items:baseline;gap:9px;min-width:0}
.woe-t{font-size:1.02rem;font-weight:800;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.woe-num{font-size:.74rem;font-weight:600;color:var(--dv-faint,#A1A6AC);font-variant-numeric:tabular-nums}
.woe-badge{font-size:.6rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:100px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.woe-badge.signed{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.woe-hr{display:flex;align-items:center;gap:12px}
.woe-save{font-size:.74rem;font-weight:600;color:var(--dv-meta,#787D84)}
.woe-save.ok{color:var(--dv-green,#2E7D5B)}
.woe-save.er{color:var(--dv-red,#C4553D)}
.woe-total{font-size:.95rem;font-weight:800;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}

.woe-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.woe-lbl{font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);min-width:88px}
.woe-chips{display:flex;flex-wrap:wrap;gap:7px;flex:1 1 auto;min-width:0}
.woe-chip{display:inline-flex;align-items:center;gap:6px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:4px 9px 4px 5px;font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418)}
.woe-av{width:20px;height:20px;border-radius:50%;background:var(--dv-ink,#101418);color:#fff;display:grid;place-items:center;font-size:.66rem;font-weight:700}
.woe-chip-x{border:0;background:none;color:var(--dv-meta,#787D84);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px}
.woe-chip-x:hover{color:var(--dv-red,#C4553D)}
.woe-none{font-size:.8rem;color:var(--dv-faint,#A1A6AC)}
.woe-assign{display:inline-flex;gap:7px;align-items:center}
.woe-sel{height:34px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink,#101418);padding:0 9px;font-size:.8rem;font-family:inherit;outline:none}
.woe-sel:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.woe-add{height:34px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font:600 .8rem/1 inherit;cursor:pointer}
.woe-add:disabled{opacity:.45;cursor:default}
.woe-tog{display:inline-flex;align-items:center;gap:8px;font-size:.8rem;color:var(--dv-ink,#101418);cursor:pointer;flex:1 1 auto}
.woe-tog input{width:15px;height:15px;accent-color:var(--dv-ink,#101418);cursor:pointer}
.woe-ib{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);cursor:pointer}
.woe-ib:hover{color:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418)}
.woe-confirm{display:inline-flex;align-items:center;gap:7px;font-size:.76rem;color:var(--dv-meta,#787D84);flex-wrap:wrap}
.woe-keep{height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .72rem/1 inherit;cursor:pointer}
.woe-danger{height:28px;padding:0 11px;border:0;border-radius:100px;background:var(--dv-red,#C4553D);color:#fff;font:600 .72rem/1 inherit;cursor:pointer}

.woe-notes{padding:12px 0 0;border-top:1px solid var(--dv-line-soft,#EDEDE9);margin-top:12px}
.woe-notewrap{position:relative;margin-top:6px;display:flex;gap:8px;align-items:flex-start}
.woe-notes textarea{flex:1 1 auto;min-height:62px;resize:vertical;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);padding:9px 11px;font:inherit;font-size:.84rem;outline:none}
.woe-notes textarea:focus{border-color:var(--dv-gold-text,#8A6A1F)}

.woe-sum{margin-top:14px;display:flex;align-items:center;justify-content:space-between;padding:12px 15px;background:var(--dv-ink,#101418);border-radius:10px;color:#fff;font-size:.9rem;font-weight:700}
.woe-sum span:last-child{color:var(--dv-gold,#C9A96E);font-size:1.05rem;font-variant-numeric:tabular-nums}

.woe-empty{padding:22px;text-align:center;font-size:.84rem;color:var(--dv-meta,#787D84)}
.woe-start{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:18px 2px}
.woe-start p{margin:0;font-size:.84rem;color:var(--dv-meta,#787D84)}
.woe-cta{height:38px;padding:0 20px;border:0;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font:600 .84rem/1 inherit;cursor:pointer}
.woe-cta:disabled{opacity:.5;cursor:default}
.woe-err{margin:0 0 10px;padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}
.woe-note{margin:0 0 10px;padding:8px 11px;border-radius:8px;background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-size:.78rem;font-weight:600}
.woe-drift{margin:0 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-radius:9px;background:#fbf4e3;border:1px solid #ecd9a8;color:#6b5412;font-size:.8rem;font-weight:600}
.woe-pull{margin-left:auto;height:30px;padding:0 14px;border:0;border-radius:8px;background:#C9A96E;color:#1a1205;font:700 .78rem/1 inherit;cursor:pointer}
.woe-pull:disabled{opacity:.5;cursor:default}

/* Installation date/time read from the existing Installation event — never a second scheduler. */
.woe-when{display:inline-flex;align-items:baseline;gap:8px;font-size:.84rem;color:var(--dv-ink,#101418);font-weight:600}
.woe-when i{font-style:normal;font-weight:500;color:var(--dv-meta,#787D84)}
.woe-link{border:0;background:none;padding:0;color:var(--dv-gold-text,#8A6A1F);font:600 .8rem/1 inherit;cursor:pointer;text-decoration:underline}

/* ---- Footer: revision bar, versions, signatures ---- */
.wof{margin-top:14px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.wof-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wof-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;min-width:0}
.wof-badge{font-size:.6rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:100px;background:#fbf4e3;color:#6b5412}
.wof-chg{border:0;background:none;padding:0;cursor:pointer;font:inherit;font-size:.8rem;color:var(--dv-ink,#101418);display:inline-flex;gap:6px;align-items:baseline}
.wof-chg:hover b{text-decoration:underline}
.wof-delta{font-weight:700;color:var(--dv-green,#2E7D5B);font-variant-numeric:tabular-nums}
.wof-delta.neg{color:var(--dv-red,#C4553D)}
.wof-sent{font-size:.8rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wof-vlink{border:0;background:none;padding:0;color:var(--dv-meta,#787D84);font:500 .76rem/1 inherit;cursor:pointer;text-decoration:underline}
.wof-acts{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.wof-cta{height:38px;padding:0 20px;border:0;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font:600 .84rem/1 inherit;cursor:pointer}
.wof-cta.sign{background:var(--dv-green,#2E7D5B)}
.wof-cta:disabled{opacity:.5;cursor:default}
.wof-ghost{height:36px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .8rem/1 inherit;cursor:pointer}
.wof-confirm{display:inline-flex;align-items:center;gap:7px;font-size:.76rem;color:var(--dv-meta,#787D84)}
.wof-keep{height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .72rem/1 inherit;cursor:pointer}
.wof-discard{height:28px;padding:0 11px;border:0;border-radius:100px;background:var(--dv-red,#C4553D);color:#fff;font:600 .72rem/1 inherit;cursor:pointer}
.wof-versions{margin-top:10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;overflow:hidden}
.wof-vrow{display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;padding:8px 12px;font-size:.78rem;color:var(--dv-meta,#787D84);border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.wof-vrow:first-child{border-top:none}
.wof-vrow b{color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.wof-vtag{font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border-radius:100px;background:var(--dv-line-soft,#EDEDE9)}
.wof-vtag.live{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.wof-sigs{margin-top:12px;display:flex;flex-direction:column;gap:8px}
.wof-sig{display:flex;align-items:center;gap:14px;padding:11px 13px;border:1px solid var(--dv-line,#E4E4DF);border-top:2px solid var(--dv-green,#2E7D5B);border-radius:10px;background:var(--dv-raise,#FBFBFA);flex-wrap:wrap}
.wof-sig-mark img{max-height:46px;max-width:170px;object-fit:contain;display:block}
.wof-sig-typed{font-size:1.3rem;color:var(--dv-ink,#101418);font-family:"Brush Script MT","Segoe Script",cursive}
.wof-sig-meta{display:flex;flex-direction:column;gap:1px;font-size:.78rem;color:var(--dv-meta,#787D84);flex:1 1 auto;min-width:0}
.wof-sig-meta b{color:var(--dv-ink,#101418);font-weight:700}
.wof-sig-ctx{font-size:.7rem;color:var(--dv-faint,#A1A6AC)}
.wof-void{height:28px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:#fff;color:var(--dv-meta,#787D84);font:600 .72rem/1 inherit;cursor:pointer}
.wof-void:hover{border-color:var(--dv-red,#C4553D);color:var(--dv-red,#C4553D)}

.wof-ov{position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;background:rgba(16,20,24,.46);padding:20px}
.wof-modal{width:100%;max-width:480px;max-height:90vh;overflow:auto;background:var(--dv-paper,#fff);border:1px solid var(--dv-line,#E4E4DF);border-radius:16px;box-shadow:0 24px 60px rgba(16,20,24,.3);font-family:inherit}
.wof-mh{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dv-line,#E4E4DF);font-size:.98rem;font-weight:800;color:var(--dv-ink,#101418)}
.wof-mh .wof-sub{font-size:.76rem;font-weight:600;color:var(--dv-meta,#787D84)}
.wof-x{margin-left:auto;width:30px;height:30px;border:0;background:none;color:var(--dv-meta,#787D84);font-size:1.5rem;line-height:1;cursor:pointer;border-radius:8px}
.wof-x:hover{background:rgba(16,20,24,.06)}
.wof-mb{padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.wof-mf{display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;border-top:1px solid var(--dv-line,#E4E4DF)}
.wof-cg{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84);margin-top:4px}
.wof-cg.add{color:var(--dv-green,#2E7D5B)} .wof-cg.rem{color:var(--dv-red,#C4553D)}
.wof-cl{display:flex;justify-content:space-between;gap:12px;font-size:.82rem;color:var(--dv-ink,#101418);padding:3px 0}
.wof-cl.col{flex-direction:column;gap:1px}
.wof-cl i{font-style:normal;font-size:.74rem;color:var(--dv-meta,#787D84)}
.wof-cl b{font-variant-numeric:tabular-nums}
.wof-f{display:flex;flex-direction:column;gap:4px;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.wof-f input{height:40px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:#fff;color:var(--dv-ink,#101418);padding:0 11px;font:inherit;font-size:.9rem;text-transform:none;letter-spacing:0;outline:none}
.wof-f input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.wof-pad{position:relative;border:1px dashed var(--dv-line,#E4E4DF);border-radius:10px;background:#fff;height:132px}
.wof-pad canvas{width:100%;height:132px;display:block;touch-action:none;cursor:crosshair}
.wof-clear{position:absolute;top:7px;right:7px;height:26px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font:600 .7rem/1 inherit;cursor:pointer}
.wof-agree{display:flex;gap:9px;align-items:flex-start;font-size:.8rem;color:var(--dv-ink,#101418);cursor:pointer;line-height:1.45}
.wof-agree input{width:16px;height:16px;margin-top:2px;accent-color:var(--dv-green,#2E7D5B);cursor:pointer;flex-shrink:0}
.wof-err{padding:8px 11px;border-radius:8px;background:#fbe9e6;border:1px solid #e3b4ab;color:var(--dv-red,#C4553D);font-size:.78rem;font-weight:600}

@media (max-width:600px){
  .woe-row{align-items:flex-start;flex-direction:column;gap:7px}
  .woe-lbl{min-width:0}
  .woe-assign{width:100%}
  .woe-sel{flex:1 1 auto;min-width:0}
  .wof-row{flex-direction:column;align-items:stretch;gap:10px}
  .wof-acts{justify-content:flex-end}
  .wof-cta{flex:1 1 auto}
  .wof-ov{padding:0;align-items:flex-end}
  .wof-modal{max-width:100%;border-radius:16px 16px 0 0;max-height:94vh}
}
`;
