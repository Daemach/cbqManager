<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h6">Connections</div>
      <q-space />
      <q-btn color="primary" icon="add" label="Add Connection" data-test="add-connection" @click="openCreate" />
    </div>

    <!-- Admin registry: show every Connection on one page (the list is small) rather than hiding
         rows behind 5-row pagination — keeps the screen scannable and makes UI assertions
         deterministic regardless of how many Connections exist (issue #12). -->
    <q-table :rows="rows" :columns="columns" row-key="id" :loading="loading" dense flat bordered
             :pagination="{ rowsPerPage: 0 }" hide-pagination>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn dense size="sm" icon="monitor_heart" :to="{ name: 'health', params: { connectionId: props.row.id } }">
            <q-tooltip>Queue Health</q-tooltip>
          </q-btn>
          <q-btn dense size="sm" icon="edit" :data-test="`edit-${props.row.name}`" @click="openEdit(props.row)" />
          <q-btn dense size="sm" color="negative" icon="delete_outline" :data-test="`delete-${props.row.name}`" @click="confirmDelete(props.row)" />
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width row flex-center q-pa-md text-grey">No connections yet — add one.</div>
      </template>
    </q-table>

    <!-- Create / Edit dialog -->
    <q-dialog v-model="dialog" persistent>
      <q-card style="min-width: 480px">
        <q-card-section class="text-h6">{{ editing ? 'Edit' : 'Add' }} Connection</q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="form.name" label="Name *" outlined dense data-test="conn-name" />
          <q-select v-model="form.environment" :options="environments" label="Environment" outlined dense emit-value map-options data-test="conn-environment" />
          <q-input v-model="form.grammar" label="Grammar (engine)" outlined dense data-test="conn-grammar" hint="e.g. SqlServerGrammar — blank to auto-detect" />
          <q-input v-model="form.tableName" label="Jobs table" outlined dense data-test="conn-tableName" />
          <q-input v-model="form.datasourceClass" label="JDBC driver class *" outlined dense data-test="conn-datasourceClass" />
          <q-input v-model="form.connectionString" label="JDBC connection string *" outlined dense data-test="conn-connectionString" />
          <q-input v-model="form.secrets.username" label="DB username" outlined dense data-test="conn-username" />
          <q-input
            v-model="form.secrets.password"
            :label="editing ? 'DB password (blank = unchanged)' : 'DB password'"
            type="password" outlined dense data-test="conn-password"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" :label="editing ? 'Save' : 'Create'" :loading="saving" data-test="save-connection" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'

const $q = useQuasar()
const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const editing = ref(false)
const editingId = ref(null)

const environments = [
  { label: 'development', value: 'development' },
  { label: 'staging', value: 'staging' },
  { label: 'production', value: 'production' }
]

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left' },
  { name: 'environment', label: 'Environment', field: 'environment', align: 'left' },
  { name: 'grammar', label: 'Engine', field: 'grammar', align: 'left' },
  { name: 'isActive', label: 'Active', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'right' }
]

const blankForm = () => ({
  name: '', environment: 'development', grammar: '', tableName: 'cbq_jobs',
  datasourceClass: '', connectionString: '', secrets: { username: '', password: '' }
})
const form = reactive(blankForm())

function reset(values) {
  Object.assign(form, blankForm(), values || {})
  form.secrets = { username: values?.secrets?.username || '', password: '' }
}

async function load() {
  loading.value = true
  try {
    rows.value = (await api.listConnections()).data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = false
  editingId.value = null
  reset()
  dialog.value = true
}

async function openEdit(row) {
  editing.value = true
  editingId.value = row.id
  // Fetch the full row (no secrets are returned by the API)
  const full = (await api.getConnection(row.id)).data || row
  reset(full)
  dialog.value = true
}

async function save() {
  saving.value = true
  try {
    const payload = {
      name: form.name,
      environment: form.environment,
      grammar: form.grammar,
      tableName: form.tableName,
      datasourceClass: form.datasourceClass,
      connectionString: form.connectionString
    }
    // Only send secrets when provided (avoids wiping the stored password on edit)
    if (form.secrets.username || form.secrets.password) {
      payload.secrets = { username: form.secrets.username, password: form.secrets.password }
    }
    if (editing.value) {
      await api.updateConnection(editingId.value, payload)
    } else {
      await api.createConnection(payload)
    }
    $q.notify({ type: 'positive', message: editing.value ? 'Connection saved' : 'Connection created' })
    dialog.value = false
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Save failed' })
  } finally {
    saving.value = false
  }
}

function confirmDelete(row) {
  $q.dialog({
    title: 'Delete Connection',
    message: `Delete "${row.name}"? This removes it from the registry (the target DB is untouched).`,
    cancel: true,
    ok: { label: 'Delete', color: 'negative' }
  }).onOk(async () => {
    await api.deleteConnection(row.id)
    $q.notify({ type: 'positive', message: 'Connection deleted' })
    await load()
  })
}

load()
</script>
