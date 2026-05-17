import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

type ModalFrameProps = {
  children: JSX.Element;
  onClose: () => void;
  panelClass?: string;
};

export function ModalFrame(props: ModalFrameProps) {
  return (
    <Portal>
      <div
        class="fixed inset-0 z-[100] flex min-h-dvh items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm sm:items-center"
        onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}
      >
        <section
          class={`w-full rounded-2xl bg-white shadow-2xl ${props.panelClass ?? "max-w-lg p-6"}`}
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
      `}</style>
    </Portal>
  );
}
