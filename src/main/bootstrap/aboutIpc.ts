import { APP_LINKS, isAppLinkId, type AppLinkId } from '@shared/contracts/about'
import { IPC, IPC_ERROR_CODES, type IpcError } from '@shared/contracts/ipc'
import { Err, Ok, type Result } from '@shared/domain/result'
import type { IpcHandlerRegistry } from './ipcPorts'
import type { Logger } from './logger'

/**
 * The About dialog's one Main-side need: opening a project link.
 *
 * Bootstrap-owned rather than a feature, like the launch arguments and the
 * data root — it is application metadata, not a domain.
 *
 * The renderer sends a key. Main looks the URL up in the shared table and
 * hands *that* to the browser, so a crafted payload can only ever name one of
 * three links or be rejected. There is deliberately no member anywhere on
 * `window.gitdeck` through which a URL could travel.
 */
export interface AboutIpcDependencies {
  readonly registry: IpcHandlerRegistry
  /** `shell.openExternal`, injected so this is testable without Electron. */
  readonly openExternal: (url: string) => Promise<void>
  readonly logger: Logger
}

/** Exactly `{ link }`, naming a known link. Extra fields reject the whole. */
const parseLinkPayload = (payload: unknown): AppLinkId | null => {
  if (typeof payload !== 'object' || payload === null) return null

  const keys = Object.keys(payload)
  if (keys.length !== 1 || keys[0] !== 'link') return null

  const { link } = payload as { link: unknown }
  return isAppLinkId(link) ? link : null
}

export const registerAboutIpc = ({
  registry,
  openExternal,
  logger
}: AboutIpcDependencies): void => {
  registry.handle(IPC.about.link, (payload): Result<null, IpcError> => {
    const link = parseLinkPayload(payload)
    if (link === null) {
      return Err({
        code: IPC_ERROR_CODES.invalidRequest,
        message: 'link takes exactly { link } naming a known project link'
      })
    }

    // The constant, not the payload. Opening the browser is fire-and-forget:
    // a failure there is worth a log line and nothing more.
    openExternal(APP_LINKS[link].url).catch((error: unknown) => {
      logger.warn('failed to open a project link', { link, error })
    })
    return Ok(null)
  })
}
