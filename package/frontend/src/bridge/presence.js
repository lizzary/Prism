// Time spent in Prism, for the activity record: about once a minute the page tells the data layer how long it has been
// in use since the last time — while it is on screen and someone has touched it within the last few minutes (a
// slideshow left running in an empty room is not time spent). Hidden time is never counted.
import { useEffect } from 'react';
import * as api from '../data/api/index.js';

const BEAT_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const INPUT = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

/** Start the clock (once, in the app shell). */
export function usePresenceClock() {
  useEffect(() => {
    let last = Date.now();
    let input = Date.now();
    const touched = () => { input = Date.now(); };
    const beat = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && now - input < IDLE_MS) api.stats.present((now - last) / 1000);
      last = now;
    };
    // hidden: what was spent until now counts; shown again: counting starts afresh
    const onVisibility = () => { if (document.visibilityState === 'hidden') beat(); else last = Date.now(); };
    for (const e of INPUT) window.addEventListener(e, touched, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    const id = setInterval(beat, BEAT_MS);
    return () => {
      clearInterval(id);
      for (const e of INPUT) window.removeEventListener(e, touched, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
