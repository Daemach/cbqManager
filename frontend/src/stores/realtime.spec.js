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
