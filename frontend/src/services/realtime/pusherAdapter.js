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
      // Pass the RAW bound payload through; EventNormalizer owns all field extraction (legacy
      // `{type,instance,message}` and the extended contract), so nothing is lost here.
      ;(events || []).forEach((evt) => ch.bind(evt, (data) => onMessage(data)))
    },
    unsubscribe() {
      if (pusher && channelName) pusher.unsubscribe(channelName)
      if (pusher) pusher.disconnect()
      pusher = null
      channelName = null
    }
  }
}
