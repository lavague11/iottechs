// Section O — the migration REPORT renderer (pure). Turns the per-project plans from
// lib/legacy-migration.js into docs/migration-report.md. Separate file so the planner stays
// decision-only and this stays formatting-only.
//
// The report is the deliverable: a reviewer must be able to spot a WRONG mapping from it alone, so
// every project prints current → proposed AND the evidence that moved it. Nothing is summarised away.
import { summarize } from "./legacy-migration.js";

const line = (v) => `${v.stageLabel} · ${v.pct == null ? "—" : `${v.pct}%`} · ${v.customerLabel} (${v.state}) · step ${v.step}`;

const REASON_TITLE = {
  signature_drift: "Signed proposal whose payload drifted",
  stage_ahead_of_evidence: "Stage column is ahead of the recorded evidence",
  deposit_pending_past_gate: "Past the deposit gate on an unconfirmed payment",
  completion_stamp_missing: "Finished job with no completion stamp",
  closed_but_evidence_complete: "Closed, but the evidence says completed",
  stage_claims_proposal_without_one: "Stage says Proposal or later, but no proposal was ever published",
  signed_but_status_contradicts: "Signed, but the published status says changes requested / declined",
};

function projectBlock(p) {
  const out = [];
  out.push(`### ${p.accessId} — ${p.title || "(no name)"}${p.demo ? "  _[demo/journey row]_" : ""}`);
  out.push("");
  out.push(`- **Current:** ${line(p.current)}`);
  out.push(`- **Proposed:** ${line(p.proposed)}`);
  const w = p.write || {};
  out.push(`- **Write:** ${w.stage ? `projects.stage \`${p.storedStage}\` → \`${w.stage}\`` : "no stage change"}${w.completedAt ? ` · projects.completed_at → \`${w.completedAt}\`` : ""}`);
  if (p.weak) out.push("- **⚠ Weak evidence:** the move rests on a legacy signature with no stored fingerprint (name-only). Verify the signed document before trusting this row.");
  if (p.notes?.length) { out.push("- **Why:**"); p.notes.forEach((n) => out.push(`  - ${n}`)); }
  if (p.needsHuman?.length) { out.push("- **Needs a human:**"); p.needsHuman.forEach((h) => out.push(`  - \`${h.code}\` — ${h.text}`)); }
  out.push("- **Evidence:**");
  p.evidence.forEach((e) => out.push(`  - ${e}`));
  out.push("");
  return out.join("\n");
}

// An index of the stage-only changes, so a reviewer can scan 45 rows before reading 45 blocks. The
// blocks follow underneath — this table is navigation, never the evidence.
function changeTable(plans) {
  const rows = plans.map((p) => `| ${p.accessId} | ${p.title || ""} | \`${p.storedStage}\` → \`${p.proposedStage}\` | ${p.current.pct == null ? "—" : p.current.pct + "%"} → ${p.proposed.pct == null ? "—" : p.proposed.pct + "%"} | ${p.proposed.customerLabel} | signature: ${p.signature} · deposit: ${p.deposit} |`);
  return ["| Project | Name | Stage | % | Status (unchanged) | Contract evidence |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

function compactTable(plans) {
  const rows = plans.map((p) => `| ${p.accessId} | ${p.title || ""} | ${p.current.stageLabel} | ${p.current.pct == null ? "—" : p.current.pct + "%"} | ${p.current.customerLabel} |`);
  return ["| Project | Name | Stage | % | Status |", "|---|---|---|---|---|", ...rows].join("\n");
}

export function renderReport({ plans, meta = {} }) {
  const s = summarize(plans);
  const by = (v) => plans.filter((x) => x.verdict === v);
  const L = [];

  L.push("# Legacy project migration — DRY RUN report");
  L.push("");
  L.push(`Generated: ${meta.generatedAt || "(unknown)"}  ·  database: \`${meta.dbPath || "?"}\`${meta.onLive ? " **(the live file)**" : ""}  ·  mode: **${meta.applied ? "APPLIED" : "DRY RUN — no project data was written"}**`);
  L.push("");
  if (meta.note) { L.push(meta.note); L.push(""); }
  L.push("## Totals");
  L.push("");
  L.push("| | count |");
  L.push("|---|---|");
  L.push(`| Projects scanned | ${s.scanned} |`);
  L.push(`| **Would change** | **${s.change}** |`);
  L.push(`| …of which change what the customer sees (stage · percent · status) | ${s.changeVisible} |`);
  L.push(`| …of which are stage-column catch-up only (same rendered percent/status) | ${s.changeStageOnly} |`);
  L.push(`| Already correct (no write) | ${s.ok} |`);
  L.push(`| **Need a human decision** | **${s.manual}** |`);
  L.push(`| Out of scope (service calls) | ${s.skipped} |`);
  L.push(`| …of the changes, resting on weak (unverifiable) signature evidence | ${s.weak} |`);
  L.push("");
  if (Object.keys(s.reasons).length) {
    L.push("Human-decision reasons:");
    L.push("");
    Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).forEach(([code, n]) => L.push(`- \`${code}\` — ${REASON_TITLE[code] || code}: **${n}**`));
    L.push("");
  }

  L.push("## How stage, percent and status were recomputed");
  L.push("");
  L.push("Every number below comes from the shipped resolvers — this migration adds no formula of its own:");
  L.push("");
  L.push("- facts — `db.buildStageFacts` (reads the **published** proposal, never the staff working draft)");
  L.push("- status — `lib/project-status.resolveProjectStatus` over `stageFloorFacts`");
  L.push("- percent — `lib/staff-hub.simpleProgressPct` via `lib/my-projects-card.buildMyProjectCard`");
  L.push("- stage — the furthest of three existing devices: the stored stage · `stage-flow.gateThroughIndex` walked from it (capped at Scheduling, the last stage the server itself auto-advances) · the status-driven lift (the resolved state's earliest possible master stage, evaluated at the stage the EVIDENCE supports — never at the stored one, which would let a stale column justify itself). **Forward only** — evidence never rewinds a project.");
  L.push("- 3-step rail — `lib/staff-hub.threeStepForState`, i.e. derived from the state, not the stage column");
  L.push("");
  L.push("Two guards exist because a bare requirement sweep would otherwise overstate a project: a project with **no published proposal** is never moved into the Proposal stage (`customer-action.customerTodo` is keyed on the stage column and would announce a proposal that does not exist), and field-work stages are never entered by a sweep — only by a recorded install / QC / payment fact. Conversely a **signed or accepted** proposal supersedes a missing survey approval and a missing survey appointment when placing the stage (the same rule `stageFloorFacts` already applies past `proposal`), which is what stops a signed, paid job from being told to \"approve site survey\". No survey record is written.");
  L.push("");
  L.push("Writes are limited to `projects.stage` and (only on hard install+payment evidence, with a real date) `projects.completed_at`. Percent and status are never stored — fixing the stage column is what makes the derived pair correct everywhere.");
  L.push("");
  L.push("Three further rules, each visible per project below:");
  L.push("");
  L.push("- **Closed records are never written forward.** A project with `lost_at`, or `category`/`status` closed, keeps its stage even when the evidence would place it later: advancing a row somebody deliberately closed would resurrect it in pipeline counts and overwrite the stage it was closed at (`lost_prev_stage` is the only other copy). Each one says so in its own block.");
  L.push("- **A completion date must be `YYYY-MM-DD…` or it is refused.** `db.markProjectCompleted` silently falls back to *today* for anything it cannot parse, which would start the warranty clock today — the exact outcome this migration refuses. An unparseable date escalates to a human instead, and a stage transition recorded by a backfill/seed/migration pass is not accepted as dated evidence at all (it records when a script ran, not when the work finished).");
  L.push("- **`internal_job` rows are exempt from the \"stage claims a proposal that doesn't exist\" check.** An internal/legacy job has no customer sale — the work order skips the sign+deposit gate and no proposal is ever expected — and no customer portal to mislead. Every other project at Proposal-or-later with nothing published is escalated.");
  L.push("");
  L.push('"Signed" is reported as one of four distinct classes, because the facts collapse three of them into "unsigned": `bound` (fingerprint matches), `drifted` (payload moved after signing — **never migrated**), `legacy_unbound` (pre-binding signature, name-only, unverifiable), `none`. Deposits distinguish `confirmed` (money in) from `pending` (submitted, not confirmed) and are read from the RAW facts, never the stage-floored ones.');
  L.push("");

  // The named case from the spec (section O calls out ASC0041 "Pizza Bay" by name). Printed FIRST
  // and unvarnished: if the row carrying that id is not the project described, say so rather than
  // forcing the expected answer.
  if (meta.namedCase) {
    const np = plans.find((p) => p.accessId === meta.namedCase);
    L.push(`## The named case — ${meta.namedCase}`);
    L.push("");
    if (!np) {
      L.push(`**${meta.namedCase} does not exist in this database.** Section O expects it to be "Pizza Bay", a finished job. Nothing can be verified here; re-run this dry run against the database that actually holds it.`);
    } else {
      const looksLikePizzaBay = /pizza/i.test(np.title || "");
      L.push(`- Row found: **${np.title || "(no name)"}**`);
      L.push(`- Current: ${line(np.current)}`);
      L.push(`- Proposed: ${line(np.proposed)}  ·  verdict **${np.verdict}**`);
      L.push("");
      if (!looksLikePizzaBay) {
        L.push(`> **The expected result cannot be produced, and that mismatch is the finding.** Section O says ${meta.namedCase} is "Pizza Bay — actually fully COMPLETED" and must end at Completed / 100%. The project carrying this access id in this database is **${np.title || "(no name)"}**, a different job. Its evidence is below; it does not describe a completed installation, so the migration does not — and must not — land it at Completed. The Pizza Bay row described in the spec is not in this database (it lives on the production host); run the dry run there before the real run, and expect the completion question to land on the admin override unless \`projects.completed_at\` is already stamped.`);
      } else if (np.proposed.state !== "COMPLETE") {
        L.push(`> **It does NOT resolve to Completed / 100%.** The resolved state is \`${np.proposed.state}\` at ${np.proposed.pct}%. The evidence below says why; the missing fact must be recorded (or set deliberately through the admin override) rather than assumed.`);
      }
      L.push("");
      L.push("Evidence:");
      L.push("");
      np.evidence.forEach((e) => L.push(`- ${e}`));
      np.needsHuman.forEach((h) => L.push(`- **needs a human** \`${h.code}\` — ${h.text}`));
      L.push("");
    }
  }

  L.push(`## 1 · Would change (${s.change})`);
  L.push("");
  L.push(`### 1a · Changes the customer sees (${s.changeVisible})`);
  L.push("");
  if (!s.changeVisible) L.push("_None._");
  by("change").filter((p) => p.visible).forEach((p) => L.push(projectBlock(p)));
  L.push("");
  L.push(`### 1b · Stage-column catch-up only — same rendered percent/status (${s.changeStageOnly})`);
  L.push("");
  L.push("These projects render identically before and after (percent and status are derived from the facts, and the 3-step rail from the resolved state). The write still matters: the phase gate, the server's auto-advance, the staff deck and the legacy portal all read `projects.stage`.");
  L.push("");
  const stageOnly = by("change").filter((p) => !p.visible);
  if (stageOnly.length) {
    L.push(changeTable(stageOnly));
    L.push("");
    L.push("Full evidence for each, in the same shape as 1a:");
    L.push("");
    stageOnly.forEach((p) => L.push(projectBlock(p)));
  } else L.push("_None._");
  L.push("");

  L.push(`## 2 · Need a human decision (${s.manual})`);
  L.push("");
  L.push("The data genuinely cannot decide these. Nothing is written for them, in either direction.");
  L.push("");
  if (!s.manual) L.push("_None._");
  by("manual").forEach((p) => L.push(projectBlock(p)));
  L.push("");

  L.push(`## 3 · Already correct — no write (${s.ok})`);
  L.push("");
  L.push("The stored stage already matches what the evidence supports; the derived percent/status are correct as rendered.");
  L.push("");
  if (s.ok) L.push(compactTable(by("ok")));
  else L.push("_None._");
  L.push("");

  L.push(`## 4 · Out of scope (${s.skipped})`);
  L.push("");
  L.push("Service calls (project_type C) keep their own 13-state status model (`lib/svc-status.js`) and their own gateway; the 3-stage install rail does not describe them.");
  L.push("");
  if (s.skipped) {
    L.push("| Project | Name | Reason |");
    L.push("|---|---|---|");
    by("skipped").forEach((p) => L.push(`| ${p.accessId} | ${p.title || ""} | ${p.skipReason} |`));
  } else L.push("_None._");
  L.push("");

  // Section N's corrected derivation moved several legacy rows out of the Completed filter. These are
  // the Pizza Bay shape, so the migration has to account for them explicitly rather than let the count
  // quietly change. Driven from the rows themselves, not hand-written.
  const looksDone = plans.filter((p) => p.verdict !== "skipped" &&
    (p.completedAt || p.category === "completed" || ["qc", "payment", "completion"].includes(p.storedStage)) &&
    p.proposed?.state !== "COMPLETE");
  L.push(`## Projects that look finished but do NOT read Completed (${looksDone.length})`);
  L.push("");
  L.push("Section N now derives the customer's status from real state instead of the stored stage, which moved these rows out of the Completed filter. Every one is defensible — and every one is the Pizza Bay shape, i.e. exactly what the admin override exists for. The migration does **not** force them to Completed: `COMPLETE` requires the field work recorded *and* the balance collected, and inventing either would be inventing a contract or a warranty start date.");
  L.push("");
  if (looksDone.length) {
    L.push("| Project | Name | Stage | completed_at | category / status | Reads now | Why not Completed |");
    L.push("|---|---|---|---|---|---|---|");
    looksDone.forEach((p) => {
      const why = p.closed
        ? "closed record (category/status closed) → reads **Closed**, not Completed; reopen first if that is wrong"
        : !p.finalPaid && p.hasContract ? `balance still owed (\`final_balance_paid\` false) → ${p.proposed.pct == null ? "no percent" : p.proposed.pct + "%"}, not 100%`
        : !p.completedAt ? "no completion stamp (`projects.completed_at` empty)"
        : (p.needsHuman[0]?.code ? `see \`${p.needsHuman[0].code}\`` : "evidence incomplete");
      L.push(`| ${p.accessId} | ${p.title || ""} | ${p.current.stageLabel} | ${p.completedAt || "—"} | ${p.category || "—"} / ${p.statusText || "—"} | ${p.proposed.customerLabel} · ${p.proposed.pct == null ? "—" : p.proposed.pct + "%"} · chip "${p.proposed.chip?.label || "—"}" | ${why} |`);
    });
  } else L.push("_None._");
  L.push("");
  L.push("Resolve each with the admin override — **right-click the project on `/projects` (or `/dashboard`, or a customer's page) → Override…** — and either set the stage, or mark it complete. Marking it complete **requires the date the job finished**: the dialog prefills it from the project's own dated evidence and names the source, and it never defaults to today, because that date is the warranty start. The alternative is to record the missing payment or sign-off and let the lifecycle reach Completed on its own.");
  L.push("");

  // Scope documentation: section O bundles three unrelated things and only the migration lives here.
  L.push("## Not covered by this migration");
  L.push("");
  L.push("- **Legacy surveys render in the new viewer** — the floorplan/device model is already shared (`lib/survey2-model.js`), so legacy survey blobs need no data change. The viewer's own defects are section M, not migration work: hide \"Approximately ___ total\" when there is no area, the blurred dimension labels, and the scale bar reading \"1 m\" where it should read feet.");
  L.push("- **One portal code path** (removing the old customer page/route) is section M.");
  L.push("- **/my-projects page order and the per-project context action buttons** (Sign / Pay / Approve / Open + Reschedule / View) are section N.");
  L.push("- **Projects where the stage column claims a document that does not exist** cannot be fixed forward-only. They are listed under \"needs a human\" and are what the admin override exists for.");
  L.push("");
  L.push("## Admin override (for every project this report hands to a human)");
  L.push("");
  L.push("**Where:** right-click (or long-press) a project row on `/projects`, `/dashboard` or a customer's page → **Override…**. It is the item below the ordinary \"Change stage\" shortcuts, and only an admin sees it.");
  L.push("");
  L.push("**What it does:** offers all nine master stages — not just the three quick targets, so `Payment`, `QC`, `Approval & Deposit`, `Fulfillment`, `Proposal` and `Inquiry` are reachable — plus Mark complete / Clear completion and a one-line \"why\". It opens on the project's current stage.");
  L.push("");
  L.push("**The completion date is required, and it is never today.** `completed_at` + `warranty_months` IS the warranty, so a job finished in July must not ship a warranty starting on the day someone fixed the record. The dialog prefills the date from the project's own dated evidence — the last confirmed payment, or a human-recorded entry into Completion, whichever is newer — and names the source so you are confirming a real date rather than typing one from memory. Evidence dated *today* is deliberately ignored (an admin's own stage move would otherwise supply its own proof), and if nothing dated exists the override refuses until you enter the date yourself.");
  L.push("");
  L.push("**Audit:** every applied override appends a `project_events` row (`kind: \"override\"`, with who / what / why / the completion day used) on top of the usual `stage_transitions` row — so a hand-set stage is never indistinguishable from one the lifecycle earned. Reversible: set another stage, or Clear completion.");
  L.push("");
  L.push("**Under the hood:** `setLegacyProjectStateAction(accessId, { stage, completed, completedAt, reason })` in `app/project/[accessId]/legacy-actions.js`, **admin only**, enforced server-side via `can(role, \"legacy.override\")` (`lib/roles.js`); a project-scoped PIN grant may only touch its own project.");
  L.push("");
  L.push("## Running it");
  L.push("");
  L.push("**A dry run is not a read-only connection.** Opening the database at all runs the app's own startup pass (ensure-column `ALTER`s, seed rows, PIN normalisation, the legacy `OLD_TO_NEW` stage renames) — those are writes to the file, even though no project's stage or status changes. So the rehearsal runs on a **copy**, and the script refuses the live file unless you name a database on the command line or say `--allow-live`. It prints the resolved path, size and mtime on every run.");
  L.push("");
  L.push("```bash");
  L.push("# DRY RUN on a throwaway copy — START HERE. Copies the live DB (+ its WAL) and runs there.");
  L.push("cd dashboard && node scripts/migrate-legacy-projects.mjs --snapshot /tmp/iot-rehearsal");
  L.push("");
  L.push("# re-run against that copy, or just one project");
  L.push("cd dashboard && node scripts/migrate-legacy-projects.mjs --db /tmp/iot-rehearsal");
  L.push("cd dashboard && node scripts/migrate-legacy-projects.mjs --db /tmp/iot-rehearsal --only ASC0041");
  L.push("");
  L.push("# dry run against the LIVE file, accepting the startup writes described above");
  L.push("cd dashboard && node scripts/migrate-legacy-projects.mjs --allow-live");
  L.push("");
  L.push("# THE REAL RUN — both flags required. NOT RUN by the build agent.");
  L.push("cd dashboard && node scripts/migrate-legacy-projects.mjs --apply --i-have-a-backup");
  L.push("```");
  L.push("");
  L.push("`--apply` without `--i-have-a-backup` refuses and exits before the database module is imported. Take a backup first — `/dev` → Backup, which calls `backupDatabaseTo` (`VACUUM INTO`, safe on a live database). Flags are matched exactly, so a typo (`--Apply`, `--apply=1`) falls through to a dry run rather than writing.");
  L.push("");
  L.push("Other flags: `--only <ACCESS_ID>` · `--out <path>` · `--named <ACCESS_ID>` (which project gets the callout at the top) · `--label` / `--note` (report header text).");
  L.push("");
  L.push("### This file is deliberately NOT committed");
  L.push("");
  L.push("It embeds real customer names, signer names and contract totals; committing it would put that in git history permanently. It is regenerated in one command (the `--snapshot` line above) — which is the right habit anyway, because the production run needs a rehearsal against production data, not a months-old copy of this file. While it exists on disk it is served to admins at `/dev/docs/migration-report.md` (the route needs the extension).");
  L.push("");
  return L.join("\n");
}
