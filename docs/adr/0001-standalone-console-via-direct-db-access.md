---
status: accepted
---

# Standalone ops console via direct database access

cbqManager is a standalone operations console that monitors and controls cbq queues belonging to **other** applications; it runs no Jobs of its own. It reaches each Managed App's queues by connecting **directly to that app's `cbq_jobs` / `cbq_failed_jobs` / `cbq_batches` tables** via qb, rather than by embedding an agent/endpoint into every Managed App.

## Considered Options

- **Direct DB access (chosen)** — zero changes to Managed Apps; works for any DBProvider-backed queue; reuses qb. Couples cbqManager to cbq's table schema and payload format, and only works for durable (DB-backed) connections — in-process `SyncProvider`/`ColdBoxAsyncProvider` queues live in the worker's memory and are invisible to an external process.
- **Embedded agent/API in each Managed App** — decouples from schema and supports any provider, but requires deploying and maintaining cbqManager code inside every app we want to manage. Rejected as too invasive for an ops tool.

## Consequences

- A cbq major-version change in a Managed App that alters the table schema or payload format can break reads/writes for that app.
- Because cbqManager writes to tables that the Managed App's Workers are concurrently polling, all control writes are **guarded conditional** `UPDATE`/`DELETE`s whose `WHERE` clauses mirror cbq's own guards, so a write that loses a race with a Worker safely no-ops.
