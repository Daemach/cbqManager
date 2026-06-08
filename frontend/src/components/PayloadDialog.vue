<template>
  <q-dialog v-model="open" @show="onShow">
    <q-card dark class="payload-card" data-test="payload-dialog">
      <q-card-section class="row items-center q-pb-sm">
        <div class="text-subtitle1">{{ title }}</div>
        <q-space />
        <q-chip dense square :color="isJsonPayload ? 'green-9' : 'grey-8'" text-color="white" data-test="payload-kind">
          {{ isJsonPayload ? 'JSON' : 'raw' }}
        </q-chip>
        <q-btn
          ref="copyBtn"
          dense outline no-caps
          color="primary"
          icon="content_copy"
          label="Copy"
          class="q-ml-sm"
          data-test="payload-copy"
          @click="copy"
        />
        <q-btn v-close-popup dense flat round icon="close" class="q-ml-xs" data-test="payload-close" />
      </q-card-section>
      <q-separator dark />
      <q-card-section class="payload-body">
        <pre v-if="pretty" class="payload-pre" data-test="payload-pre">{{ pretty }}</pre>
        <div v-else class="text-grey-6 q-pa-md" data-test="payload-empty">No payload.</div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useQuasar, copyToClipboard } from 'quasar'
import { prettyPayload, isJson, copyText } from '@/services/payloadView.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  raw: { type: [String, Object, null], default: '' },
  title: { type: String, default: 'Payload' }
})
const emit = defineEmits(['update:modelValue'])
const $q = useQuasar()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const pretty = computed(() => prettyPayload(props.raw))
const isJsonPayload = computed(() => isJson(props.raw))

const copyBtn = ref(null)
// House style: dialogs auto-focus their first interactive control on open.
function onShow() {
  nextTick(() => { copyBtn.value?.$el?.focus?.() })
}
watch(open, (v) => { if (v) onShow() })

async function copy() {
  const text = copyText(props.raw)
  if (!text) {
    $q.notify({ type: 'warning', message: 'Nothing to copy', timeout: 1200 })
    return
  }
  try {
    await copyToClipboard(text)
    $q.notify({ type: 'positive', message: 'Payload copied to clipboard', timeout: 1200 })
  } catch {
    $q.notify({ type: 'negative', message: 'Copy failed', timeout: 1500 })
  }
}
</script>

<style scoped>
.payload-card {
  width: 720px;
  max-width: 92vw;
}
.payload-body {
  max-height: 60vh;
  overflow: auto;
}
.payload-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Roboto Mono', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.45;
  color: #d6d6d6;
}
</style>
