"use client";
// Presentational pieces of the screenshot editor: toolbar button, colour/stroke popover, icon set.

const PALETTE = [
  ["#ff2d2d", "Red"], ["#ff9500", "Orange"], ["#ffd60a", "Yellow"],
  ["#31c46b", "Green"], ["#3b82f6", "Blue"], ["#ffffff", "White"], ["#101317", "Black"],
];
const STROKES = [["Thin", 0.62], ["Medium", 1], ["Thick", 1.7]];

export function Tool({ on, onClick, disabled, tip, children }) {
  return (
    <button type="button" className={`mk-tool${on ? " on" : ""}`} onClick={onClick} disabled={disabled}
      aria-label={tip} aria-pressed={on || undefined} title={tip}>{children}</button>
  );
}

// Color swatch + palette + stroke width. `up` opens the popover above (for the mobile bottom dock).
export function ColorControl({ color, setColor, strokeMul, setStrokeMul, show, setShow, up }) {
  return (
    <div className="mk-colwrap">
      <button className="mk-swatch" aria-label="Color" title="Color" onClick={() => setShow((v) => !v)}>
        <span className="mk-dot" style={{ background: color, boxShadow: color === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,.3)" : "none" }} />
      </button>
      {show && (
        <div className={`mk-pop${up ? " up" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
          <div className="mk-sw-row">
            {PALETTE.map(([hex, name]) => (
              <button key={hex} className={`mk-sw${color === hex ? " on" : ""}`} aria-label={name} title={name}
                style={{ background: hex, boxShadow: hex === "#ffffff" ? "inset 0 0 0 1px rgba(0,0,0,.25)" : "none" }}
                onClick={() => { setColor(hex); setShow(false); }} />
            ))}
          </div>
          <div className="mk-str-row">
            {STROKES.map(([name, mul]) => (
              <button key={name} className={`mk-str${strokeMul === mul ? " on" : ""}`} title={name} aria-label={name}
                onClick={() => setStrokeMul(mul)}>
                <span className="mk-str-bar" style={{ height: Math.max(2, Math.round(mul * 3)) }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* icons — one family, 2px stroke, currentColor */
const S = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
export const CropI = () => (<svg {...S}><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></svg>);
export const CheckI = () => (<svg {...S}><polyline points="20 6 9 17 4 12" /></svg>);
export const RectI = () => (<svg {...S}><rect x="3" y="5" width="18" height="14" rx="1.5" /></svg>);
export const ArrowI = () => (<svg {...S}><line x1="6" y1="18" x2="18" y2="6" /><polyline points="9 6 18 6 18 15" /></svg>);
export const PenI = () => (<svg {...S}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="1.4" /></svg>);
export const TextI = () => (<svg {...S}><polyline points="4 7 4 5 20 5 20 7" /><line x1="12" y1="5" x2="12" y2="19" /><line x1="9" y1="19" x2="15" y2="19" /></svg>);
export const UndoI = () => (<svg {...S}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>);
export const RedoI = () => (<svg {...S}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>);
export const TrashI = () => (<svg {...S}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>);
export const CloseI = () => (<svg {...S}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const MoreI = () => (<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>);

