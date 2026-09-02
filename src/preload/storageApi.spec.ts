import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/contracts/ipc'

const invoked: Array<{ channel: string; payload: unknown }> = []
let invokeResult: unknown = { ok: true, value: null }

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (channel: string, payload: unknown) => {
      invoked.push({ channel, payload })
      return Promise.resolve(invokeResult)
    }
  }
}))

const { storageApi } = await import('./storageApi')

beforeEach(() => {
  invoked.length = 0
  invokeResult = { ok: true, value: null }
})

describe('bridge shape', () => {
  it('exposes exactly dataFolder and chooseDataFolder', () => {
    expect(Object.keys(storageApi).sort()).toEqual(['chooseDataFolder', 'dataFolder'])
  })

  it('exposes no member through which a path could travel', () => {
    for (const name of ['setDataFolder', 'move', 'write', 'read', 'ipcRenderer']) {
      expect(storageApi).not.toHaveProperty(name)
    }
  })
})

describe('request/response members', () => {
  it('dataFolder invokes its channel with no payload', async () => {
    await storageApi.dataFolder()

    expect(invoked).toEqual([{ channel: IPC.storage.info, payload: undefined }])
  })

  it('chooseDataFolder invokes its channel with no payload — no path crosses', async () => {
    await storageApi.chooseDataFolder()

    expect(invoked).toEqual([{ channel: IPC.storage.choose, payload: undefined }])
  })
})
