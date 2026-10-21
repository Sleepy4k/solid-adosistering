import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

type PopoverProps = {
  open: boolean;
  anchorRef: () => HTMLElement | undefined;
  onClose: () => void;
  align?: "start" | "end";
  /** Preferred panel width in px, clamped to the viewport. */
  width?: number;
  /** Preferred panel max height in px, clamped to the available viewport space. */
  maxHeight?: number;
  panelClass?: string;
  role?: string;
  children: JSX.Element;
};

const GAP = 4;
const GUTTER = 8;
const Z_INDEX = 110;
const DEFAULT_WIDTH = 320;
const DEFAULT_MAX_HEIGHT = 420;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Placement = { left: number; top: number; width: number; maxHeight: number };

function viewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

function visibleFocusables(root: HTMLElement | undefined) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

/**
 * Body-level, fixed-positioned popover layer. Rendering through a portal keeps the panel
 * outside ancestor stacking contexts and scroll containers, so it is never clipped by cards
 * or allowed to inflate a modal's `scrollHeight`.
 */
export function Popover(props: PopoverProps) {
  let panelRef: HTMLDivElement | undefined;
  let frame = 0;
  let resizeObserver: ResizeObserver | undefined;
  let lastContentHeight = -1;
  const [placement, setPlacement] = createSignal<Placement | null>(null);

  const initialWidth = () => {
    const preferred = props.width ?? DEFAULT_WIDTH;
    if (typeof document === "undefined") return preferred;
    return Math.max(1, Math.min(preferred, viewportSize().width - GUTTER * 2));
  };

  const updatePosition = () => {
    if (typeof window === "undefined") return;
    const panel = panelRef;
    const anchor = props.anchorRef();
    if (!panel || !anchor || !anchor.isConnected) return;

    const viewport = viewportSize();
    const anchorRect = anchor.getBoundingClientRect();
    const preferredWidth = props.width ?? DEFAULT_WIDTH;
    const preferredMaxHeight = props.maxHeight ?? DEFAULT_MAX_HEIGHT;

    // Keep 8px gutters on both sides; on a 320px viewport a 320px panel becomes 304px.
    const width = Math.max(1, Math.min(preferredWidth, viewport.width - GUTTER * 2));
    const widthCss = `${width}px`;
    // Guarded writes keep the ResizeObserver from reacting to values we already applied.
    if (panel.style.width !== widthCss) panel.style.width = widthCss;
    const naturalHeight = panel.scrollHeight;

    const spaceBelow = viewport.height - anchorRect.bottom - GAP - GUTTER;
    const spaceAbove = anchorRect.top - GAP - GUTTER;
    const placeAbove = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
    const available = Math.max(0, placeAbove ? spaceAbove : spaceBelow);
    const maxHeight = Math.max(1, Math.min(preferredMaxHeight, available, viewport.height - GUTTER * 2));
    const height = Math.min(naturalHeight, maxHeight);
    const roundedMaxHeight = Math.floor(maxHeight);
    const maxHeightCss = `${roundedMaxHeight}px`;
    if (panel.style.maxHeight !== maxHeightCss) panel.style.maxHeight = maxHeightCss;

    const rawTop = placeAbove ? anchorRect.top - GAP - height : anchorRect.bottom + GAP;
    const maxTop = Math.max(GUTTER, viewport.height - height - GUTTER);
    const top = Math.min(Math.max(rawTop, GUTTER), maxTop);

    const rawLeft = props.align === "end" ? anchorRect.right - width : anchorRect.left;
    const maxLeft = Math.max(GUTTER, viewport.width - width - GUTTER);
    const left = Math.min(Math.max(rawLeft, GUTTER), maxLeft);

    const next: Placement = {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      maxHeight: roundedMaxHeight,
    };
    const current = placement();
    if (
      !current ||
      current.left !== next.left ||
      current.top !== next.top ||
      current.width !== next.width ||
      current.maxHeight !== next.maxHeight
    ) {
      setPlacement(next);
    }

    // Snapshot after the width/max-height writes so self-induced resizes are recognized as
    // such by the observer, while genuine content height changes still re-anchor the panel.
    lastContentHeight = panel.scrollHeight;
  };

  const schedulePosition = () => {
    if (typeof window === "undefined") return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      updatePosition();
    });
  };

  const disconnectResizeObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
  };

  const panelStyle = (): JSX.CSSProperties => {
    const current = placement();
    return {
      position: "fixed",
      "z-index": Z_INDEX,
      left: `${current?.left ?? 0}px`,
      top: `${current?.top ?? 0}px`,
      width: `${current?.width ?? initialWidth()}px`,
      "max-height": `${current?.maxHeight ?? props.maxHeight ?? DEFAULT_MAX_HEIGHT}px`,
      // Hidden until the first measurement so the panel never flashes at 0,0.
      visibility: current ? "visible" : "hidden",
    };
  };

  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (!isOpen || typeof document === "undefined") {
          setPlacement(null);
          return;
        }

        // Measure synchronously when the portal is already mounted: the panel starts
        // visibility:hidden, and consumers (e.g. SelectSearch) may focus panel content on a
        // short timer. Waiting for rAF can make that focus target a hidden node.
        if (panelRef?.isConnected) updatePosition();
        schedulePosition();

        const handlePointerDown = (event: PointerEvent) => {
          const panel = panelRef;
          const anchor = props.anchorRef();
          if (!panel || !anchor) return;

          // composedPath keeps the trigger and panel (including month arrows, options and
          // the search input) inside the popover, so interacting with them never dismisses it.
          const path = event.composedPath();
          if (path.includes(panel) || path.includes(anchor)) return;

          const target = event.target;
          if (target instanceof Node && (panel.contains(target) || anchor.contains(target))) return;

          props.onClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            const anchor = props.anchorRef();
            const first = visibleFocusables(anchor)[0] ?? anchor;
            first?.focus();
            props.onClose();
            return;
          }

          if (event.key !== "Tab") return;

          const panel = panelRef;
          if (!panel) return;

          const items = visibleFocusables(panel);
          // No focusables: leave native Tab behavior alone.
          if (items.length === 0) return;

          const active = document.activeElement;
          const insidePanel = active instanceof Node && panel.contains(active);
          const anchor = props.anchorRef();
          const insideAnchor = active instanceof Node && !!anchor && anchor.contains(active);
          if (!insidePanel && !insideAnchor) return;

          const first = items[0]!;
          const last = items[items.length - 1]!;

          // Keep ModalFrame's document-level Tab trap from stealing focus from the panel.
          event.stopPropagation();

          if (insideAnchor) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
          }

          if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          }
        };

        const handleScroll = (event: Event) => {
          const panel = panelRef;
          // Scrolling inside the panel does not move the anchor.
          if (panel && event.target instanceof Node && panel.contains(event.target)) return;
          schedulePosition();
        };

        const handleResize = () => schedulePosition();

        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleKeyDown, true);
        document.addEventListener("scroll", handleScroll, true);
        window.addEventListener("resize", handleResize);

        onCleanup(() => {
          disconnectResizeObserver();
          lastContentHeight = -1;

          document.removeEventListener("pointerdown", handlePointerDown, true);
          document.removeEventListener("keydown", handleKeyDown, true);
          document.removeEventListener("scroll", handleScroll, true);
          window.removeEventListener("resize", handleResize);
          if (frame) cancelAnimationFrame(frame);
          frame = 0;

          const panel = panelRef;
          const anchor = props.anchorRef();
          panelRef = undefined;

          // Selecting an option removes the focused panel node. Hand focus back to the
          // trigger, but never steal it from an element the user just clicked outside.
          if (panel && anchor?.isConnected) {
            const active = document.activeElement;
            const lostFocus =
              active === null || active === document.body || (active instanceof Node && panel.contains(active));
            if (lostFocus) {
              const first = visibleFocusables(anchor)[0] ?? anchor;
              first.focus();
            }
          }

          setPlacement(null);
        });
      },
    ),
  );

  return (
    <Show when={props.open}>
      <Portal>
        <div
          ref={(element) => {
            disconnectResizeObserver();
            panelRef = element;
            lastContentHeight = element.scrollHeight;

            if (typeof ResizeObserver !== "undefined") {
              resizeObserver = new ResizeObserver(() => {
                const panel = panelRef;
                if (!panel?.isConnected) return;

                const contentHeight = panel.scrollHeight;
                // Filtering lists, switching the year view, or restoring a retained query
                // changes scrollHeight without another open/scroll/resize event.
                if (contentHeight === lastContentHeight) return;

                lastContentHeight = contentHeight;
                schedulePosition();
              });
              resizeObserver.observe(element);
            }

            schedulePosition();
          }}
          data-popover-layer="true"
          role={props.role as JSX.HTMLAttributes<HTMLDivElement>["role"]}
          class={props.panelClass}
          style={panelStyle()}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}
