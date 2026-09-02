/**
 * Data-folder contracts (Phase 17).
 *
 * The renderer only ever *receives* these. Choosing a folder goes through the
 * native picker owned by Main — there is deliberately no type here through
 * which a filesystem path could travel renderer → Main.
 */
export interface DataFolderInfo {
  /** Where data is being read from and written to in this run. */
  readonly current: string
  /** Electron's default userData directory for GitDeck. */
  readonly defaultRoot: string
  readonly isCustom: boolean
  /** Folder chosen this run; data lives there from the next launch on. */
  readonly pending: string | null
}
