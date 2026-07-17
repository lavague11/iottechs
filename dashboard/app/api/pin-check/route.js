import { resolveProjectRef } from "../../../lib/db";

export async function POST(request) {
  try {
    const { accessId, pin } = await request.json();
    if (!accessId)
      return Response.json({ ok: false, error: "Enter a Project ID." }, { status: 400 });

    // Accept the FULL project ID (ASC00SY) or just its last 4 (00SY / 0041).
    const project = resolveProjectRef(accessId);
    if (!project)
      return Response.json({ ok: false, error: "no_project" }, { status: 404 });

    // Resolve-only mode: no PIN supplied. The home-page ID search just needs the canonical ID
    // so it can hand the visitor to the project's animated PIN gate, which collects the PIN.
    if (!pin)
      return Response.json({ ok: true, accessId: project.access_id });

    // A project with no stored PIN must never validate — "no PIN" used to pass any
    // entry straight through, which made unclaimed projects open to guessed IDs.
    if (!project.customer_pin || !String(project.customer_pin).trim())
      return Response.json({ ok: false, error: "no_pin" }, { status: 401 });
    if (String(project.customer_pin).trim() !== String(pin).trim())
      return Response.json({ ok: false, error: "wrong_pin" }, { status: 401 });

    // Hand back the canonical ID so the client navigates to the real project, even if the
    // visitor typed the last-4 short code.
    return Response.json({ ok: true, accessId: project.access_id });
  } catch (e) {
    console.error("pin-check error", e);
    return Response.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}
