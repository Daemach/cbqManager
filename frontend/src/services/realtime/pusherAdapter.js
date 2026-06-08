// Pusher transport adapter (ADR-0006). Browser subscribes with the PUBLIC key only; the secret
// stays server-side. The Managed App's Workers are the publishers — cbqManager is a subscriber.
import Pusher from 'pusher-js'

// Dev visibility: log Pusher connection lifecycle + every inbound message to the browser console so
// you can confirm the transport is delivering (and see the raw payload before normalization). Gated
// to DEV so production stays quiet; uses info/debug (never error) so it doesn't trip the trace gate.
const DEBUG = import.meta.env.DEV
const log = (...a) => { if (DEBUG) console.info('%c[pusher]', 'color:#7c4dff', ...a) }
const logMsg = (...a) => { if (DEBUG) console.debug('%c[pusher]', 'color:#7c4dff', ...a) }

export function createPusherAdapter(broadcast) {
  let pusher = null
  let channelName = null

  return {
    subscribe(channel, events, onMessage) {
      log('subscribing', { channel, events, cluster: broadcast.pusherCluster })
      pusher = new Pusher(broadcast.pusherKey, { cluster: broadcast.pusherCluster })
      channelName = channel

      if (DEBUG) {
        pusher.connection.bind('state_change', (s) => log('connection', s.previous, '→', s.current))
        pusher.connection.bind('error', (err) => log('connection error', err))
      }

      const ch = pusher.subscribe(channel)
      if (DEBUG) {
        ch.bind('pusher:subscription_succeeded', () => log('subscribed to', channel))
        ch.bind('pusher:subscription_error', (err) => log('subscription error on', channel, err))
      }

      // Pass the RAW bound payload through; EventNormalizer owns all field extraction (legacy
      // `{type,instance,message}` and the extended contract), so nothing is lost here.
      ;(events || []).forEach((evt) =>
        ch.bind(evt, (data) => {
          logMsg(evt, data)
          onMessage(data)
        })
      )
    },
    unsubscribe() {
      if (pusher && channelName) pusher.unsubscribe(channelName)
      if (pusher) pusher.disconnect()
      pusher = null
      channelName = null
    }
  }
}
