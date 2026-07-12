"use client";
import ProposalBuilder from "./proposal-builder";
import ProposalCustomerView from "./proposal-customer-view";
import ProposalWorkOrderView from "./proposal-workorder-view";

// Proposal stage entry point — routes by effective role and carries the shared styles.
// Staff (admin/manager/sales) get the builder; the technician gets the internal Work Order
// (tech prices only); customer (and staff previewing as customer) get the review surface.
// Data arrives server-sanitized per role from page.jsx (lib/proposal.js sanitizeProposal) —
// cost/margin never reach non-staff, and the customer price never reaches a tech.
export default function ProposalPanel({ accessId, view, cView, custView, proposal, customerName, customerAddress, customerPhone, customerEmail, onProposalChange, onAdvance, onStageSync, signerName, assignedTech }) {
  const staffBuilder = ["admin", "manager", "sales"].includes(cView);
  return (
    <div className="prop-wrap">
      <style>{PROP_CSS}</style>
      {staffBuilder ? (
        <ProposalBuilder accessId={accessId} role={cView} initial={proposal} onProposalChange={onProposalChange} />
      ) : cView === "tech" ? (
        <ProposalWorkOrderView accessId={accessId} proposal={proposal} preview={custView} customerName={customerName} customerAddress={customerAddress} onProposalChange={onProposalChange} signerName={signerName} assignedTech={assignedTech} />
      ) : (
        <ProposalCustomerView
          accessId={accessId} proposal={proposal} preview={custView} customerName={customerName}
          customerAddress={customerAddress} customerPhone={customerPhone} customerEmail={customerEmail}
          onAdvance={onAdvance} onStageSync={onStageSync}
        />
      )}
    </div>
  );
}

const PROP_CSS = `
.pvx .prop-wrap{display:flex;flex-direction:column;gap:14px;margin:18px 0}
.pvx .prop-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.pvx .prop-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pvx .prop-title{font-size:.92rem;font-weight:800;color:var(--ink)}
.pvx .prop-gear{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--muted);cursor:pointer}
.pvx .prop-gear:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .prop-fp{position:relative}
.pvx .prop-fp-btn{height:32px;border:1px solid var(--gold);border-radius:8px;background:var(--gold);color:#fff;font-size:.76rem;font-weight:700;font-family:inherit;padding:0 12px;outline:none;cursor:pointer}
.pvx .prop-fp-btn:hover{background:var(--gold-deep);border-color:var(--gold-deep)}
.pvx .prop-fp-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:60;width:260px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.18);padding:8px;display:flex;flex-direction:column;gap:2px}
.pvx .prop-fp-opt{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;font-size:.8rem;font-weight:600;color:var(--ink);cursor:pointer}
.pvx .prop-fp-opt:hover{background:var(--bg-soft)}
.pvx .prop-fp-opt input{flex-shrink:0}
.pvx .prop-fp-opt span:first-of-type{flex:1}
.pvx .prop-fp-count{font-size:.7rem;font-weight:700;color:var(--muted)}
.pvx .prop-fp-acts{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 2px;border-top:1px solid var(--line);margin-top:4px}
.pvx .prop-fp-all{background:none;border:none;color:var(--muted);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-fp-all:hover{color:var(--ink)}
.pvx .prop-fp-go{height:30px;padding:0 14px;border:none;border-radius:7px;background:var(--gold);color:#fff;font-size:.78rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .prop-fp-go:hover{background:var(--gold-deep)}
.pvx .prop-fp-go:disabled{opacity:.5;cursor:default}
.pvx .prop-block-num{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;margin-right:7px;border-radius:6px;background:var(--gold);color:#fff;font-size:.68rem;font-weight:800;flex-shrink:0}
.pvx .prop-cflag-wrap{display:inline-flex;align-items:center;gap:5px;margin-left:8px;flex-shrink:0}
.pvx .prop-cflag{padding:2px 9px;border-radius:100px;font-size:.64rem;font-weight:800;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.pvx .prop-cflag.remove{background:#8c2f2f;color:#fff}
.pvx .prop-cflag.change{background:var(--gold);color:#0B0F1A}
.pvx .prop-cflag-btn{border:1px solid var(--line);background:#fff;border-radius:6px;font-size:.6rem;font-weight:800;padding:2px 7px;cursor:pointer;font-family:inherit}
.pvx .prop-cflag-btn.done{color:var(--green,#1d7a3a);border-color:#bcd8c6}
.pvx .prop-cflag-btn.done:hover{background:#e6f0ea}
.pvx .prop-cflag-btn.discard{color:var(--muted)}
.pvx .prop-cflag-btn.discard:hover{color:var(--red);border-color:var(--red)}
.pvx .prop-status{font-size:.74rem;font-weight:700;padding:4px 11px;border-radius:100px}
.pvx .prop-status.draft{background:var(--bg-tint);color:var(--muted)}
.pvx .prop-status.sent{background:var(--green-soft);color:var(--green)}
.pvx .prop-status.changes{background:var(--amber-soft);color:var(--amber)}
.pvx .prop-status.accepted{background:var(--green-soft);color:var(--green)}
.pvx .prop-note-strip{background:var(--amber-soft);color:var(--amber);font-size:.78rem;font-weight:600;padding:9px 12px;border-radius:9px}
.pvx .prop-tabs{display:flex;gap:6px;flex-wrap:wrap}
.pvx .prop-tab{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border:1px solid var(--line);border-radius:9px;background:var(--bg-soft);color:var(--muted);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-tab.on{background:var(--gold);border-color:var(--gold);color:#fff}
.pvx .prop-tab-add{border-style:dashed;color:var(--gold-deep)}
.pvx .prop-svc{border:1px solid var(--line);border-radius:11px;overflow:hidden}
.pvx .prop-svc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:var(--bg-soft)}
.pvx .prop-svc-name{font-size:.78rem;font-weight:800;color:var(--ink);letter-spacing:.02em}
.pvx .prop-svc-sub{font-size:.74rem;font-weight:700;color:var(--muted)}
.pvx .prop-svc-count{font-size:.74rem;font-weight:700;color:var(--gold-deep)}
.pvx .prop-sysbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--line);background:var(--bg-tint)}
.pvx .prop-sys-field{display:flex;align-items:center;gap:7px;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.pvx .prop-sys-field select,.pvx .prop-sys-field input{height:30px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-size:.78rem;font-weight:700;padding:0 8px;font-family:inherit;outline:none}
.pvx .prop-sys-field input{width:58px;text-align:center}
.pvx .prop-sys-field select:focus,.pvx .prop-sys-field input:focus{border-color:var(--gold)}
.pvx .prop-sys-hint{font-size:.72rem;font-weight:700;color:var(--gold-deep)}
.pvx .prop-nvr-warn{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--line);background:var(--amber-soft)}
.pvx .prop-nvr-warn-msg{font-size:.78rem;font-weight:700;color:var(--amber)}
.pvx .prop-nvr-up{height:28px;padding:0 12px;border:none;border-radius:8px;background:var(--gold);color:#fff;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-up:hover{background:var(--gold-deep)}
.pvx .prop-nvr-cancel{height:28px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--muted);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-nvr-cancel:hover{border-color:var(--amber);color:var(--amber)}
.pvx .prop-sys-field input:disabled{opacity:.45}
.pvx .prop-slots{display:flex;gap:10px;flex-wrap:wrap}
.pvx .prop-slot{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.pvx .prop-slot-lbl{font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.pvx .prop-slot select{height:30px;border:1px solid var(--line);border-radius:7px;background:#fff;font-size:.76rem;font-weight:700;padding:0 8px;font-family:inherit;outline:none;color:var(--ink)}
.pvx .prop-slot select:focus{border-color:var(--gold)}
/* Bays beyond the selected NVR's capacity — visible but locked, not just hidden */
.pvx .prop-slot-locked{opacity:.45}
.pvx .prop-slot-locked select{background:var(--bg-soft);cursor:not-allowed}
.pvx .prop-slot-locked .prop-slot-lbl{color:var(--muted)}
.pvx .prop-slot-cost{font-size:.7rem;font-weight:800;color:var(--gold-deep)}
.pvx .prop-slot-price{width:100%;box-sizing:border-box;height:26px;border:1px solid var(--line);border-radius:6px;text-align:right;font-size:.74rem;font-weight:800;color:var(--gold-deep);font-family:inherit;outline:none;padding:0 6px;background:#fff}
.pvx .prop-slot-price:focus{border-color:var(--gold)}
.pvx .prop-slot-price:disabled{opacity:.6;border-color:transparent;background:transparent;padding-right:0}
.pvx .prop-slot-costin{width:100%;box-sizing:border-box;height:24px;border:1px solid var(--line);border-radius:6px;text-align:right;font-size:.68rem;font-weight:700;color:var(--muted);font-family:inherit;outline:none;padding:0 6px;background:var(--bg-soft)}
.pvx .prop-slot-costin:focus{border-color:var(--gold)}
.pvx .prop-svc-x{background:none;border:none;color:var(--muted);font-size:.85rem;cursor:pointer;padding:2px 6px}
.pvx .prop-svc-gear{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--muted);cursor:pointer;flex-shrink:0}
.pvx .prop-svc-gear:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .prop-svc-x:hover{color:var(--red)}
.pvx .prop-item{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;align-items:center;padding:7px 12px;border-top:1px solid var(--line)}
.pvx .prop-item.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-item input{height:30px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font-size:.8rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none;width:100%;box-sizing:border-box}
.pvx .prop-item input:focus{border-color:var(--gold)}
.pvx .prop-item input.num{text-align:right}
.pvx .prop-item input:not(.num){text-transform:capitalize}
/* Item-name field with catalog type-ahead */
.pvx .prop-name-ac{position:relative;flex:1;min-width:0}
.pvx .prop-name-ac input{width:100%}
.pvx .prop-name-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:70;background:#fff;border:1px solid var(--line);border-radius:9px;box-shadow:0 14px 40px rgba(0,0,0,.18);padding:4px;max-height:220px;overflow-y:auto}
.pvx .prop-name-opt{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;cursor:pointer;font-size:.78rem}
.pvx .prop-name-opt:hover{background:var(--bg-tint)}
.pvx .prop-name-opt.mine{background:var(--bg-soft)}
.pvx .prop-name-opt.mine:hover{background:var(--bg-tint)}
.pvx .prop-name-opt-name{flex:1;font-weight:700;color:var(--ink);text-transform:none}
.pvx .prop-name-opt-svc{font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.pvx .prop-name-opt-price{font-size:.76rem;font-weight:700;color:var(--gold-deep);flex-shrink:0}
/* No number-spinner arrows anywhere in the proposal — they look cramped in tight cells */
.pvx .prop-wrap input[type=number]::-webkit-outer-spin-button,
.pvx .prop-wrap input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.pvx .prop-wrap input[type=number]{-moz-appearance:textfield;appearance:textfield}
.pvx .prop-chev{background:none;border:none;padding:0 2px;color:var(--gold-deep);font-size:.72rem;cursor:pointer;flex-shrink:0;font-family:inherit}
.pvx .prop-chev:hover{color:var(--gold)}
/* Sub-item (expanded camera breakdown) rows: zebra + hover, like the blocks */
.pvx .prop-item.sub{background:var(--bg-soft);border-top:1px dashed var(--line);transition:background .12s}
.pvx .prop-item.sub.alt{background:#fff}
.pvx .prop-item.sub:hover,.pvx .prop-item.sub.alt:hover{background:var(--bg-tint)}
.pvx .prop-item.sub input{background:transparent;border-color:transparent;font-weight:500;color:var(--muted)}
.pvx .prop-item.sub input:focus{border-color:var(--gold);background:#fff}
.pvx .prop-item.sub .prop-line-total{color:var(--muted);font-weight:600}
.pvx .prop-block{border-left:3px solid transparent;transition:background .12s,border-color .12s;border-top:1px solid var(--line)}
.pvx .prop-block .prop-item{border-top:none}
.pvx .prop-block+.prop-block{border-top:1px solid var(--line)}
/* Zebra shading (parity class from the component) so adjacent rows/blocks read as distinct */
.pvx .prop-block.alt{background:var(--bg-soft)}
/* Camera group header: bolder name, prominent block total, no per-line price of its own */
.pvx .prop-item.prop-parent input{font-weight:800}
.pvx .prop-item.prop-parent .prop-line-total{font-weight:800;color:var(--ink)}
/* Hover + active-edit highlight so it's obvious which block/row you're working on */
.pvx .prop-block:hover{background:var(--bg-tint)}
.pvx .prop-block:focus-within{background:var(--accent-soft);border-left-color:var(--svc-color,var(--gold))}
/* Outdoor placement — red name text (an <input>'s value can't be partially colored, so the
   whole name goes red rather than just the "(O)" suffix) */
.pvx .prop-subadd{padding:4px 12px 8px 30px;background:var(--bg-soft)}
.pvx .prop-savestat{font-size:.74rem;font-weight:700;color:var(--green)}
.pvx .prop-savestat.saving{color:var(--muted)}
.pvx .prop-line-total{font-size:.78rem;font-weight:700;color:var(--ink);text-align:right}
.pvx .prop-item-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:.85rem;padding:0}
.pvx .prop-item-x:hover{color:var(--red)}
.pvx .prop-cols{display:grid;grid-template-columns:1fr 64px 92px 92px 96px 28px;gap:8px;padding:6px 12px 2px;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.pvx .prop-cols.nocost{grid-template-columns:1fr 64px 92px 96px 28px}
.pvx .prop-cols span.r{text-align:right}
.pvx .prop-addbar{display:flex;gap:8px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);flex-wrap:wrap}
.pvx .prop-addbar select{height:30px;border:1px solid var(--line);border-radius:7px;background:var(--bg-soft);color:var(--ink);font-size:.76rem;font-weight:600;padding:0 8px;font-family:inherit;outline:none;max-width:240px}
.pvx .prop-mini{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--ink);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.pvx .prop-mini:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .prop-mini.gold{background:var(--gold);border-color:var(--gold);color:#fff}
.pvx .prop-mini.gold:hover{background:var(--gold-deep)}
.pvx .prop-mini:disabled{opacity:.45;cursor:default}
.pvx .prop-svc-note{padding:8px 12px;border-top:1px solid var(--line);font-size:.74rem;color:var(--muted);white-space:pre-wrap}
.pvx .prop-totals{display:flex;flex-direction:column;gap:5px;margin-left:auto;min-width:250px}
.pvx .prop-trow{display:flex;justify-content:space-between;gap:18px;font-size:.8rem;color:var(--muted);font-weight:600}
.pvx .prop-trow b{color:var(--ink)}
.pvx .prop-trow.grand{font-size:.94rem;border-top:1px solid var(--line);padding-top:6px;margin-top:2px}
.pvx .prop-trow.grand b{color:var(--gold-deep)}
.pvx .prop-trow .tin{width:64px;height:26px;border:1px solid var(--line);border-radius:6px;text-align:right;padding:0 6px;font-size:.76rem;font-weight:700;font-family:inherit;outline:none;color:var(--ink)}
.pvx .prop-trow .tin:focus{border-color:var(--gold)}
.pvx .prop-tax-btn{height:26px;padding:0 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg-soft);color:var(--muted);font-size:.7rem;font-weight:800;cursor:pointer;font-family:inherit}
.pvx .prop-tax-btn:hover{border-color:var(--gold);color:var(--gold-deep)}
.pvx .prop-tax-btn.on{background:var(--gold);border-color:var(--gold);color:#fff}
.pvx .prop-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:13px}
.pvx .prop-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:11000;background:var(--ink);color:#fff;font-size:.82rem;font-weight:700;padding:11px 20px;border-radius:100px;box-shadow:0 12px 34px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px}
.pvx .prop-toast svg{color:var(--green,#3DD68C)}
@keyframes propToastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
.pvx .prop-toast{animation:propToastIn .22s ease}
.pvx .prop-dirty{width:8px;height:8px;border-radius:50%;background:var(--amber);display:inline-block}
.pvx .prop-margin{border:1px solid var(--line);border-radius:11px;background:var(--bg-soft);padding:11px 14px;display:flex;gap:22px;flex-wrap:wrap}
.pvx .prop-mcell{display:flex;flex-direction:column;gap:2px}
.pvx .prop-mcell .k{font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.pvx .prop-mcell .v{font-size:.9rem;font-weight:800;color:var(--ink)}
.pvx .prop-mcell .v.bad{color:var(--red)}
.pvx .prop-mcell .v.ok{color:var(--green)}
.pvx .prop-empty{font-size:.82rem;color:var(--muted);font-weight:600;padding:6px 0}
@media(max-width:640px){
  .pvx .prop-item,.pvx .prop-cols{grid-template-columns:1fr 52px 80px 80px}
  .pvx .prop-item .prop-line-total,.pvx .prop-cols .hcell-lt{display:none}
}
`;
