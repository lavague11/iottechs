# Bug Runner — Go-Live Runbook

The ordered, one-time setup to turn the `/bugs` queue into a working auto-fixer. Follow the gates in
order; each has a **Do** and a **Verify** — do not start the runner until every gate's Verify passes.
(Architecture + file map live in [README.md](./README.md); this is the operator checklist.)

## What actually keeps you safe (so you know what's load-bearing)

1. **The runner never merges.** `git.mjs` only ever pushes `claude/bug-<id>` branches (`--force-with-lease`); it never touches `main`. You review and merge by hand.
2. **Isolated, in a separate clone.** Every bug runs in its own git worktree off a **dedicated clone**, never your primary workspace. `assertSafe()` refuses to start otherwise.
3. **Untrusted code can't push.** `noGitAuthEnv()` strips git credentials from every untrusted child (Claude, `npm test`, `npm run build`, `node --test`), and the runner refuses any fix that touched `package.json` / lockfiles / `.husky/` / `.github/`.

GitHub branch protection (Gate 0) is a **secondary** net for the "what if something else pushes to main" case — valuable, but the three points above are the real guarantee.

---

## Gate 0 — GitHub safety net (owner, ~5 min)

**Do:** Protect `main` with a Ruleset (not classic protection — rulesets expose `bypass_actors`, classic doesn't). In GitHub → repo **Settings → Rules → Rulesets → New branch ruleset**: target `main`, enforcement **Active**, require a pull request, **no bypass actors**.

**Verify:**
```bash
gh api repos/lavague11/iottechs --jq '{isPrivate: .private, visibility, plan: .owner.plan.name}'
```
```bash
gh api repos/lavague11/iottechs/rulesets --jq '.[] | {id, name, enforcement}'
```
```bash
gh api repos/lavague11/iottechs/rulesets/<id> --jq '{enforcement, bypass_actors, rules: [.rules[].type]}'
```
Want: `enforcement: "active"`, `bypass_actors: []`, and a `pull_request` rule present.

> ⚠ **A private repo on the GitHub Free plan cannot enforce rulesets/branch protection.** If `isPrivate: true` and `plan` is `free`, this gate won't take effect — and that's acceptable, because the runner never pushes to `main` regardless. Either upgrade the plan, or rely on the runner's own discipline and skip to Gate 1.

---

## Gate 1 — the Claude Code CLI (required — it's not installed yet)

The runner spawns the standalone `claude` CLI. The desktop app does **not** provide it.

**Do:**
```bash
npm install -g @anthropic-ai/claude-code
```
Then authenticate it once (sign in): run `claude` interactively a single time and complete login.

**Verify (in a fresh terminal so PATH refreshes):**
```bash
claude --version
```
Smoke-test the exact headless path the runner uses. Create `%TEMP%\t.json` containing
`{"permissions":{"allow":["Read"],"deny":["Bash(git:*)"]}}`, then:
```bash
claude -p --output-format json --permission-mode acceptEdits --settings "%TEMP%\t.json" "Reply with exactly: runner-ok"
```
If the JSON result contains `runner-ok`, the headless path your runner depends on is alive. If `claude`
isn't found, note its full path and set `CLAUDE_BIN` to it in Gate 5.

---

## Gate 2 — the dedicated automation clone (never your primary workspace)

**Do:**
```powershell
cd C:\Users\La Vague\Desktop
git clone https://github.com/lavague11/iottechs.git iottechs-bug-runner
cd iottechs-bug-runner\dashboard
npm ci
```
Bless the clone with the gitignored safety marker (this file must **not** exist in your primary workspace):
```powershell
cd C:\Users\La Vague\Desktop\iottechs-bug-runner
"ok" | Out-File -NoNewline -Encoding ascii .bug-runner-ok
```

**Verify:** `C:\Users\La Vague\Desktop\iottechs-bug-runner\.bug-runner-ok` exists and
`...\iottechs-bug-runner\dashboard\node_modules` is populated. (`assertSafe()` checks both and refuses to run without them.)

---

## Gate 3 — low-privilege `bugrunner` account (recommended, owner)

Run the runner as a Windows account that **cannot read your primary workspace**. The runner never reads
`PRIMARY_WORKSPACE` (it's a single `path.resolve()` string compare — no disk access), so locking it out is safe.

**Do (elevated PowerShell):**
```powershell
net user bugrunner * /add
icacls "C:\Users\La Vague" /deny "bugrunner:(OI)(CI)R"
icacls "C:\Users\La Vague\Desktop\iottechs-bug-runner" /grant "bugrunner:(OI)(CI)M"
```
Give `bugrunner` modify rights to the automation clone and the temp dir it writes to; keep the vault
token and `.env` readable only by `bugrunner`. Skip this gate if you accept running under your own account.

---

## Gate 4 — server token (vault)

**Do:** In the live app, go to **/dev ▸ API Keys** and set **`BUG_QUEUE_TOKEN`** to a long random value
(e.g. `openssl rand -hex 32`). Until this is set, all three runner endpoints return **401 by design**.

**Verify:** the token is **only** honored by `/api/queue/{claim,heartbeat,result}` (confirmed in code — it's
not a general admin token), so a leak can at most touch bug-run state.

---

## Gate 5 — runner `.env`

**Do (in the automation clone only — never commit this):**
```powershell
cd C:\Users\La Vague\Desktop\iottechs-bug-runner\tools\bug-runner
copy .env.example .env
```
Edit `.env`:
```
QUEUE_BASE_URL=https://iot-techs.com
QUEUE_TOKEN=<the EXACT value you set as BUG_QUEUE_TOKEN in Gate 4>
AUTOMATION_BASE=C:\Users\La Vague\Desktop\iottechs-bug-runner
PRIMARY_WORKSPACE=C:\Users\La Vague\Desktop\IOT APP
CLAUDE_BIN=claude
```
(Leave the timing knobs at their defaults.)

---

## Gate 6 — first run (dry run with ONE bug)

Don't queue everything on day one. Prove the loop end-to-end first.

1. In `/bugs`, pick **one small, low-risk bug** and click **Queue Fix** (not "Queue All Open").
2. Start the runner from the automation clone:
   ```powershell
   cd C:\Users\La Vague\Desktop\iottechs-bug-runner
   node tools\bug-runner\runner.mjs
   ```
3. Watch its log. Expected sequence: `creating worktree` → `running Claude` → `validating` → `READY FOR REVIEW → claude/bug-<id>`.
4. In `/bugs`, the bug flips to **Ready for Review** with the branch/commit and validation rows.
5. **You** review the branch on GitHub, merge it manually (→ auto-deploys via Hostinger), then click **Resolve** in `/bugs`.

If it comes back **Failed** or **Blocked** (sensitive-file guard), the worktree is kept at
`...\iottechs-bug-runner\worktrees\bug-<id>` for you to inspect; the queue auto-stops for review.

---

## Operating it

- **Pause / resume:** the `/bugs` queue bar — *Stop After Current* lets the running bug finish then halts; *Resume* re-enables claiming. A **Failed** result forces Stop-After-Current automatically.
- **Order:** drag the queued chips in the queue bar to reprioritize (the running bug never moves).
- **Keeping it alive:** either leave the terminal open, or register a **Scheduled Task** running
  `node tools\bug-runner\runner.mjs` as `bugrunner` ("Run whether user is logged on or not", "Restart on failure"). It's a single-instance poll loop — never run two.
- **Stuck detection:** a run whose heartbeat is >20 min stale shows as **stuck** in the queue bar.
- **Crash recovery:** if the runner dies mid-bug, on restart it marks that bug **Failed** (never silently re-runs) and keeps its worktree.

## Where things live

| Thing | Path |
|---|---|
| Runner state (in-flight bug) | `tools\bug-runner\.runner-state.json` (gitignored) |
| Per-bug worktrees | `...\iottechs-bug-runner\worktrees\bug-<id>` |
| Downloaded evidence | `<worktree>\.bug-evidence\` |
| Branches (for review) | `origin/claude/bug-<id>` |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Could not launch Claude (spawn claude ...)` | CLI not installed or not on PATH → Gate 1, or set `CLAUDE_BIN` to its full path. |
| All claims return 401 | `BUG_QUEUE_TOKEN` (server) ≠ `QUEUE_TOKEN` (`.env`), or the token isn't set in the vault. |
| `Safety marker missing` | `.bug-runner-ok` not created in the automation clone (Gate 2). |
| `AUTOMATION_BASE equals PRIMARY_WORKSPACE` | `.env` points at your real workspace — fix the path. |
| `Could not junction node_modules` | `npm ci` wasn't run in `...\iottechs-bug-runner\dashboard`. |
| Bug comes back **Blocked** | The fix touched `package.json`/lockfile/`.husky`/`.github` — review that bug by hand; the runner won't auto-run those. |

## Still deferred (do NOT enable without a decision)

Auto-queue new bugs, always-on service, PR automation, auto-merge, auto-Resolve, auto-retry. Everything
above keeps a **human in the loop at merge**.
