# cbqManager

A standalone operations console for monitoring and controlling **cbq** background-job queues that belong to **other** applications. It is an admin/ops plane, not a worker app — it defines few or no Job classes of its own; instead it attaches to external cbq storage to observe and act on jobs.

## Language

**Managed App**:
An external application that runs cbq and whose queues cbqManager attaches to.
_Avoid_: client app, tenant (until multi-tenancy is decided)

**Connection**:
A cbq backend definition (driver + storage location) — database, Redis, or SQS — through which jobs are stored and retrieved.
_Avoid_: datasource (a datasource is only the DB-driver case of a Connection)

**Queue**:
A named channel within a Connection that jobs are placed on and workers poll.
_Avoid_: channel, topic

**Job**:
A single unit of background work, carrying a serialized payload and an attempt count, that lives on a Queue.
_Avoid_: task, message

**Failed Job**:
A record in the `cbq_failed_jobs` table — a permanent log of a Job that exhausted its attempts, storing its **Mapping**, **Memento**, and exception details. Distinct from a transient `cbq_jobs` row whose `failedDate` is set.
_Avoid_: dead job, errored job

**Worker**:
A thread (in a Managed App, not in cbqManager) that polls a Queue and executes Jobs.
_Avoid_: consumer, runner

**Mapping**:
The WireBox mapping / class name that identifies which Job type a payload or Failed Job belongs to (e.g. `SendWelcomeEmailJob`).
_Avoid_: job name, type

**Memento**:
The serialized snapshot of a Job's properties — enough state to reconstruct and re-dispatch that Job.
_Avoid_: payload (payload is cbq's internal serialized blob on `cbq_jobs`; memento is the property snapshot stored on a Failed Job)

**Batch**:
A named group of Jobs tracked together in `cbq_batches`, with counts of total/pending/failed Jobs and lifecycle dates.
_Avoid_: group, chain (a chain is a sequence, not a batch)

**Enrichment View**:
A database view (e.g. `vw_cbq_failed_jobs`) layered over cbq's tables in a Managed App's DB that parses raw exception columns into queryable fields (fileName, lineNumber, sql).
_Avoid_: report

**Broadcast Connection**:
A reusable definition of a realtime transport and its server credentials — Pusher (key/cluster/appId/secret) or socketbox (ws server URL/auth) — through which live worker activity is published and subscribed.
_Avoid_: pusher config, socket server

**Transport**:
The realtime delivery mechanism of a Broadcast Connection: `pusher` or `socketbox`. Selected per Broadcast Connection; the frontend picks a matching adapter at runtime.
_Avoid_: protocol, driver

**Channel**:
The named stream within a Broadcast Connection that a specific Connection's live worker activity flows on (e.g. a per-environment channel). Distinct from a Queue.
_Avoid_: topic, queue

**Harvester**:
A periodic background process in cbqManager that snapshots terminal Jobs (completed/failed) and Queue Depth samples from each Connection into the local Archive before the Managed App's cbq cleanup task deletes them. Must run more frequently than the target's cleanup window.
_Avoid_: poller, sync

**Archive**:
cbqManager's long-lived local record of harvested Jobs and Queue Depth samples, queryable and filterable by Connection and Queue far beyond the Managed App's own short retention. Live state is read from the target DB; history is read from the Archive.
_Avoid_: log, cache

**Queue Depth**:
A point-in-time count of Jobs in a Queue grouped by Job State, sampled by the Harvester to build trend history.
_Avoid_: backlog, size

**Next Up**:
The Job a given Worker pool would reserve next, computed by replicating cbq's selection order (state filter, queue priority, lowest id). Used to spotlight a suspected poison Job stalling a Queue.
_Avoid_: head, top

**Orphan**:
A `cbq_jobs` row in an un-recoverable claim state — `reservedBy` set, `reservedDate` NULL, and due (`availableDate <= now`) — left when a Worker dies mid-claim. cbq selects it as a candidate but cannot lock it, so an Orphan at the head of a priority Queue silently starves the whole pool. The primary cause of a stalled Queue.
_Avoid_: stuck job, zombie, poison job (poison = a job that crashes the Worker; an Orphan is a claim-state defect)

**Queue Health**:
The per-Queue breakdown of open Jobs into `open_total`, `orphaned_blockers`, `pickable_fresh`, `pickable_reserved_timedout`, `in_flight`, and `scheduled_future` — the console's headline diagnostic for spotting starvation.
_Avoid_: status, stats

**Heal**:
A control action (and scheduled guard) that returns Orphans to a fresh, lockable state by nulling `reservedBy`. Idempotent.
_Avoid_: fix, repair

**Park**:
A control action that removes due Jobs from the pickable set without deleting them, by pushing `availableDate` far into the future (a sentinel epoch) and clearing reservation fields. Reversible via Throttled Release.
_Avoid_: pause, hold

**Throttled Release**:
A control action that re-makes Parked Jobs due in staggered windows (N per window, in Queue-priority order) to drain a backlog without flooding downstream systems.
_Avoid_: drip, replay

## Known constraints

- **cbq DBProvider Orphan bug**: `fetchPotentiallyOpenRecords` selects Orphans as candidates but `tryToLockRecords` cannot lock them, so an Orphan at a Queue head starves the pool with no error. Until fixed upstream, cbqManager surfaces Orphans (Queue Health) and offers Heal as a scheduled guard. The reservation timeout and Queue-priority order needed to reason about this live only in each Managed App's `config/cbq.cfc`, not the database.

**Job State**:
The lifecycle position of a `cbq_jobs` row, derived from its date columns — **Available** (unreserved, `availableDate <= now`), **Reserved** (`reservedDate`/`reservedBy` set, a Worker holds it), **Completed** (`completedDate` set), **Failed** (`failedDate` set). Drives which control actions are offered.
_Avoid_: status (status is overloaded)

**Reset**:
A control action that returns a stuck **Reserved** Job to **Available** by nulling `reservedDate`/`reservedBy` and setting `availableDate=now`. Gated by a Stuck Threshold; can cause double-execution if the original Worker is merely slow.
_Avoid_: release, requeue (release is cbq's internal backoff path; requeue means a fresh insert)

**Retry**:
A control action that re-queues a **Failed Job** by inserting a new `cbq_jobs` row whose `payload` is the Failed Job's stored **Memento**. Never reuses the original row.
_Avoid_: rerun, replay

## Relationships

- A **Managed App** exposes one or more **Connections**
- A **Connection** is reached via one registered datasource and may reference one **Broadcast Connection** (+ a **Channel**) for live activity
- A **Connection** contains one or more **Queues**
- A **Queue** holds zero or more **Jobs**, each in a **Job State**
- A **Job** that exhausts its attempts becomes a **Failed Job** (and leaves a transient `failedDate`-marked row until cbq cleanup)
- **Workers** run inside the **Managed App**, not inside cbqManager — cbqManager mutates rows directly, racing Workers, so control writes are guarded conditionals
- A **Batch** can be cancelled (stamps `cancelledDate`, which Workers honor) and its **Failed Jobs** retried via its `failedJobIds`. There is no `batchId` column on `cbq_jobs`, but each batch Job carries `batchId` inside its payload JSON — so a Batch's live Jobs are found by extracting `$.batchId` from a known Job and matching siblings (drill-down feasible on JSON-capable grammars)

## Flagged ambiguities

- "cbqManager manages jobs" was ambiguous between *running its own jobs* and *administering other apps' jobs* — resolved: it is a standalone ops console over external Managed Apps.
