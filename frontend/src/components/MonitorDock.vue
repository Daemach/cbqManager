<template>
  <div class="monitor-dock column" :style="{ height: collapsed ? 'auto' : height + 'px' }" data-test="monitor-dock">
    <!-- drag handle (resize) -->
    <div v-if="!collapsed" class="dock-resizer" data-test="dock-resizer" @mousedown.prevent="startResize"></div>

    <!-- header bar -->
    <q-bar class="dock-bar bg-grey-10 text-white">
      <q-icon name="sensors" />
      <div class="text-weight-medium q-ml-xs">Live Monitor</div>

      <q-chip
        dense square
        :color="statusColor"
        text-color="white"
        class="q-ml-sm"
        data-test="monitor-status"
      >{{ statusLabel }}</q-chip>

      <q-chip v-if="!streaming && heldCount > 0" dense square color="orange-9" text-color="white" data-test="monitor-held">
        {{ heldCount }} new while paused
      </q-chip>

      <div class="text-caption text-grey-5 q-ml-sm" data-test="monitor-count">{{ filtered.length }} shown</div>

      <!-- Auto-applied (or manual) Queue filter — visible + clearable in one click (PRD-0002 #19). -->
      <q-chip
        v-if="queueFilter"
        dense removable square
        color="primary" text-color="white"
        class="q-ml-sm"
        icon="filter_alt"
        data-test="monitor-queue-filter"
        @remove="clearQueueFilter"
      >queue: {{ queueFilter }}</q-chip>

      <!-- Instance quick filter (click a Worker badge in the feed) — removable in one click (#19). -->
      <q-chip
        v-if="instanceFilter"
        dense removable square
        color="primary" text-color="white"
        class="q-ml-sm"
        icon="dns"
        data-test="monitor-instance-filter"
        @remove="clearInstanceFilter"
      >instance: {{ instanceFilter }}</q-chip>

      <q-space />

      <!-- Lookback ('current feed + last N minutes', #19): search the retained history window, not
           just the live (capped) feed, to find a just-happened error. Per-context, outlined. -->
      <q-icon name="history" class="q-mr-xs text-grey-5">
        <q-tooltip>Lookback: search the last N minutes of retained activity</q-tooltip>
      </q-icon>
      <q-btn-toggle
        v-model="lookback"
        dense unelevated no-caps
        toggle-color="primary"
        color="grey-9"
        text-color="grey-4"
        class="dock-lookback q-mr-sm"
        :options="lookbackOptions"
        data-test="dock-lookback"
      />

      <q-btn
        dense flat round
        :icon="streaming ? 'pause' : 'play_arrow'"
        :color="streaming ? 'white' : 'positive'"
        data-test="dock-pause"
        @click="toggle"
      >
        <q-tooltip>{{ streaming ? 'Pause' : 'Resume' }}</q-tooltip>
      </q-btn>
      <q-btn dense flat round icon="delete_sweep" data-test="dock-clear" @click="clearFeed">
        <q-tooltip>Clear feed</q-tooltip>
      </q-btn>

      <!-- DEV-ONLY: fire a synthetic Worker event over the real transport so you can prove the Live
           Monitor receives without waiting on a Managed App's Workers (#22). Hidden outside DEV; the
           backend hard-gates to development and publishes server-side (the secret never reaches us). -->
      <q-btn-dropdown
        v-if="isDev && store.activeId != null"
        dense flat no-caps
        split
        icon="bolt"
        color="amber-6"
        class="q-ml-xs"
        :loading="emitting"
        data-test="dock-emit"
        @click="emit('cbqWorker')"
      >
        <template #label><span class="text-caption">emit</span></template>
        <q-list dark dense>
          <q-item v-close-popup clickable data-test="dock-emit-worker" @click="emit('cbqWorker')">
            <q-item-section>cbqWorker (info)</q-item-section>
          </q-item>
          <q-item v-close-popup clickable data-test="dock-emit-error" @click="emit('cbqWorkerError')">
            <q-item-section>cbqWorkerError (error)</q-item-section>
          </q-item>
        </q-list>
        <q-tooltip>Dev: emit a synthetic Worker event over the real transport</q-tooltip>
      </q-btn-dropdown>
      <q-btn
        dense flat round
        :icon="collapsed ? 'expand_less' : 'expand_more'"
        data-test="dock-toggle"
        @click="collapsed = !collapsed"
      >
        <q-tooltip>{{ collapsed ? 'Expand' : 'Collapse' }}</q-tooltip>
      </q-btn>
    </q-bar>

    <template v-if="!collapsed">
      <!-- multi-column filter row -->
      <div class="dock-filters row q-col-gutter-xs q-pa-xs bg-grey-10">
        <div class="col"><q-input v-model="fQueue" dense outlined dark clearable label="Queue" data-test="dock-filter-queue" /></div>
        <div class="col"><q-input v-model="fState" dense outlined dark clearable label="State" data-test="dock-filter-state" /></div>
        <div class="col"><q-input v-model="fMapping" dense outlined dark clearable label="Mapping" data-test="dock-filter-mapping" /></div>
        <div class="col"><q-input v-model="fInstance" dense outlined dark clearable label="Instance" data-test="dock-filter-instance" /></div>
        <div class="col-3"><q-input v-model="fText" dense outlined dark clearable label="Search" debounce="150" data-test="dock-filter-text" /></div>
      </div>

      <!-- event feed -->
      <div class="dock-feed col">
        <q-markup-table dense flat dark wrap-cells class="dock-table">
          <thead>
            <tr>
              <th class="text-left">Time</th>
              <th class="text-left">Queue</th>
              <th class="text-left">State</th>
              <th class="text-left">Instance</th>
              <th class="text-left">Mapping</th>
              <th class="text-left">Job</th>
              <th class="text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filtered.length">
              <td colspan="7" class="text-center text-grey-6 q-pa-md" data-test="monitor-empty">
                {{ emptyMessage }}
              </td>
            </tr>
            <tr
              v-for="(e, i) in filtered"
              :key="i"
              data-test="monitor-row"
              :class="e.type === 'error' ? 'row-error' : ''"
            >
              <td class="text-no-wrap text-grey-5">{{ fmtTime(e.time) }}</td>
              <td class="text-no-wrap">
                <span v-if="e.queue">{{ e.queue }}</span>
                <span v-else class="text-grey-7">—</span>
              </td>
              <td class="text-no-wrap">{{ e.state || '—' }}</td>
              <td class="text-no-wrap">
                <q-badge
                  v-if="e.instance"
                  class="instance-badge cursor-pointer"
                  :style="{ background: colorForInstance(e.instance) }"
                  data-test="monitor-instance-badge"
                  @click="filterByInstance(e.instance)"
                >
                  {{ e.instance }}
                  <q-tooltip>Filter the feed to instance {{ e.instance }}</q-tooltip>
                </q-badge>
                <span v-else class="text-grey-7">—</span>
              </td>
              <td class="text-no-wrap">{{ e.mapping || '—' }}</td>
              <td class="text-no-wrap text-grey-5">{{ e.jobId || '—' }}</td>
              <td :class="e.type === 'error' ? 'text-negative' : ''">
                <div>{{ e.text }}</div>
                <div v-if="e.error" class="text-caption text-negative">{{ e.error }}<span v-if="e.line"> @ {{ e.line }}</span></div>
              </td>
            </tr>
          </tbody>
        </q-markup-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { useRealtimeStore } from '@/stores/realtime'
import { api } from '@/services/api'

const $q = useQuasar()
const store = useRealtimeStore()

// The dev-only emit affordance is hidden outside development; the backend also hard-gates it.
const isDev = import.meta.env.DEV
const emitting = ref(false)

// Fire a synthetic Worker event for the active Connection over the REAL transport (#22). The browser
// only names the event type; the backend resolves the Pusher secret and publishes — Pusher then
// delivers it back to this very dock via pusher-js, proving the subscriber plumbing end-to-end.
async function emit(eventType) {
  if (store.activeId == null || emitting.value) return
  emitting.value = true
  try {
    const res = await api.devEmit(store.activeId, { eventType })
    const data = res?.data ?? res
    if (data?.published) {
      $q.notify({ type: 'positive', message: `Emitted ${data.event} on ${data.channel}`, timeout: 1500 })
    } else {
      $q.notify({ type: 'warning', message: `Emit not published (status ${data?.status ?? '?'})` })
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: `Emit failed: ${e.message}` })
  } finally {
    emitting.value = false
  }
}

const collapsed = ref(false)
const height = ref(260)

const filtered = computed(() => store.activeFiltered)
const streaming = computed(() => store.activeStreaming)
const heldCount = computed(() => store.activeHeldCount)
const status = computed(() => store.activeStatus)

// The active context's per-context filter is the single source of truth (store.activeFilter). Each
// input is a computed proxy that reads it and writes a single merged field back — so a tool
// drill-down (store.mergeFilter(cid,{queue})) and a manual edit stay consistent, and switching tabs
// shows each context's own filter automatically.
function filterField(key) {
  return computed({
    get: () => store.activeFilter?.[key] || '',
    set: (v) => { if (store.activeId != null) store.mergeFilter(store.activeId, { [key]: v || '' }) }
  })
}
const fQueue = filterField('queue')
const fState = filterField('state')
const fMapping = filterField('mapping')
const fInstance = filterField('instance')
const fText = filterField('text')

// The auto-applied (or manual) Queue filter, surfaced as a removable chip and clearable in one click.
const queueFilter = computed(() => store.activeFilter?.queue || '')
function clearQueueFilter() { if (store.activeId != null) store.mergeFilter(store.activeId, { queue: '' }) }

// Instance/server as a first-class quick filter (#19): clicking a Worker badge in the feed applies a
// removable instance chip, mirroring the queue drill-down (#11). One-click clearable.
const instanceFilter = computed(() => store.activeFilter?.instance || '')
function filterByInstance(instance) { if (store.activeId != null) store.mergeFilter(store.activeId, { instance: instance || '' }) }
function clearInstanceFilter() { if (store.activeId != null) store.mergeFilter(store.activeId, { instance: '' }) }

// Lookback ('current feed + last N minutes', #19): 0 = live feed only; >0 searches the retained
// per-context history window. Per-context source of truth in the store (preserved across tab switches).
const lookbackOptions = [
  { label: 'Live', value: 0 },
  { label: '5m', value: 5 },
  { label: '10m', value: 10 },
  { label: '15m', value: 15 }
]
const lookback = computed({
  get: () => store.activeLookback || 0,
  set: (v) => { if (store.activeId != null) store.setLookback(store.activeId, v || 0) }
})

const statusLabel = computed(() => ({
  idle: 'idle', connecting: 'connecting…', live: 'live', disabled: 'no realtime', error: 'error'
}[status.value] || status.value))
const statusColor = computed(() => ({
  live: 'positive', connecting: 'amber-8', error: 'negative', disabled: 'grey-7', idle: 'grey-8'
}[status.value] || 'grey-8'))

const emptyMessage = computed(() => {
  if (store.activeId == null) return 'Select a Connection to watch its live activity.'
  if (status.value === 'disabled') return 'This Connection has no Broadcast Connection configured — realtime is off.'
  if (status.value === 'error') return 'Could not load this Connection’s realtime config.'
  return 'Waiting for Worker activity…'
})

function toggle() { if (store.activeId != null) store.toggleStreaming(store.activeId) }
function clearFeed() { if (store.activeId != null) store.clearFeed(store.activeId) }

function fmtTime(t) {
  const d = t instanceof Date ? t : new Date(t)
  return isNaN(d) ? '' : d.toLocaleTimeString()
}

// Stable per-instance color (story 13) so each Worker's lines are visually distinguishable.
function colorForInstance(instance) {
  let h = 0
  const s = String(instance)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h}, 45%, 32%)`
}

// --- resize --------------------------------------------------------------
let startY = 0
let startH = 0
function startResize(e) {
  startY = e.clientY
  startH = height.value
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}
function onResize(e) {
  const next = startH + (startY - e.clientY)
  height.value = Math.max(120, Math.min(next, Math.round(window.innerHeight * 0.7)))
}
function stopResize() {
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}
onBeforeUnmount(stopResize)
</script>

<style scoped>
.monitor-dock {
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  background: #1d1d1d;
  overflow: hidden;
}
.dock-resizer {
  height: 6px;
  cursor: ns-resize;
  background: rgba(255, 255, 255, 0.06);
}
.dock-resizer:hover {
  background: rgba(255, 255, 255, 0.18);
}
.dock-bar {
  min-height: 36px;
}
.dock-feed {
  overflow: auto;
  min-height: 0;
}
.dock-table thead th {
  position: sticky;
  top: 0;
  background: #262626;
  z-index: 1;
}
.row-error {
  background: rgba(244, 67, 54, 0.08);
}
/* Outlined-style lookback toggle so its edges read in dark mode (house style). */
.dock-lookback {
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
}
.instance-badge:hover {
  filter: brightness(1.25);
}
</style>
