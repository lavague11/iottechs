"use client";
import ProposalBuilder from "./proposal-builder";
import ProposalCustomerView from "./proposal-customer-view";
import ProposalWorkOrderView from "./proposal-workorder-view";

// Proposal stage entry point — routes by effective role and carries the shared styles.
// Staff (admin/manager/sales) get the builder; the technician gets the internal Work Order
// (tech prices only); customer (and staff previewing as customer) get the review surface.
// Data arrives server-sanitized per role from page.jsx (lib/proposal.js sanitizeProposal) —
// cost/margin never reach non-staff, and the customer price never reaches a tech.
export default function ProposalPanel({ fileBase = null, accessId, view, cView, custView, proposal, customerName, customerAddress, customerPhone, customerEmail, onProposalChange, onAdvance, onStageSync, signerName, assignedTech, viewCount = 0, onShowViews, embedded = false, defaultService }) {
  const staffBuilder = ["admin", "manager", "sales"].includes(cView);
  return (
    <div className="prop-wrap">
      <style>{PROP_CSS}</style>
      {staffBuilder ? (
        <ProposalBuilder fileBase={fileBase} accessId={accessId} role={cView} initial={proposal} onProposalChange={onProposalChange} viewCount={viewCount} onShowViews={onShowViews} customerName={customerName} customerAddress={customerAddress} customerPhone={customerPhone} customerEmail={customerEmail} embedded={embedded} defaultService={defaultService} />
      ) : cView === "tech" ? (
        <ProposalWorkOrderView fileBase={fileBase} accessId={accessId} proposal={proposal} preview={custView} customerName={customerName} customerAddress={customerAddress} onProposalChange={onProposalChange} signerName={signerName} assignedTech={assignedTech} canVoid={["admin", "manager"].includes(view)} />
      ) : (
        <ProposalCustomerView
          fileBase={fileBase} accessId={accessId} proposal={proposal} preview={custView} customerName={customerName}
          customerAddress={customerAddress} customerPhone={customerPhone} customerEmail={customerEmail}
          onAdvance={onAdvance} onStageSync={onStageSync} canVoid={["admin", "manager"].includes(view)}
          embedded={embedded}
        />
      )}
    </div>
  );
}

const PROP_CSS = `
.pvx .prop-wrap{display:flex;flex-direction:column;gap:14px;margin:18px 0}
/* Flush tool-card (matches .pv-tool-panel / System QR): no card padding — the header bar sits
   edge-to-edge and the body is a divided, padded section below. Flat deck surface, no accent rail. */
.pvx .prop-card{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;overflow:hidden}
.pvx .prop-body{border-top:1px solid var(--dv-line,#E4E4DF);padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.pvx .prop-head-slim{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
/* Top action row: status chip + icon controls sit on one baseline; icon-only buttons are square like
   the gear, the views/share badges expand only as far as their content needs. */
.pvx .prop-head-slim .prop-status{display:inline-flex;align-items:center;line-height:1.3;flex-shrink:1;min-width:0}
.pvx .prop-head-slim .prop-eye,.pvx .prop-head-slim .prop-gear{flex-shrink:0;min-width:30px;justify-content:center}
.pvx .prop-head-cta{flex-shrink:0;height:30px;padding:0 12px;border:1px solid var(--dv-ink,#101418);border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-head-cta:hover{filter:brightness(1.12)}
.pvx .prop-head-cta:disabled{opacity:.45;cursor:default}
/* Edit = light outlined control (not the dark Submit CTA) — matches the compact deck toolbar. */
.pvx .prop-head-cta.prop-head-edit{background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);border-color:var(--dv-line,#E4E4DF)}
.pvx .prop-head-cta.prop-head-edit:hover{background:var(--dv-paper,#F4F4F2);border-color:var(--dv-ink,#101418);filter:none}
/* Request Signature = gold, matching the customer's "Review & Sign" bar. */
.pvx .prop-head-cta.prop-head-sign{display:inline-flex;align-items:center;gap:6px;background:#C9A96E;color:#101418;border-color:#C9A96E}
.pvx .prop-head-cta.prop-head-sign:hover{filter:brightness(1.06)}
.pvx .prop-head-cta.prop-head-sign svg{width:15px;height:15px}
/* Informational top band (Phase 1): no actions — customer open-count + (Phase-2) + Option only. */
.pvx .prop-head-info{border-bottom:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-head-info:empty{display:none}
/* ONE stable action footer — INLINE in the normal flow below the document (never sticky/floating), so it
   sits in the same place in every state. Left = state, right = actions (one primary). */
.pvx .prop-dock{margin-top:12px}
.pvx .prop-dock-row{display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 12px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px}
.pvx .prop-dock-state{display:flex;align-items:center;flex-wrap:wrap;gap:2px 6px;min-width:0;font-size:.8rem;color:var(--dv-ink,#101418)}
.pvx .prop-dock-unsent b{font-weight:700}
.pvx .prop-dock-meta{color:var(--dv-meta,#787D84)}
.pvx .prop-dock-delta{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.pvx .prop-dock-save{font-size:.74rem;font-weight:500;color:var(--dv-green,#2E7D5B);white-space:nowrap}
.pvx .prop-dock-save.pending{color:var(--dv-meta,#787D84)}
.pvx .prop-dock-sp{flex:1 1 auto}
.pvx .prop-dock-acts{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.pvx .prop-dock-ask{font-size:.84rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-dock-sec{height:36px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;flex:0 0 auto;white-space:nowrap}
.pvx .prop-dock-sec:hover:not(:disabled){border-color:var(--dv-ink,#101418)}
.pvx .prop-dock-sec:disabled{opacity:.5;cursor:default}
.pvx .prop-dock-ghost{height:36px;padding:0 12px;border:none;background:none;color:var(--dv-meta,#787D84);font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-dock-ghost:hover:not(:disabled){color:var(--dv-ink,#101418)}
.pvx .prop-dock-cta{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 18px;border:none;border-radius:10px;background:#C9A96E;color:#101418;font-size:.86rem;font-weight:700;cursor:pointer;font-family:inherit;flex:0 0 auto;white-space:nowrap}
.pvx .prop-dock-cta:hover:not(:disabled){filter:brightness(1.06)}
.pvx .prop-dock-cta:disabled{opacity:.5;cursor:default}
.pvx .prop-dock-menuwrap{position:relative;display:inline-flex;flex:0 0 auto}
.pvx .prop-dock-more{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);cursor:pointer}
.pvx .prop-dock-more:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-dock-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:60;min-width:150px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;box-shadow:0 12px 32px rgba(16,20,24,.18);padding:6px}
.pvx .prop-dock-menu.l{left:0;right:auto}
.pvx .prop-dock-mlbl{font-size:.6rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:6px 10px 3px}
.pvx .prop-dock-mi{display:block;width:100%;text-align:left;appearance:none;border:0;background:none;font-family:inherit;font-size:.82rem;font-weight:500;color:var(--dv-ink,#101418);padding:8px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.pvx .prop-dock-mi:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-dock-mi:disabled{opacity:.5;cursor:default}
.pvx .prop-dock-msep{height:1px;background:var(--dv-line,#E4E4DF);margin:5px 6px}
/* Frameless proposal action footer — thin divider, compact metadata row, then one action row.
   Primary (gold .prop-dock-cta) dominates; Download is a quiet secondary. Desktop collapses to one row. */
.pvx .prop-foot{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;border-top:1px solid var(--dv-line,#E4E4DF);margin-top:16px;padding-top:14px;margin-bottom:22px}
.pvx .prop-foot-metarow{flex:1 1 auto;min-width:0;display:flex;align-items:center}
.pvx .prop-foot-meta{display:flex;align-items:center;flex-wrap:wrap;gap:2px 6px;min-width:0;font-size:.8rem;color:var(--dv-ink,#101418)}
.pvx .prop-foot-v{color:var(--dv-meta,#787D84);font-weight:500;white-space:nowrap}
.pvx .prop-foot-chg{appearance:none;border:0;background:none;font-family:inherit;cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:2px 6px;padding:0;text-align:left;font-size:.8rem;color:var(--dv-ink,#101418);min-width:0}
.pvx .prop-foot-chg b{font-weight:700}
.pvx .prop-foot-chg:hover b{text-decoration:underline}
.pvx .prop-foot-delta{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.pvx .prop-foot-delta.neg{color:#C0392B}
.pvx .prop-foot-acts{display:flex;align-items:center;gap:10px;flex:0 0 auto}
.pvx .prop-foot-dlwrap{position:relative;display:inline-flex;flex:0 0 auto}
.pvx .prop-foot-dl{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;height:38px;padding:0 16px;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.pvx .prop-foot-dl:hover:not(:disabled){border-color:var(--dv-ink,#101418)}
.pvx .prop-foot-dl:disabled{opacity:.5;cursor:default}
.pvx .prop-foot-ask{align-items:center}
.pvx .prop-foot-askq{flex:1 1 auto;font-size:.84rem;font-weight:600;color:var(--dv-ink,#101418)}
/* View Changes (read-only modal) */
.pvx .prop-chg-overlay{position:fixed;inset:0;z-index:200;background:rgba(16,20,24,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.pvx .prop-chg{width:min(520px,100%);max-height:min(82vh,680px);display:flex;flex-direction:column;background:var(--dv-raise,#FBFBFA);border-radius:14px;box-shadow:0 24px 60px rgba(16,20,24,.28);overflow:hidden}
.pvx .prop-chg-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-chg-title{flex:1 1 auto;min-width:0;font-size:.9rem;font-weight:700;color:var(--dv-ink,#101418)}
.pvx .prop-chg-x{appearance:none;border:0;background:none;font-size:1.3rem;line-height:1;color:var(--dv-meta,#787D84);cursor:pointer;padding:2px 6px}
.pvx .prop-chg-x:hover{color:var(--dv-ink,#101418)}
.pvx .prop-chg-body{overflow:auto;padding:6px 16px 16px;display:flex;flex-direction:column;gap:14px}
.pvx .prop-chg-opt{display:flex;flex-direction:column;gap:10px;padding-top:10px}
.pvx .prop-chg-opt + .prop-chg-opt{border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-chg-opthead{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;font-size:.84rem;color:var(--dv-ink,#101418)}
.pvx .prop-chg-arrow{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dv-meta,#787D84);font-size:.8rem}
.pvx .prop-chg-tag{font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:5px}
.pvx .prop-chg-tag.add,.pvx .prop-chg-lbl.add{color:var(--dv-green,#2E7D5B)}
.pvx .prop-chg-tag.rem,.pvx .prop-chg-lbl.rem{color:#B3382C}
.pvx .prop-chg-lbl.chg{color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-chg-grp{display:flex;flex-direction:column;gap:6px}
.pvx .prop-chg-lbl{font-size:.64rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.pvx .prop-chg-line{display:flex;flex-direction:column;gap:3px;font-size:.82rem;color:var(--dv-ink,#101418)}
.pvx .prop-chg-line.row{flex-direction:row;justify-content:space-between;gap:12px}
.pvx .prop-chg-name{min-width:0;overflow-wrap:anywhere;font-weight:500}
.pvx .prop-chg-svc{color:var(--dv-meta,#787D84);font-weight:400}
.pvx .prop-chg-right{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dv-meta,#787D84)}
.pvx .prop-chg-sub{display:flex;justify-content:space-between;gap:12px;font-size:.8rem;color:var(--dv-meta,#787D84);font-variant-numeric:tabular-nums}
.pvx .prop-chg-sub span:last-child{color:var(--dv-ink,#101418);text-align:right}
@media(max-width:640px){.pvx .prop-chg-overlay{align-items:flex-end;padding:0}.pvx .prop-chg{width:100%;max-height:85vh;border-radius:14px 14px 0 0}}
/* Internal admin-review banner on a signed contract (staff-only). */
.pvx .prop-review-bar{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:4px 0 4px 12px;border:0;border-radius:0;background:none}
.pvx .prop-review-bar.pending{border-left:3px solid #C9A96E}
.pvx .prop-review-bar.done{border-left:3px solid #2f7d5a}
.pvx .prop-review-bar > svg{flex:none;color:var(--dv-meta,#787D84)}
.pvx .prop-review-bar.done > svg{color:#2f7d5a}
.pvx .prr-tx{display:flex;flex-direction:column;line-height:1.3;min-width:0}
.pvx .prr-tx b{font-size:.82rem;font-weight:650;color:var(--dv-ink,#101418)}
.pvx .prr-tx small{font-size:.72rem;color:var(--dv-meta,#787D84)}
.pvx .prr-btn{margin-left:auto;flex:none;height:30px;padding:0 14px;border:1px solid var(--dv-ink,#101418);border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prr-btn:hover{filter:brightness(1.12)}
.pvx .prr-btn:disabled{opacity:.45;cursor:default}
.pvx .prop-head-toolbar{gap:8px}
.pvx .prop-head{display:flex;align-items:center;gap:10px}
.pvx .prop-title{font-family:inherit;font-size:.97rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.pvx .prop-gear{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);cursor:pointer}
.pvx .prop-eye{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);cursor:pointer;font-family:inherit}
/* + Option moved into the toolbar — a compact outlined action matching the icon buttons */
.pvx .prop-head-slim .prop-opt-add{flex-shrink:0;height:30px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-head-slim .prop-opt-add:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-eye:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-eye-n{font-size:.78rem;font-weight:800;color:var(--dv-ink,#101418)}
.pvx .prop-gear:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-fp{position:relative}
.pvx .prop-fp-btn{height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:600;font-family:inherit;padding:0 12px;outline:none;cursor:pointer}
.pvx .prop-fp-btn:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-fp-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:60;width:260px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;box-shadow:0 10px 30px rgba(16,20,24,.12);padding:8px;display:flex;flex-direction:column;gap:2px}
.pvx .prop-fp-opt{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;font-size:.8rem;font-weight:500;color:var(--dv-ink,#101418);cursor:pointer}
.pvx .prop-fp-opt:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-fp-opt input{flex-shrink:0}
.pvx .prop-fp-opt span:first-of-type{flex:1}
.pvx .prop-fp-count{font-size:.7rem;font-weight:600;color:var(--dv-meta,#787D84)}
.pvx .prop-fp-acts{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 2px;border-top:1px solid var(--dv-line,#E4E4DF);margin-top:4px}
.pvx .prop-fp-all{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-fp-all:hover{color:var(--dv-ink,#101418)}
.pvx .prop-fp-go{height:30px;padding:0 14px;border:none;border-radius:7px;background:var(--dv-ink,#101418);color:#fff;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-fp-go:hover{filter:brightness(1.12)}
.pvx .prop-fp-go:disabled{opacity:.5;cursor:default}
.pvx .prop-block-num{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;margin-right:7px;border-radius:6px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-ink-soft,#3A4048);font-size:.68rem;font-weight:600;flex-shrink:0}
/* Infrastructure badge — a dark/inverted equipment chip (gold glyph + thin gold border) where the number would
   sit. The one cue that a row is supporting hardware (NVR/amp/display/switch), not a numbered endpoint. */
/* (quiet outlined glyph — distinct from a filled endpoint number, but not a loud chip) */
.pvx .prop-infra-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;width:20px;height:20px;margin-right:7px;border-radius:6px;background:transparent;color:var(--dv-gold-text,#8A6A1F);border:1px solid var(--dv-line,#E4E4DF);flex-shrink:0}
.pvx .prop-cflag-wrap{display:inline-flex;align-items:center;gap:5px;margin-left:8px;flex-shrink:0}
.pvx .prop-cflag{padding:2px 9px;border-radius:100px;font-size:.64rem;font-weight:600;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pvx .prop-cflag.remove{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.pvx .prop-cflag.change{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-cflag-btn{border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:6px;font-size:.6rem;font-weight:600;padding:2px 7px;cursor:pointer;font-family:inherit}
.pvx .prop-cflag-btn.done{color:var(--dv-green,#2E7D5B);border-color:#cfe6d8}
.pvx .prop-cflag-btn.done:hover{background:#e9f3ed}
.pvx .prop-cflag-btn.discard{color:var(--dv-meta,#787D84)}
.pvx .prop-cflag-btn.discard:hover{color:var(--dv-red,#C4553D);border-color:var(--dv-red,#C4553D)}
.pvx .prop-status{font-size:.74rem;font-weight:600;padding:4px 11px;border-radius:100px}
.pvx .prop-status.draft{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
/* Sent stamp = compact document metadata, NOT a pill: green dot + green "Sent", neutral date/time/
   sender. Segments wrap as whole units (never fragment-by-fragment). */
.pvx .prop-status.sent{background:none;padding:0;border-radius:0;flex-wrap:wrap;align-items:baseline;gap:0 6px;column-gap:6px;color:var(--dv-green,#2E7D5B)}
.pvx .prop-sent-dot{width:7px;height:7px;border-radius:50%;background:var(--dv-green,#2E7D5B);flex:0 0 auto;align-self:center}
.pvx .prop-sent-lbl{color:var(--dv-green,#2E7D5B);font-weight:700}
.pvx .prop-sent-seg{color:var(--dv-meta,#787D84);font-weight:500;white-space:nowrap}
.pvx .prop-status.changes{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-status.accepted{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.pvx .prop-note-strip{background:none;border:0;border-left:2px solid #C9A96E;color:var(--dv-ink-soft,#3A4048);font-size:.78rem;font-weight:500;padding:3px 0 3px 10px;border-radius:0}
.pvx .prop-tabs{display:flex;gap:6px;flex-wrap:wrap}
.pvx .prop-tab{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-tab.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-tab-add{color:var(--dv-meta,#787D84)}
.pvx .prop-tab-edit{padding-left:11px;padding-right:9px;gap:6px}
.pvx .prop-tab-letter{font-weight:800;opacity:.9}
.pvx .prop-tab-name{border:none;outline:none;background:transparent;color:#fff;font-size:.78rem;font-weight:700;font-family:inherit;padding:0;min-width:70px}
.pvx .prop-tab-name::placeholder{color:rgba(255,255,255,.5)}
.pvx .prop-tab-x{opacity:.7;cursor:pointer;font-size:.72rem;margin-left:1px}
.pvx .prop-tab-x:hover{opacity:1}
/* Frameless service section: one continuous document — a strong title, a hairline, then the lines on the open page.
   No outer border, no rounded shell, no shaded header band. The drag-over states keep their ring (that IS state). */
.pvx .prop-svc{border:none;border-radius:0;overflow:visible;background:none}
.pvx .prop-svc + .prop-svc{margin-top:14px}
.pvx .prop-svc.svc-over{box-shadow:0 0 0 2px var(--dv-gold,#B98A2E);border-radius:8px}
.pvx .prop-svc.svc-item-target{box-shadow:inset 0 0 0 2px var(--dv-gold,#B98A2E);border-radius:8px}
.pvx .prop-svc-head{display:flex;align-items:center;gap:4px;padding:2px 0 9px;background:none;border-bottom:1px solid var(--dv-line,#E4E4DF)}
/* The hairline under the title is the section divider — the first row after it doesn't add a second one. */
.pvx .prop-svc > .prop-svc-head + *{border-top:0}
.pvx .prop-svc-sp{flex:1 1 auto}
.pvx .prop-svc-name-in{font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);border:1px solid var(--dv-gold-text,#8A6A1F);border-radius:6px;padding:3px 8px;outline:none;font-family:inherit;min-width:150px;max-width:60%;background:#fff}
.pvx .prop-svc-drag{flex:none;display:flex;align-items:center;width:13px;margin-right:4px;color:var(--dv-meta,#787D84);opacity:.4;cursor:grab}
.pvx .prop-svc-drag:active{cursor:grabbing}
.pvx .prop-svc-head:hover .prop-svc-drag{opacity:.75}
/* Section title = the strongest type on the page below the price; the count is muted metadata. */
.pvx .prop-svc-name{font-size:.98rem;font-weight:650;color:var(--dv-ink,#101418);letter-spacing:-.005em}
.pvx .prop-svc-sub{font-size:.74rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pvx .prop-svc-count{font-size:.8rem;font-weight:500;color:var(--dv-meta,#787D84);letter-spacing:0}
.pvx .prop-sysbar{display:flex;flex-direction:column;align-items:stretch;gap:11px;padding:10px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:none}
/* Slot editors (NVR / HDD / Displays) stack as full-width line-item rows — label · dropdown · price,
   one per line — so they scale on a phone instead of a non-wrapping row of columns. */
.pvx .prop-sysrow{display:flex;flex-direction:column;align-items:stretch;gap:9px;flex-wrap:nowrap}
.pvx .prop-sysrow + .prop-sysrow{padding-top:12px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.pvx .prop-sys-field{display:flex;align-items:center;gap:7px;font-size:.68rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-sys-field select,.pvx .prop-sys-field input{height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.78rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none}
.pvx .prop-sys-field input{width:58px;text-align:center}
.pvx .prop-sys-field select:focus,.pvx .prop-sys-field input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-sys-hint{font-size:.72rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-nvr-warn{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:none}
.pvx .prop-nvr-warn-msg{font-size:.78rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-nvr-up{height:28px;padding:0 12px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-up:hover{filter:brightness(1.12)}
.pvx .prop-nvr-cancel{height:28px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-cancel:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-sys-field input:disabled{opacity:.45}
.pvx .prop-slots{display:flex;flex-direction:column;gap:8px}
.pvx .prop-slot{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px 10px;width:100%}
.pvx .prop-slot-lbl{flex:0 0 88px;display:flex;align-items:center;gap:6px;font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-slot select{flex:1 1 140px;min-width:0;height:34px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;font-size:.78rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none;color:var(--dv-ink,#101418)}
.pvx .prop-slot select:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-slot-name{flex:1 1 100%;order:6;box-sizing:border-box;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;font-size:.76rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;color:var(--dv-ink,#101418);background:#fff}
.pvx .prop-slot-name:focus{border-color:var(--dv-gold-text,#8A6A1F)}
/* Bays beyond the selected NVR's capacity — visible but locked, not just hidden */
.pvx .prop-slot-locked{opacity:.45}
.pvx .prop-slot-locked select{background:var(--dv-paper,#F4F4F2);cursor:not-allowed}
.pvx .prop-slot-locked .prop-slot-lbl{color:var(--dv-meta,#787D84)}
.pvx .prop-slot-cost{flex:0 0 92px;text-align:right;font-size:.74rem;font-weight:600;color:var(--dv-meta,#787D84)}
.pvx .prop-slot-price{flex:0 0 92px;width:92px;box-sizing:border-box;height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;text-align:right;font-size:.78rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F);font-family:inherit;outline:none;padding:0 8px;background:#fff}
.pvx .prop-slot-price:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-slot-price:disabled{opacity:.6;border-color:transparent;background:transparent}
.pvx .prop-slot-costin{flex:0 0 78px;width:78px;box-sizing:border-box;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;text-align:right;font-size:.7rem;font-weight:500;color:var(--dv-meta,#787D84);font-family:inherit;outline:none;padding:0 6px;background:var(--dv-paper,#F4F4F2)}
.pvx .prop-slot-costin:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-svc-x{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.85rem;cursor:pointer;padding:2px 6px}
.pvx .prop-svc-gearwrap{position:relative;flex-shrink:0;display:inline-flex}
.pvx .prop-svc-gear{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:7px;background:none;color:var(--dv-meta,#787D84);cursor:pointer;flex-shrink:0}
.pvx .prop-svc-gear:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-svc-gear:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-svc-x:hover{color:var(--dv-red,#C4553D)}
.pvx .prop-item{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.pvx .prop-item-desc{grid-column:1 / -1;margin:1px 0 0;border:0;background:transparent;font-size:12px;font-style:italic;color:var(--dv-muted,#6a7085);padding:2px 4px 2px 2px;width:100%;outline:none;box-sizing:border-box}
.pvx .prop-item-desc:focus{background:var(--dv-raise,#FBFBFA);border-radius:5px}
.pvx .prop-item-desc::placeholder{font-style:normal;color:#c2c6cf}
/* Progressive description: the "+ description" control + the inline editor + remove-confirm. Empty optional
   descriptions never reserve a row. */
.pvx .prop-desc-row{grid-column:1 / -1;display:flex;align-items:center;gap:6px;margin:1px 0 0;position:relative}
.pvx .prop-desc-row .prop-item-desc{grid-column:auto;flex:1;margin:0}
.pvx .prop-item-descro{font-size:12px;font-style:italic;color:var(--dv-muted,#6a7085);padding:2px 4px 2px 2px}
.pvx .prop-desc-add{display:inline-flex;align-items:center;gap:5px;background:none;border:none;color:var(--dv-meta,#787D84);font-size:.72rem;font-weight:600;font-family:inherit;cursor:pointer;padding:2px 6px 2px 2px;border-radius:5px}
.pvx .prop-desc-add:hover{color:var(--dv-ink,#101418);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-desc-rm{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:none;border:none;color:var(--dv-meta,#787D84);cursor:pointer;border-radius:5px;flex-shrink:0}
.pvx .prop-desc-rm:hover{color:var(--dv-red,#C4553D);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-desc-confirm{position:absolute;right:0;top:calc(100% + 4px);z-index:30;display:flex;align-items:center;gap:8px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;box-shadow:0 10px 26px rgba(16,20,24,.14);padding:7px 10px;font-size:.76rem;font-weight:500;color:var(--dv-ink,#101418);white-space:nowrap}
.pvx .prop-desc-cancel{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-desc-cancel:hover{color:var(--dv-ink,#101418)}
.pvx .prop-desc-go{height:26px;padding:0 11px;border:none;border-radius:6px;background:var(--dv-red,#C4553D);color:#fff;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-item.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-item input{height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.8rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}
.pvx .prop-item input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-item input.num{text-align:right}
.pvx .prop-item input:not(.num){text-transform:capitalize}
.pvx .prop-item-nametext{flex:1;min-width:0;min-height:30px;display:flex;align-items:center;font-size:.8rem;font-weight:500;color:var(--dv-ink,#101418);text-transform:capitalize;white-space:normal;overflow:visible;overflow-wrap:anywhere;line-height:1.25;cursor:text;padding:4px 8px;border:1px solid transparent;border-radius:7px}
.pvx .prop-item-nametext{flex:0 1 auto}
.pvx .prop-item-nametext:hover{background:var(--dv-paper,#F4F4F2)}
/* Visible one-click rename on a camera/block name (replaces the hidden double-click). */
.pvx .prop-name-edit{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--dv-meta,#9aa0ab);border-radius:6px;cursor:pointer;opacity:.55}
.pvx .prop-name-edit:hover{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);opacity:1}
/* Description toggle next to the name: speech-bubble + (add) / − (remove). Quiet by default, gold when active. */
.pvx .prop-desc-tog{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--dv-meta,#9aa0ab);border-radius:6px;cursor:pointer;opacity:.6}
.pvx .prop-desc-tog:hover{background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);opacity:1}
.pvx .prop-desc-tog.on{color:var(--dv-gold-text,#8A6A1F);opacity:1}
.pvx .prop-desc-tog.on:hover{color:var(--dv-red,#C4553D)}
/* Item-name field with catalog type-ahead */
.pvx .prop-name-ac{position:relative;flex:1;min-width:0}
.pvx .prop-name-ac input{width:100%}
.pvx .prop-name-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:70;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;box-shadow:0 10px 30px rgba(16,20,24,.12);padding:4px;max-height:220px;overflow-y:auto}
.pvx .prop-name-opt{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;cursor:pointer;font-size:.78rem}
.pvx .prop-name-opt:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-name-opt.mine{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-name-opt.mine:hover{background:var(--dv-line-soft,#EDEDE9)}
.pvx .prop-name-opt-name{flex:1;font-weight:600;color:var(--dv-ink,#101418);text-transform:none}
.pvx .prop-name-opt-svc{font-size:.66rem;font-weight:600;color:var(--dv-meta,#787D84);text-transform:uppercase;letter-spacing:.03em}
.pvx .prop-name-opt-price{font-size:.76rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F);flex-shrink:0}
/* No number-spinner arrows anywhere in the proposal — they look cramped in tight cells */
.pvx .prop-wrap input[type=number]::-webkit-outer-spin-button,
.pvx .prop-wrap input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prop-wrap input[type=number]{-moz-appearance:textfield;appearance:textfield}
.pvx .prop-chev{background:none;border:none;padding:0 2px;color:var(--dv-gold-text,#8A6A1F);font-size:.72rem;cursor:pointer;flex-shrink:0;font-family:inherit}
.pvx .prop-chev:hover{color:var(--dv-gold-text,#8A6A1F)}
/* Expanded breakdown rows: hierarchy comes from indentation + hairlines, NOT fills. Children are the
   internal composition of the parent — same neutral canvas, readable (never disabled-looking) text. No
   zebra, no shaded first child. */
.pvx .prop-item.sub{background:transparent;border-top:1px solid var(--dv-line-soft,#EDEDE9);padding-left:30px;transition:background .12s}
.pvx .prop-item.sub.alt{background:transparent}
.pvx .prop-item.sub:hover{background:rgba(17,20,24,.025)}
.pvx .prop-item.sub input{background:transparent;border-color:transparent;font-weight:500;color:var(--dv-ink,#101418)}
.pvx .prop-item.sub input:focus{border-color:var(--dv-gold-text,#8A6A1F);background:#fff}
.pvx .prop-item.sub .prop-line-total{color:var(--dv-ink,#101418);font-weight:500}
/* Compact responsive sub-item (bundle component): name … amount by default, click to inline-edit. One
   component on desktop + mobile — a flex row (not the rigid grid), so narrow screens never overflow.
   The child is indented as a unit (wrapper margin) so its hairline starts at the indent, not the page edge. */
.pvx .prop-sub2-wrap{position:relative;margin-left:30px}
.pvx .prop-sub2{display:flex;align-items:center;gap:8px;width:100%;padding:8px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9);background:transparent;font-family:inherit;box-sizing:border-box}
/* Right padding = the parent's ••• column, so child amounts right-align with the parent price above them. */
.pvx button.prop-sub2.compact{border:none;border-top:1px solid var(--dv-line-soft,#EDEDE9);text-align:left;cursor:pointer;min-height:38px;padding-right:36px}
.pvx button.prop-sub2.compact:hover{background:rgba(17,20,24,.055)}
.pvx .prop-sub2.static{padding-right:36px;min-height:38px}
/* ONE canonical child-row grammar (camera sub-items · NVR · Displays): a local A/B/C badge — subordinate
   to the parent number badge (smaller, pale gold, lower contrast) — plus a very light alternating surface.
   The badge is decorative (aria-hidden); the title stays the semantic label. */
.pvx .prop-sub2-badge{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:rgba(201,169,110,.17);color:var(--dv-gold-text,#8A6A1F);font-size:.6rem;font-weight:700;flex-shrink:0;font-variant-numeric:tabular-nums}
/* Zebra: neutral only (never a status/condition colour), lighter than hover so interaction stays legible —
   it just helps the eye track label → name → price across a wide row. */
.pvx .prop-sub2-wrap.alt>.prop-sub2{background:rgba(17,20,24,.022)}
/* Grouped equipment (NVR / Displays / Amp): the real child rows indent under the parent's NAME (past chevron + badge), not the page edge. */
.pvx .prop-lead .prop-sub2-wrap{margin-left:30px}/* align infra (NVR/Displays) children to the camera child column */
.pvx .prop-lead .prop-sub2-name{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.3;overflow-wrap:anywhere}
/* Children: regular weight, slightly smaller than the parent, still full-strength ink (never disabled-gray). */
/* Child names wrap rather than truncate — a long equipment name drops to a second line, the price stays
   anchored right (never pushed off-screen). One rule for camera / NVR / Displays children alike. */
.pvx .prop-sub2-name{flex:1;min-width:0;font-size:.8rem;font-weight:450;color:var(--dv-ink,#101418);white-space:normal;overflow-wrap:anywhere;line-height:1.3;text-transform:capitalize}
.pvx .prop-sub2-math{font-size:.72rem;color:var(--dv-meta,#787D84);white-space:nowrap;flex-shrink:0}
.pvx .prop-sub2-amt{font-size:.8rem;font-weight:450;color:var(--dv-ink,#101418);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;flex-shrink:0;min-width:62px}
.pvx .prop-sub2-tag{margin-left:7px;font-size:.58rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#B45B22;background:rgba(197,107,44,.12);border-radius:100px;padding:1px 7px;vertical-align:middle}
/* Inline edit mode */
.pvx .prop-sub2.editing{flex-wrap:wrap}
.pvx .prop-sub2 .prop-name-ac{flex:1 1 140px;min-width:120px}
.pvx .prop-sub2 input{height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.8rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;box-sizing:border-box;width:100%}
.pvx .prop-sub2 input.num{text-align:right;width:auto}
.pvx .prop-sub2 input:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-sub2-qty{width:46px!important}
.pvx .prop-sub2-price{width:76px!important}
.pvx .prop-sub2-cost{width:64px!important}
.pvx .prop-sub2-mul{color:var(--dv-meta,#787D84);font-size:.8rem;flex-shrink:0}
/* Inline sub-item action bar: Done · Duplicate · Remove, grouped in one subtle pill so they read as a set. */
.pvx .prop-sub2-bar{display:inline-flex;align-items:center;gap:1px;flex-shrink:0;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;background:var(--dv-raise,#FBFBFA);padding:1px}
.pvx .prop-sub2-done,.pvx .prop-sub2-dup,.pvx .prop-sub2-del{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:none;border-radius:7px;cursor:pointer;flex-shrink:0}
.pvx .prop-sub2-done{color:var(--dv-green,#2E7D5B)}
.pvx .prop-sub2-done:hover{background:rgba(46,125,91,.1)}
.pvx .prop-sub2-dup{color:var(--dv-meta,#787D84)}
.pvx .prop-sub2-dup:hover{color:var(--dv-gold-text,#8A6A1F);background:rgba(201,169,110,.14)}
.pvx .prop-sub2-del{color:var(--dv-meta,#787D84)}
.pvx .prop-sub2-del:hover{color:var(--dv-red,#C4553D);background:rgba(196,85,61,.1)}
/* Inline grouped-item child editor: the selector (recorder/drive/display) + a custom-name field. One
   grammar with the camera sub-item editor — no separate form. */
.pvx .prop-lead-sel{flex:1 1 150px;min-width:120px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.8rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;box-sizing:border-box}
.pvx .prop-lead-sel:focus{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-sub2-cname{width:130px!important;text-align:left!important}
.pvx .prop-subadd-note{font-size:.74rem;font-weight:500;color:var(--dv-meta,#787D84)}
/* NVR downgrade conflict dialog — confirm before dropping drives (never silent). */
.pvx .prop-conflict-bg{position:fixed;inset:0;z-index:200;background:rgba(16,20,24,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.pvx .prop-conflict{width:min(360px,100%);background:var(--dv-raise,#FBFBFA);border-radius:14px;box-shadow:0 24px 60px rgba(16,20,24,.28);padding:18px;display:flex;flex-direction:column;gap:6px}
.pvx .prop-conflict-t{font-size:.95rem;font-weight:650;color:var(--dv-ink,#101418)}
.pvx .prop-conflict-m{font-size:.82rem;color:var(--dv-meta,#787D84)}
.pvx .prop-conflict-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.pvx .prop-conflict-cancel{height:34px;padding:0 14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-conflict-go{height:34px;padding:0 14px;border:none;border-radius:8px;background:var(--dv-red,#C4553D);color:#fff;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}
/* Add-Hard-Drive size picker — a small anchored menu (don't assume a default drive). */
.pvx .prop-subadd-rel{position:relative}
.pvx .prop-pick-back{position:fixed;inset:0;z-index:40}
.pvx .prop-pick{position:absolute;left:30px;top:calc(100% - 2px);z-index:50;min-width:180px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;box-shadow:0 14px 34px rgba(16,20,24,.18);padding:6px}
.pvx .prop-pick-lbl{font-size:.6rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:5px 9px 4px}
.pvx .prop-pick-opt{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;appearance:none;border:0;background:none;font-family:inherit;font-size:.82rem;font-weight:500;color:var(--dv-ink,#101418);padding:8px 9px;border-radius:7px;cursor:pointer}
.pvx .prop-pick-opt:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-pick-price{color:var(--dv-meta,#787D84);font-variant-numeric:tabular-nums}
.pvx .prop-block{border-left:2px solid transparent;transition:background .12s,border-color .12s;border-top:1px solid var(--dv-line,#E4E4DF);position:relative}
/* Expanded parent: one restrained gold left accent marks the open group — never a full-group fill.
   Group boundary: a little extra breathing room below an expanded group (and below each infra lead)
   so the last child never visually merges into the next parent row — spacing, not a heavy border. */
.pvx .prop-block.prop-open{border-left-color:var(--dv-gold,#C9A96E);margin-bottom:10px}
.pvx .prop-lead{margin-bottom:8px}/* Drag-to-reorder line items */
.pvx .prop-block.has-drag{padding-left:17px}
.pvx .prop-drag-handle{position:absolute;left:0;top:0;bottom:0;width:17px;display:flex;align-items:center;justify-content:center;color:var(--dv-meta,#787D84);opacity:.35;cursor:grab}
.pvx .prop-drag-handle:active{cursor:grabbing}
.pvx .prop-block:hover .prop-drag-handle{opacity:.7}
.pvx .prop-block.prop-dragging{opacity:.45}
.pvx .prop-block.prop-dragover{border-top:2px solid var(--dv-gold,#C9A96E);background:var(--dv-line-soft,#EDEDE9)}
/* Recording-system "Done" button + collapsed NVR/Displays summary lines */
.pvx .prop-slot-x{margin-left:6px;border:none;background:transparent;color:var(--dv-red,#C4553D);font-size:.68rem;cursor:pointer;padding:0;opacity:.65}
.pvx .prop-slot-x:hover{opacity:1}
.pvx .prop-add-slot{align-self:flex-start;height:auto;padding:4px 6px;margin-left:-6px;border:none;border-radius:6px;background:none;color:var(--dv-meta,#787D84);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-add-slot:hover{color:var(--dv-gold-text,#8A6A1F);background:rgba(17,20,24,.03)}
.pvx .prop-camask{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-gold,#C9A96E);border-radius:9px;padding:4px 8px 4px 12px}
.pvx .prop-camask input{width:56px;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;padding:0 8px;font-size:.82rem;font-family:inherit;text-align:center}
.pvx .prop-camask-go{height:28px;padding:0 12px;border:none;border-radius:6px;background:var(--dv-ink,#101418);color:#fff;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-camask-x{height:28px;padding:0 8px;border:none;background:transparent;color:var(--dv-meta,#787D84);font-size:.74rem;cursor:pointer;font-family:inherit}
.pvx .prop-sys-done{align-self:flex-start;height:32px;padding:0 18px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit;margin-top:2px}
.pvx .prop-sys-done:hover{filter:brightness(1.12)}
/* Infrastructure rows (NVR / Displays / Amp): compact supporting lines — quieter than a numbered endpoint, never a card. */
.pvx .prop-sysline{display:flex;align-items:center;gap:10px;padding:8px 0}
.pvx .prop-sysline-name{font-size:.84rem;font-weight:600;color:var(--dv-ink,#101418)}
/* Collapsed-group scan-summary: muted, lighter, inline after the title on desktop; min-width:0 so it
   ellipses rather than shoving the price. On mobile it drops to its own indented line (see @media). */
.pvx .prop-sysline-sum{font-size:.78rem;font-weight:500;color:var(--dv-meta,#787D84);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
/* The ••• column is a fixed 28px (same as the line-item grid) so infrastructure totals line up with line prices. */
.pvx .prop-sysline .prop-im-wrap,.pvx .prop-sysline .prop-im-sp{flex:0 0 28px;margin-left:-2px}
.pvx .prop-desc-row{padding-left:56px}
.pvx .prop-sysline-total{margin-left:auto;font-size:.82rem;font-weight:550;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.pvx .prop-sysline-edit{flex-shrink:0}
.pvx .prop-block .prop-item{border-top:none}
.pvx .prop-block+.prop-block{border-top:1px solid var(--dv-line,#E4E4DF)}
/* No zebra on top-level blocks — adjacent camera rows read as distinct via the hairline separator. */
.pvx .prop-block.alt{background:transparent}
/* Waived block: comped off the invoice — a green "Waived" banner on the left, and the
   original price struck through on the right so you can still see the amount waived. */
.pvx .prop-block.prop-waived{border-left-color:var(--dv-green,#2E7D5B)}
.pvx .prop-waived-banner{font-size:.64rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:var(--dv-green,#2E7D5B);border-radius:100px;padding:2px 9px;white-space:nowrap}
.pvx .prop-waived-strike{color:var(--dv-red,#C4553D);text-decoration:line-through;text-decoration-color:var(--dv-red,#C4553D)}
/* Camera group header: bolder name, prominent block total, no per-line price of its own */
.pvx .prop-item.prop-parent input{font-weight:600}
.pvx .prop-item.prop-parent .prop-item-nametext{font-weight:600;font-size:.88rem}
.pvx .prop-item.prop-parent .prop-line-total{font-weight:650;font-size:.88rem;color:var(--dv-ink,#101418)}
/* Hover/edit feedback is a faint tint + the gold accent — no heavy fill that competes with content. */
.pvx .prop-block:hover{background:rgba(17,20,24,.015)}
.pvx .prop-block:focus-within{background:transparent;border-left-color:var(--dv-gold-text,#8A6A1F)}
/* Outdoor placement — red name text (an <input>'s value can't be partially colored, so the
   whole name goes red rather than just the "(O)" suffix) */
.pvx .prop-subadd{padding:2px 0 8px 30px;background:transparent}
/* Lightweight inline "+ Sub-item" — text + small plus, no button chrome */
.pvx .prop-subadd-btn{display:inline-flex;align-items:center;gap:5px;background:none;border:none;padding:4px 6px;margin-left:-6px;border-radius:6px;color:var(--dv-meta,#787D84);font-size:.74rem;font-weight:600;font-family:inherit;cursor:pointer}
.pvx .prop-subadd-btn:hover{color:var(--dv-gold-text,#8A6A1F);background:rgba(17,20,24,.03)}
.pvx .prop-savestat{font-size:.74rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.pvx .prop-savestat.saving{color:var(--dv-meta,#787D84)}
.pvx .prop-line-total{font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);text-align:right;font-variant-numeric:tabular-nums}
/* Price = the breakdown toggle. Reads as the price (no button chrome), with a subtle chevron that
   flips when expanded, and a comfortable tap area around it. */
.pvx button.prop-price-toggle{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;background:none;border:none;font:inherit;font-weight:600;color:var(--dv-ink,#101418);cursor:pointer;padding:4px 0 4px 10px;margin:-4px 0;min-height:30px;border-radius:8px}
.pvx button.prop-price-toggle:hover{color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-price-chev{opacity:.42;transition:transform .18s,opacity .15s;flex-shrink:0}
.pvx button.prop-price-toggle:hover .prop-price-chev{opacity:.85}
.pvx button.prop-price-toggle.open .prop-price-chev{transform:rotate(180deg);opacity:.7}
.pvx .prop-item-x{background:none;border:none;color:var(--dv-meta,#787D84);cursor:pointer;font-size:.85rem;padding:0}
.pvx .prop-item-x:hover{color:var(--dv-red,#C4553D)}
/* Left disclosure spacer — keeps flat rows aligned with chevron'd ones */
.pvx .prop-disc-sp{width:17px;flex:0 0 auto}
/* "+ Description" inline affordance (after the name) + collapsed preview + the editor's Done check */
.pvx .prop-desc-add2{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--dv-meta,#787D84);font-family:inherit;cursor:pointer;padding:0;border-radius:5px;flex-shrink:0;margin-left:6px}
.pvx .prop-desc-add2:hover{color:var(--dv-ink,#101418);background:var(--dv-paper,#F4F4F2)}
/* Dictation mic inside the open description editor — pure enhancement, hidden where unsupported */
.pvx .prop-desc-mic{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:none;border:none;color:var(--dv-meta,#787D84);cursor:pointer;border-radius:5px;flex-shrink:0}
.pvx .prop-desc-mic:hover{color:var(--dv-ink,#101418);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-desc-mic.on{color:var(--dv-red,#C4553D);animation:prop-mic-pulse 1.1s ease-in-out infinite}
@keyframes prop-mic-pulse{0%,100%{opacity:1}50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.pvx .prop-desc-mic.on{animation:none}}
.pvx .prop-desc-preview{background:none;border:none;font-family:inherit;font-size:12px;font-style:italic;color:var(--dv-muted,#6a7085);cursor:pointer;text-align:left;padding:2px 4px 2px 2px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.pvx .prop-desc-preview:hover{color:var(--dv-ink,#101418);text-decoration:underline}
.pvx .prop-desc-done{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:none;border:none;color:var(--dv-green,#2E7D5B);cursor:pointer;border-radius:5px;flex-shrink:0}
.pvx .prop-desc-done:hover{background:var(--dv-paper,#F4F4F2)}
/* Line-item ••• action menu */
.pvx .prop-im-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.pvx .prop-item-menu{background:none;border:none;color:var(--dv-meta,#787D84);cursor:pointer;padding:3px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center}
.pvx .prop-item-menu:hover{color:var(--dv-ink,#101418);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-im{position:absolute;right:0;top:calc(100% + 4px);z-index:60;min-width:172px;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;box-shadow:0 12px 32px rgba(16,20,24,.17);padding:5px}
/* Flip up when opening down would clip against the card's bottom (late rows) */
.pvx .prop-im.up{top:auto;bottom:calc(100% + 4px)}
.pvx .prop-im-item{display:block;width:100%;appearance:none;border:0;background:none;font-family:inherit;font-size:.8rem;font-weight:500;color:var(--dv-ink,#101418);text-align:left;padding:8px 10px;border-radius:7px;cursor:pointer}
.pvx .prop-im-item:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-im-item.danger{color:var(--dv-red,#C4553D)}
.pvx .prop-im-item.danger:hover{background:rgba(196,85,61,.08)}
.pvx .prop-im-sep{height:1px;background:var(--dv-line,#E4E4DF);margin:4px 6px}
.pvx .prop-im-confirm{padding:9px 11px;min-width:210px}
.pvx .prop-im-ctitle{font-size:.82rem;font-weight:700;color:var(--dv-ink,#101418)}
.pvx .prop-im-csub{font-size:.76rem;color:var(--dv-meta,#787D84);margin:3px 0 11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pvx .prop-im-cacts{display:flex;justify-content:flex-end;align-items:center;gap:10px}
.pvx .prop-im-cancel{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-im-cancel:hover{color:var(--dv-ink,#101418)}
.pvx .prop-im-go{height:30px;padding:0 13px;border:none;border-radius:7px;background:var(--dv-red,#C4553D);color:#fff;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-im-go:hover{filter:brightness(1.08)}
/* Conditions submenu inside ••• — a small group of togglable condition types + an additive bulk-apply */
.pvx .prop-im-grouplbl{font-size:.6rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84);padding:5px 10px 2px}
.pvx .prop-im-cond{display:flex;align-items:center;gap:8px}
.pvx .prop-im-cdot{width:8px;height:8px;border-radius:2px;flex:0 0 auto}
.pvx .prop-im-cdot.gold{background:#C79A1E}
.pvx .prop-im-cdot.orange{background:#C56B2C}
.pvx .prop-im-cname{flex:1}
.pvx .prop-im-cond.on{font-weight:700}
.pvx .prop-im-ck{color:var(--dv-green,#2E7D5B);flex:0 0 auto}
.pvx .prop-im-apply{color:var(--dv-gold-text,#8A6A1F);font-weight:600}
/* Condition badges on the row (gold = customer-supplied, orange = existing cable). Shown only when set. */
/* Compact tag: the color lives on the tag only (never the row) — small radius, sentence case, readable. */
.pvx .prop-cond{flex:0 0 auto;margin-left:8px;padding:1px 7px;border-radius:5px;font-size:.68rem;font-weight:600;letter-spacing:.01em;line-height:1.5;white-space:nowrap}
.pvx .prop-cond.gold{background:#f6edcf;color:#7A5C14}
.pvx .prop-cond.orange{background:#f7e4d6;color:#9A4A17}
/* Toast "Existing" toggle on a Line Drop line — off = new $150 run, on = existing $50 test & map */
.pvx .prop-exist-tog{flex:0 0 auto;margin-left:8px;padding:2px 9px;border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);font-family:inherit;font-size:.64rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;cursor:pointer;transition:.12s;white-space:nowrap}
.pvx .prop-exist-tog:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-ink,#101418)}
.pvx .prop-exist-tog.on{background:#eaf5ee;border-color:#bfe0cc;color:#2E7D5B}
.pvx .prop-exist-tag{flex:0 0 auto;margin-left:8px;padding:2px 9px;border-radius:100px;background:#eaf5ee;color:#2E7D5B;font-size:.64rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.pvx .prop-cols{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;padding:8px 0 2px;font-size:.62rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-cols.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-cols span.r{text-align:right}
.pvx .prop-addbar{display:flex;flex-direction:column;gap:9px;align-items:stretch;padding:10px 0 2px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-preset-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.pvx .prop-addrow-basic{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pvx .prop-preset-chip{display:inline-flex;align-items:center;height:30px;padding:0 13px;border:none;border-radius:999px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
/* Color-coded preset chips (green / yellow / orange) so each bundle is distinct at a glance */
.pvx .prop-preset-chip.c0{background:#2E7D5B}
.pvx .prop-preset-chip.c1{background:#C79A1E}
.pvx .prop-preset-chip.c2{background:#C56B2C}
.pvx .prop-preset-chip:hover{filter:brightness(1.12)}
.pvx .prop-preset-edit{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-preset-edit:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-addbar select{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;max-width:240px}
.pvx .prop-dl{position:relative;display:inline-block}
.pvx .prop-dl>summary{list-style:none}
.pvx .prop-dl>summary::-webkit-details-marker{display:none}
.pvx .prop-dl-menu{position:absolute;left:0;bottom:calc(100% + 4px);z-index:20;min-width:150px;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:10px;box-shadow:0 10px 30px -12px rgba(16,20,24,.35);padding:4px;display:flex;flex-direction:column}
.pvx .prop-dl-menu button{background:none;border:none;text-align:left;padding:8px 10px;border-radius:7px;font:inherit;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418);cursor:pointer}
.pvx .prop-dl-menu button:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-dl-err{font-size:.76rem;font-weight:600;color:var(--dv-red,#C4553D);margin-left:8px;animation:propDlErr 4s forwards}
@keyframes propDlErr{0%,85%{opacity:1}100%{opacity:0}}
.pvx .prop-mini{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-mini:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-mini.gold{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-mini.gold:hover{filter:brightness(1.12)}
.pvx .prop-mini:disabled{opacity:.45;cursor:default}
.pvx .prop-svc-note{padding:8px 0;border-top:1px solid var(--dv-line-soft,#EDEDE9);font-size:.74rem;color:var(--dv-meta,#787D84);white-space:pre-wrap}
/* Waivers: a collapsible section on the page (hairline above), not a gray card. */
.pvx .prop-waiver{width:100%;margin-top:14px;border:none;border-top:1px solid var(--dv-line,#E4E4DF);border-radius:0;background:none;overflow:visible}
.pvx .prop-waiver-head{width:100%;display:flex;align-items:center;gap:8px;padding:11px 0;background:none;border:none;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-waiver-head .prop-chev{color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-waiver-count{margin-left:auto;font-size:.72rem;font-weight:600;color:var(--dv-gold-text,#8A6A1F);background:var(--dv-line-soft,#EDEDE9);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:2px 9px}
.pvx .prop-waiver-body{border-top:1px solid var(--dv-line-soft,#EDEDE9);padding:10px 0;display:flex;flex-direction:column;gap:3px}
.pvx .prop-waiver-bulk{display:flex;gap:8px;margin-bottom:6px}
.pvx .prop-waiver-bulk button{height:26px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-meta,#787D84);font-size:.7rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-waiver-bulk button:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-waiver-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:.82rem}
.pvx .prop-waiver-row:hover{background:var(--dv-line-soft,#EDEDE9)}
.pvx .prop-waiver-row.on .prop-waiver-name{text-decoration:line-through;color:var(--dv-meta,#787D84)}
.pvx .prop-waiver-row input{width:16px;height:16px;accent-color:var(--dv-gold-text,#8A6A1F);cursor:pointer}
.pvx .prop-waiver-name{flex:1;min-width:0;font-weight:600;color:var(--dv-ink,#101418);display:flex;align-items:baseline;gap:8px}
.pvx .prop-waiver-svc{font-size:.68rem;font-weight:600;color:var(--dv-meta,#787D84);text-transform:uppercase;letter-spacing:.03em}
.pvx .prop-waiver-amt{font-weight:600;white-space:nowrap;color:var(--dv-ink,#101418)}
.pvx .prop-waiver-row.on .prop-waiver-amt{color:var(--dv-gold-text,#8A6A1F);text-decoration:none}
.pvx .prop-totals{display:flex;flex-direction:column;gap:9px;width:100%;margin-top:10px;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:12px}
.pvx .prop-trow{display:flex;justify-content:space-between;align-items:center;gap:18px;font-size:.82rem;color:var(--dv-meta,#787D84);font-weight:500;min-height:28px}
.pvx .prop-trow b{color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.pvx .prop-total-big b{font-variant-numeric:tabular-nums}
.pvx .prop-adj{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pvx .prop-minus{color:var(--dv-green,#2E7D5B);white-space:nowrap}
.pvx .prop-trow-addon span{color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-plus{color:var(--dv-gold-text,#8A6A1F);font-weight:700;white-space:nowrap}
/* TOTAL = type, not a card: label left, big gold figure right. A hairline above it only when modifier rows sit above
   it (the .prop-totals divider already separates it from the lines when it's the only row). */
.pvx .prop-total-big{display:flex;justify-content:space-between;align-items:baseline;gap:18px;margin:0;padding:2px 0 4px;background:none;border:0;border-radius:0}
.pvx .prop-trow + .prop-total-big{margin-top:4px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-total-big span{font-size:.8rem;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--dv-ink-soft,#3A4048)}
.pvx .prop-total-big b{font-size:1.6rem;font-weight:650;color:var(--dv-gold-text,#8A6A1F);letter-spacing:-.01em}
.pvx .prop-plan-terms{font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.4;padding:0}
/* Uniform preset buttons + input across Discount / PCP / Tax / Payment-plan rows.
   Same height, same min-width, centered — inputs flush right so every row lines up. */
.pvx .prop-adj{gap:7px}
.pvx .prop-tax-btn,.pvx .prop-plan-btn{height:30px;min-width:54px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.73rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.pvx .prop-tax-btn:hover,.pvx .prop-plan-btn:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-tax-btn.on,.pvx .prop-plan-btn.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-trow .tin{width:72px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;text-align:right;padding:0 8px;font-size:.76rem;font-weight:600;font-family:inherit;outline:none;color:var(--dv-ink,#101418);background:#fff}
.pvx .prop-trow .tin:focus{border-color:var(--dv-gold-text,#8A6A1F)}
/* Payment plan: a header (label · plan signature), then one column per milestone — the amount sits directly under its own
   term. auto-fit columns: three across on a wide row, wrapping (never scrolling) when the width runs out. */
.pvx .prop-plan{display:flex;flex-direction:column;gap:10px;margin-top:10px;padding-top:12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-plan-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.pvx .prop-plan-lbl{font-size:.7rem;color:var(--dv-meta,#787D84);font-weight:650;letter-spacing:.07em;text-transform:uppercase}
.pvx .prop-plan-sig{font-size:.8rem;font-weight:650;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;white-space:nowrap}
.pvx .prop-plan-ro{font-size:.8rem;color:var(--dv-ink,#101418)}
.pvx .prop-plan-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 24px}
.pvx .prop-plan-col{display:flex;flex-direction:column;justify-content:space-between;gap:3px;min-width:0}
.pvx .prop-plan-term{font-size:.8rem;color:var(--dv-meta,#787D84);font-weight:500;line-height:1.3;text-transform:capitalize}
.pvx .prop-plan-term b{color:var(--dv-ink,#101418);font-weight:650;font-variant-numeric:tabular-nums}
.pvx .prop-plan-amt{font-size:1.02rem;font-weight:650;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.pvx .prop-plan-opts{display:flex;gap:6px;width:100%}
.pvx .prop-plan-opts .prop-plan-btn{flex:1 1 0;min-width:0;padding:0 6px}
.pvx .prop-plan-edit{display:flex;flex-direction:column;gap:6px;width:100%}
/* Pay-in-full timing: before we begin / upon completion / a chosen date */
.pvx .prop-plan-timing{display:flex;gap:6px;width:100%}
.pvx .prop-time-btn,.pvx .prop-time-date{flex:1 1 0;min-width:0;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;padding:0 6px}
.pvx .prop-time-btn:hover,.pvx .prop-time-date:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-time-btn.on,.pvx .prop-time-date.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-time-date{position:relative}
.pvx .prop-time-date input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-family:inherit}
/* Custom schedule: # payments stepper + one compact row per payment */
.pvx .prop-cplan{background:none;border:0;border-radius:0;padding:0;margin:2px 0;display:flex;flex-direction:column;gap:8px}
.pvx .prop-cplan-head{display:flex;align-items:center;gap:10px;font-size:.78rem;color:var(--dv-meta,#787D84);font-weight:600}
.pvx .prop-cplan-step{display:inline-flex;align-items:center;gap:9px}
.pvx .prop-cplan-step button{width:24px;height:24px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:1rem;line-height:1;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center}
.pvx .prop-cplan-step button:disabled{opacity:.4;cursor:default}
.pvx .prop-cplan-step b{min-width:14px;text-align:center;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums}
.pvx .prop-cplan-cad{margin-left:auto;position:relative}
.pvx .prop-cplan-gear{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink-soft,#3A4048);font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-cplan-gear:hover{border-color:var(--dv-gold-text,#8A6A1F);color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-cplan-gear svg{opacity:.7}
.pvx .prop-cplan-cadmenu{position:absolute;top:30px;right:0;z-index:20;background:#fff;border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;box-shadow:0 10px 28px rgba(16,20,24,.14);padding:4px;display:flex;flex-direction:column;min-width:130px}
.pvx .prop-cplan-cadmenu button{text-align:left;height:30px;padding:0 10px;border:none;background:transparent;border-radius:6px;color:var(--dv-ink,#101418);font-size:.76rem;font-weight:500;cursor:pointer;font-family:inherit}
.pvx .prop-cplan-cadmenu button:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-cplan-cadmenu button.on{color:var(--dv-gold-text,#8A6A1F);font-weight:700}
.pvx .prop-cplan-row{display:flex;align-items:center;gap:6px}
.pvx .prop-cplan-n{width:18px;height:18px;flex-shrink:0;border-radius:50%;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84);font-size:.66rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.pvx .prop-cplan-row .tin{width:44px;flex-shrink:0;padding:0 5px}
.pvx .prop-cplan-pc{color:var(--dv-meta,#787D84);font-size:.72rem;margin-left:-2px;flex-shrink:0}
.pvx .prop-cplan-date{position:relative;flex:1 1 auto;min-width:66px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 6px;font-size:.72rem;font-weight:600;color:var(--dv-ink,#101418);background:#fff;cursor:pointer;white-space:nowrap}
.pvx .prop-cplan-date:hover{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-cplan-date input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-family:inherit}
.pvx .prop-cplan-amt{flex-shrink:0;display:inline-flex;align-items:center;gap:1px;height:30px;padding:0 7px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;white-space:nowrap}
.pvx .prop-cplan-amt:focus-within{border-color:var(--dv-gold-text,#8A6A1F)}
.pvx .prop-cplan-amt-s{color:var(--dv-meta,#787D84);font-size:.74rem}
.pvx .prop-cplan-amtin{width:52px;border:none;outline:none;background:transparent;text-align:right;font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;font-family:inherit;padding:0}
.pvx .prop-cplan-amtin::-webkit-outer-spin-button,.pvx .prop-cplan-amtin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prop-cplan-sum{font-size:.74rem;font-weight:600;color:var(--dv-green,#2E7D5B);text-align:right}
.pvx .prop-cplan-sum.bad{color:var(--dv-red,#C4553D)}
.pvx .prop-minus{margin-right:2px}
.pvx .prop-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:13px}
.pvx .prop-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(16,20,24,.28);display:flex;align-items:center;gap:8px}
.pvx .prop-toast svg{color:var(--dv-green,#2E7D5B)}
@keyframes propToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.pvx .prop-toast{animation:propToastIn .22s ease}
.pvx .prop-dirty{width:8px;height:8px;border-radius:50%;background:var(--dv-gold,#C9A96E);display:inline-block}
.pvx .prop-margin{border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;background:var(--dv-paper,#F4F4F2);padding:11px 14px;display:flex;gap:22px;flex-wrap:wrap}
.pvx .prop-mcell{display:flex;flex-direction:column;gap:2px}
.pvx .prop-mcell .k{font-size:.62rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-mcell .v{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-mcell .v.bad{color:var(--dv-red,#C4553D)}
.pvx .prop-mcell .v.ok{color:var(--dv-green,#2E7D5B)}
.pvx .prop-empty{font-size:.82rem;color:var(--dv-meta,#787D84);font-weight:500;padding:6px 0}
/* Empty state — an intentional "build your proposal" start (progressive disclosure), not a blank builder. */
.pvx .prop-build{display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:26px 22px;border:1px dashed var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-paper,#F4F4F2)}
.pvx .prop-build-h{font-size:1.05rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.pvx .prop-build-sub{font-size:.84rem;color:var(--dv-meta,#787D84);margin-top:-7px}
.pvx .prop-build-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px}
.pvx .prop-build-opt{height:32px;border:none;background:none;color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;font-family:inherit;cursor:pointer;padding:0 4px}
.pvx .prop-build-opt:hover{color:var(--dv-ink,#101418)}
.pvx .prop-fp-btn.primary{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-fp-btn.primary:hover{filter:brightness(1.12);color:#fff;border-color:var(--dv-ink,#101418)}
/* "+ Add Service" dropdown (replaces the empty select box) */
.pvx .prop-svc-menu{width:220px}
.pvx .prop-svc-opt{display:flex;align-items:center;padding:7px 9px;border-radius:7px;font-size:.8rem;font-weight:500;color:var(--dv-ink,#101418);cursor:pointer;background:none;border:none;font-family:inherit;text-align:left;width:100%}
.pvx .prop-svc-opt:hover{background:var(--dv-paper,#F4F4F2)}
/* Quiet stand-in for the whole $0 pricing stack before there's anything to price */
.pvx .prop-price-hint{font-size:.82rem;color:var(--dv-meta,#787D84);font-weight:500;padding:12px 0;border-top:1px solid var(--dv-line,#E4E4DF);margin-top:10px}
/* PIN-preview chip beside the status — permission state, not proposal content */
.pvx .prop-preview-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:100px;background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84);font-size:.7rem;font-weight:600;white-space:nowrap}
/* Toast Undo (bulk sub-item update) */
.pvx .prop-toast-undo{background:none;border:none;color:var(--dv-gold,#C9A96E);font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;padding:0 2px;margin-left:4px;text-decoration:underline}
.pvx .prop-toast-undo:hover{color:#fff}
/* Smart bulk-update prompt — a compact popover anchored under the edited sub-item row */
.pvx .prop-bulk{position:absolute;top:calc(100% - 2px);right:0;z-index:40;width:290px;max-width:84vw;background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;box-shadow:0 14px 38px rgba(16,20,24,.16);padding:12px 13px;display:flex;flex-direction:column;gap:9px;text-align:left}
.pvx .prop-bulk-h{font-size:.84rem;font-weight:700;color:var(--dv-ink,#101418)}
.pvx .prop-bulk-sub{font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.45}
.pvx .prop-bulk-scope{display:flex;gap:6px}
.pvx .prop-bulk-sc{flex:1 1 0;min-width:0;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-meta,#787D84);font-size:.72rem;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;padding:0 6px}
.pvx .prop-bulk-sc.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-bulk-acts{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:1px}
.pvx .prop-bulk-keep{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;padding:4px 2px}
.pvx .prop-bulk-keep:hover{color:var(--dv-ink,#101418)}
.pvx .prop-bulk-all{height:32px;padding:0 14px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
.pvx .prop-bulk-all:hover{filter:brightness(1.12)}
@media(max-width:640px){
  /* On a phone the popover becomes a bottom sheet so it never clips off the edited row */
  .pvx .prop-bulk{position:fixed;left:12px;right:12px;bottom:12px;top:auto;width:auto;max-width:none;z-index:11050}
}
@media(max-width:640px){
  /* The "Sent · Sep 6 · 11:29 AM · La Vague" stamp is too long to share the action row on a phone — it
     was cramming into a narrow pill and stacking. Let the row wrap so the stamp takes its own line
     (one line at 360-430px; segments wrap whole at narrower); the icon buttons drop to a tidy row. */
  .pvx .prop-head-slim{flex-wrap:wrap;row-gap:10px}
  /* The deck toolbar is one centered toolset on mobile (Sent · Edit · views · share · download). */
  .pvx .prop-head-toolbar{justify-content:center;row-gap:8px}
  /* Sent shows as just "● Sent" here (the full date/sender stamp stays on desktop) — a compact
     outlined chip that sits inline, never a full-width line. */
  .pvx .prop-head-toolbar .prop-status.sent{flex:0 0 auto;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;height:30px;padding:0 11px}
  .pvx .prop-head-toolbar .prop-status.sent .prop-sent-seg{display:none}
  /* The dense multi-column pricing grid doesn't fit a phone — the fixed qty/price/cost/total
     columns eat the width and collapse the item NAME to nothing. On mobile, stack each line:
     an editable row gives the name its own full-width row, then a compact qty · price · total row
     underneath; but a camera/parent BLOCK row (no qty/price inputs, just a total) keeps its name,
     total and ✕ together on ONE tight line so the price never drops below the name. */
  .pvx .prop-item,.pvx .prop-item.nocost{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:8px 0}
  .pvx .prop-item>span:first-child{flex:1 1 100%;min-width:0}
  .pvx .prop-item>span:first-child input{width:100%}
  .pvx .prop-item .prop-name-ac{flex:1;min-width:0}
  .pvx .prop-item input.num{flex:0 0 60px;width:60px}
  .pvx .prop-item .prop-line-total{margin-left:auto;font-size:.84rem;white-space:nowrap}
  .pvx .prop-item .prop-item-x{flex:0 0 auto}
  /* Camera / block header rows: the name is the priority column (flex:1, basis 0 so it takes all the
     leftover width); the empty qty/price/cost placeholder spans are hidden so they don't waste flex
     gaps and squeeze the title into a word-by-word wrap. Price + ✕ stay inline on the right. */
  .pvx .prop-item.prop-parent>span:first-child{flex:1 1 0;min-width:0;flex-wrap:wrap;row-gap:2px}
  .pvx .prop-item.prop-parent>span:not(:first-child):empty{display:none}
  /* Parent name WRAPS (never truncates) — the price + ••• sit in their own flex cells so growing the
     name's height can't push them below. The description lives on its own row underneath. */
  .pvx .prop-item.prop-parent .prop-item-nametext{flex:1 1 auto;white-space:normal;overflow:visible;overflow-wrap:break-word;line-height:1.3;min-height:30px;height:auto}
  /* Name grows from a zero basis to fill the space LEFT OF the total (which stays a fixed, non-shrinking
     chip) — not margin-left:auto, which would steal the free space and crush the title. The name
     ellipsizes only if it still doesn't fit, so the price never wraps below it. */
  .pvx .prop-item.prop-parent .prop-line-total{margin-left:0;flex:0 0 auto}
  .pvx .prop-item.prop-parent .prop-im-wrap{flex:0 0 auto}
  .pvx .prop-cols{display:none}
  /* NVR / Displays lead row: keep the product title on one line ("8-Channel" doesn't break), the
     price + Edit stay right; the grouped children render below as .prop-sub2 rows. */
  .pvx .prop-sysline{flex-wrap:wrap;gap:4px 8px;padding:8px 0}
  /* Name takes the free space so the total + Edit sit together on the right (NOT margin-left:auto on
     the total, which would pin it to the edge and force Edit to wrap to its own line). */
  .pvx .prop-sysline-name{white-space:nowrap;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .pvx .prop-sysline-total{margin-left:0;flex-shrink:0}
  /* The scan-summary drops to its own indented line so it never crowds the title or price: ordered
     last, it wraps below the title+price row at full width (the others keep their natural order). */
  .pvx .prop-sysline-sum{order:9;flex:1 1 100%;white-space:normal;padding-left:40px}
  /* Title-first: trim the decorative slots so the name column wins the most width — compact number
     badge, tighter price padding, a slimmer drag handle and smaller gaps (no font shrink). */
  .pvx .prop-block-num{min-width:18px;margin-right:5px}
  .pvx .prop-item.prop-parent{gap:6px 6px}
  .pvx button.prop-price-toggle{padding-left:6px}
  .pvx .prop-block.has-drag{padding-left:15px}
  .pvx .prop-drag-handle{width:15px}
  /* NVR / lead row: keep name · total · ••• on ONE line — tighter gaps
     + a compact Edit button so the action never wraps to a standalone row. */
  .pvx .prop-sysline{gap:4px 6px}
  .pvx .prop-sysline .prop-mini{padding:0 10px;height:28px}
  /* Tighter service header + section rhythm on mobile */
  .pvx .prop-svc-head{padding:2px 0 8px}
  .pvx .prop-item.sub input.num{flex:0 0 56px;width:56px}
  /* Compact sub-item: indent stays readable as a child; rows ~44px (padding, not oversized chrome); the edit row wraps
     its controls tidily, amount + Done + Remove stay together on the right. The compact row's right inset matches the
     parent's ••• column so amounts line up with the price above. */
  .pvx .prop-sub2-wrap{margin-left:26px}
  .pvx .prop-lead .prop-sub2-wrap{margin-left:26px}/* align infra children to camera children on mobile too */
  .pvx .prop-sub2{gap:6px 8px}
  .pvx button.prop-sub2.compact,.pvx .prop-sub2.static{min-height:44px;padding-right:28px}
  .pvx .prop-sub2.editing .prop-name-ac{flex:1 1 100%}
  /* Inline edit: qty × price · amount · ✓ · remove fit ONE line at 360px (name keeps its own line above). */
  .pvx .prop-sub2.editing{gap:6px 4px}
  .pvx .prop-sub2-qty{width:40px!important}
  .pvx .prop-sub2-price{width:68px!important}
  .pvx .prop-sub2.editing .prop-sub2-amt{min-width:0;margin-left:auto}
  .pvx .prop-sub2-amt{min-width:56px}
  .pvx .prop-subadd{padding-left:26px}
  /* Description preview takes its own line under the title (never beside it, never forcing the title to wrap). */
  .pvx .prop-desc-row{flex:1 1 100%;min-width:0;padding-left:52px}
  /* Keep the ••• column's width on read-only rows (their action is absent) so prices still align with the children. */
  .pvx .prop-item.prop-parent>.prop-line-total+span:empty{display:block;flex:0 0 22px}
  .pvx .prop-sysline .prop-im-wrap,.pvx .prop-sysline .prop-im-sp{flex:0 0 22px;margin-left:0}
  /* Action footer: state on its own line, actions below (primary flexes to fill) so nothing overlaps at 360-430px. */
  .pvx .prop-dock-row{flex-direction:column;align-items:stretch;gap:8px;padding:10px}
  .pvx .prop-dock-sp{display:none}
  .pvx .prop-dock-acts{flex-wrap:wrap;justify-content:flex-end;width:100%;gap:6px}
  .pvx .prop-dock-sec{padding:0 11px}
  .pvx .prop-dock-cta{padding:0 13px;gap:6px;flex:1 1 120px}
  .pvx .prop-dock-row:has(.prop-dock-ask){flex-direction:row;align-items:center;flex-wrap:wrap}
  /* Frameless footer on a phone: metadata full-width, then one action row with Request Signature / Send
     Revision dominant (~65%) and Download quiet (~32%) — Download never competes with the primary. */
  .pvx .prop-foot-metarow{flex:1 1 100%}
  .pvx .prop-foot-acts{flex:1 1 100%;gap:8px}
  .pvx .prop-foot-acts .prop-dock-cta{flex:1 1 auto;padding:0 13px;gap:6px}   /* primary fills (~65-70%) */
  .pvx .prop-foot-acts .prop-foot-dlwrap{flex:0 0 auto}                        /* Download stays compact */
  .pvx .prop-foot-ask .prop-foot-acts{flex:0 0 auto}
  .pvx .prop-desc-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
  /* Plan columns: two across on a phone (auto-fit wraps the rest), never a horizontal scroll. */
  .pvx .prop-plan-cols{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px 16px}
  /* Reclaim horizontal room so the parent title fits: tighter card padding + block indent, and the
     inline +Description icon drops out of the title row (still available in the ••• menu). */
  .pvx .prop-body{padding-left:9px;padding-right:9px}
  .pvx .prop-block.has-drag{padding-left:13px}
  .pvx .prop-item.prop-parent .prop-desc-add2{display:none}
}
`;
