<template>
  <q-page class="q-pa-md">
    <div class="text-h6 q-mb-md">Batches</div>
    <!--
      TODO: progress bars (pending/failed/total), cancel / retry-failed / delete actions, and
      drill-down to live jobs via $.batchId (PRD batches).
    -->
    <q-table
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
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" color="negative" label="Cancel" @click="cancel(props.row.id)" />
          <q-btn dense size="sm" label="Retry failed" @click="retryFailed(props.row.id)" />
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'

const props = defineProps({ connectionId: { type: [String, Number], required: true } })
const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
// Recent-first house style (PRD-0002): default sort createdDate DESC so the newest Batch is the first
// visible row — agreeing with BatchRepository.list's ORDER BY createdDate DESC. Batches load as one
// client-side set (small admin list), so q-table's sort controls re-order all rows here.
const pagination = ref({ page: 1, rowsPerPage: 0, sortBy: 'createdDate', descending: true })
const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  { name: 'createdDate', label: 'Created', field: 'createdDate', align: 'left', sortable: true },
  { name: 'totalJobs', label: 'Total', field: 'totalJobs', align: 'right', sortable: true },
  { name: 'pendingJobs', label: 'Pending', field: 'pendingJobs', align: 'right', sortable: true },
  { name: 'failedJobs', label: 'Failed', field: 'failedJobs', align: 'right', sortable: true },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function load() {
  loading.value = true
  try {
    const res = await api.listBatches(props.connectionId, { page: 1, maxRows: 50 })
    rows.value = res.data || []
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
