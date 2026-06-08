<template>
  <!-- Empty landing shown only while the shell boots (restores saved tabs / auto-opens the first
       Connection) or when there are no Connections at all. Connection CRUD lives in the toolbar
       picker (Console layout v2, issue #18) — there is no standalone Connections page. -->
  <q-page class="column flex-center text-grey-5 q-pa-xl" data-test="home-empty">
    <q-icon name="dns" size="48px" class="q-mb-md" />
    <div class="text-h6">No Connection open</div>
    <div class="q-mt-sm">Use the <strong>Connections</strong> picker in the toolbar to open or add a Connection.</div>
  </q-page>
</template>

<script setup>
// Intentionally inert — the shell (MainLayout) drives navigation into a working context on boot.
</script>
