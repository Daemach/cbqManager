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

      <q-space />

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
        <div class="col"><q-input v-model="filter.queue" dense outlined dark clearable label="Queue" data-test="dock-filter-queue" /></div>
        <div class="col"><q-input v-model="filter.state" dense outlined dark clearable label="State" data-test="dock-filter-state" /></div>
        <div class="col"><q-input v-model="filter.mapping" dense outlined dark clearable label="Mapping" data-test="dock-filter-mapping" /></div>
        <div class="col"><q-input v-model="filter.instance" dense outlined dark clearable label="Instance" data-test="dock-filter-instance" /></div>
        <div class="col-3"><q-input v-model="filter.text" dense outlined dark clearable label="Search" debounce="150" data-test="dock-filter-text" /></div>
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
                <q-badge v-if="e.instance" :style="{ background: colorForInstance(e.instance) }">{{ e.instance }}</q-badge>
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
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRealtimeStore } from '@/stores/realtime'

const store = useRealtimeStore()

const collapsed = ref(false)
const height = ref(260)

const filtered = computed(() => store.activeFiltered)
const streaming = computed(() => store.activeStreaming)
const heldCount = computed(() => store.activeHeldCount)
const status = computed(() => store.activeStatus)

// Per-context filter, mirrored locally for v-model and written back to the active context's store
// slot so each Connection keeps its own filter across context switches.
const filter = reactive({ queue: '', state: '', mapping: '', instance: '', text: '' })

watch(() => store.activeId, () => {
  const f = store.activeFilter || {}
  filter.queue = f.queue || ''
  filter.state = f.state || ''
  filter.mapping = f.mapping || ''
  filter.instance = f.instance || ''
  filter.text = f.text || ''
}, { immediate: true })

watch(filter, (val) => {
  if (store.activeId != null) store.setFilter(store.activeId, { ...val })
}, { deep: true })

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
</style>
