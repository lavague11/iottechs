"use server";

import { resolveProjectRef, getProjectsWithSystemQr } from "../../../lib/db";

// Unlock a System QR from the public guide with the project's ID + PIN. This is the cold-visitor
// path: no session, no cookie, no token — the same credentials the project gate already accepts.
// It returns ONLY the QR fields (never the project row), because the caller is unauthenticated
// and everything returned lands in their browser.
export async function unlockGuideQrAction(ref, pin) {
  const project = resolveProjectRef(ref);
  if (!project) return { ok: false, error: "no_project" };

  // A project with no stored PIN must never validate — otherwise an unclaimed project's QR is
  // reachable by guessing IDs. Same rule the pin-check route enforces.
  if (!project.customer_pin || !String(project.customer_pin).trim()) return { ok: false, error: "no_pin" };
  if (String(project.customer_pin).trim() !== String(pin || "").trim()) return { ok: false, error: "wrong_pin" };
  if (!project.system_qr) return { ok: false, error: "no_qr" };

  const [safe] = getProjectsWithSystemQr([project]);
  return { ok: true, project: safe };
}
