---
status: accepted
---

# Pluggable realtime transport via normalized Broadcast Connections

Live Worker-activity streaming is modeled as a reusable **Broadcast Connection** (a transport + its server credentials) referenced by DB Connections via a channel, rather than flat realtime config stuffed onto each Connection. The transport is pluggable — **`pusher` or `socketbox`** — and the frontend instantiates a matching adapter at runtime. cbqManager is a subscriber/relay of the stream; the Managed App's own Workers remain the event source.

This normalization is required to represent the team's real cases: one Pusher app with **different channels per environment** (many DB Connections → one Broadcast Connection, distinct channels), and **fully separate connections** (distinct Broadcast Connections), plus swapping Pusher↔socketbox by changing a record rather than code.

## Consequences

- Broadcast Connection secrets (e.g. Pusher `secret`) are part of the encrypted credential vault (see ADR-0003).
- Switching or adding a transport is a data change; supporting a new transport is one new frontend adapter.
