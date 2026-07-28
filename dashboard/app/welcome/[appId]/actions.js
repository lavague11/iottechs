"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseSvcToken } from "../../../lib/auth";
import { getSessionUser } from "../../../lib/session";
import { getApplication, saveOnboardingProfile, signOnboardingDoc } from "../../../lib/db";

// The new hire holds an iot_app grant for THEIR application (minted by the PIN gate). Office
// staff can also act while helping someone through it. Mirrors the page's own authorization so
// an action can never do what the page wouldn't show.
async function authorize(appId) {
  const app = getApplication(appId);
  if (!app) return { app: null, name: null };

  const jar = await cookies();
  const tok = jar.get("iot_app")?.value;
  const parsed = tok ? await parseSvcToken(tok) : null;
  if (parsed?.svcId && String(parsed.svcId).toUpperCase() === String(app.app_id).toUpperCase()) {
    return { app, name: app.name };
  }
  const user = await getSessionUser();
  if (user?.id && ["admin", "manager"].includes(user.role)) return { app, name: user.name };
  return { app: null, name: null };
}

// Onboarding only opens once the office has made an offer — before that there's nothing to fill in.
function unlocked(app) { return ["offer", "hired"].includes(app.stage); }

export async function saveOnboardingProfileAction(appId, profile) {
  const { app, name } = await authorize(appId);
  if (!app) return { ok: false, error: "Not authorized." };
  if (!unlocked(app)) return { ok: false, error: "Onboarding opens once we've made you an offer." };
  const r = saveOnboardingProfile(app.app_id, profile, { actor_name: name });
  if (!r) return { ok: false, error: "Could not save." };
  revalidatePath(`/welcome/${app.app_id}`);
  revalidatePath(`/application/${app.app_id}`);
  revalidatePath(`/onboarding/${app.app_id}`);
  return { ok: true };
}

export async function signOnboardingDocAction(appId, docKey, typedName) {
  const { app } = await authorize(appId);
  if (!app) return { ok: false, error: "Not authorized." };
  if (!unlocked(app)) return { ok: false, error: "Onboarding opens once we've made you an offer." };
  if (String(typedName || "").trim().length < 2) return { ok: false, error: "Type your full name to sign." };
  const r = signOnboardingDoc(app.app_id, docKey, typedName);
  if (!r) return { ok: false, error: "Could not sign." };
  revalidatePath(`/welcome/${app.app_id}`);
  revalidatePath(`/onboarding/${app.app_id}`);
  return { ok: true };
}
