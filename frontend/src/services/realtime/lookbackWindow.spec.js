import { describe, it, expect } from 'vitest'
import { eventTimeMs, eventsWithinWindow, pruneHistory } from './lookbackWindow'

const MIN = 60000
const NOW = 1_700_000_000_000 // fixed epoch so the window math is deterministic (no Date.now flakiness)

// Build an event whose time is `agoMin` minutes before NOW.
const at = (agoMin, o = {}) => ({ time: new Date(NOW - agoMin * MIN), text: `t-${agoMin}`, ...o })

describe('lookbackWindow', () => {
  describe('eventTimeMs', () => {
    it('reads a Date time', () => {
      expect(eventTimeMs({ time: new Date(NOW) }, 0)).toBe(NOW)
    })
    it('accepts a numeric epoch and an ISO string', () => {
      expect(eventTimeMs({ time: NOW }, 0)).toBe(NOW)
      expect(eventTimeMs({ time: new Date(NOW).toISOString() }, 0)).toBe(NOW)
    })
    it('falls back to nowMs for an absent or unparseable time', () => {
      expect(eventTimeMs({ time: '' }, NOW)).toBe(NOW)
      expect(eventTimeMs({}, NOW)).toBe(NOW)
      expect(eventTimeMs({ time: 'not-a-date' }, NOW)).toBe(NOW)
      expect(eventTimeMs(null, NOW)).toBe(NOW)
    })
  })

  describe('eventsWithinWindow', () => {
    const HIST = [ at(0), at(3), at(7), at(12), at(20) ] // newest-first, like the store buffer

    it('selects only events within the last N minutes (inclusive of the boundary)', () => {
      // last 10 min → 0,3,7 in; 12,20 out
      expect(eventsWithinWindow(HIST, NOW, 10).map((e) => e.text)).toEqual([ 't-0', 't-3', 't-7' ])
    })
    it('a wider window surfaces an older event the narrower one dropped', () => {
      const narrow = eventsWithinWindow(HIST, NOW, 5).map((e) => e.text)
      const wide = eventsWithinWindow(HIST, NOW, 15).map((e) => e.text)
      expect(narrow).toEqual([ 't-0', 't-3' ])
      expect(wide).toEqual([ 't-0', 't-3', 't-7', 't-12' ])
      // the t-7 / t-12 events are findable only via the wider lookback
      expect(narrow).not.toContain('t-7')
      expect(wide).toContain('t-12')
    })
    it('includes an event exactly on the cutoff boundary', () => {
      expect(eventsWithinWindow([ at(10) ], NOW, 10).map((e) => e.text)).toEqual([ 't-10' ])
    })
    it('excludes future events beyond now', () => {
      const future = { time: new Date(NOW + 5 * MIN), text: 'future' }
      expect(eventsWithinWindow([ future, at(1) ], NOW, 10).map((e) => e.text)).toEqual([ 't-1' ])
    })
    it('treats minutes <= 0 (lookback off) as pass-through copy', () => {
      const out = eventsWithinWindow(HIST, NOW, 0)
      expect(out.map((e) => e.text)).toEqual(HIST.map((e) => e.text))
      expect(out).not.toBe(HIST)
    })
    it('non-array input yields []', () => {
      expect(eventsWithinWindow(null, NOW, 10)).toEqual([])
    })
    it('preserves the input order', () => {
      expect(eventsWithinWindow(HIST, NOW, 30)).toEqual(HIST)
    })
  })

  describe('pruneHistory', () => {
    it('drops events older than the retention window, in place', () => {
      const hist = [ at(0), at(3), at(20), at(40) ]
      const ret = pruneHistory(hist, NOW, 15)
      expect(ret).toBe(hist) // same reference, mutated
      expect(hist.map((e) => e.text)).toEqual([ 't-0', 't-3' ])
    })
    it('is a no-op for minutes <= 0', () => {
      const hist = [ at(0), at(99) ]
      pruneHistory(hist, NOW, 0)
      expect(hist.map((e) => e.text)).toEqual([ 't-0', 't-99' ])
    })
  })
})
