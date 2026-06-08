// ConnectionContextStore (PRD-0002 top zone) — the ordered set of open Connection tabs, the active
// tab, and each tab's remembered tool screen. This is PURE tab bookkeeping: it owns NO subscription
// state. Live activity (badges) is read from the RealtimeStore by the view; MainLayout orchestrates
// navigation and the realtime subscribe/active-swap in response to this store's changes.
//
// The open set survives a reload: it is persisted to a cookie (open tab ids + active tab + each
// tab's lastTool) and rehydrated on boot, so the operator's morning check is one refresh — not a
// setup ritual (Console layout v2, CONTEXT.md → Primary operator workflow). If nothing was saved,
// the shell auto-opens the FIRST Connection instead.

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const DEFAULT_TOOL = 'health'

const COOKIE_KEY = 'cbqm_tabs'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

// --- cookie helpers (kept tiny + dependency-free so the store stays unit-testable) --------------
// The cookie "document" is swappable so unit tests can run in a plain node environment without jsdom:
// setCookieDoc() injects a stub exposing a `cookie` string property (get/set), mirroring the browser.

let cookieDoc = (typeof document !== 'undefined' ? document : null)

/** Test seam: point the cookie helpers at a stub document (a `{ cookie }` accessor). */
export function setCookieDoc(doc) { cookieDoc = doc }

/** A minimal in-memory document.cookie stand-in for tests (single-cookie, max-age aware enough). */
export function createCookieJar() {
  const store = new Map()
  return {
    get cookie() {
      return [ ...store.entries() ].map(([ k, v ]) => `${k}=${v}`).join('; ')
    },
    set cookie(str) {
      const [ pair ] = str.split(';')
      const eq = pair.indexOf('=')
      const key = pair.slice(0, eq).trim()
      const val = pair.slice(eq + 1)
      if (/max-age=0\b/.test(str) || val === '') store.delete(key)
      else store.set(key, val)
    }
  }
}

export function readTabsCookie(doc = cookieDoc) {
  if (!doc) return null
  const match = (doc.cookie || '').split('; ').find((c) => c.startsWith(`${COOKIE_KEY}=`))
  if (!match) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_KEY.length + 1)))
    if (!parsed || !Array.isArray(parsed.tabs)) return null
    return parsed
  } catch (e) {
    return null // corrupt cookie → treat as none saved
  }
}

export function writeTabsCookie(payload, doc = cookieDoc) {
  if (!doc) return
  const value = encodeURIComponent(JSON.stringify(payload))
  doc.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

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

  // --- persistence ---------------------------------------------------------

  /** Serialize the open set to the shape stored in the cookie. */
  function snapshot() {
    return {
      tabs: tabs.value.map((t) => ({ connectionId: t.connectionId, lastTool: t.lastTool })),
      activeId: activeId.value
    }
  }

  /** Persist the current open set (ids + active + each tab's lastTool) to the cookie. */
  function persist() {
    writeTabsCookie(snapshot())
  }

  /**
   * Rehydrate the open set from the cookie. Tab names/environments are backfilled by MainLayout once
   * the Connection list loads. Returns true when at least one tab was restored, false otherwise (so
   * the caller can fall back to auto-opening the first Connection).
   */
  function rehydrate() {
    const saved = readTabsCookie()
    if (!saved || !saved.tabs.length) return false
    tabs.value = saved.tabs.map((t) => ({
      connectionId: String(t.connectionId),
      name: String(t.connectionId),
      environment: '',
      lastTool: t.lastTool || DEFAULT_TOOL
    }))
    activeId.value = isOpen(saved.activeId) ? String(saved.activeId) : (tabs.value[0]?.connectionId ?? null)
    return true
  }

  /**
   * Boot the shell's open set: restore saved tabs from the cookie, or — if none were saved — auto-open
   * the FIRST Connection from the supplied list (Console layout v2). Returns true if a context is now
   * active. Idempotent against an already-populated store (a deep link that opened a tab first wins).
   */
  function bootFrom(connections = []) {
    if (tabs.value.length) return true // already populated (e.g. by a deep link) — don't clobber
    if (rehydrate()) return true
    const first = connections[0]
    if (first) { openTab(first); return true }
    return false
  }

  const activeTab = computed(() => tabs.value[indexOf(activeId.value)] ?? null)
  const count = computed(() => tabs.value.length)

  // Persist on every change to the open set so a reload restores it. Deep-watch picks up lastTool
  // edits as well as opens/closes/activations.
  watch([ tabs, activeId ], persist, { deep: true })

  return {
    tabs, activeId, activeTab, count, isOpen,
    openTab, activateTab, closeTab, rememberTool, reset,
    snapshot, persist, rehydrate, bootFrom
  }
})
