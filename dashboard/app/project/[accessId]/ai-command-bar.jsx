"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CommandSurface from "./command-surface";
import { applyIntentToPayload } from "../../../lib/ai-command";
import { aiStatusAction, aiInterpretAction, aiResolvePickAction, aiApplyNoteAction, aiAuditAction } from "./ai-actions";

// Proposal-builder wiring for the reusable CommandSurface. Supplies the interpret / navigate / apply /
// disambiguate callbacks; the surface itself is domain-agnostic and reusable elsewhere later. Proposal
// edits apply to the builder's live payload (its own validated autosave is the server write); notes go
// straight to the server. Renders only when AI_COMMANDS is on and the caller is staff.
const PLACEHOLDER = "Command the proposal — “add 8 cameras at $300”, “change the cameras to $275”, “15% discount”, “note: …”, “open Crazy Cars”";

export default function AiCommandBar({ accessId, projectName, payload, patchPayload }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let live = true; aiStatusAction().then((s) => live && setEnabled(!!s?.enabled)).catch(() => {}); return () => { live = false; }; }, []);

  const interpret = (text) => aiInterpretAction(accessId, text, { projectName });
  const onPick = (res, id) => aiResolvePickAction(accessId, res.intent, id);
  const onNavigate = (res) => router.push(res.href);

  async function onApply(res) {
    if (res.write === "note") {
      const r = await aiApplyNoteAction(accessId, res.intent.body);
      return r?.error ? r : { ok: true, message: "Note added to the Job Log." };
    }
    // proposal edit (add_items / set_discount / edit_item) — apply to the builder's live payload with the
    // SAME pure function the preview used; the builder's autosave validates + persists it server-side.
    const applied = applyIntentToPayload(payload, res.intent);
    if (applied.error) return { error: applied.error };
    patchPayload(applied.payload);
    await aiAuditAction(accessId, res.preview.title).catch(() => {});
    return { ok: true, message: `Applied — ${res.preview.title}` };
  }

  return <CommandSurface enabled={enabled} placeholder={PLACEHOLDER} interpret={interpret} onNavigate={onNavigate} onApply={onApply} onPick={onPick} />;
}
