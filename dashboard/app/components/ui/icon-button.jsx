"use client";
import { forwardRef } from "react";

// Minimal icon-only button — the constitution's default action shape (see DESIGN_SYSTEM.md).
// Pass an SVG child + a one-word `label`; it becomes both the aria-label and the tooltip. Compact by
// default (34px), accessible by default (focus ring, aria-label). Don't hand-roll verbose one-offs.
//   <IconButton label="Attach" onClick={pick}><svg .../></IconButton>
//   <IconButton label="Delete" tone="danger" size={32}>…</IconButton>
const IconButton = forwardRef(function IconButton(
  { label, children, onClick, tone = "default", size = 34, active = false, disabled = false, title, className = "", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={title ?? label}
      className={`iotib iotib-${tone}${active ? " on" : ""} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
      <style>{IB_CSS}</style>
    </button>
  );
});

const IB_CSS = `
.iotib{display:inline-flex;align-items:center;justify-content:center;padding:0;border-radius:9px;
  border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;line-height:0;
  transition:background .14s,border-color .14s,color .14s,transform .1s}
.iotib svg{width:18px;height:18px}
.iotib:hover:not(:disabled){background:rgba(127,127,127,.14)}
.iotib:active:not(:disabled){transform:translateY(.5px)}
.iotib:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(94,150,255,.6)}
.iotib:disabled{opacity:.4;cursor:default}
.iotib-default.on{background:rgba(127,127,127,.2)}
.iotib-primary{background:#12151b;color:#fff;border-color:#12151b}
.iotib-primary:hover:not(:disabled){background:#20242c}
.iotib-danger{color:#d9534f}
.iotib-danger:hover:not(:disabled){background:rgba(217,83,79,.14)}
.iotib-ghost{color:#8a9099}
`;

export default IconButton;
