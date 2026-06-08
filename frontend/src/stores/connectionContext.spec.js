import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  useConnectionContextStore, DEFAULT_TOOL,
  readTabsCookie, writeTabsCookie, setCookieDoc, createCookieJar
} from './connectionContext'

const conn = (id, name = `c${id}`) => ({ id, name, environment: 'development' })

describe('ConnectionContextStore', () => {
  let ctx
  beforeEach(() => {
    setActivePinia(createPinia())
    // Fresh in-memory cookie jar per test (env is `node`, so there is no real document.cookie).
    setCookieDoc(createCookieJar())
    ctx = useConnectionContextStore()
  })

  describe('openTab', () => {
    it('opens a Connection as a tab, makes it active, and starts on the default tool', () => {
      ctx.openTab(conn(1))
      expect(ctx.count).toBe(1)
      expect(ctx.activeId).toBe('1')
      expect(ctx.activeTab.name).toBe('c1')
      expect(ctx.activeTab.lastTool).toBe(DEFAULT_TOOL)
    })

    it('coerces ids to strings and reports isOpen', () => {
      ctx.openTab(conn(7))
      expect(ctx.isOpen(7)).toBe(true)
      expect(ctx.isOpen('7')).toBe(true)
      expect(ctx.isOpen(8)).toBe(false)
    })

    it('is idempotent — re-opening focuses without duplicating or resetting the remembered tool', () => {
      ctx.openTab(conn(1))
      ctx.rememberTool(1, 'jobs')
      ctx.openTab(conn(2))
      expect(ctx.activeId).toBe('2')

      ctx.openTab(conn(1)) // re-open existing
      expect(ctx.count).toBe(2)
      expect(ctx.activeId).toBe('1')
      expect(ctx.activeTab.lastTool).toBe('jobs') // preserved
    })
  })

  describe('activateTab', () => {
    it('activates an open tab and ignores unknown ids', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.activateTab(1)
      expect(ctx.activeId).toBe('1')
      ctx.activateTab(99) // unknown — no-op
      expect(ctx.activeId).toBe('1')
    })
  })

  describe('rememberTool', () => {
    it('remembers a per-tab tool so re-activating resumes there (story 3)', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.rememberTool(1, 'failed')
      ctx.rememberTool(2, 'batches')
      expect(ctx.tabs.find((t) => t.connectionId === '1').lastTool).toBe('failed')
      ctx.activateTab(1)
      expect(ctx.activeTab.lastTool).toBe('failed')
    })
    it('ignores a blank tool or unknown tab', () => {
      ctx.openTab(conn(1))
      ctx.rememberTool(1, '')
      expect(ctx.activeTab.lastTool).toBe(DEFAULT_TOOL)
      ctx.rememberTool(42, 'jobs') // unknown — no throw
    })
  })

  describe('closeTab', () => {
    it('closing a non-active tab leaves the active one unchanged', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2)) // active = 2
      ctx.closeTab(1)
      expect(ctx.count).toBe(1)
      expect(ctx.activeId).toBe('2')
    })

    it('closing the active middle tab activates the neighbor that shifts into its slot', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.openTab(conn(3))
      ctx.activateTab(2) // active middle
      ctx.closeTab(2)
      expect(ctx.activeId).toBe('3') // next shifts into the slot
      expect(ctx.tabs.map((t) => t.connectionId)).toEqual([ '1', '3' ])
    })

    it('closing the active last tab activates the new last (previous) tab', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.openTab(conn(3)) // active = 3 (last)
      ctx.closeTab(3)
      expect(ctx.activeId).toBe('2')
    })

    it('closing the final tab clears the active context', () => {
      ctx.openTab(conn(1))
      ctx.closeTab(1)
      expect(ctx.count).toBe(0)
      expect(ctx.activeId).toBeNull()
      expect(ctx.activeTab).toBeNull()
    })

    it('closing an unknown id is a no-op', () => {
      ctx.openTab(conn(1))
      ctx.closeTab(99)
      expect(ctx.count).toBe(1)
      expect(ctx.activeId).toBe('1')
    })
  })

  // --- cookie persistence / rehydration (Console layout v2, issue #18) -------------------------
  describe('persistence & rehydration', () => {
    it('snapshot captures open ids, active, and each tab lastTool', () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.rememberTool(1, 'jobs')
      ctx.activateTab(1)
      expect(ctx.snapshot()).toEqual({
        tabs: [ { connectionId: '1', lastTool: 'jobs' }, { connectionId: '2', lastTool: DEFAULT_TOOL } ],
        activeId: '1'
      })
    })

    it('persists the open set to a cookie on change and rehydrates the same tabs/active/lastTool', async () => {
      ctx.openTab(conn(1))
      ctx.openTab(conn(2))
      ctx.rememberTool(2, 'failed')
      ctx.activateTab(1)
      await nextTick() // the deep watcher persists asynchronously

      const saved = readTabsCookie()
      expect(saved.tabs).toEqual([
        { connectionId: '1', lastTool: DEFAULT_TOOL },
        { connectionId: '2', lastTool: 'failed' }
      ])
      expect(saved.activeId).toBe('1')

      // Simulate a reload: a brand-new store instance rehydrates from the cookie.
      setActivePinia(createPinia())
      const fresh = useConnectionContextStore()
      expect(fresh.count).toBe(0)
      expect(fresh.rehydrate()).toBe(true)
      expect(fresh.tabs.map((t) => t.connectionId)).toEqual([ '1', '2' ])
      expect(fresh.tabs.find((t) => t.connectionId === '2').lastTool).toBe('failed')
      expect(fresh.activeId).toBe('1')
    })

    it('rehydrate returns false when no cookie is saved', () => {
      expect(ctx.rehydrate()).toBe(false)
      expect(ctx.count).toBe(0)
    })

    it('rehydrate falls back to the first tab when the saved activeId is no longer open', () => {
      writeTabsCookie({ tabs: [ { connectionId: '5', lastTool: 'jobs' } ], activeId: '999' })
      expect(ctx.rehydrate()).toBe(true)
      expect(ctx.activeId).toBe('5')
    })

    it('ignores a corrupt cookie value', () => {
      const jar = createCookieJar()
      jar.cookie = 'cbqm_tabs=not-json; path=/'
      setCookieDoc(jar)
      expect(readTabsCookie()).toBeNull()
      expect(ctx.rehydrate()).toBe(false)
    })
  })

  describe('bootFrom', () => {
    it('restores saved tabs from the cookie when present (ignores the connection list)', () => {
      writeTabsCookie({ tabs: [ { connectionId: '2', lastTool: 'batches' } ], activeId: '2' })
      const ok = ctx.bootFrom([ conn(1), conn(2), conn(3) ])
      expect(ok).toBe(true)
      expect(ctx.tabs.map((t) => t.connectionId)).toEqual([ '2' ])
      expect(ctx.activeTab.lastTool).toBe('batches')
      expect(ctx.activeId).toBe('2')
    })

    it('auto-opens the FIRST Connection when nothing was saved', () => {
      const ok = ctx.bootFrom([ conn(10, 'prod'), conn(11, 'dev') ])
      expect(ok).toBe(true)
      expect(ctx.count).toBe(1)
      expect(ctx.activeId).toBe('10')
      expect(ctx.activeTab.name).toBe('prod')
      expect(ctx.activeTab.lastTool).toBe(DEFAULT_TOOL)
    })

    it('returns false (no context) when there is nothing saved and no Connections exist', () => {
      expect(ctx.bootFrom([])).toBe(false)
      expect(ctx.count).toBe(0)
      expect(ctx.activeId).toBeNull()
    })

    it('does not clobber an already-open tab (a deep link wins)', () => {
      ctx.openTab(conn(7, 'deeplinked'))
      writeTabsCookie({ tabs: [ { connectionId: '1', lastTool: 'jobs' } ], activeId: '1' })
      const ok = ctx.bootFrom([ conn(1), conn(2) ])
      expect(ok).toBe(true)
      expect(ctx.tabs.map((t) => t.connectionId)).toEqual([ '7' ])
      expect(ctx.activeId).toBe('7')
    })
  })
})
