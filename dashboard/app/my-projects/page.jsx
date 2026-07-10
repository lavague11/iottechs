import { cookies } from "next/headers";
import { parseToken } from "../../lib/auth";
import { getProjectsByContactEmail, getUserById } from "../../lib/db";
import MyProjectsClient from "./my-projects-client";

export default async function MyProjectsPage() {
  const jar     = await cookies();
  const tok     = jar.get("iot_session")?.value;
  const session = tok ? await parseToken(tok) : null;

  // Fetch full user record to get name + phone from DB
  const dbUser  = session?.id ? getUserById(session.id) : null;
  const user    = dbUser ? { ...session, name: dbUser.name, phone: dbUser.phone } : session;

  const raw = user?.email ? getProjectsByContactEmail(user.email) : [];

  // The customer's browser receives these as props (RSC payload), so anything on the object is
  // readable in devtools even if the UI never renders it. Whitelist to the customer-safe display
  // fields only — never the internal columns (sales_rep, commission, cost, value, tech, tech_pin).
  const projects = raw.map((p) => ({
    id: p.id,
    access_id: p.access_id,
    customer: p.customer,
    address: p.address,
    service: p.service,
    service_code: p.service_code,
    stage: p.stage,
    status: p.status,
    category: p.category,
    cameras: p.cameras,
    date: p.date,
    issue: p.issue,
    customer_pin: p.customer_pin, // their OWN project PIN — used to display + copy the login link
  }));

  return <MyProjectsClient user={user} projects={projects} />;
}
