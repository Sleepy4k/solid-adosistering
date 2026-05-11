import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { publicAppConfig } from "~/config/public";
import type { LiveSprayerData } from "~/domain/irrigation";
import { subscribeToSprayer } from "~/lib/firebaseClient";
import { useConfirm } from "./ConfirmProvider";
import NotConfigured from "./NotConfigured";
import { useToast } from "./ToastProvider";

function statusClass(status: string) {
  if (status === "Kering") return "bg-rose-100 text-rose-700 border-rose-200";
  if (status === "Basah") return "bg-sky-100 text-sky-700 border-sky-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export default function LiveMonitoring() {
  const [items, setItems] = createSignal<LiveSprayerData[]>([]);
  const confirm = useConfirm();
  const { notify } = useToast();

  onMount(() => {
    const target = publicAppConfig.defaultTelemetryTarget;
    if (!publicAppConfig.appConfigured || !publicAppConfig.firebaseConfigured || !target) return;

    const unsubscribe = subscribeToSprayer(
      {
        ...target,
        threshold: {
          dryMaxPercent: target.dryMaxPercent,
          wetMinPercent: target.wetMinPercent,
        },
      },
      (data) => setItems([data]),
    );

    onCleanup(unsubscribe);
  });

  const overridePump = async (sprayer: LiveSprayerData) => {
    const accepted = await confirm({
      title: "Override pompa?",
      message: `Ubah ${sprayer.sprayerId} ke manual dan aktifkan relay. Aksi ini tercatat sebagai control override.`,
      confirmLabel: "Override",
      tone: "danger",
    });
    if (!accepted) return;
    notify({
      kind: "info",
      title: "Override belum aktif",
      message: "Hubungkan server action overridePump setelah konfigurasi session dan database aktif.",
    });
  };

  return (
    <section class="rounded-md border border-slate-200 bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-slate-950">Realtime Live Monitoring</h2>
          <p class="text-sm text-slate-500">Firebase RTDB listener untuk moisture dan flow setiap sprayer.</p>
        </div>
        <span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          Live
        </span>
      </div>

      <Show
        when={
          publicAppConfig.appConfigured && publicAppConfig.firebaseConfigured && publicAppConfig.defaultTelemetryTarget
        }
        fallback={
          <div class="p-4">
            <NotConfigured />
          </div>
        }
      >
        <Show
          when={items().length > 0}
          fallback={<p class="p-5 text-sm text-slate-500">Menunggu data realtime dari Firebase RTDB.</p>}
        >
          <div class="grid gap-3 p-4 lg:grid-cols-3">
            <For each={items()}>
              {(sprayer) => (
                <article class="rounded-md border border-slate-200 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-slate-950">{sprayer.sprayerId}</p>
                      <p class="text-xs text-slate-500">
                        {sprayer.regionName} / {sprayer.blockName}
                      </p>
                    </div>
                    <span
                      class={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                        sprayer.moistureStatus,
                      )}`}
                    >
                      {sprayer.moistureStatus}
                    </span>
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p class="text-slate-500">Moisture</p>
                      <p class="text-2xl font-semibold text-slate-950">{sprayer.moisturePercent}%</p>
                    </div>
                    <div>
                      <p class="text-slate-500">Flow</p>
                      <p class="text-2xl font-semibold text-slate-950">{sprayer.flowLmin}</p>
                      <p class="text-xs text-slate-500">L/min</p>
                    </div>
                  </div>
                  <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>{sprayer.mode === 0 ? "Auto" : "Manual"}</span>
                    <span>{sprayer.pumpStatus}</span>
                    <button
                      type="button"
                      class="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
                      onClick={() => overridePump(sprayer)}
                    >
                      Override
                    </button>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}
