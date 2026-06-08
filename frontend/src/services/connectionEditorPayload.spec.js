import { describe, it, expect } from 'vitest'
import { buildConnectionPayload, buildBroadcastPayload, toBroadcastId } from './connectionEditorPayload.js'

// Slice #8 — the editor must build the right save payload, including the realtime wiring
// (broadcastConnectionId + channel + events) and inline Broadcast Connection create.

const baseForm = (over = {}) => ({
  name: 'FTDIQueue',
  environment: 'development',
  grammar: '',
  tableName: 'cbq_jobs',
  datasourceClass: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
  connectionString: 'jdbc:sqlserver://localhost;databaseName=ftdiQueue',
  secrets: { username: '', password: '' },
  broadcastConnectionId: 0,
  channel: '',
  events: '',
  ...over
})

describe('buildConnectionPayload', () => {
  it('includes the broadcast link, channel, and events when a Broadcast Connection is selected', () => {
    const payload = buildConnectionPayload(baseForm({
      broadcastConnectionId: 7,
      channel: 'development',
      events: 'cbqWorker,cbqWorkerError'
    }))
    expect(payload.broadcastConnectionId).toBe(7)
    expect(payload.channel).toBe('development')
    expect(payload.events).toBe('cbqWorker,cbqWorkerError')
  })

  it('coerces a string-id link to a number and trims the channel', () => {
    const payload = buildConnectionPayload(baseForm({
      broadcastConnectionId: '7',
      channel: '  development  ',
      events: 'cbqWorker'
    }))
    expect(payload.broadcastConnectionId).toBe(7)
    expect(payload.channel).toBe('development')
  })

  it('keeps "no realtime" valid — emits a zeroed link and clears channel/events', () => {
    const payload = buildConnectionPayload(baseForm({
      broadcastConnectionId: 0,
      // stale values that should be cleared because there is no realtime
      channel: 'leftover',
      events: 'cbqWorker'
    }))
    expect(payload.broadcastConnectionId).toBe(0)
    expect(payload.channel).toBe('')
    expect(payload.events).toBe('')
  })

  it('omits secrets when neither username nor password is provided (edit keeps stored password)', () => {
    const payload = buildConnectionPayload(baseForm(), true)
    expect(payload).not.toHaveProperty('secrets')
  })

  it('includes secrets when provided', () => {
    const payload = buildConnectionPayload(baseForm({ secrets: { username: 'sa', password: 'pw' } }))
    expect(payload.secrets).toEqual({ username: 'sa', password: 'pw' })
  })

  it('carries the core connection columns', () => {
    const payload = buildConnectionPayload(baseForm())
    expect(payload.name).toBe('FTDIQueue')
    expect(payload.datasourceClass).toBe('com.microsoft.sqlserver.jdbc.SQLServerDriver')
    expect(payload.tableName).toBe('cbq_jobs')
  })
})

describe('buildBroadcastPayload', () => {
  it('builds a pusher payload with public params + the secret struct', () => {
    const payload = buildBroadcastPayload({
      name: '  Dev Pusher ', transport: 'pusher', pusherKey: 'pk', pusherCluster: 'us2',
      pusherAppId: 'app', pusherSecret: 'shh'
    })
    expect(payload).toMatchObject({
      name: 'Dev Pusher', transport: 'pusher', pusherKey: 'pk', pusherCluster: 'us2',
      secrets: { pusherAppId: 'app', pusherSecret: 'shh' }
    })
  })

  it('omits the secret struct for a public-only pusher edit', () => {
    const payload = buildBroadcastPayload({ name: 'Dev', transport: 'pusher', pusherKey: 'pk', pusherCluster: 'us2' })
    expect(payload).not.toHaveProperty('secrets')
    expect(payload.pusherKey).toBe('pk')
  })

  it('builds a socketbox payload with its url + auth secret', () => {
    const payload = buildBroadcastPayload({ name: 'Box', transport: 'socketbox', socketboxUrl: 'wss://x', socketboxAuth: 'tok' })
    expect(payload).toMatchObject({ transport: 'socketbox', socketboxUrl: 'wss://x', secrets: { socketboxAuth: 'tok' } })
    expect(payload).not.toHaveProperty('pusherKey')
  })
})

describe('toBroadcastId', () => {
  it('returns 0 for empty/non-numeric/zero/negative', () => {
    expect(toBroadcastId('')).toBe(0)
    expect(toBroadcastId(null)).toBe(0)
    expect(toBroadcastId('abc')).toBe(0)
    expect(toBroadcastId(0)).toBe(0)
    expect(toBroadcastId(-1)).toBe(0)
  })
  it('parses positive ids from string or number', () => {
    expect(toBroadcastId('7')).toBe(7)
    expect(toBroadcastId(7)).toBe(7)
  })
})
