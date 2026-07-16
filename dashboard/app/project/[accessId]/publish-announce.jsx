"use client";

// Celebratory "it's ready" pop-up for the customer: whenever the office publishes the next thing to
// review (survey → mockup → proposal), this pops once, takes them straight to it, and gets out of the
// way. One at a time — the caller only ever hands us the current published item, and each pops once
// (DB: announced_seen). Dependency-free (own <style>), matching the light customer theme.
const ICONS = {
  survey: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  mockup: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  proposal: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
};

export default function PublishAnnounce({ announcement, onGo, onDismiss }) {
  if (!announcement) return null;
  const { title, body, cta, icon } = announcement;
  return (
    <div className="pann" role="dialog" aria-modal="true">
      <style>{CSS}</style>
      <div className="pann-bg" onClick={onDismiss} />
      <div className="pann-card">
        <button className="pann-x" onClick={onDismiss} aria-label="Later">✕</button>
        <div className="pann-burst">
          <span className="pann-ic">{ICONS[icon] || ICONS.survey}</span>
        </div>
        <div className="pann-kick">Just published</div>
        <div className="pann-title">{title}</div>
        <div className="pann-body">{body}</div>
        <button className="pann-go" onClick={onGo}>
          {cta}
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
        <button className="pann-later" onClick={onDismiss}>Later</button>
      </div>
    </div>
  );
}

const CSS = `
.pann{position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
.pann-bg{position:fixed;inset:0;background:rgba(11,15,26,.74);animation:pannf .25s ease}
.pann-card{position:relative;width:min(370px,92vw);background:#fff;border-radius:20px;border-top:5px solid #C9A96E;box-shadow:0 28px 70px rgba(0,0,0,.5);padding:26px 24px 18px;text-align:center;animation:pannp .34s cubic-bezier(.2,.85,.3,1.1)}
@keyframes pannf{from{opacity:0}to{opacity:1}}
@keyframes pannp{from{opacity:0;transform:translateY(14px) scale(.95)}to{opacity:1;transform:none}}
.pann-x{position:absolute;top:12px;right:12px;width:28px;height:28px;border:none;background:#f2efe9;border-radius:9px;color:#8a8578;font-size:.82rem;cursor:pointer;line-height:1}
.pann-x:hover{background:#e8e3d8;color:#0B0F1A}
.pann-burst{width:64px;height:64px;margin:6px auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#0B0F1A;background:linear-gradient(180deg,#F0DCB2,#C9A96E);box-shadow:0 8px 22px rgba(201,169,110,.5);animation:pannpop .5s cubic-bezier(.2,.85,.3,1.4) .08s both}
@keyframes pannpop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
.pann-kick{font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a3812f}
.pann-title{font-size:1.32rem;font-weight:800;color:#0B0F1A;letter-spacing:-.01em;margin-top:5px}
.pann-body{font-size:.92rem;color:#5b6275;line-height:1.5;margin-top:8px}
.pann-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;width:100%;height:48px;border:none;border-radius:12px;background:#0B0F1A;color:#fff;font-size:.98rem;font-weight:800;cursor:pointer;font-family:inherit;transition:.15s}
.pann-go:hover{background:#1a2233}
.pann-later{margin-top:8px;width:100%;height:34px;border:none;background:none;color:#9aa1af;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.pann-later:hover{color:#5b6275}
`;
