import { useShellProfiles } from '../../terminal/public'
import { useAppSettings } from '../hooks/useAppSettings'
import { SettingsScreen } from './SettingsScreen'

/** Wires the settings feature; the screen below it stays presentational. */
export const SettingsPanel = (): React.JSX.Element => {
  const { settings, update } = useAppSettings()
  const { profiles } = useShellProfiles()

  return (
    <SettingsScreen
      settings={settings}
      profiles={profiles}
      onChange={(patch) => void update(patch)}
    />
  )
}
