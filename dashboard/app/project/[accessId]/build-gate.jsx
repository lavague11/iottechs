"use client";

// Shared "Build" gate for the Consulting tools (Site Survey, Mockup). A tool shows this instead of
// its editor until the office opts in — an empty/skipped tool never shows as a big UI eyesore, and
// the Consulting phase reads as BUILDING the system. One consistent style everywhere; only the icon
// and hint are tool-specific.
export default function BuildGate({ onBuild, icon, hint, label = "Build" }) {
  return (
    <div className="ss-embed-frame bgate">
      <button type="button" className="bgate-btn" onClick={onBuild}>
        {icon}
        {label}
      </button>
      {hint && <div className="bgate-hint">{hint}</div>}
      <style>{BGATE_CSS}</style>
    </div>
  );
}

// Selectors are scoped as .bgate .bgate-btn so the gold fill wins over the deck's generic
// ".ss-embed button" reset (which otherwise strips the background).
const BGATE_CSS = `
.ss-embed-frame.bgate{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-height:210px;padding:38px 20px;text-align:center}
.bgate .bgate-hint{margin:0 auto}
.bgate .bgate-btn{display:inline-flex;align-items:center;gap:9px;height:46px;padding:0 26px;border:none;border-radius:11px;
  background:linear-gradient(180deg,#E8CB94,#C9A96E);color:#0B0F1A;font-size:.94rem;font-weight:700;cursor:pointer;
  font-family:inherit;box-shadow:0 10px 26px -14px rgba(201,169,110,.9);transition:filter .12s,transform .12s}
.bgate .bgate-btn:hover{filter:brightness(1.04);transform:translateY(-1px);background:linear-gradient(180deg,#E8CB94,#C9A96E)}
.bgate .bgate-btn svg{flex:0 0 auto}
.bgate .bgate-hint{font-size:.82rem;color:var(--dv-meta,#787D84);max-width:36ch;line-height:1.5}
`;
