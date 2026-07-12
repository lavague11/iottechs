"use client";

// Full-screen viewer for the branded System QR activation card. Used by the install-stage tool
// and the completion page — tap "View System QR" and the card fills the screen to scan.
export default function SystemQrModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="sqm-bg" onClick={onClose}>
      <button className="sqm-x" onClick={onClose} aria-label="Close">✕</button>
      <img className="sqm-img" src={src} alt="System QR activation card" onClick={(e) => e.stopPropagation()} />
      <style>{`
        .sqm-bg{position:fixed;inset:0;z-index:13000;background:rgba(6,8,14,.93);display:flex;align-items:center;justify-content:center;padding:20px}
        .sqm-x{position:absolute;top:18px;right:22px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:1.1rem;cursor:pointer;line-height:1}
        .sqm-x:hover{background:rgba(255,255,255,.18)}
        .sqm-img{max-width:min(440px,92vw);max-height:92vh;object-fit:contain;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6)}
      `}</style>
    </div>
  );
}
