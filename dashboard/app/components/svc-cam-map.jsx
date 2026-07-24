"use client";

// Tap-the-camera-on-the-plan picker — renders the site survey's floor plan(s) with the camera
// markers at their surveyed positions (x/y are the survey's percent coordinates). Used by both
// 60-second-check modals (gateway + tracker). Self-contained styles, light theme.
export default function SvcCamMap({ cameras = [], floors = [], onPick }) {
  const byFloor = floors.map((f, fi) => ({ ...f, cams: cameras.filter((c) => c.floor === fi) }))
    .filter((f) => f.cams.length > 0);
  if (!byFloor.length) return null;

  return (
    <div className="scm">
      {byFloor.map((f, i) => (
        <div className="scm-floor" key={i}>
          {f.name && <div className="scm-fname">{f.name}</div>}
          <div className="scm-plan" style={f.img ? { backgroundImage: `url(${f.img})` } : undefined}>
            {f.cams.map((c) => (
              <button
                key={c.label}
                className="scm-cam"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                onClick={() => onPick(c.label)}
                title={c.label}
              >
                <span className="scm-dot">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                </span>
                <span className="scm-tag">{c.tag}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.scm{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
.scm-fname{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#5b6275}
.scm-plan{position:relative;width:100%;aspect-ratio:3/2;border:1.5px solid #e6e8ee;border-radius:12px;background-color:#fff;background-size:cover;background-position:center;overflow:hidden;
  background-image:linear-gradient(#f0f2f7 1px,transparent 1px),linear-gradient(90deg,#f0f2f7 1px,transparent 1px);background-size:28px 28px}
.scm-cam{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:6px;font-family:inherit}
.scm-dot{width:26px;height:26px;border-radius:50%;background:#C9A96E;color:#fff;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 3px 10px rgba(11,15,26,.28);transition:transform .12s,background .12s}
.scm-cam:hover .scm-dot{transform:scale(1.18);background:#b08f4f}
.scm-tag{font-size:.64rem;font-weight:800;color:#0e1320;background:rgba(255,255,255,.92);border:1px solid #e6e8ee;border-radius:100px;padding:1px 7px;white-space:nowrap;box-shadow:0 2px 6px rgba(11,15,26,.12)}
`;
