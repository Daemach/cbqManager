// Pusher transport adapter (ADR-0006). Browser subscribes with the PUBLIC key only; the secret
// stays server-side. The Managed App's Workers are the publishers — cbqManager is a subscriber.
import Pusher from 'pusher-js'

export function createPusherAdapter(broadcast) {
  let pusher = null
  let channelName = null

  return {
    subscribe(channel, events, onMessage) {
      pusher = new Pusher(broadcast.pusherKey, { cluster: broadcast.pusherCluster })
      channelName = channel
      const ch = pusher.subscribe(channel)
      ;(events || []).forEach((evt) => ch.bind(evt, (data) => onMessage(data?.message ?? data)))
    },
    unsubscribe() {
      if (pusher && channelName) pusher.unsubscribe(channelName)
      if (pusher) pusher.disconnect()
      pusher = null
      channelName = null
    }
  }
}
