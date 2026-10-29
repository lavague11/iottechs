# Bug runner (Phase 1)

Turns the `/bugs` portal into a sequential Claude Code task queue. Staff queue bugs in the browser; this
local runner claims them **one at a time**, fixes each in an **isolated git worktree**, validates, pushes a
`claude/bug-<id>` branch, and marks the bug **Ready for Review**. You review and merge manually. It never
touches your primary workspace and never merges to `main`.

## The two workspaces (critical)

```
C:\Users\La Vague\Desktop\IOT APP\            ← PRIMARY — you + interactive Claude Code. Automation NEVER touches this.
C:\Users\La Vague\Desktop\iottechs-bug-runner\ ← AUTOMATION CLONE — the runner works here (its own .git).
    worktrees\bug-73\                          ← one isolated worktree per bug (branch claude/bug-73)
```

## One-time setup

1. **Server:** in the app's vault (`/dev ▸ API Keys`) add `BUG_QUEUE_TOKEN` = a long random string.
2. **Clone** (separate from your primary):
   ```
   git clone <repo-url> C:\Users\La Vague\Desktop\iottechs-bug-runner
   cd C:\Users\La Vague\Desktop\iottechs-bug-runner\dashboard && npm ci
   ```
3. **Bless the clone** (safety marker; gitignored, must NOT exist in your primary workspace):
   ```
   cd C:\Users\La Vague\Desktop\iottechs-bug-runner && echo ok > .bug-runner-ok
   ```
4. **Config:** `copy tools\bug-runner\.env.example tools\bug-runner\.env` and fill in `QUEUE_TOKEN` (and
   paths if different). `.env` is gitignored.

## Run it

```
cd C:\Users\La Vague\Desktop\iottechs-bug-runner
node tools/bug-runner/runner.mjs
```

Leave it running in its own terminal. In the browser open `/bugs`, select bugs or **Queue All Open**. The
runner works the queue; watch the compact queue bar at the top of `/bugs`.

## What each bug does

claim (atomic, one at a time) → fresh worktree + branch off `origin/main` → node_modules junction →
download Evidence screenshots → **fresh** Claude Code session (scoped perms, no Git) → validate
(targeted → `npm test` → `npm run build`) → runner commits + pushes `claude/bug-<id>` → **Ready for
Review** → next bug.

## Safety model

- **Claude owns NO Git** — read/edit/write + run `npm test`/`npm run build` only; all Git (fetch, worktree,
  branch, commit, push, cleanup) is the runner's. Git is explicitly denied in Claude's permissions.
- **Isolated worktree per bug**, off a **separate clone** — the primary workspace's branch, files, stash,
  HEAD and worktrees are never touched.
- **Failure stops the queue** (`Stop After Current`): a crash, failed test/build, or unsafe state marks the
  bug **Failed**, the server flips the queue to stop, and nothing else runs until you review. **No retries.**
- **Dependency changes** (`package.json` / `package-lock.json`) still go to Ready for Review but are flagged
  — the shared node_modules isn't reinstalled, so review deps before trusting a green.
- **Crash recovery:** a bug left in-flight at restart is marked Failed (never re-run); its worktree is kept.
- **Auth:** Bearer token (vault), never in browser JS. Queue actions in the UI are admin/manager only.

## Files

`runner.mjs` (loop + state + validation + recovery) · `git.mjs` (worktree lifecycle) · `claude.mjs`
(scoped headless invocation) · `envelope.mjs` (evidence + task prompt) · `api.mjs` (queue client) ·
`proc.mjs` (Windows-safe spawn). Local-only, gitignored: `.env`, `.runner-state.json`, `../../.bug-runner-ok`,
`../../worktrees/`.

> Verify your Claude CLI supports the flags in `claude.mjs` (`-p --output-format json --max-turns
> --permission-mode --settings`) with `claude --help`; adjust there if your version differs.
