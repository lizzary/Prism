// The colours a colour group can take: soft, mid-tone paints that sit gently on both the day and the night page.
export const SWATCHES = [
  '#d4878a', '#dd9474', '#d9a54e', '#c4ad7c', '#8eab73', '#86a48f',
  '#5f9e9a', '#78a6cf', '#6c88c8', '#9a8ac6', '#b07aa6', '#8893a5',
];

/** The first colour not used yet (or the next one round), for a new colour group. */
export function nextSwatch(used) {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return SWATCHES.find((c) => !taken.has(c)) ?? SWATCHES[used.length % SWATCHES.length];
}
