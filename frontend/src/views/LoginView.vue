<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="flex flex-center">
        <q-card style="width: 360px">
          <q-card-section class="text-h6">cbqManager</q-card-section>
          <q-card-section class="q-gutter-md">
            <q-input v-model="username" label="Username" outlined dense @keyup.enter="onLogin" />
            <q-input v-model="password" label="Password" type="password" outlined dense @keyup.enter="onLogin" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn color="primary" label="Sign in" :loading="loading" @click="onLogin" />
          </q-card-actions>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { api, setToken } from '@/services/api'

const router = useRouter()
const route = useRoute()
const $q = useQuasar()
const username = ref('')
const password = ref('')
const loading = ref(false)

async function onLogin() {
  loading.value = true
  try {
    const res = await api.login(username.value, password.value)
    // The login response shape follows cbsecurity JWT (token in data). Adjust if needed.
    setToken(res.data?.access_token || res.data || res.token)
    router.push(route.query.redirect || { name: 'connections' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'Login failed' })
  } finally {
    loading.value = false
  }
}
</script>
