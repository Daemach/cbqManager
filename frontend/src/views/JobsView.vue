<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Jobs</div>
      <q-space />
      <q-input v-model="queue" dense outlined label="Queue" clearable style="width: 180px" @update:model-value="reload" />
    </div>

    <ConnectionUnreachableBanner v-if="unreachable" :loading="loading" @retry="reload" />

    <!--
      TODO: server-side paginated q-table over /jobs (state-aware row actions per Q10):
      complete / reset / quarantine / delete, with reservation-age warnings on reserved rows,
      plus a "Next Up" highlight. State column comes from JobStateClassifier.
    -->
    <q-table
      v-if="!unreachable"
      v-model:pagination="pagination"
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loading"
      virtual-scroll
      :virtual-scroll-sticky-size-start="0"
      class="data-table"
      dense flat bordered
      data-test="jobs-table"
      @request="onRequest"
    >
      <template #body-cell-queue="props">
        <q-td :props="props">
          <a v-if="props.value" class="queue-drill" :data-test="`watch-${props.value}`" @click="watchQueue(props.value)">{{ props.value }}</a>
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>
      <template #body-cell-created="props">
        <q-td :props="props" class="text-no-wrap" data-test="job-created">
          <TimeCell :value="props.row.hrCreatedDate" />
        </q-td>
      </template>
      <template #body-cell-reserved="props">
        <q-td :props="props" class="text-no-wrap" data-test="job-reserved">
          <TimeCell :value="props.row.hrReservedDate" />
        </q-td>
      </template>
      <template #body-cell-done="props">
        <q-td :props="props" class="text-no-wrap" data-test="job-done">
          <TimeCell :value="props.row.hrFailedDate || props.row.hrCompletedDate" />
        </q-td>
      </template>
      <template #body-cell-elapsed="props">
        <q-td :props="props" class="text-no-wrap" data-test="job-elapsed">
          <span v-if="fmtElapsed(props.row)">{{ fmtElapsed(props.row) }}</span>
          <span v-else class="text-grey-6">—</span>
        </q-td>
      </template>
      <template #body-cell-payload="props">
        <q-td :props="props">
          <q-btn dense flat round size="sm" icon="data_object" :data-test="`payload-${props.row.id}`" @click="showPayload(props.row)">
            <q-tooltip v-if="tooltipPayload(props.row.payload)" :data-test="`payload-tip-${props.row.id}`">
              <pre class="payload-tip">{{ tooltipPayload(props.row.payload) }}</pre>
            </q-tooltip>
            <q-tooltip v-else>View payload</q-tooltip>
          </q-btn>
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" icon="check" @click="act('jobComplete', props.row.id)" />
          <q-btn dense size="sm" icon="restart_alt" @click="act('jobReset', props.row.id)" />
          <q-btn dense size="sm" icon="block" @click="act('jobQuarantine', props.row.id)" />
          <q-btn dense size="sm" icon="delete_outline" @click="act('jobDelete', props.row.id)" />
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
import { elapsed as fmtElapsedValue } from '@/services/timeFormat.js'
import { payloadField, tooltipPayload } from '@/services/payloadView.js'
import PayloadDialog from '@/components/PayloadDialog.vue'
import TimeCell from '@/components/TimeCell.vue'
import ConnectionUnreachableBanner from '@/components/ConnectionUnreachableBanner.vue'
import { isConnectionUnreachable } from '@/services/connectionUnreachable.js'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const realtime = useRealtimeStore()
const unreachable = ref(false)

// Payload dialog (issue #23 part B): /jobs ships the payload as a JSON string under `payload`.
const payloadOpen = ref(false)
const payloadRaw = ref('')
const payloadTitle = ref('Payload')
function showPayload(row) {
  payloadRaw.value = row.payload || ''
  payloadTitle.value = `Job ${row.id} payload`
  payloadOpen.value = true
}

// elapsed/totalTime (issue #23 part C): prefer the live elapsed, fall back to totalTime.
function fmtElapsed(row) {
  return fmtElapsedValue(row.elapsed) || fmtElapsedValue(row.totalTime)
}

// Clicking a queue cell drills the Live Monitor dock down to that queue for this context (PRD-0002 #18).
function watchQueue(q) {
  realtime.mergeFilter(props.connectionId, { queue: q })
  $q.notify({ type: 'info', message: `Live Monitor filtered to queue "${q}"`, timeout: 1500 })
}
const rows = ref([])
const loading = ref(false)
const queue = ref('')
// Recent-first house style (PRD-0002 'Tables, sorting & pagination'): cbq_jobs.id is auto-increment,
// so descending id == newest Jobs first. This MUST agree with JobRepository.list's ORDER BY id DESC
// so the first server page is genuinely the most recent rows the operator lands on. A larger window
// (100) feeds the virtual-scroll surface so recent rows aren't buried behind page 2.
const pagination = ref({ page: 1, rowsPerPage: 100, rowsNumber: 0, sortBy: 'id', descending: true })

const columns = [
  { name: 'id', label: 'ID', field: 'id', align: 'left', sortable: true },
  { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
  // Mapping (the Job type) + Batch live INSIDE the payload JSON, not as top-level columns — surface them.
  { name: 'mapping', label: 'Mapping', field: (r) => payloadField(r.payload, 'mapping'), align: 'left', format: (v) => v || '—' },
  { name: 'batch', label: 'Batch', field: (r) => payloadField(r.payload, 'batchId'), align: 'left', format: (v) => v || '—' },
  { name: 'state', label: 'State', field: 'state', align: 'left' },
  { name: 'attempts', label: 'Attempts', field: 'attempts', align: 'right' },
  { name: 'created', label: 'Created', field: 'hrCreatedDate', align: 'left' },
  { name: 'reserved', label: 'Reserved', field: 'hrReservedDate', align: 'left' },
  { name: 'done', label: 'Completed/Failed', field: 'hrCompletedDate', align: 'left' },
  { name: 'elapsed', label: 'Elapsed', field: 'elapsed', align: 'left' },
  { name: 'payload', label: 'Payload', field: 'payload', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function onRequest(p) {
  loading.value = true
  try {
    const pg = p?.pagination || pagination.value
    const res = await api.listJobs(props.connectionId, { page: pg.page, maxRows: pg.rowsPerPage, queue: queue.value || '' })
    rows.value = res.data || []
    pagination.value = { ...pg, rowsNumber: res.pagination?.totalRecords || 0 }
    unreachable.value = false
  } catch (e) {
    rows.value = [] // 401/403 handled globally (App.vue); avoid an uncaught rejection
    // Pre-VPN: target DB unreachable (503) → calm retryable banner, not an error toast.
    if (isConnectionUnreachable(e)) unreachable.value = true
    else if (e.status !== 401 && e.status !== 403) $q.notify({ type: 'negative', message: e.message || 'Failed to load jobs' })
  } finally {
    loading.value = false
  }
}
function reload() { onRequest({ pagination: { ...pagination.value, page: 1 } }) }
function act(method, id) {
  $q.dialog({ title: 'Confirm', message: `${method} job ${id}?`, cancel: true }).onOk(async () => {
    const res = await api[method](props.connectionId, id)
    $q.notify({ type: res.data?.affected ? 'positive' : 'warning', message: res.messages?.join(', ') || 'Done' })
    reload()
  })
}
onMounted(reload)
</script>

<style scoped>
/* Bound the height so virtual-scroll renders a real scroll surface (recent rows up top, scroll for
   the rest) instead of an ever-growing page that re-hides the newest rows. */
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
/* Short payloads preview inline on hover (monospace, wrapped); longer ones use the dialog. */
.payload-tip {
  margin: 0;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  white-space: pre-wrap;
  max-width: 360px;
}
</style>
