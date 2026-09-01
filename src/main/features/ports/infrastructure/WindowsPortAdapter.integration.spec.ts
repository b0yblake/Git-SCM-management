import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, connect, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { PortInspectionTimeoutError } from '../domain/errors'
import { createWindowsPortAdapter } from './WindowsPortAdapter'

/**
 * The real thing: PowerShell enumerates, `taskkill.exe` terminates.
 *
 * Every process this suite inspects or kills is a disposable Node child it
 * spawned itself — the test runner and everything else on the machine are
 * never targets. Enumeration on a cold machine takes seconds, so the
 * timeouts here are generous.
 */

const TIMEOUT = 60_000

/** Children and sockets to reap even when an assertion fails first. */
const children: ChildProcess[] = []
const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill()
  }
})

/** Spawns a Node child that binds a socket and prints its port, then idles. */
const disposableChild = (script: string): Promise<{ child: ChildProcess; port: number }> =>
  new Promise((resolve, reject) => {
    // A test runner's NODE_OPTIONS must not reach the child: injected hooks
    // can prepend output before the port line, or crash the -e script.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[0] !== 'NODE_OPTIONS'
      )
    )
    const child = spawn(process.execPath, ['-e', script], { windowsHide: true, env })
    children.push(child)
    let out = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      const port = out.split('\n').find((line) => /^\d+$/.test(line.trim()))
      if (port) resolve({ child, port: Number(port.trim()) })
    })
    child.on('error', reject)
    child.on('exit', (code) => reject(new Error(`child exited early (${code}): ${out}`)))
    setTimeout(() => reject(new Error(`child never printed a port: ${out}`)), 20_000)
  })

// String, not number: a colour-forcing environment makes Node wrap a logged
// number in ANSI escapes, and the digits regex would never match again.
const TCP_CHILD = `
  const net = require('net')
  const server = net.createServer()
  server.listen(0, '127.0.0.1', () => console.log(String(server.address().port)))
  setInterval(() => {}, 1000)
`

const UDP_CHILD = `
  const dgram = require('dgram')
  const socket = dgram.createSocket('udp4')
  socket.bind(0, '127.0.0.1', () => console.log(String(socket.address().port)))
  setInterval(() => {}, 1000)
`

const waitForExit = (child: ChildProcess): Promise<void> =>
  child.exitCode !== null
    ? Promise.resolve()
    : new Promise((resolve) => child.once('exit', () => resolve()))

const canBind = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server: Server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })

describe.skipIf(process.platform !== 'win32')('against the real operating system', () => {
  it(
    'finds a disposable TCP listener by pid and port, with a readable identity',
    async () => {
      const { child, port } = await disposableChild(TCP_CHILD)

      const inspection = await createWindowsPortAdapter().inspect()

      const owned = inspection.bindings.find(
        (binding) => binding.pid === child.pid && binding.localPort === port
      )
      expect(owned).toMatchObject({ protocol: 'tcp', localAddress: '127.0.0.1' })

      const identity = inspection.processes.find((process) => process.pid === child.pid)
      expect(identity?.name).toBe('node')
      expect(typeof identity?.startedAt).toBe('number')
      expect(typeof identity?.sessionId).toBe('number')
    },
    TIMEOUT
  )

  it(
    'finds a disposable bound UDP endpoint',
    async () => {
      const { child, port } = await disposableChild(UDP_CHILD)

      const inspection = await createWindowsPortAdapter().inspect()

      expect(
        inspection.bindings.find(
          (binding) =>
            binding.pid === child.pid && binding.localPort === port && binding.protocol === 'udp'
        )
      ).toBeDefined()
    },
    TIMEOUT
  )

  it(
    'never reports an established outbound connection',
    async () => {
      const { child, port } = await disposableChild(TCP_CHILD)

      // Give the snapshot an established connection to be tempted by.
      const socket: Socket = await new Promise((resolve, reject) => {
        const s = connect(port, '127.0.0.1', () => resolve(s))
        s.on('error', reject)
      })
      cleanups.push(() => socket.destroy())
      const clientPort = socket.localPort
      expect(clientPort).toBeDefined()

      const inspection = await createWindowsPortAdapter().inspect()

      // The child's listener is there; this test's outbound end is not.
      expect(inspection.bindings.some((b) => b.pid === child.pid && b.localPort === port)).toBe(
        true
      )
      expect(
        inspection.bindings.some(
          (b) => b.pid === process.pid && b.protocol === 'tcp' && b.localPort === clientPort
        )
      ).toBe(false)
    },
    TIMEOUT
  )

  it(
    'terminates only the disposable child, whose port can then be bound again',
    async () => {
      const { child, port } = await disposableChild(TCP_CHILD)
      expect(await canBind(port)).toBe(false)

      const adapter = createWindowsPortAdapter()
      await expect(adapter.terminate(child.pid!)).resolves.toBe('terminated')
      await waitForExit(child)

      // The released port is genuinely reusable — the acceptance criterion.
      await expect.poll(() => canBind(port), { timeout: 15_000 }).toBe(true)
      // A second kill of the dead pid is the harmless race, by real exit code.
      await expect(adapter.terminate(child.pid!)).resolves.toBe('already-exited')
      // And the test runner itself is demonstrably still here.
      expect(process.exitCode ?? 0).toBe(0)
    },
    TIMEOUT
  )

  it(
    'kills an over-long inspection and reports the handled timeout',
    async () => {
      await expect(
        createWindowsPortAdapter({ inspectTimeoutMs: 1 }).inspect()
      ).rejects.toBeInstanceOf(PortInspectionTimeoutError)
    },
    TIMEOUT
  )
})
