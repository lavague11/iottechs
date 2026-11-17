"use client";
// Collapsed Log toggle at the bottom of the project page — shared by the staff Project Hub and the customer
// portal. `log` is the already-built <JobLog> (role-aware: a customer only ever gets public notes + milestones).
import { useState } from "react";

const LOG_CSS = `
.cpv-logsec{max-width:1040px;margin:0 auto;padding:8px 20px 20px}
.cpv-logtog{display:flex;align-items:center;gap:9px;width:100%;height:44px;padding:0 18px;border:1px solid var(--line);border-radius:12px;background:var(--raise);color:var(--ink);font:700 14px/1 inherit;cursor:pointer}
.cpv-logtog:hover{border-color:var(--ink);background:#fff}
.cpv-logchev{color:var(--meta);margin-left:auto}
.cpv-logbody{margin-top:12px}
`;

export default function PortalLog({ log }) {
  const [open, setOpen] = useState(false);   // collapsed by default, like the deck
  if (!log) return null;
  return (
    <section className="cpv-logsec">
      <style>{LOG_CSS}</style>
      <button className="cpv-logtog" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Log
        <svg className="cpv-logchev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && <div className="cpv-logbody">{log}</div>}
    </section>
  );
}
