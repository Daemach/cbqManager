<template>
  <q-page class="q-pa-md">
    <div class="text-h6 q-mb-md">Failed Jobs</div>

    <ConnectionUnreachableBanner v-if="unreachable" :loading="loading" @retry="onRequest" />
    <!--
      TODO: port the reference failedJobs.cfm table — enriched columns (mapping, fileName:line,
      exceptionMessage), retry / retry+delete / delete row actions, bulk select. Enrichment is
      app-side (ADR-0001/Q9); retry is Memento insert (ADR-0002).
    -->
    <q-table
      v-if="!unreachable"
      v-model:pagination="pagination"
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="filter"
      virtual-scroll
      :virtual-scroll-sticky-size-start="0"
      class="data-table"
      dense flat bordered
      data-test="failed-table"
      @request="onRequest"
    >
      <template #top-right>
        <q-input v-model="filter" dense outlined debounce="300" placeholder="Filter" clearable />
      </template>
      <template #body-cell-failedDate="props">
        <q-td :props="props" class="text-no-wrap" data-test="failed-when">
          <TimeCell :value="props.row.hrFailedDate || props.row.failedDate" />
        </q-td>
      </template>
      <template #body-cell-queue="props">
        <q-td :props="props">
          <a v-if="props.value" class="queue-drill" :data-test="`watch-${props.value}`" @click="watchQueue(props.value)">{{ props.value }}</a>
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>
      <template #body-cell-payload="props">
        <q-td :props="props">
          <q-btn dense flat round size="sm" icon="data_object" :data-test="`payload-${props.row.id}`" @click="showPayload(props.row)">
            <q-tooltip>View payload</q-tooltip>
          </q-btn>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" icon="update" @click="retry(props.row.id, false)" />
          <q-btn dense size="sm" icon="delete_outline" @click="retry(props.row.id, true)" />
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
import { useRealtimeStore } from '@/stores/realtime'
import PayloadDialog from '@/components/PayloadDialog.vue'
import TimeCell from '@/components/TimeCell.vue'
import ConnectionUnreachableBanner from '@/components/ConnectionUnreachableBanner.vue'
import { isConnectionUnreachable } from '@/services/connectionUnreachable.js'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const realtime = useRealtimeStore()
const unreachable = ref(false)

// Payload dialog (issue #23 part B): /failed-jobs ships the re-queueable payload under `memento`.
const payloadOpen = ref(false)
const payloadRaw = ref('')
const payloadTitle = ref('Payload')
function showPayload(row) {
  payloadRaw.value = row.memento || row.payload || ''
  payloadTitle.value = `Failed job ${row.id} payload`
  payloadOpen.value = true
}

// Clicking a queue cell drills the Live Monitor dock down to that queue for this context (PRD-0002 #18).
function watchQueue(q) {
  realtime.mergeFilter(props.connectionId, { queue: q })
  $q.notify({ type: 'info', message: `Live Monitor filtered to queue "${q}"`, timeout: 1500 })
}
const rows = ref([])
const loading = ref(false)
const filter = ref('')
// Recent-first house style (PRD-0002): default sort failedDate DESC so the newest Failed Job is the
// first visible row on load — agreeing with FailedJobRepository.list's ORDER BY failedDate DESC.
// Failed-job rows are heavy (large mementos + the backend now strips the raw exception blobs), so a
// 50-row window keeps the virtual-scroll surface useful without bulk-loading a huge page.
const pagination = ref({ page: 1, rowsPerPage: 50, rowsNumber: 0, sortBy: 'failedDate', descending: true })

const columns = [
  { name: 'failedDate', label: 'Failed', field: 'failedDate', align: 'left' },
  { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
  { name: 'mapping', label: 'Job', field: 'mapping', align: 'left' },
  { name: 'fileName', label: 'File:Line', field: (r) => `${r.fileName || ''}:${r.lineNumber || ''}`, align: 'left' },
  { name: 'exceptionMessage', label: 'Error', field: 'exceptionMessage', align: 'left' },
  { name: 'payload', label: 'Payload', field: 'memento', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function onRequest(p) {
  loading.value = true
  try {
    const pg = p?.pagination || pagination.value
    const res = await api.listFailed(props.connectionId, { page: pg.page, maxRows: pg.rowsPerPage, filter: filter.value || '' })
    rows.value = res.data || []
    pagination.value = { ...pg, rowsNumber: res.pagination?.totalRecords || 0 }
    unreachable.value = false
  } catch (e) {
    rows.value = [] // 401/403 handled globally (App.vue); avoid an uncaught rejection
    // Pre-VPN: target DB unreachable (503) → calm retryable banner, not an error toast.
    if (isConnectionUnreachable(e)) unreachable.value = true
    else if (e.status !== 401 && e.status !== 403) $q.notify({ type: 'negative', message: e.message || 'Failed to load failed jobs' })
  } finally {
    loading.value = false
  }
}
function retry(id, del) {
  $q.dialog({ title: del ? 'Retry & delete' : 'Retry', message: `Re-queue failed job ${id}?`, cancel: true })
    .onOk(async () => {
      await api.retryFailed(props.connectionId, id, del)
      $q.notify({ type: 'positive', message: 'Re-queued' })
      onRequest()
    })
}
onMounted(onRequest)
</script>

<style scoped>
.data-table {
  max-height: calc(100vh - 220px);
}
.queue-drill {
  color: var(--q-primary);
  cursor: pointer;
  text-decoration: underline dotted;
}
.queue-drill:hover {
  text-decoration: underline;
}
</style>
