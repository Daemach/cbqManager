<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Live Monitor</div>
      <q-space />
      <q-btn dense :icon="streaming ? 'pause' : 'play_arrow'" :label="streaming ? 'Pause' : 'Resume'" @click="toggle" />
    </div>
    <!--
      Subscribes to the Connection's Broadcast Connection (pusher|socketbox) via the transport-
      agnostic adapter (ADR-0006). The Managed App's Workers are the publishers; this view relays.
      TODO: fetch the Connection's broadcast config + channel/events, then subscribe().
    -->
    <q-list dense bordered separator style="max-height: 70vh; overflow: auto">
      <q-item v-for="(m, i) in messages" :key="i">
        <q-item-section side>{{ m.time }}</q-item-section>
        <q-item-section :class="m.type === 'error' ? 'text-negative' : ''">{{ m.text }}</q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createRealtime } from '@/services/realtime'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const messages = ref([])
const streaming = ref(true)
let rt = null

function onMessage(msg) {
  if (!streaming.value) return
  messages.value.unshift({ time: new Date().toLocaleTimeString(), type: msg?.type || 'info', text: msg?.message || JSON.stringify(msg) })
  if (messages.value.length > 500) messages.value.length = 500
}
function toggle() { streaming.value = !streaming.value }

onMounted(() => {
  // TODO: load this Connection's broadcast config from the API, then:
  // rt = createRealtime(broadcast); rt.subscribe(channel, events, onMessage)
  rt = createRealtime({})
})
onBeforeUnmount(() => rt && rt.unsubscribe())
</script>
