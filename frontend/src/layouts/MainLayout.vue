<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>cbqManager</q-toolbar-title>
        <q-select
          v-model="connectionId"
          :options="connectionOptions"
          dense outlined emit-value map-options dark
          label="Connection"
          style="min-width: 220px"
          @update:model-value="onConnectionChange"
        />
        <q-btn flat dense icon="logout" class="q-ml-sm" @click="onLogout" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered>
      <q-list>
        <q-item-label header>Console</q-item-label>
        <q-item clickable :to="{ name: 'connections' }" exact>
          <q-item-section avatar><q-icon name="dns" /></q-item-section>
          <q-item-section>Connections</q-item-section>
        </q-item>

        <q-separator class="q-my-sm" />
        <q-item-label header>Selected Connection</q-item-label>
        <q-item v-for="t in tools" :key="t.name" clickable :disable="!connectionId"
                :to="connectionId ? { name: t.name, params: { connectionId } } : undefined">
          <q-item-section avatar><q-icon :name="t.icon" /></q-item-section>
          <q-item-section>{{ t.label }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Persistent Live Monitor dock — mounted OUTSIDE <router-view> so the live feed and its
         history survive navigation between tools (PRD-0002 keystone). -->
    <q-footer>
      <MonitorDock />
    </q-footer>
  </q-layout>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api, setToken } from '@/services/api'
import { useRealtimeStore } from '@/stores/realtime'
import MonitorDock from '@/components/MonitorDock.vue'

const router = useRouter()
const route = useRoute()
const realtime = useRealtimeStore()

const drawer = ref(true)
const connectionId = ref(null)
const connectionOptions = ref([])

const tools = [
  { name: 'health', label: 'Queue Health', icon: 'monitor_heart' },
  { name: 'jobs', label: 'Jobs', icon: 'list_alt' },
  { name: 'failed', label: 'Failed Jobs', icon: 'error_outline' },
  { name: 'batches', label: 'Batches', icon: 'layers' }
]

// The active realtime context follows the routed Connection. The dock (in the footer) reads the
// active context from the store, so switching tools keeps the same stream; switching Connections
// swaps it atomically.
watch(() => route.params.connectionId, (cid) => {
  if (cid != null && cid !== '') {
    connectionId.value = cid
    realtime.setActive(cid)
  } else {
    realtime.setActive(null)
  }
}, { immediate: true })

async function loadConnections() {
  const res = await api.listConnections().catch(() => ({ data: [] }))
  connectionOptions.value = (res.data || []).map((c) => ({ label: `${c.name} (${c.environment || '—'})`, value: c.id }))
}
function onConnectionChange(id) {
  if (id) router.push({ name: 'health', params: { connectionId: id } })
}
function onLogout() {
  api.logout().finally(() => { setToken(''); router.push({ name: 'login' }) })
}

onMounted(loadConnections)

// Dev/e2e seam: lets Playwright inject synthetic Worker activity deterministically without
// depending on live Pusher traffic. Guarded to dev builds only.
if (import.meta.env.DEV) {
  window.__cbqmRealtime = realtime
}
</script>
