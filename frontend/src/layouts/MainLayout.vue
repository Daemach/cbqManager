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
  </q-layout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken } from '@/services/api'

const router = useRouter()
const drawer = ref(true)
const connectionId = ref(null)
const connectionOptions = ref([])

const tools = [
  { name: 'health', label: 'Queue Health', icon: 'monitor_heart' },
  { name: 'jobs', label: 'Jobs', icon: 'list_alt' },
  { name: 'failed', label: 'Failed Jobs', icon: 'error_outline' },
  { name: 'batches', label: 'Batches', icon: 'layers' },
  { name: 'monitor', label: 'Live Monitor', icon: 'sensors' }
]

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
</script>
