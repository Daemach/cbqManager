---
status: accepted
---

# Local Archive populated by a periodic Harvester

cbqManager keeps long-lived, queue-filterable job history in its **own local Archive**, populated by a periodic **Harvester** that snapshots terminal Jobs (completed/failed) and Queue Depth samples from each Connection. This is necessary because cbq's DBProvider runs a cleanup task that **deletes completed and failed rows** from `cbq_jobs`, so the live target table cannot be a source of long history. Live state is read from the target DB; history is read from the Archive.

## Consequences

- The Harvester interval per Connection must be **shorter than that target's cbq cleanup window**, or rows are deleted before they are archived. A per-Connection/queue high-water mark dedups already-harvested rows.
- The Archive grows over time and needs its own (long but bounded) retention policy, independent of any target's retention.
- When no Broadcast Connection is configured, the Harvester's polling can also back a degraded, poll-based activity view.
