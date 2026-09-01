import { contextBridge } from 'electron'
import type { GitDeckApi } from './api'
import { gitApi } from './gitApi'
import { portsApi } from './portsApi'
import { settingsApi } from './settingsApi'
import { terminalApi } from './terminalApi'
import { workspaceApi } from './workspaceApi'

const api: GitDeckApi = {
  terminal: terminalApi,
  workspace: workspaceApi,
  git: gitApi,
  settings: settingsApi,
  ports: portsApi
}

// contextIsolation is on, so this is the only channel between the two worlds.
// `ipcRenderer` itself is deliberately never exposed.
contextBridge.exposeInMainWorld('gitdeck', api)
