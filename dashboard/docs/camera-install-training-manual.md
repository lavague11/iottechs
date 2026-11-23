# IOT TECHS Security Camera Installation & Training Manual

Internal training draft, November 2026, version 2.0. It follows the same nine steps as the Camera Installation Walkthrough checklist, so a technician trains on this manual and works from the checklist.

Three rules run through everything: use your eyes, work smart not hard, and do it well. Safe work always outranks a time target.

## Contents

1. Principles of installation
2. Reading the site survey
3. Arrival and site reading
4. Preparation and tool kits
5. Installation order and time targets
6. NVR and network setup
7. Drilling and cable pulling
8. Termination, mounting and live view
9. Troubleshooting and judgment
10. Technician QC and PM handoff
11. Eight-camera case study
12. Check for understanding
13. Safety boundaries and references

## 1. Principles of installation

See the job, plan the job, execute efficiently, verify the work. A strong technician knows why the next step matters before starting it.

### Use your eyes

Your eyes are your best tool before, during and after the install. Look at distances, the structure, existing routes and cable, access, shared paths, and how the finished job will look.

Ask yourself: what is this building telling me? Is there a usable path or a tested cable already here? What would save a future trip or an extra hole?

Planning keeps going while you work. Ceilings, walls and obstacles become clearer as you go, so reassess before you commit more work.

The rule: observe, plan, act, reassess.

### Work smart, not hard

Longest runs first. Go by distance and total time, not by which camera is highest or hardest. Do the long grouped runs early while energy is high, and the short branches get easy later.

The assembly line rule: group the same kind of work to cut tool changes, truck trips and setup. Mark and plan entries, drill them all, pull shared cable groups, secure the runs, then terminate, mount and test.

Speed comes from cutting unnecessary actions, not from rushing each action.

### Don't gamble, use logic

The easy way out isn't always the easy way out. Inspect the cable and the test result. Tell a bad connector from a damaged run. Compare the total time of repairing versus replacing before you start.

The 10-minute checkpoint: troubleshoot for up to 10 minutes, then report what you tested. If it's still unresolved, move to the next safe task and get a decision.

### Do it well

Neat, straight, level. Check cable appearance, mounting alignment and overall finish, and fix visible defects before handoff.

### Communicate early, never wait idle

| Situation | What to do |
| --- | --- |
| Routine change | Pick a safe route or in-scope hole and note it in the work order |
| Unexpected blockage | Record it, notify the PM and explain the options |
| No PM answer in 30 minutes | Move to another safe productive task |
| Unsafe condition | Stop that activity and escalate. Never improvise through a hazard |

### Prove it with photos

Photos protect you, the company and the customer. Take them at every step, not just at the end:

- Before: each camera and NVR location as you found it
- During: exterior entries, cable runs before they're closed up
- After: each mounted camera, the NVR and drive status, the clean site

Upload every photo under the matching name in the work order.

## 2. Reading the site survey

The survey is your map and your starting plan. It is not permission to drill blindly.

1. Stand at the curb and face the property.
2. Pick a clear landmark: the street edge, parking lot or entrance.
3. Find that same edge on the survey on your phone.
4. Hold the phone flat and rotate it until both edges run the same way.
5. Check a second landmark, like a building corner or driveway, before pointing at any camera spot.
6. Use the camera names from the work order.

Practice: using the case study survey in chapter 11, have the trainee find the parking lot, the office and the NVR point before suggesting a cable route.

## 3. Arrival and site reading

The first 15 minutes confirm the job. It's not a new survey, so only take longer if the building or safety calls for it.

| Order | Action | Done when |
| --- | --- | --- |
| 1 | Greet the customer, confirm access and the work order | Access confirmed |
| 2 | Confirm two permanent outlets for the NVR and display, a third if a Wi-Fi extender is planned. Note if a temporary extension cord is needed | Power plan set, hazards raised |
| 3 | Confirm camera names and locations, the NVR and monitor spot, and the survey | Names and coverage understood |
| 4 | Look for shared paths, longest runs, usable cable, obstacles and drilling limits | Work order of attack is clear |
| 5 | Take before photos of each camera and NVR location | Photos uploaded |

Keep confirming the survey all job long. New ceiling access, existing cable or a better route can change the plan. Make safe, in-scope changes and note them in the work order.

## 4. Preparation and tool kits

Bring what each phase needs so you're not changing tools or walking back to the truck. Before every phase, check: right tools, right materials, charged batteries, safe access, enough stock for every camera.

The full tool and material list is the load-out table at the start of the Walkthrough checklist. Check every tool out and back in.

| Phase | Key tools | Key materials |
| --- | --- | --- |
| NVR setup | Drill/driver, small screwdrivers, monitor, HDMI, mouse, phone | NVR, hard drive, patch cables, mounting hardware |
| Drilling | Impact driver, hammer drill, SDS drill, bits, stud and wire detector, safety glasses, M12 vacuum | Sleeves, grommets, anchors, sealant |
| Cable pulling | Fish poles, fish tape, pull string, cable cutter, ladder | Outdoor-rated 100% copper Cat6, zip ties, clips |
| Termination | Stripper, pass-through crimper, Scout Pro 3 tester, toner | Pass-through RJ45s, labels, spare connectors |
| Mounting | Drill/driver, marker, level, ladder | Camera, three screws each, anchors, weatherproof RJ45 boot, junction box |
| Cleanup | M12 vacuum, cable cutter | Trash bags, cleaning supplies |

Extension cords are for temporary power only, like a corded SDS drill or temporary NVR setup. Never leave one as permanent equipment power.

## 5. Installation order and time targets

Know the whole sequence before the first task.

| Step | Phase | Target |
| --- | --- | --- |
| 1 | Arrive, greet, confirm survey and power | 15 min |
| 2 | Stage tools, cable and equipment by phase | Site-specific |
| 3 | NVR, display, network and drive setup | 30 min, +15 per monitor or TV mount if ordered |
| 4 | Plan routes, mark and drill all entries | Site-specific |
| 5 | Pull and manage cable, longest shared routes first | About 90 min per camera |
| 6 | Terminate both ends, mount, aim, live check | About 30 min per camera |
| 7 | Final NVR check: online, drive Normal, instant replay | Part of finishing |
| 8 | Photos, cleanup, work order, PM handoff | Right at completion |

The two-hour camera baseline: about 90 minutes for cable plus 30 for termination, mounting and live check. Planning, NVR setup and obstacles are extra.

Smaller targets: a three-screw twist-on mount takes about 5 minutes, anchors add about 5. Startup and aim take about 5. Each pass-through termination takes about 5 minutes per end.

Targets are goals, not permission to rush. Rework and injuries cost far more than a few saved minutes.

## 6. NVR and network setup

Set up the NVR early so network and storage problems show up while camera work continues.

| Order | Action | Pass check |
| --- | --- | --- |
| 1 | Position and connect the monitor; select the right input | Display ready |
| 2 | Connect the NVR network port to the planned network path | Patch connected |
| 3 | With power disconnected, install the hard drive and secure it | Drive fitted before power-on |
| 4 | Power up, get the NVR online, set network and system settings | NVR online |
| 5 | Initialize the drive; set time, schedule, storage and account | Drive recognized, status Normal |
| 6 | Complete QR/app enrollment if assigned; channels appear as cameras connect | Settings saved, feeds live |

Never open the NVR or insert a drive while it's powered, unless that exact model supports hot-swap. Follow the manufacturer's steps.

End-of-job NVR check: NVR online, every camera live and aimed, drive status Normal, one instant replay plays. The PM handles channel naming, recording settings, remote viewing and the customer.

## 7. Drilling and cable pulling

### Mark and drill in one batch

- Compare the survey, the structure and the camera spots.
- Count the entries you need, mark them, and pick the right bit for wood, metal or masonry.
- Check for hidden pipes, wires and structural members with a detector before every hole.
- Drill all approved entries in one pass instead of switching tools back and forth.
- Sleeve or grommet entries, and seal every exterior hole with a weatherproof sealant after routing.
- Vacuum the dust as you go.

Stop-work rule: unknown utilities, structural members, unsafe roof access or any serious hazard are not routine changes. Stop that activity, protect the area and call the PM.

### Longest shared routes first

- Start from the NVR side and find the long segments several cameras share.
- Stage enough cable to pull several full runs together with steady tension.
- Split each cable off only at its branch, and leave service slack at both ends.
- No kinking, crushing or pulling harder than the cable is rated for.
- In a drop ceiling, use real cable supports and keep away from electrical lines. Ceiling tiles and grid are not cable supports.
- Label every cable at both ends, and photograph runs before they get closed up.

### Manage the bundle as you go

- Keep runs neat, straight and consistent.
- Zip ties every 4 to 5 feet is a visual habit, not a code standard. Use approved supports and spacing for the location.
- Don't overtighten ties or deform the cable. Never fasten to sprinkler pipes, electrical conduit or other building systems.
- Outdoor-rated cable still needs protected routing, secure supports and sealed penetrations.

## 8. Termination, mounting and live view

### The 30-minute finishing target

| Task | Target | Result |
| --- | --- | --- |
| Terminate both ends | 10 min (5 + 5) | Connectors seated, cable tested |
| Three-screw twist-on mount | 5 min | Firm, level, right fasteners |
| Camera online and aimed | 5 min | Live image, coverage framed |
| Connector protection and final checks | 10 min | Outdoor seal done |

Anchors add about 5 minutes. Masonry or hard spots take longer.

### Pass-through termination

- Inspect the jacket and pick a connector rated for that cable.
- Prepare the pairs without extra untwisting, and use the same wiring scheme on every job.
- Seat the conductors fully, then trim and crimp with the matching pass-through tool.
- Test with the Scout Pro 3 and remote. Fix any open, short, reversal or split pair before mounting.
- A wiremap pass doesn't prove full cable performance. Certify when the job requires it.

### Mount and weatherproof

- Mark, drill and mount with three correct screws, anchors only where the surface needs them.
- Hide the RJ45 in an approved pocket hole, or protect it with a junction box.
- Seal outdoor connectors with a weatherproof boot or housing. Use dielectric grease only where the connector allows it.
- Electrical tape is a backup wrap, never the main weather seal.
- Confirm the live image, adjust the framing, and take the mounted photo under that camera's name before leaving the spot.

## 9. Troubleshooting and judgment

Think in total job time.

| Question | What to check |
| --- | --- |
| Is the old cable suitable? | Type, age, damage, indoor or outdoor exposure, routing, length, current termination |
| What did the test show? | Pass or fail; miswire, split pair, short, open, damaged section, intermittent link |
| What's the fastest reliable fix? | Reterminate a bad end when it makes sense; rerun when the cable is suspect |
| When do I stop? | Tell the PM right away, cap troubleshooting at 10 minutes without a new plan, then move to the next camera |

The time trap, as an example: 15 minutes trying the old cable, 15 diagnosing, 30 recrimping and retesting, and it still fails. That's 60 minutes lost, then 120 more for the new cable: 180 minutes total, versus 120 if you'd run new cable first.

If the PM is silent for 30 minutes, move to another safe productive task.

## 10. Technician QC and PM handoff

The technician proves what was installed. The PM owns final system QC and the customer.

| Check | Evidence |
| --- | --- |
| Every camera live and aimed | Live image on the monitor, plus the mounted photo under that camera's name |
| NVR online | Online state noted, NVR photo in the work order |
| Hard drive Normal | Drive status photo in the work order |
| Instant replay works | Recent footage played once, pass or fail noted |
| Site restored | Scraps, tie tails, packaging and dust removed; ceiling tiles replaced |
| Issues documented | Notes under the named camera entries |

| Technician owns | PM owns |
| --- | --- |
| Install, live feeds, NVR online, drive Normal, quick replay | Recording and playback audit, final settings, remote viewing |
| Photos at every step, issue notes, cleanup, work order | Channel naming to match the work order, customer app setup and handoff |
| Telling the PM about issues right away | The fix plan for documented exceptions |

Use the work-order tool for everything; no side photo collections. Mark the job ready and notify the PM. Customer handoff happens only after PM review.

## 11. Eight-camera case study

Use this to teach route grouping, not as a verified as-built design.

- Eight cameras; the NVR is on the office wall.
- Six cameras share one long route. The cable bundle carries 6 cables, drops to 5 after the first branch, then 3 after the next. It's the same bundle getting smaller, not 14 separate cameras.
- Two short drops sit near the office.
- Longest route is about 75 feet; another is about 50.
- There's drop-ceiling access, plus a possible exterior or roof route that needs safe access and protection.

Trainee questions, before any cable is pulled:

1. Which locations have the longest runs?
2. Which branches could share a route, and what can't you tell from the picture?
3. What would you check on site before picking entry holes or reusing cable?

Why grouping matters: pulling cameras one at a time at the two-hour baseline is about 16 labor hours for 8 cameras. Grouping the shared run could cut that to around 12. This is an illustration, not a guarantee or a pay rate. Measure real jobs and update the targets.

## 12. Check for understanding

Use as a 5-minute talk or written check before a technician's first field walkthrough.

1. Two cameras are close and three need long runs. Where do you start, and why?
2. A reused cable fails. What do you check before spending more time on it?
3. You've troubleshot for 10 minutes with no progress. What next?
4. You find a shorter safe route after starting. What do you do?
5. The PM hasn't answered in 30 minutes. What's your next step?

Answer key:

1. Long runs first when possible; shared paths save setup.
2. Cable type, condition, the test result, connector fault versus run fault, and total time.
3. Report what you tested, move to another safe task, and get a decision.
4. Check it's safe and in scope, switch if so, and note the change.
5. Move to a different safe task. Never push through a stop-work issue.

Pass standard: a sound reason, good judgment, blockers communicated, and a reliable result put first.

## 13. Safety boundaries and references

This manual supports training. It doesn't replace task-specific qualification.

Minimum rules now:

- Work alone only when the job can be done safely and company procedure allows it.
- Inspect ladders and tools before use. Keep three points of contact on a ladder, set it on firm level ground, and stay clear of power lines.
- Wear safety glasses when drilling, and check for hidden utilities before every hole.
- No extension cord as permanent power, and no electrical tape as the only outdoor seal.
- Outdoor-rated cable still needs proper support, protection and sealing.
- Stop unsafe work, tell the PM and get direction. No time target or bonus outranks safety.

Separate modules to build next: ladder and solo work, roof and exterior routing, drilling and penetrations, Cat6 termination and testing, camera mounting, and NVR setup by model.

References: OSHA Portable Ladder Safety QuickCard; Hikvision NVR Quick Start Guide, section 2.2 (disconnect power before installing a drive); Fluke Networks guidance on verification, qualification and certification.
