import { getSessionUser } from "../../../lib/session";
import { getUserIdentity } from "../../../lib/db";

// The signed-in user's OWN enrolment status — drives the "Set up Face ID" banner.
// No photos, no embeddings; just enough to know whether to nudge them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL = new Set(["admin", "manager", "sales", "tech"]);

export async function GET() {
  const user = await getSessionUser();
  if (!user?.id) return Response.json({ internal: false, status: null });
  const cur = getUserIdentity(user.id);
  return Response.json({
    internal: INTERNAL.has(user.role),
    status: cur?.status || "unverified",
  });
}
