import { resolveProjectRef } from "../../../lib/db";

export async function POST(request) {
  try {
    const { accessId, pin } = await request.json();
    if (!accessId || !pin)
      return Response.json({ ok: false, error: "Enter a Project ID and PIN." }, { status: 400 });

    // Accept the FULL project ID (ASC0041) or just its last 4 digits (0041).
    const project = resolveProjectRef(accessId);
    if (!project)
      return Response.json({ ok: false, error: "no_project" }, { status: 404 });

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
