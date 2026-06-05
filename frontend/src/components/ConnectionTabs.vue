<template>
  <div class="conn-tabs row items-stretch no-wrap bg-grey-10" data-test="connection-tabs">
    <div
      v-for="t in ctx.tabs"
      :key="t.connectionId"
      class="conn-tab row items-center no-wrap"
      :class="{ 'conn-tab--active': t.connectionId === ctx.activeId }"
      :data-test="`tab-${t.connectionId}`"
      role="tab"
      :aria-selected="t.connectionId === ctx.activeId"
      @click="activate(t.connectionId)"
    >
      <q-icon name="dns" size="16px" class="q-mr-xs text-grey-5" />
      <span class="conn-tab__name">{{ t.name }}</span>

      <q-badge
        v-if="badge(t.connectionId).total > 0"
        :color="badge(t.connectionId).error > 0 ? 'negative' : 'grey-7'"
        :data-test="`tab-badge-${t.connectionId}`"
        class="q-ml-xs"
      >{{ badge(t.connectionId).error > 0 ? badge(t.connectionId).error : badge(t.connectionId).total }}</q-badge>

      <q-btn
        dense flat round size="xs" icon="close"
        class="conn-tab__close q-ml-xs"
        :data-test="`tab-close-${t.connectionId}`"
        @click.stop="close(t.connectionId)"
      />
    </div>

    <div v-if="!ctx.tabs.length" class="conn-tabs__empty text-grey-6 row items-center q-px-md">
      No Connections open — pick one above to start a context.
    </div>
  </div>
</template>

<script setup>
import { useConnectionContextStore } from '@/stores/connectionContext'
import { useRealtimeStore } from '@/stores/realtime'

const ctx = useConnectionContextStore()
const realtime = useRealtimeStore()

// Live activity per tab (running/error counts) read straight from the RealtimeStore — no duplicate
// subscription state. A backgrounded Connection that errors badges red even while unfocused.
const badge = (cid) => realtime.badgeFor(cid)

function activate(cid) { ctx.activateTab(cid) }
function close(cid) { ctx.closeTab(cid) }
</script>

<style scoped>
.conn-tabs {
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
  min-height: 36px;
  overflow-x: auto;
}
.conn-tab {
  padding: 0 10px;
  cursor: pointer;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 2px solid transparent;
  color: #cfcfcf;
  white-space: nowrap;
}
.conn-tab:hover {
  background: rgba(255, 255, 255, 0.05);
}
.conn-tab--active {
  background: #1d1d1d;
  color: #fff;
  border-bottom-color: var(--q-primary);
}
.conn-tab__name {
  font-size: 13px;
}
.conn-tab__close {
  opacity: 0.6;
}
.conn-tab__close:hover {
  opacity: 1;
}
</style>
