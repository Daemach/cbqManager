---
status: accepted
---

# Retry by direct-DB memento insert

cbqManager retries a Failed Job by **inserting a new `cbq_jobs` row whose `payload` is the Failed Job's stored `memento`** (attempts reset, `availableDate = now`, all reservation/terminal columns null). The Managed App's own Worker then deserializes and runs it. cbqManager never instantiates the Job class.

This works because cbq stores `payload = serializeJSON( job.getMemento() )` and a Worker's `deserializeJob()` simply does `deserializeJSON(payload)` then `wirebox.getInstance( config.mapping )` — the payload already carries its own `mapping`, so re-inserting the memento is sufficient.

## Considered Options

- **Memento insert (chosen)** — fully decoupled from the Managed App's code; works even for proprietary or absent Job classes. Couples to cbq's `payload == serialized memento` convention (the same coupling we already accept for reading the tables).
- **`cbq.job( mapping ).applyMemento().dispatch()`** (the reference app's approach) — decouples from payload format but requires loading every Managed App's Job CFCs into cbqManager, defeating the standalone design and failing when classes are unavailable. Rejected.
