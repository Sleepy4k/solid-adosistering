import { createSignal, onMount, type JSX } from "solid-js";
import { finishProgress } from "~/lib/client/progress";

const backgroundLoaders = [
  () => import("~/assets/images/bg-login-1.jpg"),
  () => import("~/assets/images/bg-login-2.jpg"),
  () => import("~/assets/images/bg-login-3.jpg"),
];

export function AuthLayout(props: { children: JSX.Element }) {
  const [background, setBackground] = createSignal<string>("");

  onMount(async () => {
    void finishProgress();
    const loader = backgroundLoaders[Math.floor(Math.random() * backgroundLoaders.length)] ?? backgroundLoaders[0];
    const module = await loader();
    setBackground(module.default);
  });

  return (
    <main
      class="grid h-dvh overflow-hidden bg-[#edf3ea] bg-cover bg-center px-4 py-6"
      style={{
        "background-image": background()
          ? `linear-gradient(135deg, rgba(24,109,60,0.20), rgba(255,255,255,0.52)), url("${background()}")`
          : "linear-gradient(135deg, rgba(24,109,60,0.20), rgba(255,255,255,0.52))",
      }}
    >
      <div class="grid min-h-0 place-items-center overflow-y-auto py-4">{props.children}</div>
    </main>
  );
}
