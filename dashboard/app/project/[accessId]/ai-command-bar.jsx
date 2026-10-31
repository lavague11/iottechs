"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CommandSurface from "./command-surface";
import { applyIntentToPayload } from "../../../lib/ai-command";
import { aiStatusAction, aiInterpretAction, aiResolvePickAction, aiApplyNoteAction, aiAuditAction, aiApplyProjectActionAction } from "./ai-actions";

// Proposal-builder wiring for the reusable CommandSurface. Supplies the interpret / navigate / apply /
// disambiguate callbacks; the surface itself is domain-agnostic and reusable elsewhere later. Proposal
// edits apply to the builder's live payload (its own validated autosave is the server write); notes go
// straight to the server. Renders only when AI_COMMANDS is on and the caller is staff.
const PLACEHOLDER = "Edit or ask…";

export default function AiCommandBar({ accessId, projectName, payload, patchPayload }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let live = true; aiStatusAction().then((s) => live && setEnabled(!!s?.enabled)).catch(() => {}); return () => { live = false; }; }, []);

  const interpret = (text, opts) => aiInterpretAction(accessId, text, { projectName, recent: opts?.recent, memory: opts?.memory, learnMode: opts?.learnMode });
  const onPick = (res, id) => aiResolvePickAction(accessId, res.intent, id);
  // A different project → client-side push. An IN-project jump (?stage=/?open=) → hard navigate, because
  // the deck reads those deep-link params only on mount, so a soft push wouldn't actually move it.
  const onNavigate = (res) => {
    if (typeof window !== "undefined" && res.href.startsWith(window.location.pathname)) window.location.assign(res.href);
    else router.push(res.href);
  };

  async function onApply(res) {
    if (res.write === "note") {
      const r = await aiApplyNoteAction(accessId, res.intent.body);
      return r?.error ? r : { ok: true, message: "Note added to the Job Log." };
    }
    // Phase-2 project action (send proposal, …) — dispatch against the bound project via its guarded action.
    if (res.write === "action" && res.intent?.name) {
      const r = await aiApplyProjectActionAction(res.intent.accessId || accessId, res.intent.name, res.intent.args).catch(() => ({ error: "Couldn’t complete that." }));
      return r?.error ? r : { ok: true, message: r.message || "Done." };
    }
    // proposal edit (add_items / set_discount / edit_item) — apply to the builder's live payload with the
    // SAME pure function the preview used; the builder's autosave validates + persists it server-side.
    const before = payload;   // snapshot for a one-tap Undo of a routine edit
    const applied = applyIntentToPayload(payload, res.intent);
    if (applied.error) return { error: applied.error };
    patchPayload(applied.payload);
    await aiAuditAction(accessId, res.preview.title).catch(() => {});
    return { ok: true, message: `Applied — ${res.preview.title}`, undo: () => patchPayload(before) };
  }

  return <CommandSurface enabled={enabled} placeholder={PLACEHOLDER} interpret={interpret} onNavigate={onNavigate} onApply={onApply} onPick={onPick} />;
}
