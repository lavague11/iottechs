// Inline SVG icons for the signer (one family: 24px grid, 2px round stroke).
const I = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
export const Icon = {
  close: <svg {...I}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  plus: <svg {...I}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  minus: <svg {...I}><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  pen: <svg {...I} width="14" height="14"><path d="M3 21h18" /><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>,
  user: <svg {...I} width="14" height="14"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  cal: <svg {...I} width="14" height="14"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  check: <svg {...I} width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>,
};
