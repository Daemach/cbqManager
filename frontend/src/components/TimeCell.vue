<template>
  <span v-if="rel" class="time-cell" data-test="time-cell">
    {{ rel }}
    <q-tooltip v-if="abs">{{ abs }}</q-tooltip>
  </span>
  <span v-else class="text-grey-6" data-test="time-cell-empty">—</span>
</template>

<script setup>
import { computed } from 'vue'
import { relative, absolute } from '@/services/timeFormat.js'

// Surfaces an hr*/epoch timestamp as a concise relative label ("3m ago") with the absolute ISO on
// hover (issue #23 part C). Accepts an ISO string, epoch-seconds, or a Date; blank-degrades to "—".
const props = defineProps({
  value: { type: [String, Number, Date, null], default: '' }
})

const rel = computed(() => relative(props.value))
const abs = computed(() => absolute(props.value))
</script>

<style scoped>
.time-cell {
  cursor: default;
}
</style>
