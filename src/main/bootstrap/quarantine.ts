import { renameSync } from 'node:fs'
import type { Logger } from './logger'

/**
 * Moves an unreadable store file aside as `<name>.corrupt-<timestamp>`
 * (Phase 14).
 *
 * Before this existed, a corrupt file was silently shadowed by defaults on
 * every launch, forever. Renaming it preserves the user's bytes for
 * inspection, stops the repeated warning noise (the next read is a normal
 * ENOENT), and guarantees the broken content is never overwritten by the next
 * save.
 *
 * Best-effort on purpose: a rename can fail on Windows while another process
 * holds the file. Startup must not care — the caller proceeds with defaults
 * either way.
 */
export const quarantineFile = (path: string, logger: Logger): void => {
  const target = `${path}.corrupt-${Date.now()}`
  try {
    renameSync(path, target)
    // Info, not warn: the caller already warned about the unreadable file, and
    // one broken file should cost one warning, not two.
    logger.info('quarantined unreadable file', { path, target })
  } catch (error) {
    logger.warn('failed to quarantine unreadable file', { path, error })
  }
}
