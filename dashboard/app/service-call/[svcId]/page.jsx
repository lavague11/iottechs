import { resolveServiceCallRef, ensureSvcProject } from "../../../lib/db";
import ProjectLinkPage from "../../project/[accessId]/page";
import SvcNotFound from "./svc-not-found";

// THE SERVICE CALL PAGE **IS** THE PROJECT PAGE.
//
// Owner call (2026-07-24): "take the project page and literally duplicate it and name it the
// service call page." Rather than fork 4,200 lines that would drift apart within a month, this
// route resolves the call, finds its companion type-C project, and renders the project page
// itself — the identical component, chrome, stage bar, tool cards, role views, PIN gate and all.
// Same PIN too (both are the last 4 of the contact phone), so the customer's unlock is unchanged.
//
// Result: /service-call/SVC0006 and /project/CSC0050 are the same page, forever, because they are
// literally the same code. Service-call specifics (diagnostic + invoice cards) already live in
// that page as FlowStep tool cards, driven by the linked call.

// Neutral, non-leaking social preview — a service-call link that gets texted/forwarded must
// preview as a branded "secure access" card, never the customer's name or issue. Fetches nothing.
export function generateMetadata() {
  return {
    title: "IOT TECHS · Service Call",
    description: "Secure access — authorized only.",
    robots: { index: false, follow: false },
    openGraph: { title: "IOT TECHS", description: "Secure access link — authorized only.", type: "website" },
  };
}

export default async function ServiceCallPage({ params, searchParams }) {
  const { svcId } = await params;
  const call = resolveServiceCallRef(svcId);
  if (!call) return <SvcNotFound />;

  // Companion project (created at intake; lazily repaired here for calls that predate it).
  const project = ensureSvcProject(call.svc_id);
  if (!project) return <SvcNotFound />;

  // Render the real project page for that project. Everything below — auth, role views, data
  // loading, layout — is the project page's own logic, untouched.
  return ProjectLinkPage({
    params: Promise.resolve({ accessId: project.access_id }),
    searchParams,
  });
}
