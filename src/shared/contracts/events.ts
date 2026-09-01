/**
 * Payload types for Main → renderer push events (ARCHITECTURE.md §6).
 *
 * Everything declared here must survive `structuredClone` — no class instances,
 * no functions, no native Error objects.
 *
 * Populated by the phase that introduces each event:
 *
 *   terminal:data / terminal:exit → Phase 2
 *   ports open event → Phase 12 — carries no payload: it is a request to open
 *   the ports modal, and everything the modal shows is fetched via IPC.ports.list.
 */
export type Unsubscribe = () => void
