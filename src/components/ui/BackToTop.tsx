import { ArrowUp } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

/** Scroll position under which a dismissed button is armed again. */
const REARM_BELOW_PX = 100;

/**
 * Floating button that returns to the top of the page.
 *
 * - Rendered in a portal on `<body>`: `position: fixed` is relative to the
 *   viewport only when no ancestor has a transform/animation, and page content
 *   here is animated, which would pin the button to the bottom of the content
 *   (visible only while the list end is on screen).
 * - Shown only when `enabled` and the user has scrolled past `threshold` px.
 * - After a click it stays hidden until the user returns near the top and then
 *   scrolls down past the threshold again.
 * - Scroll updates are passive and at most once per frame.
 */
export function BackToTop(props: { threshold?: number; enabled?: boolean }) {
  const [pastThreshold, setPastThreshold] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);

  onMount(() => {
    const threshold = props.threshold ?? 480;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setPastThreshold(y > threshold);
      if (y <= REARM_BELOW_PX) setDismissed(false);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    });
  });

  const visible = () => (props.enabled ?? true) && pastThreshold() && !dismissed();

  const toTop = () => {
    setDismissed(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <Portal>
      <Show when={visible()}>
        <button
          type="button"
          aria-label="Kembali ke atas"
          title="Kembali ke atas"
          onClick={toTop}
          class="btn-3d-green fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg sm:bottom-8 sm:right-8"
        >
          <ArrowUp size={22} />
        </button>
      </Show>
    </Portal>
  );
}
