// The ONE tool-card status language (project page): Create (never started) · Edit (started) ·
// Completed (done — green, check beside the title). Every card derives { action, done } here so the
// Proposal, Site Survey and any later card speak the same dialect. A done card stays clickable.
//
// `done` must already be a CURRENT fact — for a fingerprint-bound tool that means the acceptance
// matches the content today (see toolDone), never merely "was accepted once".
//
// `labels` lets ONE card name its own states where the generic word is vaguer than the truth — the
// Proposal is "Signed", not "Completed". It overrides the WORD only: the shape, the green and the
// check beside the title still come from `done`, so a renamed card is still the same dialect rather
// than a second one. Keep overrides to one or two words, same as the defaults.
const TOOL_CARD_DEFAULTS = { done: "Completed", started: "Edit", fresh: "Create" };

export function toolCardState({ done = false, started = false, labels = {} } = {}) {
  const d = !!done;
  const state = d ? "done" : started ? "started" : "fresh";
  return { done: d, action: labels[state] || TOOL_CARD_DEFAULTS[state] };
}

// THE definition of "is this acceptance still current": the stored fingerprint equals the tool's live
// one, and neither is missing. An edit after approval changes the live fingerprint, so it stops matching.
// (survey-approve.jsx `toolAccepted` delegates here — there is no second copy.)
// The live fingerprint comes from the toolMeta poll, so after an edit the card can read Completed for
// one poll interval before correcting itself; it never fails toward a stale approval.
export function acceptanceCurrent(meta, acceptance) {
  return !!(meta?.fingerprint && acceptance?.fingerprint && acceptance.fingerprint === meta.fingerprint);
}

// Done = any of the given acceptances (submission and/or approval) is current on its own.
export function toolDone(meta, ...acceptances) {
  return acceptances.some((a) => acceptanceCurrent(meta, a));
}
