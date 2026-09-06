"use client";
import { useState, useEffect, useRef } from "react";
import { titleCase } from "../../../lib/proposal";
import { getToolDataAction, saveToolDataAction } from "./proposal-actions";
import { logAddendumAction } from "./actions";
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
// Prefill the addendum title so the office has a sensible starting point: "Add-on · <today>".
const defaultTitle = () => `Add-on · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

export default function InstallAddendum({ accessId, role, readOnly, customerName, onCount, embedded = false }) {
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
    logAddendumAction(accessId, { verb: "created", title: rec.title, amount: custTotal(rec) }).catch(() => {});   // Job Log
    setDraft({ title: "", items: [blankItem()], discount: "" }); setBuilding(false);
  }
  const removeAddendum = (id) => { const a = addendums.find((x) => x.id === id); persist(addendums.filter((x) => x.id !== id)); if (a) logAddendumAction(accessId, { verb: "removed", title: a.title }).catch(() => {}); };
  // Void an addendum (any status) — it stays on record with the date, but drops out of billing and
  // the install checklist (getApprovedAddons only counts status "approved").
  const voidAddendum = (id) => { const a = addendums.find((x) => x.id === id); persist(addendums.map((x) => (x.id === id ? { ...x, status: "voided", voidedAt: new Date().toISOString() } : x))); if (a) logAddendumAction(accessId, { verb: "voided", title: a.title }).catch(() => {}); };
  // Un-void: a voided addendum returns to pending (if never signed) or approved (if it had been signed).
  const unvoidAddendum = (id) => persist(addendums.map((a) => (a.id === id ? { ...a, status: a.signedName ? "approved" : "pending", voidedAt: undefined } : a)));

  // ---- Approval (customer) ----
  function approve(sign) {
    const a = addendums.find((x) => x.id === signId);
    persist(addendums.map((x) => (x.id === signId ? { ...x, status: "approved", signedName: sign.name, signedAt: new Date().toISOString(), signatureData: sign.data } : x)));
    if (a) logAddendumAction(accessId, { verb: "approved", title: a.title, amount: custTotal(a) }).catch(() => {});   // Job Log
    setSignId(null);
  }

  const pending = addendums.filter((a) => a.status === "pending");
  if (!canBuild && addendums.length === 0) return null; // customer/tech see nothing until one exists

  return (
    <div className="adn-root">
      <style>{ADN_CSS}</style>
      {!embedded && (
        <div className="adn-head">
          <div><span className="adn-title">Job-Site Add-ons</span></div>
          {approvedTotal > 0 && <span className="adn-total-badge">Approved add-ons {money(approvedTotal)}</span>}
        </div>
      )}

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
          <label className="adn-fld">
            <span className="adn-flbl">Addendum title</span>
            <input className="adn-b-title" placeholder="Added 3 rear cameras" value={draft.title} autoFocus onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <div className="adn-b-items">
            {draft.items.map((it, i) => (
              <div key={it.id} className="adn-lineitem">
                {draft.items.length > 1 && (
                  <div className="adn-li-hd"><span className="adn-li-n">Item {i + 1}</span>
                    <button type="button" className="adn-b-x" onClick={() => delRow(i)} aria-label="Remove item">✕</button></div>
                )}
                <label className="adn-fld">
                  <span className="adn-flbl">Item</span>
                  <input className="adn-b-name" placeholder="Dome Camera" value={it.name} onChange={(e) => dItem(i, { name: e.target.value })} />
                </label>
                <div className="adn-frow">
                  <label className="adn-fld adn-fld-type">
                    <span className="adn-flbl">Type</span>
                    <select className="adn-b-type" value={it.type} onChange={(e) => dItem(i, { type: e.target.value })}>
                      {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="adn-fld adn-fld-qty">
                    <span className="adn-flbl">Qty</span>
                    <input className="adn-b-qty" type="number" min="1" step="1" value={it.qty} onChange={(e) => dItem(i, { qty: e.target.value })} />
                  </label>
                </div>
                <div className="adn-frow">
                  {showRetail && (
                    <label className="adn-fld adn-fld-price">
                      <span className="adn-flbl">Customer price</span>
                      <span className="adn-money"><span className="adn-cur">$</span>
                        <input type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={it.price} onChange={(e) => dItem(i, { price: e.target.value })} /></span>
                    </label>
                  )}
                  {showPayout && (
                    <label className="adn-fld adn-fld-price">
                      <span className="adn-flbl adn-flbl-tech">Tech pay</span>
                      <span className="adn-money tech"><span className="adn-cur">$</span>
                        <input type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={it.techPay} onChange={(e) => dItem(i, { techPay: e.target.value })} /></span>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="adn-b-act">
            <button type="button" className="adn-b-additem" onClick={addRow}>+ Add item</button>
            <label className="adn-fld adn-b-disc">
              <span className="adn-flbl">Discount</span>
              <span className="adn-money"><span className="adn-cur">$</span>
                <input type="number" min="0" step="1" inputMode="decimal" placeholder="0" value={draft.discount} onChange={(e) => setDraft((d) => ({ ...d, discount: e.target.value }))} /></span>
            </label>
          </div>
          <div className="adn-b-final">
            <div className="adn-b-totalblock">
              <span className="adn-flbl">Total</span>
              <b className="adn-b-tval">{money(Math.max(0, validItems().reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) - (+draft.discount || 0)))}</b>
            </div>
            <button type="button" className="adn-b-create" disabled={busy || !validItems().length} onClick={createAddendum}>Create addendum</button>
            <button type="button" className="adn-b-cancel" onClick={() => { setBuilding(false); setDraft({ title: "", items: [blankItem()], discount: "" }); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="adn-newbtn" onClick={() => { setDraft((d) => ({ ...d, title: d.title || defaultTitle() })); setBuilding(true); }}>+ New addendum</button>
      ))}

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
.adn-root{background:var(--dv-raise,#FBFBFA);border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:16px;margin:16px 0 0;
  font-family:inherit}
.adn-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.adn-title{display:block;font-size:1rem;font-weight:600;color:var(--dv-ink,#101418);letter-spacing:-.01em}
.adn-sub{font-size:.78rem;color:var(--dv-meta,#787D84)}
.adn-total-badge{background:#e9f3ed;border:1px solid #cfe6d8;color:var(--dv-green,#2E7D5B);font-weight:600;font-size:.78rem;border-radius:100px;padding:6px 13px;white-space:nowrap}
.adn-card{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--dv-raise,#FBFBFA)}
.adn-card.approved{background:#f2f9f4;border-color:#cfe6d8}
.adn-card-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.adn-card-title{font-size:.9rem;font-weight:600;color:var(--dv-ink,#101418)}
.adn-badge{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border-radius:100px;padding:3px 10px}
.adn-badge.pending{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.adn-badge.approved{background:#e9f3ed;color:var(--dv-green,#2E7D5B)}
.adn-badge.declined{background:#fbe9e6;color:var(--dv-red,#C4553D)}
.adn-badge.voided{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-meta,#787D84)}
.adn-card.voided{opacity:.62}
.adn-card.voided .adn-card-title{text-decoration:line-through;color:var(--dv-meta,#787D84)}
.adn-disc-row{display:flex;justify-content:space-between;gap:10px;font-size:.82rem;color:var(--dv-red,#C4553D);padding:2px 0 6px}
.adn-disc-row b{font-weight:600}
.adn-void-note{font-size:.74rem;color:var(--dv-faint,#A1A6AC);font-style:italic}
.adn-items{display:flex;flex-direction:column;gap:5px;padding:2px 0 8px}
.adn-item{display:flex;justify-content:space-between;gap:10px;font-size:.84rem;color:var(--dv-ink-soft,#3A4048)}
.adn-item-name{font-weight:600;color:var(--dv-ink,#101418)}
.adn-item-price{font-weight:600;font-variant-numeric:tabular-nums}
.adn-item-tech{color:var(--dv-gold-deep,#A8842F);font-weight:500}
.adn-card-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--dv-line-soft,#EDEDE9);padding-top:9px}
.adn-ct{font-size:.86rem;color:var(--dv-ink-soft,#3A4048)}
.adn-ct b{font-size:.98rem;color:var(--dv-ink,#101418);font-weight:600}
.adn-tt{color:var(--dv-gold-deep,#A8842F)}
.adn-sign{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.adn-sign img{height:34px;max-width:150px;object-fit:contain}
.adn-sign em{font-size:.74rem;color:var(--dv-meta,#787D84);font-style:normal}
.adn-root .adn-approve{height:36px;padding:0 18px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-approve:hover{filter:brightness(1.12)}
.adn-del{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-red,#C4553D);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-unvoid{height:32px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-green,#2E7D5B);font-size:.76rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-confirm{display:inline-flex;gap:8px;align-items:center;font-size:.76rem;color:var(--dv-meta,#787D84);font-weight:500}
.adn-root .adn-c-yes{height:30px;padding:0 12px;border:none;border-radius:8px;background:var(--dv-red,#C4553D);color:#fff;font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-c-no{height:30px;padding:0 12px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:var(--dv-raise,#FBFBFA);color:var(--dv-ink,#101418);font-size:.74rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-newbtn{margin-top:6px;height:42px;width:100%;border:1px solid var(--dv-line,#E4E4DF);background:var(--dv-paper,#F4F4F2);color:var(--dv-ink,#101418);border-radius:10px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-newbtn:hover{border-color:var(--dv-gold,#C9A96E);color:var(--dv-gold-deep,#A8842F)}
.adn-builder{border:1px solid var(--dv-line,#E4E4DF);border-radius:12px;background:var(--dv-paper,#F4F4F2);padding:14px;margin-top:6px;display:flex;flex-direction:column;gap:12px}
/* One deliberate form: every control is a labeled field so the workflow reads top to bottom
   (title → item → type/qty → customer/tech price → add item/discount → total → create). */
.adn-fld{display:flex;flex-direction:column;gap:5px;min-width:0}
.adn-flbl{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--dv-meta,#787D84)}
.adn-flbl-tech{color:var(--dv-gold-deep,#A8842F)}
.adn-b-title,.adn-b-name,.adn-b-type,.adn-b-qty{height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;padding:0 11px;font-size:.86rem;font-family:inherit;outline:none;background:#fff;color:var(--dv-ink,#101418);width:100%}
.adn-b-title{font-weight:600}
.adn-b-title:focus,.adn-b-name:focus,.adn-b-type:focus,.adn-b-qty:focus{border-color:var(--dv-gold,#C9A96E)}
.adn-b-qty{text-align:center;padding:0 6px}
.adn-b-items{display:flex;flex-direction:column;gap:14px}
.adn-lineitem{display:flex;flex-direction:column;gap:10px}
.adn-lineitem + .adn-lineitem{border-top:1px solid var(--dv-line,#E4E4DF);padding-top:14px}
.adn-li-hd{display:flex;align-items:center;justify-content:space-between}
.adn-li-n{font-size:.72rem;font-weight:700;color:var(--dv-ink-soft,#3A4048)}
.adn-frow{display:flex;gap:8px}
.adn-frow .adn-fld{flex:1 1 0}
.adn-frow .adn-fld-type{flex:1 1 auto}
.adn-frow .adn-fld-qty{flex:0 0 72px}
.adn-frow .adn-fld-price{flex:1 1 0}
/* Currency belongs to the input: one bordered box, $ inside, number right-aligned. No loose $. */
.adn-money{display:flex;align-items:center;height:38px;border:1px solid var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;padding-left:10px;gap:1px}
.adn-money:focus-within{border-color:var(--dv-gold,#C9A96E)}
.adn-money.tech:focus-within{border-color:var(--dv-gold-deep,#A8842F)}
.adn-cur{color:var(--dv-meta,#787D84);font-weight:600;font-size:.86rem;flex:0 0 auto}
.adn-money input{flex:1 1 0;min-width:0;height:100%;border:none;background:transparent;text-align:right;padding:0 10px 0 2px;font-size:.9rem;font-family:inherit;color:var(--dv-ink,#101418);outline:none;font-variant-numeric:tabular-nums}
.adn-money.tech .adn-cur{color:var(--dv-gold-deep,#A8842F)}
.adn-b-x{width:26px;height:26px;border:1px solid var(--dv-line,#E4E4DF);border-radius:7px;background:#fff;color:var(--dv-red,#C4553D);cursor:pointer;font-size:.72rem;flex:0 0 auto}
.adn-b-act{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.adn-b-additem{height:38px;padding:0 15px;border:1px dashed var(--dv-line,#E4E4DF);border-radius:8px;background:#fff;color:var(--dv-ink,#101418);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-b-additem:hover{border-color:var(--dv-gold,#C9A96E);border-style:solid;color:var(--dv-gold-deep,#A8842F)}
.adn-b-disc{flex:0 0 auto}
.adn-b-disc .adn-money{width:118px}
/* Final action area: Total leads, Create is the clear primary, Cancel is quiet. */
.adn-b-final{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:2px;padding-top:13px;border-top:1px solid var(--dv-line,#E4E4DF)}
.adn-b-totalblock{display:flex;flex-direction:column;gap:2px;margin-right:auto}
.adn-b-tval{font-size:1.15rem;font-weight:700;color:var(--dv-ink,#101418);font-variant-numeric:tabular-nums;line-height:1}
/* .adn-root prefix beats the deck's ".dv-shell button" background reset so the primary button
   actually reads as a filled button, not plain text. */
.adn-root .adn-b-create{height:40px;padding:0 20px;border:none;border-radius:9px;background:var(--dv-ink,#101418);color:#fff;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-root .adn-b-create:hover{filter:brightness(1.12)}
.adn-root .adn-b-create:disabled{background:var(--dv-line-soft,#EDEDE9);color:var(--dv-faint,#A1A6AC);cursor:not-allowed;filter:none}
.adn-b-cancel{height:40px;padding:0 12px;border:none;border-radius:9px;background:transparent;color:var(--dv-meta,#787D84);font-size:.8rem;font-weight:600;cursor:pointer;font-family:inherit}
.adn-b-cancel:hover{color:var(--dv-ink,#101418)}
.adn-cust-note{margin-top:10px;font-size:.8rem;color:var(--dv-ink-soft,#3A4048);background:var(--dv-paper,#F4F4F2);border:1px solid var(--dv-line,#E4E4DF);border-radius:9px;padding:10px 12px;font-weight:500}
`;
