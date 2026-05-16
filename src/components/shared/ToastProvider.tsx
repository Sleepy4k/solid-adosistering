import type { JSX } from "solid-js";
import { createContext, createSignal, For, onCleanup, useContext } from "solid-js";

type ToastKind = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  exiting?: boolean;
};

type ToastContextValue = {
  notify: (toast: Omit<Toast, "id" | "exiting">) => void;
};

const ToastContext = createContext<ToastContextValue>();

const styles: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-rose-200 bg-rose-50 text-rose-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

const icons: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
};

const iconBg: Record<ToastKind, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-sky-500",
  warning: "bg-amber-500",
};

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const dismiss = (id: number) => {
    setToasts((items) => items.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((items) => items.filter((t) => t.id !== id)), 300);
  };

  const notify = (toast: Omit<Toast, "id" | "exiting">) => {
    const id = Date.now();
    setToasts((items) => [...items, { ...toast, id }]);
    const timer = window.setTimeout(() => dismiss(id), 5000);
    onCleanup(() => clearTimeout(timer));
  };

  return (
    <ToastContext.Provider value={{ notify }}>
      {props.children}
      <div class="fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <For each={toasts()}>
          {(toast) => (
            <div
              class={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all duration-300 ${styles[toast.kind]} ${
                toast.exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"
              }`}
              style={{ animation: toast.exiting ? undefined : "slide-in-right 250ms ease" }}
            >
              <span
                class={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${iconBg[toast.kind]}`}
              >
                {icons[toast.kind]}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold leading-5">{toast.title}</p>
                {toast.message && <p class="mt-0.5 text-xs leading-5 opacity-80">{toast.message}</p>}
              </div>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-xs opacity-60 hover:opacity-100"
                onClick={() => dismiss(toast.id)}
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </div>
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
