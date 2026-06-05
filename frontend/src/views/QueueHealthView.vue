<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Queue Health</div>
      <q-space />
      <q-btn dense icon="refresh" :loading="loading" @click="load" />
    </div>

    <q-banner v-if="hasOrphans" class="bg-negative text-white q-mb-md" rounded>
      <template #avatar><q-icon name="warning" /></template>
      Orphan blockers detected — a pool may be starved. Use <b>Heal</b> on the affected queue.
    </q-banner>

    <q-table
      :rows="rows"
      :columns="columns"
      row-key="queue"
      :loading="loading"
      dense flat bordered
      :pagination="{ rowsPerPage: 0 }"
      hide-bottom
    >
      <template #body-cell-orphanedBlockers="props">
        <q-td :props="props">
          <q-badge v-if="props.value > 0" color="negative">{{ props.value }}</q-badge>
          <span v-else>0</span>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" color="primary" label="Heal" @click="run('heal', props.row.queue)" />
          <q-btn dense size="sm" label="Park" @click="run('park', props.row.queue)" />
          <q-btn dense size="sm" label="Release" @click="run('release', props.row.queue)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const rows = ref([])
const loading = ref(false)

const columns = [
  { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
  { name: 'openTotal', label: 'Open', field: 'openTotal', align: 'right' },
  { name: 'orphanedBlockers', label: 'Orphans', field: 'orphanedBlockers', align: 'right' },
  { name: 'pickableFresh', label: 'Pickable', field: 'pickableFresh', align: 'right' },
  { name: 'pickableReservedTimedout', label: 'Timed-out', field: 'pickableReservedTimedout', align: 'right' },
  { name: 'inFlight', label: 'In-flight', field: 'inFlight', align: 'right' },
  { name: 'scheduledFuture', label: 'Scheduled', field: 'scheduledFuture', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'queue', align: 'right' }
]

const hasOrphans = computed(() => rows.value.some((r) => r.orphanedBlockers > 0))

async function load() {
  loading.value = true
  try {
    const res = await api.queueHealth(props.connectionId)
    rows.value = res.data || []
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    loading.value = false
  }
}

function run(action, queue) {
  const fn = { heal: api.heal, park: api.park, release: (cid, q) => api.release(cid, { queue: q }) }[action]
  $q.dialog({ title: action, message: `${action} queue "${queue}"?`, cancel: true }).onOk(async () => {
    const res = await fn(props.connectionId, queue)
    $q.notify({ type: 'positive', message: `${action}: ${res.data?.affected ?? 0} affected` })
    load()
  })
}

onMounted(load)
watch(() => props.connectionId, load)
</script>
