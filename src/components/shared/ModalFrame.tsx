import type { JSX } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

type ModalFrameProps = {
  children: JSX.Element;
  onClose: () => void;
  panelClass?: string;
  /** Optional id of the element that labels the dialog (usually an `h2`). */
  titleId?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalFrame(props: ModalFrameProps) {
  let panelRef: HTMLElement | undefined;
  let previouslyFocused: HTMLElement | null = null;

  const focusableElements = () =>
    Array.from(panelRef?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
      (element) => element.getClientRects().length > 0,
    );

  onMount(() => {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Popover panels are portaled outside the dialog. Back up the Popover capture handler:
      // Escape/Tab inside a panel must never close the modal or move its focus.
      if (event.target instanceof Element && event.target.closest('[data-popover-layer="true"]')) return;

      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusableElements();
      if (items.length === 0) {
        event.preventDefault();
        panelRef?.focus();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef || !panelRef?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    });
  });

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[100] flex min-h-dvh items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/40 p-4 sm:items-center sm:py-6"
        onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}
      >
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={props.titleId ? undefined : "Dialog"}
          aria-labelledby={props.titleId}
          tabindex="-1"
          class={`max-h-[calc(100dvh-2rem)] w-full overflow-x-hidden overflow-y-auto rounded-2xl bg-white shadow-2xl outline-none ${props.panelClass ?? "max-w-lg p-6"}`}
          style={{ animation: "modal-in 200ms ease" }}
        >
          {props.children}
        </section>
      </div>
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          section[role="dialog"] { animation: none !important; }
        }
      `}</style>
    </Portal>
  );
}
