"use client";
import { useState } from "react";

// Approval + e-signature panel mounted under the Site Survey / Camera Mockup tools.
// One record per project per tool, stored client-side (same localStorage-per-project
// pattern the survey/mockup widgets already use — see [[mockup-tool]] memory).
//
// Roles:
//  - Customer: reviews items (approve all / approve individually / request a change or
//    removal), then signs via "Approve & Sign" (name + live timestamp). Required before
//    the project can advance out of Site Survey (see STAGE_REQS in gateway-client.jsx).
//  - Admin / Manager / Sales / Tech: read-only status + the item requests. Admin/Manager
//    additionally get an "Override" action that requires a reason.
const OVERRIDE_REASONS = [
  "Customer unreachable",
  "Verbal approval given",
  "Time-sensitive — proceeding without signature",
  "Other",
];

function approvalKey(accessId, tool) { return `iot_approval_${accessId}_${tool}`; }

export function loadApproval(accessId, tool) {
  try {
    const raw = localStorage.getItem(approvalKey(accessId, tool));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: {}, signature: null, override: null };
}

function saveApproval(accessId, tool, data) {
  try { localStorage.setItem(approvalKey(accessId, tool), JSON.stringify(data)); } catch {}
}

function fmtStamp(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const ESIGN_DISCLOSURE = `By checking this box, you agree to use an electronic signature and electronic
records for this approval. Your typed name below is legally binding, equivalent to a handwritten
signature. You confirm you have reviewed the items above and are authorized to approve them on
behalf of the account holder.`;

export default function SignaturePanel({ accessId, tool, toolLabel, items, view, customerView, customerName }) {
  const [data, setData] = useState(() => loadApproval(accessId, tool));
  const [itemsOpen, setItemsOpen] = useState(() => !loadApproval(accessId, tool).signature);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState(customerName || "");
  const [signAccepted, setSignAccepted] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState(OVERRIDE_REASONS[0]);
  const [overrideOther, setOverrideOther] = useState("");
  const [reqOpen, setReqOpen] = useState(null); // { itemId, kind: 'change'|'remove' }
  const [reqNote, setReqNote] = useState("");
  const [sigVoidOpen, setSigVoidOpen] = useState(false); // admin void of the customer signature

  const isCustomer = view === "customer" && !customerView;
  const canOverride = ["admin", "manager"].includes(view) && !customerView;

  function persist(next) { setData(next); saveApproval(accessId, tool, next); }

  function setItemDecision(id, decision, note) {
    persist({ ...data, items: { ...data.items, [id]: { decision, note: note || "", ts: Date.now() } } });
  }
  function clearItemDecision(id) {
    const next = { ...data.items };
    delete next[id];
    persist({ ...data, items: next });
  }
  function approveAll() {
    const next = { ...data.items };
    items.forEach((it) => { next[it.id] = { decision: "approved", note: "", ts: Date.now() }; });
    persist({ ...data, items: next });
  }
  function submitSignature() {
    const name = signName.trim();
    if (!name || !signAccepted || decided.length !== items.length) return;
    persist({ ...data, signature: { name, ts: Date.now(), role: "customer", disclosureAccepted: true }, override: null });
    setSignOpen(false);
    setSignAccepted(false);
    setItemsOpen(false);
  }
  function submitOverride() {
    const reason = overrideReason === "Other" ? overrideOther.trim() : overrideReason;
    if (!reason) return;
    persist({ ...data, override: { by: customerName || view, role: view, reason, ts: Date.now() } });
    setOverrideOpen(false);
    setOverrideOther("");
  }
  function submitRequest() {
    if (!reqOpen) return;
    setItemDecision(reqOpen.itemId, reqOpen.kind, reqNote.trim());
    setReqOpen(null);
    setReqNote("");
  }
  // Admin/manager correction: void the customer approval signature so it can be re-signed.
  function voidSignature() {
    persist({ ...data, signature: null });
    setSigVoidOpen(false);
    setItemsOpen(true);
  }

  const signed = !!data.signature;
  const overridden = !!data.override;
  const decided = items.filter((it) => data.items[it.id]);
  const allReviewed = decided.length === items.length;
  const changeRequests = items
    .map((it) => ({ item: it, d: data.items[it.id] }))
    .filter(({ d }) => d && (d.decision === "change" || d.decision === "remove"));

  if (!items || items.length === 0) return null;

  return (
    <div className="sig-panel">
      <div className="sig-head">
        <span className="sig-title">Customer approval</span>
        {signed ? (
          <span className="sig-status ok">✓ Signed by {data.signature.name} · {fmtStamp(data.signature.ts)}</span>
        ) : overridden ? (
          <span className="sig-status warn">⚠ Overridden by {data.override.by} ({data.override.role}) · {data.override.reason} · {fmtStamp(data.override.ts)}</span>
        ) : (
          <span className="sig-status pending">Awaiting customer signature</span>
        )}
      </div>

      {changeRequests.length > 0 && (
        <div className="sig-requests">
          <span className="sig-req-label">Customer requests:</span>
          {changeRequests.map(({ item, d }) => (
            <div key={item.id} className="sig-req-row">
              <span className={`sig-req-tag ${d.decision}`}>{d.decision === "remove" ? "Remove" : "Change"}</span>
              <span className="sig-req-item">{item.tag} — {item.name}{item.floor ? ` (${item.floor})` : ""}</span>
              {d.note && <span className="sig-req-note">"{d.note}"</span>}
            </div>
          ))}
        </div>
      )}

      {isCustomer && (
        <>
          {!signed && (
            <div className="sig-required-banner">
              Signature required — review all items below, then Approve &amp; Sign to continue.
            </div>
          )}

          <div className="sig-items">
            <div className="sig-items-head">
              <button type="button" className="sig-items-toggle" onClick={() => setItemsOpen((v) => !v)}>
                <span className="sig-items-chev">{itemsOpen ? "▾" : "▸"}</span>
                {toolLabel} items ({decided.length}/{items.length} reviewed)
              </button>
              {!signed && <button className="sig-approve-all" onClick={approveAll}>Approve all</button>}
            </div>
            {itemsOpen && items.map((it) => {
              const d = data.items[it.id];
              return (
                <div key={it.id} className="sig-item-row">
                  <span className="sig-item-name">{it.tag} — {it.name}{it.floor ? ` (${it.floor})` : ""}</span>
                  {d ? (
                    <div className="sig-item-badge-row">
                      <span className={`sig-item-badge ${d.decision}`}>
                        {d.decision === "approved" ? "✓ Approved" : d.decision === "remove" ? "Removal requested" : "Change requested"}
                      </span>
                      {!signed && <button className="sig-item-change" onClick={() => clearItemDecision(it.id)}>Change</button>}
                    </div>
                  ) : (
                    <div className="sig-item-actions">
                      <button className="sig-item-btn approve" onClick={() => setItemDecision(it.id, "approved")}>Approve</button>
                      <button className="sig-item-btn" onClick={() => { setReqOpen({ itemId: it.id, kind: "change" }); setReqNote(""); }}>Request change</button>
                      <button className="sig-item-btn danger" onClick={() => { setReqOpen({ itemId: it.id, kind: "remove" }); setReqNote(""); }}>Request removal</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!signed && (
            <>
              <button className="sig-sign-btn" disabled={!allReviewed} onClick={() => { setSignName(customerName || ""); setSignOpen(true); }}>
                Approve &amp; Sign
              </button>
              {!allReviewed && (
                <div className="sig-sign-hint">Review all {items.length} items to continue ({decided.length}/{items.length} done)</div>
              )}
            </>
          )}
        </>
      )}

      {!isCustomer && !signed && !overridden && canOverride && (
        <button className="sig-override-btn" onClick={() => setOverrideOpen(true)}>Override</button>
      )}

      {signed && (
        <div className="sig-block">
          {canOverride ? (
            <button type="button" title="Click to void this signature"
              style={{ background: "none", border: "1px dashed transparent", borderRadius: 8, padding: "4px 8px", margin: "-4px -8px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "block", width: "fit-content" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#fbece7"; e.currentTarget.style.borderColor = "#e2c9c1"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; }}
              onClick={() => setSigVoidOpen(true)}>
              <div className="sig-block-script">{data.signature.name}</div>
              <div className="sig-block-line" />
              <div className="sig-block-meta">
                <span>{data.signature.name}</span>
                <span>{fmtStamp(data.signature.ts)}</span>
              </div>
            </button>
          ) : (
            <>
              <div className="sig-block-script">{data.signature.name}</div>
              <div className="sig-block-line" />
              <div className="sig-block-meta">
                <span>{data.signature.name}</span>
                <span>{fmtStamp(data.signature.ts)}</span>
              </div>
            </>
          )}
          <div className="sig-block-foot">Signed electronically · E-Sign disclosure accepted</div>
          {canOverride && sigVoidOpen && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8, fontSize: ".72rem", color: "#7a5f1f" }}>
              Are you sure you want to void this signature?
              <button onClick={voidSignature} style={{ height: 24, padding: "0 10px", borderRadius: 100, border: "none", background: "#a8442f", color: "#fff", fontSize: ".68rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Void</button>
              <button onClick={() => setSigVoidOpen(false)} style={{ height: 24, padding: "0 10px", borderRadius: 100, border: "1px solid #d9d4ca", background: "#fff", color: "#4a4f5a", fontSize: ".68rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Keep</button>
            </div>
          )}
        </div>
      )}

      {signOpen && (
        <div className="sig-modal-backdrop" onClick={() => { setSignOpen(false); setSignAccepted(false); setDisclosureOpen(false); }}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sig-modal-title">Approve &amp; Sign</div>
            <label className="sig-modal-field">
              <span>Your name</span>
              <input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Full name" autoFocus />
            </label>
            <div className="sig-modal-stamp">{fmtStamp(Date.now())}</div>

            <div className="sig-preview-label">Signature preview</div>
            <div className="sig-preview-box">
              <span className="sig-preview-script">{signName.trim() || "Your name"}</span>
            </div>

            <label className="sig-consent-row">
              <input type="checkbox" checked={signAccepted} onChange={(e) => setSignAccepted(e.target.checked)} />
              <span>
                I agree to the E-Sign Disclosure and consent to sign electronically.{" "}
                <button type="button" className="sig-disclosure-toggle" onClick={(e) => { e.preventDefault(); setDisclosureOpen((v) => !v); }}>
                  {disclosureOpen ? "See less" : "See more"}
                </button>
              </span>
            </label>
            {disclosureOpen && <div className="sig-disclosure">{ESIGN_DISCLOSURE}</div>}

            <div className="sig-modal-acts">
              <button className="sig-modal-cancel" onClick={() => { setSignOpen(false); setSignAccepted(false); setDisclosureOpen(false); }}>Cancel</button>
              <button className="sig-modal-confirm" disabled={!signName.trim() || !signAccepted || !allReviewed} onClick={submitSignature}>Confirm &amp; Sign</button>
            </div>
          </div>
        </div>
      )}

      {overrideOpen && (
        <div className="sig-modal-backdrop" onClick={() => setOverrideOpen(false)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sig-modal-title">Override signature requirement</div>
            <label className="sig-modal-field">
              <span>Reason</span>
              <select value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}>
                {OVERRIDE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            {overrideReason === "Other" && (
              <label className="sig-modal-field">
                <span>Details</span>
                <input value={overrideOther} onChange={(e) => setOverrideOther(e.target.value)} placeholder="Reason for override" autoFocus />
              </label>
            )}
            <div className="sig-modal-acts">
              <button className="sig-modal-cancel" onClick={() => setOverrideOpen(false)}>Cancel</button>
              <button className="sig-modal-confirm" disabled={overrideReason === "Other" && !overrideOther.trim()} onClick={submitOverride}>Override &amp; continue</button>
            </div>
          </div>
        </div>
      )}

      {reqOpen && (
        <div className="sig-modal-backdrop" onClick={() => setReqOpen(null)}>
          <div className="sig-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sig-modal-title">{reqOpen.kind === "remove" ? "Request removal" : "Request a change"}</div>
            <label className="sig-modal-field">
              <span>Note for the team</span>
              <textarea value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="What should change?" rows={3} autoFocus />
            </label>
            <div className="sig-modal-acts">
              <button className="sig-modal-cancel" onClick={() => setReqOpen(null)}>Cancel</button>
              <button className="sig-modal-confirm" onClick={submitRequest}>Submit request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
