// Skeleton shown while the candidate page's server data loads — never a blank flash.
export default function Loading() {
  return (
    <div className="cl-skel" aria-busy="true" aria-label="Loading candidate">
      <div className="cl-row" style={{ width: 90, height: 12 }} />
      <div className="cl-row" style={{ width: 120, height: 12, marginTop: 18 }} />
      <div className="cl-row" style={{ width: 260, height: 30, marginTop: 10 }} />
      <div className="cl-row" style={{ width: 340, height: 12, marginTop: 10 }} />
      <div className="cl-card" style={{ marginTop: 22 }} />
      <div className="cl-card" style={{ marginTop: 16, height: 220 }} />
      <div className="cl-card" style={{ marginTop: 16, height: 180 }} />
      <style>{`
        .cl-skel{max-width:1100px;margin:0 auto;padding:28px 20px}
        .cl-row,.cl-card{background:linear-gradient(90deg,#EEEDE9 25%,#F6F5F2 37%,#EEEDE9 63%);background-size:400% 100%;border-radius:8px;animation:cl-sh 1.3s ease-in-out infinite}
        .cl-card{height:120px;border-radius:14px}
        @keyframes cl-sh{0%{background-position:100% 0}100%{background-position:-100% 0}}
        @media (prefers-reduced-motion: reduce){.cl-row,.cl-card{animation:none}}
      `}</style>
    </div>
  );
}
