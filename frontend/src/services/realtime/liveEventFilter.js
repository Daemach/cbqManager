// LiveEventFilter (pure) — applies a multi-column filter spec to a list of LiveEvents (PRD-0002).
//
// Filter spec: { queue, state, mapping, instance, text }
//   - Column filters (queue/state/mapping/instance) are case-insensitive substring matches, ANDed
//     together; a blank/absent column is ignored.
//   - `text` is a free-text term matched against ALL displayable fields (queue, instance, mapping,
//     jobId, state, type, text, error, line).
//   - An empty spec (every field blank/absent) is a pass-through: every event matches.

const COLUMNS = [ 'queue', 'state', 'mapping', 'instance' ]

function norm(v) {
  return String(v == null ? '' : v).trim().toLowerCase()
}

function provided(v) {
  return v != null && String(v).trim() !== ''
}

/** Whether a filter spec constrains anything at all (false => pass-through). */
export function isEmptyFilter(spec) {
  if (!spec) return true
  return !COLUMNS.some((c) => provided(spec[c])) && !provided(spec.text)
}

/** Whether a single event satisfies the spec. */
export function matchesFilter(event, spec = {}) {
  if (isEmptyFilter(spec)) return true
  if (!event) return false

  for (const col of COLUMNS) {
    if (provided(spec[col]) && !norm(event[col]).includes(norm(spec[col]))) {
      return false
    }
  }

  if (provided(spec.text)) {
    const haystack = [
      event.queue, event.instance, event.mapping, event.jobId,
      event.state, event.type, event.text, event.error, event.line
    ].map(norm).join(' ')
    if (!haystack.includes(norm(spec.text))) return false
  }

  return true
}

/** Filter a list of events by the spec. Non-arrays yield []. */
export function applyFilter(events, spec) {
  if (!Array.isArray(events)) return []
  if (isEmptyFilter(spec)) return events.slice()
  return events.filter((e) => matchesFilter(e, spec))
}
