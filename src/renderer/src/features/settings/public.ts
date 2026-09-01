// Public surface of the renderer settings feature (ARCHITECTURE.md §4).
export { SettingsPanel } from './components/SettingsPanel'
export { SettingsScreen, type SettingsScreenProps } from './components/SettingsScreen'
export { StartupSettings, type StartupSettingsProps } from './components/StartupSettings'
export { useAppSettings, type AppSettingsController } from './hooks/useAppSettings'
export { useSettingsStore, type SettingsUiState } from './store/settingsStore'
