import type { GitDeckApi } from './api'

declare global {
  interface Window {
    readonly gitdeck: GitDeckApi
  }
}

export {}
