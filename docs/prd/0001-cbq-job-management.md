---
status: needs-triage
date: 2026-06-04
---

# PRD: cbqManager — cbq Job Management Console

> Glossary terms (capitalized) are defined in [CONTEXT.md](../../CONTEXT.md). Architectural decisions referenced as ADR-NNNN live in [docs/adr/](../adr/).

## Problem Statement

Teams running cbq background queues across several applications and environments have no
unified, safe way to see and act on what those queues are doing. When a Queue stalls —
as happened when two **Orphan** rows silently starved a quantity-2 power Worker and wedged
every queue behind it — operators are reduced to hand-writing SQL against production
databases under pressure, with no guardrails, no history, and no shared tooling. Today:

- There is no single place to view Jobs, **Failed Jobs**, and **Batches** across multiple
  **Managed Apps** and environments (local, dev, staging, production).
- Diagnosing a stall (an **Orphan** blocker, a poison Job, a flood) requires deep knowledge
  of cbq's internal table semantics and bespoke SQL run by hand.
- Recovery actions (Retry, Reset, cancel a Batch, drain a backlog) are manual, irreversible,
  and dangerous because they race the live **Workers** still polling those tables.
- cbq's own cleanup deletes completed and failed rows, so there is no long-lived history to
  answer "what happened to this Queue last week?"
- Sensitive operations on production happen with no authorization model and no audit trail.

## Solution

cbqManager is a standalone operations console (ADR-0001) that attaches **directly** to other
applications' cbq databases and gives operators one secured pane of glass to observe and
control their queues — without deploying any code into the Managed Apps and without owning
their Job classes.

From the operator's perspective, cbqManager lets them:

- Register many **Connections** (one per Managed App cbq database, across all environments)
  in an encrypted **Connection Registry**, and switch between them in the UI (ADR-0003).
- See a **Queue Health** dashboard per Connection that immediately surfaces starvation —
  open totals, **Orphan** blockers, pickable backlog, in-flight, and scheduled-future Jobs —
  and the **Next Up** Job a Worker pool would grab next.
- Browse all Jobs filtered by Queue and **Job State**, inspect a Job's deserialized payload,
  and act on them with state-aware, race-safe controls (ADR-0001): delete, mark complete,
  **Reset** a stuck Job, **Heal** Orphans, **Park** a flood, and **Throttled Release** a backlog.
- Work **Failed Jobs** in an enriched table (exception file/line/sql parsed app-side) and
  **Retry** them by re-queueing their **Memento** — no Job classes required (ADR-0002).
- Manage **Batches**: view live progress, cancel, delete, retry a Batch's Failed Jobs, and
  drill into a Batch's live Jobs.
- Watch a live activity **Monitor** fed by the Managed App's Workers over a pluggable
  realtime **Transport** (Pusher or socketbox) (ADR-0006).
- Trust a long-lived local **Archive**, populated by a **Harvester**, for history and trends
  that outlive the Managed Apps' own short retention (ADR-0004).
- Operate under RBAC with per-Connection scoping and a complete audit trail, so production
  access is controlled and every mutation is attributable.

## User Stories

### Connections & credential vault

1. As an operator, I want to register a new Connection pointing at a Managed App's cbq
   database, so that I can manage its queues from the console.
2. As an operator, I want cbqManager to auto-detect the Connection's database engine
   (grammar) on registration, so that I don't have to know it (ADR-0005).
3. As an operator, I want to override the auto-detected grammar (e.g. force an auto-retry
   variant), so that I can tune behavior for a busy production database.
4. As an operator, I want my Connection's database password stored encrypted, so that a
   database dump of cbqManager's own store does not leak credentials (ADR-0003).
5. As an operator, I want to edit, disable, and delete Connections, so that I can keep the
   registry current as apps and environments change.
6. As an operator, I want each Connection labeled by app and environment, so that I never
   confuse a development queue with production.
7. As an operator, I want to test a Connection before saving it, so that I catch bad
   credentials or unreachable hosts immediately.
8. As an operator, I want to record per-Connection Worker-pool parameters (reservation
   timeout, queue priority order, maxAttempts) or have them inferred, so that stuck
   detection and Next Up are accurate (Q17).
9. As an admin, I want only admins to manage the Connection Registry and credential vault,
   so that secrets are not exposed to lower-privilege users.

### Broadcast connections & live monitor

10. As an operator, I want to define a reusable Broadcast Connection (Pusher or socketbox)
    with its server credentials, so that several Connections can share one realtime server
    (ADR-0006).
11. As an operator, I want each Connection to reference a Broadcast Connection and a Channel,
    so that prod and dev streams can be different channels on one Pusher app or entirely
    separate servers.
12. As an operator, I want a live Monitor view that streams Worker activity for the selected
    Connection, so that I can watch jobs run and errors occur in real time.
13. As an operator, I want the Monitor to work whether the Transport is Pusher or socketbox,
    so that I can use hosted realtime in production and self-hosted realtime locally.
14. As an operator, I want to pause and resume the live stream, so that I can read a burst of
    messages without them scrolling away.

### Queue health & diagnosis

15. As an operator, I want a Queue Health panel per Connection breaking each Queue into
    open_total, orphaned_blockers, pickable_fresh, pickable_reserved_timedout, in_flight,
    and scheduled_future, so that I can spot a starved pool at a glance.
16. As an operator, I want Orphan blockers highlighted prominently, so that I can recognize
    cbq's reclaim defect before it wedges a whole pool.
17. As an operator, I want to see the Next Up Job per Worker pool/queue, so that I can
    identify the row a restart would pick up and confirm a suspected poison Job.
18. As an operator, I want to see each Job's attempts, reservation age, Mapping, and a
    payload preview, so that I can reason about why a Queue is stuck.
19. As an operator, I want Queue Health to be safe to run continuously (read-only), so that I
    can keep it open as a live dashboard.
20. As an operator, I want trends of Queue Depth over time, so that I can see whether a
    backlog is growing or draining.

### Browsing & inspecting jobs

21. As an operator, I want to browse all Jobs for a Connection with server-side pagination,
    so that large tables stay responsive.
22. As an operator, I want to filter and sort Jobs by Queue and Job State, so that I can
    focus on exactly the rows I care about.
23. As an operator, I want to view a Job's deserialized payload, so that I can understand what
    work it represents.
24. As an operator, I want to search Jobs by Mapping, so that I can find all instances of a
    particular job type.

### Control actions on jobs

25. As an operator, I want to delete a Job, so that I can remove work that should not run.
26. As an operator, I want to mark a Job complete, so that I can stop a Job from running
    without deleting it.
27. As an operator, I want to Reset a stuck reserved Job back to available, so that a job a
    dead Worker abandoned gets picked up again.
28. As an operator, I want to be warned (with reservation age shown) before acting on a
    reserved Job, so that I do not accidentally cause a double-execution of live work.
29. As an operator, I want Reset gated behind a per-Connection stuck-threshold, so that I only
    release jobs whose reservation has plausibly expired.
30. As an operator, I want every control write to be a guarded conditional that safely
    no-ops if a Worker changed the row first, so that I never corrupt in-flight work
    (ADR-0001).
31. As an operator, I want to Heal Orphans (return them to a lockable state) in one click,
    so that I can instantly unblock a starved pool.
32. As an operator, I want to schedule the Heal guard per Connection, so that a single Worker
    death cannot keep wedging a pool until the upstream DBProvider bug is fixed.
33. As an operator, I want to Park due Jobs (remove them from the pickable set without
    deleting them), so that I can unblock a pool without flooding downstream systems.
34. As an operator, I want to Throttled-Release Parked Jobs at N per window in queue-priority
    order, so that a recovered backlog drains at a controlled rate.
35. As an operator, I want to quarantine a poison Job (mark failed or move to a parked queue),
    so that the pool moves on while I investigate the bad job later.
36. As an operator, I want to discard stale Jobs by Queue and age (mark failed), so that I can
    clear work that should not be reprocessed while keeping it for audit.
37. As an operator, I want a dry-run preview (counts of affected rows) before applying any
    bulk action, so that I can confirm scope before committing.

### Failed jobs

38. As an operator, I want a Failed Jobs table per Connection with server-side pagination and
    filtering, so that I can triage failures efficiently.
39. As an operator, I want exception details (type, message, file name, line number, sql)
    parsed and shown without provisioning any database view, so that the tool works against
    any Managed App's database (Q9).
40. As an operator, I want to inspect a Failed Job's full exception and Memento, so that I can
    diagnose the failure.
41. As an operator, I want to Retry a Failed Job by re-queueing its Memento, so that it runs
    again without my console needing the Job class (ADR-0002).
42. As an operator, I want to Retry-and-delete in one action, so that I can requeue a failure
    and clear it from the failed log.
43. As an operator, I want to delete a Failed Job, so that I can clear noise from the log.
44. As an operator, I want to bulk-retry or bulk-delete selected Failed Jobs, so that I can
    recover from a mass failure quickly.

### Batches

45. As an operator, I want a Batches list per Connection with live progress (total/pending/
    failed counts and percent complete), so that I can monitor long-running batches.
46. As an operator, I want to cancel a Batch (stamping cancelledDate), so that its remaining
    Jobs are skipped by Workers.
47. As an operator, I want canceling a large Batch to also remove its non-in-flight pending
    Jobs, so that Worker capacity is reclaimed immediately rather than churning through skips.
48. As an operator, I want to delete a Batch record, so that I can clear finished or abandoned
    batches.
49. As an operator, I want to retry all of a Batch's Failed Jobs, so that I can recover a
    partially failed batch in one action.
50. As an operator, I want to drill into a Batch's live Jobs (via the payload batchId), so
    that I can see exactly what remains, where the grammar supports it.

### History & archive

51. As an operator, I want job history retained in cbqManager's own Archive beyond the
    Managed App's short cleanup window, so that I have long local memory (ADR-0004).
52. As an operator, I want to filter archived history by Connection, Queue, and time range,
    so that I can investigate past incidents.
53. As an operator, I want the Harvester to capture terminal Jobs before cbq cleanup deletes
    them, so that no failure history is lost.
54. As an operator, I want Queue Depth samples stored over time, so that I can chart backlog
    trends historically.
55. As an admin, I want to configure the Harvester interval and Archive retention per
    Connection, so that I balance completeness against storage.

### Auth, authorization & audit

56. As a user, I want to log in with credentials and receive a session/token, so that access
    is secured (reusing the existing JWT scaffolding).
57. As an admin, I want to assign roles (viewer / operator / admin), so that users have
    appropriate capabilities (Q14).
58. As an admin, I want to grant users access to specific Connections or environments, so that
    a dev user cannot touch production unless explicitly authorized.
59. As an operator, I want control actions hidden or blocked where I lack permission, so that
    the UI reflects what I'm allowed to do.
60. As an admin, I want every mutation (Retry, Reset, delete, complete, Park, Release, Heal,
    cancel, and Connection/credential/user changes) recorded with who, when, action,
    Connection, target, and result, so that production activity is fully attributable.
61. As an admin, I want to browse and filter the audit log, so that I can answer "who reset
    that running job?" or "who added this credential?".

### Cross-engine support

62. As an operator, I want cbqManager to manage cbq queues on any qb-supported engine (SQL
    Server, MySQL, Postgres, etc.), so that it is not limited to one database vendor (ADR-0005).
63. As an operator, I want cbqManager's own store to start on SQLite locally and move to
    MSSQL for production, so that I can run it with zero external dependencies during
    development.

## Implementation Decisions

### Architecture (per ADRs)

- cbqManager is a **standalone console** reaching Managed Apps via **direct database access**;
  it defines no Job classes and only manages durable, DB-backed (DBProvider) queues (ADR-0001).
- **Retry** is a **direct-DB Memento insert**: a new `cbq_jobs` row whose payload is the Failed
  Job's stored Memento; the Managed App's own Worker deserializes and runs it (ADR-0002).
- **One console, many Connections**, including production, with secrets encrypted at the
  application layer using an env-supplied AES key, behind a swappable cipher seam (ADR-0003).
- **Local Archive** populated by a periodic **Harvester** for long-lived history (ADR-0004).
- **Grammar-agnostic qb factory**: per-Connection qb instances bound to the Connection's
  detected-but-overridable grammar and datasource, optionally wrapped with auto-retry (ADR-0005).
- **Pluggable realtime** via normalized Broadcast Connections and frontend Pusher/socketbox
  adapters (ADR-0006).
- All control writes are **guarded conditional** statements whose predicates mirror cbq's own
  guards, so a write losing a race with a Worker safely affects zero rows.

### Deep modules (confirmed with developer)

Pure / near-pure (no I/O):

- **CredentialCipher** — encrypts/decrypts secret fields with per-record IV; KMS-swappable.
- **JobStateClassifier** — maps a row + current time + pool params to a Job State, including
  Orphan, in-flight, and scheduled-future.
- **MementoPayloadBuilder** — produces the `cbq_jobs` insert representation from a Memento +
  Mapping; the contract that keeps Retry compatible with cbq's payload convention.
- **FailedJobEnricher** — parses raw exception columns into fileName / lineNumber / sql.
- **QueueHealthAnalyzer** — computes the six Queue Health buckets, Orphan blockers, and the
  Next Up selection by replicating cbq's selection order (state filter, queue priority, id).
- **PoolParamsInference** — infers reservation timeout from observed reservation durations and
  holds configured fallbacks for queue priority and maxAttempts.

Stateful (interface over storage):

- **QueryBuilderFactory** — `forConnection(id)` returns a qb bound to grammar + datasource with
  auto-retry; performs grammar auto-detect on registration.
- **JobRepository** — per-Connection reads (paginated, filtered by Queue/Job State) and the
  guarded control writes: delete, markComplete, reset, park, throttledRelease, healOrphans,
  quarantine; each returns affected-row counts and supports a dry-run preview.
- **FailedJobRepository** — enriched reads, retry-via-Memento, delete, and bulk variants.
- **BatchRepository** — list/progress, cancel (stamp), delete, retry-failed, and drill-down to
  live Jobs via payload `$.batchId` where the grammar supports JSON extraction.
- **ConnectionRegistry** — CRUD over Connections and Broadcast Connections; resolves a
  Connection to a usable config, decrypting via CredentialCipher.
- **Harvester** + **ArchiveRepository** — scheduled snapshot of terminal Jobs and Queue Depth
  into the Archive, deduped by a per-Connection/queue high-water mark.
- **AuditLog** — append-only record of all mutations.
- **Authorization** — RBAC plus per-Connection scope checks, built on cbsecurity.

Thin layers on top: REST API handlers (Connections, Jobs, FailedJobs, Batches, QueueHealth,
Archive, Audit, Auth) returning JSON with pagination; a Vite + Vue 3 + Quasar SPA with a
RealtimeAdapter abstraction. The REST handlers are deliberately shallow — all logic lives in
the deep modules.

### Persistence

- cbqManager's **own store** (users, roles, per-Connection grants, Connection Registry with
  encrypted secrets, Broadcast Connections, Archive, audit log) lives in a dedicated datasource,
  schema-managed via cfmigrations authored portably across grammars (SQLite first, MSSQL later).
- **Target databases** are never schema-migrated by cbqManager; it reads/writes only the
  existing cbq tables (`cbq_jobs`, `cbq_failed_jobs`, `cbq_batches`).

### Known constraint encoded in the design

- The cbq DBProvider **Orphan** defect (candidate-but-unlockable rows) is treated as a
  first-class concern: surfaced in Queue Health and remediated by Heal (manual + scheduled).

## Testing Decisions

Good tests here assert **external behavior**, not implementation details: given an input
table state (or input value), the module produces the expected output, affected-row count, or
resulting table state — without asserting how the SQL or code is structured internally. Tests
should remain valid if a module's internals are rewritten.

Modules to test (all confirmed with developer):

- **Core pure modules** — CredentialCipher (round-trip encrypt/decrypt, wrong-key failure,
  IV uniqueness), JobStateClassifier (every state including Orphan/in-flight/scheduled across
  boundary times), MementoPayloadBuilder (payload shape matches cbq's deserialize contract),
  FailedJobEnricher (file/line/sql parsed from representative exception strings, graceful
  fallback on unparseable input), QueueHealthAnalyzer (bucket counts and Next Up match cbq's
  selection for crafted row sets, including the two-Orphan starvation scenario),
  PoolParamsInference (timeout inferred from sampled reservation durations).
- **JobRepository guarded writes** — exercised against a **SQLite cbq_jobs fixture**: reset /
  park / throttledRelease / healOrphans / markComplete / delete each affect exactly the
  intended rows, leave in-flight rows untouched, and **no-op** when the row's state changed
  between read and write (the race-safety guarantee).
- **Batch + FailedJob repositories** — against fixtures: Batch cancel stamps cancelledDate and
  drill-down resolves siblings via payload batchId; retry-via-Memento inserts a correct new
  row; enriched Failed Job reads return parsed fields and paginate.
- **Harvester + Authorization** — Harvester dedups via high-water mark and captures terminal
  rows before simulated cleanup; Authorization enforces RBAC plus per-Connection scope
  (viewer cannot control, operator cannot touch ungranted prod, admin can manage vault).

Prior art: the reference `cbq-worker` app and this template use TestBox; integration tests
extend `BaseTestCase` with `appMapping="/app"` and call `setup()` in `beforeEach()`. The
SQLite-fixture pattern leverages the grammar-agnostic QueryBuilderFactory so repository tests
run against a fast embedded database mirroring the real cbq schema.

## Out of Scope

- Modifying or deploying any code into Managed Apps (no embedded agent) — direct DB only.
- Managing **in-process** queues (SyncProvider / ColdBoxAsyncProvider); only durable
  DB-backed queues are visible to an external console.
- Defining or dispatching cbqManager's own business Jobs.
- Reconstructing Veriti-specific domain layers (running events, sequences, tasks) seen in the
  reference app.
- Cloud KMS credential management (the cipher seam allows it later; v1 uses an env key).
- Provisioning enrichment views into target databases (enrichment is app-side).
- Fixing the upstream cbq DBProvider Orphan defect itself (cbqManager detects and heals it).
- A full multi-connection credential registry UI hardening beyond v1 (basic CRUD + encryption
  is in scope; advanced secret rotation is later).

## Further Notes

- The design was validated against two live incidents during planning: an Orphan-starved power
  Worker (resolved via Queue Health detection + Heal) and a large Batch cancel (resolved via
  cancel-stamp + payload-batchId sibling removal). Both became first-class features.
- The reference SQL toolkit (`cbq stuck-job detection + throttled de-queue`) is the blueprint
  for QueueHealthAnalyzer and the Park / Throttled Release / Heal / discard-stale actions; its
  careful dry-run-then-commit ergonomics should be preserved as the console's bulk-action UX.
- Queue **priority order** cannot be inferred from data; PoolParamsInference must accept a
  configured priority fallback per Connection even though timeout is inferred.
- The Harvester polling can double as a degraded, poll-based live activity source when no
  Broadcast Connection is configured.
