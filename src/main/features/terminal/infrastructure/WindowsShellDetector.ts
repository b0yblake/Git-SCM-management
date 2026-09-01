import { existsSync } from 'node:fs'
import type { Logger } from '@main/bootstrap/logger'
import type { ShellProfile, ShellProfileId } from '../domain/ShellProfile'

/** Answers "is there an executable here?". Injected so tests need no real shell. */
export type PathProbe = (path: string) => boolean

export interface DetectShellProfilesOptions {
  readonly probe: PathProbe
  readonly env: Readonly<Record<string, string | undefined>>
  readonly logger: Logger
}

interface Candidate {
  readonly id: ShellProfileId
  readonly label: string
  readonly args: readonly string[]
  /** Standard install locations, most preferred first. */
  locations(env: Readonly<Record<string, string | undefined>>): string[]
}

const join = (...parts: (string | undefined)[]): string | null =>
  parts.some((part) => !part) ? null : parts.join('\\')

const present = (paths: (string | null)[]): string[] => paths.filter((p): p is string => p !== null)

/**
 * Ordered as the picker should present them: this is a Git-oriented tool, so
 * Git Bash leads. The order is fixed rather than discovery-dependent, so the
 * menu does not reshuffle between launches.
 */
const CANDIDATES: readonly Candidate[] = [
  {
    id: 'git-bash',
    label: 'Git Bash',
    args: ['--login', '-i'],
    locations: (env) =>
      present([
        join(env['ProgramFiles'], 'Git', 'bin', 'bash.exe'),
        join(env['ProgramFiles(x86)'], 'Git', 'bin', 'bash.exe'),
        join(env['LOCALAPPDATA'], 'Programs', 'Git', 'bin', 'bash.exe')
      ])
  },
  {
    id: 'powershell',
    label: 'Windows PowerShell',
    args: ['-NoLogo'],
    locations: (env) =>
      present([join(env['SystemRoot'], 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')])
  },
  {
    id: 'pwsh',
    label: 'PowerShell 7',
    args: ['-NoLogo'],
    locations: (env) =>
      present([
        join(env['ProgramFiles'], 'PowerShell', '7', 'pwsh.exe'),
        join(env['LOCALAPPDATA'], 'Microsoft', 'WindowsApps', 'pwsh.exe')
      ])
  },
  {
    id: 'cmd',
    label: 'Command Prompt',
    args: [],
    locations: (env) => present([join(env['SystemRoot'], 'System32', 'cmd.exe')])
  },
  {
    id: 'wsl',
    label: 'WSL',
    args: [],
    locations: (env) => present([join(env['SystemRoot'], 'System32', 'wsl.exe')])
  }
]

/**
 * Reports which of the known shells are actually installed.
 *
 * A shell that is missing is simply absent from the result — not an error. One
 * candidate failing to probe must not lose the others, so each is guarded.
 */
export const detectShellProfiles = ({
  probe,
  env,
  logger
}: DetectShellProfilesOptions): ShellProfile[] => {
  const found: ShellProfile[] = []

  for (const candidate of CANDIDATES) {
    let file: string | undefined
    try {
      file = candidate.locations(env).find((path) => probe(path))
    } catch (error) {
      logger.warn('shell detection failed for a profile', { shellProfileId: candidate.id, error })
      continue
    }

    if (!file) {
      logger.debug('shell profile not installed', { shellProfileId: candidate.id })
      continue
    }

    found.push({ id: candidate.id, label: candidate.label, file, args: candidate.args })
  }

  logger.info('shell detection complete', { available: found.map((profile) => profile.id) })
  return found
}

export const detectInstalledShellProfiles = (logger: Logger): ShellProfile[] =>
  detectShellProfiles({ probe: existsSync, env: process.env, logger })
