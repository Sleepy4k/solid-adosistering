export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
  flush: (...args: Args) => void;
};

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delay = 300): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  debounced.flush = (...args: Args) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    fn(...args);
  };

  return debounced;
}
