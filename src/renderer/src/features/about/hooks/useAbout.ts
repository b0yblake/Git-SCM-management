import { useEffect } from 'react'
import type { AppLinkId } from '@shared/contracts/about'
import { useAboutStore } from '../store/aboutStore'

/**
 * The only place in the renderer's About feature that talks to
 * `window.gitdeck`. The dialog below stays presentational.
 */

/** Subscribes to the native Help → About signal for as long as it is mounted. */
export const useAboutOpenRequest = (): void => {
  useEffect(() => window.gitdeck.about.onOpen(() => useAboutStore.getState().open()), [])
}

/**
 * Asks Main to open one project link. Fire-and-forget: the browser opening is
 * not something the dialog can do anything about, and Main logs a failure.
 */
export const openAppLink = (link: AppLinkId): void => {
  void window.gitdeck.about.openLink(link)
}
