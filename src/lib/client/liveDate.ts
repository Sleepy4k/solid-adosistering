import { createSignal, onCleanup, onMount } from "solid-js";

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
