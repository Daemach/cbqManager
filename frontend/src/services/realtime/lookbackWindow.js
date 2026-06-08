// LookbackWindow (pure) — "current feed + last N minutes" selection over a retained event history
// (PRD-0002 → Primary operator workflow #4; issue #19). The RealtimeStore keeps a per-context, TIME-
// bounded history (separate from the 500-row visible cap) so a just-happened error is still findable
// after it scrolled off the visible feed. These helpers pick the events inside the lookback window;
// the existing pure LiveEventFilter then narrows by queue/state/mapping/instance/text.
//
// Events carry a `time` that is a Date (EventNormalizer guarantees this), but these helpers also
// accept a numeric epoch or an ISO string so they stay robust. An unparseable time is treated as
// "now" so a malformed event is never silently dropped from a lookback.

/** Coerce an event's time to epoch milliseconds; falls back to `nowMs` when absent/unparseable. */
export function eventTimeMs(event, nowMs) {
  const t = event == null ? null : event.time
  if (t == null || t === '') return nowMs
  if (t instanceof Date) {
    const ms = t.getTime()
    return Number.isNaN(ms) ? nowMs : ms
  }
  if (typeof t === 'number') return Number.isNaN(t) ? nowMs : t
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? nowMs : ms
}

/**
 * Select the events whose time falls within the lookback window `[nowMs - minutes*60000, nowMs]`.
 * `minutes <= 0` (or non-finite) means "no lookback" → returns a copy of the whole list unchanged
 * (the caller falls back to the live visible feed in that case). Order is preserved.
 */
export function eventsWithinWindow(events, nowMs, minutes) {
  if (!Array.isArray(events)) return []
  const mins = Number(minutes)
  if (!Number.isFinite(mins) || mins <= 0) return events.slice()
  const cutoff = nowMs - mins * 60000
  return events.filter((e) => {
    const ms = eventTimeMs(e, nowMs)
    return ms >= cutoff && ms <= nowMs
  })
}

/**
 * Prune a retained history in place to the events newer than `minutes` ago (keeps the buffer from
 * growing unbounded). Returns the same array reference (mutated) so callers can keep their binding.
 * A non-positive/non-finite `minutes` is a no-op (retain everything).
 */
export function pruneHistory(history, nowMs, minutes) {
  if (!Array.isArray(history)) return []
  const mins = Number(minutes)
  if (!Number.isFinite(mins) || mins <= 0) return history
  const cutoff = nowMs - mins * 60000
  for (let i = history.length - 1; i >= 0; i--) {
    if (eventTimeMs(history[i], nowMs) < cutoff) history.splice(i, 1)
  }
  return history
}
