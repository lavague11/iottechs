"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";
import { setLibrarySystemQrAction } from "../actions";

const digits = (s) => String(s || "").replace(/\D/g, "");

export default function QrLibraryClient({ user, alerts, codes = [] }) {
  const [rows, setRows]     = useState(codes);
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState("all");   // all | missing | has
  const [zoom, setZoom]     = useState(null);    // the card being viewed large
  const [upload, setUpload] = useState(null);    // the project we're generating a card for
  const [flash, setFlash]   = useState("");
  const [err, setErr]       = useState("");

  // The QR Cleaner widget posts the finished activation card back to us, same contract as the
  // System QR step on the project page.
  useEffect(() => {
    if (!upload) return;
    function onMsg(e) {
      if (e?.data?.type !== "iotSystemQr" || !e.data.dataUrl) return;
      const id = upload.access_id;
      setLibrarySystemQrAction(id, e.data.dataUrl).then((r) => {
        if (!r?.ok) { setErr(r?.error || "Could not save that card."); return; }
        setRows((prev) => prev.map((c) => (c.access_id === id ? { ...c, system_qr: r.system_qr } : c)));
        setUpload(null);
        setFlash(id);
        setTimeout(() => setFlash(""), 3000);
      });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [upload]);

  const q = query.trim().toLowerCase();
  const qDigits = digits(query);
  const visible = useMemo(() => rows.filter((c) => {
    if (filter === "missing" && c.system_qr) return false;
    if (filter === "has" && !c.system_qr) return false;
    if (!q) return true;
    return c.customer.toLowerCase().includes(q)
      || c.access_id.toLowerCase().includes(q)
      || (c.address || "").toLowerCase().includes(q)
      || (qDigits && digits(c.phone).includes(qDigits));
  }), [rows, q, qDigits, filter]);

  const withQr = rows.filter((c) => c.system_qr).length;
  const missing = rows.length - withQr;

  return (
    <AdminShell user={user} alerts={alerts} active="support">
      <div className="apx-wrap">
        <div className="page-head qrl-head">
          <div>
            <h1>System QR Codes</h1>
            <div className="ph-sub">{withQr} of {rows.length} project{rows.length === 1 ? "" : "s"} have a card</div>
          </div>
          <Link href="/support" className="qrl-back">← Support</Link>
        </div>

        <div className="sec-head">
          <input className="apx-input" style={{ maxWidth: 420 }} placeholder="Search customer, address, phone, or project ID…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="qrl-tabs">
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {rows.length}</button>
            <button className={filter === "missing" ? "on" : ""} onClick={() => setFilter("missing")}>Missing {missing}</button>
            <button className={filter === "has" ? "on" : ""} onClick={() => setFilter("has")}>Ready {withQr}</button>
          </div>
        </div>

        {err && <div className="qrl-err">{err}</div>}

        {visible.length === 0 ? (
          <div className="panel"><div className="empty">{q ? "No projects match." : "No projects yet."}</div></div>
        ) : (
          <div className="qrl-grid">
            {visible.map((c) => (
              <button
                className={`qrl-card${c.system_qr ? "" : " none"}${flash === c.access_id ? " flash" : ""}`}
                key={c.access_id}
                onClick={() => (c.system_qr ? setZoom(c) : setUpload(c))}
              >
                {c.system_qr ? (
                  <img className="qrl-qr" src={c.system_qr} alt={`System QR for ${c.customer}`} draggable={false} />
                ) : (
                  <span className="qrl-slot">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M21 21v-4"/></svg>
                    <span className="qrl-slot-t">No QR yet</span>
                    <span className="qrl-slot-a">+ Add</span>
                  </span>
                )}
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
            <div className="qrl-zoom-act">
              <a className="qrl-dl" href={zoom.system_qr} download={`IOT-TECHS-QR-${zoom.access_id}.png`}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                Download
              </a>
              <button className="qrl-replace" onClick={() => { const p = zoom; setZoom(null); setUpload(p); }}>Replace</button>
            </div>
          </div>
        </div>
      )}

      {upload && (
        <div className="qrl-zoom-bg" onClick={(e) => { if (e.target.classList.contains("qrl-zoom-bg")) setUpload(null); }}>
          <div className="qrl-up">
            <div className="qrl-up-head">
              <div>
                <div className="qrl-up-name">{upload.customer}</div>
                <div className="qrl-up-meta mono">{upload.access_id}</div>
              </div>
              <button className="qrl-zoom-x static" onClick={() => setUpload(null)} aria-label="Close">✕</button>
            </div>
            <iframe
              className="qrl-frame"
              title="System QR"
              allow="camera"
              src={`/widgets/qr-cleaner.html?embed=1&project=${encodeURIComponent(upload.access_id)}&customer=${encodeURIComponent(upload.customer || "")}`}
            />
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
.apx .qrl-tabs{display:flex;gap:6px}
.apx .qrl-tabs button{height:34px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.apx .qrl-tabs button.on{background:var(--gold-deep,#b08f4f);border-color:var(--gold-deep,#b08f4f);color:#fff}
.apx .qrl-err{margin:10px 0;padding:10px 14px;border-radius:10px;background:#fdecec;border:1px solid #f2c4c4;color:#93312f;font-size:.85rem;font-weight:600}
.apx .qrl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:4px}
.apx .qrl-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 14px 14px;background:#fff;border:1px solid var(--line);border-radius:14px;cursor:pointer;text-align:center;transition:border-color .12s,box-shadow .12s,transform .12s;font-family:inherit}
.apx .qrl-card:hover{border-color:var(--gold,#C9A96E);box-shadow:0 14px 30px -16px rgba(0,0,0,.28);transform:translateY(-2px)}
.apx .qrl-card.none{border-style:dashed;background:var(--bg-soft,#fafaf8)}
.apx .qrl-card.flash{border-color:#2f7d5a;box-shadow:0 0 0 3px rgba(47,125,90,.16)}
.apx .qrl-qr{width:130px;height:130px;object-fit:contain;background:#fff;border-radius:8px;margin-bottom:6px}
.apx .qrl-slot{width:130px;height:130px;margin-bottom:6px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#a9a396;background:#fff;border:1px dashed var(--line)}
.apx .qrl-slot-t{font-size:.76rem;font-weight:700;color:var(--muted)}
.apx .qrl-slot-a{font-size:.76rem;font-weight:800;color:var(--gold-deep,#b08f4f)}
.apx .qrl-card.none:hover .qrl-slot{border-color:var(--gold,#C9A96E);color:var(--gold-deep,#b08f4f)}
.apx .qrl-name{font-size:.9rem;font-weight:700;color:var(--ink);line-height:1.2}
.apx .qrl-meta{font-size:.72rem;color:var(--muted);line-height:1.35}
.apx .qrl-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .qrl-zoom-bg{position:fixed;inset:0;z-index:3000;background:rgba(14,19,32,.6);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
.apx .qrl-zoom{position:relative;background:#fff;border-radius:18px;padding:28px 32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 30px 70px rgba(0,0,0,.4)}
.apx .qrl-zoom-x{position:absolute;top:12px;right:12px;width:30px;height:30px;border:none;border-radius:8px;background:var(--bg-soft);color:var(--muted);font-size:1rem;cursor:pointer}
.apx .qrl-zoom-x.static{position:static}
.apx .qrl-zoom-x:hover{background:var(--line);color:var(--ink)}
.apx .qrl-zoom-img{width:260px;height:260px;max-width:100%;object-fit:contain}
.apx .qrl-zoom-name{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:1.15rem;color:var(--ink);margin-top:10px}
.apx .qrl-zoom-meta{font-size:.8rem;color:var(--muted);margin-top:4px}
.apx .qrl-link{color:var(--gold-deep,#b08f4f);font-weight:600;text-decoration:none}
.apx .qrl-link:hover{text-decoration:underline}
.apx .qrl-zoom-act{display:flex;gap:8px;justify-content:center;margin-top:16px}
.apx .qrl-dl{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 20px;border-radius:10px;background:linear-gradient(135deg,#C9A96E,#b08f4f);color:#fff;font-weight:700;font-size:.86rem;text-decoration:none}
.apx .qrl-dl:hover{filter:brightness(1.06)}
.apx .qrl-replace{height:40px;padding:0 20px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--muted);font-weight:700;font-size:.86rem;cursor:pointer;font-family:inherit}
.apx .qrl-replace:hover{border-color:var(--gold,#C9A96E);color:var(--gold-deep,#b08f4f)}
.apx .qrl-up{position:relative;background:#fff;border-radius:18px;overflow:hidden;max-width:520px;width:100%;box-shadow:0 30px 70px rgba(0,0,0,.4)}
.apx .qrl-up-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.apx .qrl-up-name{font-weight:800;font-size:.95rem;color:var(--ink)}
.apx .qrl-up-meta{font-size:.75rem;color:var(--muted)}
.apx .qrl-up-meta.mono{font-family:Menlo,Consolas,monospace;color:var(--gold-deep,#b08f4f);font-weight:600}
.apx .qrl-frame{width:100%;height:min(640px,70vh);border:none;background:#0B0F1A;display:block}
`;
