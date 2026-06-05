import { describe, it, expect } from 'vitest'
import { normalizeEvent } from './eventNormalizer'

// Fixed clock so time assertions are deterministic.
const FIXED = new Date('2026-06-05T12:00:00.000Z')
const now = () => FIXED
const norm = (raw) => normalizeEvent(raw, { now })

describe('EventNormalizer', () => {
  describe('legacy { type, instance, message } payloads', () => {
    it('maps message -> text and keeps instance/type, blank-degrading the new fields', () => {
      const e = norm({ type: 'info', instance: 'worker-1', message: 'reserved a job' })
      expect(e).toMatchObject({
        text: 'reserved a job',
        instance: 'worker-1',
        type: 'info',
        queue: '',
        mapping: '',
        jobId: '',
        state: '',
        batchId: '',
        attempts: null
      })
      expect(e.time).toEqual(FIXED)
    })

    it('classifies a legacy error message as type "error"', () => {
      const e = norm({ instance: 'w2', message: 'java.lang.Exception: boom' })
      expect(e.type).toBe('error')
    })
  })

  describe('extended contract payloads', () => {
    it('surfaces every extended field including queue', () => {
      const e = norm({
        queue: 'emails',
        mapping: 'SendWelcomeEmailJob',
        jobId: 4187,
        state: 'reserved',
        attempts: 2,
        batchId: 'b-99',
        instance: 'worker-3',
        type: 'info',
        text: 'picked up'
      })
      expect(e).toMatchObject({
        queue: 'emails',
        mapping: 'SendWelcomeEmailJob',
        jobId: '4187', // coerced to string for stable rendering/search
        state: 'reserved',
        attempts: 2,
        batchId: 'b-99',
        instance: 'worker-3',
        type: 'info',
        text: 'picked up'
      })
    })

    it('blank-degrades queue (and others) when the Worker omits them', () => {
      const e = norm({ instance: 'old-worker', state: 'completed', text: 'done processing' })
      expect(e.queue).toBe('')
      expect(e.mapping).toBe('')
      expect(e.state).toBe('completed')
    })

    it('exposes parsed error/line on an error event', () => {
      const e = norm({
        queue: 'imports',
        type: 'error',
        error: 'NullPointerException',
        line: 'Importer.cfc:42',
        text: 'job failed'
      })
      expect(e.type).toBe('error')
      expect(e.error).toBe('NullPointerException')
      expect(e.line).toBe('Importer.cfc:42')
    })

    it('keeps a structured done/completed event (only BARE sentinels are dropped)', () => {
      const e = norm({ queue: 'emails', jobId: 5, state: 'completed', type: 'done', text: 'done' })
      expect(e).not.toBeNull()
      expect(e.queue).toBe('emails')
      expect(e.type).toBe('done')
    })

    it('infers error type from text when none is given', () => {
      const e = norm({ queue: 'q', text: 'Unhandled exception while running' })
      expect(e.type).toBe('error')
    })
  })

  describe('sentinel / heartbeat suppression', () => {
    it('drops the |=0=| keepalive', () => {
      expect(norm({ instance: 'w', message: '|=0=|' })).toBeNull()
      expect(norm('|=0=|')).toBeNull()
    })
    it('drops a bare "done" heartbeat', () => {
      expect(norm('done')).toBeNull()
      expect(norm({ message: 'done' })).toBeNull()
      expect(norm({ message: 'DONE' })).toBeNull()
    })
    it('drops empty/blank payloads', () => {
      expect(norm('')).toBeNull()
      expect(norm('   ')).toBeNull()
      expect(norm(null)).toBeNull()
      expect(norm(undefined)).toBeNull()
    })
  })

  describe('transport shapes', () => {
    it('unwraps an envelope that nests the event under .message (object)', () => {
      const e = norm({ message: { queue: 'emails', state: 'reserved', text: 'hi' } })
      expect(e.queue).toBe('emails')
      expect(e.state).toBe('reserved')
      expect(e.text).toBe('hi')
    })
    it('accepts a bare string line', () => {
      const e = norm('worker started polling')
      expect(e.text).toBe('worker started polling')
      expect(e.type).toBe('info')
    })
  })

  describe('time + attempts coercion', () => {
    it('uses the injected clock when no time is present', () => {
      expect(norm({ text: 'x' }).time).toEqual(FIXED)
    })
    it('honors an explicit event time', () => {
      const e = norm({ text: 'x', time: '2026-01-01T00:00:00.000Z' })
      expect(e.time).toEqual(new Date('2026-01-01T00:00:00.000Z'))
    })
    it('coerces attempts to a Number, null when absent or blank', () => {
      expect(norm({ text: 'x', attempts: '3' }).attempts).toBe(3)
      expect(norm({ text: 'x' }).attempts).toBeNull()
      expect(norm({ text: 'x', attempts: '' }).attempts).toBeNull()
    })
  })
})
