<template>
  <q-page class="q-pa-md">
    <div class="text-h6 q-mb-md">Failed Jobs</div>
    <!--
      TODO: port the reference failedJobs.cfm table — enriched columns (mapping, fileName:line,
      exceptionMessage), retry / retry+delete / delete row actions, bulk select. Enrichment is
      app-side (ADR-0001/Q9); retry is Memento insert (ADR-0002).
    -->
    <q-table
      v-model:pagination="pagination"
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="filter"
      dense flat bordered
      @request="onRequest"
    >
      <template #top-right>
        <q-input v-model="filter" dense outlined debounce="300" placeholder="Filter" clearable />
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" icon="update" @click="retry(props.row.id, false)" />
          <q-btn dense size="sm" icon="delete_outline" @click="retry(props.row.id, true)" />
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
const filter = ref('')
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0, sortBy: 'failedDate', descending: true })

const columns = [
  { name: 'failedDate', label: 'Failed', field: 'failedDate', align: 'left' },
  { name: 'queue', label: 'Queue', field: 'queue', align: 'left' },
  { name: 'mapping', label: 'Job', field: 'mapping', align: 'left' },
  { name: 'fileName', label: 'File:Line', field: (r) => `${r.fileName || ''}:${r.lineNumber || ''}`, align: 'left' },
  { name: 'exceptionMessage', label: 'Error', field: 'exceptionMessage', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'right' }
]

async function onRequest(p) {
  loading.value = true
  try {
    const pg = p?.pagination || pagination.value
    const res = await api.listFailed(props.connectionId, { page: pg.page, maxRows: pg.rowsPerPage, filter: filter.value || '' })
    rows.value = res.data || []
    pagination.value = { ...pg, rowsNumber: res.pagination?.totalRecords || 0 }
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
