"use client";

import { useState } from "react";
import Link from "next/link";
import AdminShell from "../../components/admin-shell";

// ─────────────────────────────────────────────────────────────────────────────
// Static reference data — the role × phase × blocks map of the project page,
// derived from spec.js (PHASES), stage-flow.js (requirements) and the gateway's
// render conditions. This is a developer reference; nothing here reads the DB.
// ─────────────────────────────────────────────────────────────────────────────

const PHASES = [
  { key: "consulting", name: "Consulting", tech: "Survey",     status: "Pending",     stages: "Inquiry + Site Survey",            steps: 3, color: "#C9A96E" },
  { key: "proposal",   name: "Proposal",   tech: "Accept",     status: "Reviewing",   stages: "Proposal + Approval & Deposit",    steps: 6, color: "#7c3aed" },
  { key: "install",    name: "Install",    tech: "Install",    status: "In Progress", stages: "Fulfillment + Install",            steps: 4, color: "#3257ff" },
  { key: "completion", name: "Completion", tech: "Completion", status: "Finalizing",  stages: "QC + Payment + Completion",        steps: 4, color: "#1c8a45" },
];

const ROLES = [
  { key: "admin",    label: "Admin",    color: "#C9A96E" },
  { key: "manager",  label: "Manager",  color: "#C9A96E" },
  { key: "sales",    label: "Sales",    color: "#7c3aed" },
  { key: "tech",     label: "Technician", color: "#1c8a45" },
  { key: "customer", label: "Customer", color: "#3257ff" },
];

// a = action: "edit" (can act) · "view" (read-only) · "issue" (over-exposed / flagged)
const MAP = {
  admin: {
    consulting: [b("Survey Scheduling","edit"), b("Details & Notes","edit"), b("Site Survey","edit"), b("Mockups","edit"), b("Intake Card","view")],
    proposal:   [b("Proposal Views","view"), b("Proposal Builder","edit"), b("Approval & Deposit","edit")],
    install:    [b("Install Scheduling","edit"), b("Shipment Tracking","edit"), b("System QR","view"), b("Work Order","edit"), b("Job-Site Add-ons","edit"), b("Tech Pricing","edit")],
    completion: [b("QC Checklist","edit"), b("Final Payment","edit"), b("Completion / Wrap-up","edit")],
  },
  manager: {
    consulting: [b("Survey Scheduling","edit"), b("Details & Notes","edit"), b("Site Survey","edit"), b("Mockups","edit"), b("Intake Card","view")],
    proposal:   [b("Proposal Views","view"), b("Proposal Builder","edit"), b("Approval & Deposit","edit")],
    install:    [b("Install Scheduling","edit"), b("Shipment Tracking","edit"), b("System QR","view"), b("Work Order","edit"), b("Job-Site Add-ons","edit"), b("Tech Pricing","edit")],
    completion: [b("QC Checklist","edit"), b("Final Payment","edit"), b("Completion / Wrap-up","edit")],
  },
  sales: {
    consulting: [b("Survey Scheduling","edit"), b("Details & Notes","edit"), b("Site Survey","edit"), b("Mockups","edit"), b("Intake Card","view")],
    proposal:   [b("Proposal Views","view"), b("Proposal Builder","edit")],
    install:    [],
    completion: [b("QC Checklist","view"), b("Completion","view")],
  },
  tech: {
    consulting: [b("Survey Scheduling","issue"), b("Details & Notes","issue"), b("Site Survey","view"), b("Mockups","view"), b("Intake Card","issue")],
    proposal:   [b("Tech Board","view"), b("Work Order","edit")],
    install:    [b("System QR","view"), b("Equipment Checklist","edit"), b("Job-Site Add-ons","view")],
    completion: [b("QC Checklist","view"), b("Completion","view")],
  },
  customer: {
    consulting: [b("Your Information","edit"), b("Schedule Appointment","edit"), b("Site Survey · review & approve","edit"), b("Mockups · review & approve","edit")],
    proposal:   [b("Proposal · accept / decline","edit"), b("Make Your Deposit","edit")],
    install:    [b("Install Schedule","view"), b("Shipment","view"), b("Work Order","view"), b("Add-ons","view")],
    completion: [b("QC","view"), b("Final Payment","edit"), b("Certificate & Warranty","view")],
  },
};
function b(name, a) { return { name, a }; }

const NOTES = {
  manager: "Identical to Admin — no manager-specific restriction exists in code.",
  sales:   "Blind in the Install phase — no render branch. Loses the job once it's being built.",
  tech:    "Over-exposed in Consulting — sees office intake tools it shouldn't.",
};

const ISSUES = [
  { tag: "REMOVE",    cls: "rm-i-remove",    text: "Dead 5-phase code (CUSTOMER_PHASES) — 0 usages, superseded by the 4-phase bar (2026-07-13)." },
  { tag: "TRIM",      cls: "rm-i-trim",      text: "Tech sees office intake tools (Survey Scheduling, Details & Notes, Intake Card) in Consulting." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Sales sees NOTHING in the Install phase — no branch exists." },
  { tag: "MISSING",   cls: "rm-i-missing",   text: "Vendor & Readonly roles have no render branch on the project page at all." },
  { tag: "REDUNDANT", cls: "rm-i-redundant", text: "Proposal phase stacks two heavy money panels (Proposal Builder + Approval & Deposit)." },
];

const ACTION_META = {
  edit:  { label: "Can act / edit", cls: "rm-a-edit",  ic: "✎" },
  view:  { label: "Read-only",      cls: "rm-a-view",  ic: "◉" },
  issue: { label: "Flagged issue",  cls: "rm-a-issue", ic: "!" },
};

export default function RoleMapClient({ user, alerts }) {
  const [role, setRole] = useState("admin");
  const [showIssues, setShowIssues] = useState(true);
  const map = MAP[role];

  return (
    <AdminShell user={user} alerts={alerts} active="dev">
      <style>{CSS}</style>
      <div className="rm-wrap">
        <div className="rm-head">
          <div>
            <div className="rm-kicker">DEV · REFERENCE MAP</div>
            <h1 className="rm-title">Role &amp; Flow Map</h1>
            <p className="rm-sub">What each role sees under the progress bar, phase by phase. The bar is <b>4 phases</b> covering <b>9 backend stages</b> and <b>17 requirement-steps</b>.</p>
          </div>
          <Link href="/dev" className="rm-back">← Dev Roadmap</Link>
        </div>

        {/* Phase overview strip */}
        <div className="rm-phasestrip">
          {PHASES.map((p, i) => (
            <div className="rm-pchip" key={p.key} style={{ "--c": p.color }}>
              <span className="rm-pnum">{i + 1}</span>
              <div className="rm-pchip-body">
                <div className="rm-pchip-name">{p.name} <span className="rm-pchip-tech">tech: {p.tech}</span></div>
                <div className="rm-pchip-meta">{p.stages}</div>
              </div>
              <span className="rm-pchip-steps">{p.steps} steps</span>
            </div>
          ))}
        </div>

        {/* Role selector */}
        <div className="rm-rolebar">
          {ROLES.map((r) => (
            <button key={r.key} className={`rm-roletab${role === r.key ? " on" : ""}`} style={{ "--rc": r.color }} onClick={() => setRole(r.key)}>
              {r.label}
            </button>
          ))}
          <div className="rm-legend">
            {Object.entries(ACTION_META).map(([k, m]) => (
              <span key={k} className={`rm-legchip ${m.cls}`}><i>{m.ic}</i>{m.label}</span>
            ))}
          </div>
        </div>

        {NOTES[role] && <div className="rm-note">{NOTES[role]}</div>}

        {/* The flow — 4 phase columns for the selected role */}
        <div className="rm-flow">
          {PHASES.map((p, i) => {
            const blocks = map[p.key] || [];
            return (
              <div className="rm-col" key={p.key}>
                <div className="rm-col-head" style={{ "--c": p.color }}>
                  <span className="rm-col-num">{i + 1}</span>
                  <span className="rm-col-name">{p.name}</span>
                </div>
                <div className="rm-col-body">
                  {blocks.length === 0 ? (
                    <div className="rm-empty">Nothing shown{role === "sales" ? " — gap" : ""}</div>
                  ) : blocks.map((blk) => {
                    const m = ACTION_META[blk.a];
                    const dim = blk.a === "issue" && !showIssues;
                    return (
                      <div key={blk.name} className={`rm-block ${m.cls}${dim ? " rm-dim" : ""}`}>
                        <i className="rm-block-ic">{m.ic}</i>
                        <span className="rm-block-name">{blk.name}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="rm-col-count">{blocks.length} block{blocks.length === 1 ? "" : "s"}</div>
              </div>
            );
          })}
        </div>

        {/* Findings */}
        <div className="rm-findings">
          <button className="rm-findings-toggle" onClick={() => setShowIssues((v) => !v)}>
            {showIssues ? "▾" : "▸"} Findings &amp; gaps ({ISSUES.length})
          </button>
          {showIssues && (
            <div className="rm-findings-body">
              {ISSUES.map((f, i) => (
                <div className="rm-finding" key={i}>
                  <span className={`rm-ftag ${f.cls}`}>{f.tag}</span>
                  <span className="rm-ftext">{f.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

const CSS = `
.rm-wrap{max-width:1180px;margin:0 auto;padding:20px 26px 70px;font-family:"SF Pro Display",-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif;color:#0e1320}
.rm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}
.rm-kicker{font-size:.66rem;font-weight:800;letter-spacing:.12em;color:#b08f4f}
.rm-title{font-size:1.7rem;font-weight:800;letter-spacing:-.02em;margin:2px 0 4px}
.rm-sub{font-size:.9rem;color:#5b6275;max-width:640px;line-height:1.5;margin:0}
.rm-back{flex-shrink:0;font-size:.82rem;font-weight:700;color:#5b6275;text-decoration:none;border:1px solid #e6e8ee;border-radius:9px;padding:8px 14px;background:#fff}
.rm-back:hover{border-color:#C9A96E;color:#b08f4f}

.rm-phasestrip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.rm-pchip{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e6e8ee;border-top:3px solid var(--c);border-radius:12px;padding:11px 13px}
.rm-pnum{width:24px;height:24px;flex-shrink:0;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-size:.78rem;font-weight:800}
.rm-pchip-body{flex:1;min-width:0}
.rm-pchip-name{font-size:.86rem;font-weight:800;color:#0e1320}
.rm-pchip-tech{font-size:.62rem;font-weight:700;color:#8a93a8;text-transform:uppercase;letter-spacing:.03em;margin-left:4px}
.rm-pchip-meta{font-size:.7rem;color:#6f7686;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rm-pchip-steps{flex-shrink:0;font-size:.62rem;font-weight:800;color:var(--c);background:color-mix(in srgb,var(--c) 12%,#fff);border-radius:100px;padding:3px 9px;white-space:nowrap}

.rm-rolebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.rm-roletab{height:38px;padding:0 18px;border:1px solid #e6e8ee;border-radius:100px;background:#fff;color:#5b6275;font-size:.86rem;font-weight:800;cursor:pointer;font-family:inherit;transition:all .12s}
.rm-roletab:hover{border-color:var(--rc);color:var(--rc)}
.rm-roletab.on{background:var(--rc);border-color:var(--rc);color:#fff;box-shadow:0 6px 16px -8px var(--rc)}
.rm-legend{display:flex;gap:12px;margin-left:auto;flex-wrap:wrap}
.rm-legchip{display:inline-flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;color:#6f7686}
.rm-legchip i{width:17px;height:17px;border-radius:5px;display:grid;place-items:center;font-size:.66rem;font-style:normal;font-weight:800}
.rm-a-edit i{background:#e7f6ec;color:#1c8a45}
.rm-a-view i{background:#eef1f6;color:#5b6275}
.rm-a-issue i{background:#fdeaea;color:#d23c3c}

.rm-note{background:#fef3c7;border:1px solid #f2d98a;color:#8a5a00;font-size:.82rem;font-weight:600;border-radius:10px;padding:10px 14px;margin-bottom:16px}

.rm-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:start;margin-bottom:26px}
.rm-col{background:#f6f7f9;border:1px solid #e6e8ee;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.rm-col-head{display:flex;align-items:center;gap:8px;padding:11px 13px;background:#fff;border-bottom:1px solid #eef0f4;border-top:3px solid var(--c)}
.rm-col-num{width:22px;height:22px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-size:.74rem;font-weight:800}
.rm-col-name{font-size:.92rem;font-weight:800;color:#0e1320}
.rm-col-body{padding:11px;display:flex;flex-direction:column;gap:7px;flex:1}
.rm-block{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e6e8ee;border-left:3px solid #cdd3de;border-radius:9px;padding:8px 10px;font-size:.8rem;font-weight:600;color:#2c3347}
.rm-block-ic{width:18px;height:18px;flex-shrink:0;border-radius:5px;display:grid;place-items:center;font-size:.68rem;font-style:normal;font-weight:800}
.rm-a-edit.rm-block{border-left-color:#1c8a45}
.rm-a-edit .rm-block-ic{background:#e7f6ec;color:#1c8a45}
.rm-a-view.rm-block{border-left-color:#8a93a8}
.rm-a-view .rm-block-ic{background:#eef1f6;color:#5b6275}
.rm-a-issue.rm-block{border-left-color:#d23c3c;background:#fdf0f0}
.rm-a-issue .rm-block-ic{background:#fdeaea;color:#d23c3c}
.rm-dim{opacity:.4}
.rm-empty{font-size:.78rem;color:#a1a7b3;font-style:italic;padding:14px 6px;text-align:center;border:1px dashed #d9dce4;border-radius:9px}
.rm-col-count{font-size:.66rem;font-weight:700;color:#8a93a8;text-align:center;padding:8px;border-top:1px solid #eef0f4}

.rm-findings{background:#0e1320;border-radius:14px;padding:6px 4px}
.rm-findings-toggle{width:100%;text-align:left;background:none;border:none;color:#fff;font-size:.92rem;font-weight:800;cursor:pointer;font-family:inherit;padding:12px 16px}
.rm-findings-body{padding:0 16px 14px;display:flex;flex-direction:column;gap:8px}
.rm-finding{display:flex;align-items:center;gap:11px;background:rgba(255,255,255,.05);border-radius:9px;padding:9px 12px}
.rm-ftag{flex-shrink:0;font-size:.62rem;font-weight:800;letter-spacing:.04em;border-radius:6px;padding:4px 9px}
.rm-ftext{font-size:.82rem;color:#c9cede;line-height:1.4}
.rm-i-remove{background:#d23c3c;color:#fff}
.rm-i-trim{background:#b45309;color:#fff}
.rm-i-missing{background:#7c3aed;color:#fff}
.rm-i-redundant{background:#3257ff;color:#fff}

@media(max-width:860px){
  .rm-phasestrip,.rm-flow{grid-template-columns:1fr 1fr}
  .rm-legend{width:100%;margin-left:0}
}
@media(max-width:520px){
  .rm-phasestrip,.rm-flow{grid-template-columns:1fr}
}
`;
