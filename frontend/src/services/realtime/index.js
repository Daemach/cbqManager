// Realtime adapter factory (ADR-0006). A Connection references a Broadcast Connection whose
// `transport` selects the adapter. Both adapters expose the same tiny interface so views never
// care which transport is in use:
//
//   const rt = createRealtime(broadcast)
//   rt.subscribe(channel, events, (msg) => ...)
//   rt.unsubscribe()
//
import { createPusherAdapter } from './pusherAdapter'
import { createSocketboxAdapter } from './socketboxAdapter'

export function createRealtime(broadcast) {
  switch ((broadcast?.transport || '').toLowerCase()) {
    case 'pusher':
      return createPusherAdapter(broadcast)
    case 'socketbox':
      return createSocketboxAdapter(broadcast)
    default:
      // Null adapter — no realtime configured; views fall back to polling.
      return {
        subscribe() {},
        unsubscribe() {}
      }
  }
}
