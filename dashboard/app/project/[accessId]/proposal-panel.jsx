"use client";
import ProposalBuilder from "./proposal-builder";
import ProposalCustomerView from "./proposal-customer-view";
import ProposalWorkOrderView from "./proposal-workorder-view";

// Proposal stage entry point — routes by effective role and carries the shared styles.
// Staff (admin/manager/sales) get the builder; the technician gets the internal Work Order
// (tech prices only); customer (and staff previewing as customer) get the review surface.
// Data arrives server-sanitized per role from page.jsx (lib/proposal.js sanitizeProposal) —
// cost/margin never reach non-staff, and the customer price never reaches a tech.
export default function ProposalPanel({ accessId, view, cView, custView, proposal, customerName, customerAddress, customerPhone, customerEmail, onProposalChange, onAdvance, onStageSync, signerName, assignedTech, viewCount = 0, onShowViews, embedded = false }) {
  const staffBuilder = ["admin", "manager", "sales"].includes(cView);
  return (
    <div className="prop-wrap">
      <style>{PROP_CSS}</style>
      {staffBuilder ? (
        <ProposalBuilder accessId={accessId} role={cView} initial={proposal} onProposalChange={onProposalChange} viewCount={viewCount} onShowViews={onShowViews} embedded={embedded} />
      ) : cView === "tech" ? (
        <ProposalWorkOrderView accessId={accessId} proposal={proposal} preview={custView} customerName={customerName} customerAddress={customerAddress} onProposalChange={onProposalChange} signerName={signerName} assignedTech={assignedTech} canVoid={["admin", "manager"].includes(view)} />
      ) : (
        <ProposalCustomerView
          accessId={accessId} proposal={proposal} preview={custView} customerName={customerName}
          customerAddress={customerAddress} customerPhone={customerPhone} customerEmail={customerEmail}
          onAdvance={onAdvance} onStageSync={onStageSync} canVoid={["admin", "manager"].includes(view)}
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
.pvx .prop-head-slim{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-head{display:flex;align-items:center;gap:10px}
.pvx .prop-title{font-family:inherit;font-size:.97rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.pvx .prop-gear{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);cursor:pointer}
.pvx .prop-eye{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-paper,#F4F4F2);color:var(--dv-meta,#787D84);cursor:pointer;font-family:inherit}
.pvx .prop-eye:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-eye-n{font-size:.78rem;font-weight:800;color:var(--dv-ink,#101418)}
.pvx .prop-gear:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-fp{position:relative}
.pvx .prop-fp-btn{height:32px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:600;font-family:inherit;padding:0 12px;outline:none;cursor:pointer}
.pvx .prop-fp-btn:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
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
.pvx .prop-cflag-wrap{display:inline-flex;align-items:center;gap:5px;margin-left:8px;flex-shrink:0}
.pvx .prop-cflag{padding:2px 9px;border-radius:100px;font-size:.64rem;font-weight:600;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pvx .prop-cflag.remove{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.pvx .prop-cflag.change{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-cflag-btn{border:1px solid var(--dv-line,#E4E4DF);background:#fff;border-radius:6px;font-size:.6rem;font-weight:600;padding:2px 7px;cursor:pointer;font-family:inherit}
.pvx .prop-cflag-btn.done{color:var(--dv-green,#2E7D5B);border-color:#cfe6d8}
.pvx .prop-cflag-btn.done:hover{background:#e9f3ed}
.pvx .prop-cflag-btn.discard{color:var(--dv-meta,#787D84)}
.pvx .prop-cflag-btn.discard:hover{color:var(--dv-red,#C4553D);border-color:var(--dv-red,#C4553D)}
.pvx .prop-status{font-size:.74rem;font-weight:600;padding:4px 11px;border-radius:100px}
.pvx .prop-status.draft{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.pvx .prop-status.sent{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.pvx .prop-status.changes{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-status.accepted{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.pvx .prop-note-strip{background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);color:var(--dv-ink-soft,#3A4048);font-size:.78rem;font-weight:500;padding:9px 12px;border-radius:9px}
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
.pvx .prop-svc{border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;overflow:hidden}
.pvx .prop-svc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:var(--dv-paper,#F4F4F2)}
.pvx .prop-svc-name{font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:.02em}
.pvx .prop-svc-sub{font-size:.74rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pvx .prop-svc-count{font-size:.74rem;font-weight:600;color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-sysbar{display:flex;flex-direction:column;align-items:stretch;gap:14px;padding:9px 12px;border-top:1px solid var(--dv-line,#E4E4DF);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-sysrow{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
.pvx .prop-sysrow + .prop-sysrow{padding-top:12px;border-top:1px solid var(--dv-line-soft,#EDEDE9)}
.pvx .prop-sys-field{display:flex;align-items:center;gap:7px;font-size:.68rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-sys-field select,.pvx .prop-sys-field input{height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.78rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none}
.pvx .prop-sys-field input{width:58px;text-align:center}
.pvx .prop-sys-field select:focus,.pvx .prop-sys-field input:focus{border-color:var(--dv-gold,#C9A96E)}
.pvx .prop-sys-hint{font-size:.72rem;font-weight:600;color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-nvr-warn{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--dv-line,#E4E4DF);background:var(--dv-paper,#F4F4F2)}
.pvx .prop-nvr-warn-msg{font-size:.78rem;font-weight:600;color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-nvr-up{height:28px;padding:0 12px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-up:hover{filter:brightness(1.12)}
.pvx .prop-nvr-cancel{height:28px;padding:0 10px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-meta,#787D84);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-cancel:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-sys-field input:disabled{opacity:.45}
.pvx .prop-slots{display:flex;gap:10px;flex-wrap:wrap}
.pvx .prop-slot{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.pvx .prop-slot-lbl{font-size:.6rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-slot select{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;font-size:.76rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none;color:var(--dv-ink,#101418)}
.pvx .prop-slot select:focus{border-color:var(--dv-gold,#C9A96E)}
.pvx .prop-slot-name{width:100%;box-sizing:border-box;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;font-size:.76rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;color:var(--dv-ink,#101418);background:#fff}
.pvx .prop-slot-name:focus{border-color:var(--dv-gold,#C9A96E)}
/* Bays beyond the selected NVR's capacity — visible but locked, not just hidden */
.pvx .prop-slot-locked{opacity:.45}
.pvx .prop-slot-locked select{background:var(--dv-paper,#F4F4F2);cursor:not-allowed}
.pvx .prop-slot-locked .prop-slot-lbl{color:var(--dv-meta,#787D84)}
.pvx .prop-slot-cost{font-size:.7rem;font-weight:600;color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-slot-price{width:100%;box-sizing:border-box;height:26px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;text-align:right;font-size:.74rem;font-weight:600;color:var(--dv-gold-deep,#A8842F);font-family:inherit;outline:none;padding:0 6px;background:#fff}
.pvx .prop-slot-price:focus{border-color:var(--dv-gold,#C9A96E)}
.pvx .prop-slot-price:disabled{opacity:.6;border-color:transparent;background:transparent;padding-right:0}
.pvx .prop-slot-costin{width:100%;box-sizing:border-box;height:24px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;text-align:right;font-size:.68rem;font-weight:500;color:var(--dv-meta,#787D84);font-family:inherit;outline:none;padding:0 6px;background:var(--dv-paper,#F4F4F2)}
.pvx .prop-slot-costin:focus{border-color:var(--dv-gold,#C9A96E)}
.pvx .prop-svc-x{background:none;border:none;color:var(--dv-meta,#787D84);font-size:.85rem;cursor:pointer;padding:2px 6px}
.pvx .prop-svc-gear{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;background:#fff;color:var(--dv-meta,#787D84);cursor:pointer;flex-shrink:0}
.pvx .prop-svc-gear:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-svc-x:hover{color:var(--dv-red,#C4553D)}
.pvx .prop-item{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;align-items:center;padding:7px 12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-item.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-item input{height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-ink,#101418);font-size:.8rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}
.pvx .prop-item input:focus{border-color:var(--dv-gold,#C9A96E)}
.pvx .prop-item input.num{text-align:right}
.pvx .prop-item input:not(.num){text-transform:capitalize}
.pvx .prop-item-nametext{flex:1;min-width:0;height:30px;display:flex;align-items:center;font-size:.8rem;font-weight:500;color:var(--dv-ink,#101418);text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;padding:0 8px;border:1px solid transparent;border-radius:7px}
.pvx .prop-item-nametext:hover{background:var(--dv-paper,#F4F4F2)}
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
.pvx .prop-name-opt-price{font-size:.76rem;font-weight:600;color:var(--dv-gold-deep,#A8842F);flex-shrink:0}
/* No number-spinner arrows anywhere in the proposal — they look cramped in tight cells */
.pvx .prop-wrap input[type=number]::-webkit-outer-spin-button,
.pvx .prop-wrap input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prop-wrap input[type=number]{-moz-appearance:textfield;appearance:textfield}
.pvx .prop-chev{background:none;border:none;padding:0 2px;color:var(--dv-gold-deep,#A8842F);font-size:.72rem;cursor:pointer;flex-shrink:0;font-family:inherit}
.pvx .prop-chev:hover{color:var(--dv-gold,#C9A96E)}
/* Sub-item (expanded camera breakdown) rows: zebra + hover, like the blocks */
.pvx .prop-item.sub{background:var(--dv-paper,#F4F4F2);border-top:1px solid var(--dv-line-soft,#EDEDE9);transition:background .12s}
.pvx .prop-item.sub.alt{background:var(--dv-raise,#FBFBFA)}
.pvx .prop-item.sub:hover,.pvx .prop-item.sub.alt:hover{background:var(--dv-line-soft,#EDEDE9)}
.pvx .prop-item.sub input{background:transparent;border-color:transparent;font-weight:500;color:var(--dv-meta,#787D84)}
.pvx .prop-item.sub input:focus{border-color:var(--dv-gold,#C9A96E);background:#fff}
.pvx .prop-item.sub .prop-line-total{color:var(--dv-meta,#787D84);font-weight:500}
.pvx .prop-block{border-left:3px solid transparent;transition:background .12s,border-color .12s;border-top:1px solid var(--dv-line,#E4E4DF);position:relative}
/* Drag-to-reorder line items */
.pvx .prop-block.has-drag{padding-left:17px}
.pvx .prop-drag-handle{position:absolute;left:0;top:0;bottom:0;width:17px;display:flex;align-items:center;justify-content:center;color:var(--dv-meta,#787D84);opacity:.35;cursor:grab}
.pvx .prop-drag-handle:active{cursor:grabbing}
.pvx .prop-block:hover .prop-drag-handle{opacity:.7}
.pvx .prop-block.prop-dragging{opacity:.45}
.pvx .prop-block.prop-dragover{border-top:2px solid var(--dv-gold,#C9A96E);background:var(--dv-line-soft,#EDEDE9)}
/* Recording-system "Done" button + collapsed NVR/Displays summary lines */
.pvx .prop-slot-x{margin-left:6px;border:none;background:transparent;color:var(--dv-red,#C4553D);font-size:.68rem;cursor:pointer;padding:0;opacity:.65}
.pvx .prop-slot-x:hover{opacity:1}
.pvx .prop-add-slot{align-self:flex-end;height:32px;padding:0 12px;border:1px dashed var(--dv-line,#E4E4DF);border-radius:8px;background:transparent;color:var(--dv-meta,#787D84);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:1px}
.pvx .prop-add-slot:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-camask{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-gold,#C9A96E);border-radius:9px;padding:4px 8px 4px 12px}
.pvx .prop-camask input{width:56px;height:28px;border:1px solid var(--dv-line,#E4E4DF);border-radius:6px;padding:0 8px;font-size:.82rem;font-family:inherit;text-align:center}
.pvx .prop-camask-go{height:28px;padding:0 12px;border:none;border-radius:6px;background:var(--dv-ink,#101418);color:#fff;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-camask-x{height:28px;padding:0 8px;border:none;background:transparent;color:var(--dv-meta,#787D84);font-size:.74rem;cursor:pointer;font-family:inherit}
.pvx .prop-sys-done{align-self:center;height:30px;padding:0 16px;border:none;border-radius:8px;background:var(--dv-ink,#101418);color:#fff;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-sys-done:hover{filter:brightness(1.12)}
.pvx .prop-sysline{display:flex;align-items:center;gap:10px;padding:11px 12px}
.pvx .prop-sysline-name{font-size:.86rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-sysline-sub{font-size:.74rem;font-weight:500;color:var(--dv-meta,#787D84)}
.pvx .prop-sysline-total{margin-left:auto;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-sysline-edit{flex-shrink:0}
.pvx .prop-block .prop-item{border-top:none}
.pvx .prop-block+.prop-block{border-top:1px solid var(--dv-line,#E4E4DF)}
/* Zebra shading (parity class from the component) so adjacent rows/blocks read as distinct */
.pvx .prop-block.alt{background:var(--dv-paper,#F4F4F2)}
/* Waived block: comped off the invoice — a green "Waived" banner on the left, and the
   original price struck through on the right so you can still see the amount waived. */
.pvx .prop-block.prop-waived{border-left-color:var(--dv-green,#2E7D5B)}
.pvx .prop-waived-banner{font-size:.64rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#fff;background:var(--dv-green,#2E7D5B);border-radius:100px;padding:2px 9px;white-space:nowrap}
.pvx .prop-waived-strike{color:var(--dv-red,#C4553D);text-decoration:line-through;text-decoration-color:var(--dv-red,#C4553D)}
/* Camera group header: bolder name, prominent block total, no per-line price of its own */
.pvx .prop-item.prop-parent input{font-weight:600}
.pvx .prop-item.prop-parent .prop-line-total{font-weight:600;color:var(--dv-ink,#101418)}
/* Hover + active-edit highlight so it's obvious which block/row you're working on */
.pvx .prop-block:hover{background:var(--dv-paper,#F4F4F2)}
.pvx .prop-block:focus-within{background:var(--dv-line-soft,#EDEDE9);border-left-color:var(--dv-gold,#C9A96E)}
/* Outdoor placement — red name text (an <input>'s value can't be partially colored, so the
   whole name goes red rather than just the "(O)" suffix) */
.pvx .prop-subadd{padding:4px 12px 8px 30px;background:var(--dv-paper,#F4F4F2)}
.pvx .prop-savestat{font-size:.74rem;font-weight:600;color:var(--dv-green,#2E7D5B)}
.pvx .prop-savestat.saving{color:var(--dv-meta,#787D84)}
.pvx .prop-line-total{font-size:.78rem;font-weight:600;color:var(--dv-ink,#101418);text-align:right}
.pvx .prop-item-x{background:none;border:none;color:var(--dv-meta,#787D84);cursor:pointer;font-size:.85rem;padding:0}
.pvx .prop-item-x:hover{color:var(--dv-red,#C4553D)}
.pvx .prop-cols{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;padding:6px 12px 2px;font-size:.62rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-cols.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-cols span.r{text-align:right}
.pvx .prop-addbar{display:flex;flex-direction:column;gap:9px;align-items:stretch;padding:9px 12px;border-top:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-preset-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.pvx .prop-addrow-basic{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pvx .prop-preset-chip{display:inline-flex;align-items:center;height:30px;padding:0 13px;border:none;border-radius:999px;background:var(--dv-ink,#101418);color:#fff;font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-preset-chip:hover{filter:brightness(1.12)}
.pvx .prop-preset-edit{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:999px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-preset-edit:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-addbar select{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:500;padding:0 8px;font-family:inherit;outline:none;max-width:240px}
.pvx .prop-mini{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-mini:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-mini.gold{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-mini.gold:hover{filter:brightness(1.12)}
.pvx .prop-mini:disabled{opacity:.45;cursor:default}
.pvx .prop-svc-note{padding:8px 12px;border-top:1px solid var(--dv-line,#E4E4DF);font-size:.74rem;color:var(--dv-meta,#787D84);white-space:pre-wrap}
.pvx .prop-waiver{width:100%;margin-top:14px;border:1px solid var(--dv-line,#E4E4DF);border-radius:11px;background:var(--dv-paper,#F4F4F2);overflow:hidden}
.pvx .prop-waiver-head{width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;background:none;border:none;cursor:pointer;font-family:inherit;font-size:.82rem;font-weight:600;color:var(--dv-ink,#101418)}
.pvx .prop-waiver-head .prop-chev{color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-waiver-count{margin-left:auto;font-size:.72rem;font-weight:600;color:var(--dv-gold-deep,#A8842F);background:var(--dv-line-soft,#EDEDE9);border:1px solid var(--dv-line,#E4E4DF);border-radius:100px;padding:2px 9px}
.pvx .prop-waiver-body{border-top:1px solid var(--dv-line,#E4E4DF);padding:10px 14px;display:flex;flex-direction:column;gap:3px}
.pvx .prop-waiver-bulk{display:flex;gap:8px;margin-bottom:6px}
.pvx .prop-waiver-bulk button{height:26px;padding:0 11px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-meta,#787D84);font-size:.7rem;font-weight:600;cursor:pointer;font-family:inherit}
.pvx .prop-waiver-bulk button:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-waiver-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:.82rem}
.pvx .prop-waiver-row:hover{background:var(--dv-line-soft,#EDEDE9)}
.pvx .prop-waiver-row.on .prop-waiver-name{text-decoration:line-through;color:var(--dv-meta,#787D84)}
.pvx .prop-waiver-row input{width:16px;height:16px;accent-color:var(--dv-gold-deep,#A8842F);cursor:pointer}
.pvx .prop-waiver-name{flex:1;min-width:0;font-weight:600;color:var(--dv-ink,#101418);display:flex;align-items:baseline;gap:8px}
.pvx .prop-waiver-svc{font-size:.68rem;font-weight:600;color:var(--dv-meta,#787D84);text-transform:uppercase;letter-spacing:.03em}
.pvx .prop-waiver-amt{font-weight:600;white-space:nowrap;color:var(--dv-ink,#101418)}
.pvx .prop-waiver-row.on .prop-waiver-amt{color:var(--dv-gold-deep,#A8842F);text-decoration:none}
.pvx .prop-totals{display:flex;flex-direction:column;gap:9px;width:100%;margin-top:16px;border-top:1px solid var(--dv-line,#E4E4DF);padding-top:16px}
.pvx .prop-trow{display:flex;justify-content:space-between;align-items:center;gap:18px;font-size:.82rem;color:var(--dv-meta,#787D84);font-weight:500;min-height:28px}
.pvx .prop-trow b{color:var(--dv-ink,#101418)}
.pvx .prop-adj{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pvx .prop-minus{color:var(--dv-green,#2E7D5B);white-space:nowrap}
.pvx .prop-total-big{display:flex;justify-content:space-between;align-items:baseline;gap:18px;margin:6px 0;padding:14px 16px;border-radius:12px;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF)}
.pvx .prop-total-big span{font-size:.9rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.pvx .prop-total-big b{font-size:1.7rem;font-weight:600;color:var(--dv-gold-deep,#A8842F);letter-spacing:-.01em}
.pvx .prop-plan-terms{font-size:.76rem;color:var(--dv-meta,#787D84);line-height:1.4;background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:8px 12px;margin:-2px 0 2px}
/* Uniform preset buttons + input across Discount / PCP / Tax / Payment-plan rows.
   Same height, same min-width, centered — inputs flush right so every row lines up. */
.pvx .prop-adj{gap:7px}
.pvx .prop-tax-btn,.pvx .prop-plan-btn{height:30px;min-width:54px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-meta,#787D84);font-size:.73rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.pvx .prop-tax-btn:hover,.pvx .prop-plan-btn:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.pvx .prop-tax-btn.on,.pvx .prop-plan-btn.on{background:var(--dv-ink,#101418);border-color:var(--dv-ink,#101418);color:#fff}
.pvx .prop-trow .tin{width:72px;height:30px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;text-align:right;padding:0 8px;font-size:.76rem;font-weight:600;font-family:inherit;outline:none;color:var(--dv-ink,#101418);background:#fff}
.pvx .prop-trow .tin:focus{border-color:var(--dv-gold,#C9A96E)}
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
@media(max-width:640px){
  /* The dense multi-column pricing grid doesn't fit a phone — the fixed qty/price/cost/total
     columns eat the width and collapse the item NAME to nothing. On mobile, stack each line:
     the name gets its own full-width row, then a compact qty · price · total row underneath. */
  .pvx .prop-item,.pvx .prop-item.nocost{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
  .pvx .prop-item>span:first-child{flex:1 1 100%;min-width:0}
  .pvx .prop-item>span:first-child input{width:100%}
  .pvx .prop-item .prop-name-ac{flex:1;min-width:0}
  .pvx .prop-item input.num{flex:0 0 60px;width:60px}
  .pvx .prop-item .prop-line-total{margin-left:auto;font-size:.82rem}
  .pvx .prop-item .prop-item-x{flex:0 0 auto}
  .pvx .prop-cols{display:none}
}
`;
