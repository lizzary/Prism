// Which of a group's covers is on show where the eye is: on its card while the pointer glances through it, or on the
// banner of its page. The card and the banner share a view-transition name, so going from one to the other it is the
// picture on show that travels — the page opens on the cover the card was showing, and the card takes back the one the
// banner showed. One group at a time: the one the user is with.
let current = null;      // { groupId, fileId }

export const coverOnShow = {
  /** The cover `groupId` is showing, unless it is its main one. */
  of: (groupId) => (current?.groupId === groupId ? current.fileId : null),
  /** `groupId` now shows `fileId` (null: its main cover). */
  set(groupId, fileId) { current = fileId ? { groupId, fileId } : null; },
};
