/**
 * The project links the About dialog offers.
 *
 * The table is shared so the renderer can *show* a link and Main can *open*
 * the same one from the same constant — but the URL itself never crosses IPC.
 * The About link channel carries one of these keys, and Main resolves it
 * here. That is the standing rule from ARCHITECTURE.md §6: no channel accepts
 * a URL, so nothing the renderer sends can reach the user's browser.
 */
const REPOSITORY = 'https://github.com/b0yblake/Git-SCM-management'

export const APP_LINKS = {
  repository: { label: 'Source code', url: REPOSITORY },
  releases: { label: 'Releases', url: `${REPOSITORY}/releases` },
  security: { label: 'Report a security issue', url: `${REPOSITORY}/security/advisories/new` }
} as const

export type AppLinkId = keyof typeof APP_LINKS

/** In display order — the About dialog renders exactly these. */
export const APP_LINK_IDS = Object.keys(APP_LINKS) as readonly AppLinkId[]

/**
 * `Object.hasOwn` rather than `in`: `'constructor' in APP_LINKS` is true, and
 * a key that resolves through the prototype chain must not name a link.
 */
export const isAppLinkId = (value: unknown): value is AppLinkId =>
  typeof value === 'string' && Object.hasOwn(APP_LINKS, value)

/** The whole payload of the About link channel. A key, never a URL. */
export interface AboutOpenLinkPayload {
  readonly link: AppLinkId
}
