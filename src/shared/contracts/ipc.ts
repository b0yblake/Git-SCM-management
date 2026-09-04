/**
 * The single source of truth for IPC channel names (ARCHITECTURE.md §6).
 *
 * No channel string may appear anywhere else in the codebase — `ipc.spec.ts`
 * enforces that by scanning the source tree.
 */
export const IPC = {
  terminal: {
    create: 'terminal:create',
    write: 'terminal:write',
    resize: 'terminal:resize',
    kill: 'terminal:kill',
    profiles: 'terminal:profiles',
    data: 'terminal:data',
    exit: 'terminal:exit',
    /** Pull: the validated --open-path directory queued at launch, once. */
    pendingOpenPath: 'terminal:pendingpath',
    /** One-way Main → renderer: a second instance forwarded a directory. */
    openPath: 'terminal:openpath'
  },

  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },

  workspace: {
    list: 'workspace:list',
    get: 'workspace:get',
    save: 'workspace:save',
    delete: 'workspace:delete',
    /** Creates a .lnk for a workspace; the save dialog owns the path. */
    shortcut: 'workspace:shortcut',
    /** Pull: the --open-workspace id queued at launch, once. */
    pendingOpen: 'workspace:pendingopen',
    /** One-way Main → renderer: a second instance forwarded a workspace. */
    open: 'workspace:open'
  },

  git: {
    inspect: 'git:inspect'
  },

  ports: {
    list: 'ports:list',
    terminate: 'ports:terminate',
    /** One-way Main → renderer: the native File → Port… menu entry. */
    open: 'ports:open'
  },

  updates: {
    /** Manual check from Settings; bypasses the startup throttle. */
    check: 'updates:check',
    /** Opens the release page Main minted — the payload carries no URL. */
    release: 'updates:release',
    /** One-way Main → renderer: the startup check found a newer version. */
    available: 'updates:available'
  },

  storage: {
    /** Where data lives now, the default, and any pending switch. */
    info: 'storage:info',
    /** Opens the native folder picker — no path ever crosses this channel. */
    choose: 'storage:choose'
  },

  about: {
    /** One-way Main → renderer: the native Help → About GitDeck entry. */
    open: 'about:open',
    /**
     * Opens one project link. The payload names a key from `APP_LINKS`; Main
     * resolves it to a constant URL, so no URL ever crosses this channel.
     */
    link: 'about:link'
  }
} as const

/**
 * A failure crossing IPC. Deliberately just two strings: a stack trace or an
 * absolute path would leak Main-process internals into the renderer
 * (ARCHITECTURE.md §9).
 */
export interface IpcError {
  readonly code: string
  readonly message: string
}

export const IPC_ERROR_CODES = {
  invalidRequest: 'INVALID_REQUEST',
  internal: 'INTERNAL_ERROR'
} as const

/**
 * Upper bound on terminal dimensions. A resize is a trusted-looking number
 * arriving from the renderer; an unbounded one reaches `node-pty` and the OS.
 */
export const MAX_TERMINAL_DIMENSION = 1000

export interface TerminalWritePayload {
  readonly sessionId: string
  readonly data: string
}

export interface TerminalResizePayload {
  readonly sessionId: string
  readonly cols: number
  readonly rows: number
}

export interface TerminalKillPayload {
  readonly sessionId: string
}
