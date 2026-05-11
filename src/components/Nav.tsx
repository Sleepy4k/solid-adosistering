import { A, useLocation } from "@solidjs/router";
import { useConfirm } from "./ConfirmProvider";
import { useToast } from "./ToastProvider";

export default function Nav() {
  const location = useLocation();
  const confirm = useConfirm();
  const { notify } = useToast();
  const active = (path: string) =>
    path == location.pathname ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70";
  const logout = async () => {
    const accepted = await confirm({
      title: "Logout dari dashboard?",
      message: "Sesi aktif akan dihentikan pada perangkat ini.",
      confirmLabel: "Logout",
    });
    if (accepted)
      notify({
        kind: "success",
        title: "Logout confirmed",
        message: "Server action logout siap dihubungkan ke session store.",
      });
  };

  return (
    <nav class="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <A href="/" class="flex items-center gap-3">
          <span class="grid h-9 w-9 place-items-center rounded-md bg-emerald-600 text-sm font-bold text-white">A</span>
          <span>
            <span class="block text-sm font-bold leading-4 text-slate-950">Adosistering</span>
            <span class="block text-xs text-slate-500">IoT Irrigation</span>
          </span>
        </A>
        <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
          <A href="/" class={`rounded-md px-3 py-2 ${active("/")}`}>
            Beranda
          </A>
          <A href="/regions" class={`rounded-md px-3 py-2 ${active("/regions")}`}>
            Region
          </A>
          <A href="/users" class={`rounded-md px-3 py-2 ${active("/users")}`}>
            Akun
          </A>
          <A href="/history" class={`rounded-md px-3 py-2 ${active("/history")}`}>
            Riwayat
          </A>
          <button
            type="button"
            class="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
