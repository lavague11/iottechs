"use client";
import { useState, useEffect, useRef } from "react";
import {
  OPTION_LETTERS, PROPOSAL_SERVICES, blankPayload, blankOption,
  optionTotals, surveyToImport, surveyFloorSummary, serviceLabel, savePriceOverrides,
  toastBaselineItems, loadPriceBook,
} from "../../../lib/proposal";
import ProposalItemsEditor from "./proposal-items-editor";
import PricingDefaults from "./proposal-pricing";
import { getProposalAction, saveProposalDraftAction, sendProposalAction, reviseProposalAction, getPriceBookAction, resolveFlagAction } from "./proposal-actions";

const money = (n) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Staff proposal builder (admin / manager / sales). Sales get no Cost column and no
// margin strip — and the server strips cost from their reads AND writes regardless.
export default function ProposalBuilder({ accessId, role, initial, onProposalChange }) {
  const showCost = false; // cost/margin removed from the builder; pricing lives in the gear (default price book)
  const [meta, setMeta] = useState(initial || null);          // server row (status, version, sent_at…)
  const [payload, setPayload] = useState(() => initial?.payload || blankPayload());
  const [taxRate, setTaxRate] = useState(initial?.tax_rate ?? 0);
  const [depositPct, setDepositPct] = useState(initial?.deposit_pct ?? 50);
  const [activeOpt, setActiveOpt] = useState(initial?.payload?.options?.[0]?.id || "A");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }
  const [savedAt, setSavedAt] = useState(null);
  const [authBlocked, setAuthBlocked] = useState(false); // PIN-only session — stop autosave retries
  // null = closed; "__all__" = the header gear (every service); a service key = that
  // service's own gear (opened from ProposalItemsEditor), scoped to just that catalog.
  const [pricingOpen, setPricingOpen] = useState(null);
  const [priceBookVersion, setPriceBookVersion] = useState(0);
  const [surveyFloors, setSurveyFloors] = useState([]); // [{index, name, count}] for the import picker

  // Refresh with a role-appropriate copy on mount (covers PIN-resolved sessions that got
  // the customer-safe variant from the server render). If the draft is still empty and
  // this device has survey data, auto-import the devices once (idempotent — see importSurvey).
  const autoImportedRef = useRef(false);
  useEffect(() => {
    try { setSurveyFloors(surveyFloorSummary(JSON.parse(localStorage.getItem(`iottechs_sitesurvey_v2_${accessId}`) || "null"))); } catch {}
    let live = true;
    // Sync the company-wide price book to the local cache FIRST, so auto-import prices correctly.
    getPriceBookAction()
      .then((pb) => { if (live && pb?.ok && pb.prices) savePriceOverrides(pb.prices); })
      .catch(() => {})
      .finally(() => getProposalAction(accessId).then((r) => {
        if (!live || dirty) return;
        if (r?.proposal) adopt(r.proposal);
        const p = r?.proposal;
        const empty = !p?.payload || !p.payload.options?.some((o) => o.services?.length);
        const isDraft = !p || !p.status || p.status === "draft";
        if (empty && isDraft && !autoImportedRef.current) {
          autoImportedRef.current = true;
          importSurvey(true);
        }
      }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId]);

  // Auto-save: debounce edits into the DB (like the survey tools' autosave, but server-side).
  useEffect(() => {
    if (!dirty || busy || authBlocked) return;
    const t = setTimeout(() => { save(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, taxRate, depositPct, dirty, authBlocked]);

  function adopt(p) {
    setMeta(p);
    if (p?.payload) {
      setPayload(p.payload);
      setTaxRate(p.tax_rate ?? 0);
      setDepositPct(p.deposit_pct ?? 50);
      if (!p.payload.options.some((o) => o.id === activeOpt)) setActiveOpt(p.payload.options[0]?.id || "A");
    }
    setDirty(false);
    // Propagate server truth up so sibling read-surfaces (customer preview, tech work order)
    // reflect a proposal built/sent in this same session instead of the stale page-load copy.
    onProposalChange?.(p);
  }

  const status = meta?.status && meta.payload ? meta.status : (meta?.status || "draft");
  const readOnly = status !== "draft";
  const opt = payload.options.find((o) => o.id === activeOpt) || payload.options[0];

  function patchPayload(next) { setPayload(next); setDirty(true); setErr(null); }
  function patchOption(patch) {
    patchPayload({ ...payload, options: payload.options.map((o) => (o.id === opt.id ? { ...o, ...patch } : o)) });
  }
  function addOption() {
    if (payload.options.length >= 3) return;
    const used = new Set(payload.options.map((o) => o.id));
    const idx = OPTION_LETTERS.findIndex((l) => !used.has(l));
    const o = blankOption(idx);
    patchPayload({ ...payload, options: [...payload.options, o] });
    setActiveOpt(o.id);
  }
  function removeOption(id) {
    if (payload.options.length <= 1) return;
    const next = payload.options.filter((o) => o.id !== id);
    patchPayload({ ...payload, options: next });
    if (activeOpt === id) setActiveOpt(next[0].id);
  }
  function addService(key) {
    if (!key || opt.services.some((s) => s.key === key && key !== "custom")) return;
    // Toast POS always brings ISP / Pronto-Meraki / Network Switch along, even added
    // manually with no survey markers — same baseline surveyToImport seeds on import.
    const items = key === "toast" ? toastBaselineItems(loadPriceBook()) : [];
    patchOption({ services: [...opt.services, { key, label: serviceLabel(key), items, note: "" }] });
  }

  // ---- Import from the site survey (per-camera blocks w/ labor sub-items + locations) ----
  // `auto` = fired on first open of an empty draft. `floorIndex` = a single floor index, an
  // array of indices (the floor-plan checkbox picker), or null for every floor.
  function importSurvey(auto = false, floorIndex = null) {
    let survey = null;
    try { survey = JSON.parse(localStorage.getItem(`iottechs_sitesurvey_v2_${accessId}`) || "null"); } catch {}
    const groups = survey ? surveyToImport(survey, floorIndex) : [];
    const picked = floorIndex == null ? null : (Array.isArray(floorIndex) ? floorIndex : [floorIndex]);
    const floorName = picked ? picked.map((i) => surveyFloors.find((f) => f.index === i)?.name).filter(Boolean).join(", ") || null : null;
    if (!groups.length) { if (!auto) setImportMsg(floorName ? `No importable devices on ${floorName}.` : "No survey devices found on this device."); return; }
    // Count what will actually be added (auto replaces → all; manual dedupes → only new names).
    let added = 0;
    if (auto) added = groups.reduce((s, g) => s + g.items.length, 0);
    else {
      const optNow = payload.options.find((o) => o.id === activeOpt) || payload.options[0];
      groups.forEach((g) => {
        const ex = optNow.services.find((s) => s.key === g.key);
        const have = ex ? new Set(ex.items.map((it) => it.name)) : new Set();
        added += g.items.filter((it) => !have.has(it.name)).length;
      });
    }
    setPayload((prev) => {
      const optId = prev.options.some((o) => o.id === activeOpt) ? activeOpt : prev.options[0].id;
      return {
        ...prev,
        options: prev.options.map((o) => {
          if (o.id !== optId) return o;
          // Auto-import is IDEMPOTENT: it replaces the option's services with the survey's,
          // so a remount that races the autosave can't stack duplicate copies. It only ever
          // fires on an empty draft, so nothing manual is lost.
          if (auto) return { ...o, services: groups };
          // Manual import MERGES but never duplicates: an item already present (by name) is skipped.
          const services = o.services.map((s) => ({ ...s, items: [...s.items] }));
          groups.forEach((g) => {
            const ex = services.find((s) => s.key === g.key);
            if (ex) {
              const have = new Set(ex.items.map((it) => it.name));
              const fresh = g.items.filter((it) => !have.has(it.name));
              ex.items = [...ex.items, ...fresh];
              if (g.note && !(ex.note || "").includes(g.note)) ex.note = (ex.note ? ex.note + "\n" : "") + g.note;
            } else {
              services.push(g);
            }
          });
          return { ...o, services };
        }),
      };
    });
    setDirty(true);
    setImportMsg(added === 0
      ? `${floorName || "The survey"} is already imported — nothing new to add.`
      : `${auto ? "Auto-imported" : "Imported"} ${added} item${added !== 1 ? "s" : ""} from ${floorName || "the survey"}.`);
  }

  async function save() {
    setBusy(true); setErr(null);
    const r = await saveProposalDraftAction(accessId, { payload, taxRate: +taxRate, depositPct: +depositPct });
    setBusy(false);
    if (r?.error) {
      if (/Unauthorized|authenticated/i.test(r.error)) {
        setAuthBlocked(true);
        setErr("Log in to save — PIN preview can't write changes.");
      } else setErr(r.error);
      return false;
    }
    adopt(r.proposal);
    setSavedAt(new Date());
    return true;
  }
  async function send() {
    setConfirmSend(false);
    if (dirty && !(await save())) return;
    setBusy(true); setErr(null);
    const r = await sendProposalAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
    showToast("Proposal submitted to customer");
  }
  async function resolveFlag(itemId, label) {
    const r = await resolveFlagAction(accessId, itemId);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
    showToast(label === "discard" ? "Request discarded" : "Marked done");
  }
  async function revise() {
    setBusy(true); setErr(null);
    const r = await reviseProposalAction(accessId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    adopt(r.proposal);
  }

  const totals = optionTotals(opt, taxRate, payload.discount, depositPct, payload.pcp_credit);
  const disc = payload.discount || { type: "flat", value: 0 };
  function setDiscount(patch) { patchPayload({ ...payload, discount: { ...disc, ...patch } }); }
  function setPcp(v) { patchPayload({ ...payload, pcp_credit: Math.max(0, +v || 0) }); }

  return (
    <div className="prop-card">
      <div className="prop-head">
        <span className="prop-title">Proposal builder{meta?.version ? ` · v${meta.version}` : ""}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={`prop-status ${status === "changes_requested" ? "changes" : status}`}>
            {status === "draft" && (dirty ? "Draft · unsaved" : "Draft")}
            {status === "sent" && `Sent ${meta?.sent_at ? meta.sent_at.slice(0, 16) : ""}${meta?.sent_by_name ? ` by ${meta.sent_by_name}` : ""}`}
            {status === "changes_requested" && "Changes requested"}
            {status === "accepted" && `Accepted · Option ${meta?.selected_option || ""}`}
          </span>
          {!readOnly && (
            <button className="prop-gear" title="Default pricing (all services)" onClick={() => setPricingOpen("__all__")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          )}
        </div>
      </div>

      {status === "changes_requested" && meta?.change_note && (
        <div className="prop-note-strip">Customer: “{meta.change_note}”</div>
      )}
      {err && <div className="prop-note-strip">{err}</div>}
      {importMsg && <div className="prop-svc-sub">{importMsg}</div>}

      {/* Option tabs */}
      <div className="prop-tabs">
        {payload.options.map((o) => (
          <button key={o.id} className={`prop-tab${o.id === activeOpt ? " on" : ""}`} onClick={() => setActiveOpt(o.id)}>
            {o.id} · {o.name}
            {!readOnly && payload.options.length > 1 && o.id === activeOpt && (
              <span onClick={(e) => { e.stopPropagation(); removeOption(o.id); }} title="Remove option" style={{ opacity: .75 }}>✕</span>
            )}
          </button>
        ))}
        {!readOnly && payload.options.length < 3 && (
          <button className="prop-tab prop-tab-add" onClick={addOption}>+ Option</button>
        )}
      </div>

      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={opt.name}
            maxLength={60}
            onChange={(e) => patchOption({ name: e.target.value })}
            style={{ height: 32, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", fontSize: ".82rem", fontWeight: 700, fontFamily: "inherit", outline: "none", maxWidth: 260 }}
          />
          {surveyFloors.length > 0 && (
            <FloorImportPicker floors={surveyFloors} onImport={(indices) => importSurvey(false, indices)} />
          )}
        </div>
      )}

      {/* Services */}
      {opt.services.map((s, i) => (
        <ProposalItemsEditor
          key={s.key + i}
          svc={s}
          showCost={showCost}
          readOnly={readOnly}
          customerFlags={meta?.customerFlags}
          onResolveFlag={resolveFlag}
          onChange={(next) => patchOption({ services: opt.services.map((x, j) => (j === i ? next : x)) })}
          onRemove={() => patchOption({ services: opt.services.filter((_, j) => j !== i) })}
          onOpenPricing={readOnly ? undefined : setPricingOpen}
          priceBookVersion={priceBookVersion}
        />
      ))}
      {opt.services.length === 0 && <div className="prop-empty">No services yet — import the survey or add one below.</div>}

      {!readOnly && (
        <div className="prop-tabs">
          <select defaultValue="" onChange={(e) => { addService(e.target.value); e.target.value = ""; }}
                  style={{ height: 30, border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-soft)", fontSize: ".76rem", fontWeight: 700, fontFamily: "inherit", padding: "0 8px", outline: "none" }}>
            <option value="" disabled>+ Service…</option>
            {PROPOSAL_SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      )}


      {/* Totals */}
      <div className="prop-totals">
        <div className="prop-trow"><span>Subtotal</span><b>{money(totals.sub)}</b></div>
        {(!readOnly || totals.discount > 0) && (
          <div className="prop-trow">
            <span>Discount</span>
            {readOnly ? <b>−{money(totals.discount)}</b> : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className={`prop-tax-btn${disc.type === "flat" ? " on" : ""}`} onClick={() => setDiscount({ type: "flat" })}>$</button>
                <button type="button" className={`prop-tax-btn${disc.type === "pct" ? " on" : ""}`} onClick={() => setDiscount({ type: "pct" })}>%</button>
                <input className="tin" type="number" min="0" step="0.01" value={disc.value || 0} onChange={(e) => setDiscount({ value: e.target.value })} />
                {totals.discount > 0 && <b style={{ color: "var(--green,#1c8a45)", whiteSpace: "nowrap" }}>−{money(totals.discount)}</b>}
              </span>
            )}
          </div>
        )}
        {(!readOnly || totals.pcpCredit > 0) && (
          <div className="prop-trow">
            <span>PCP Credit</span>
            {readOnly ? <b>−{money(totals.pcpCredit)}</b> : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input className="tin" type="number" min="0" step="0.01" value={payload.pcp_credit || 0} onChange={(e) => setPcp(e.target.value)} />
                {totals.pcpCredit > 0 && <b style={{ color: "var(--green,#1c8a45)", whiteSpace: "nowrap" }}>−{money(totals.pcpCredit)}</b>}
              </span>
            )}
          </div>
        )}
        <div className="prop-trow">
          <span>Tax %</span>
          {readOnly ? <b>{taxRate}%</b> : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" className={`prop-tax-btn${+taxRate === 6.625 ? " on" : ""}`}
                      onClick={() => { setTaxRate(6.625); setDirty(true); }}>NJ</button>
              <button type="button" className={`prop-tax-btn${+taxRate === 8.875 ? " on" : ""}`}
                      onClick={() => { setTaxRate(8.875); setDirty(true); }}>NY</button>
              <input className="tin" type="number" min="0" max="30" step="0.01" value={taxRate}
                     onChange={(e) => { setTaxRate(e.target.value); setDirty(true); }} />
            </span>
          )}
        </div>
        <div className="prop-trow grand"><span>Total</span><b>{money(totals.grand)}</b></div>
        <div className="prop-trow">
          <span>Deposit %</span>
          {readOnly ? <b>{depositPct}%</b> :
            <input className="tin" type="number" min="0" max="100" value={depositPct}
                   onChange={(e) => { setDepositPct(e.target.value); setDirty(true); }} />}
        </div>
        <div className="prop-trow"><span>Deposit due</span><b>{money(totals.deposit)}</b></div>
      </div>

      {/* Actions — drafts auto-save (debounced); the status text replaces a manual Save */}
      <div className="prop-actions">
        {!readOnly ? (
          <>
            <span className={`prop-savestat${busy || dirty ? " saving" : ""}`}>
              {authBlocked ? "" : busy ? "Saving…" : dirty ? "Unsaved changes…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
            {confirmSend ? (
              <>
                <span className="prop-svc-sub" style={{ marginLeft: "auto" }}>Are you sure you want to submit?</span>
                <button className="prop-mini gold" disabled={busy} onClick={send}>Submit</button>
                <button className="prop-mini" onClick={() => setConfirmSend(false)}>Cancel</button>
              </>
            ) : (
              <button className="prop-mini gold" disabled={busy} onClick={() => setConfirmSend(true)} style={{ marginLeft: "auto" }}>Submit</button>
            )}
          </>
        ) : (
          <button className="prop-mini gold" disabled={busy} onClick={revise} style={{ marginLeft: "auto" }}>Revise</button>
        )}
      </div>

      {toast && (
        <div className="prop-toast">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}

      {pricingOpen && (
        <PricingDefaults
          scopeKey={pricingOpen === "__all__" ? null : pricingOpen}
          onClose={() => setPricingOpen(null)}
          onSaved={() => {
            setPricingOpen(null);
            setPriceBookVersion((v) => v + 1); // refreshes every service's quick-add catalog
            setImportMsg("Pricing saved — applies to new imports & items, not what's already placed.");
          }}
        />
      )}
    </div>
  );
}

// Floor-plan import as a checkbox dropdown: check any number of floor plans, then Import
// pulls all of them in at once (rather than one floor per pick, as the old single-select did).
function FloorImportPicker({ floors, onImport }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  function toggle(idx) {
    setChecked((s) => {
      const next = new Set(s);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }
  function doImport() {
    if (!checked.size) return;
    onImport([...checked]);
    setChecked(new Set());
    setOpen(false);
  }

  return (
    <div className="prop-fp" ref={boxRef}>
      <button type="button" className="prop-fp-btn" onClick={() => setOpen((o) => !o)}>
        ⭳ Import from floor plan{checked.size ? ` (${checked.size})` : ""}
      </button>
      {open && (
        <div className="prop-fp-menu">
          {floors.map((f) => (
            <label key={f.index} className="prop-fp-opt">
              <input type="checkbox" checked={checked.has(f.index)} onChange={() => toggle(f.index)} />
              <span>{f.name}</span>
              <span className="prop-fp-count">{f.count} item{f.count !== 1 ? "s" : ""}</span>
            </label>
          ))}
          <div className="prop-fp-acts">
            <button type="button" className="prop-fp-all" onClick={() => setChecked(new Set(floors.map((f) => f.index)))}>Select all</button>
            <button type="button" className="prop-fp-go" disabled={!checked.size} onClick={doImport}>
              Import{checked.size ? ` (${checked.size})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
