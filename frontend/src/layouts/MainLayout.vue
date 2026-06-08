<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>cbqManager</q-toolbar-title>

        <!-- Rich Connection picker — the inline Connection manager (Console layout v2). Lists every
             Connection with environment + live badge and offers per-row open / edit / delete plus an
             Add Connection entry. Replaces the old q-select AND the standalone Connections page. -->
        <q-btn
          outline dense color="white" icon="dns" label="Connections" no-caps
          data-test="connection-picker"
        >
          <q-menu v-model="pickerOpen" data-test="connection-menu" anchor="bottom right" self="top right">
            <q-list style="min-width: 300px" dark>
              <q-item clickable v-close-popup data-test="add-connection" @click="onAdd">
                <q-item-section avatar><q-icon name="add" color="primary" /></q-item-section>
                <q-item-section>Add Connection</q-item-section>
              </q-item>
              <q-separator dark />

              <template v-if="connections.length">
                <q-item
                  v-for="c in connections"
                  :key="c.id"
                  clickable
                  :data-test="`conn-row-${c.id}`"
                  @click="onOpen(c)"
                >
                  <q-item-section avatar><q-icon name="dns" /></q-item-section>
                  <q-item-section>
                    <q-item-label>{{ c.name }}</q-item-label>
                    <q-item-label caption class="text-grey-5">{{ c.environment || '—' }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row items-center no-wrap q-gutter-xs">
                      <q-badge
                        v-if="badge(c.id).total > 0"
                        :color="badge(c.id).error > 0 ? 'negative' : 'grey-7'"
                        :data-test="`conn-badge-${c.id}`"
                      >{{ badge(c.id).error > 0 ? badge(c.id).error : badge(c.id).total }}</q-badge>
                      <q-btn dense flat round size="sm" icon="open_in_new" :data-test="`open-${c.id}`" @click.stop="onOpen(c)">
                        <q-tooltip>Open</q-tooltip>
                      </q-btn>
                      <q-btn dense flat round size="sm" icon="edit" :data-test="`edit-${c.name}`" @click.stop="onEdit(c)">
                        <q-tooltip>Edit</q-tooltip>
                      </q-btn>
                      <q-btn dense flat round size="sm" color="negative" icon="delete_outline" :data-test="`delete-${c.name}`" @click.stop="onDelete(c)">
                        <q-tooltip>Delete</q-tooltip>
                      </q-btn>
                    </div>
                  </q-item-section>
                </q-item>
              </template>
              <q-item v-else>
                <q-item-section class="text-grey-5">No connections yet — add one.</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>

        <q-btn flat dense icon="logout" class="q-ml-sm" @click="onLogout" />
      </q-toolbar>

      <!-- Top zone: Connection context tabs — the primary context switcher (PRD-0002). -->
      <ConnectionTabs />
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered>
      <q-list>
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

    <!-- Shared Connection editor dialog, driven by the picker (open via ref). -->
    <ConnectionEditor ref="editor" v-model="editorOpen" @saved="onSaved" />
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { api, setToken } from '@/services/api'
import { useRealtimeStore } from '@/stores/realtime'
import { useConnectionContextStore } from '@/stores/connectionContext'
import MonitorDock from '@/components/MonitorDock.vue'
import ConnectionTabs from '@/components/ConnectionTabs.vue'
import ConnectionEditor from '@/components/ConnectionEditor.vue'

const router = useRouter()
const route = useRoute()
const $q = useQuasar()
const realtime = useRealtimeStore()
const ctx = useConnectionContextStore()

const drawer = ref(true)
const pickerOpen = ref(false)
const connections = ref([])
const connById = ref({})
const editor = ref(null)
const editorOpen = ref(false)

// Restore the previously open tabs from the cookie SYNCHRONOUSLY, before the route watcher below
// runs — so a deep link only ACTIVATES its tab rather than suppressing the rest of the saved set
// (Console layout v2, issue #18). If nothing was saved, onMounted falls back to auto-open-first.
ctx.rehydrate()

const activeId = computed(() => ctx.activeId)
const badge = (cid) => realtime.badgeFor(cid)

const tools = [
  { name: 'health', label: 'Queue Health', icon: 'monitor_heart' },
  { name: 'jobs', label: 'Jobs', icon: 'list_alt' },
  { name: 'failed', label: 'Failed Jobs', icon: 'error_outline' },
  { name: 'batches', label: 'Batches', icon: 'layers' }
]

// Picker actions ----------------------------------------------------------
// Close the menu before opening a dialog/confirm: a $q.dialog launched from inside an open q-menu
// can be dismissed immediately by the menu's outside-click handling, so we close first.
function onOpen(conn) {
  pickerOpen.value = false
  ctx.openTab(conn)
}
function onAdd() {
  pickerOpen.value = false
  editor.value?.openCreate()
}
function onEdit(conn) {
  pickerOpen.value = false
  editor.value?.openEdit(conn)
}
function onDelete(conn) {
  pickerOpen.value = false
  $q.dialog({
    title: 'Delete Connection',
    message: `Delete "${conn.name}"? This removes it from the registry (the target DB is untouched).`,
    cancel: true,
    ok: { label: 'Delete', color: 'negative' }
  }).onOk(async () => {
    await api.deleteConnection(conn.id)
    // If it was open as a tab, close it too so the strip doesn't dangle.
    if (ctx.isOpen(conn.id)) ctx.closeTab(conn.id)
    $q.notify({ type: 'positive', message: 'Connection deleted' })
    await loadConnections()
  })
}
async function onSaved() {
  await loadConnections()
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

// Lazy per-tab subscribe: subscribe each open tab's Broadcast Connection so backgrounded contexts
// keep streaming (and badging); a Connection that is never opened as a tab never subscribes.
watch(() => ctx.tabs.map((t) => t.connectionId).join(','), () => {
  ctx.tabs.forEach((t) => realtime.subscribe(t.connectionId))
}, { immediate: true })

async function loadConnections() {
  const res = await api.listConnections().catch(() => ({ data: [] }))
  const list = res.data || []
  connections.value = list
  connById.value = Object.fromEntries(list.map((c) => [ String(c.id), c ]))
  // Backfill names/environments for any tab restored from the cookie or opened via a deep link
  // before the list loaded.
  ctx.tabs.forEach((t) => {
    const c = connById.value[t.connectionId]
    if (c) { t.name = c.name; t.environment = c.environment || '' }
  })
  return list
}

function onLogout() {
  api.logout().finally(() => { setToken(''); router.push({ name: 'login' }) })
}

onMounted(async () => {
  const list = await loadConnections()
  // Open straight into work: tabs were already restored from the cookie synchronously above; if none
  // were saved (and no deep link opened one), auto-open the first Connection now (Console layout v2).
  if (ctx.bootFrom(list)) {
    // Backfill names/environments for restored/auto-opened tabs now that the list has loaded.
    ctx.tabs.forEach((t) => {
      const c = connById.value[t.connectionId]
      if (c) { t.name = c.name; t.environment = c.environment || '' }
    })
    const id = ctx.activeId
    if (id != null) {
      // The activeId watcher does not fire for the value set during setup, so drive the dock stream
      // and navigate to the active tab's remembered tool explicitly when we're not already there.
      realtime.setActive(id)
      if (String(route.params.connectionId) !== String(id)) {
        const tab = ctx.activeTab
        router.replace({ name: tab?.lastTool || 'health', params: { connectionId: id } })
      }
    }
  }
})

// Dev/e2e seam: lets Playwright inject synthetic Worker activity deterministically.
if (import.meta.env.DEV) {
  window.__cbqmRealtime = realtime
  window.__cbqmContext = ctx
}
</script>
