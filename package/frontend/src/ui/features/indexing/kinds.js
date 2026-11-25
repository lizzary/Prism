// The three kinds of a file's index as the UI draws them: each in the colour of one ray of the Prism mark — tags gold,
// image index rose, metadata cobalt — the order the reindex dialog, the tasks and the index page all use.
export const KIND_ICON = { tagging: 'tag', embedding: 'image-search', metadata: 'info' };
/** On paper (a shade deeper) and in the dark theme (the mark's own), through the theme's tokens. */
export const KIND_RAY = { tagging: 'var(--ray-tag)', embedding: 'var(--ray-look)', metadata: 'var(--ray-meta)' };
/** On the index page's night sky: always the mark's own colours. */
export const NIGHT_RAY = { tagging: '#e9c460', embedding: '#dc8f84', metadata: '#86a5da' };
