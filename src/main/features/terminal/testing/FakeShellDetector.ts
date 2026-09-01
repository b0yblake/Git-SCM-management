import { createShellRegistry } from '../infrastructure/shellProfiles'
import type { ShellProfile, ShellProfileId, ShellRegistry } from '../domain/ShellProfile'

const LABELS: Record<ShellProfileId, string> = {
  'git-bash': 'Git Bash',
  powershell: 'Windows PowerShell',
  pwsh: 'PowerShell 7',
  cmd: 'Command Prompt',
  wsl: 'WSL'
}

export const fakeShellProfile = (id: ShellProfileId): ShellProfile => ({
  id,
  label: LABELS[id],
  file: `C:/fake/${id}.exe`,
  args: []
})

/** A registry holding exactly the profiles a test says are installed. */
export const fakeShellRegistry = (...ids: ShellProfileId[]): ShellRegistry =>
  createShellRegistry(ids.map(fakeShellProfile))
