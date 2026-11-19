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

@media (max-width:600px){
  .woe-row{align-items:flex-start;flex-direction:column;gap:7px}
  .woe-lbl{min-width:0}
  .woe-assign{width:100%}
  .woe-sel{flex:1 1 auto;min-width:0}
}
`;
