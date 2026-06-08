<template>
  <!-- Reusable Connection create/edit dialog (extracted from the old ConnectionsView so the
       toolbar picker and any future caller share one editor). Auto-focuses its first field on
       open — a general console rule (PRD-0002 Styling). Outlined controls + dark mode (house style). -->
  <q-dialog v-model="open" persistent @show="onShow">
    <q-card style="min-width: 520px">
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

      <!-- Broadcast Connection (realtime) — wire this Connection to the Live Monitor. Optional:
           "No realtime" is a valid choice (the monitor shows 'no realtime'). Pick an existing
           Broadcast Connection or create one inline. ADR-0006 / CONTEXT (Broadcast Connection). -->
      <q-separator />
      <q-card-section class="q-gutter-sm">
        <div class="text-subtitle2">Broadcast Connection (realtime)</div>
        <q-select
          v-model="form.broadcastConnectionId"
          :options="broadcastOptions"
          label="Broadcast Connection"
          outlined dense emit-value map-options
          data-test="conn-broadcast"
          hint="Drives the Live Monitor. Leave 'No realtime' to disable live traffic."
        />

        <!-- Inline create of a new Broadcast Connection (only when 'Create new…' is picked). -->
        <div v-if="creatingBroadcast" class="q-gutter-sm q-pl-sm q-mt-xs" style="border-left: 2px solid var(--q-primary)">
          <q-input v-model="bform.name" label="Broadcast name *" outlined dense data-test="bc-name" />
          <q-select v-model="bform.transport" :options="transports" label="Transport" outlined dense emit-value map-options data-test="bc-transport" />
          <template v-if="bform.transport === 'pusher'">
            <q-input v-model="bform.pusherKey" label="Pusher key" outlined dense data-test="bc-pusherKey" />
            <q-input v-model="bform.pusherCluster" label="Pusher cluster" outlined dense data-test="bc-pusherCluster" />
            <q-input v-model="bform.pusherAppId" label="Pusher app id (secret)" outlined dense data-test="bc-pusherAppId" />
            <q-input v-model="bform.pusherSecret" label="Pusher secret" type="password" outlined dense data-test="bc-pusherSecret" />
          </template>
          <template v-else>
            <q-input v-model="bform.socketboxUrl" label="Socketbox URL" outlined dense data-test="bc-socketboxUrl" />
            <q-input v-model="bform.socketboxAuth" label="Socketbox auth (secret)" type="password" outlined dense data-test="bc-socketboxAuth" />
          </template>
        </div>

        <!-- Channel + events apply when a Broadcast Connection is linked (existing or inline). -->
        <template v-if="hasBroadcast">
          <q-input v-model="form.channel" label="Channel" outlined dense data-test="conn-channel" hint="e.g. development — the named stream for this Connection's live activity" />
          <q-input v-model="form.events" label="Events (CSV)" outlined dense data-test="conn-events" hint="e.g. cbqWorker,cbqWorkerError" />
        </template>
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
import { buildConnectionPayload, buildBroadcastPayload, toBroadcastId } from '@/services/connectionEditorPayload'

// v-model:modelValue controls visibility; `saved` emits the persisted Connection so the caller
// can refresh its list / open the tab. The dialog owns the form + save lifecycle internally.
const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits([ 'update:modelValue', 'saved' ])

const $q = useQuasar()
const saving = ref(false)
const editing = ref(false)
const editingId = ref(null)
const firstField = ref(null)

// Loaded Broadcast Connections (public params only) for the picker. -1 is a sentinel for "create new".
const CREATE_NEW = -1
const broadcasts = ref([])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const environments = [
  { label: 'development', value: 'development' },
  { label: 'staging', value: 'staging' },
  { label: 'production', value: 'production' }
]
const transports = [
  { label: 'Pusher', value: 'pusher' },
  { label: 'Socketbox', value: 'socketbox' }
]

const broadcastOptions = computed(() => [
  { label: 'No realtime', value: 0 },
  ...broadcasts.value.map((b) => ({ label: `${b.name} (${b.transport})`, value: b.id })),
  { label: 'Create new…', value: CREATE_NEW }
])

const creatingBroadcast = computed(() => form.broadcastConnectionId === CREATE_NEW)
// Channel + events apply whenever realtime is wired (an existing link OR an inline new one).
const hasBroadcast = computed(() => creatingBroadcast.value || toBroadcastId(form.broadcastConnectionId) > 0)

const blankForm = () => ({
  name: '', environment: 'development', grammar: '', tableName: 'cbq_jobs',
  datasourceClass: '', connectionString: '', secrets: { username: '', password: '' },
  broadcastConnectionId: 0, channel: '', events: ''
})
const form = reactive(blankForm())

const blankBroadcast = () => ({
  name: '', transport: 'pusher', pusherKey: '', pusherCluster: '', pusherAppId: '', pusherSecret: '',
  socketboxUrl: '', socketboxAuth: ''
})
const bform = reactive(blankBroadcast())

function reset(values) {
  Object.assign(form, blankForm(), values || {})
  form.secrets = { username: values?.secrets?.username || '', password: '' }
  form.broadcastConnectionId = toBroadcastId(values?.broadcastConnectionId)
  form.channel = values?.channel || ''
  // events may come back as a CSV string or a JSON array string — normalize to a CSV for the input.
  form.events = normalizeEvents(values?.events)
  Object.assign(bform, blankBroadcast())
}

function normalizeEvents(events) {
  if (Array.isArray(events)) return events.join(',')
  const raw = (events || '').trim()
  if (raw.startsWith('[')) {
    try { return JSON.parse(raw).join(',') } catch { /* fall through */ }
  }
  return raw
}

async function loadBroadcasts() {
  try {
    broadcasts.value = (await api.listBroadcasts()).data || []
  } catch {
    broadcasts.value = []
  }
}

function onShow() {
  nextTick(() => firstField.value?.focus())
}

/** Open the dialog in create mode. Exposed so a caller (e.g. the picker) can drive it. */
async function openCreate() {
  editing.value = false
  editingId.value = null
  reset()
  await loadBroadcasts()
  open.value = true
}

/** Open the dialog in edit mode for a Connection (id or row). Fetches the full row (no secrets). */
async function openEdit(row) {
  editing.value = true
  editingId.value = row.id
  const full = (await api.getConnection(row.id)).data || row
  reset(full)
  await loadBroadcasts()
  open.value = true
}

async function save() {
  saving.value = true
  try {
    // Inline-create a Broadcast Connection first, then link the Connection to its new id.
    if (creatingBroadcast.value) {
      if (!bform.name.trim()) {
        $q.notify({ type: 'negative', message: 'Broadcast name is required' })
        return
      }
      const bcRes = await api.createBroadcast(buildBroadcastPayload(bform))
      const newId = bcRes?.data?.id
      await loadBroadcasts()
      form.broadcastConnectionId = newId
    }

    const payload = buildConnectionPayload(form, editing.value)
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
