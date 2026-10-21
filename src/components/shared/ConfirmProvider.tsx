import type { JSX } from "solid-js";
import { createContext, createSignal, createUniqueId, Show, useContext } from "solid-js";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void };

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>();

export function ConfirmProvider(props: { children: JSX.Element }) {
  const [pending, setPending] = createSignal<PendingConfirm | null>(null);
  const titleId = createUniqueId();
  let restoreFocus: HTMLElement | null = null;

  const confirm = (opts: ConfirmOptions) => {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise<boolean>((resolve) => setPending({ ...opts, resolve }));
  };

  const close = (v: boolean) => {
    pending()?.resolve(v);
    setPending(null);
    queueMicrotask(() => restoreFocus?.focus());
    restoreFocus = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {props.children}
      <Show when={pending()}>
        {(d) => (
          // Layering: popover portals (110) < confirm dialog (120) < toasts (130).
          <div
            class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4"
            onClick={(e) => e.target === e.currentTarget && close(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              class="max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
              style={{ animation: "modal-in 200ms ease" }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close(false);
                }
              }}
            >
              <h2 id={titleId} class="break-anywhere text-lg font-semibold text-slate-950">
                {d().title}
              </h2>
              <p class="mt-2 break-anywhere text-sm leading-6 text-slate-500">{d().message}</p>
              <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  ref={(element) => queueMicrotask(() => element?.focus())}
                  class="min-h-11 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 sm:w-auto"
                  onClick={() => close(false)}
                >
                  {d().cancelLabel ?? "Batal"}
                </button>
                <button
                  type="button"
                  class={`min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto ${
                    d().tone === "danger"
                      ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500"
                      : "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500"
                  }`}
                  onClick={() => close(true)}
                >
                  {d().confirmLabel ?? "Konfirmasi"}
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>
      <style>{`
        @keyframes modal-in {
          from { transform: scale(0.95); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be inside ConfirmProvider");
  return ctx;
}
