"use client";
import { useState } from "react";
import DeckView from "../project/[accessId]/deck-view";

// Standalone preview of the redesigned project deck (Consulting wired with the real tool set).
// Sample data only — no API. Lets us review the shell + one stage before porting into the gateway.
const STAGES = [
  { name: "Consulting", pill: "Pending", pct: 13, turn: "customer", tint: "blue",
    need: "Customer to accept the site survey",
    advance: { to: "Proposal", ready: false, reason: "Waiting on customer to accept" },
    tools: [
      { name: "Survey Scheduling & Notes", state: "done", label: "Scheduler" },
      { name: "Site Survey", state: "active", label: "Site Survey tool" },
      { name: "Mockups", label: "Mockup generator" },
    ] },
  { name: "Proposal", pill: "Reviewing", pct: 25, turn: "mine", tint: "gold",
    need: "Approval & deposit, then create the work order",
    advance: { to: "Install", ready: true },
    tools: [
      { name: "Proposal builder", state: "done", label: "Proposal builder" },
      { name: "Approval & Deposit", label: "Approval & deposit" },
      { name: "Create Work Order", label: "Work order generator" },
    ] },
  { name: "Install", pill: "Finalizing", pct: 63, turn: "mine", tint: "gold",
    need: "Pass quality control on all 14 devices",
    advance: { to: "Closeout", ready: true },
    tools: [
      { name: "System QR", state: "done", label: "System QR / activation" },
      { name: "Quality Control", state: "active", label: "QC checklist" },
      { name: "Final Payment", label: "Payment / invoice" },
    ] },
  { name: "Closeout", pill: "Finalizing", pct: 75, turn: "mine", tint: "gold",
    need: "Manager QC approval required",
    advance: { to: "Completion", ready: false, reason: "Manager QC approval required" },
    tools: [
      { name: "System QR", state: "done", label: "System QR / activation" },
      { name: "Quality Control", state: "active", label: "QC checklist" },
      { name: "Final Payment", label: "Payment / invoice" },
    ] },
  { name: "Completion", pill: "Complete", pct: 100, turn: "idle", tint: "green",
    completion: (
      <div style={{ padding: "6px 6px 20px", fontFamily: "Instrument Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 18 }}>
          <span style={{ width: 26, height: 26, borderRadius: 99, background: "#E9F3ED", color: "#2E7D5B", display: "grid", placeItems: "center" }}>✓</span>
          <b style={{ fontSize: 16, fontWeight: 600 }}>Project complete.</b>
          <small style={{ color: "#787D84", fontSize: 13 }}>14 devices installed and verified.</small>
        </div>
        <div style={{ color: "#A1A6AC", fontFamily: "JetBrains Mono", fontSize: 12, letterSpacing: ".05em" }}>Completion wrap-up mounts here (cert · warranty · internal payout).</div>
      </div>
    ) },
];

const CUSTOMER = {
  code: "ASC0031", name: "Abdul",
  fields: [
    { k: "Client", v: "Abdul", sub: "Homeowner" },
    { k: "Contact", v: "(856) 555-0188", sub: "abdul@example.com" },
    { k: "Job site", v: "852 N Pearl St", sub: "Bridgeton, NJ 08302" },
    { k: "Assigned team", v: "3 people", sub: "Wessam · Charlie · Sam" },
    { k: "Devices", v: "14 planned", sub: "Interior + exterior" },
    { k: "Referral source", v: "ADT partner lead", sub: "SafeStreets" },
  ],
  actions: [{ label: "Call" }, { label: "Message" }, { label: "Directions" }, { label: "Customer portal" }, { label: "Edit details" }],
};

const MENU = [
  { label: "Flag for review", danger: true },
  { label: "Close project", danger: true },
  { label: "Archive job", danger: true },
];

export default function DeckPreview() {
  const [idx, setIdx] = useState(0);
  return <DeckView stages={STAGES} idx={idx} onIdx={setIdx} customer={CUSTOMER} menu={MENU} roleLabel="Admin view" />;
}
