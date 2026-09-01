import { ShellNotFoundError } from '../domain/errors'
import type {
  ShellCommand,
  ShellProfile,
  ShellProfileId,
  ShellRegistry
} from '../domain/ShellProfile'

/**
 * Holds the profiles `WindowsShellDetector` found.
 *
 * Phase 1's static table lived here and answered for every id whether or not
 * the shell existed. A registry built from detection answers only for what is
 * installed, which is what makes `ShellNotFoundError` meaningful.
 */
export const createShellRegistry = (profiles: readonly ShellProfile[]): ShellRegistry => {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))

  return {
    available: () => profiles,

    has: (id) => byId.has(id),

    resolve: (id): ShellCommand => {
      const profile = byId.get(id)
      if (!profile) throw new ShellNotFoundError(id)
      return { file: profile.file, args: profile.args }
    }
  }
}

/**
 * The profile to use when the user has expressed no preference, or when their
 * preference is no longer installed.
 */
export const pickDefaultShellProfileId = (
  registry: ShellRegistry,
  preferred: ShellProfileId | null
): ShellProfileId | null => {
  if (preferred && registry.has(preferred)) return preferred
  return registry.available()[0]?.id ?? null
}
