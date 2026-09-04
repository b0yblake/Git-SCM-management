import { openAppLink, useAboutOpenRequest } from '../hooks/useAbout'
import { useAboutStore } from '../store/aboutStore'
import { AboutModal } from './AboutModal'

/**
 * Wires the About feature: subscribes to the native Help → About signal and
 * hands the presentational dialog its version and callbacks.
 *
 * Mounted permanently by the app shell — the subscription must exist before
 * the dialog does — and because one host renders at most one dialog, a second
 * open signal can only re-open, never stack.
 */
export const AboutHost = (): React.JSX.Element | null => {
  useAboutOpenRequest()

  const isOpen = useAboutStore((state) => state.isOpen)

  if (!isOpen) return null

  return (
    <AboutModal
      version={__APP_VERSION__}
      onOpenLink={openAppLink}
      onClose={() => useAboutStore.getState().close()}
    />
  )
}
