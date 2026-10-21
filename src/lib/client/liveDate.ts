import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

/**
 * Wall-clock tick for client-side freshness checks. Starts on mount so no
 * interval is created during SSR. One tick per caller is intentional: the
 * dashboard mounts only a handful of cards, and each owns its own lifecycle.
 */
export function useNow(intervalMs = 30_000): Accessor<number> {
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    onCleanup(() => clearInterval(timer));
  });

  return now;
}

export function useLiveDate() {
  const [date, setDate] = createSignal(new Date());

  onMount(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        setDate(new Date());
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    onCleanup(() => clearTimeout(timer));
  });

  return date;
}
