// Section O — one-time LEGACY PROJECT migration onto the new 3-stage model (Consulting · Install ·
// Completion). PURE: no DB, no React. `scripts/migrate-legacy-projects.mjs` assembles a snapshot per
// project from lib/db.js and hands it here; this module decides nothing on its own authority — it
// recomputes through the EXISTING resolvers and reports the evidence:
//
//   facts ........ db.buildStageFacts (published proposal only — never the working draft)
//   status ....... project-status.resolveProjectStatus (over stageFloorFacts)
//   percent ...... staff-hub.simpleProgressPct / progressFromFacts
//   3 steps ...... staff-hub.threeStepForState
//   …all four reached through ONE call: my-projects-card.buildMyProjectCard (see viewAt below).
//   stage ........ stage-flow.gateThroughIndex (the real gate) + STATE_STAGE_FLOOR (below)
//
// There is NO fifth percent formula and no second status engine here. What this module adds is the
// legacy-specific judgement: how strong is the evidence, and is it strong enough to move a project
// at all — or does a human have to decide?
//
// THE WRITE SET IS DELIBERATELY TINY. Only two fields are ever written, and only under --apply:
//   • projects.stage      — the stale column every legacy surface reads (the actual defect)
//   • projects.completed_at — ONLY when install work AND the full balance are both recorded, and a
//                            real completion date exists. Never "now", never guessed.
// Percent and status are DERIVED at render time, so they are never stored (that would fork the one
// canonical status). Fixing the stage column is what makes the derived pair correct.
//
// Forward-only, always: evidence may move a project LATER, never earlier. A project sitting ahead of
// its own evidence is reported for a human, never rewound — the stage it sits at may be the truth and
// the missing record the bug.
import { MASTER_ORDER, gateThroughIndex, blockingReqs } from "./stage-flow.js";
import { CUSTOMER_STATUS, ADMIN_STATUS } from "./project-status.js";
import { buildMyProjectCard } from "./my-projects-card.js";
import { eligibleForCustomerPortalV2 } from "./customer-portal.js";
import { stageLabel } from "./spec.js";

const rank = (s) => MASTER_ORDER.indexOf(s);
const normStage = (s) => (MASTER_ORDER.includes(s) ? s : "inquiry");

// The canonical STATE (project-status.resolveProjectStatus) → the earliest MASTER stage that state
// implies. This is the master-stage twin of staff-hub's STATE_TO_PHASE (the 3-step rail map) and it
// maps 1:1 onto it: the two scheduled states and in-progress are the Install phase, awaiting-final
// is wrap, complete is completion. It is a projection of the state, not a second status engine —
// earlier states are deliberately absent because the gate walk already resolves the Consulting
// chain from the same facts (and AWAITING_DEPOSIT must stay at approval_deposit, where the money is
// owed). CLOSED_NOT_COMPLETED has no forward position and never lifts.
const STATE_STAGE_FLOOR = {
  READY_TO_SCHEDULE: "schedule", INSTALL_SCHEDULED: "schedule", INSTALL_IN_PROGRESS: "install",
  AWAITING_FINAL_PAYMENT: "payment", COMPLETE: "completion",
};
// The gate walk is capped at `schedule`: inquiry→approval_deposit are exactly the stages the server
// already auto-advances from these same facts (stage-flow.AUTO_STAGES). Field-work stages (install,
// qc) are never entered by a requirement sweep — only by the fact-driven state lift below, which
// needs a recorded install/QC/payment fact to fire. One rule, both halves already shipped.
const GATE_CAP = rank("schedule");
// …and a HARD second cap at `site_survey` for any project with no published proposal. The survey
// requirements are satisfied by "nothing to approve", so a bare lead with a survey date otherwise
// sweeps straight into the Proposal stage — where `customer-action.customerTodo` (keyed on the stage
// column, not on the existence of a document) would tell the customer "a new proposal is ready —
// review & accept" for a proposal that does not exist. A migration must not manufacture that.
const NO_PROPOSAL_CAP = rank("site_survey");

// ---------------------------------------------------------------------------------------------
// Trap 2 — "signed" is three different things. `proposal_signed` in buildStageFacts is true only
// while the stored signature still binds to the published content's fingerprint; a legacy row with
// no stored fingerprint is matched by NAME ONLY. So an unsigned-looking fact can mean:
//   none            — genuinely never signed
//   bound           — signed, fingerprint matches the published payload (contract intact)
//   drifted         — signed, fingerprint does NOT match (the payload moved after signing)
//   legacy_unbound  — signed before fingerprint binding existed; trusted by name, unverifiable
// A drifted signature is somebody's contract. The migration never resolves it in either direction.
// ---------------------------------------------------------------------------------------------
export const SIG = { NONE: "none", BOUND: "bound", DRIFTED: "drifted", LEGACY_UNBOUND: "legacy_unbound" };

export function classifySignature(pub) {
  if (!pub || !pub.signed_name) return SIG.NONE;
  if (!pub.signed_fingerprint) return SIG.LEGACY_UNBOUND;
  return pub.signed_fingerprint === pub.fingerprint_now ? SIG.BOUND : SIG.DRIFTED;
}

export const SIG_TEXT = {
  [SIG.NONE]: "no signature on the published proposal",
  [SIG.BOUND]: "signed, and the signature still binds to the published payload (fingerprint matches)",
  [SIG.DRIFTED]: "SIGNED BUT DRIFTED — the published payload no longer matches the signed fingerprint, so the facts read it as unsigned",
  [SIG.LEGACY_UNBOUND]: "signed before fingerprint binding (no fingerprint stored) — trusted by signer name only, cannot be verified",
};

// Trap 3 — deposit_recorded (confirmed money) and deposit_submitted (anything, incl. pending) are
// NOT interchangeable. Read from the RAW facts, never the stage-floored ones: flooring sets both
// true for any project past `schedule`, which would launder a pending payment into a paid one.
export function depositEvidence(rawFacts = {}) {
  if (rawFacts.deposit_recorded) return { kind: "confirmed", text: "deposit CONFIRMED (a payment row with status=confirmed)" };
  if (rawFacts.deposit_submitted) return { kind: "pending", text: "a payment exists but is NOT confirmed — pending, which is not paid" };
  return { kind: "none", text: "no payments recorded" };
}

// ---------------------------------------------------------------------------------------------
// One render of a project AT a given master stage, through the shipped customer/staff resolvers.
// Called twice per project: once pinned to the stored stage (what the portal shows today) and once
// pinned to the proposed stage (what it would show after the migration). Same code path both times,
// so a difference in the report can only come from the stage, never from two formulas.
// ---------------------------------------------------------------------------------------------
function viewAt(snap, stageKey, { completedAt = undefined } = {}) {
  const p = { ...snap.project, stage: stageKey };
  if (completedAt !== undefined) p.completed_at = completedAt;
  const facts = { ...(snap.facts || {}), stage: stageKey };
  if (completedAt !== undefined) facts.completion_docs = !!completedAt;
  const card = buildMyProjectCard({
    project: p,
    facts,
    events: snap.events || [],
    fin: snap.fin || null,
    proposalStarted: !!snap.proposalStarted,
    // Write-safe: `now` only decides which appointments still count as upcoming, which moves the
    // rendered state/percent (INSTALL_SCHEDULED vs READY_TO_SCHEDULE) but never the WRITE —
    // STATE_STAGE_FLOOR maps both of those states to `schedule`, and no time-sensitive state maps to
    // a stage the capped gate walk could reach. So a clock difference can change the report's wording,
    // never which row is written or what it is written to.
    now: snap.now || Date.now(),
  });
  return {
    stage: stageKey,
    stageLabel: stageLabel(stageKey),
    pct: card.pct,
    state: card.state,
    customerLabel: (CUSTOMER_STATUS[card.state] || {}).label || card.state,
    adminLabel: (ADMIN_STATUS[card.state] || {}).label || card.state,
    step: `${card.step.index} of ${card.step.total} · ${card.step.label}`,
    chip: card.status,          // { key, label, detail } — the My Projects indicator
    todo: card.todo ? card.todo.cta : null,
  };
}

// A completion date is validated by ONE shared calendar check (lib/completion-date.js) — the same one
// the admin override uses, so the migration and the hand-set path cannot disagree about what a legal
// warranty start looks like. An unparseable (or impossible) date is not "close enough": it is rejected
// and the project becomes a human decision, because db.markProjectCompleted would otherwise fall back
// to TODAY and start the warranty clock today on a job that finished months ago. Local history happens
// to be "YYYY-MM-DD HH:MM:SS"; the legacy production rows this migration exists for are unverified.
export { isStampableCompletionDate } from "./completion-date.js";
import { isStampableCompletionDate } from "./completion-date.js";

// Completion stamp (projects.completed_at). Only real recorded facts qualify: the install work is
// closed out AND the full published balance is collected. `completionDate` is supplied by the caller
// from real history (last confirmed payment / the completion stage transition) — never Date.now().
export function completionStamp(snap) {
  const f = snap.facts || {};
  if (snap.project?.completed_at) return { stamp: null, reason: "already stamped" };
  const workDone = !!f.install_done;
  const paid = !!f.final_balance_paid;
  if (!workDone || !paid) return { stamp: null, reason: `not stampable (install_done=${workDone}, final_balance_paid=${paid})` };
  if (!snap.completionDate) return { stamp: null, reason: "work + money are complete but no dated evidence exists to stamp with" };
  if (!isStampableCompletionDate(snap.completionDate)) {
    return { stamp: null, reason: `work + money are complete but the only dated evidence (${JSON.stringify(String(snap.completionDate).slice(0, 40))}) is not a YYYY-MM-DD date — stamping it would make the database fall back to TODAY and start the warranty clock from today` };
  }
  return { stamp: snap.completionDate, reason: "install closed out + full balance collected" };
}

// ---------------------------------------------------------------------------------------------
// The per-project plan. Verdicts: skipped | ok | change | manual.
// ---------------------------------------------------------------------------------------------
export function planProject(snap) {
  const p = snap.project || {};
  const raw = snap.facts || {};
  const stored = normStage(p.stage);
  const id = p.access_id;
  const title = String(p.company_name || p.customer || "").trim();
  const base = {
    accessId: id, title, storedStage: stored,
    demo: /^\[JOURNEY-TEST\]/.test(String(p.customer || "")),
    // Row-level flags the report needs to answer "why isn't this one Completed?" without a second DB trip.
    completedAt: p.completed_at || null, category: p.category || null, statusText: p.status || null,
    internalJob: !!p.internal_job,
    finalPaid: !!(snap.facts || {}).final_balance_paid,
    hasContract: !!snap.fin?.hasContract,
  };

  // Type C (service calls) keep their own gateway — the 3-stage install model does not describe them.
  if (!eligibleForCustomerPortalV2(p)) {
    return { ...base, verdict: "skipped", skipReason: `project_type ${String(p.project_type || "?").toUpperCase()} (service call) — not on the 3-stage install model`, evidence: [], needsHuman: [], notes: [] };
  }

  const sig = classifySignature(snap.published);
  const dep = depositEvidence(raw);
  const current = viewAt(snap, stored);
  // A closed record is never written to, in either direction (see CLOSED_NO_WRITE below).
  const closed = !!p.lost_at || p.category === "closed" || String(p.status || "").toLowerCase() === "closed";

  // --- where may this project legitimately sit? (three existing devices, forward-only) ---
  // buildStageFacts reads the PUBLISHED proposal only, so a non-null proposal_status is proof the
  // customer actually received a document; a staff draft deliberately counts for nothing here.
  const hasPublished = !!raw.proposal_status;
  const cap = Math.min(GATE_CAP, hasPublished ? GATE_CAP : NO_PROPOSAL_CAP);
  // Signing the agreement (or accepting an option) is a LATER and STRONGER customer acceptance than
  // the site-survey sign-off, so it supersedes a missing survey approval for the purposes of placing
  // the stage. It is the same rule `stageFloorFacts` applies once a project is past `proposal`, taken
  // off the stale stage axis and put on the evidence axis — and it is the section-O complaint itself:
  // a signed, paid job still being told "approve site survey". NOTHING is written about the survey;
  // this only decides where the project sits.
  // The `inquiry` requirement ("a survey appointment is booked", i.e. projects.date) is superseded by
  // ANY published proposal: a document the customer has already received is proof the engagement went
  // past booking a visit, and many legacy/phone-quoted rows simply never had a date written. Without
  // this the evidence walk stops dead at Inquiry for a project with a sent proposal, and the report
  // then claims "the facts only support Inquiry" next to "proposal sent" — a contradiction.
  // `gateFacts` feeds ONLY the gate walks — never viewAt / the resolvers — so none of this can leak
  // into the rendered status, and nothing about the survey or the date is written.
  const contractAccepted = !!raw.proposal_signed || raw.proposal_status === "accepted";
  const supersedesSurvey = contractAccepted && !raw.survey_accepted;
  const supersedesDate = !raw.date && !raw.survey_skipped && (hasPublished || contractAccepted);
  const gateFacts = (supersedesSurvey || supersedesDate)
    ? { ...raw, survey_accepted: raw.survey_accepted || contractAccepted, date: raw.date || (supersedesDate ? "proposal-published" : raw.date) }
    : raw;
  const gateRaw = gateThroughIndex(gateFacts, snap.assignments || [], MASTER_ORDER, Math.max(0, rank(stored)));
  const gateIdx = Math.max(Math.min(cap, gateRaw), Math.max(0, rank(stored)));
  const gated = MASTER_ORDER[gateIdx];
  const capHeld = gateRaw > gateIdx;
  // The state lift must NOT be read off the stored stage: resolveProjectStatus treats stage qc /
  // payment / completion as proof the field work is done, so feeding it a stale stage would let the
  // column justify itself (a project parked at `qc` with no records would "prove" it reached Payment).
  // So resolve the state at the stage the EVIDENCE alone supports, walking the gate from zero. The
  // lift then fires only on a real fact — completed_at, install_done, a collected balance.
  // Resolved through viewAt (i.e. buildMyProjectCard) so the facts→resolver field mapping stays in
  // the ONE place that owns it — `completion_docs`/`final_balance_paid` are named differently on the
  // two sides, and re-typing that mapping here would silently read a finished job as unfinished.
  const gateFromZero = gateThroughIndex(gateFacts, snap.assignments || [], MASTER_ORDER, 0);
  const evidenceIdx = Math.min(cap, gateFromZero);
  const evidenceStage = MASTER_ORDER[evidenceIdx];
  const capHeldFromZero = gateFromZero > evidenceIdx;
  const evidenceState = viewAt(snap, evidenceStage).state;
  const lifted = STATE_STAGE_FLOOR[evidenceState] || evidenceStage;
  const proposedStage = [stored, gated, lifted].reduce((a, b) => (rank(b) > rank(a) ? b : a), stored);

  const stamp = completionStamp(snap);
  const proposed = viewAt(snap, proposedStage, stamp.stamp ? { completedAt: stamp.stamp } : {});

  // --- evidence, in lifecycle order; every line is a real stored fact ---
  const evidence = [];
  // projects.date — the survey-visit booking the `inquiry` requirement checks. It is NOT the schedule
  // blob (the "Appointments" line below), and a report that omits it reads as a contradiction: "every
  // requirement of Inquiry is met" next to "no appointments on file".
  evidence.push(`Survey date (projects.date, what the Inquiry step checks): ${p.date || raw.date || "EMPTY"}${supersedesDate ? " — superseded for stage placement by the published proposal" : ""}`);
  if (raw.survey_skipped) evidence.push("Survey: explicitly skipped (survey_skipped_at) — waives the survey requirements");
  else if (!snap.surveyHasData) evidence.push("Survey: no survey data on file — nothing to approve (the gate treats that as satisfied)");
  else if (raw.survey_accepted) evidence.push(`Survey: submitted and APPROVED, approval fingerprint current${snap.surveyApprovedAt ? ` (${snap.surveyApprovedAt})` : ""}`);
  else if (raw.survey_submitted) evidence.push("Survey: submitted, NOT approved (or the approval no longer matches the survey content)");
  else evidence.push("Survey: has data, never submitted for approval");

  if (!snap.published) evidence.push("Proposal: nothing published (no sent_at) — no contract exists" + (snap.proposalStarted ? "; a staff DRAFT exists and is deliberately ignored (published-only rule)" : ""));
  else {
    evidence.push(`Proposal: published v${snap.published.version} · status ${snap.published.status}${snap.published.sent_at ? ` · sent ${snap.published.sent_at}` : ""}`);
    evidence.push(`Signature: ${SIG_TEXT[sig]}${snap.published.signed_name ? ` · signer "${snap.published.signed_name}"${snap.published.signed_at ? ` on ${snap.published.signed_at}` : ""}` : ""}`);
    evidence.push(`Facts read proposal_signed=${!!raw.proposal_signed}`);
  }

  evidence.push(`Payments: ${dep.text}${snap.paymentsSummary ? ` · ${snap.paymentsSummary}` : ""}`);
  if (snap.fin?.hasContract) evidence.push(`Money: total ${snap.fin.total} · paid ${snap.fin.paid} · balance ${snap.fin.balance}${snap.fin.paidInFull ? " · PAID IN FULL" : ""}`);
  evidence.push(`Appointments: ${snap.apptSummary || "none on the schedule blob"}`);
  evidence.push(`Install: checklist ${raw.install_done ? "complete, no open issues" : "not complete"} · photos ${raw.install_photos ? "present" : "none"} · customer confirmed appt ${!!raw.install_confirmed}`);
  evidence.push(`Closeout: QC passed ${!!raw.qc_passed} · manager sign-off ${!!raw.qc_manager_approved} · customer sign-off ${!!raw.qc_customer_signed} · completion stamp ${p.completed_at || "none"}`);
  evidence.push(`Completion stamp decision: ${stamp.stamp ? `WOULD WRITE ${stamp.stamp} (${stamp.reason})` : `not written — ${stamp.reason}`}${snap.completionDateSource ? ` · dated evidence from ${snap.completionDateSource}` : ""}`);
  if (closed) evidence.push(`Closed: ${p.lost_at || "(no lost_at)"}${p.lost_reason ? ` — ${p.lost_reason}` : ""}${p.lost_kind ? ` (${p.lost_kind})` : ""}${p.lost_prev_stage ? ` · stage at close ${p.lost_prev_stage}` : ""}${p.status ? ` · status "${p.status}"` : ""}${p.category ? ` · category "${p.category}"` : ""}`);

  // --- why the stage moves (or doesn't) ---
  const notes = [];
  if (proposedStage !== stored) {
    if (rank(gated) > rank(stored)) notes.push(`Gate walk: every enforceable requirement of ${stageLabel(stored)} is met, so the project may sit at ${stageLabel(gated)} (stage-flow.gateThroughIndex, capped at Scheduling)`);
    if (rank(lifted) > rank(stored)) notes.push(`State lift: on the evidence alone the status resolves to ${evidenceState}, which can only be reached at ${stageLabel(lifted)} or later (resolveProjectStatus, evaluated at the evidence-supported stage — never at the stored one)`);
  }
  if (stamp.stamp) notes.push(`Completion stamp: would write completed_at=${stamp.stamp} — ${stamp.reason}`);
  if (supersedesSurvey) notes.push("Survey approval superseded: the customer signed/accepted the proposal, which is a later and stronger acceptance than the survey sign-off. The survey record itself is NOT touched — this only affects where the stage sits (it is why this project stops being told to \"approve site survey\").");
  if (capHeld) notes.push(`Held at ${stageLabel(gated)}: the requirement sweep would go further (${stageLabel(MASTER_ORDER[gateRaw])}), but ${hasPublished ? "field-work stages are never entered by a requirement sweep" : "NO proposal has ever been published — moving into the Proposal stage would make the portal announce a document that does not exist"}`);

  // --- the data cannot decide: a human must ---
  const needsHuman = [];
  if (sig === SIG.DRIFTED) {
    needsHuman.push({ code: "signature_drift", text: `The published proposal v${snap.published.version} is signed by "${snap.published.signed_name}" but its payload no longer matches the signed fingerprint. The facts therefore read it as UNSIGNED. Migrating either way would decide a contract question: re-send for signature, or confirm the signed snapshot is the contract. Left untouched.` });
  }
  // `evidenceIdx` — NOT a second, uncapped walk — is "how far the evidence alone reaches". Using the
  // uncapped walk here made the report contradict itself: it ignored the no-published-proposal cap
  // (telling a project its facts "support Proposal" while the same plan refused to move it there) and
  // ignored the superseded booking date (telling a project with a sent v4 proposal that its facts
  // "only support Inquiry"). One number, used for the decision and for the explanation.
  if (rank(stored) > evidenceIdx && !raw.install_done && !p.completed_at && rank(lifted) <= rank(stored)) {
    const blockers = blockingReqs(evidenceStage, gateFacts, snap.assignments || []);
    // Say WHICH kind of thing is missing: a date/booking (a record nobody signs) or a sign-off.
    const missing = blockers.length
      ? blockers.map((r) => `${r.label} — ${/scheduled|confirmed/i.test(r.label) ? "a missing date/appointment record" : `a missing ${r.who} sign-off`}`).join("; ")
      : (capHeldFromZero && !hasPublished)
        ? "no proposal has ever been published, so nothing supports a stage beyond Site Survey"
        : "n/a";
    needsHuman.push({ code: "stage_ahead_of_evidence", text: `Stored stage is ${stageLabel(stored)}, but the recorded evidence only reaches ${stageLabel(evidenceStage)} — ${missing}. NOT rewound (the stage may be right and the record the thing that's missing). A human must confirm the stage or record the missing fact.` });
  }
  // `internal_job` rows are exempt: an internal / legacy job has no customer sale, so the work order
  // skips the sign+deposit gate and no proposal is ever expected to exist (db.js: internal_job). They
  // also have no customer portal to mislead. Documented in the report so the exemption is reviewable.
  if (!hasPublished && rank(stored) >= rank("proposal") && !p.internal_job) {
    needsHuman.push({ code: "stage_claims_proposal_without_one", text: "The stage column already sits at Proposal or later, but NO proposal has ever been published. The customer portal's todo is keyed on the stage column (`customer-action.customerTodo`), so this project tells the customer \"a new proposal is ready — review & accept\" for a document that does not exist. A forward-only migration cannot fix it: either send the proposal, or move the stage back by hand (admin override)." });
  }
  if (dep.kind === "pending" && rank(proposedStage) >= rank("schedule")) {
    needsHuman.push({ code: "deposit_pending_past_gate", text: "The project would sit past the deposit gate, but the only payment on file is PENDING (never confirmed). Confirm or void that payment before the stage is trusted." });
  }
  // "Finished but unstamped" needs real closeout evidence: install work or a customer QC signature,
  // or money collected in full on a job that at least reached the install phase. Money alone, on a
  // job that never got to install, is a prepayment — not a finished job.
  const looksFinished = raw.install_done || raw.qc_customer_signed || (raw.final_balance_paid && rank(stored) >= rank("install"));
  if (!stamp.stamp && looksFinished && !p.completed_at) {
    needsHuman.push({ code: "completion_stamp_missing", text: `This job looks finished (install_done=${!!raw.install_done}, customer QC=${!!raw.qc_customer_signed}, balance paid=${!!raw.final_balance_paid}) but projects.completed_at was never written — ${stamp.reason}. The migration will not invent a completion date (it starts the warranty clock). Use the admin override to set Completed, or record the missing fact.` });
  }
  if (closed && (raw.install_done || raw.final_balance_paid)) {
    needsHuman.push({ code: "closed_but_evidence_complete", text: "The project is CLOSED yet carries completed install/payment evidence. Reopen-and-complete or leave closed is a business call." });
  }
  // A signature on a proposal whose published status is `changes_requested` or `declined`: the facts
  // treat the signature as acceptance, which may be older than the customer's change request. Which
  // one is the contract is not a question the data answers.
  if (raw.proposal_signed && (raw.proposal_status === "changes_requested" || raw.proposal_status === "declined")) {
    needsHuman.push({ code: "signed_but_status_contradicts", text: `The published proposal is signed yet its status is \`${raw.proposal_status}\`. The facts read that as accepted (a signature implies acceptance), but the customer's later request/decline may be the real position. A human must say which is the contract.` });
  }

  // CLOSED_NO_WRITE — a closed/lost record is never written forward. Advancing the stage of a record
  // somebody deliberately closed is a write to a dead row: it can resurrect it in pipeline counts and
  // it destroys the stage it was closed AT (projects.lost_prev_stage is the only other copy). If it
  // carries completion evidence it is already a human decision above; otherwise it is simply left alone.
  const closedNoWrite = closed && proposedStage !== stored;
  if (closedNoWrite) notes.push(`Closed record — NO write. The evidence would place it at ${stageLabel(proposedStage)}, but this project is closed; reopen it first if that is wrong.`);

  // Weak evidence: the move rests on a pre-binding signature that cannot be verified.
  const weak = sig === SIG.LEGACY_UNBOUND && !!raw.proposal_signed;
  const wouldWrite = !closed && (proposedStage !== stored || !!stamp.stamp);
  const verdict = needsHuman.length ? "manual" : wouldWrite ? "change" : "ok";
  // Does the move change anything a human SEES? Percent, status and the 3-step rail are derived from
  // the facts (the rail from the state alone), so a stale stage column often renders identically — the
  // fix still matters, because the gate, the auto-advance, the staff deck and the legacy portal all read
  // the column. Splitting the two keeps the real mappings visible instead of buried in housekeeping.
  // `todo` is in the comparison because it is the customer's ACTION PROMPT (the Sign / Pay / Approve
  // CTA). A row whose only change is which action it asks for is very much a visible change.
  const visible = !!stamp.stamp || current.pct !== proposed.pct || current.state !== proposed.state ||
    current.step !== proposed.step || current.chip?.label !== proposed.chip?.label ||
    current.todo !== proposed.todo;

  return {
    ...base,
    verdict,
    signature: sig,
    deposit: dep.kind,
    current,
    proposed,
    proposedStage,
    write: verdict === "change" ? { stage: proposedStage !== stored ? proposedStage : null, completedAt: stamp.stamp || null } : null,
    visible,
    weak,
    closed,
    stampReason: stamp.reason,
    evidence,
    notes,
    needsHuman,
  };
}

export function summarize(plans) {
  const by = (v) => plans.filter((x) => x.verdict === v);
  const manual = by("manual");
  const reasons = {};
  manual.forEach((p) => p.needsHuman.forEach((h) => { reasons[h.code] = (reasons[h.code] || 0) + 1; }));
  return {
    scanned: plans.length,
    change: by("change").length,
    changeVisible: by("change").filter((p) => p.visible).length,
    changeStageOnly: by("change").filter((p) => !p.visible).length,
    ok: by("ok").length,
    manual: manual.length,
    skipped: by("skipped").length,
    weak: plans.filter((x) => x.weak).length,
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------
// The admin override's authorisation decision, as a pure function so a test can drive the REAL gate
// instead of a copy of it. `can` is injected (the caller passes lib/roles.can) to keep this module
// free of a role-table import it would otherwise only use once. Returns null when allowed.
//   tok — { role, viaPin, accessId } resolved server-side from the session / project-PIN cookie.
// ---------------------------------------------------------------------------------------------
export function overrideRefusal(tok, accessId, can) {
  if (!tok || !can(tok.role, "legacy.override")) return "Only an admin can set a legacy project's stage by hand.";
  if (tok.viaPin && String(tok.accessId) !== String(accessId)) return "Not your project.";
  return null;
}

// ---------------------------------------------------------------------------------------------
// The write step. Dry run (the default, and the only mode anyone has run) performs NO writes at
// all — not a stage, not a stamp, not a log row. The writers are INJECTED so a test can prove the
// dry run touches nothing.
// ---------------------------------------------------------------------------------------------
export function applyMigration(plans, { apply = false, writeStage, stampCompleted, log } = {}) {
  const planned = plans.filter((p) => p.verdict === "change" && p.write);
  if (!apply) return { applied: false, writes: [], planned: planned.length };
  const writes = [];
  for (const p of planned) {
    if (p.write.stage) { writeStage(p.accessId, p.write.stage); writes.push({ accessId: p.accessId, field: "stage", value: p.write.stage }); }
    if (p.write.completedAt) {
      // Last line of defence: db.markProjectCompleted silently stamps TODAY for anything that isn't
      // YYYY-MM-DD, so refuse rather than start a warranty clock on the wrong day. planProject should
      // never produce one of these (completionStamp validates); this makes it impossible.
      if (!isStampableCompletionDate(p.write.completedAt)) throw new Error(`refusing to stamp ${p.accessId}: completion date ${JSON.stringify(p.write.completedAt)} is not a real YYYY-MM-DD date`);
      stampCompleted(p.accessId, p.write.completedAt); writes.push({ accessId: p.accessId, field: "completed_at", value: p.write.completedAt });
    }
    if (log) log(p.accessId, `Legacy migration: ${p.storedStage} → ${p.proposedStage}${p.write.completedAt ? ` · completed ${p.write.completedAt}` : ""}`);
  }
  return { applied: true, writes, planned: planned.length };
}
