// Stage 1 — the training manual as a guide in the Guides library.
//
// docs/camera-install-training-manual.md teaches the same nine steps that
// docs/camera-install-walkthrough.md asks a technician to tick, by design: "a technician trains on
// this manual and works from the checklist". So the guide gets NINE steps whose keys are the nine
// in lib/walkthrough.js, each tagged `wt:<key>`. That tag is the link: a checklist section can find
// its reasoning without anybody maintaining a second mapping.
//
// Idempotent. The guide has a fixed id, so re-running UPDATES it rather than making another one —
// which is what lets this be the way the manual is kept current, not a one-off import.
//
// Usage:
//   node scripts/import-install-manual.mjs            write to ./data/dashboard.db and publish
//   node scripts/import-install-manual.mjs --dry      print what it would write, touch nothing
import path from "node:path";
import fs from "node:fs";
import { STEP_KEYS, WALKTHROUGH_STEPS, stepByKey } from "../lib/walkthrough.js";

const DRY = process.argv.includes("--dry");
const SOP_ID = "sop_install_walkthrough";          // fixed → re-runs update, never duplicate
const SLUG = "camera-install-walkthrough";
const TITLE = "Camera Install — field guide";

// The reasoning behind each checklist step, from the manual. Chapter references are in `where` so a
// trainee can go to the long form. Kept inside the 1000-character step limit.
const GUIDE = {
  survey: {
    where: "Manual ch. 2 Reading the site survey · ch. 3 Arrival and site reading",
    target: "Orient yourself and confirm the job before anything is drilled",
    text: `The survey is your map and your starting plan. It is not permission to drill blindly.

Stand at the curb and face the property. Pick a clear landmark — the street edge, parking lot or entrance — find that same edge on the survey, hold the phone flat and rotate it until both run the same way. Check a SECOND landmark, a building corner or driveway, before pointing at any camera spot.

The first 15 minutes confirm the job: access and work order, two permanent outlets for NVR and display (a third if a Wi-Fi extender is planned), camera names and locations, then shared paths, longest runs, usable existing cable, obstacles and drilling limits.

Use your eyes. What is this building telling you? Is there a usable path or a tested cable already here? What would save a future trip or an extra hole?

Keep confirming the survey all job long. Make safe, in-scope changes and note them in the work order.`,
  },
  nvr: {
    where: "Manual ch. 6 NVR and network setup",
    target: "Get storage and network problems surfacing early",
    text: `Set the NVR up EARLY, so network and storage problems show up while camera work continues.

Order: position and connect the monitor and select the right input; connect the NVR network port to the planned path; with power DISCONNECTED install and secure the hard drive; power up and get the NVR online; initialize the drive and set time, schedule, storage and account; complete QR/app enrollment if assigned.

Never open the NVR or insert a drive while it is powered, unless that exact model supports hot-swap. Follow the manufacturer steps.

Pass checks: NVR online, drive recognized with status Normal, settings saved.

Extension cords are for approved TEMPORARY power only — a corded SDS drill, or temporary setup. Never leave one as permanent equipment power.

Target: about 30 minutes, plus 15 for a monitor or TV mount if one was ordered.`,
  },
  drill: {
    where: "Manual ch. 7 Mark and drill in one batch",
    target: "Every approved hole, in one pass, safely",
    text: `Group the same kind of work: that is where speed comes from, not from rushing each action.

Compare the survey, the structure and the camera spots. Count the entries you need, mark them, and pick the right bit for wood, metal or masonry. Check for hidden pipes, wires and structural members with a detector BEFORE every hole. Drill all approved entries in one pass instead of switching tools back and forth.

Sleeve or grommet entries, seal every exterior hole with weatherproof sealant after routing, and vacuum the dust as you go.

STOP-WORK RULE: unknown utilities, structural members, unsafe roof access or any serious hazard are not routine changes. Stop that activity, protect the area and call the PM. No time target outranks safety.

Wear safety glasses when drilling.`,
  },
  pull: {
    where: "Manual ch. 7 Longest shared routes first · ch. 5 time targets",
    target: "Pull the long shared runs while energy is high",
    text: `Longest runs first — by distance and total time, not by which camera is highest or hardest. Do the long grouped runs early; the short branches get easy later.

Start from the NVR side and find the long segments several cameras share. Stage enough cable to pull several full runs together with steady tension. Split each cable off only at its branch, and leave service slack at BOTH ends.

No kinking, crushing or pulling harder than the cable is rated for. In a drop ceiling use real cable supports and keep away from electrical lines — ceiling tiles and grid are NOT cable supports.

Label every cable at both ends, and photograph runs before they get closed up.

Why it matters: the eight-camera case study is about 16 labor hours pulled one at a time, around 12 when the shared run is grouped. Measure real jobs and update the targets.`,
  },
  terminate: {
    where: "Manual ch. 8 Pass-through termination",
    target: "Every NVR-side end proven before you walk away from the rack",
    text: `Terminate, label and TEST every NVR-side end before moving out to the cameras. Finding a fault here costs minutes; finding it after a camera is mounted costs a trip up a ladder.

Inspect the jacket and pick a connector rated for that cable. Prepare the pairs without extra untwisting, and use the same wiring scheme on every job. Seat the conductors fully, then trim and crimp with the matching pass-through tool.

Test with the Scout Pro 3 and remote. Fix any open, short, reversal or split pair BEFORE mounting.

A wiremap pass does not prove full cable performance. Certify when the job requires it.

Note the cable-to-port map in the work order: which cable feeds which camera, and its NVR or PoE port.

Target: about 5 minutes per end.`,
  },
  manage: {
    where: "Manual ch. 7 Manage the bundle as you go",
    target: "Neat, straight, level — and nothing fastened to the wrong thing",
    text: `Do it well. Neat, straight and consistent, with approved supports.

Zip ties every 4 to 5 feet is a visual habit, not a code standard — use approved supports and spacing for the location. Do not overtighten ties or deform the cable. Size clips and staples to the bundle.

NEVER fasten to sprinkler pipes, electrical conduit, ceiling grid or other building systems.

Outdoor-rated cable still needs protected routing, secure supports and sealed penetrations.

Check cable appearance, mounting alignment and overall finish, and fix visible defects before handoff. The finish is what the customer sees, and it is what a future technician has to work with.`,
  },
  mount: {
    where: "Manual ch. 8 Mount and weatherproof · the 30-minute finishing target",
    target: "Each camera mounted, sealed, live and framed",
    text: `Terminate the camera end and TEST the cable before mounting.

Mark, drill and mount with three correct screws, anchors only where the surface needs them. Hide the RJ45 in an approved pocket hole, or protect it with a junction box. Seal outdoor connectors with a weatherproof boot or housing; dielectric grease only where the connector allows it. Electrical tape is a BACKUP wrap, never the main weather seal.

Confirm the live image, adjust the framing, and take the mounted photo under that camera name before leaving the spot.

The 30-minute finishing target per camera: 10 to terminate both ends, 5 for a three-screw twist-on mount, 5 to get online and aimed, 10 for connector protection and final checks. Anchors add about 5. Masonry takes longer.`,
  },
  inspect: {
    where: "Manual ch. 6 end-of-job check · ch. 9 Troubleshooting and judgment",
    target: "Prove the system works before you start packing",
    text: `Go back to the NVR. Every camera live and aimed, NVR online, drive status Normal, and one instant replay actually played back.

When something fails, think in TOTAL job time. Is the old cable suitable — type, age, damage, exposure, routing, length, termination? What did the test show: miswire, split pair, short, open, damaged section, intermittent? What is the fastest reliable fix — reterminate a bad end, or rerun a suspect cable?

The 10-minute checkpoint: troubleshoot for up to 10 minutes, then report what you tested. If it is still unresolved, move to the next safe task and get a decision.

The time trap: 60 minutes lost on a bad cable, then 120 more to run new anyway — 180 against 120 if you had run new first.

If the PM is silent for 30 minutes, move to another safe productive task.`,
  },
  closeout: {
    where: "Manual ch. 10 Technician QC and PM handoff",
    target: "Hand over a clean site and a documented job",
    text: `The technician proves what was installed. The PM owns final system QC and the customer.

Clean the site and replace ceiling tiles. Remove scraps, tie tails, packaging and dust. Check every tool back against the load-out table.

Evidence that closes the job: live image on the monitor plus the mounted photo under each camera name; the NVR online state and its photo; the drive status photo; one replay played; issues noted under the named camera entries.

The PM owns the recording and playback audit, final settings, remote viewing, channel naming to match the work order, the customer app and the handoff.

Use the work-order tool for everything — no side photo collections. Mark the job ready and notify the PM. Customer handoff happens only after PM review.`,
  },
};

// ---------------------------------------------------------------- build

const steps = STEP_KEYS.map((key, i) => {
  const wt = stepByKey(key), g = GUIDE[key];
  if (!g) throw new Error("no guide text for step " + key);
  return {
    id: `st_wt_${key}`,                                   // fixed → a re-run keeps step identity
    title: `${wt.num} ${wt.title}`,
    instruction: g.text.trim(),
    target: g.target,
    where: g.where,
    tags: ["walkthrough", `wt:${key}`],                   // the link the checklist follows
    position: i,
  };
});

const tooLong = steps.filter((s) => s.instruction.length > 1000);
if (tooLong.length) {
  console.error("these steps exceed the 1000-character instruction limit and would be truncated:");
  for (const s of tooLong) console.error(`  ${s.title} — ${s.instruction.length}`);
  process.exit(1);
}

console.log(`Guide: ${TITLE}  (id ${SOP_ID}, slug ${SLUG})`);
console.log(`Steps: ${steps.length}`);
for (const s of steps) console.log(`  ${String(s.position + 1).padStart(2)}. ${s.title.padEnd(34)} ${s.instruction.length} chars  [${s.tags.join(" ")}]`);

if (DRY) { console.log("\nDRY RUN — nothing written."); process.exit(0); }

const DB = path.join(process.cwd(), "data", "dashboard.db");
if (!fs.existsSync(DB)) { console.error("\nno database at " + DB); process.exit(1); }

const { saveSopDraft, publishSop, getSop } = await import("../lib/db.js");

saveSopDraft({
  id: SOP_ID,
  title: TITLE,
  business: "IOT TECHS",
  category: "Install",
  transcript: "Imported from docs/camera-install-training-manual.md by scripts/import-install-manual.mjs.",
  steps,
  createdBy: "import",
});
const { slug, version } = publishSop(SOP_ID, { visibility: "internal", publishedBy: "import", slug: SLUG });
const sop = getSop(SOP_ID);
console.log(`\nPublished v${version} at /guides/${slug} — ${sop.status}, ${sop.visibility}, ${sop.steps.length} steps.`);
console.log("Re-running this script updates the same guide; it never creates a second one.");
