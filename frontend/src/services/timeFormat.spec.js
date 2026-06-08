import { describe, it, expect } from 'vitest'
import { toDate, absolute, relative, elapsed, formatDurationSeconds } from './timeFormat.js'

// Fixed clock so relative assertions are deterministic.
const FIXED = new Date('2026-06-09T12:00:00.000Z')
const now = () => FIXED

describe('toDate', () => {
  it('returns null for blank/null/empty/zero', () => {
    expect(toDate('')).toBeNull()
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
    expect(toDate(0)).toBeNull()
    expect(toDate('0')).toBeNull()
  })

  it('parses an ISO string from the hr* fields', () => {
    const d = toDate('2026-06-09T05:36:25Z')
    expect(d.toISOString()).toBe('2026-06-09T05:36:25.000Z')
  })

  it('parses epoch SECONDS from a number', () => {
    // 1780958185s -> 2026-06-08T22:36:25Z in UTC (the server's hr* string is rendered in -07:00).
    expect(toDate(1780958185).toISOString()).toBe('2026-06-08T22:36:25.000Z')
  })

  it('parses epoch seconds from a numeric string', () => {
    expect(toDate('1780958185').toISOString()).toBe('2026-06-08T22:36:25.000Z')
  })

  it('passes a Date through and rejects an invalid Date', () => {
    expect(toDate(FIXED)).toBe(FIXED)
    expect(toDate(new Date('nonsense'))).toBeNull()
  })
})

describe('absolute', () => {
  it('renders a trimmed ISO (no millis) for an ISO input', () => {
    expect(absolute('2026-06-09T05:36:25Z')).toBe('2026-06-09T05:36:25Z')
  })
  it('renders ISO for an epoch-seconds input', () => {
    expect(absolute(1780958185)).toBe('2026-06-08T22:36:25Z')
  })
  it('is blank for a blank value', () => {
    expect(absolute('')).toBe('')
    expect(absolute(0)).toBe('')
  })
})

describe('relative', () => {
  it('is blank for a blank value', () => {
    expect(relative('', { now })).toBe('')
  })
  it('says "just now" within 5s', () => {
    expect(relative('2026-06-09T11:59:58Z', { now })).toBe('just now')
  })
  it('renders minutes ago', () => {
    expect(relative('2026-06-09T11:57:00Z', { now })).toBe('3m ago')
  })
  it('renders hours ago (largest unit)', () => {
    expect(relative('2026-06-09T10:00:00Z', { now })).toBe('2h ago')
  })
  it('renders days ago', () => {
    expect(relative('2026-06-06T12:00:00Z', { now })).toBe('3d ago')
  })
  it('renders a future instant with "in"', () => {
    expect(relative('2026-06-09T12:05:00Z', { now })).toBe('in 5m')
  })
  it('works on epoch-seconds inputs too', () => {
    // FIXED - 180s
    expect(relative(Math.floor(FIXED.getTime() / 1000) - 180, { now })).toBe('3m ago')
  })
})

describe('elapsed', () => {
  it('is blank for blank/null', () => {
    expect(elapsed('')).toBe('')
    expect(elapsed(null)).toBe('')
  })
  it('passes a pre-formatted clock string through', () => {
    expect(elapsed('00:00:12')).toBe('00:00:12')
  })
  it('humanizes a numeric-string of seconds', () => {
    expect(elapsed('12')).toBe('12s')
    expect(elapsed('64')).toBe('1m 4s')
  })
  it('humanizes a number of seconds', () => {
    expect(elapsed(3661)).toBe('1h 1m')
  })
})

describe('formatDurationSeconds', () => {
  it('renders 0s for zero', () => {
    expect(formatDurationSeconds(0)).toBe('0s')
  })
  it('caps at two units', () => {
    expect(formatDurationSeconds(90061)).toBe('1d 1h') // drops the trailing minutes/seconds
  })
  it('handles negatives', () => {
    expect(formatDurationSeconds(-64)).toBe('-1m 4s')
  })
})
