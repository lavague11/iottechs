// The ONE tool-card status language (project page): Create (never started) · Edit (started) ·
// Completed (done — green, check beside the title). Every card derives { action, done } here so the
// Proposal, Site Survey and any later card speak the same dialect. A done card stays clickable.
//
// `done` must already be a CURRENT fact — for a fingerprint-bound tool that means the acceptance
// matches the content today (see toolDone), never merely "was accepted once".
export function toolCardState({ done = false, started = false } = {}) {
  const d = !!done;
  return { done: d, action: d ? "Completed" : started ? "Edit" : "Create" };
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
