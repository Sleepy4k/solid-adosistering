import { ArrowUp } from "lucide-solid";
import { createSignal, onCleanup, onMount, Show } from "solid-js";

/**
 * Floating button that returns to the top of the page. Appears after the user
 * has scrolled `threshold` pixels. Listens passively and updates at most once
 * per frame so long infinite lists stay smooth.
 */
export function BackToTop(props: { threshold?: number }) {
  const [visible, setVisible] = createSignal(false);

  onMount(() => {
    const threshold = props.threshold ?? 480;
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(window.scrollY > threshold);
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

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
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
  );
}
