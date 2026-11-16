import { getSessionUser } from "../../lib/session";
import { getUserById, getJobsForCustomer } from "../../lib/db";
import ReportIssueClient from "./report-issue-client";

// Had no description, so it inherited the app default ("Track your project from survey to completion"),
// which described nothing and matched no search. This page is the public service-call intake.
export const metadata = {
  title: "Security Camera Repair & Service — Report an Issue | IOT TECHS",
  description: "Camera offline, system down or something not recording? Tell us what's wrong and we'll get a technician out. Service across NJ & NYC, 7 days a week.",
  alternates: { canonical: "/report-issue" },
};

// Public service-call intake — reached from the home page "Something's Not Working" path. A
// logged-in customer gets their contact details prefilled and their own systems offered to link.
export default async function ReportIssuePage({ searchParams }) {
  const sp   = await searchParams;
  const user = await getSessionUser();
  const isCustomer = user?.id && user.role === "customer";

  let prefill = { name: "", email: "", phone: "" };
  let projects = [];
  if (isCustomer) {
    const u = getUserById(user.id) || {};
    prefill = { name: u.name || "", email: u.email || "", phone: u.phone || "" };
    projects = getJobsForCustomer(u.name || "").map((p) => ({
      accessId: p.access_id, customer: p.customer, address: p.address || "", service: p.service || "",
    }));
  }

  return (
    <ReportIssueClient
      loggedIn={!!isCustomer}
      prefill={prefill}
      projects={projects}
      presetService={sp?.service || ""}
      presetProject={sp?.project || ""}
    />
  );
}
