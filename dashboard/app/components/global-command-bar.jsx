"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CommandSurface from "../project/[accessId]/command-surface";
import { aiStatusAction, aiGlobalInterpretAction } from "../project/[accessId]/ai-actions";

// The app-wide AI assistant, rendered as a tiny floating "AI Core" (bottom-left) that expands into a slim
// voice bar — not a dimming modal. Mounted ONCE in each staff shell; it stays mounted so a conversation
// survives minimize and (via CommandSurface's own resume) a navigation. It only drives NAVIGATION + answers;
// a proposal-edit phrasing is pointed back to the project's own bar. Renders nothing unless AI_COMMANDS is on
// and the caller is staff (aiStatusAction decides). All the intelligence lives in CommandSurface.
export default function GlobalCommandBar({ currentAccessId = null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [primary, setPrimary] = useState(false);

  useEffect(() => { let live = true; aiStatusAction().then((s) => live && setEnabled(!!s?.enabled)).catch(() => {}); return () => { live = false; }; }, []);
  // Exactly one AI Core at a time, even if two shells mount it (dashboard shell + project gateway).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__iotAiCore) { setPrimary(false); return; }
    window.__iotAiCore = true; setPrimary(true);
    return () => { if (window.__iotAiCore) delete window.__iotAiCore; };
  }, []);
  if (!enabled || !primary) return null;

  const interpret = (text, opts) => aiGlobalInterpretAction(text, { currentAccessId, recent: opts?.recent, memory: opts?.memory });
  const onNavigate = (res) => {
    // In-project deep links (?stage=/?open=) need a hard nav so the deck re-reads them; everything else is a push.
    if (typeof window !== "undefined" && res.href.startsWith(window.location.pathname)) window.location.assign(res.href);
    else router.push(res.href);
  };
  const noWrite = async () => ({ error: "Open the project to make that change." });

  return (
    <CommandSurface enabled dock="corebar" placeholder="Ask or say a command…"
      interpret={interpret} onNavigate={onNavigate} onApply={noWrite} onPick={noWrite} />
  );
}
