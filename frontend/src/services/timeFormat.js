// Pure time-formatting helpers for the job views (issue #23 part C).
//
// The /jobs, /failed-jobs, and /batches rows carry two timestamp shapes:
//   - ISO strings in the hr* fields (e.g. hrCreatedDate = "2026-06-09T05:36:25Z"), blank when N/A.
//   - raw Unix-epoch SECONDS in the legacy fields (e.g. createdDate = 1780958185), blank when N/A.
// Some endpoints only ship the raw epoch (batches createdDate/completedDate, no hrCreatedDate), so
// these helpers accept either: an ISO string, a Date, or an epoch-seconds number/numeric-string.
//
// Everything here is PURE (inject `now` for deterministic tests) and unit-tested in timeFormat.spec.js.

/**
 * Coerce a value into a Date, or null when it can't represent a real instant.
 * Accepts: Date, ISO string, epoch-seconds number, or numeric string. Blank/null/0 -> null.
 */
export function toDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    if (!isFinite(value) || value === 0) return null
    return new Date(value * 1000) // epoch seconds
  }
  const s = String(value).trim()
  if (s === '' || s === '0') return null
  // Pure-numeric string -> epoch seconds. Otherwise treat as an ISO/date string.
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n === 0 ? null : new Date(n * 1000)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** Absolute ISO label (UTC, no millis) for tooltips — blank when there's no instant. */
export function absolute(value) {
  const d = toDate(value)
  if (!d) return ''
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Concise relative label ("just now", "3m ago", "in 5m"). Blank when there's no instant.
 * `now` is injectable for deterministic tests.
 */
export function relative(value, { now = () => new Date() } = {}) {
  const d = toDate(value)
  if (!d) return ''
  const nowMs = (now() instanceof Date ? now() : new Date(now())).getTime()
  const diffSec = Math.round((nowMs - d.getTime()) / 1000)
  const future = diffSec < 0
  const abs = Math.abs(diffSec)
  if (abs < 5) return 'just now'
  const label = humanizeSeconds(abs)
  return future ? `in ${label}` : `${label} ago`
}

/** Turn a positive second count into a compact "3m" / "2h" / "4d" label (largest unit). */
function humanizeSeconds(totalSec) {
  const units = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1]
  ]
  for (const [suffix, size] of units) {
    if (totalSec >= size) return `${Math.floor(totalSec / size)}${suffix}`
  }
  return `${totalSec}s`
}

/**
 * Format an elapsed/totalTime value for display. The repos may ship these as:
 *   - a pre-formatted string ("00:00:12", "1.2s") -> passed through as-is,
 *   - a number of seconds -> humanized ("12s", "3m 4s"),
 *   - blank/null -> "".
 */
export function elapsed(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'number') return formatDurationSeconds(value)
  const s = String(value).trim()
  if (s === '') return ''
  // Pure-numeric string -> seconds. Otherwise it's already a human/clock string.
  if (/^\d+(\.\d+)?$/.test(s)) return formatDurationSeconds(Number(s))
  return s
}

/** Humanize a duration in seconds to up to two units, e.g. 0->"0s", 64->"1m 4s", 3661->"1h 1m". */
export function formatDurationSeconds(totalSec) {
  if (!isFinite(totalSec)) return ''
  const sign = totalSec < 0 ? '-' : ''
  let rem = Math.round(Math.abs(totalSec))
  if (rem === 0) return '0s'
  const units = [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1]
  ]
  const parts = []
  for (const [suffix, size] of units) {
    if (rem >= size) {
      parts.push(`${Math.floor(rem / size)}${suffix}`)
      rem %= size
    }
    if (parts.length === 2) break
  }
  return sign + parts.join(' ')
}
