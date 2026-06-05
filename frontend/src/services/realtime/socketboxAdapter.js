// socketbox transport adapter (ADR-0006) — native WebSocket to a socketbox server. Same
// interface as the Pusher adapter so views are transport-agnostic. The server-side channel
// multiplexing convention (e.g. a subscribe frame) is encoded here.
export function createSocketboxAdapter(broadcast) {
  let ws = null

  return {
    subscribe(channel, events, onMessage) {
      ws = new WebSocket(broadcast.socketboxUrl)
      ws.onopen = () => ws.send(JSON.stringify({ action: 'subscribe', channel, events }))
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data)
          // TODO: confirm socketbox envelope shape (channel/event/message) once the server lands.
          if (!payload.channel || payload.channel === channel) onMessage(payload.message ?? payload)
        } catch (_) {
          onMessage(ev.data)
        }
      }
    },
    unsubscribe() {
      if (ws) ws.close()
      ws = null
    }
  }
}
