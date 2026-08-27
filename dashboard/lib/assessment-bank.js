// IOT TECHS technician pre-hire assessment — the question bank + core (non-AI) scoring.
// Source of truth: dashboard/docs/hiring/pre-hire-assessment.md. 25 Q / 100 pts.
//   Q1–20  type "scored":     3 pts (answer) + 1 pt (explanation, graded by AI 1/0.5/0)
//   Q21–25 type "behavioral": each choice carries its own 0–4 score, no right/wrong
// Auto-flags fire off the raw answer; explanation-content flags come from the AI pass.

export const ASSESSMENT_META = { total: 25, maxScore: 100, timeLimitMin: 30 };

// The candidate-facing pass line. 70 = Tier C ("manual review") and up — the same bar the tier
// table already treats as viable. Candidates see only pass/fail; the number/tier stays internal.
export const PASS_SCORE = 70;
export function didPass(assessment) {
  return assessment?.status === "graded" && (assessment.score ?? 0) >= PASS_SCORE;
}

export const CATEGORIES = [
  { key: "tools",      label: "Tools, Materials & Installation",                q: [1, 5],   max: 20 },
  { key: "trouble",    label: "Troubleshooting & Technical Reasoning",          q: [6, 10],  max: 20 },
  { key: "process",    label: "Dispatch, Documentation & Process",              q: [11, 15], max: 20 },
  { key: "field",      label: "Communication, Accountability & Field Judgment", q: [16, 20], max: 20 },
  { key: "behavioral", label: "Behavioral Judgment & Personality",              q: [21, 25], max: 20 },
];

// s() = a scored (Q1–20) question. b() = a behavioral (Q21–25) question.
const s = (n, cat, prompt, choices, answer, explainHint, flag) =>
  ({ n, cat, type: "scored", prompt, choices, answer, requireExplanation: true, explainHint, flag: flag || null });
const b = (n, prompt, choices) => ({ n, cat: "behavioral", type: "behavioral", prompt, choices });

export const QUESTIONS = [
  // ── Category 1 · Tools, Materials & Installation ──────────────────────────
  s(1, "tools",
    "You need to make a 3/8-inch penetration through a poured concrete wall for a low-voltage cable. Which setup is most appropriate?",
    { A: "Impact driver with a standard twist bit", B: "Hammer drill or rotary hammer with the appropriate carbide masonry bit", C: "Drill driver with a step bit", D: "Oscillating tool with a metal blade" },
    "B", "Poured concrete needs masonry equipment + a carbide bit; a standard metal/wood bit is wrong."),
  s(2, "tools",
    "You need to enlarge an existing hole in a thin steel electrical enclosure without badly deforming the material. Which option is generally most appropriate?",
    { A: "Spade bit", B: "Masonry bit", C: "Step bit", D: "Brad-point bit" },
    "C", "A step bit progressively enlarges holes in thin metal while keeping control."),
  s(3, "tools",
    "You're mounting equipment to hollow concrete block. Which approach is generally best?",
    { A: "Use a fastener selected specifically for the block and expected load", B: "Use coarse drywall screws because the block provides enough friction", C: "Use wood screws with washers", D: "Drive self-tapping screws directly into the block" },
    "A", "The fastener must match the substrate and the load, not just 'a screw.'"),
  s(4, "tools",
    "Which sequence represents T568B from pins 1 through 8?",
    { A: "White/Green, Green, White/Orange, Blue, White/Blue, Orange, White/Brown, Brown", B: "White/Orange, Orange, White/Green, Blue, White/Blue, Green, White/Brown, Brown", C: "White/Orange, Orange, White/Blue, Blue, White/Green, Green, White/Brown, Brown", D: "White/Brown, Brown, White/Green, Blue, White/Blue, Green, White/Orange, Orange" },
    "B", "Keep the same approved standard at both ends unless intentionally making a crossover. (Do not auto-reject for missing this — a strong apprentice learns it fast.)"),
  s(5, "tools",
    "You're preparing to drill above a commercial doorway and don't know what is behind the finished surface. What is the best first approach?",
    { A: "Make a small pilot hole and determine what you encounter", B: "Identify the construction, inspect both sides where possible, and check for likely electrical, plumbing, fire-protection or structural conflicts", C: "Drill from the outside toward the inside because damage will be less visible", D: "Use the shortest available bit so it cannot reach anything important" },
    "B", "Drilling can hit utilities, structure, and finishes — investigate before you drill.",
    { A: "safety", C: "safety" }),

  // ── Category 2 · Troubleshooting & Technical Reasoning ────────────────────
  s(6, "trouble",
    "A new PoE camera has no link indication at the switch. Another camera works correctly when connected to that same switch port. What is the most logical next step?",
    { A: "Replace the NVR", B: "Check the cable path and terminations between the switch and affected camera", C: "Change the camera's IP address", D: "Reboot the router" },
    "B", "The working port eliminates part of the system and narrows the fault to the cable/termination/device — isolate variables."),
  s(7, "trouble",
    "A cable tester reports pins 1, 2, 3, 6, 7 and 8 correctly, but pins 4 and 5 are open. What should you investigate first?",
    { A: "Internet service", B: "Both terminations and conductor seating", C: "NVR configuration", D: "Camera resolution settings" },
    "B", "The tester already points to a physical conductor/termination problem (poor crimp, unseated conductor, bad RJ45, punch-down, cable damage)."),
  s(8, "trouble",
    "A camera powers up and can be reached directly from a laptop, but the recorder will not add it. What should you investigate next?",
    { A: "Mounting location", B: "Recorder compatibility, network settings, credentials and camera protocol", C: "Cable jacket color", D: "Available hard-drive capacity" },
    "B", "Power and basic connectivity are proven; move higher in the system instead of rechecking what works."),
  s(9, "trouble",
    "Four cameras connected to the same remote PoE switch suddenly go offline together while cameras connected elsewhere remain operational. Which area should you investigate first?",
    { A: "Each individual camera", B: "The common switch, uplink and power source serving those four devices", C: "Monitor resolution", D: "Recorder hard drive" },
    "B", "Multiple devices failing together → look for what they share (the common point of failure)."),
  s(10, "trouble",
    "You have spent ~20 minutes testing a problem, eliminated the obvious causes, still cannot identify the fault, and several other assigned tasks remain. What is the best course of action?",
    { A: "Continue until the problem is solved regardless of how long it takes", B: "Skip the item and say nothing until the end of the day", C: "Record what has been tested, escalate the issue, and continue productive work while awaiting direction", D: "Replace multiple components until something works" },
    "C", "Document → escalate → remain productive. Managing company time is part of the job.",
    { A: "communication" }),

  // ── Category 3 · Dispatch, Documentation & Process ────────────────────────
  s(11, "process",
    "A customer asks you to relocate two cameras while you're already on site, but the change does not appear anywhere in your assigned scope. What should happen first?",
    { A: "Complete the change if there is enough time", B: "Confirm the requested change through the company's authorization process before proceeding", C: "Give the customer an approximate price and continue", D: "Complete one camera as a courtesy" },
    "B", "Customer request ≠ authorized scope — labor, material, pricing, liability, scheduling all follow from authorization.",
    { A: "process", C: "process", D: "process" }),
  s(12, "process",
    "Before beginning work, you notice a cracked ceiling tile and damaged molding directly beside your installation area. What should you do?",
    { A: "Continue because the damage isn't related to your work", B: "Record the condition with clear photos and appropriate job notes before beginning", C: "Ask the customer whether they already knew about it and leave it at that", D: "Mention it to another technician" },
    "B", "Documentation beats conversation — photo + note + timestamp before touching the area."),
  s(13, "process",
    "During a phone call, your supervisor changes the location of two devices and gives you permission to use a different cable route. What should you do after the call?",
    { A: "Continue based on memory", B: "Add a written record of the change to the job documentation", C: "Tell the customer what the supervisor said", D: "Wait for the supervisor to visit the site" },
    "B", "Verbal authorization becomes documented authorization."),
  s(14, "process",
    "Which closeout note provides the most useful information?",
    { A: "“Finished cameras.”", B: "“Job complete. Everything working.”", C: "“Installed cameras 5–8, tested live view and recording, camera 7 requires final angle approval; before/after photos uploaded.”", D: "“Done except one thing.”" },
    "C", "The note should tell the next person exactly what happened without another conversation — a manager can open it 3 months later and understand it."),
  s(15, "process",
    "A device has been physically installed and appears operational. Which best determines whether the assigned task is complete?",
    { A: "Equipment has power", B: "Customer says it looks good", C: "Required testing, documentation, cleanup, photos and closeout steps have been completed", D: "Installation took the expected amount of time" },
    "C", "Installation is only one component of job completion."),

  // ── Category 4 · Communication, Accountability & Field Judgment ───────────
  s(16, "field",
    "Traffic will likely make you arrive 15 minutes after the expected arrival window. What should you do?",
    { A: "Wait until you actually become late", B: "Notify the appropriate company contact as soon as the delay becomes reasonably clear", C: "Contact the customer and reschedule yourself", D: "Skip the initial walkthrough" },
    "B", "Proactive communication.",
    { A: "communication" }),
  s(17, "field",
    "While drilling, you accidentally chip a finished surface approximately two inches from the mounting location. Equipment will hide most of it. What should you do?",
    { A: "Install equipment and say nothing", B: "Repair it privately", C: "Stop, record the condition and notify the appropriate supervisor", D: "Ask another technician whether the customer will notice" },
    "C", "Disclose mistakes even when unlikely to be discovered — you can teach Cat6, integrity is harder.",
    { A: "integrity", B: "integrity" }),
  s(18, "field",
    "A customer asks what four additional cameras would cost and offers to pay you directly. What should you do?",
    { A: "Accept because you know the normal price", B: "Give them an estimate but don't accept payment", C: "Route the request through the company's approval/sales process", D: "Refuse to discuss it" },
    "C", "Authority boundaries + the company owns the customer relationship.",
    { A: "integrity" }),
  s(19, "field",
    "One assigned device cannot be completed because a required mounting bracket is missing. What should you do?",
    { A: "Wait until somebody brings it", B: "Substitute another mounting method without approval", C: "Record the issue, communicate what is required and continue another available assignment", D: "Mark it complete and return later" },
    "C", "Productive escalation — blocked ≠ stop working.",
    { B: "process", D: "integrity" }),
  s(20, "field",
    "A customer says another technician promised something not shown in your work order. What should you do?",
    { A: "Tell the customer the other technician was wrong", B: "Complete it", C: "Record the request and obtain direction before modifying scope", D: "Ignore them" },
    "C", "Professional with the customer while protecting company scope.",
    { B: "process" }),

  // ── Category 5 · Behavioral & Personality (choice-scored 0–4) ─────────────
  b(21, "You have completed similar installations hundreds of times. A supervisor asks you to use a different procedure.",
    { A: { t: "Use your own method", score: 1 }, B: { t: "Follow without asking why", score: 3 }, C: { t: "Understand the reason and follow the procedure unless an approved change is made", score: 4 }, D: { t: "Follow only while supervised", score: 0 } }),
  b(22, "You discover a mistake you made earlier that can be corrected in five minutes.",
    { A: { t: "Fix it and say nothing", score: 2 }, B: { t: "Correct it and document/report it appropriately", score: 4 }, C: { t: "Leave it unless it becomes a problem", score: 0, flag: "integrity" }, D: { t: "Ask another technician whether to report it", score: 1 } }),
  b(23, "You've completed everything currently assigned to you, but the project remains active.",
    { A: { t: "Leave", score: 0 }, B: { t: "Wait until somebody gives you something", score: 2 }, C: { t: "Report completion and request the next priority", score: 4 }, D: { t: "Select another task yourself without approval", score: 3 } }),
  b(24, "A less-experienced technician shows you a cleaner, faster method.",
    { A: { t: "Ignore it because you have more experience", score: 1 }, B: { t: "Evaluate it objectively and adopt it if it meets company standards", score: 4 }, C: { t: "Only use it around that technician", score: 2 }, D: { t: "Ask management to stop them from correcting you", score: 0 } }),
  b(25, "You discover an issue that may add several hours and aren't sure whether you can solve it yourself.",
    { A: { t: "Keep troubleshooting indefinitely", score: 2 }, B: { t: "Stop everything until management answers", score: 1 }, C: { t: "Gather useful information, report it and continue productive work", score: 4 }, D: { t: "Don't mention it until you've diagnosed everything", score: 1 } }),
];

export const Q_BY_N = Object.fromEntries(QUESTIONS.map((q) => [q.n, q]));

// ── Core (non-AI) scoring ────────────────────────────────────────────────
// responses = { "1": {answer:"B", explanation:"..."}, ..., "21": {answer:"C"}, ... }
// Returns the auto-computable parts; explanation points (0–20) are added later by the AI pass.
export function scoreCore(responses = {}) {
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.key, { answer: 0, behavioral: 0, explain: 0, max: c.max }]));
  const autoFlags = [];
  let answerPoints = 0, behavioralPoints = 0;

  for (const q of QUESTIONS) {
    const r = responses[String(q.n)] || {};
    if (q.type === "scored") {
      const correct = r.answer && r.answer === q.answer;
      if (correct) { answerPoints += 3; cats[q.cat].answer += 3; }
      if (q.flag && r.answer && q.flag[r.answer]) autoFlags.push({ kind: q.flag[r.answer], q: q.n, source: "answer" });
    } else { // behavioral
      const choice = q.choices[r.answer];
      const sc = choice ? (choice.score || 0) : 0;
      behavioralPoints += sc; cats.behavioral.behavioral += sc;
      if (choice?.flag) autoFlags.push({ kind: choice.flag, q: q.n, source: "answer" });
    }
  }
  // auto subtotal = everything except the 20 explanation points
  const autoScore = answerPoints + behavioralPoints;
  return { answerPoints, behavioralPoints, autoScore, cats, autoFlags };
}

export function tierOf(score) {
  if (score >= 90) return { key: "A", label: "Strong Candidate", next: "Phone interview" };
  if (score >= 80) return { key: "B", label: "Qualified Candidate", next: "Phone interview" };
  if (score >= 70) return { key: "C", label: "Manual Review", next: "Review where points were lost" };
  if (score >= 60) return { key: "D", label: "Apprentice Consideration", next: "Interview only if strong mechanical/accountability" };
  return { key: "F", label: "Normally Decline", next: "Decline unless exceptional reason" };
}

export function categoryBand(catKey, score) {
  if (catKey === "behavioral") {
    if (score >= 18) return "Excellent"; if (score >= 15) return "Strong"; if (score >= 11) return "Mixed"; return "High-risk";
  }
  if (score >= 18) return "Excellent"; if (score >= 15) return "Good"; if (score >= 12) return "Developing"; return "Weak";
}
