// Shared guard for document-level "click outside → close" handlers.
//
// Two things must NEVER count as an outside click:
//  1. The bug-report tool. Its FAB and floating modal carry [data-bug-capture-ignore]; tapping them (or
//     working inside the report) must not collapse dropdowns/cards on the page behind it — otherwise the
//     screenshot changes out from under the reporter.
//  2. A target React has already detached. When a click handler flips state (e.g. "Edit" → edit mode),
//     React re-renders and removes the clicked node before this document-level handler runs; a detached
//     node's .closest() can't see its old container, so the handler would wrongly treat an INSIDE click as
//     outside and close the thing being edited. If the target is no longer in the document, it wasn't an
//     outside click — skip.
//
// Usage: at the top of the outside-close handler, `if (skipOutsideClose(e)) return;`.
export function skipOutsideClose(e) {
  const t = e && e.target;
  if (!t) return false;
  try {
    if (t instanceof Node && t.isConnected === false) return true;         // re-rendered away → not "outside"
    if (typeof t.closest === "function" && t.closest("[data-bug-capture-ignore]")) return true;
  } catch { /* non-element target → fall through */ }
  return false;
}
