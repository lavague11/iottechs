"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import AdminShell from "../components/admin-shell";
import DocReader from "./doc-reader";
import { DOC_READERS } from "../../lib/doc-readers";
import { searchDocumentsAction } from "./actions";

// The reader picker. Licence has its own richer tool at /id-scan; the rest mount inline.
const READERS = [
  { key: "licence", label: "Licence", sub: "Driver's licence → identity", href: "/id-scan", icon: <><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10h5M13 14h5"/></> },
  { key: "registration", label: "Registration", sub: "Vehicle → owner, plate, VIN", icon: <><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/><path d="M4 17h16v-4H4z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></> },
  { key: "insurance", label: "Insurance", sub: "Policy → carrier, #, dates", icon: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></> },
  { key: "business_license", label: "Business licence", sub: "Entity & licence #", icon: <><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4M9 10h.01M15 10h.01M9 13h.01M15 13h.01"/></> },
];
const Icon = ({ children }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const TYPE_LABEL = { licence: "Licence", ...Object.fromEntries(Object.values(DOC_READERS).map((r) => [r.key, r.label])) };
function fmt(t) { return t ? String(t).replace("T", " ").slice(0, 16) : ""; }

export default function ToolsClient({ user, alerts }) {
  const [active, setActive] = useState(null);            // reader key mounted inline
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);          // null = not searched
  const [pending, startTx] = useTransition();

  function search(e) {
    e?.preventDefault?.();
    if (!q.trim()) { setResults(null); return; }
    startTx(async () => {
      const r = await searchDocumentsAction(q.trim());
      setResults(r?.results || []);
    });
  }

  return (
    <AdminShell user={user} alerts={alerts} active="tools">
      <style>{CSS}</style>
      <div className="apx-wrap">
        <div className="welcome">
          <h1>Document <em>Tools</em></h1>
          <p className="tl-sub">Capture, read and search every document tied to a customer or project. Admin &amp; manager only.</p>
        </div>

        {/* The Library — search across everything captured */}
        <form className="tl-search" onSubmit={search}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, addresses, licence / policy / plate numbers…" />
          <button type="submit" disabled={pending}>{pending ? "…" : "Search"}</button>
        </form>

        {results !== null && (
          <div className="tl-results">
            {results.length === 0 ? (
              <div className="tl-empty">No documents match “{q}”.</div>
            ) : results.map((d) => (
              <div key={d.id} className="tl-row">
                <span className="tl-badge">{TYPE_LABEL[d.doc_type] || d.doc_type}</span>
                <span className="tl-name">{d.subject_name || "—"}</span>
                <span className="tl-num mono">{d.doc_number || ""}</span>
                <span className="tl-when">{fmt(d.captured_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Reader picker */}
        <div className="tl-grid">
          {READERS.map((r) => (
            r.href ? (
              <Link key={r.key} href={r.href} className="tl-card">
                <span className="tl-ic"><Icon>{r.icon}</Icon></span>
                <span className="tl-card-t">{r.label}</span>
                <span className="tl-card-s">{r.sub}</span>
                <span className="tl-open">Open →</span>
              </Link>
            ) : (
              <button key={r.key} type="button" className={`tl-card${active === r.key ? " on" : ""}`} onClick={() => setActive(active === r.key ? null : r.key)}>
                <span className="tl-ic"><Icon>{r.icon}</Icon></span>
                <span className="tl-card-t">{r.label}</span>
                <span className="tl-card-s">{r.sub}</span>
                <span className="tl-open">{active === r.key ? "Close" : "Scan →"}</span>
              </button>
            )
          ))}
        </div>

        {active && DOC_READERS[active] && (
          <div className="tl-reader">
            <DocReader docType={active} onSaved={() => { if (q.trim()) search(); }} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const CSS = `
.apx .tl-sub{color:var(--muted);font-size:.9rem;margin-top:4px}
.apx .tl-search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:14px}
.apx .tl-search svg{color:var(--muted);flex-shrink:0}
.apx .tl-search input{flex:1;border:none;outline:none;font-size:.95rem;font-family:inherit;background:transparent;color:var(--ink)}
.apx .tl-search button{background:var(--ink);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:.84rem;font-weight:700;font-family:inherit;cursor:pointer}
.apx .tl-results{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}
.apx .tl-empty{padding:18px;text-align:center;color:var(--muted);font-size:.88rem}
.apx .tl-row{display:grid;grid-template-columns:auto 1fr auto auto;gap:12px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--line)}
.apx .tl-row:last-child{border-bottom:none}
.apx .tl-badge{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#5a6d8a;background:rgba(99,117,155,.1);border-radius:100px;padding:2px 9px;white-space:nowrap}
.apx .tl-name{font-weight:700;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apx .tl-num{font-size:.82rem;color:var(--muted);white-space:nowrap}
.apx .tl-when{font-size:.76rem;color:var(--muted);white-space:nowrap}
.apx .tl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.apx .tl-card{display:flex;flex-direction:column;gap:0;text-align:left;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;cursor:pointer;font-family:inherit;text-decoration:none;color:var(--ink);transition:.12s}
.apx .tl-card:hover{border-color:var(--accent-primary,#C9A96E)}
.apx .tl-card.on{border-color:var(--accent-primary,#C9A96E);box-shadow:0 0 0 3px rgba(201,169,110,.14)}
.apx .tl-ic{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:var(--bg-soft,#faf9f7);border:1px solid var(--line);color:var(--accent-primary,#b08f4f);margin-bottom:10px}
.apx .tl-ic svg{width:22px;height:22px}
.apx .tl-card-t{font-weight:800;font-size:.95rem;font-family:'Bricolage Grotesque',sans-serif}
.apx .tl-card-s{font-size:.8rem;color:var(--muted);margin-top:3px;line-height:1.4}
.apx .tl-open{font-size:.8rem;font-weight:700;color:var(--accent-primary,#b08f4f);margin-top:12px}
.apx .tl-reader{margin-top:16px}
.apx .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
@media(max-width:640px){.apx .tl-row{grid-template-columns:auto 1fr;row-gap:2px}.apx .tl-num,.apx .tl-when{grid-column:2}}
`;
