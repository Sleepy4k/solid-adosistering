import { ChevronDown } from "lucide-solid";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardHeader } from "~/components/ui/Card";
import type { MoistureStatus } from "@prisma/client";
import { subscribeToBlock, isFirebaseConfigured } from "~/lib/client/firebaseClient";
import type { LiveSprayerData, Threshold } from "~/lib/shared/irrigation";
import { overridePump } from "~/server/actions/index";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { InlineError } from "~/components/shared/AppErrorBoundary";
import { useToast } from "~/components/shared/ToastProvider";
import { aggregateLive, moistureTone } from "./helpers";
import { SprayerCard, type SprayerMeta } from "./SprayerCard";

export function BlockCard(props: {
  blockName: string;
  regionName: string;
  sprayers: SprayerMeta[];
  threshold?: (Threshold & { landPreference: MoistureStatus }) | null;
  showWindDirection?: boolean;
  showAutoIrrigation?: boolean;
  volumeDivider?: number;
  readOnly?: boolean;
}) {
  const [liveData, setLiveData] = createSignal<LiveSprayerData[]>([]);
  const [connected, setConnected] = createSignal<boolean>(false);
  const [loading, setLoading] = createSignal<boolean>(true);
  const [error, setError] = createSignal<string>("");
  const [expanded, setExpanded] = createSignal<boolean>(true);
  const confirm = useConfirm();
  const { notify } = useToast();

  const sprayerMeta = (hardwareId: string) => props.sprayers.find((sprayer) => sprayer.hardwareId === hardwareId);
  const aggregate = () => aggregateLive(liveData());
  const threshold = () =>
    props.threshold
      ? { ...props.threshold, volumeDivider: props.volumeDivider ?? 1 }
      : {
          dryMaxPercent: 40,
          wetMinPercent: 80,
          displayDryMaxPercent: 40,
          displayMoistMaxPercent: 70,
          displayWetMinPercent: 80,
          landPreference: "LEMBAB" as MoistureStatus,
          volumeDivider: props.volumeDivider ?? 1,
        };
  const moisture = () => moistureTone(aggregate().avgMoisture, threshold());
  const showWind = () => props.showWindDirection ?? true;
  const showAutoIrrig = () => props.showAutoIrrigation ?? true;

  onMount(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setError("Konfigurasi Firebase belum lengkap.");
      return;
    }
    const unsubscribe = subscribeToBlock(
      { regionName: props.regionName, blockName: props.blockName, threshold: threshold() },
      (sprayers) => {
        setLiveData(sprayers);
        setConnected(sprayers.length > 0);
        setLoading(false);
        setError("");
      },
      (err) => {
        setLoading(false);
        setConnected(false);
        setError(err.message);
      },
    );
    onCleanup(unsubscribe);
  });

  const mutateSprayer = async (data: LiveSprayerData, mode: "AUTO" | "MANUAL", relay: "ON" | "OFF") => {
    const meta = sprayerMeta(data.sprayerId);
    if (!meta) return;
    await overridePump({ sprayerId: meta.id, mode, relay });
  };

  const toggleRelay = async (data: LiveSprayerData) => {
    const relay = data.relay === 1 ? "OFF" : "ON";
    const ok = await confirm({
      title: `${relay === "ON" ? "Nyalakan" : "Matikan"} pompa?`,
      message: `Pompa ${data.sprayerId} akan diubah ke mode manual.`,
      confirmLabel: relay === "ON" ? "Nyalakan" : "Matikan",
      tone: relay === "OFF" ? "danger" : "primary",
    });
    if (!ok) return;
    await mutateSprayer(data, "MANUAL", relay).then(
      () => notify({ kind: "success", title: "Status pompa diperbarui" }),
      () => notify({ kind: "error", title: "Gagal mengubah status pompa" }),
    );
  };

  const toggleMode = async (data: LiveSprayerData) => {
    const mode = data.mode === 0 ? "MANUAL" : "AUTO";
    const ok = await confirm({
      title: mode === "AUTO" ? "Aktifkan Irigasi Otomatis?" : "Nonaktifkan Irigasi Otomatis?",
      message:
        mode === "AUTO"
          ? `Sprayer ${data.sprayerId} akan dikendalikan otomatis berdasarkan kelembaban tanah.`
          : `Sprayer ${data.sprayerId} akan beralih ke mode manual.`,
      confirmLabel: mode === "AUTO" ? "Aktifkan" : "Nonaktifkan",
      tone: mode === "AUTO" ? "primary" : "danger",
    });
    if (!ok) return;
    await mutateSprayer(data, mode, mode === "AUTO" ? "OFF" : data.relay === 1 ? "ON" : "OFF").then(
      () => notify({ kind: "success", title: "Mode irigasi diperbarui" }),
      () => notify({ kind: "error", title: "Gagal mengubah mode irigasi" }),
    );
  };

  const bulkControl = async (relay: "ON" | "OFF") => {
    const label = relay === "ON" ? "Nyalakan Semua" : "Matikan Semua";
    const ok = await confirm({
      title: `${label} sprayer?`,
      message: `Semua sprayer di ${props.blockName} akan diubah ke mode manual.`,
      confirmLabel: label,
      tone: relay === "OFF" ? "danger" : "primary",
    });
    if (!ok) return;
    await Promise.all(
      props.sprayers.map((sprayer) => overridePump({ sprayerId: sprayer.id, mode: "MANUAL", relay })),
    ).then(
      () => notify({ kind: "success", title: `${label} berhasil` }),
      () => notify({ kind: "error", title: "Gagal mengubah semua sprayer" }),
    );
  };

  return (
    <Card class="overflow-hidden">
      <CardHeader
        title={props.blockName}
        actions={
          <div class="flex flex-wrap items-center gap-2">
            <Badge tone={connected() ? "success" : "warning"}>{connected() ? "Realtime" : "Menunggu Data"}</Badge>
            <Show when={!props.readOnly}>
              <Button tone="primary" onClick={() => bulkControl("ON")}>
                Nyalakan Semua
              </Button>
              <Button tone="danger" onClick={() => bulkControl("OFF")}>
                Matikan Semua
              </Button>
            </Show>
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-[#4F4F4F] transition hover:bg-gray-50"
              aria-expanded={expanded()}
              aria-label={expanded() ? "Sembunyikan block" : "Tampilkan block"}
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronDown size={18} class={`transition-transform ${expanded() ? "rotate-180" : ""}`} />
            </button>
          </div>
        }
      />

      <Show when={expanded()}>
        <div class="grid gap-4 bg-gray-50 px-5 py-4 md:grid-cols-3">
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <p class="mb-1 text-sm text-gray-600">Kelembaban Tanah Rata-Rata</p>
            <div class="flex items-end justify-between gap-2">
              <p class="text-2xl font-bold text-[#4F4F4F]">{aggregate().avgMoisture.toFixed(2)}%</p>
              <Badge tone={moisture().tone}>{moisture().label}</Badge>
            </div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <p class="mb-1 text-sm text-gray-600">Debit Rata-Rata</p>
            <p class="text-2xl font-bold text-[#4F4F4F]">{aggregate().avgFlow.toFixed(2)} L/min</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-4">
            <p class="mb-1 text-sm text-gray-600">Total Volume Air</p>
            <p class="text-2xl font-bold text-[#4F4F4F]">{aggregate().totalVolume.toFixed(2)} L</p>
          </div>
        </div>

        <div class="grid gap-4 px-5 py-5 md:grid-cols-2">
          <Show when={error()}>
            {(message) => (
              <div class="col-span-full">
                <InlineError message={message()} />
              </div>
            )}
          </Show>
          <Show
            when={!loading()}
            fallback={
              <>
                <div class="skeleton h-56 rounded-xl" />
                <div class="skeleton h-56 rounded-xl" />
              </>
            }
          >
            <Show
              when={liveData().length > 0}
              fallback={
                <div class="col-span-full rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  Belum ada data sprayer.
                </div>
              }
            >
              <For each={liveData()}>
                {(sprayer) => (
                  <SprayerCard
                    data={sprayer}
                    meta={sprayerMeta(sprayer.sprayerId)}
                    threshold={threshold()}
                    showWindDirection={showWind()}
                    showAutoIrrigation={showAutoIrrig()}
                    readOnly={props.readOnly}
                    onRelay={toggleRelay}
                    onMode={toggleMode}
                  />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </Show>
    </Card>
  );
}
