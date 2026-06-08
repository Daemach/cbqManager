import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRealtimeStore } from './realtime'

// Covers the per-context filter merge used by tool Queue drill-downs (#11) and the dock's per-field
// inputs. The event-matching itself is covered by liveEventFilter.spec.js; here we only assert the
// store keeps one source of truth per context and merges fields without clobbering.
describe('RealtimeStore filters', () => {
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useRealtimeStore()
  })

  it('mergeFilter sets a single field while preserving the others', () => {
    store.setFilter('7', { state: 'failed', text: 'boom' })
    store.mergeFilter('7', { queue: 'emails' })
    expect(store.contexts['7'].filter).toEqual({ state: 'failed', text: 'boom', queue: 'emails' })
  })

  it('mergeFilter overwrites the same field (drill-down to a different queue)', () => {
    store.mergeFilter('7', { queue: 'emails' })
    store.mergeFilter('7', { queue: 'reports' })
    expect(store.contexts['7'].filter.queue).toBe('reports')
  })

  it('clearing the queue (merge empty) leaves other fields intact', () => {
    store.setFilter('7', { queue: 'emails', state: 'failed' })
    store.mergeFilter('7', { queue: '' })
    expect(store.contexts['7'].filter).toEqual({ queue: '', state: 'failed' })
  })

  it('is per-context — one Connection\'s filter does not bleed into another', () => {
    store.mergeFilter('7', { queue: 'emails' })
    store.mergeFilter('9', { queue: 'reports' })
    expect(store.contexts['7'].filter.queue).toBe('emails')
    expect(store.contexts['9'].filter.queue).toBe('reports')
  })

  it('activeFilter reflects the active context and coerces ids to strings', () => {
    store.activeId = '7'
    store.mergeFilter(7, { queue: 'emails' })
    expect(store.activeFilter.queue).toBe('emails')
  })
})

// Lookback ('current feed + last N minutes', #19): the retained per-context history is searchable
// beyond the 500-row visible cap, and the SAME combinable filters narrow it. We pin the clock and
// inject events with explicit `time` so the window math is deterministic.
describe('RealtimeStore lookback + retained history', () => {
  const MIN = 60000
  const NOW = 1_700_000_000_000
  let store
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useRealtimeStore()
    store.nowMs = () => NOW // pin the clock for deterministic window math
    store.activeId = '5'
  })

  // Inject one event `agoMin` minutes before NOW into the active context.
  const inject = (agoMin, o = {}) =>
    store.pushEvent('5', { time: new Date(NOW - agoMin * MIN), text: `t-${agoMin}`, ...o })

  it('history accrues even while the visible feed is paused (lookback is not blinded)', () => {
    store.pause('5')
    inject(1)
    inject(2)
    expect(store.contexts['5'].events.length).toBe(0) // visible feed frozen while paused
    expect(store.contexts['5'].history.length).toBe(2) // history still complete
  })

  it('lookback OFF shows only the visible feed; ON searches the retained window', () => {
    inject(1)
    inject(8)
    inject(20)
    // Lookback off → visible feed (all three are visible here, well under the 500 cap).
    store.setLookback('5', 0)
    expect(store.activeFiltered.map((e) => e.text)).toEqual([ 't-20', 't-8', 't-1' ])
    // Lookback last 10 min → t-20 excluded, surfaced from history.
    store.setLookback('5', 10)
    expect(store.activeFiltered.map((e) => e.text).sort()).toEqual([ 't-1', 't-8' ])
  })

  it('surfaces an event that scrolled off the visible cap but is still inside the window', () => {
    store.maxEvents = 3
    // 5 fresh events (all within ~1 min) — visible feed keeps only the newest 3.
    for (let i = 0; i < 5; i++) inject(0.1 * i, { text: `e${i}`, jobId: i })
    expect(store.contexts['5'].events.length).toBe(3)
    expect(store.contexts['5'].history.length).toBe(5)
    // Lookback over the last 10 min recovers all 5, despite the visible cap of 3.
    store.setLookback('5', 10)
    expect(store.activeFiltered.length).toBe(5)
  })

  it('combinable filters narrow the lookback window the same as the live feed', () => {
    inject(2, { queue: 'emails', instance: 'w1' })
    inject(3, { queue: 'imports', instance: 'w2' })
    inject(9, { queue: 'emails', instance: 'w2' })
    store.setLookback('5', 10)
    store.mergeFilter('5', { queue: 'emails' })
    expect(store.activeFiltered.map((e) => e.text).sort()).toEqual([ 't-2', 't-9' ])
    store.mergeFilter('5', { instance: 'w2' })
    expect(store.activeFiltered.map((e) => e.text)).toEqual([ 't-9' ])
  })

  it('lookback is per-context and does not bleed across tabs', () => {
    store.setLookback('5', 10)
    store.setLookback('9', 0)
    expect(store.contexts['5'].lookbackMinutes).toBe(10)
    expect(store.contexts['9'].lookbackMinutes).toBe(0)
  })

  it('prunes history beyond the retention window', () => {
    store.historyRetentionMs = 15 * MIN
    inject(2)
    inject(40) // older than retention → pruned on insert
    expect(store.contexts['5'].history.map((e) => e.text)).toEqual([ 't-2' ])
  })

  it('clearFeed clears both the visible feed and the retained history', () => {
    inject(1)
    inject(2)
    store.clearFeed('5')
    expect(store.contexts['5'].events.length).toBe(0)
    expect(store.contexts['5'].history.length).toBe(0)
  })
})
