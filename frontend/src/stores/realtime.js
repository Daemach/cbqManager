// RealtimeStore (the PRD-0002 keystone) — owns the live subscription lifecycle, a capped retained
// event history, and pause/resume state PER Connection context (keyed by connectionId). Because it
// lives outside <router-view>, streams keep running and history is retained across tool navigation;
// switching the active context swaps the visible feed atomically with NO cross-context bleed (each
// context keeps its own buffer).
//
// Transport stays pluggable via the adapter factory (ADR-0006). Raw payloads are run through the
// pure EventNormalizer; the active context's feed is then run through the pure LiveEventFilter.
//
// Adapters and resume timers are held in module-level maps (NOT reactive state) so the Pusher/socket
// instances aren't proxied.

import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { api } from '@/services/api'
import { createRealtime } from '@/services/realtime'
import { normalizeEvent } from '@/services/realtime/eventNormalizer'
import { applyFilter } from '@/services/realtime/liveEventFilter'

const adapters = new Map() // connectionId(string) -> realtime adapter
const timers = new Map() // connectionId(string) -> auto-resume timeout id

export const useRealtimeStore = defineStore('realtime', () => {
  const contexts = reactive({}) // connectionId(string) -> context
  const activeId = ref(null)
  const maxEvents = ref(500)
  const autoResumeMs = ref(12000) // pause auto-resumes after this (0 = disabled)

  function newContext() {
    return {
      events: [], // visible feed, newest-first, capped to maxEvents
      heldCount: 0, // events dropped while paused (surfaced so a paused dock isn't silently stale)
      streaming: true,
      status: 'idle', // idle | connecting | live | disabled | error
      config: null, // { realtime, transport, channel, events, publicParams }
      badge: { total: 0, error: 0 }, // per-context activity (feeds the future context tabs)
      filter: {} // per-context filter spec (preserved across tab switches)
    }
  }

  function ensureContext(cid) {
    const id = String(cid)
    if (!contexts[id]) contexts[id] = newContext()
    return contexts[id]
  }

  // --- ingest --------------------------------------------------------------

  /** Normalize a raw transport payload and append it to a context's feed (respects pause + cap). */
  function pushEvent(cid, raw) {
    const ctx = ensureContext(cid)
    const ev = normalizeEvent(raw)
    if (!ev) return null // sentinel/heartbeat dropped

    // Badges accrue even while paused / unfocused, so a backgrounded context still signals activity.
    ctx.badge.total++
    if (ev.type === 'error') ctx.badge.error++

    if (!ctx.streaming) {
      ctx.heldCount++
      return null
    }
    ctx.events.unshift(ev)
    if (ctx.events.length > maxEvents.value) ctx.events.length = maxEvents.value
    return ev
  }

  /** Test/diagnostic seam: inject a raw payload into the active context as if from the transport. */
  function injectActive(raw) {
    if (activeId.value == null) return null
    return pushEvent(activeId.value, raw)
  }

  // --- subscription lifecycle ---------------------------------------------

  /**
   * Open + subscribe a context's live stream (idempotent). Fetches the Connection's PUBLIC broadcast
   * config and wires the matching transport adapter. A Connection with no realtime degrades to
   * status 'disabled' (still a usable, empty feed).
   */
  async function subscribe(cid) {
    const id = String(cid)
    const ctx = ensureContext(id)
    if (adapters.has(id)) return ctx // already live

    ctx.status = 'connecting'
    let cfg
    try {
      const res = await api.connectionBroadcast(id)
      cfg = res?.data ?? res
    } catch (e) {
      ctx.status = 'error'
      return ctx
    }
    ctx.config = cfg
    if (!cfg || !cfg.realtime) {
      ctx.status = 'disabled'
      return ctx
    }

    const rt = createRealtime({ transport: cfg.transport, ...(cfg.publicParams || {}) })
    adapters.set(id, rt)
    try {
      rt.subscribe(cfg.channel, cfg.events || [], (raw) => pushEvent(id, raw))
      ctx.status = 'live'
    } catch (e) {
      ctx.status = 'error'
    }
    return ctx
  }

  function unsubscribe(cid) {
    const id = String(cid)
    const rt = adapters.get(id)
    if (rt) {
      try { rt.unsubscribe() } catch (e) { /* adapter teardown is best-effort */ }
      adapters.delete(id)
    }
    clearTimer(id)
    if (contexts[id]) contexts[id].status = 'idle'
  }

  /** Make a context the active (visible) one, subscribing it if needed. Background contexts persist. */
  async function setActive(cid) {
    if (cid == null) { activeId.value = null; return null }
    const id = String(cid)
    activeId.value = id
    ensureContext(id)
    return subscribe(id)
  }

  function closeContext(cid) {
    const id = String(cid)
    unsubscribe(id)
    delete contexts[id]
    if (activeId.value === id) activeId.value = null
  }

  // --- pause / resume ------------------------------------------------------

  function clearTimer(id) {
    if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id) }
  }

  function scheduleAutoResume(id) {
    clearTimer(id)
    if (autoResumeMs.value > 0) {
      timers.set(id, setTimeout(() => resume(id), autoResumeMs.value))
    }
  }

  function pause(cid) {
    const id = String(cid)
    ensureContext(id).streaming = false
    scheduleAutoResume(id)
  }

  function resume(cid) {
    const id = String(cid)
    const ctx = ensureContext(id)
    ctx.streaming = true
    ctx.heldCount = 0
    clearTimer(id)
  }

  function toggleStreaming(cid) {
    ensureContext(cid).streaming ? pause(cid) : resume(cid)
  }

  // --- view helpers --------------------------------------------------------

  function setFilter(cid, spec) { ensureContext(cid).filter = { ...(spec || {}) } }
  function clearFeed(cid) { const c = ensureContext(cid); c.events = []; c.heldCount = 0 }
  function badgeFor(cid) { return contexts[String(cid)]?.badge ?? { total: 0, error: 0 } }

  const activeContext = computed(() => (activeId.value == null ? null : contexts[String(activeId.value)] || null))
  const activeFilter = computed(() => activeContext.value?.filter ?? {})
  const activeEvents = computed(() => activeContext.value?.events ?? [])
  const activeFiltered = computed(() => applyFilter(activeEvents.value, activeFilter.value))
  const activeStreaming = computed(() => activeContext.value?.streaming ?? true)
  const activeStatus = computed(() => activeContext.value?.status ?? 'idle')
  const activeHeldCount = computed(() => activeContext.value?.heldCount ?? 0)

  return {
    contexts, activeId, maxEvents, autoResumeMs,
    ensureContext, pushEvent, injectActive,
    subscribe, unsubscribe, setActive, closeContext,
    pause, resume, toggleStreaming,
    setFilter, clearFeed, badgeFor,
    activeContext, activeFilter, activeEvents, activeFiltered,
    activeStreaming, activeStatus, activeHeldCount
  }
})
