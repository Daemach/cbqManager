import { describe, it, expect } from 'vitest'
import { applyFilter, matchesFilter, isEmptyFilter } from './liveEventFilter'

const ev = (o) => ({
  time: new Date(), queue: '', instance: '', mapping: '', jobId: '', state: '',
  attempts: null, batchId: '', type: 'info', text: '', error: '', line: '', ...o
})

const SAMPLE = [
  ev({ queue: 'emails', state: 'reserved', mapping: 'SendWelcomeEmailJob', instance: 'worker-1', jobId: '1', text: 'picked up' }),
  ev({ queue: 'emails', state: 'completed', mapping: 'SendWelcomeEmailJob', instance: 'worker-2', jobId: '2', text: 'finished' }),
  ev({ queue: 'imports', state: 'failed', mapping: 'ImportCsvJob', instance: 'worker-1', jobId: '3', type: 'error', text: 'boom', error: 'NPE' }),
  ev({ queue: '', state: 'available', mapping: 'LegacyJob', instance: 'old-worker', jobId: '4', text: 'queued' })
]

describe('LiveEventFilter', () => {
  describe('isEmptyFilter', () => {
    it('treats no spec / all-blank as empty (pass-through)', () => {
      expect(isEmptyFilter(undefined)).toBe(true)
      expect(isEmptyFilter({})).toBe(true)
      expect(isEmptyFilter({ queue: '', text: '  ' })).toBe(true)
    })
    it('treats any provided field as non-empty', () => {
      expect(isEmptyFilter({ queue: 'emails' })).toBe(false)
      expect(isEmptyFilter({ text: 'boom' })).toBe(false)
    })
  })

  describe('pass-through', () => {
    it('returns all events for an empty filter', () => {
      expect(applyFilter(SAMPLE, {}).length).toBe(4)
      expect(applyFilter(SAMPLE, undefined).length).toBe(4)
    })
    it('returns a copy, not the original array', () => {
      const out = applyFilter(SAMPLE, {})
      expect(out).not.toBe(SAMPLE)
    })
    it('non-array input yields []', () => {
      expect(applyFilter(null, { queue: 'x' })).toEqual([])
    })
  })

  describe('single-column filters', () => {
    it('filters by queue (substring, case-insensitive)', () => {
      expect(applyFilter(SAMPLE, { queue: 'email' }).length).toBe(2)
      expect(applyFilter(SAMPLE, { queue: 'EMAILS' }).length).toBe(2)
    })
    it('filters by state', () => {
      expect(applyFilter(SAMPLE, { state: 'failed' }).map((e) => e.jobId)).toEqual([ '3' ])
    })
    it('filters by mapping', () => {
      expect(applyFilter(SAMPLE, { mapping: 'ImportCsv' }).length).toBe(1)
    })
    it('filters by instance', () => {
      expect(applyFilter(SAMPLE, { instance: 'worker-1' }).map((e) => e.jobId)).toEqual([ '1', '3' ])
    })
  })

  describe('multi-column filters (ANDed)', () => {
    it('requires every provided column to match', () => {
      expect(applyFilter(SAMPLE, { queue: 'emails', state: 'reserved' }).map((e) => e.jobId)).toEqual([ '1' ])
    })
    it('excludes when one column fails', () => {
      expect(applyFilter(SAMPLE, { queue: 'emails', state: 'failed' })).toEqual([])
    })
  })

  describe('free-text search', () => {
    it('matches across mapping/text/jobId/error', () => {
      expect(applyFilter(SAMPLE, { text: 'welcome' }).length).toBe(2) // mapping SendWelcomeEmailJob
      expect(applyFilter(SAMPLE, { text: 'npe' }).map((e) => e.jobId)).toEqual([ '3' ]) // error field
      expect(applyFilter(SAMPLE, { text: 'finished' }).map((e) => e.jobId)).toEqual([ '2' ])
    })
    it('combines free text with a column filter', () => {
      expect(applyFilter(SAMPLE, { queue: 'emails', text: 'finished' }).map((e) => e.jobId)).toEqual([ '2' ])
    })
  })

  describe('blank-degrade', () => {
    it('an event with no queue is excluded by a queue filter but still searchable by text', () => {
      expect(applyFilter(SAMPLE, { queue: 'imports' }).every((e) => e.queue === 'imports')).toBe(true)
      expect(applyFilter(SAMPLE, { text: 'queued' }).map((e) => e.jobId)).toEqual([ '4' ])
    })
  })

  it('matchesFilter is consistent with applyFilter', () => {
    const spec = { queue: 'emails' }
    expect(SAMPLE.filter((e) => matchesFilter(e, spec))).toEqual(applyFilter(SAMPLE, spec))
  })
})
