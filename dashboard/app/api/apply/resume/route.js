import { getApplication } from "../../../../lib/db";
import { getSessionUser } from "../../../../lib/session";

// Staff-only résumé download. The file is stored as a base64 data URL on the application row;
// here we decode it and stream it back as an attachment. Never exposed to the applicant/public.
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || !["admin", "manager"].includes(user.role)) return new Response("Forbidden", { status: 403 });

  const id = new URL(request.url).searchParams.get("id") || "";
  const app = getApplication(id);
  if (!app || !app.resume_data) return new Response("Not found", { status: 404 });

  const m = /^data:([^;]+);base64,(.*)$/s.exec(String(app.resume_data));
  if (!m) return new Response("Bad résumé data", { status: 500 });
  const buf = Buffer.from(m[2], "base64");
  const fname = String(app.resume_name || "resume").replace(/[^\w.\-() ]+/g, "_");
  return new Response(buf, {
    headers: {
      "Content-Type": m[1],
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Content-Length": String(buf.length),
    },
  });
}
