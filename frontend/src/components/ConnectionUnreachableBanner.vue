<template>
  <!--
    Calm, retryable state shown by a tool view when its Connection's target DB is unreachable
    (pre-VPN; backend 503 connection_unreachable). NOT a raw error/blank — the morning workflow is
    "open console → connect VPN → Refresh". The Refresh button re-runs the view's load.
  -->
  <q-banner data-test="connection-unreachable" class="bg-warning text-dark q-mb-md" rounded>
    <template #avatar>
      <q-icon name="cloud_off" />
    </template>
    {{ message }}
    <template #action>
      <q-btn
        flat
        dense
        color="dark"
        icon="refresh"
        label="Refresh"
        data-test="connection-unreachable-refresh"
        :loading="loading"
        @click="$emit('retry')"
      />
    </template>
  </q-banner>
</template>

<script setup>
import { UNREACHABLE_MESSAGE } from '@/services/connectionUnreachable.js'

defineProps({
  loading: { type: Boolean, default: false },
  message: { type: String, default: UNREACHABLE_MESSAGE }
})
defineEmits(['retry'])
</script>
