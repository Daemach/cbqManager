<template>
  <router-view />
</template>

<script setup>
// Root component — routing handles the layout + views. It also owns the GLOBAL auth-error handler:
// any 401/403 from the API (api.js dispatches `cbqm:auth-error`) surfaces a notification and sends
// the operator back to login, so a stale/expired/under-privileged session can never leave them on a
// silent blank screen.
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { setToken } from '@/services/api'

const router = useRouter()
const $q = useQuasar()

let handling = false // de-dupe bursts (several calls can 403 at once)

function onAuthError(e) {
  if (handling) return
  handling = true
  setTimeout(() => { handling = false }, 1500)

  const status = e?.detail?.status
  const message = e?.detail?.message || 'Your session is no longer authorized.'
  setToken('')

  $q.notify({
    type: 'negative',
    message: status === 403 ? `Not authorized: ${message}` : 'Your session has expired — please sign in again.',
    timeout: 4000
  })

  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
}

onMounted(() => window.addEventListener('cbqm:auth-error', onAuthError))
onBeforeUnmount(() => window.removeEventListener('cbqm:auth-error', onAuthError))
</script>
