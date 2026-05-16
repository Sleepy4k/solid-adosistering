import type { JSX } from "solid-js";
import { createContext, createSignal, Show, useContext } from "solid-js";

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

  const confirm = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve }));

  const close = (v: boolean) => {
    pending()?.resolve(v);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {props.children}
      <Show when={pending()}>
        {(d) => (
          <div
            class="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && close(false)}
          >
            <section
              class="w-full max-w-md scale-100 rounded-2xl bg-white p-6 shadow-2xl"
              style={{ animation: "modal-in 200ms ease" }}
            >
              <h2 class="text-lg font-semibold text-slate-950">{d().title}</h2>
              <p class="mt-2 text-sm leading-6 text-slate-500">{d().message}</p>
              <div class="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => close(false)}
                >
                  {d().cancelLabel ?? "Batal"}
                </button>
                <button
                  type="button"
                  class={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                    d().tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
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
