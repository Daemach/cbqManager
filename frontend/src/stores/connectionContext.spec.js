import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionContextStore, DEFAULT_TOOL } from './connectionContext'

const conn = (id, name = `c${id}`) => ({ id, name, environment: 'development' })

describe('ConnectionContextStore', () => {
  let ctx
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
