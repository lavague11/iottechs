"use client";

// The work order's action area and signature record — the proposal's revision grammar, in payout
// dollars (docs/WORK_ORDERS.md, requirements 12–13). Deliberately the same states and the same words
// as proposal-footer.jsx, because the office already knows them:
//   • Draft, never sent   — Draft · save state                  → [ Send ]
//   • Sent / unsigned     — Sent · v2 · awaiting signature      → (tech: [ Sign ])
//   • Unsent changes      — Unsubmitted · N unsent changes · ±$ → [ Cancel Revision ] [ Send Revision ]
//   • Signed              — the signature record, voidable by the office
// Pure presentation plus the sign sheet; every handler is passed in from work-order-editor.jsx.
import { useState, useEffect, useRef } from "react";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed$ = (n) => `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
const stamp = (s) => {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(s || "");
  const [, y, mo, d, hh, mm] = m;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = +hh; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${MON[+mo - 1]} ${+d}, ${y} · ${h}:${mm} ${ap}`;
};

export default function WorkOrderFooter({
  doc, canEdit, canSend, canSign, canVoid, showMoney, busy, signerName,
  onSend, onCancelRevision, onSign, onVoidSignature,
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [voidAsk, setVoidAsk] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const cs = doc.changeState || {};
  const hasUnsent = !!cs.hasUnsentChanges;
  const sentOnce = (doc.version || 0) > 0;
  const sigs = doc.signatures || [];

  return (
    <div className="wof">
      <div className="wof-row">
        <span className="wof-meta">
          {hasUnsent ? (
            <>
              <span className="wof-badge" title="These changes are saved but NOT yet sent to the technician">Unsubmitted</span>
              <button type="button" className="wof-chg" onClick={() => setChangesOpen(true)} title="See what changed">
                <b>{cs.changeCount} unsent {cs.changeCount === 1 ? "change" : "changes"}</b>
                {showMoney && typeof cs.payoutDelta === "number" && cs.payoutDelta !== 0 && (
                  <span className={`wof-delta${cs.payoutDelta < 0 ? " neg" : ""}`}>· {signed$(cs.payoutDelta)} payout</span>
                )}
              </button>
            </>
          ) : sentOnce ? (
            <span className="wof-sent">Sent · v{doc.version}{sigs.length ? "" : " · awaiting signature"}</span>
          ) : (
            <span className="wof-sent">Draft</span>
          )}
          {doc.versions?.length > 0 && (
            <button type="button" className="wof-vlink" onClick={() => setVersionsOpen((o) => !o)}>
              {doc.versions.length} sent {doc.versions.length === 1 ? "version" : "versions"}
            </button>
          )}
        </span>
        <span className="wof-acts">
          {hasUnsent && canEdit && (confirmCancel ? (
            <span className="wof-confirm">
              Discard changes?
              <button type="button" className="wof-keep" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep</button>
              <button type="button" className="wof-discard" disabled={busy} onClick={() => { setConfirmCancel(false); onCancelRevision(); }}>Discard</button>
            </span>
          ) : (
            <button type="button" className="wof-ghost" disabled={busy} onClick={() => setConfirmCancel(true)}
                    title="Discard these unsent changes and restore the version the technician last received">Cancel Revision</button>
          ))}
          {canSend && (hasUnsent || !sentOnce) && (
            <button type="button" className="wof-cta" disabled={busy} onClick={onSend}>{sentOnce ? "Send Revision" : "Send"}</button>
          )}
          {canSign && <button type="button" className="wof-cta sign" disabled={busy} onClick={() => setSignOpen(true)}>Sign</button>}
        </span>
      </div>

      {/* Every sent version, newest first. A superseded one stays in the record. */}
      {versionsOpen && doc.versions?.length > 0 && (
        <div className="wof-versions">
          {doc.versions.map((v) => (
            <div key={v.id} className="wof-vrow">
              <b>v{v.version}</b>
              <span>{stamp(v.sent_at)}{v.sent_by ? ` · ${v.sent_by}` : ""}</span>
              <span className={`wof-vtag${v.superseded_at ? "" : " live"}`}>{v.superseded_at ? "Superseded" : "Current"}</span>
            </div>
          ))}
        </div>
      )}

      {/* The signature record. One row per technician who accepted this version. */}
      {sigs.length > 0 && (
        <div className="wof-sigs">
          {sigs.map((s) => (
            <div key={s.id} className="wof-sig">
              <span className="wof-sig-mark">
                {s.signature_data ? <img src={s.signature_data} alt={`${s.name} signature`} /> : <span className="wof-sig-typed">{s.name}</span>}
              </span>
              <span className="wof-sig-meta">
                <b>{s.name}</b> accepted v{s.version}
                <span>{stamp(s.signed_at)}</span>
                {/* Owner's rule: the record names the device and where it was signed from. */}
                <span className="wof-sig-ctx">PIN confirmed{s.device ? ` · ${s.device}` : ""}{s.ip ? ` · ${s.ip}` : ""}</span>
              </span>
              {canVoid && (voidAsk === s.id ? (
                <span className="wof-confirm">
                  Void it?
                  <button type="button" className="wof-keep" onClick={() => setVoidAsk(null)}>Keep</button>
                  <button type="button" className="wof-discard" disabled={busy} onClick={() => { setVoidAsk(null); onVoidSignature(s.id); }}>Void</button>
                </span>
              ) : (
                <button type="button" className="wof-void" title="Void this signature" aria-label="Void this signature" onClick={() => setVoidAsk(s.id)}>Void</button>
              ))}
            </div>
          ))}
        </div>
      )}

      {changesOpen && hasUnsent && <ChangesModal cs={cs} showMoney={showMoney} onClose={() => setChangesOpen(false)} />}
      {signOpen && <SignSheet doc={doc} busy={busy} defaultName={signerName} onCancel={() => setSignOpen(false)} onConfirm={onSign} showMoney={showMoney} />}
    </div>
  );
}

// What changed since the version the technician signed, in business language — never raw JSON.
function ChangesModal({ cs, showMoney, onClose }) {
  const d = cs.structuredChanges || {};
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const Row = ({ name, right }) => <div className="wof-cl"><span>{name}</span>{right != null && <b>{right}</b>}</div>;
  return (
    <div className="wof-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wof-modal" role="dialog" aria-modal="true" aria-label="Changes">
        <div className="wof-mh">
          <span>Changes since v{cs.publishedVersion}</span>
          {showMoney && typeof cs.payoutDelta === "number" && cs.payoutDelta !== 0 && <span className={`wof-delta${cs.payoutDelta < 0 ? " neg" : ""}`}>{signed$(cs.payoutDelta)}</span>}
          <button type="button" className="wof-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="wof-mb">
          {d.added?.length > 0 && <><div className="wof-cg add">Added</div>{d.added.map((l) => <Row key={l.key} name={l.name} right={showMoney ? money(l.total) : null} />)}</>}
          {d.removed?.length > 0 && <><div className="wof-cg rem">Removed</div>{d.removed.map((l) => <Row key={l.key} name={l.name} right={showMoney ? money(l.total) : null} />)}</>}
          {d.changed?.length > 0 && <><div className="wof-cg chg">Changed</div>{d.changed.map((c) => (
            <div key={c.key} className="wof-cl col">
              <span>{c.name}</span>
              {c.from.qty !== c.to.qty && <i>Quantity {c.from.qty} → {c.to.qty}</i>}
              {showMoney && c.from.payout !== c.to.payout && <i>Payout {money(c.from.payout)} → {money(c.to.payout)}</i>}
              {c.from.name !== c.to.name && <i>Renamed from {c.from.name}</i>}
            </div>
          ))}</>}
        </div>
      </div>
    </div>
  );
}

// Accept the work order. Owner's rule (2026-11-19): the technician re-enters THEIR OWN PIN before the
// signature is taken, and the record keeps the account, device, IP and time. The PIN is sent once to be
// checked against this account and is never stored.
function SignSheet({ doc, busy, defaultName, onCancel, onConfirm, showMoney }) {
  const [name, setName] = useState(defaultName || "");
  const [pin, setPin] = useState("");
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState(null);
  const padRef = useRef(null);
  const drawn = useRef(false);

  // Signature pad — pointer events so it works with a finger, a stylus or a mouse.
  useEffect(() => {
    const c = padRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#101418";
    let down = false;
    const at = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const start = (e) => { down = true; drawn.current = true; c.setPointerCapture?.(e.pointerId); ctx.beginPath(); ctx.moveTo(...at(e)); };
    const move = (e) => { if (!down) return; e.preventDefault(); ctx.lineTo(...at(e)); ctx.stroke(); };
    const end = () => { down = false; };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", end); c.addEventListener("pointerleave", end);
    return () => { c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointerleave", end); };
  }, []);
  const clear = () => { const c = padRef.current; if (!c) return; c.getContext("2d").clearRect(0, 0, c.width, c.height); drawn.current = false; };

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Enter your name.");
    if (!/^\d{4}$/.test(pin)) return setErr("Enter your 4-digit PIN.");
    if (!agree) return setErr("Confirm you accept this work order.");
    onConfirm({ name: name.trim(), pin, signatureData: drawn.current ? padRef.current.toDataURL("image/png") : null });
  }

  return (
    <div className="wof-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="wof-modal sign" role="dialog" aria-modal="true" aria-label="Accept work order">
        <div className="wof-mh">
          <span>Accept work order</span>
          <span className="wof-sub">v{doc.version}{showMoney && doc.total != null ? ` · ${money(doc.total)}` : ""}</span>
          <button type="button" className="wof-x" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <div className="wof-mb">
          <label className="wof-f"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="wof-f">
            <span>Your PIN</span>
            <input value={pin} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" type="password"
                   onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </label>
          <div className="wof-pad">
            <canvas ref={padRef} aria-label="Signature pad" />
            <button type="button" className="wof-clear" onClick={clear} title="Clear" aria-label="Clear">Clear</button>
          </div>
          <label className="wof-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I accept this work order, can perform the scope described, and agree to be assigned this job.</span>
          </label>
          {err && <div className="wof-err">{err}</div>}
        </div>
        <div className="wof-mf">
          <button type="button" className="wof-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="wof-cta sign" disabled={busy} onClick={submit}>{busy ? "Signing…" : "Sign"}</button>
        </div>
      </div>
    </div>
  );
}
