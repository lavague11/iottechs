import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/session";
import { squareConfigured } from "../../lib/square";
import PayLinkClient from "./pay-link-client";

// Staff-only standalone "pay any amount" page: mint a Square checkout link for any amount (optionally
// credited to a project) and copy/send it. The heavy lifting is POST /api/pay/link; this is just the form.
export const metadata = {
  title: "Payment Link · IOT TECHS",
  description: "Create a secure payment link for any amount.",
  robots: { index: false, follow: false },
};

export default async function PayLinkPage() {
  const user = await getSessionUser();
  if (!user || !["admin", "manager"].includes(user.role)) redirect("/dashboard");
  return <PayLinkClient configured={squareConfigured()} />;
}
