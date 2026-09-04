// Public surface of the renderer About feature (ARCHITECTURE.md §4).
// The app shell mounts the host and opens the dialog from the version badge;
// nothing else needs anything from here.
export { AboutHost } from './components/AboutHost'
export { useAboutStore } from './store/aboutStore'
