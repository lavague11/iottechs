"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

const digits = (s) => String(s || "").replace(/\D/g, "");

export default function QrLibraryClient({ user, alerts, codes = [] }) {
  const [query, setQuery] = useState("");
  const [zoom, setZoom]   = useState(null);   // the code being viewed large

  const q = query.trim().toLowerCase();
  const qDigits = digits(query);
  const visible = useMemo(() => codes.filter((c) => {
    if (!q) return true;
    return c.customer.toLowerCase().includes(q)
      || c.access_id.toLowerCase().includes(q)
      || (c.address || "").toLowerCase().includes(q)
      || (qDigits && digits(c.phone).includes(qDigits));
  }), [codes, q, qDigits]);

  return (
    <AdminShell user={user} alerts={alerts} active="support">
      <div className="apx-wrap">
        <div className="page-head qrl-head">
          <div>
            <h1>System QR Codes</h1>
            <div className="ph-sub">{codes.length} project{codes.length === 1 ? "" : "s"} with a QR</div>
          </div>
          <Link href="/support" className="qrl-back">← Support</Link>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search customer, address, phone, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {q && <div className="qrl-count">{visible.length} match{visible.length === 1 ? "" : "es"}</div>}
        </div>

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No systems match." : "No System QR codes generated yet."}</div></div>
        ) : (
          <div className="qrl-grid">
            {visible.map((c) => (
              <button className="qrl-card" key={c.access_id} onClick={() => setZoom(c)}>
                <img className="qrl-qr" src={c.system_qr} alt={`System QR for ${c.customer}`} draggable={false} />
                <div className="qrl-name">{c.customer}</div>
                <div className="qrl-meta mono">{c.access_id}</div>
                {c.address && <div className="qrl-meta">{c.address}</div>}
                {c.phone && <div className="qrl-meta">{c.phone}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {zoom && (
        <div className="qrl-zoom-bg" onClick={(e) => { if (e.target.classList.contains("qrl-zoom-bg")) setZoom(null); }}>
          <div className="qrl-zoom">
            <button className="qrl-zoom-x" onClick={() => setZoom(null)} aria-label="Close">✕</button>
            <img className="qrl-zoom-img" src={zoom.system_qr} alt={`System QR for ${zoom.customer}`} draggable={false} />
            <div className="qrl-zoom-name">{zoom.customer}</div>
            <div className="qrl-zoom-meta">
              <Link href={`/project/${zoom.access_id}`} className="qrl-link">{zoom.access_id}</Link>
              {zoom.address ? ` · ${zoom.address}` : ""}{zoom.phone ? ` · ${zoom.phone}` : ""}
            </div>
            <a className="qrl-dl" href={zoom.system_qr} download={`IOT-TECHS-QR-${zoom.access_id}.png`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              Download QR
            </a>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </AdminShell>
  );
}

const CSS = `
.apx .qrl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.apx .qrl-back{font-size:.85rem;font-weight:600;color:var(--gold-deep,#b08f4f);text-decoration:none;white-space:nowrap;padding-top:6px}
.apx .qrl-back:hover{text-decoration:underline}
.apx .qrl-count{font-size:.82rem;color:var(--muted);font-weight:600}
.apx .qrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:4px}
.apx .qrl-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 14px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;cursor:pointer;text-align:center;transition:border-color .12s,box-shadow .12s,transform .12s;font-family:inherit}
.apx .qrl-card:hover{border-color:var(--gold,#C9A96E);box-shadow:0 14px 30px -16px rgba(0,0,0,.28);transform:translateY(-2px)}
.apx .qrl-qr{width:130px;height:130px;object-fit:contain;background:#fff;border-radius:8px;margin-bottom:6px}
.apx .qrl-name{font-size:.9rem;font-weight:700;color:var(--ink);line-height:1.2}
.apx .qrl-meta{font-size:.72rem;color:var(--muted);line-height:1.35}
.apx .qrl-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .qrl-zoom-bg{position:fixed;inset:0;z-index:3000;background:rgba(14,19,32,.6);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
.apx .qrl-zoom{position:relative;background:#fff;border-radius:18px;padding:28px 32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.4)}
.apx .qrl-zoom-x{position:absolute;top:12px;right:12px;width:30px;height:30px;border:none;border-radius:8px;background:var(--bg-soft);color:var(--muted);font-size:1rem;cursor:pointer}
.apx .qrl-zoom-x:hover{background:var(--line);color:var(--ink)}
.apx .qrl-zoom-img{width:260px;height:260px;max-width:100%;object-fit:contain}
.apx .qrl-zoom-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;color:var(--ink);margin-top:10px}
.apx .qrl-zoom-meta{font-size:.8rem;color:var(--muted);margin-top:4px}
.apx .qrl-link{color:var(--gold-deep,#b08f4f);font-weight:600;text-decoration:none}
.apx .qrl-link:hover{text-decoration:underline}
.apx .qrl-dl{display:inline-flex;align-items:center;gap:7px;margin-top:16px;height:40px;padding:0 20px;border-radius:10px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:700;font-size:.86rem;text-decoration:none}
.apx .qrl-dl:hover{filter:brightness(1.06)}
`;
