// A file about to be opened from another page (the home page's last viewed, a random one): its group's page and the
// picture its lightbox opens on are fetched ahead, so the page change starts as soon as it is asked for and the picture
// is there, decoded, to travel into the lightbox.
import { mediaUrl, preloadGroupPage } from '../../bridge/index.js';

/**
 * → the address of the picture the lightbox opens on (at its page's quality; a video's poster) once it is decoded;
 * null if it is not to be had
 */
export async function prepareFile(groupId, file) {
  try {
    const data = await preloadGroupPage(groupId);
    const url = mediaUrl(file, file.kind === 'video' ? 'original' : data?.view?.quality ?? 'medium');
    if (!url) return null;
    const img = new Image();
    img.src = url;
    await img.decode();
    return url;
  } catch {
    return null;
  }
}
