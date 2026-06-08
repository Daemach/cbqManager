// Pure payload pretty-printer + copy-text builder for the job views (issue #23 part B).
//
// The job rows carry a payload as a JSON STRING under different keys per endpoint:
//   - /jobs        -> row.payload
//   - /failed-jobs -> row.memento  (the re-queueable Memento; ADR-0002)
//   - /batches     -> row.options  (the batch options blob)
// These helpers take the raw string and produce display text for the "Payload" dialog and the
// one-click Copy button. Pure + unit-tested in payloadView.spec.js.

/**
 * Pretty-print a payload string: JSON.parse then JSON.stringify(_, null, 2). If the value isn't
 * valid JSON, fall back to the raw text. Blank/null -> "" (the dialog shows an empty-state instead).
 */
export function prettyPayload(raw) {
  if (raw == null) return ''
  const s = typeof raw === 'string' ? raw : String(raw)
  if (s.trim() === '') return ''
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s // not JSON — show it verbatim
  }
}

/** Parse a payload string to an object, or null when blank / not JSON. */
export function parsePayload(raw) {
  if (raw == null) return null
  const s = typeof raw === 'string' ? raw : String(raw)
  if (s.trim() === '') return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

/**
 * Extract a top-level field (e.g. `mapping`, `batchId`) from a JSON payload as a display string.
 * Missing / null / blank -> "". Objects/arrays are JSON-stringified so a cell never renders "[object
 * Object]". Used to surface the Job's Mapping + Batch from its payload blob.
 */
export function payloadField(raw, key) {
  const obj = parsePayload(raw)
  if (!obj) return ''
  const v = obj[key]
  if (v == null || v === '') return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/**
 * The full payload text for a hover TOOLTIP — but only when it's short enough to read inline
 * (pretty-printed length <= max). Longer payloads return "" so the caller falls back to the dialog.
 */
export function tooltipPayload(raw, max = 200) {
  const pretty = prettyPayload(raw)
  return pretty && pretty.length <= max ? pretty : ''
}

/** True when the parsed payload is valid JSON (drives the "valid JSON" vs "raw text" hint). */
export function isJson(raw) {
  if (raw == null) return false
  const s = typeof raw === 'string' ? raw : String(raw)
  if (s.trim() === '') return false
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

/**
 * The text placed on the clipboard by the Copy button — the pretty-printed JSON (or raw text).
 * Always returns a string (empty for a blank payload) so the copy handler never copies "null".
 */
export function copyText(raw) {
  return prettyPayload(raw)
}
