// connectionUnreachable.js — pure detection of the "Connection's target DB is unreachable" signal.
//
// CONTEXT.md "Primary operator workflow": the operator opens the console BEFORE connecting the VPN,
// so a Connection's target DB is briefly unreachable. The backend maps that to a structured HTTP 503
// with body { error:true, code:"connection_unreachable", messages:[...] } (NOT a 401/403, which would
// trip the global auth redirect in App.vue). api.js throws an Error carrying `.status` and `.json`.
//
// This is a PURE predicate over that thrown error so the tool views can show a calm, retryable banner
// instead of a raw error/blank. Keep it dependency-free and unit-tested (connectionUnreachable.spec.js).

export const UNREACHABLE_CODE = 'connection_unreachable'

export const UNREACHABLE_MESSAGE =
  "Can't reach this Connection's database — connect the VPN and refresh"

/**
 * True when a thrown api error means the Connection's target DB is unreachable.
 * Matches on EITHER the 503 status OR the structured code (the code is the authoritative signal;
 * status is the fast path). Tolerant of the error shape: `.json.code` is the contract, but we also
 * accept a nested `.json.data.code` in case the body is ever wrapped.
 *
 * @param {*} err - the error thrown by api.js (has .status and .json), or any value.
 * @returns {boolean}
 */
export function isConnectionUnreachable(err) {
  if (!err) return false
  const code = err.json?.code ?? err.json?.data?.code
  if (code === UNREACHABLE_CODE) return true
  return err.status === 503
}
