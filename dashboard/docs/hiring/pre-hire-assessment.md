# IOT TECHS — Technician Pre-Hire Assessment & Scoring System

> Owner-authored spec (source of truth for the Portal 1 assessment engine). Do not paraphrase away the intent: **numeric score AND independent flags** are two separate systems — a high score never clears a red flag.

- **Total questions:** 25 · **Max score:** 100 · **Time limit:** 35–45 min
- **Five categories, 20 pts each:**

| # | Category | Questions | Max |
|---|----------|-----------|-----|
| 1 | Tools, Materials & Installation | 1–5 | 20 |
| 2 | Troubleshooting & Technical Reasoning | 6–10 | 20 |
| 3 | Dispatch, Documentation & Process | 11–15 | 20 |
| 4 | Communication, Accountability & Field Judgment | 16–20 | 20 |
| 5 | Behavioral Judgment & Personality | 21–25 | 20 |

## Scoring model

**Questions 1–20** — 4 pts each: **answer 3 pts** (correct=3, wrong=0) + **explanation 1 pt** (clear=1, partial=0.5, none/incorrect/guess=0). Explanation is a 1–2 sentence "why did you pick this" — it separates *knows it* from *clicked the right box*. Explanations are required only on the flagged questions (see each question).

**Questions 21–25 (behavioral)** — no right/wrong; each choice carries a behavioral score 0–4 (below).

**Auto vs review:** answer selection (Q1–20) and behavioral (Q21–25) auto-score = up to 80. The 20 explanation points need grading (AI-assisted first pass + human confirm — see engine notes).

---

## Category 1 — Tools, Materials & Installation

**Q1.** 3/8" penetration through poured concrete for low-voltage cable — best setup?
A. Impact driver + twist bit · B. **Hammer/rotary hammer + carbide masonry bit** · C. Drill driver + step bit · D. Oscillating tool + metal blade
→ **B.** Explain: concrete needs masonry equipment+bit; a metal/wood bit is wrong. Tests tool/material match, concrete experience, avoiding equipment damage. Concern: "I'd just use whatever bit gets through" = poor tool discipline.

**Q2.** Enlarge an existing hole in thin steel enclosure without deforming it?
A. Spade · B. Masonry · C. **Step bit** · D. Brad-point
→ **C.** Explain: step bit progressively enlarges thin metal with control. Red flag: masonry/wood bit "it'll eventually make a hole."

**Q3.** Mounting equipment to hollow concrete block — best approach?
A. **Fastener selected for the block + expected load** · B. Coarse drywall screws (friction) · C. Wood screws + washers · D. Self-tapping directly into block
→ **A.** Explain: discusses substrate + weight/load + proper anchoring, not just "a screw." Core principle: fastener matches material and load.

**Q4.** T568B pins 1–8?
A. WG,G,WO,Bl,WBl,O,WBr,Br · B. **WO,O,WG,Bl,WBl,G,WBr,Br** · C. WO,O,WBl,Bl,WG,G,WBr,Br · D. WBr,Br,WG,Bl,WBl,G,WO,O
→ **B.** Explain: keep the same approved standard at both ends unless intentionally making a crossover. **Do NOT auto-reject for missing this** — a strong apprentice learns T568B fast (Technical, not integrity).

**Q5.** Drilling above a commercial doorway, unknown what's behind — best first step?
A. Small pilot hole and see · B. **Identify construction, inspect both sides, check for electrical/plumbing/fire/structural conflicts** · C. Drill outside→in (damage less visible) · D. Shortest bit so it can't reach anything
→ **B.** Explain: drilling can hit utilities/structure/finishes. **CRITICAL SAFETY FLAG:** choosing A or C and defending it aggressively = "drill first, investigate after" mentality → review.

**Bands (per category, /20):** 18–20 Excellent · 15–17.5 Good · 12–14.5 Developing · <12 Weak.

---

## Category 2 — Troubleshooting & Technical Reasoning

**Q6.** New PoE camera: no link at switch; another camera works on that same port. Next step?
A. Replace NVR · B. **Check cable path + terminations between switch and affected camera** · C. Change camera IP · D. Reboot router
→ **B.** Explain: the working port eliminates part of the system, narrowing to cable/termination/device. Tests *isolate variables*.

**Q7.** Tester: pins 1,2,3,6,7,8 good; **4,5 open**. Investigate first?
A. Internet service · B. **Both terminations + conductor seating** · C. NVR config · D. Camera resolution
→ **B.** Explain: tester already shows a physical conductor/termination problem. Strong answers mention poor crimp / unseated conductor / damaged conductor / bad RJ45 / punch-down / cable damage.

**Q8.** Camera powers up + reachable from laptop, but recorder won't add it. Next?
A. Mounting location · B. **Recorder compatibility, network settings, credentials, camera protocol** · C. Cable jacket color · D. HDD capacity
→ **B.** Explain: power + basic connectivity proven; move up the system instead of rechecking what's proven.

**Q9.** Four cameras on one remote PoE switch go offline together; others fine. Investigate first?
A. Each camera · B. **The common switch/uplink/power serving those four** · C. Monitor resolution · D. Recorder HDD
→ **B.** Explain: common point of failure — "multiple devices failing together → look for what they share."

**Q10.** ~20 min in, obvious causes eliminated, still stuck, other tasks remain. Best action?
A. Continue regardless of time · B. Skip and say nothing until EOD · C. **Record what's tested, escalate, continue productive work while awaiting direction** · D. Swap parts until something works
→ **C.** Explain: *document → escalate → remain productive*; managing company time is part of the job. Red flag: arguing hard for A (may burn 4 hrs on a 30-min escalation).

---

## Category 3 — Dispatch, Documentation & Process

**Q11.** Customer asks (on site) to relocate two cameras, not in scope. First?
A. Do it if time · B. **Confirm through the company authorization process before proceeding** · C. Give a price and continue · D. Do one as a courtesy
→ **B.** Explain: customer request ≠ authorized scope; labor/material/pricing/liability/scheduling. (Process flag if changes scope without auth.)

**Q12.** Before work, you see a cracked ceiling tile + damaged molding beside your area.
A. Continue (unrelated) · B. **Record with clear photos + job notes before beginning** · C. Ask if they knew, leave it · D. Mention to another tech
→ **B.** Explain: document *before touching the area*. Principle: **documentation beats conversation** — photo + note + timestamp, not "the customer knew."

**Q13.** Supervisor changes two device locations + approves a different cable route by phone. After the call?
A. Continue from memory · B. **Add a written record of the change to the job docs** · C. Tell the customer what the super said · D. Wait for the super to visit
→ **B.** Explain: verbal authorization becomes documented authorization.

**Q14.** Most useful closeout note?
A. "Finished cameras." · B. "Job complete. Everything working." · C. **"Installed cameras 5–8, tested live view + recording, camera 7 needs final angle approval; before/after photos uploaded."** · D. "Done except one thing."
→ **C.** Explain: the note tells the next person exactly what happened without another conversation. Standard: a manager opens the job 3 months later and understands it.

**Q15.** Device installed + appears operational. Best determines task complete?
A. Has power · B. Customer says it looks good · C. **Required testing, documentation, cleanup, photos + closeout done** · D. Took the expected time
→ **C.** Explain: installation is only one part of completion.

---

## Category 4 — Communication, Accountability & Field Judgment

**Q16.** Traffic → ~15 min past the arrival window.
A. Wait until actually late · B. **Notify the appropriate company contact as soon as the delay is reasonably clear** · C. Contact customer + reschedule yourself · D. Skip the walkthrough
→ **B.** Explain: proactive communication.

**Q17.** Drilling chips a finished surface ~2" from the mount; equipment will hide most of it.
A. Install + say nothing · B. Repair it privately · C. **Stop, record the condition, notify the supervisor** · D. Ask another tech if the customer will notice
→ **C.** Explain: disclose mistakes even when unlikely to be found. **CRITICAL INTEGRITY QUESTION** — choosing A is a major red flag; A + "if nobody can see it, it doesn't matter" can override an otherwise strong score. You can teach Cat6; integrity is harder.

**Q18.** Customer asks the cost of 4 more cameras and offers to pay you directly.
A. Accept (you know the price) · B. Estimate but don't accept payment · C. **Route through the company approval/sales process** · D. Refuse to discuss
→ **C.** Explain: authority boundaries + company owns the customer relationship. Choosing A → significant integrity/business-conduct review.

**Q19.** One device can't be finished — required mounting bracket is missing.
A. Wait for someone to bring it · B. Substitute a method without approval · C. **Record the issue, communicate what's needed, continue another assignment** · D. Mark complete, return later
→ **C.** Explain: productive escalation — *blocked ≠ stop working*.

**Q20.** Customer says another tech promised something not in your work order.
A. Tell them the other tech was wrong · B. Just do it · C. **Record the request + get direction before modifying scope** · D. Ignore them
→ **C.** Explain: professional with the customer while protecting company scope.

---

## Category 5 — Behavioral & Personality (Q21–25, choice-scored 0–4)

**Q21.** Done a similar install hundreds of times; supervisor asks for a different procedure.
A. Use your own method — **1** · B. Follow without asking why — **3** · C. **Understand the reason and follow unless an approved change is made — 4** · D. Follow only while supervised — **0**

**Q22.** You find a mistake you made, fixable in 5 min.
A. Fix it, say nothing — **2** · B. **Correct it and document/report appropriately — 4** · C. Leave it unless it becomes a problem — **0** · D. Ask another tech whether to report — **1**

**Q23.** Everything assigned is done; project still active.
A. Leave — **0** · B. Wait for someone to give you something — **2** · C. **Report completion + request next priority — 4** · D. Pick another task yourself without approval — **3** (initiative, needs boundaries; possible leadership)

**Q24.** A less-experienced tech shows you a cleaner, faster method.
A. Ignore it (more experience) — **1** · B. **Evaluate objectively, adopt if it meets standards — 4** · C. Only use it around that tech — **2** · D. Ask mgmt to stop them correcting you — **0**

**Q25.** You find an issue that may add several hours; unsure you can solve it.
A. Keep troubleshooting indefinitely — **2** · B. Stop everything until mgmt answers — **1** · C. **Gather info, report it, continue productive work — 4** · D. Don't mention it until fully diagnosed — **1**

**Behavioral bands (/20):** 18–20 Excellent · 15–17 Strong · 11–14 Mixed (test concerns in interview/ride-along) · 0–10 High-risk.

---

## Overall tiers

- **90–100 · Tier A — Strong.** Move aggressively → phone → in-person.
- **80–89.5 · Tier B — Qualified.** Move forward; minor gaps, trainable.
- **70–79.5 · Tier C — Manual review.** Don't auto-decline — look at *where* points were lost (missing networking ≠ hiding mistakes).
- **60–69.5 · Tier D — Apprentice consideration only.** Interview only if strong mechanical/work-ethic/accountability/coachability.
- **<60 · Tier F — Normally decline.**

## Flags (independent of score — a 88 can still be flagged)

- **RED · Safety** — willing to blindly drill unknown surfaces, use inappropriate tools, ignore hazards, bypass safe practice to save time.
- **RED · Integrity** — hide damage / hide significant mistakes / falsify completion / take customer payments independently / conceal information.
- **RED · Process** — change scope without authorization / repeatedly ignore dispatch / refuse documentation / bypass approval.
- **YELLOW · Communication** — communicates only after a problem is serious / avoids escalation / leaves without reporting status / poor written explanations.
- **YELLOW · Technical** — trainable gaps: forgot T568B, limited NVR/access-control experience, never used a specific tool. **Not** treated like an integrity problem.

Auto-flag triggers (from answers): Q5 A/C → Safety · Q17 A → Integrity · Q18 A → Integrity · Q11 wrong → Process · Q2 A/B/D "it'll eventually work" → Safety. Explanation-content flags come from the graded free text.

## Candidate profile (generated after the test)

Overall score + Tier classification · per-category score + band + one-line narrative · **traits** (Coachability, Accountability, Technical Aptitude, Problem Solving, Communication, Documentation, Initiative, Process Compliance, Safety Awareness, Leadership Potential) · **flags** (critical + yellow) · **recommended hiring level** (Apprentice/Technician/Lead) · **recommended next step**.

## Phone-interview hand-off

The interviewer gets the report **before** the call. The portal generates interview questions from the candidate's **weak areas / flags**, e.g. *"You said you prefer to fully solve a problem before involving a supervisor — walk me through your reasoning."* — not "tell me about yourself."

## Hiring philosophy (three separate judgments)

1. **Can they do the work?** technical + tools + troubleshooting.
2. **Can they be trusted with the work?** integrity + documentation + accountability.
3. **Can they operate without constant supervision?** communication + initiative + judgment + process.
Technical gaps train; poor integrity/accountability/system-compliance are much harder to fix.

## Core technician principles (the answer key's spine)
Right tool for the job · understand the material before drilling/cutting/mounting · troubleshoot systematically, don't guess · documentation beats conversation · stuck → document → communicate → escalate → stay productive · never change scope without authorization · own mistakes immediately · an install isn't finished until tested, documented, and closed out.
