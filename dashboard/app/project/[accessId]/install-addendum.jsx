"use client";
import { useState, useEffect, useRef } from "react";
import { titleCase } from "../../../lib/proposal";
import { getToolDataAction, saveToolDataAction } from "./proposal-actions";
import ProposalSignModal from "./proposal-sign-modal";

// On-site addendum builder. Things change on the job (customer wants 3 more cameras) — the office
// builds an addendum right on the install page: extra line items with a customer price (and tech
// payout, internal). It's a separate change order the customer approves & signs; it never touches
// the originally-signed proposal. Stored in the "addendum" tool record.
const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPES = [["camera", "Camera"], ["pos", "POS / Network"], ["nvr", "NVR / Recorder"], ["equip", "Equipment / Other"]];
let _aid = 0;
const newId = () => `a${Date.now().toString(36)}${_aid++}`;
const blankItem = () => ({ id: newId(), name: "", type: "camera", qty: 1, price: "", techPay: "" });

const fmtStamp = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

export default function InstallAddendum({ accessId, role, readOnly, customerName, onCount }) {
  const isCustomer = role === "customer";
  const isTech = role === "tech";
  const canBuild = !readOnly && ["admin", "manager", "sales"].includes(role);
  const canVoid = !readOnly && ["admin", "manager"].includes(role); // admin/manager can void an addendum
  const showRetail = !isTech;   // tech never sees the customer (retail) price — only their payout
  const showPayout = !isCustomer; // office + tech see the tech payout; the customer never does

  const [addendums, setAddendums] = useState([]);
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState({ title: "", items: [blankItem()], discount: "" });
  const [signId, setSignId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { id, action: 'delete'|'void' }
  const first = useRef(true);

  useEffect(() => {
    let live = true;
    getToolDataAction(accessId, "addendum").then((r) => {
      if (!live || !r?.ok || !r.saved?.data) return;
      try { setAddendums(JSON.parse(r.saved.data).addendums || []); } catch { /* bad blob */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [accessId]);

  // Report how many add-ons exist so the caller can hide the whole step until one is submitted.
  useEffect(() => { onCount?.(addendums.length); }, [addendums.length, onCount]);

  async function persist(next) {
    setAddendums(next);
    setBusy(true);
    await saveToolDataAction(accessId, "addendum", JSON.stringify({ addendums: next }));
    setBusy(false);
  }

  const itemsSum = (a) => (a.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
  const custTotal = (a) => Math.max(0, itemsSum(a) - (+a.discount || 0)); // customer price, less any discount
  const techTotal = (a) => (a.items || []).reduce((s, it) => s + (+it.qty || 0) * (+it.techPay || 0), 0);
  const approvedTotal = addendums.filter((a) => a.status === "approved").reduce((s, a) => s + custTotal(a), 0);

  // ---- Builder (office) ----
  const dItem = (i, patch) => setDraft((d) => ({ ...d, items: d.items.map((it, x) => (x === i ? { ...it, ...patch } : it)) }));
  const addRow = () => setDraft((d) => ({ ...d, items: [...d.items, blankItem()] }));
  const delRow = (i) => setDraft((d) => ({ ...d, items: d.items.filter((_, x) => x !== i) }));
  const validItems = () => draft.items.filter((it) => it.name.trim() && +it.price >= 0);
  function createAddendum() {
    const items = validItems().map((it) => ({ id: it.id, name: it.name.trim(), type: it.type, qty: +it.qty || 1, price: +it.price || 0, techPay: +it.techPay || 0 }));
    if (!items.length) return;
    const rec = { id: newId(), title: draft.title.trim() || "Job-site add-on", items, discount: +draft.discount || 0, at: new Date().toISOString(), status: "pending" };
    persist([...addendums, rec]);
    setDraft({ title: "", items: [blankItem()], discount: "" }); setBuilding(false);
  }
  const removeAddendum = (id) => persist(addendums.filter((a) => a.id !== id));
  // Void an addendum (any status) — it stays on record with the date, but drops out of billing and
  // the install checklist (getApprovedAddons only counts status "approved").
  const voidAddendum = (id) => persist(addendums.map((a) => (a.id === id ? { ...a, status: "voided", voidedAt: new Date().toISOString() } : a)));
  // Un-void: a voided addendum returns to pending (if never signed) or approved (if it had been signed).
  const unvoidAddendum = (id) => persist(addendums.map((a) => (a.id === id ? { ...a, status: a.signedName ? "approved" : "pending", voidedAt: undefined } : a)));

  // ---- Approval (customer) ----
  function approve(sign) {
    persist(addendums.map((a) => (a.id === signId ? { ...a, status: "approved", signedName: sign.name, signedAt: new Date().toISOString(), signatureData: sign.data } : a)));
    setSignId(null);
  }

  const pending = addendums.filter((a) => a.status === "pending");
  if (!canBuild && addendums.length === 0) return null; // customer/tech see nothing until one exists

  return (
    <div className="adn-root">
      <style>{ADN_CSS}</style>
      <div className="adn-head">
        <div><span className="adn-title">Job-Site Add-ons</span><span className="adn-sub">Last-minute changes — a signed addendum, separate from the original proposal</span></div>
        {approvedTotal > 0 && <span className="adn-total-badge">Approved add-ons {money(approvedTotal)}</span>}
      </div>

      {addendums.map((a) => {
        const ct = custTotal(a), tt = techTotal(a);
        return (
          <div key={a.id} className={`adn-card ${a.status}`}>
            <div className="adn-card-hd">
              <span className="adn-card-title">{a.title}</span>
              <span className={`adn-badge ${a.status}`}>{a.status === "approved" ? "✓ Approved" : a.status === "declined" ? "Declined" : a.status === "voided" ? "Voided" : "Pending approval"}</span>
            </div>
            <div className="adn-items">
              {(a.items || []).map((it) => (
                <div key={it.id} className="adn-item">
                  <span className="adn-item-name">{titleCase(it.name)}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                  <span className="adn-item-price">
                    {/* Tech never sees the customer/retail price — only what they'd be paid. */}
                    {showRetail && money((+it.qty || 0) * (+it.price || 0))}
                    {showPayout && it.techPay > 0 && <span className="adn-item-tech">{showRetail ? " · " : ""}{isTech ? "" : "tech "}{money((+it.qty || 0) * (+it.techPay || 0))}{isTech ? " payout" : ""}</span>}
                  </span>
                </div>
              ))}
            </div>
            {showRetail && +a.discount > 0 && (
              <div className="adn-disc-row"><span>Discount</span><b>− {money(+a.discount)}</b></div>
            )}
            <div className="adn-card-ft">
              <span className="adn-ct">
                {isTech
                  ? <>Your payout <b>{money(tt)}</b></>
                  : <>Add-on total <b>{money(ct)}</b>{showPayout && tt > 0 && <span className="adn-tt"> · tech payout {money(tt)}</span>}</>}
              </span>
              {a.status === "approved" && (
                <span className="adn-sign">
                  {a.signatureData && <img src={a.signatureData} alt="signature" />}
                  <em>Signed by {a.signedName}{a.signedAt ? ` · ${fmtStamp(a.signedAt)}` : ""}</em>
                </span>
              )}
              {a.status === "voided" && <span className="adn-void-note">Voided{a.voidedAt ? ` · ${fmtStamp(a.voidedAt)}` : ""}</span>}
              {a.status === "voided" && canVoid && confirm?.id !== a.id && (
                <button type="button" className="adn-unvoid" disabled={busy} onClick={() => unvoidAddendum(a.id)}>Restore</button>
              )}
              {/* Once voided, admin/manager can permanently delete it (it's off billing already). */}
              {a.status === "voided" && canVoid && confirm?.id !== a.id && (
                <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "delete" })}>Delete</button>
              )}
              {a.status === "pending" && isCustomer && (
                <button type="button" className="adn-approve" disabled={readOnly} title={readOnly ? "The customer signs here" : undefined}
                        onClick={() => !readOnly && setSignId(a.id)}>
                  {readOnly ? "Customer signs here" : "Approve & Sign"}
                </button>
              )}
              {confirm && confirm.id === a.id ? (
                <span className="adn-confirm">
                  {confirm.action === "delete" ? "Delete this add-on?" : "Void this add-on?"}
                  <button type="button" className="adn-c-yes" disabled={busy}
                          onClick={() => { (confirm.action === "delete" ? removeAddendum : voidAddendum)(a.id); setConfirm(null); }}>
                    {confirm.action === "delete" ? "Delete" : "Void"}
                  </button>
                  <button type="button" className="adn-c-no" onClick={() => setConfirm(null)}>Keep</button>
                </span>
              ) : (
                <>
                  {a.status === "pending" && canBuild && (
                    <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "delete" })}>Delete</button>
                  )}
                  {(a.status === "approved" || a.status === "pending") && canVoid && (
                    <button type="button" className="adn-del" disabled={busy} onClick={() => setConfirm({ id: a.id, action: "void" })}>Void</button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {canBuild && (building ? (
        <div className="adn-builder">
          <input className="adn-b-title" placeholder="Addendum title (e.g. Added 3 back-lot cameras)" value={draft.title} autoFocus onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <div className="adn-b-items">
            {draft.items.map((it, i) => (
              <div key={it.id} className="adn-b-row">
                <input className="adn-b-name" placeholder="Item (e.g. Dome Camera)" value={it.name} onChange={(e) => dItem(i, { name: e.target.value })} />
                <select className="adn-b-type" value={it.type} onChange={(e) => dItem(i, { type: e.target.value })}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input className="adn-b-qty" type="number" min="1" step="1" title="Qty" value={it.qty} onChange={(e) => dItem(i, { qty: e.target.value })} />
                <span className="adn-b-money">$<input type="number" min="0" step="1" placeholder="Customer" title="Customer price (each)" value={it.price} onChange={(e) => dItem(i, { price: e.target.value })} /></span>
                <span className="adn-b-money tech">$<input type="number" min="0" step="1" placeholder="Tech" title="Tech payout (each)" value={it.techPay} onChange={(e) => dItem(i, { techPay: e.target.value })} /></span>
                {draft.items.length > 1 && <button type="button" className="adn-b-x" onClick={() => delRow(i)}>✕</button>}
              </div>
            ))}
          </div>
          <div className="adn-b-act">
            <button type="button" className="adn-b-additem" onClick={addRow}>+ Item</button>
            <label className="adn-b-disc">Discount $<input type="number" min="0" step="1" placeholder="0" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} /></label>
            <span className="adn-b-total">Total {money(Math.max(0, validItems().reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) - (+draft.discount || 0)))}</span>
            <button type="button" className="adn-b-create" disabled={busy || !validItems().length} onClick={createAddendum}>Create addendum</button>
            <button type="button" className="adn-b-cancel" onClick={() => { setBuilding(false); setDraft({ title: "", items: [blankItem()], discount: "" }); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="adn-newbtn" onClick={() => setBuilding(true)}>+ New addendum</button>
      ))}

      {isCustomer && pending.length > 0 && (
        <div className="adn-cust-note">A change was added to your job — review and sign the add-on above to approve the extra work &amp; charges.</div>
      )}

      <ProposalSignModal
        open={!!signId}
        heading="Approve Add-on"
        subheading={signId ? addendums.find((a) => a.id === signId)?.title : ""}
        defaultName={customerName || ""}
        agreeText="I approve this job-site add-on and authorize the additional work and charges shown above."
        accent="var(--green)"
        onConfirm={approve}
        onCancel={() => setSignId(null)}
      />
    </div>
  );
}

const ADN_CSS = `
.adn-root{background:#fff;border:1px solid var(--line-warm);border-top:4px solid var(--gold);border-radius:14px;padding:16px;margin:16px 0 0;
  font-family:var(--font);box-shadow:0 10px 30px rgba(11,15,26,.06)}
.adn-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.adn-title{display:block;font-size:1rem;font-weight:800;color:var(--ink)}
.adn-sub{font-size:.78rem;color:var(--muted)}
.adn-total-badge{background:#f2f9f4;border:1px solid #bfe0c9;color:var(--green);font-weight:800;font-size:.78rem;border-radius:100px;padding:6px 13px;white-space:nowrap}
.adn-card{border:1px solid #e2ddd2;border-radius:11px;padding:12px 14px;margin-bottom:10px;background:#fbfaf8}
.adn-card.approved{background:#f2f9f4;border-color:#bfe0c9}
.adn-card-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.adn-card-title{font-size:.9rem;font-weight:800;color:var(--ink)}
.adn-badge{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-radius:100px;padding:3px 10px}
.adn-badge.pending{background:#fff3d6;color:#8a6d2f}
.adn-badge.approved{background:#d9f0e1;color:var(--green)}
.adn-badge.declined{background:#f5dcda;color:var(--red)}
.adn-badge.voided{background:#eceaf0;color:#6b6478}
.adn-card.voided{opacity:.62}
.adn-card.voided .adn-card-title{text-decoration:line-through;color:var(--muted)}
.adn-disc-row{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--red);padding:2px 0 6px}
.adn-disc-row b{font-weight:800}
.adn-void-note{font-size:.74rem;color:#8a8378;font-style:italic}
.adn-b-disc{display:flex;align-items:center;gap:4px;font-size:.78rem;color:var(--muted);font-weight:600}
.adn-b-disc input{width:74px;height:34px;border:1px solid var(--line-warm);border-radius:8px;padding:0 8px;font-size:.82rem;font-family:inherit;text-align:right;outline:none}
.adn-items{display:flex;flex-direction:column;gap:5px;padding:2px 0 8px}
.adn-item{display:flex;justify-content:space-between;gap:10px;font-size:.84rem;color:var(--slate)}
.adn-item-name{font-weight:600;color:var(--ink)}
.adn-item-price{font-weight:700;font-variant-numeric:tabular-nums}
.adn-item-tech{color:#8a6d2f;font-weight:600}
.adn-card-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid #eee7db;padding-top:9px}
.adn-ct{font-size:.86rem;color:var(--slate)}
.adn-ct b{font-size:.98rem;color:var(--ink);font-weight:800}
.adn-tt{color:#8a6d2f}
.adn-sign{display:flex;align-items:center;gap:8px}
.adn-sign img{height:34px;max-width:150px;object-fit:contain}
.adn-sign em{font-size:.74rem;color:var(--muted);font-style:normal}
.adn-approve{height:36px;padding:0 18px;border:none;border-radius:9px;background:var(--green);color:#fff;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.adn-approve:hover{filter:brightness(1.08)}
.adn-del{height:32px;padding:0 12px;border:1px solid #e0b0a8;border-radius:8px;background:#fff;color:var(--red);font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-unvoid{height:32px;padding:0 12px;border:1px solid #b9c7a8;border-radius:8px;background:#fff;color:#4a6b2f;font-size:.76rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-confirm{display:inline-flex;gap:8px;align-items:center;font-size:.76rem;color:#7a5f1f;font-weight:600}
.adn-c-yes{height:30px;padding:0 12px;border:none;border-radius:8px;background:var(--red);color:#fff;font-size:.74rem;font-weight:800;cursor:pointer;font-family:inherit}
.adn-c-no{height:30px;padding:0 12px;border:1px solid #d5d9e0;border-radius:8px;background:#fff;color:#41485a;font-size:.74rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-newbtn{margin-top:6px;height:42px;width:100%;border:1.5px dashed #b79ae6;background:#f6f1fe;color:#5b3aa6;border-radius:10px;font-size:.84rem;font-weight:800;cursor:pointer;font-family:inherit}
.adn-newbtn:hover{border-color:#7c3aed;background:#efe7fc}
.adn-builder{border:1px solid #ccd6e6;border-radius:11px;background:#f7f5fd;padding:12px;margin-top:6px}
.adn-b-title{width:100%;height:38px;border:1px solid var(--line-warm);border-radius:8px;padding:0 11px;font-size:.86rem;font-family:inherit;outline:none;margin-bottom:9px;font-weight:700}
.adn-b-items{display:flex;flex-direction:column;gap:7px}
.adn-b-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.adn-b-name{flex:2;min-width:130px;height:36px;border:1px solid var(--line-warm);border-radius:8px;padding:0 10px;font-size:.82rem;font-family:inherit;outline:none}
.adn-b-type{height:36px;border:1px solid var(--line-warm);border-radius:8px;padding:0 8px;font-size:.78rem;font-family:inherit;background:#fff;outline:none}
.adn-b-qty{width:52px;height:36px;border:1px solid var(--line-warm);border-radius:8px;padding:0 7px;font-size:.82rem;font-family:inherit;text-align:center;outline:none}
.adn-b-money{display:flex;align-items:center;gap:1px;color:var(--muted);font-weight:700;font-size:.82rem}
.adn-b-money.tech{color:#8a6d2f}
.adn-b-money input{width:74px;height:36px;border:1px solid var(--line-warm);border-radius:8px;padding:0 7px;font-size:.82rem;font-family:inherit;text-align:right;outline:none}
.adn-b-x{width:30px;height:36px;border:1px solid #e2ddd2;border-radius:8px;background:#fff;color:var(--red);cursor:pointer;font-size:.8rem}
.adn-b-act{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:11px}
.adn-b-additem{height:34px;padding:0 13px;border:1px dashed #b79ae6;border-radius:8px;background:#fff;color:#5b3aa6;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-b-total{font-size:.84rem;font-weight:700;color:var(--ink);margin-left:auto}
.adn-b-create{height:38px;padding:0 18px;border:none;border-radius:9px;background:#7c3aed;color:#fff;font-size:.82rem;font-weight:800;cursor:pointer;font-family:inherit}
.adn-b-create:disabled{opacity:.5;cursor:default}
.adn-b-cancel{height:38px;padding:0 13px;border:1px solid var(--line-warm);border-radius:9px;background:#fff;color:#4a5270;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit}
.adn-cust-note{margin-top:10px;font-size:.8rem;color:#5b3aa6;background:#f6f1fe;border:1px dashed #b79ae6;border-radius:9px;padding:10px 12px;font-weight:600}
`;
