// Files: Prism keeps pictures and videos.

/** The image qualities a page can ask for, with the long side each is served at (`original` is the file itself). */
export const QUALITIES = { original: Infinity, high: 1600, medium: 800, low: 400 };

/** What a file is, by its extension, for pickers that would otherwise list every type on its own. */
export const FILE_KINDS = ['image', 'video'];
const VIDEO = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
export const kindOfExt = (ext) => (VIDEO.has(String(ext).toLowerCase()) ? 'video' : 'image');
