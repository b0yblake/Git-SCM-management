import { spawn } from 'node-pty'
import type { CreatePtyOptions, PtyFactory, PtyProcess } from '../domain/PtyProcess'
import type { ShellRegistry } from '../domain/ShellProfile'

/**
 * The only module in the application allowed to touch `node-pty`.
 *
 * `env` is deliberately not passed: node-pty then inherits the Main process
 * environment, so no code here has to handle — or risk logging — the full
 * environment (ARCHITECTURE.md §10).
 */
export class NodePtyAdapter implements PtyFactory {
  readonly #shells: ShellRegistry

  constructor(shells: ShellRegistry) {
    this.#shells = shells
  }

  create(options: CreatePtyOptions): PtyProcess {
    const { file, args } = this.#shells.resolve(options.shellProfileId)

    const process = spawn(file, [...args], {
      name: 'xterm-color',
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows
    })

    return {
      write: (data) => {
        process.write(data)
      },
      resize: (cols, rows) => {
        process.resize(cols, rows)
      },
      kill: () => {
        process.kill()
      },
      onData: (callback) => {
        const subscription = process.onData(callback)
        return () => {
          subscription.dispose()
        }
      },
      onExit: (callback) => {
        const subscription = process.onExit(({ exitCode }) => {
          callback(exitCode)
        })
        return () => {
          subscription.dispose()
        }
      }
    }
  }
}
