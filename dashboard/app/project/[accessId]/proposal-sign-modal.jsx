"use client";
import { useState, useEffect, useMemo } from "react";

// Shared IOT TECHS signature tool (ported from IOT-Techs_Signature-Tool.html): a DocuSign-style
// typed-signature flow used everywhere a signature is captured — the customer accepting a
// proposal option AND the technician accepting a work order. The signer types their full name,
// it renders in a cursive script, they check the agreement box, then "Approve & Sign" rasterizes
// the typed name to a PNG data URL (via canvas) that is stored and imported into the PDF.
const DEFAULT_AGREE = "I have reviewed and agree to the document referenced above, and I authorize it to proceed.";

function titleCase(s) {
  return String(s || "").replace(/(^|[\s'\-.])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}
// Rasterize a typed name into a cursive-script PNG, mirroring the reference tool's typedToImg.
function typedToImg(name) {
  const c = document.createElement("canvas");
  c.width = 760; c.height = 150;
  const x = c.getContext("2d");
  x.fillStyle = "#10204a"; x.textBaseline = "middle"; x.textAlign = "left";
  const font = (s) => `italic ${s}px "Brush Script MT","Snell Roundhand","Segoe Script","Lucida Handwriting",cursive`;
  let size = 72; x.font = font(size);
  while (x.measureText(name).width > 720 && size > 26) { size -= 4; x.font = font(size); }
  x.fillText(name, 14, 84);
  return c.toDataURL("image/png");
}

export default function ProposalSignModal({
  open, heading, subheading, reference, defaultName, showTitle = false,
  agreeText = DEFAULT_AGREE, accent = "var(--gold)", busy, onConfirm, onCancel,
}) {
  const [name, setName] = useState(defaultName || "");
  const [jobTitle, setJobTitle] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => { if (open) { setName((n) => n || defaultName || ""); setAgree(false); } }, [open, defaultName]);

  const clean = titleCase(name).trim();
  const canSign = clean.length >= 2 && agree && !busy;
  const previewFont = useMemo(() => `'Brush Script MT','Snell Roundhand','Segoe Script','Lucida Handwriting',cursive`, []);

  function confirm() {
    if (!canSign) return;
    onConfirm?.({ name: clean, title: titleCase(jobTitle).trim(), data: typedToImg(clean) });
  }

  if (!open) return null;
  return (
    <div className="psm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <style>{PSM_CSS}</style>
      <div className="psm-card" role="dialog" aria-modal="true" style={{ "--accent": accent }}>
        <div className="psm-ribbon"><span className="psm-tag">SIGN</span>{heading || "Review & approve"}</div>
        <div className="psm-body">
          {subheading && <div className="psm-sub">{subheading}{reference ? ` · ${reference}` : ""}</div>}

          <div className="psm-row">
            <div className="psm-field">
              <label>Full Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(clean)} placeholder="Your full name" autoComplete="name" />
            </div>
            {showTitle && (
              <div className="psm-field">
                <label>Title (optional)</label>
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Technician, Lead…" />
              </div>
            )}
          </div>

          <div className="psm-preview">
            {clean ? <span style={{ fontFamily: previewFont }}>{clean}</span> : <span className="psm-ph">Your typed signature appears here</span>}
          </div>

          <label className="psm-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{agreeText}</span>
          </label>

          <div className="psm-actions">
            <button type="button" className="psm-btn go" disabled={!canSign} onClick={confirm}>
              {busy ? "Signing…" : (
                <>
                  <svg className="psm-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
                  Approve &amp; Sign
                </>
              )}
            </button>
            <button type="button" className="psm-clear" onClick={() => { setName(""); setAgree(false); }}>Clear</button>
            <button type="button" className="psm-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
          <div className="psm-fine">By signing electronically, you agree your electronic signature is the legal equivalent of your handwritten signature.</div>
        </div>
      </div>
    </div>
  );
}

const PSM_CSS = `
.psm-overlay{position:fixed;inset:0;z-index:12000;background:rgba(11,15,26,.55);backdrop-filter:blur(3px);
  display:flex;align-items:center;justify-content:center;padding:20px;animation:psmFade .16s ease}
@keyframes psmFade{from{opacity:0}to{opacity:1}}
.psm-card{width:min(480px,96vw);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;
  box-shadow:0 16px 44px rgba(16,20,24,.16);overflow:hidden;
  font-family:var(--font);animation:psmPop .18s ease}
@keyframes psmPop{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.psm-ribbon{display:flex;align-items:center;gap:10px;background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);padding:12px 18px;font-weight:600;font-size:.86rem;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.psm-tag{background:#F7DC6F;color:#1f1a05;font-weight:600;font-size:.62rem;padding:3px 9px;border-radius:20px;letter-spacing:.06em;border:1px solid #3E6FB0}
.psm-body{padding:20px}
.psm-sub{font-size:.8rem;font-weight:500;color:var(--dv-meta,#787D84);margin-bottom:14px}
.psm-row{display:flex;gap:14px;flex-wrap:wrap}
.psm-field{flex:1 1 200px;min-width:170px}
.psm-field label{display:block;font-size:.62rem;letter-spacing:.05em;color:var(--dv-meta,#787D84);font-weight:600;margin-bottom:5px;text-transform:uppercase}
.psm-field input{width:100%;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:11px 12px;font-size:.9rem;color:var(--ink);background:var(--dv-raise,#FBFBFA);font-family:inherit;outline:none}
.psm-field input:focus{border-color:var(--dv-gold,#C9A96E)}
.psm-preview{height:100px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-paper,#F4F4F2);display:flex;align-items:center;justify-content:center;margin-top:14px;overflow:hidden}
.psm-preview span{font-size:3rem;color:var(--dv-ink,#101418);line-height:1;padding:0 16px;white-space:nowrap}
.psm-preview .psm-ph{font-family:inherit;font-size:.82rem;color:var(--dv-faint,#A1A6AC);font-style:italic}
.psm-agree{display:flex;align-items:flex-start;gap:9px;margin:16px 0 6px;font-size:.78rem;color:var(--dv-ink-soft,#3A4048);line-height:1.55;cursor:pointer}
.psm-agree input{width:17px;height:17px;margin-top:1px;accent-color:var(--dv-ink,#101418);flex:0 0 auto}
.psm-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.psm-btn{border:none;border-radius:9px;font-size:.86rem;font-weight:600;cursor:pointer;font-family:inherit;padding:13px 22px;transition:transform .12s}
/* The signable action — DocuSign signing-field style: soft yellow fill, blue field border. */
.psm-btn.go{display:inline-flex;align-items:center;gap:8px;background:#F7DC6F;color:#1f1a05;font-weight:600;border:2px solid #3E6FB0;box-shadow:none;padding:11px 20px}
.psm-btn.go:hover{transform:none;background:#F2D45A;filter:none}
.psm-btn.go:disabled{background:var(--dv-line,#E4E4DF);color:var(--dv-faint,#A1A6AC);border-color:var(--dv-line,#E4E4DF);cursor:not-allowed;transform:none;filter:none}
.psm-ico{flex:0 0 auto}
.psm-btn.ghost{background:transparent;border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-meta,#787D84);padding:12px 18px}
.psm-btn.ghost:hover{transform:none;border-color:var(--dv-faint,#A1A6AC);color:var(--dv-ink,#101418)}
.psm-btn.ghost:disabled{opacity:.5;cursor:default}
.psm-clear{background:none;border:none;color:var(--dv-meta,#787D84);font-weight:500;font-size:.76rem;cursor:pointer;text-decoration:underline;font-family:inherit}
.psm-fine{font-size:.66rem;color:var(--dv-faint,#A1A6AC);margin-top:12px;line-height:1.5}
`;
