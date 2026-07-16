"use client";

import { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";

// Shared "one open at a time" accordion for a stage's tools. Every collapsible tool on a phase
// (FlowStep cards, the proposal document, the deposit panel) registers itself in render order and
// asks this controller whether it's the one that should be open. Rules the user asked for:
//   • Exactly one tool is expanded at a time; tapping one collapses the rest.
//   • The open tool defaults to the FIRST not-yet-complete tool in order.
//   • Completing a tool (confirm / sign / skip / mark complete) auto-opens the NEXT one — this falls
//     out for free: once the open tool reports done, the "first incomplete" derivation moves on.
// Wrap a phase's tools in <AccordionProvider key={phase}> so state resets cleanly per phase.

const Ctx = createContext(null);

const NONE = "__none__";   // explicit "everything collapsed" (user closed the active one)

export function AccordionProvider({ children }) {
  // Registry lives in state (drives re-render); a ref mirror gives event handlers the latest value
  // without stale closures. All writers are guarded so they only setState on a real change — no loop.
  const [reg, setReg] = useState({ order: [], done: {} });
  const regRef = useRef(reg);
  regRef.current = reg;
  const [openKey, setOpenKey] = useState(null);   // null = auto (first incomplete); NONE = all closed

  const register = useCallback((key) => {
    setReg((r) => r.order.includes(key)
      ? r
      : { order: [...r.order, key], done: { ...r.done, [key]: r.done[key] ?? false } });
  }, []);

  const unregister = useCallback((key) => {
    setReg((r) => {
      if (!r.order.includes(key)) return r;
      const done = { ...r.done }; delete done[key];
      return { order: r.order.filter((k) => k !== key), done };
    });
  }, []);

  const setDone = useCallback((key, done) => {
    setReg((r) => r.done[key] === done ? r : { ...r, done: { ...r.done, [key]: done } });
    // Completing a tool always hands off to the next incomplete one — even if the user had manually
    // opened this tool — as long as they're still looking at it (not parked on a different tool).
    if (done) {
      setOpenKey((cur) => {
        const r = regRef.current;
        const eff = cur == null ? (r.order.find((k) => !r.done[k]) || NONE) : cur;
        if (eff !== key) return cur;
        const i = r.order.indexOf(key);
        const next = r.order.slice(i + 1).find((k) => !r.done[k]);
        return next || NONE;
      });
    }
  }, []);

  const firstIncomplete = (r) => r.order.find((k) => !r.done[k]) || NONE;
  // The open tool: an explicit choice is always honored (so a finished tool can be reopened to
  // review it); with no explicit choice (auto mode) it's the first incomplete tool — so completing
  // the open tool while in auto mode hands off to the next one for free.
  const effectiveKey = openKey == null ? firstIncomplete(reg) : openKey;

  const toggle = useCallback((key) => {
    setOpenKey((cur) => {
      const eff = cur == null ? firstIncomplete(regRef.current) : cur;
      return eff === key ? NONE : key;   // reopen the open one → collapse all
    });
  }, []);

  const complete = useCallback((key) => {
    setOpenKey(() => {
      const r = regRef.current;
      const i = r.order.indexOf(key);
      const next = r.order.slice(i + 1).find((k) => !r.done[k]);
      return next || NONE;
    });
  }, []);

  // Force a specific tool open (e.g. after signing the proposal, pop the deposit panel open even if
  // the accordion was collapsed or parked elsewhere — the handoff-on-complete misses those cases).
  const open = useCallback((key) => { if (key) setOpenKey(key); }, []);

  return (
    <Ctx.Provider value={{ register, unregister, setDone, effectiveKey, toggle, complete, open }}>
      {children}
    </Ctx.Provider>
  );
}

// Raw accordion access for a component that needs to open a DIFFERENT tool than its own (e.g. the
// proposal document opening the deposit panel below it). Returns null outside a provider.
export function useAccordion() {
  return useContext(Ctx);
}

// A collapsible tool joins the accordion. Returns null when there's no provider (the tool then keeps
// its own local open state — safe fallback). `done` = this tool is complete (drives auto-advance).
export function useAccordionItem(key, done) {
  const ctx = useContext(Ctx);
  const ref = useRef(ctx);
  ref.current = ctx;
  // Register once per mount (deps are just the key, so open-state changes never churn this).
  useEffect(() => {
    const c = ref.current;
    if (!c || !key) return;
    c.register(key);
    return () => { if (ref.current) ref.current.unregister(key); };
  }, [key]);
  // Report completion transitions separately — updates done in place, no reordering.
  useEffect(() => {
    if (ref.current && key) ref.current.setDone(key, !!done);
  }, [key, done]);
  if (!ctx || !key) return null;
  return {
    open: ctx.effectiveKey === key,
    toggle: () => ctx.toggle(key),
    complete: () => ctx.complete(key),
  };
}
