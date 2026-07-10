"use client";

// Reusable "are you sure?" dialog. Parent controls `open` + handlers.
// Deletes across the app route through the archive, so the copy reassures the user
// the item is recoverable from Archives rather than gone for good.
export default function ConfirmDialog({
  open,
  title = "Delete this?",
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="cfd-bg" onClick={(e) => { if (e.target.classList.contains("cfd-bg")) onCancel(); }}>
      <style>{CFD_CSS}</style>
      <div className="cfd-box">
        <div className="cfd-title">{title}</div>
        <div className="cfd-msg">{message}</div>
        <div className="cfd-actions">
          <button className="cfd-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="cfd-confirm" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const CFD_CSS = `
.cfd-bg{position:fixed;inset:0;background:rgba(14,19,32,.45);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:3000;padding:20px;font-family:'Hanken Grotesk',sans-serif}
.cfd-box{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);animation:cfdIn .16s ease;color:#0e1320}
@keyframes cfdIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.cfd-title{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.2rem;margin-bottom:8px}
.cfd-msg{font-size:.9rem;color:#2C3347;line-height:1.5;margin-bottom:20px}
.cfd-actions{display:flex;justify-content:flex-end;gap:10px}
.cfd-cancel{background:#fff;border:1.5px solid #e6e8ee;border-radius:9px;padding:9px 16px;font-size:.85rem;font-weight:600;font-family:inherit;cursor:pointer;color:#0e1320}
.cfd-confirm{background:#e74c3c;border:none;border-radius:9px;padding:9px 18px;font-size:.85rem;font-weight:700;font-family:inherit;cursor:pointer;color:#fff}
.cfd-confirm:disabled,.cfd-cancel:disabled{opacity:.55;cursor:default}
`;
