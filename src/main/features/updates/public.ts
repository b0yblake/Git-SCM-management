// Public surface of the updates feature (ARCHITECTURE.md §4).
import type { Logger } from '@main/bootstrap/logger'
import { UpdateService, type UpdateServiceOptions } from './application/UpdateService'
import { createGitHubReleaseClient } from './infrastructure/GitHubReleaseClient'

/** Wires the feature so the composition root never sees the HTTP choice. */
export const createUpdateService = (
  logger: Logger,
  options: Omit<UpdateServiceOptions, 'client' | 'logger'>
): UpdateService => new UpdateService({ ...options, client: createGitHubReleaseClient(), logger })

export { UpdateService }
export { registerUpdatesIpc, type UpdatesIpcDependencies } from './ipc/updatesIpc'
export type { UpdateCheckResult, UpdateInfo } from './domain/UpdateInfo'
