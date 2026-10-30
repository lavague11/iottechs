"use client";
// Zelle payment option — no convenience fee. Shows the business QR (tap it to open Zelle on a phone, or
// scan it from the bank app) plus the name + number. Static business info; the link is the QR's own
// enroll.zellepay.com payment URL (token 646-396-0775 · LA VAGUE INC.).
export const ZELLE = {
  name: "LA VAGUE INC.",
  phone: "(646) 396-0775",
  url: "https://enroll.zellepay.com/qr-codes?data=ewogICJ0b2tlbiIgOiAiNjQ2Mzk2MDc3NSIsCiAgImFjdGlvbiIgOiAicGF5bWVudCIsCiAgIm5hbWUiIDogIkxBIFZBR1VFIElOQy4iCn0=",
  qr: "/zelle-qr.png",
};

export default function ZellePay() {
  return (
    <div className="zp">
      <div className="zp-hd"><span className="zp-ttl">Pay by Zelle</span><span className="zp-free">No fee</span></div>
      <div className="zp-body">
        <a className="zp-qrwrap" href={ZELLE.url} target="_blank" rel="noreferrer" title="Open Zelle to pay">
          <img className="zp-qr" src={ZELLE.qr} alt="Zelle QR code — pay LA VAGUE INC." width="134" height="134" />
        </a>
        <div className="zp-info">
          <div className="zp-to">{ZELLE.name}</div>
          <a className="zp-phone" href={ZELLE.url} target="_blank" rel="noreferrer">{ZELLE.phone}</a>
          <div className="zp-hint">Scan with your bank app — or tap the code to open Zelle.</div>
        </div>
      </div>
      <style>{`
        .zp{display:flex;flex-direction:column;gap:10px;max-width:420px;margin:14px auto 0;padding:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-raise,#FBFBFA)}
        .zp-hd{display:flex;align-items:center;gap:8px}
        .zp-ttl{font-weight:800;font-size:.92rem;color:var(--dv-ink,#101418)}
        .zp-free{font-size:.62rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#2E7D5B;background:#e6f3ec;border-radius:100px;padding:2px 8px}
        .zp-body{display:flex;align-items:center;gap:14px}
        .zp-qrwrap{flex:0 0 auto;line-height:0;border-radius:10px;border:1px solid var(--dv-line,#E4E4DF);background:#fff;padding:6px;cursor:pointer}
        .zp-qr{width:134px;height:134px;display:block}
        .zp-info{display:flex;flex-direction:column;gap:3px;min-width:0}
        .zp-to{font-weight:800;font-size:.92rem;color:var(--dv-ink,#101418)}
        .zp-phone{font-weight:700;font-size:.92rem;color:#6D1ED4;text-decoration:none;font-variant-numeric:tabular-nums}
        .zp-phone:hover{text-decoration:underline}
        .zp-hint{font-size:.72rem;color:var(--dv-meta,#787D84);line-height:1.4;margin-top:3px}
        @media(max-width:420px){.zp-body{flex-direction:column;align-items:flex-start}}
        @media (prefers-color-scheme:dark){
          .zp{background:#12161c;border-color:#2a2f37}
          .zp-ttl,.zp-to{color:#e9edf2}
          .zp-free{background:#17271f;color:#86c7a3}
          .zp-qrwrap{background:#fff;border-color:#2a2f37}
          .zp-phone{color:#b98cff}
          .zp-hint{color:#9aa0a8}
        }
      `}</style>
    </div>
  );
}
