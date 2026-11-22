import { useOptimistic, useTransition } from 'react';

/**
 * A switch that flips the moment it is pressed, while the change is saved; the saved value takes over once the
 * save is done (and wins if it disagrees).
 */
export function useOptimisticToggle(value, save) {
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(value);
  const toggle = (next) => startTransition(async () => { setShown(next); await save(next); });
  return [shown, toggle];
}
