// Inline SVG icon family for the SOP Builder (one stroke style: 24 viewBox, 2px round, currentColor).
const P = {
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  grip: <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M7 5l12 7-12 7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></>,
  import: <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-9 9" /></>,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
};

export function Ic({ n, s = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>
  );
}
