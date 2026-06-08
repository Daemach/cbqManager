---
status: needs-triage
date: 2026-06-05
supersedes: 0001 user stories #12–14 (Monitor UX)
---

# PRD: cbqManager — Console UX, Realtime Monitor & Iterative Delivery Loop

> Glossary terms (capitalized) are defined in [CONTEXT.md](../../CONTEXT.md). Architectural decisions referenced as ADR-NNNN live in [docs/adr/](../adr/). This PRD refines the frontend/UX layer of [0001-cbq-job-management.md](0001-cbq-job-management.md) and supersedes its live-Monitor stories (#12–14); all backend deep modules and control semantics in 0001 remain authoritative.

## Problem Statement

The console works one **Connection** at a time through a header dropdown, and the live **Monitor** is a per-Connection *route*: navigating to Jobs, Failed Jobs, or Batches unmounts it and **discards the live feed and its history**. An operator who is watching a Queue drain cannot, at the same time, browse the Jobs causing it — they must choose between live awareness and investigation, and lose the stream every time they switch tools or Connections.

From the operator's perspective:

- There is no way to keep several **Connections** open and flip between them; switching contexts means re-selecting from a dropdown and losing where you were.
- Live Worker activity is not visible while doing anything else, so cross-context awareness ("is staging on fire while I work in dev?") is impossible.
- The live stream cannot be filtered, and it shows no **Queue** — so on a busy Channel an operator cannot isolate the activity they care about.
- The Connection editor captures only database credentials, even though a Connection needs **Broadcast Connection** + **Channel** information to stream at all — so realtime can't actually be configured per Connection through the UI.
- In the team's dark-mode environment, input fields with no visible edges are hard to use.

Separately, the developer needs the build of this console to be **iterative and self-correcting** — better designs surface mid-build, and every defect found by hand should leave behind a permanent test and visible evidence.

## Solution

A **three-zone ops console** where each open **Connection** is a self-contained context, and a persistent Live Monitor is always visible:

- **Top zone — Connection context tabs.** A browser-style strip of opened Connections, each badging its own live activity. Switching a tab swaps the **entire** context — the tool data *and* the realtime subscription — atomically, with no leakage between contexts. Each tab remembers the tool screen it was last on.
- **Middle zone — the active context's tools** (Queue Health, Jobs, Failed Jobs, Batches), bound to the active Connection.
- **Bottom zone — a persistent, collapsible Live Monitor dock**, mounted outside the router view so it survives navigation. It is live-filterable on multiple columns and adds a **Queue** column; drilling into a specific Queue up top auto-applies a clearable `queue=` filter below.

The keystone is moving the realtime subscription out of the view and into a **store keyed by `connectionId`**, so streams keep running in the background, retain capped history per context, and swap when the active tab changes. The Connection editor is extended to capture both **database** and **Broadcast Connection** (transport + Channel + events) information. All controls are **outlined** and the app defaults to **dark mode**, matching the existing reference Monitor's house style.

Delivery is driven by an **iterative loop**: build a vertical slice → write backend + frontend tests for it → loop until green → run a human-like Playwright walkthrough that captures video evidence and a UX assessment → let that assessment create/refine the next issue → repeat.

## User Stories

### Connection context tabs & switching

1. As an operator, I want to open several **Connections** as tabs, so that I can keep more than one context to hand at once.
2. As an operator, I want to switch the active context by clicking a tab, so that I can move between Connections instantly without re-selecting from a dropdown.
3. As an operator, I want each tab to remember the tool screen (Queue Health / Jobs / Failed / Batches) I was last on, so that switching back resumes where I left off.
4. As an operator, I want switching a tab to swap the entire context — tool data **and** the live stream — atomically, so that I never see one Connection's data mixed with another's realtime feed.
5. As an operator, I want each tab to badge its own live activity (e.g. running / error counts), so that I can tell at a glance whether an unfocused Connection needs attention.
6. As an operator, I want to close a context tab, so that I can keep the strip focused on the Connections I'm actually working.
7. As an operator, I want to open a Connection that isn't yet a tab from a picker, so that I can add contexts on demand.

### Always-on Live Monitor dock

8. As an operator, I want the Live Monitor to stay visible while I browse Jobs, Failed Jobs, and Batches, so that I never have to choose between watching activity and investigating it.
9. As an operator, I want the live stream and its history to survive navigation between tools, so that a burst I just saw is still there after I click into a Job.
10. As an operator, I want to collapse, expand, and resize the Monitor dock, so that I can trade screen space between the tools and the live feed.
11. As an operator, I want to pause and resume the live stream (with an auto-resume after a short interval), so that I can read a burst without it scrolling away — mirroring the reference Monitor's behavior.
12. As an operator, I want the stream to auto-resume when I return to the tab, so that a paused Monitor doesn't silently go stale.
13. As an operator, I want each Worker **instance** distinguished (e.g. by color), so that I can tell which Worker produced which line.
14. As an operator, I want error lines visually distinct and showing the parsed error/line, so that failures stand out in the stream.
15. As an operator, I want heartbeat/keepalive messages suppressed, so that the feed shows only real activity.

### Live filtering & the Queue column

16. As an operator, I want a **Queue** column in the Live Monitor, so that I can see which Queue each event belongs to.
17. As an operator, I want to live-filter the Monitor on one or more columns (Queue, **Job State**, **Mapping**, instance, free text), so that on a busy **Channel** I can isolate exactly the activity I care about.
18. As an operator, I want drilling into a specific Queue in the tools above to auto-apply a `queue=` filter on the Monitor below, so that the live view follows my focus.
19. As an operator, I want that auto-applied filter to be clearable, so that I can widen back to the whole Connection's activity in one click.
20. As an operator, I want the Monitor to degrade gracefully when an event carries no Queue, so that older Workers that don't publish a Queue still produce a usable feed.

### Connection editor — database + websocket

21. As an operator, I want the Connection editor to capture **Broadcast Connection** information (transport, Channel, events) alongside the database credentials, so that a Connection can actually stream live activity.
22. As an operator, I want to reference an existing reusable **Broadcast Connection** when editing a Connection, so that several Connections can share one realtime server with distinct Channels (ADR-0006).
23. As an operator, I want to choose the **Channel** a Connection subscribes to, so that prod and dev streams on one Pusher app stay separated.
24. As an operator, I want the editor to make clear which fields are database vs websocket, so that I don't confuse the two when configuring a Connection.
25. As an operator, I want a Connection with no Broadcast Connection configured to still work for everything except live streaming, so that realtime is optional.

### Dark-mode & control styling

26. As an operator, I want the console to default to dark mode, so that it matches the team's existing tooling.
27. As an operator, I want all input controls **outlined** so their edges are visible in dark mode, so that forms are usable without guessing where fields are.

### Whole-tool quality walkthrough (developer/operator)

28. As an operator, I want every screen, tab, button, paging control, and sort to actually work and feel intuitive, so that the console is trustworthy under pressure.
29. As a developer, I want a human-like automated walkthrough that navigates the entire tool (all tabs/screens, paging, sorting, every control), so that regressions in basic usability are caught automatically.
30. As a developer, I want the last UI walkthrough run to produce **video** evidence (without archiving every past run), so that I can review what the tool actually did.
31. As a developer, I want a regression test created for **every** defect found during a walkthrough, in addition to the general tests, so that fixed problems stay fixed.
32. As a developer, I want each delivery slice gated on all backend and frontend tests passing, so that the loop cannot advance on a broken build.
33. As a developer, I want a high-level UX assessment after each component that can create or re-prioritize the next issue, so that better designs found mid-build reshape the backlog instead of being lost.

## Implementation Decisions

### Layout & state architecture

- **Three-zone layout**: Connection context tabs (top), the active context's tool views (middle), a persistent Live Monitor dock (bottom). The dock is mounted **outside the router view** so navigation between tools never unmounts it.
- **Realtime store keyed by `connectionId`** (the keystone): owns the subscription lifecycle, a capped retained event history per context, and pause/resume/streaming state. Because it lives outside the view, streams persist across navigation and **swap atomically when the active tab changes**. Replaces the current per-view subscribe/unsubscribe in the Monitor route.
- **Connection-context store**: the set of open tabs, the active tab, each tab's remembered tool and filter state, and derived per-tab live-activity badges (computed from the realtime store).
- The single header Connection dropdown is repurposed as the "open a Connection" picker; the tab strip becomes the primary context switcher.

### Realtime modules

- **EventNormalizer** (pure): maps a raw transport message (Pusher or socketbox) into a uniform `LiveEvent { time, queue, instance, mapping, jobId, state, type, text }`. Drops heartbeat/sentinel messages (`|=0=|`, bare `done`). Represents error events with their parsed `error`/`line`. **Surfaces `queue` when present and falls back cleanly when absent.**
- **LiveEventFilter** (pure): applies a multi-column filter spec (queue, state, mapping, instance, free text) to a list of `LiveEvent`s.
- Realtime stays **transport-agnostic via the existing adapter factory** (ADR-0006) — Pusher and socketbox both supported; nothing is hardcoded to Pusher (unlike the reference Monitor).
- **Broadcast-config endpoint** (`GET /connections/:cid/broadcast`): a thin handler over the existing Connection Registry / Credential vault that returns `{ transport, channel, events, publicParams }`. It returns only **public** transport parameters (e.g. Pusher key/cluster/appId) and **never the secret**, which stays server-side. Fills the current Monitor view's TODO.

### Connection editor

- The Connection create/edit flow is extended to capture/reference **Broadcast Connection** data (transport, Channel, events) in addition to the database connection, visually separated into database vs websocket sections. Broadcast Connection remains a reusable, normalized record (ADR-0006); the editor references one rather than inlining flat realtime config.

### Styling

- App defaults to **dark mode**; all input controls use the **outlined** variant so field edges are visible — consistent with the reference Monitor's existing style.

### Tables, sorting & pagination (house style)

- **Most-recent-first by default.** Whatever the sort, the default view should land the operator on the newest, most relevant data without scrolling — they should not have to page or re-sort to see what just happened.
- **Live Monitor feed**: data **fills down and scrolls up** — new events append and the viewport keeps the latest in view (capped history per context), like the reference Worker Monitor.
- **Static data tables** (Jobs, Failed Jobs, Batches, Archive): default sort is **date descending** (newest first), unless a **name** column is the more natural primary key for that table (e.g. the Connections registry sorts by name). Date-bearing tables lead with the most recent row.
- **Quasar virtual-scroll tables are acceptable** (and preferred over hidden pagination for long lists) — show the data in one scrollable surface rather than burying recent rows behind page 2. Small admin lists (e.g. Connections) may simply show all rows.

### Extended live-event contract

- The broadcast **message format is extended** so live events carry the fields the Monitor needs to display and filter — rather than cbqManager trying to reconstruct them. cbqManager **defines the canonical contract** it consumes; the publisher (the cbq broadcast emitter in the Managed App's Workers) is expected to conform.
- **Canonical `LiveEvent` contract** (additive over the reference Monitor's `{ type, instance, message }`):
  - `queue` — the **Queue** the event belongs to (primary new filter column)
  - `mapping` — the Job's **Mapping** (class name)
  - `jobId` — the `cbq_jobs` id, for correlation/drill-down
  - `state` — the **Job State** the event represents (available/reserved/completed/failed)
  - `attempts` — attempt count, where known
  - `batchId` — owning **Batch**, where the Job is batched
  - `instance` — Worker instance (already present)
  - `type` — stream class: `info | warning | error | done`
  - `error` / `line` — parsed failure detail for error events (already present)
  - `text` — human-readable message (already present)
  - `time` — event timestamp
- **EventNormalizer is version-tolerant**: it accepts the extended payload and the **legacy** `{ type, instance, message }` form, populating new fields when present and leaving them blank (graceful-degrade) when not, so older Workers keep producing a usable feed during rollout.
- The **publisher-side change** (emitting the extended payload from the cbq broadcast point) lives in the cbq Worker/module codebase, not cbqManager's repo. This PRD owns the **contract and the consumer**; conforming the publisher is a tracked dependency delivered alongside, not a blocker for the console work (which degrades gracefully until it lands).

### Iterative delivery loop

- Work is delivered as **tracer-bullet vertical slices**. Only the next slice or two are promoted to `ready-for-agent`; the rest of the backlog stays `needs-triage` and freely editable.
- The loop body per slice is: **build → write backend (TestBox) + frontend (vitest/Playwright) tests → run until all green → human-like Playwright walkthrough with video evidence → UX assessment creates/refines the next issue and re-triages → open a PR → next slice.**
- The first slice is the **realtime store-hoist + persistent Monitor dock**, because the context tabs' live badges and the always-on feed both depend on it.

## Testing Decisions

A good test asserts **external behavior**, not internal structure: given an input message (or app state and a user action), the module/UI produces the expected normalized event, filtered result, endpoint payload, or on-screen outcome — and stays valid if the internals are rewritten.

Modules to test (all confirmed with the developer):

- **Pure modules via vitest** (new lightweight unit runner for the frontend):
  - **EventNormalizer** — Pusher and socketbox raw messages normalize to the same `LiveEvent` shape; the `queue` field is surfaced when present and absent-gracefully when not; heartbeat/sentinel messages are dropped; error messages expose parsed `error`/`line`.
  - **LiveEventFilter** — single- and multi-column filters (queue, state, mapping, instance, free text) include/exclude the right events, including the empty-filter (pass-through) case.
- **RealtimeStore behavior** via Playwright e2e against the running app — the live feed and its history **survive navigation** between tools; switching context tabs **swaps the stream atomically** (no cross-context bleed); pause/resume and auto-resume behave as specified.
- **Broadcast endpoint** via TestBox integration — `GET /connections/:cid/broadcast` returns `transport`, `channel`, `events`, and public params, and **never leaks the secret**; a Connection with no Broadcast Connection returns a well-formed "no realtime" result.
- **Walkthrough e2e** — a Playwright "walkthrough" project that drives the whole app like a human (every tab/screen, paging, sorting, buttons), doubling as the UX-pass **video evidence** (`PW_CAPTURE=1`). Defects it surfaces become individual regression specs.

Prior art:
- The reference Worker Monitor (`F:\dev\Veriti\cbq-worker\views\monitor\cbq.cfm`) is the blueprint for the Live Monitor dock — pause/auto-resume, per-instance coloring, heartbeat suppression, throttled appends, viewport-based row cap, dark mode, outlined controls — to be reimplemented over the pluggable adapter and the new store.
- Existing frontend Playwright e2e (`frontend/e2e/*.spec.js`) with `support/api.js` / `support/app.js`, and the capture flag already in `frontend/playwright.config.js` (`video: 'on'` under `PW_CAPTURE`, `retain-on-failure` otherwise into a self-overwriting `test-results/` — i.e. last-run-only by default).
- Backend integration tests extend `BaseTestCase` with `appMapping="/app"` and call `setup()` in `beforeEach()` (per AGENTS.md).

## Out of Scope

- Changing the Managed App's Worker-side broadcast payload to add `queue`/`mapping` (flagged as a dependency; the column ships and degrades gracefully without it).
- The backend deep modules and control-action semantics already specified in 0001 (QueueHealthAnalyzer, JobRepository guarded writes, Harvester, etc.) — unchanged here.
- A side-by-side multi-pane view of two Connections at once (context tabs cover switching; simultaneous panes are a later enhancement).
- Realtime over the Archive/history (the dock is live state only; history remains the Archive's job per ADR-0004).
- Supporting a third realtime transport beyond Pusher/socketbox.

## Further Notes

- This PRD supersedes 0001's live-Monitor stories (#12–14): the Monitor is no longer a per-Connection route but a persistent, filterable, per-context dock.
- The reference Monitor hardcodes Pusher and a global environment selector; our version generalizes both — transport via the adapter factory, environment/Connection via the context tabs.
- The store-hoist is deliberately the first slice: it is the smallest change that unblocks both the persistent dock and the tabs' live badges, and it is the highest-risk piece to get right (subscription lifecycle, history retention, atomic swap), so it earns the first walkthrough.
