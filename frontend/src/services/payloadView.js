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
