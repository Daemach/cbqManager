<template>
  <q-page class="q-pa-md">
    <div class="text-h6 q-mb-md">Batches</div>

    <ConnectionUnreachableBanner v-if="unreachable" :loading="loading" @retry="load" />
    <!--
      TODO: progress bars (pending/failed/total), cancel / retry-failed / delete actions, and
      drill-down to live jobs via $.batchId (PRD batches).
    -->
    <q-table
      v-if="!unreachable"
      v-model:pagination="pagination"
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :rows-per-page-options="[0]"
      virtual-scroll
      :virtual-scroll-sticky-size-start="0"
      class="data-table"
      dense flat bordered
      data-test="batches-table"
    >
      <template #body-cell-createdDate="props">
        <q-td :props="props" class="text-no-wrap" data-test="batch-created">
          <TimeCell :value="props.row.createdDate" />
        </q-td>
      </template>
      <template #body-cell-completedDate="props">
        <q-td :props="props" class="text-no-wrap" data-test="batch-completed">
          <TimeCell :value="props.row.completedDate" />
        </q-td>
      </template>
      <template #body-cell-elapsed="props">
        <q-td :props="props" class="text-no-wrap" data-test="batch-elapsed">
          <span v-if="batchElapsed(props.row)">{{ batchElapsed(props.row) }}</span>
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>
      <template #body-cell-payload="props">
        <q-td :props="props">
          <q-btn dense flat round size="sm" icon="data_object" :data-test="`payload-${props.row.id}`" @click="showPayload(props.row)">
            <q-tooltip>View options</q-tooltip>
          </q-btn>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" color="negative" label="Cancel" @click="cancel(props.row.id)" />
          <q-btn dense size="sm" label="Retry failed" @click="retryFailed(props.row.id)" />
        </q-td>
      </template>
    </q-table>

    <PayloadDialog v-model="payloadOpen" :raw="payloadRaw" :title="payloadTitle" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'
import { toDate, formatDurationSeconds } from '@/services/timeFormat.js'
import PayloadDialog from '@/components/PayloadDialog.vue'
import TimeCell from '@/components/TimeCell.vue'
import ConnectionUnreachableBanner from '@/components/ConnectionUnreachableBanner.vue'
import { isConnectionUnreachable } from '@/services/connectionUnreachable.js'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
const unreachable = ref(false)

// Payload dialog (issue #23 part B): /batches ships its config blob under `options`.
const payloadOpen = ref(false)
const payloadRaw = ref('')
const payloadTitle = ref('Batch options')
function showPayload(row) {
  payloadRaw.value = row.options || ''
  payloadTitle.value = `Batch ${row.name || row.id} options`
  payloadOpen.value = true
}

// Batches ship raw-epoch created/completed but no `elapsed`; derive it when both ends are present.
function batchElapsed(row) {
  const start = toDate(row.createdDate)
  const end = toDate(row.completedDate)
  if (!start || !end) return ''
  return formatDurationSeconds((end.getTime() - start.getTime()) / 1000)
}
// Recent-first house style (PRD-0002): default sort createdDate DESC so the newest Batch is the first
// visible row — agreeing with BatchRepository.list's ORDER BY createdDate DESC. Batches load as one
// client-side set (small admin list), so q-table's sort controls re-order all rows here.
const pagination = ref({ page: 1, rowsPerPage: 0, sortBy: 'createdDate', descending: true })
const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  { name: 'createdDate', label: 'Created', field: 'createdDate', align: 'left', sortable: true },
  { name: 'completedDate', label: 'Completed', field: 'completedDate', align: 'left', sortable: true },
  { name: 'elapsed', label: 'Elapsed', field: 'completedDate', align: 'left' },
  { name: 'totalJobs', label: 'Total', field: 'totalJobs', align: 'right', sortable: true },
  { name: 'pendingJobs', label: 'Pending', field: 'pendingJobs', align: 'right', sortable: true },
  { name: 'failedJobs', label: 'Failed', field: 'failedJobs', align: 'right', sortable: true },
  { name: 'payload', label: 'Options', field: 'options', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function load() {
  loading.value = true
  try {
    const res = await api.listBatches(props.connectionId, { page: 1, maxRows: 50 })
    rows.value = res.data || []
    unreachable.value = false
  } catch (e) {
    rows.value = [] // 401/403 handled globally (App.vue); avoid an uncaught rejection
    // Pre-VPN: target DB unreachable (503) → calm retryable banner, not an error toast.
    if (isConnectionUnreachable(e)) unreachable.value = true
    else if (e.status !== 401 && e.status !== 403) $q.notify({ type: 'negative', message: e.message || 'Failed to load batches' })
  } finally {
    loading.value = false
  }
}
function cancel(id) {
  $q.dialog({ title: 'Cancel batch', message: `Cancel batch ${id} and remove its pending jobs?`, cancel: true })
    .onOk(async () => { await api.cancelBatch(props.connectionId, id); $q.notify({ type: 'positive', message: 'Cancelled' }); load() })
}
function retryFailed(id) {
  $q.dialog({ title: 'Retry failed', message: `Retry failed jobs in batch ${id}?`, cancel: true })
    .onOk(async () => { const r = await api.retryBatchFailed(props.connectionId, id); $q.notify({ type: 'positive', message: `Re-queued ${r.data?.requeued ?? 0}` }) })
}
onMounted(load)
</script>

<style scoped>
.data-table {
  max-height: calc(100vh - 220px);
}
</style>
