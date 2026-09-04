import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppLinkId } from '@shared/contracts/about'
import type { Unsubscribe } from '@shared/contracts/events'
import { IPC, type IpcError } from '@shared/contracts/ipc'
import type { Result } from '@shared/domain/result'
import type { AboutApi } from './api'

/**
 * The About bridge: opening one known project link, and the native
 * Help → About signal.
 *
 * `openLink` sends a key, never a URL — Main owns the table it resolves to.
 */
export const aboutApi: AboutApi = {
  openLink: (link: AppLinkId): Promise<Result<null, IpcError>> =>
    ipcRenderer.invoke(IPC.about.link, { link }) as Promise<Result<null, IpcError>>,

  onOpen: (callback: () => void): Unsubscribe => {
    const listener = (_event: IpcRendererEvent): void => {
      callback()
    }
    ipcRenderer.on(IPC.about.open, listener)
    return () => {
      ipcRenderer.off(IPC.about.open, listener)
    }
  }
}
