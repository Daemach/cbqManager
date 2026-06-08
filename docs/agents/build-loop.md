# cbqManager autonomous build loop

A self-contained prompt for one iteration of the build loop. **Each iteration starts with no
prior context** — it re-derives everything from the repo. Run it self-paced with `/loop` (omit the
interval) or via the ralph-loop plugin, feeding the SAME prompt back each time.

> Launch (bounded, 3 slices — recommended for a supervised run): paste the LOOP PROMPT section into
> ralph-loop with a hard cap and an early-exit promise:
>
> ```
> /ralph-loop <LOOP PROMPT> --max-iterations 3 --completion-promise "No open `ready-for-agent` issues remain AND every slice implemented this run was committed and pushed to main with green tests"
> ```
>
> `--max-iterations 3` stops after at most 3 slices; the completion promise stops it earlier only if
> the backlog is genuinely drained and merged. Drop `--max-iterations` to run until the promise holds.
> Self-paced alternative: `/loop` then paste the prompt (shares this session's context).
>
> The loop drains `ready-for-agent` issues; when the backlog is dry it derives the next slice from
> the PRDs and creates it. One reviewable slice per iteration, committed and pushed **directly to
> `main`** once its tests are green. (Reset point: the original commit can be checked out to start
> over if a run goes sideways.)

---

## LOOP PROMPT (copy from here)

You are running ONE iteration of the cbqManager autonomous build loop. Assume you have NO memory of
prior iterations — re-derive all context from the repository every time. Work on Windows via the
**Bash tool** (git, gh, box, yarn, node all resolve there; `gh` via the `~/bin/gh` shim). Use
camelCase. One slice per iteration; commit and push **directly to `main`**; tests MUST be green
before any push.

### 0. Orient — read before doing anything (every iteration, no shortcuts)
- `CONTEXT.md` — the domain glossary. Use these exact terms (Connection, Queue, Job, Failed Job,
  Broadcast Connection, Channel, Orphan, Queue Health, Harvester, Archive, …) in code, tests, issues.
- `docs/adr/*.md` — accepted architectural decisions. Respect them; if your work contradicts one,
  surface it explicitly instead of silently overriding.
- `docs/prd/*.md` — the north-star specs. `0001` = full console product; `0002` = console UX,
  realtime monitor, and this iterative loop. PRDs are the spec; issues are the work.
- `AGENTS.md`, `CLAUDE.md`, and `docs/agents/{issue-tracker,triage-labels,domain}.md` — project rules,
  GitHub issue workflow (`Daemach/cbqManager`), triage labels, doc layout.
- `.agents/guidelines/core/boxlang.md` and `.agents/guidelines/core/coldbox.md` — framework idioms.
- `.agents/manifest.json` and the `.agents/skills/` inventory — load any skill relevant to the slice
  before building (e.g. `cbq`, `qb`, `coldbox-handler-development`, `coldbox-rest-api-development`,
  `boxlang-testing`, `testbox-bdd`, `cbvalidation`, `cbsecurity`). Read its `SKILL.md`.
- `git log --oneline -15`, `gh issue list --repo Daemach/cbqManager --state open` (note labels),
  and `box server list` (reuse the running cbqManager server at its existing port; don't start a
  duplicate). Skim the frontend (`frontend/src/`) and app (`app/`) areas your slice will touch.

### 1. Select the slice
- Grab the OLDEST open issue labeled `ready-for-agent`
  (`gh issue list --repo Daemach/cbqManager --label ready-for-agent --state open --json number,title --jq 'sort_by(.number)|.[0]'`).
- If none exist, derive the next smallest valuable **vertical slice** from the PRDs + current code
  state, create it as a `ready-for-agent` issue, then proceed with it.
- Slices may be **front-end, back-end, or both** (a full vertical is ideal). Keep each one reviewable.

### 2. Build
- Work on `main` (pull latest first: `git pull --rebase`). Keep the slice small and reviewable.
- Implement following the domain language, ADRs, and the BoxLang/ColdBox guidelines. Favor deep,
  independently testable modules with simple stable interfaces; keep handlers thin. Outlined
  controls + dark mode for any UI (house style).

### 3. Test → green
- Back end: TestBox specs under `tests/specs/` asserting EXTERNAL behavior (inputs → outputs / row
  effects), not internals. Run `box testbox run` — must be fully green.
- Front end: `vitest` for pure modules (install with `yarn --cwd frontend add -D vitest` if missing),
  Playwright for behavior — `yarn --cwd frontend test:e2e`.
- Every defect you hit becomes a regression test. Loop fix → retest until ALL suites are green.
- **Add tests for edge cases as you find them.** Whenever a slice (or a bug) surfaces a boundary —
  empty/zero rows, pagination boundaries, leaked/duplicate data, null vs empty string, concurrent
  writes, permission scope, deep links — capture it as a test in the same iteration so the edge
  can never silently regress.

### 4. Evaluate (the UX / architecture pass)
- UI slice: run the human-like walkthrough with video — `yarn --cwd frontend test:e2e:capture`
  (writes the LAST run's video to `frontend/test-results/`). Review it as a user would: every tab,
  screen, paging, sorting, button, and the realtime/context-switch behavior. Is it intuitive and
  correct?
- **Inspect the Playwright traces** for every UI run (`frontend/test-results/**/trace.zip`, open with
  `yarn --cwd frontend playwright show-trace <path>` or read the trace's console/network entries).
  Treat ANY JavaScript console error, unhandled rejection, or failed network call as a defect —
  fix it and re-run BEFORE committing. The browser console must be clean.
- Back-end/infra slice: review against the PRD acceptance criteria and ADRs; confirm the public
  interface is simple, stable, and secrets never leak.
- Honestly answer: are we still on track to the best experience? Note what's weak or missing.

### 5. Steer — create the next step
- Turn the evaluation into the NEXT issue(s) via `gh issue create`. Label `ready-for-agent` only when
  fully specified (an agent could pick it up cold); otherwise `needs-triage`. Capture better ideas
  discovered mid-build — the backlog bends to what you learned.

### 6. Land
- Commit (end the message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`) and push
  **directly to `main`** (`git pull --rebase` first, then `git push origin main`). The commit body
  should reference the issue (`Closes #<issue>`) and summarize verification (test counts, walkthrough
  evidence). Leave local-only config (`.claude/`, `.vscode/`) out of the commit. Then STOP — the next
  iteration starts fresh.

### Guardrails
- One slice per iteration; push straight to `main`; tests MUST be green before any push.
- For any UI slice, inspect the Playwright traces and fix ALL JavaScript/console errors before
  committing — a clean browser console is a precondition for the push.
- Reuse the running server; don't duplicate it. If migrations are needed: `box migrate up`.
- If a step is genuinely blocked (missing creds, unreachable service, ambiguous spec), comment the
  blocker on the issue, relabel it `needs-info`, and pick the next `ready-for-agent` instead of
  guessing.
