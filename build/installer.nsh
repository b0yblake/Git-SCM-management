; GitDeck NSIS additions (Phase 18).
; The app writes its Explorer context-menu entry under HKCU on every packaged
; launch; the uninstaller is the only thing that can remove it, so it must.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\GitDeck"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\GitDeck"
!macroend
