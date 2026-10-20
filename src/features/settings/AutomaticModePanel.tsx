import { revalidate } from "@solidjs/router";
import { createEffect, createSignal, on, Show } from "solid-js";
import { useConfirm } from "~/components/shared/ConfirmProvider";
import { useToast } from "~/components/shared/ToastProvider";
import { Badge } from "~/components/ui/Badge";
import { Toggle } from "~/components/ui/Toggle";
import { setRegionAutomaticMode } from "~/server/actions/settings";

async function errorMessage(error: unknown) {
  if (error instanceof Response) {
    try {
      const text = await error.text();
      if (text) return text;
    } catch {
      // Abaikan kegagalan membaca body; pesan generik di bawah tetap dipakai.
    }
  }
  if (!import.meta.env.PROD && error instanceof Error && error.message) return error.message;
  return "Periksa koneksi Anda lalu coba lagi.";
}

export function AutomaticModePanel(props: {
  regionId: string;
  regionName: string;
  automaticMode: boolean;
  sprayerCount: number;
  readOnly?: boolean;
}) {
  const { notify } = useToast();
  const confirm = useConfirm();

  const [automaticMode, setAutomaticMode] = createSignal<boolean>(props.automaticMode);
  const [sprayerCount, setSprayerCount] = createSignal<number>(props.sprayerCount);
  const [saving, setSaving] = createSignal<boolean>(false);

  // Panel dapat dipakai ulang saat Admin berganti region pada halaman yang sama.
  createEffect(
    on(
      () => props.regionId,
      () => setSaving(false),
      { defer: true },
    ),
  );
  createEffect(
    on(
      () => [props.automaticMode, props.sprayerCount] as const,
      ([mode, count]) => {
        setAutomaticMode(mode);
        setSprayerCount(count);
      },
    ),
  );

  const canEnable = () => sprayerCount() > 0;
  const enablingBlocked = () => !automaticMode() && !canEnable();

  const changeMode = async (enabled: boolean) => {
    if (saving()) return;
    if (enabled && !canEnable()) {
      notify({
        kind: "warning",
        title: "Mode otomatis membutuhkan sprayer aktif",
        message: "Aktifkan atau tambahkan minimal satu sprayer pada region ini terlebih dahulu.",
      });
      return;
    }

    const regionId = props.regionId;
    const regionName = props.regionName;

    const ok = await confirm({
      title: enabled ? "Aktifkan Mode Otomatis" : "Nonaktifkan Mode Otomatis",
      message: enabled
        ? `Mengaktifkan mode otomatis untuk region "${regionName}" akan memindahkan semua sprayer aktif ke AUTO/OFF. Irigasi dapat menyala secara otomatis berdasarkan kelembapan tanah tanpa konfirmasi tambahan. Lanjutkan?`
        : `Menonaktifkan mode otomatis untuk region "${regionName}" akan memindahkan semua sprayer aktif ke MANUAL/OFF. Irigasi otomatis tidak akan berjalan sampai mode ini diaktifkan kembali. Lanjutkan?`,
      confirmLabel: enabled ? "Aktifkan Otomatis" : "Nonaktifkan",
      tone: enabled ? "primary" : "danger",
    });
    if (!ok) return;

    setSaving(true);
    try {
      const result = await setRegionAutomaticMode({ regionId, enabled });
      // Hindari menimpa state region lain bila Admin berganti region saat aksi berjalan.
      if (props.regionId === regionId) {
        // SQL adalah sumber kebenaran: pakai hasil aksi, termasuk saat mirror Firebase gagal.
        setAutomaticMode(result.automaticMode);
        setSprayerCount(result.sprayerCount);
      }

      if (result.syncStatus === "FAILED") {
        notify({
          kind: "warning",
          title: "Mode otomatis tersimpan, sinkronisasi Firebase tertunda",
          message:
            "Status utama di database sudah diperbarui, tetapi mirror Firebase gagal atau belum tersinkron. Perangkat dapat memakai mode sebelumnya sampai sinkronisasi berhasil.",
        });
      } else {
        notify({
          kind: "success",
          title: enabled
            ? `Mode otomatis diaktifkan untuk ${regionName}`
            : `Mode otomatis dinonaktifkan untuk ${regionName}`,
          message:
            result.sprayerCount > 0
              ? `${result.sprayerCount} sprayer aktif dipindahkan ke ${enabled ? "AUTO/OFF" : "MANUAL/OFF"}.`
              : "Tidak ada sprayer aktif yang perlu dipindahkan.",
        });
      }
    } catch (error) {
      notify({
        kind: "error",
        title: "Gagal mengubah mode otomatis",
        message: await errorMessage(error),
      });
      return;
    } finally {
      setSaving(false);
    }

    await revalidate("my-settings").catch(() => undefined);
  };

  return (
    <div class="overflow-hidden rounded-2xl border border-[#C2C2C2] bg-white">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] px-6 py-4">
        <div>
          <h2 class="text-lg font-bold text-[#4F4F4F]">Mode Otomatis</h2>
          <p class="text-xs text-[#6B7280]">Region {props.regionName}</p>
        </div>
        <Badge tone={automaticMode() ? "success" : "muted"}>{automaticMode() ? "Aktif" : "Nonaktif"}</Badge>
      </div>

      <div class="p-6">
        <div class="rounded-xl border border-[#E5E5E5] p-5">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#4F4F4F]">Kontrol Irigasi Otomatis</h3>
              <ul class="mt-2 space-y-1 text-sm leading-6 text-[#6B7280]">
                <li>
                  <span class="font-semibold text-[#4F4F4F]">Saat aktif:</span> semua sprayer aktif dipindahkan ke
                  AUTO/OFF, dan irigasi dapat menyala otomatis berdasarkan kelembapan tanah.
                </li>
                <li>
                  <span class="font-semibold text-[#4F4F4F]">Saat nonaktif:</span> semua sprayer aktif dipindahkan ke
                  MANUAL/OFF.
                </li>
              </ul>
              <p class="mt-3 text-xs text-[#6B7280]">{sprayerCount()} sprayer aktif terdaftar di region ini.</p>
            </div>

            <Show when={!props.readOnly}>
              <div class="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                <Toggle
                  checked={automaticMode()}
                  disabled={saving() || enablingBlocked()}
                  onChange={(value) => void changeMode(value)}
                  label={saving() ? "Menyimpan..." : "Ubah mode"}
                  size="sm"
                />
                <Show when={enablingBlocked()}>
                  <span class="text-[11px] text-[#947E11]">Butuh minimal satu sprayer aktif</span>
                </Show>
              </div>
            </Show>
          </div>

          <Show when={sprayerCount() === 0}>
            <p class="mt-4 rounded-lg border border-[#FDF1B9] bg-[#FEF9E1] px-3 py-2 text-xs leading-5 text-[#947E11]">
              Mode otomatis belum dapat diaktifkan karena region ini tidak memiliki sprayer aktif. Tambahkan atau
              aktifkan sprayer terlebih dahulu.
            </p>
          </Show>

          <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            <p class="font-semibold">Catatan keamanan</p>
            <p class="mt-1">
              Mode ini mengubah perilaku perangkat, bukan sekadar tampilan. Pastikan seluruh sprayer aktif terpasang
              dengan benar dan tidak ada pekerjaan manual di lahan saat mode diubah.
            </p>
          </div>

          <Show when={props.readOnly}>
            <p class="mt-4 text-xs italic text-[#6B7280]">
              Hanya Admin region yang dapat mengubah mode otomatis. Hubungi Admin jika perlu mengaktifkannya.
            </p>
          </Show>
        </div>
      </div>
    </div>
  );
}
