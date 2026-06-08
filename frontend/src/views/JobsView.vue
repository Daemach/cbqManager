<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Jobs</div>
      <q-space />
      <q-input v-model="queue" dense outlined label="Queue" clearable style="width: 180px" @update:model-value="reload" />
    </div>
    <!--
      TODO: server-side paginated q-table over /jobs (state-aware row actions per Q10):
      complete / reset / quarantine / delete, with reservation-age warnings on reserved rows,
      plus a "Next Up" highlight. State column comes from JobStateClassifier.
    -->
    <q-table
      v-model:pagination="pagination"
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loading"
      dense flat bordered
      @request="onRequest"
    >
      <template #body-cell-queue="props">
        <q-td :props="props">
          <a v-if="props.value" class="queue-drill" :data-test="`watch-${props.value}`" @click="watchQueue(props.value)">{{ props.value }}</a>
          <span v-else class="text-grey-6">—</span>
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
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'
import { useRealtimeStore } from '@/stores/realtime'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const realtime = useRealtimeStore()

// Clicking a queue cell drills the Live Monitor dock down to that queue for this context (PRD-0002 #18).
function watchQueue(q) {
  realtime.mergeFilter(props.connectionId, { queue: q })
  $q.notify({ type: 'info', message: `Live Monitor filtered to queue "${q}"`, timeout: 1500 })
}
const rows = ref([])
const loading = ref(false)
const queue = ref('')
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0 })

const columns = [
  { name: 'id', label: 'ID', field: 'id', align: 'left', sortable: true },
  { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
  { name: 'state', label: 'State', field: 'state', align: 'left' },
  { name: 'attempts', label: 'Attempts', field: 'attempts', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function onRequest(p) {
  loading.value = true
  try {
    const pg = p?.pagination || pagination.value
    const res = await api.listJobs(props.connectionId, { page: pg.page, maxRows: pg.rowsPerPage, queue: queue.value || '' })
    rows.value = res.data || []
    pagination.value = { ...pg, rowsNumber: res.pagination?.totalRecords || 0 }
  } catch (e) {
    rows.value = [] // 401/403 handled globally (App.vue); avoid an uncaught rejection
    if (e.status !== 401 && e.status !== 403) $q.notify({ type: 'negative', message: e.message || 'Failed to load jobs' })
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
.queue-drill {
  color: var(--q-primary);
  cursor: pointer;
  text-decoration: underline dotted;
}
.queue-drill:hover {
  text-decoration: underline;
}
</style>
