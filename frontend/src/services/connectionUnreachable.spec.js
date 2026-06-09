import { describe, it, expect } from 'vitest'
import { isConnectionUnreachable, UNREACHABLE_CODE } from './connectionUnreachable.js'

// The error shape api.js throws: an Error with `.status` (HTTP) and `.json` (parsed body).
const apiError = (status, json) => Object.assign(new Error('x'), { status, json })

describe('isConnectionUnreachable', () => {
  it('detects the structured 503 connection_unreachable contract', () => {
    const err = apiError(503, { error: true, code: UNREACHABLE_CODE, messages: ['connect the VPN'] })
    expect(isConnectionUnreachable(err)).toBe(true)
  })

  it('detects on the code alone even if status differs (code is authoritative)', () => {
    expect(isConnectionUnreachable(apiError(500, { code: UNREACHABLE_CODE }))).toBe(true)
  })

  it('detects on a 503 status even without the code (fast path)', () => {
    expect(isConnectionUnreachable(apiError(503, {}))).toBe(true)
  })

  it('tolerates a nested data.code wrapping', () => {
    expect(isConnectionUnreachable(apiError(200, { data: { code: UNREACHABLE_CODE } }))).toBe(true)
  })

  it('does NOT trip on auth failures (401/403 are handled globally, not here)', () => {
    expect(isConnectionUnreachable(apiError(401, { error: true, messages: ['expired'] }))).toBe(false)
    expect(isConnectionUnreachable(apiError(403, { error: true, messages: ['Forbidden'] }))).toBe(false)
  })

  it('does NOT trip on an ordinary 500 / other errors', () => {
    expect(isConnectionUnreachable(apiError(500, { error: true, messages: ['boom'] }))).toBe(false)
    expect(isConnectionUnreachable(apiError(404, {}))).toBe(false)
  })

  it('is safe for null/undefined/no-json errors', () => {
    expect(isConnectionUnreachable(null)).toBe(false)
    expect(isConnectionUnreachable(undefined)).toBe(false)
    expect(isConnectionUnreachable(new Error('plain'))).toBe(false)
  })
})
