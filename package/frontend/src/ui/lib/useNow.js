import { useEffect, useState } from 'react';

/** The time now, renewed every `ms` — so "26 hours ago" stays true while nothing else changes. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
