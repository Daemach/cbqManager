<template>
  <!-- Reusable Connection create/edit dialog (extracted from the old ConnectionsView so the
       toolbar picker and any future caller share one editor). Auto-focuses its first field on
       open — a general console rule (PRD-0002 Styling). Outlined controls + dark mode (house style). -->
  <q-dialog v-model="open" persistent @show="focusFirst">
    <q-card style="min-width: 480px">
      <q-card-section class="text-h6">{{ editing ? 'Edit' : 'Add' }} Connection</q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-input ref="firstField" v-model="form.name" label="Name *" outlined dense data-test="conn-name" />
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
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { api } from '@/services/api'

// v-model:modelValue controls visibility; `saved` emits the persisted Connection so the caller
// can refresh its list / open the tab. The dialog owns the form + save lifecycle internally.
const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits([ 'update:modelValue', 'saved' ])

const $q = useQuasar()
const saving = ref(false)
const editing = ref(false)
const editingId = ref(null)
const firstField = ref(null)

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const environments = [
  { label: 'development', value: 'development' },
  { label: 'staging', value: 'staging' },
  { label: 'production', value: 'production' }
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

function focusFirst() {
  nextTick(() => firstField.value?.focus())
}

/** Open the dialog in create mode. Exposed so a caller (e.g. the picker) can drive it. */
function openCreate() {
  editing.value = false
  editingId.value = null
  reset()
  open.value = true
}

/** Open the dialog in edit mode for a Connection (id or row). Fetches the full row (no secrets). */
async function openEdit(row) {
  editing.value = true
  editingId.value = row.id
  const full = (await api.getConnection(row.id)).data || row
  reset(full)
  open.value = true
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
    // Only send secrets when provided (avoids wiping the stored password on edit).
    if (form.secrets.username || form.secrets.password) {
      payload.secrets = { username: form.secrets.username, password: form.secrets.password }
    }
    const res = editing.value
      ? await api.updateConnection(editingId.value, payload)
      : await api.createConnection(payload)
    $q.notify({ type: 'positive', message: editing.value ? 'Connection saved' : 'Connection created' })
    open.value = false
    emit('saved', res?.data ?? { id: editingId.value, ...payload })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Save failed' })
  } finally {
    saving.value = false
  }
}

defineExpose({ openCreate, openEdit })
</script>
