// Styles for the Service Call diagnosis panel (svc-diagnose.jsx) — extracted to keep that file lean.
export const CSS = `
.apx .sd-save{margin-left:auto;font-size:.74rem;font-weight:600;color:var(--muted)}
.apx .sd-err{color:#c9382b}
.apx .sd-muted{color:var(--muted)}
.apx .sd-link{font-size:.78rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:5px 12px}
.apx .sd-link:hover{border-color:#C9A96E;background:#f8f0e0}
.apx .sd-locked{display:flex;align-items:center;gap:10px;font-size:.82rem;font-weight:700;color:#1c8a45;background:#e7f6ec;border-radius:9px;padding:8px 12px;margin-bottom:12px}
.apx .sd-ghost{margin-left:auto;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px 10px;font:inherit;font-size:.76rem;font-weight:700;cursor:pointer;color:var(--ink)}

.apx .sd-visit{margin-bottom:12px}
.apx .sd-visit-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.apx .sd-visit-t{font-size:.86rem;font-weight:600;color:var(--ink)}
.apx .sd-visit-t b{font-weight:800}
.apx .sd-visit-t em{font-style:normal;color:var(--gold-deep,#b08f4f);font-weight:700}
.apx .sd-more{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;letter-spacing:1px;padding:2px 8px;border-radius:8px;line-height:1}
.apx .sd-more:hover{background:var(--bg-soft,#f4f4f2);color:var(--ink)}
.apx .sd-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
@media(max-width:640px){.apx .sd-meta{grid-template-columns:1fr 1fr}}
.apx .sd-f{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--muted)}
.apx .sd-f .apx-input{height:36px;padding:0 9px;font-size:.84rem}
.apx .sd-warranty{display:inline-block;font-size:.74rem;font-weight:800;border-radius:20px;padding:3px 10px;margin-bottom:10px}
.apx .sd-warranty.in{color:#1c8a45;background:#e7f6ec}
.apx .sd-warranty.out{color:#b3541e;background:#fdf0e5}

.apx .sd-sec{margin-bottom:12px}
.apx .sd-equip{margin-top:4px}
.apx .sd-lab{display:block;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.apx .sd-issues-lab{margin-top:14px}
.apx .sd-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.apx .sd-dev{font-size:.78rem;font-weight:600;color:var(--ink);background:var(--bg-soft,#f4f4f2);border:1px solid var(--line);border-radius:20px;padding:6px 11px}
.apx .sd-dev-nvr{background:#f8f0e0;color:#8a6d2f}
.apx .sd-nodev{font-size:.8rem}
.apx .sd-adddev .apx-input{height:34px;width:130px;padding:0 10px;font-size:.8rem;border-radius:20px}
.apx .sd-survey-link{margin-left:10px;font-size:.72rem;font-weight:700;color:var(--gold-deep,#b08f4f);text-decoration:none;text-transform:none;letter-spacing:0}
.apx .sd-survey-link:hover{text-decoration:underline}

/* Field row — the compact answer view */
.apx .sd-fr{width:100%;display:flex;align-items:center;gap:10px;padding:9px 12px;background:#fff;border:1px solid var(--line);border-radius:10px;cursor:pointer;font-family:inherit;text-align:left;margin-bottom:6px;min-height:40px}
.apx .sd-fr:hover:not(:disabled){border-color:#C9A96E}
.apx .sd-fr:disabled{cursor:default;opacity:.85}
.apx .sd-fr-l{font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);min-width:88px;flex-shrink:0}
.apx .sd-fr-v{font-size:.86rem;font-weight:600;color:var(--ink);flex:1}
.apx .sd-fr-v em{font-style:normal;color:var(--muted);font-weight:500}
.apx .sd-fr.cause.has .sd-fr-v{color:var(--gold-deep,#b08f4f);font-weight:700}
.apx .sd-fr.ok.has .sd-fr-v{color:#1c8a45;font-weight:700}
.apx .sd-fr.warn.has .sd-fr-v{color:#b3541e;font-weight:700}
.apx .sd-fr-x{color:var(--muted);flex-shrink:0}
.apx .sd-fr-hint{font-size:.72rem;color:var(--muted);flex-shrink:0}

/* Quick diagnose */
.apx .sd-quick{display:flex;gap:8px;align-items:center;margin:6px 0 14px}
.apx .sd-quick .sd-mf{flex:1}
.apx .sd-quick-go{white-space:nowrap}

/* Issue card */
.apx .sd-issue{border:1px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:visible;background:#fff}
.apx .sd-issue.open{border-color:#C9A96E}
.apx .sd-issue-h{display:flex;align-items:center}
.apx .sd-issue-tap{flex:1;display:flex;align-items:center;gap:9px;padding:11px 6px 11px 13px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink);min-width:0}
.apx .sd-issue-tap b{font-size:.85rem;font-weight:800;flex-shrink:0}
.apx .sd-issue-sum{font-size:.82rem;font-weight:600;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.apx .sd-issue-chev{color:var(--muted);flex-shrink:0}
.apx .sd-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.apx .sd-dot.ok{background:#1c8a45}
.apx .sd-dot.warn{background:#d69220}
.apx .sd-dot.muted{background:#c2c7d0}
.apx .sd-menu-wrap{position:relative;flex-shrink:0}
.apx .sd-menu-b{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;letter-spacing:1px;padding:8px 12px;border-radius:8px;line-height:1}
.apx .sd-menu-b:hover{background:var(--bg-soft,#f4f4f2);color:var(--ink)}
.apx .sd-menu{position:absolute;top:100%;right:8px;z-index:20;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px -12px rgba(14,19,32,.35);padding:5px;min-width:130px}
.apx .sd-menu button{display:block;width:100%;text-align:left;background:none;border:none;font:inherit;font-size:.82rem;font-weight:600;color:var(--ink);padding:8px 10px;border-radius:7px;cursor:pointer}
.apx .sd-menu button:hover{background:var(--bg-soft,#f4f4f2)}
.apx .sd-menu button.danger{color:#c9382b}
.apx .sd-issue-b{padding:6px 13px 13px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:2px}
.apx .sd-issue-b .sd-mf{margin:2px 0 6px}

/* Tests sub-list */
.apx .sd-tests{display:flex;flex-direction:column;gap:5px;margin:0 0 8px}
.apx .sd-test{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.apx .sd-test-nm{font-size:.82rem;font-weight:600;color:var(--ink);flex:1;min-width:120px}
.apx .sd-test-nm em{font-style:normal;color:var(--muted);font-weight:500;font-size:.74rem;margin-left:5px}
.apx .sd-test-r{font-size:.68rem;font-weight:800;letter-spacing:.04em;padding:4px 9px;border-radius:14px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer;font-family:inherit;min-width:78px}
.apx .sd-test-r.r-PASS{background:#1c8a45;border-color:#1c8a45;color:#fff}
.apx .sd-test-r.r-FAIL{background:#c9382b;border-color:#c9382b;color:#fff}
.apx .sd-test-r.r-NOTTESTED{background:#f4f4f2;color:#8a94a8}
.apx .sd-test-re,.apx .sd-test-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:4px 6px;border-radius:6px}
.apx .sd-test-re:hover,.apx .sd-test-x:hover{background:var(--bg-soft,#f4f4f2);color:var(--ink)}
.apx .sd-test-note{height:32px;padding:0 9px;font-size:.8rem;border-left:3px solid #c9382b;flex-basis:100%}

.apx .sd-perdev{margin:4px 0 8px}
.apx .sd-perdev>summary{font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);cursor:pointer;padding:4px 0}
.apx .sd-devrows{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.apx .sd-devrow{display:grid;grid-template-columns:minmax(90px,1.2fr) 130px repeat(auto-fit,minmax(80px,1fr));gap:6px;align-items:center}
.apx .sd-devrow b{font-size:.8rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apx .sd-devrow .apx-input{height:32px;padding:0 8px;font-size:.78rem}
@media(max-width:640px){.apx .sd-devrow{grid-template-columns:1fr 1fr}.apx .sd-devrow b{grid-column:1/-1}}

.apx .sd-mf{position:relative}
.apx .sd-mf .apx-input{padding-right:34px}
.apx .sd-mf-mic{position:absolute;right:6px;top:6px;display:inline-flex}
.apx .sd-mf textarea.apx-input{padding-top:8px;font-size:.86rem;resize:vertical}
.apx .sd-extra{margin-top:12px;display:flex;flex-direction:column;gap:8px}
.apx .sd-internal-wrap .apx-input{background:#fbf8f0;border-style:dashed}
.apx .sd-addnote{margin-top:8px;background:none;border:1px dashed var(--line);border-radius:9px;padding:8px 12px;font:inherit;font-size:.8rem;font-weight:700;color:var(--muted);cursor:pointer}
.apx .sd-addnote:hover{border-color:#C9A96E;color:var(--ink)}

.apx .sd-photos{margin-top:12px}
.apx .sd-photos.compact{margin:4px 0 8px}
.apx .sd-photo-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.apx .sd-photo{position:relative;width:132px;display:flex;flex-direction:column;gap:4px}
.apx .sd-photo img{width:132px;height:96px;object-fit:cover;border-radius:9px;border:1px solid var(--line)}
.apx .sd-photo-x{position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(16,20,24,.7);color:#fff;font-size:15px;line-height:1;cursor:pointer}
.apx .sd-photo-cat{height:28px;padding:0 6px;font-size:.72rem}
.apx .sd-photo-capin{height:28px;padding:0 8px;font-size:.76rem}
.apx .sd-photo-cap{font-size:.72rem;color:var(--muted)}
.apx .sd-photo-add{width:132px;height:96px;border:1.5px dashed var(--line);border-radius:9px;background:none;color:var(--gold-deep,#b08f4f);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
.apx .sd-photos.compact .sd-photo,.apx .sd-photos.compact .sd-photo img,.apx .sd-photos.compact .sd-photo-add{width:96px}
.apx .sd-photos.compact .sd-photo img,.apx .sd-photos.compact .sd-photo-add{height:72px}
.apx .sd-photo-add:hover{border-color:#C9A96E;background:#fdfaf2}

.apx .sd-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.apx .sd-sign{display:flex;gap:6px;align-items:center;margin-left:auto}
.apx .sd-sign .apx-input{height:38px;width:170px;padding:0 10px;font-size:.84rem}
.apx .sd-mini{font-size:.72rem;font-weight:800;color:var(--muted);background:none;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-family:inherit;padding:6px 10px}
.apx .sd-mini:hover{color:var(--ink);border-color:#C9A96E}
.apx .sd-survey-btn{color:var(--gold-deep,#b08f4f)}

/* Selector sheet */
.apx .sd-sel{width:100%;max-width:440px;max-height:82vh;background:#fff;border-radius:18px;padding:18px 18px 14px;display:flex;flex-direction:column;box-shadow:0 30px 80px -30px rgba(14,19,32,.5);color:var(--ink)}
.apx .sd-sel-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.apx .sd-sel-h b{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.08rem}
.apx .sd-sel-x{background:none;border:none;font-size:1.05rem;color:var(--muted);cursor:pointer;width:30px;height:30px;border-radius:8px}
.apx .sd-sel-x:hover{background:var(--bg-soft,#f4f4f2)}
.apx .sd-sel-q{height:38px;margin-bottom:10px;font-size:.86rem}
.apx .sd-sel-list{overflow-y:auto;display:flex;flex-direction:column;gap:4px;flex:1}
.apx .sd-sel-grp{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:8px 2px 2px}
.apx .sd-sel-opt{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit;font-size:.86rem;font-weight:600;color:var(--ink);cursor:pointer;text-align:left}
.apx .sd-sel-opt:hover{border-color:#C9A96E}
.apx .sd-sel-opt.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.apx .sd-sel-none{font-size:.84rem;color:var(--muted);padding:14px 4px;text-align:center}
.apx .sd-sel-extra{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.apx .sd-sel-foot{margin-top:10px;display:flex;justify-content:flex-end}
@media(max-width:560px){
  .apx .svc-ov .sd-sel{max-width:none;position:fixed;left:0;right:0;bottom:0;border-radius:18px 18px 0 0;max-height:86vh}
}

.sd-pick{width:100%;max-width:560px;max-height:90vh;overflow-y:auto;background:#fff;border-radius:18px;padding:24px 22px;position:relative;box-shadow:0 30px 80px -30px rgba(14,19,32,.5);color:var(--ink)}
.sd-pick-x{position:absolute;top:13px;right:15px;background:none;border:none;font-size:1.05rem;color:var(--muted);cursor:pointer;width:30px;height:30px;border-radius:8px}
.sd-pick-x:hover{background:var(--bg-soft,#f4f4f2)}
.sd-pick h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.2rem;margin:0 0 14px}
.sd-pick-fl-nm{font-size:.78rem;font-weight:700;color:var(--muted);margin:10px 0 4px}
.sd-pick-plan{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg-soft,#f4f4f2)}
.sd-pick-plan img{display:block;width:100%}
.sd-pick-noimg{padding:40px;text-align:center;color:var(--muted);font-size:.85rem}
.sd-pick-dot{position:absolute;transform:translate(-50%,-50%);min-width:26px;height:26px;padding:0 6px;border-radius:13px;border:2px solid #fff;background:#5a6378;color:#fff;font-size:.66rem;font-weight:800;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.4)}
.sd-pick-dot.on{background:var(--gold-deep,#b08f4f);outline:2px solid var(--gold,#C9A96E);outline-offset:1px}
.sd-pick-foot{display:flex;align-items:center;justify-content:space-between;margin-top:16px;font-size:.84rem;color:var(--muted)}
`;
