// ConnectionContextStore (PRD-0002 top zone) — the ordered set of open Connection tabs, the active
// tab, and each tab's remembered tool screen. This is PURE tab bookkeeping: it owns NO subscription
// state. Live activity (badges) is read from the RealtimeStore by the view; MainLayout orchestrates
// navigation and the realtime subscribe/active-swap in response to this store's changes.

import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'

export const DEFAULT_TOOL = 'health'

export const useConnectionContextStore = defineStore('connectionContext', () => {
  const tabs = ref([]) // [{ connectionId, name, environment, lastTool }]
  const activeId = ref(null)

  const indexOf = (cid) => tabs.value.findIndex((t) => t.connectionId === String(cid))
  const isOpen = (cid) => indexOf(cid) !== -1

  /**
   * Open a Connection as a tab (idempotent) and make it active. Existing tabs keep their remembered
   * tool; a freshly opened tab starts on DEFAULT_TOOL.
   * @param conn { id, name?, environment? }
   * @return the active connectionId (string)
   */
  function openTab(conn) {
    const id = String(conn.id)
    if (!isOpen(id)) {
      tabs.value.push({
        connectionId: id,
        name: conn.name ?? id,
        environment: conn.environment ?? '',
        lastTool: DEFAULT_TOOL
      })
    }
    activeId.value = id
    return id
  }

  function activateTab(cid) {
    if (isOpen(cid)) activeId.value = String(cid)
    return activeId.value
  }

  /**
   * Close a tab. When the active tab is closed, the neighbor that shifts into its slot becomes
   * active (or the new last tab); closing the final tab clears the active context.
   * @return the new active connectionId (string|null)
   */
  function closeTab(cid) {
    const id = String(cid)
    const idx = indexOf(id)
    if (idx === -1) return activeId.value

    const wasActive = activeId.value === id
    tabs.value.splice(idx, 1)

    if (wasActive) {
      activeId.value = tabs.value.length
        ? tabs.value[Math.min(idx, tabs.value.length - 1)].connectionId
        : null
    }
    return activeId.value
  }

  /** Remember the tool screen a tab was last on, so re-activating it resumes there (story 3). */
  function rememberTool(cid, tool) {
    const tab = tabs.value[indexOf(cid)]
    if (tab && tool) tab.lastTool = tool
  }

  function reset() {
    tabs.value = []
    activeId.value = null
  }

  const activeTab = computed(() => tabs.value[indexOf(activeId.value)] ?? null)
  const count = computed(() => tabs.value.length)

  return { tabs, activeId, activeTab, count, isOpen, openTab, activateTab, closeTab, rememberTool, reset }
})
