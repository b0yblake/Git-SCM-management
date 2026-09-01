import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'
import type { MenuTargetWindow } from './applicationMenu'

/** A window the handler can be pointed at, recording what reaches it. */
const fakeWindow = (destroyed = false, contentsDestroyed = false) => {
  const sent: string[] = []
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => contentsDestroyed,
      send: (channel: string) => {
        sent.push(channel)
      }
    }
  }
}

let focusedWindow: MenuTargetWindow | null = null
const builtTemplates: unknown[] = []
const installedMenus: unknown[] = []

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => focusedWindow
  },
  Menu: {
    buildFromTemplate: (template: unknown) => {
      builtTemplates.push(template)
      return { template }
    },
    setApplicationMenu: (menu: unknown) => {
      installedMenus.push(menu)
    }
  }
}))

const { buildApplicationMenuTemplate, createOpenPortsHandler, installApplicationMenu } =
  await import('./applicationMenu')

interface TemplateItem {
  readonly id?: string
  readonly label?: string
  readonly role?: string
  readonly type?: string
  readonly click?: () => void
  readonly submenu?: TemplateItem[]
}

const flatten = (items: readonly TemplateItem[]): TemplateItem[] =>
  items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])

beforeEach(() => {
  focusedWindow = null
  builtTemplates.length = 0
  installedMenus.length = 0
})

describe('the menu template', () => {
  const template = buildApplicationMenuTemplate(() => {}) as TemplateItem[]
  const everything = flatten(template)

  it('contains File → Port… exactly once', () => {
    expect(template[0]?.label).toBe('File')
    const portItems = everything.filter((item) => item.label === 'Port…')

    expect(portItems).toHaveLength(1)
    expect(template[0]?.submenu?.some((item) => item.label === 'Port…')).toBe(true)
  })

  it('keeps the standard edit roles, so copy/paste behavior survives the custom menu', () => {
    const roles = everything.map((item) => item.role).filter(Boolean)

    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      expect(roles).toContain(role)
    }
  })

  it('keeps the standard window roles', () => {
    const roles = everything.map((item) => item.role).filter(Boolean)

    for (const role of ['minimize', 'close', 'quit']) {
      expect(roles).toContain(role)
    }
  })

  it('introduces no accelerator of its own for Port…', () => {
    const port = everything.find((item) => item.label === 'Port…')

    expect(port && 'accelerator' in port).toBe(false)
  })
})

describe('the Port… click handler', () => {
  it('sends ports:open to the focused, live window — and nothing else', () => {
    const window = fakeWindow()
    const handler = createOpenPortsHandler(() => window)

    handler()

    expect(window.sent).toEqual([IPC.ports.open])
  })

  it('is a no-op with no focused window', () => {
    const handler = createOpenPortsHandler(() => null)

    expect(() => handler()).not.toThrow()
  })

  it('is a no-op for a destroyed window', () => {
    const window = fakeWindow(true)

    createOpenPortsHandler(() => window)()

    expect(window.sent).toEqual([])
  })

  it('is a no-op for destroyed webContents', () => {
    const window = fakeWindow(false, true)

    createOpenPortsHandler(() => window)()

    expect(window.sent).toEqual([])
  })
})

describe('installApplicationMenu', () => {
  it('builds the template and installs it as the application menu', () => {
    installApplicationMenu()

    expect(builtTemplates).toHaveLength(1)
    expect(installedMenus).toHaveLength(1)
  })

  it('wires the real click through to the real focused window', () => {
    installApplicationMenu()
    const window = fakeWindow()
    focusedWindow = window

    const template = builtTemplates[0] as TemplateItem[]
    flatten(template)
      .find((item) => item.id === 'open-ports')
      ?.click?.()

    expect(window.sent).toEqual([IPC.ports.open])
  })
})
