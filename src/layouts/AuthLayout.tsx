import { createSignal, onMount, type JSX } from "solid-js";

const backgroundLoaders = [
  () => import("~/assets/images/bg-login-1.webp"),
  () => import("~/assets/images/bg-login-2.webp"),
  () => import("~/assets/images/bg-login-3.webp"),
];

export function AuthLayout(props: { children: JSX.Element }) {
  const [background, setBackground] = createSignal<string>("");

  onMount(async () => {
    const loader = backgroundLoaders[Math.floor(Math.random() * backgroundLoaders.length)] ?? backgroundLoaders[0];
    const module = await loader();
    setBackground(module.default);
  });

  return (
    <main
      class="grid min-h-dvh place-items-center bg-[#edf3ea] bg-cover bg-center px-4 pt-safe pb-safe"
      style={{
        "background-image": background()
          ? `linear-gradient(135deg, rgba(24,109,60,0.20), rgba(255,255,255,0.52)), url("${background()}")`
          : "linear-gradient(135deg, rgba(24,109,60,0.20), rgba(255,255,255,0.52))",
      }}
    >
      <div class="grid w-full place-items-center py-4">{props.children}</div>
    </main>
  );
}
