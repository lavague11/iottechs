// Smart project-status context — the popover half of the top-bar status pill.
//
// The pill's LABEL + navigation already come from one place: the role-branched next-action ladders
// (officeNextAction / customerNextAction) in gateway-client, over the canonical `custFacts`. This
// module adds the CONTEXT the popover needs — the current phase headline and a ✓/○ milestone
// checklist — derived from those SAME facts, so status can never drift from the pill. It invents no
// new state and no new checklist items: every milestone maps to a real fact the flow already gates on.

import { PHASES, masterToPhaseKey } from "./spec";

// The phase headline for a master stage key → { label, statusWord } (e.g. "Proposal" / "Reviewing").
export function phaseHeadline(stageKey) {
  const ph = PHASES.find((p) => p.key === masterToPhaseKey(stageKey)) || PHASES[0];
  return { label: ph.label, statusWord: ph.status };
}

// The getting-started milestone chain, in order, each resolved done/not-done from canonical facts.
// The first not-done item is flagged `active` (the "○ pending — you are here" marker). Mockup only
// appears when the project actually has one. Deliberately stops at the deposit — beyond that the
// stage/label carries the story (scheduling, install), and the remaining facts aren't all present
// here, so adding them would risk a false ✓ (e.g. install_date falls back to the survey date).
export function statusMilestones(f = {}) {
  const raw = [["Site survey", !!f.survey_done]];
  if (f.mockup_has || f.mockup_done || f.mockup_submitted) raw.push(["Mockup", !!f.mockup_done]);
  raw.push(["Proposal accepted", f.proposal_status === "accepted"]);
  raw.push(["Agreement signed", !!f.proposal_signed]);
  raw.push(["Deposit paid", !!f.deposit_recorded]);
  const firstPending = raw.findIndex(([, done]) => !done);
  return raw.map(([label, done], i) => ({ label, done, active: i === firstPending }));
}

// Assemble the full popover payload from the facts + the ladder's already-resolved next action.
// `action` = { label, target, spot, muted, schedule } | null (from office/customerNextAction).
// Returns null only when there's genuinely nothing to show (no stage yet).
export function projectStatusDetail(stageKey, facts = {}, action = null) {
  if (!stageKey) return null;
  const head = phaseHeadline(stageKey);
  const milestones = statusMilestones(facts);
  // The primary-button verb: an owed action "continues", a waiting/complete status just "views".
  const spot = action?.spot || head.label;
  const ctaLabel = action?.schedule ? "Open scheduling"
    : action?.muted ? `View ${spot}`
    : action ? `Continue to ${spot}` : `View ${head.label}`;
  return {
    phaseLabel: head.label,
    statusWord: head.statusWord,          // the broad phase word (Pending / Reviewing / In Progress …)
    nextLabel: action?.label || null,     // the specific owed action / waiting state (Next step line)
    action: !!action && !action.muted,
    milestones,
    ctaLabel,
  };
}
