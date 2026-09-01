import { redirect, notFound } from "next/navigation";
import { resolveApplicationRef, getApplicationEvents, getStaffUsers, getApplicationCompliance, sanitizeCompliance, lookupEmailOwner } from "../../../lib/db";
import { getSessionUser, getNotifSummary } from "../../../lib/session";
import AppReviewClient from "./app-review-client";

// Application review — the office's side of the hiring pipeline. Admin/manager only.
export default async function ApplicationReviewPage({ params }) {
  const { appId } = await params;
  const user = await getSessionUser();
  if (!["admin", "manager"].includes(user.role)) redirect("/dashboard");

  const app = resolveApplicationRef(appId);
  if (!app) notFound();

  const alerts = getNotifSummary(user.id);
  const events = getApplicationEvents(app.app_id).map((e) => ({ ...e }));
  // When the candidate ENTERED the current stage — the latest stage transition (or "applied").
  // Drives the Days-in-stage chip, computed off the event log rather than the application date.
  const transitions = events.filter((e) => ["stage", "applied", "declined"].includes(e.kind));
  const statusSince = transitions.length ? transitions[transitions.length - 1].at : (app.created_at || null);
  const reviewers = getStaffUsers()
    .filter((u) => ["admin", "manager"].includes(u.role))
    .map((u) => ({ id: u.id, name: u.name }));

  // The applicant's PIN is an access credential — the office never needs it in the browser. The
  // résumé blob stays server-side too (downloaded via /api/apply/resume); only its filename ships.
  const safe = { ...app };
  delete safe.applicant_pin;
  delete safe.resume_data;

  const compliance = sanitizeCompliance(getApplicationCompliance(app.app_id));
  // Does this applicant's email also belong to a customer on file? (Staff never reach here — blocked
  // at apply.) Surfaced as a non-blocking "Also a customer" chip so the office has the context.
  const eo = lookupEmailOwner(app.email);
  const customerMatch = eo?.kind === "customer" ? (eo.name || true) : null;
  return <AppReviewClient user={user} alerts={alerts} app={safe} events={events} reviewers={reviewers} compliance={compliance} statusSince={statusSince} customerMatch={customerMatch} />;
}
