<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>cbqManager</q-toolbar-title>
        <q-select
          v-model="pickerValue"
          :options="connectionOptions"
          dense outlined emit-value map-options dark
          label="Open a Connection"
          style="min-width: 220px"
          data-test="connection-picker"
          @update:model-value="onPick"
        />
        <q-btn flat dense icon="logout" class="q-ml-sm" @click="onLogout" />
      </q-toolbar>

      <!-- Top zone: Connection context tabs — the primary context switcher (PRD-0002). -->
      <ConnectionTabs />
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered>
      <q-list>
        <q-item-label header>Console</q-item-label>
        <q-item clickable :to="{ name: 'connections' }" exact>
          <q-item-section avatar><q-icon name="dns" /></q-item-section>
          <q-item-section>Connections</q-item-section>
        </q-item>

        <q-separator class="q-my-sm" />
        <q-item-label header>Active Connection</q-item-label>
        <q-item v-for="t in tools" :key="t.name" clickable :disable="!activeId"
                :data-test="`tool-${t.name}`"
                :to="activeId ? { name: t.name, params: { connectionId: activeId } } : undefined">
          <q-item-section avatar><q-icon :name="t.icon" /></q-item-section>
          <q-item-section>{{ t.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Persistent Live Monitor dock — mounted OUTSIDE <router-view> so the feed survives
         navigation and swaps atomically with the active context (PRD-0002). -->
    <q-footer>
      <MonitorDock />
    </q-footer>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api, setToken } from '@/services/api'
import { useRealtimeStore } from '@/stores/realtime'
import { useConnectionContextStore } from '@/stores/connectionContext'
import MonitorDock from '@/components/MonitorDock.vue'
import ConnectionTabs from '@/components/ConnectionTabs.vue'

const router = useRouter()
const route = useRoute()
const realtime = useRealtimeStore()
const ctx = useConnectionContextStore()

const drawer = ref(true)
const pickerValue = ref(null)
const connectionOptions = ref([])
const connById = ref({})

const activeId = computed(() => ctx.activeId)

const tools = [
  { name: 'health', label: 'Queue Health', icon: 'monitor_heart' },
  { name: 'jobs', label: 'Jobs', icon: 'list_alt' },
  { name: 'failed', label: 'Failed Jobs', icon: 'error_outline' },
  { name: 'batches', label: 'Batches', icon: 'layers' }
]

// Picker → open (or focus) a Connection tab; clear the picker so it reads as an action, not a value.
function onPick(id) {
  if (id == null) return
  const conn = connById.value[String(id)] || { id }
  ctx.openTab(conn)
  pickerValue.value = null
}

// The routed Connection drives which tab is open/active and what tool it remembers (covers deep
// links and drawer-tool navigation). Opening sets it active; the activeId watcher handles the rest.
watch(() => [ route.params.connectionId, route.name ], ([ cid, name ]) => {
  if (cid == null || cid === '') return
  const id = String(cid)
  if (!ctx.isOpen(id)) ctx.openTab(connById.value[id] || { id })
  else ctx.activateTab(id)
  if (name) ctx.rememberTool(id, name) // also fires on tool-to-tool nav within the same Connection
}, { immediate: true })

// Active context changes → swap the dock's stream and navigate to the tab's remembered tool, but
// only when we're not already on that context's route (so deep links don't bounce).
watch(activeId, (id) => {
  realtime.setActive(id ?? null)
  if (id == null) return
  const tab = ctx.activeTab
  if (tab && String(route.params.connectionId) !== String(id)) {
    router.push({ name: tab.lastTool, params: { connectionId: id } })
  }
})

// Keep every open tab subscribed so backgrounded contexts keep streaming (and badging).
watch(() => ctx.tabs.map((t) => t.connectionId).join(','), () => {
  ctx.tabs.forEach((t) => realtime.subscribe(t.connectionId))
})

async function loadConnections() {
  const res = await api.listConnections().catch(() => ({ data: [] }))
  const list = res.data || []
  connById.value = Object.fromEntries(list.map((c) => [ String(c.id), c ]))
  connectionOptions.value = list.map((c) => ({ label: `${c.name} (${c.environment || '—'})`, value: c.id }))
  // Backfill names for any tab opened before the list loaded (e.g. a deep link).
  ctx.tabs.forEach((t) => {
    const c = connById.value[t.connectionId]
    if (c) t.name = c.name
  })
}

function onLogout() {
  api.logout().finally(() => { setToken(''); router.push({ name: 'login' }) })
}

onMounted(loadConnections)

// Dev/e2e seam: lets Playwright inject synthetic Worker activity deterministically.
if (import.meta.env.DEV) {
  window.__cbqmRealtime = realtime
  window.__cbqmContext = ctx
}
</script>
