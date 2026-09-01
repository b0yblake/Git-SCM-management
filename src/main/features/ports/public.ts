// Public surface of the ports feature (ARCHITECTURE.md §4).
// This is the only feature allowed to terminate an OS process, and the only
// thing it accepts from outside Main is an opaque capability it minted itself.
// No terminal, workspace or git feature may depend on it, and it depends on
// none of them.
import type { Logger } from '@main/bootstrap/logger'
import { PortService } from './application/PortService'
import { createWindowsPortAdapter } from './infrastructure/WindowsPortAdapter'

/** Wires the feature so the composition root never sees PowerShell. */
export const createPortService = (logger: Logger, ownPid: number): PortService =>
  new PortService(createWindowsPortAdapter(), logger, { ownPid })

export { PortService }
export { registerPortsIpc, type PortsIpcDependencies } from './ipc/portsIpc'
export type { PortAdapter } from './domain/PortAdapter'
