// EventNormalizer (pure, version-tolerant) — maps a raw transport message (Pusher or socketbox)
// into a uniform LiveEvent. It accepts BOTH the legacy `{ type, instance, message }` shape and the
// extended `{ queue, mapping, jobId, state, ... }` contract (PRD-0002), populating new fields when
// present and blank-degrading when absent so older Workers keep producing a usable feed.
//
// Heartbeat/sentinel keepalives (`|=0=|`, a bare `done`) are dropped — normalizeEvent returns null.
//
// LiveEvent shape:
//   { time, queue, instance, mapping, jobId, state, attempts, batchId, type, text, error, line }
//   - type ∈ { 'info' | 'warning' | 'error' | 'done' }
//   - attempts is a Number when known, else null; all other absent fields are '' (never undefined).

const STREAM_TYPES = [ 'info', 'warning', 'error', 'done' ]

/** A heartbeat/sentinel keepalive carries no real activity and must be suppressed. */
function isSentinelText(text) {
  const t = String(text == null ? '' : text).trim().toLowerCase()
  return t === '' || t === 'done' || t.includes('|=0=|')
}

/** Does this event carry any structured (extended-contract) field worth keeping? */
function hasStructuredField(e) {
  return !!(e && (e.queue || e.jobId != null || e.mapping || e.state || e.batchId))
}

/** Blank-safe string: undefined/null become '' (CFML-friendly, render-friendly). */
function str(v) {
  return v == null ? '' : String(v)
}

/** Resolve the stream class: honor an explicit `type`, else infer error from error/line/text. */
function classifyType(rawType, { error, line, text }) {
  const t = String(rawType == null ? '' : rawType).trim().toLowerCase()
  if (STREAM_TYPES.includes(t)) return t
  if (error || line) return 'error'
  if (/\b(error|exception|failed|failure)\b/i.test(text || '')) return 'error'
  return 'info'
}

/**
 * Normalize one raw transport payload into a LiveEvent, or null if it is a sentinel/empty.
 *
 * @param raw   a string line, a legacy `{type,instance,message}`, an extended event object, or an
 *              envelope `{ message: <event> }`.
 * @param opts  { now } — injectable clock (() => Date) for deterministic timestamps in tests.
 */
export function normalizeEvent(raw, { now = () => new Date() } = {}) {
  // Unwrap a transport envelope that nests the event object under `.message`.
  let e = raw
  if (e && typeof e === 'object' && e.message && typeof e.message === 'object') {
    e = e.message
  }

  // Bare string payload: the whole event is a single text line.
  if (typeof e === 'string') {
    if (isSentinelText(e)) return null
    return makeEvent({ text: e }, now)
  }

  if (!e || typeof e !== 'object') return null

  const text = str(e.text != null ? e.text : e.message)

  // Drop heartbeats: a sentinel text with no structured payload is pure keepalive noise.
  if (isSentinelText(text) && !hasStructuredField(e)) return null

  return makeEvent(e, now)
}

function makeEvent(e, now) {
  const error = str(e.error)
  const line = str(e.line)
  const text = str(e.text != null ? e.text : e.message)
  return {
    time: e.time ? new Date(e.time) : now(),
    queue: str(e.queue),
    instance: str(e.instance),
    mapping: str(e.mapping),
    jobId: str(e.jobId),
    state: str(e.state),
    attempts: e.attempts == null || e.attempts === '' ? null : Number(e.attempts),
    batchId: str(e.batchId),
    type: classifyType(e.type, { error, line, text }),
    text,
    error,
    line
  }
}
