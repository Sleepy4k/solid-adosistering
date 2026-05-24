import { cache, createAsync, revalidate } from "@solidjs/router";
import { createSignal, ErrorBoundary, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { Card, CardHeader } from "~/components/ui/Card";
import { PageHeader } from "~/components/ui/PageHeader";
import { Button } from "~/components/ui/Button";
import { SkCard } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import {
  getMapDisplayConfig,
  getRegionsForConfig,
  saveMapDisplayConfig,
  saveWebConfig,
  updateRegionConfig,
  type MapDisplayConfig,
  type WebConfig,
} from "~/server/actions/index";
import { loadWebConfig, WEB_CONFIG_KEY } from "~/lib/shared/webConfig";

const loadRegionsConfig = cache(() => getRegionsForConfig(), "superadmin-regions-config");
const loadMapDisplayConfig = cache(() => getMapDisplayConfig(), "superadmin-map-display-config");

export const route = {
  preload: () => Promise.all([loadRegionsConfig(), loadWebConfig(), loadMapDisplayConfig()]),
};

// ── Region Config Section ──────────────────────────────────────────────────

type RegionRow = Awaited<ReturnType<typeof getRegionsForConfig>>[number];

function RegionConfigRow(props: { region: RegionRow; onSaved: () => void }) {
  const { notify } = useToast();
  const [divider, setDivider] = createSignal(String(Number(props.region.volumeDivider)));
  const [wind, setWind] = createSignal<boolean>(props.region.showWindDirection);
  const [autoIrrig, setAutoIrrig] = createSignal<boolean>(props.region.showAutoIrrigation);
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    const val = parseFloat(divider());
    if (!Number.isFinite(val) || val <= 0) {
      notify({ kind: "error", title: "Volume divider harus berupa angka positif." });
      return;
    }
    setSaving(true);
    try {
      await updateRegionConfig({
        id: props.region.id,
        volumeDivider: val,
        showWindDirection: wind(),
        showAutoIrrigation: autoIrrig(),
      });
      notify({ kind: "success", title: "Konfigurasi region disimpan." });
      props.onSaved();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr class="border-b border-gray-100 last:border-0">
      <td class="px-5 py-4 font-medium text-[#333]">{props.region.name}</td>
      <td class="px-5 py-4">
        <input
          type="number"
          min="0.0001"
          step="any"
          value={divider()}
          onInput={(e) => setDivider(e.currentTarget.value)}
          class="form-input h-9 w-28 rounded-lg text-sm"
        />
      </td>
      <td class="px-5 py-4">
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={wind()}
            onChange={(e) => setWind(e.currentTarget.checked)}
            class="h-4 w-4 rounded accent-emerald-600"
          />
          <span class="text-sm text-[#4F4F4F]">Tampilkan</span>
        </label>
      </td>
      <td class="px-5 py-4">
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoIrrig()}
            onChange={(e) => setAutoIrrig(e.currentTarget.checked)}
            class="h-4 w-4 rounded accent-emerald-600"
          />
          <span class="text-sm text-[#4F4F4F]">Aktifkan</span>
        </label>
      </td>
      <td class="px-5 py-4">
        <Button tone="primary" class="h-8 px-3 text-xs" disabled={saving()} onClick={save}>
          {saving() ? "Menyimpan..." : "Simpan"}
        </Button>
      </td>
    </tr>
  );
}

function RegionConfigSection() {
  const regions = createAsync(() => loadRegionsConfig());

  const refresh = async () => {
    await revalidate("superadmin-regions-config");
  };

  return (
    <Card class="overflow-hidden">
      <CardHeader title="Konfigurasi Region" />
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="p-6 text-center">
            <p class="mb-3 text-sm text-red-600">
              {err instanceof Response ? "Gagal memuat konfigurasi region." : String(err)}
            </p>
            <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
              Coba lagi
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
          <Show when={regions()}>
            {(rows) => (
              <Show
                when={rows().length > 0}
                fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Belum ada region.</div>}
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="border-b border-gray-100 bg-gray-50 text-xs font-medium text-[#6B6B6B]">
                      <tr>
                        <th class="px-5 py-3 text-left">Nama Region</th>
                        <th class="px-5 py-3 text-left">Pembagi Volume</th>
                        <th class="px-5 py-3 text-left">Arah Angin</th>
                        <th class="px-5 py-3 text-left">Irigasi Otomatis</th>
                        <th class="px-5 py-3 text-left" />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={rows()}>{(region) => <RegionConfigRow region={region} onSaved={refresh} />}</For>
                    </tbody>
                  </table>
                </div>
              </Show>
            )}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </Card>
  );
}

// ── Web Config Section ─────────────────────────────────────────────────────

function WebConfigSection() {
  const { notify } = useToast();
  const config = createAsync(() => loadWebConfig());
  const [projectName, setProjectName] = createSignal("");
  const [tagline, setTagline] = createSignal("");
  const [primaryColor, setPrimaryColor] = createSignal("#67B744");
  const [logoUrl, setLogoUrl] = createSignal("");
  const [iconUrl, setIconUrl] = createSignal("");
  const [initialized, setInitialized] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const ensureInit = (cfg: WebConfig) => {
    if (!initialized()) {
      setProjectName(cfg.projectName);
      setTagline(cfg.tagline ?? "");
      setPrimaryColor(cfg.primaryColor);
      setLogoUrl(cfg.logoUrl ?? "");
      setIconUrl(cfg.iconUrl ?? "");
      setInitialized(true);
    }
  };

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!projectName().trim()) {
      notify({ kind: "error", title: "Nama proyek wajib diisi." });
      return;
    }
    setSaving(true);
    try {
      await saveWebConfig({
        projectName: projectName().trim(),
        tagline: tagline().trim() || null,
        primaryColor: primaryColor(),
        logoUrl: logoUrl().trim() || null,
        iconUrl: iconUrl().trim() || null,
      });
      notify({ kind: "success", title: "Konfigurasi web disimpan." });
      await revalidate(WEB_CONFIG_KEY);
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  const inp = "form-input rounded-lg text-sm h-10 w-full";

  return (
    <Card class="overflow-hidden">
      <CardHeader title="Konfigurasi Web" />
      <ErrorBoundary
        fallback={(err, reset) => (
          <div class="p-6 text-center">
            <p class="mb-3 text-sm text-red-600">
              {err instanceof Response ? "Gagal memuat konfigurasi web." : String(err)}
            </p>
            <button class="text-sm font-medium text-[#186D3C] hover:underline" onClick={reset}>
              Coba lagi
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
          <Show when={config()}>
            {(cfg) => {
              ensureInit(cfg());
              return (
                <form onSubmit={save} class="grid gap-5 p-5 sm:grid-cols-2">
                  <div class="flex flex-col gap-1.5">
                    <label class="form-label text-xs">Nama Proyek</label>
                    <input
                      class={inp}
                      value={projectName()}
                      onInput={(e) => setProjectName(e.currentTarget.value)}
                      placeholder="Adosistering"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="form-label text-xs">Tagline</label>
                    <input
                      class={inp}
                      value={tagline()}
                      onInput={(e) => setTagline(e.currentTarget.value)}
                      placeholder="Sistem Irigasi Cerdas"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="form-label text-xs">Warna Utama</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor()}
                        onInput={(e) => setPrimaryColor(e.currentTarget.value)}
                        class="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 p-1"
                      />
                      <input
                        class={`${inp} flex-1`}
                        value={primaryColor()}
                        onInput={(e) => setPrimaryColor(e.currentTarget.value)}
                        placeholder="#2d6a4f"
                      />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="form-label text-xs">URL Logo</label>
                    <input
                      class={inp}
                      value={logoUrl()}
                      onInput={(e) => setLogoUrl(e.currentTarget.value)}
                      placeholder="/landing/logo.svg"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="form-label text-xs">URL Ikon Web (Favicon)</label>
                    <div class="flex items-center gap-2">
                      <Show when={iconUrl().trim()}>
                        <img
                          src={iconUrl()}
                          alt=""
                          class="h-10 w-10 rounded-lg border border-slate-200 object-contain p-1"
                          loading="lazy"
                          decoding="async"
                          fetchpriority="low"
                          width={40}
                          height={40}
                        />
                      </Show>
                      <input
                        class={`${inp} flex-1`}
                        value={iconUrl()}
                        onInput={(e) => setIconUrl(e.currentTarget.value)}
                        placeholder="/favicon.ico"
                      />
                    </div>
                  </div>
                  <div class="sm:col-span-2 flex justify-end">
                    <Button type="submit" tone="primary" disabled={saving()}>
                      {saving() ? "Menyimpan..." : "Simpan Konfigurasi"}
                    </Button>
                  </div>
                </form>
              );
            }}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </Card>
  );
}

// ── Contact Submissions Section ────────────────────────────────────────────

// ── Page ───────────────────────────────────────────────────────────────────

function MapDisplayConfigSection() {
  const { notify } = useToast();
  const config = createAsync(() => loadMapDisplayConfig());
  const [keringColor, setKeringColor] = createSignal("#ef4444");
  const [lembabColor, setLembabColor] = createSignal("#facc15");
  const [basahColor, setBasahColor] = createSignal("#3b82f6");
  const [initialized, setInitialized] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const ensureInit = (cfg: MapDisplayConfig) => {
    if (initialized()) return;
    setKeringColor(cfg.keringColor);
    setLembabColor(cfg.lembabColor);
    setBasahColor(cfg.basahColor);
    setInitialized(true);
  };

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveMapDisplayConfig({ keringColor: keringColor(), lembabColor: lembabColor(), basahColor: basahColor() });
      notify({ kind: "success", title: "Konfigurasi map disimpan." });
      await revalidate("superadmin-map-display-config");
      await revalidate("map-display-config");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal menyimpan konfigurasi map.";
      notify({ kind: "error", title: msg });
    } finally {
      setSaving(false);
    }
  };

  const colorField = (label: string, value: string, onInput: (value: string) => void) => (
    <div class="flex flex-col gap-1.5">
      <label class="form-label text-xs">{label}</label>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onInput={(e) => onInput(e.currentTarget.value)}
          class="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 p-1"
        />
        <input
          value={value}
          onInput={(e) => onInput(e.currentTarget.value)}
          class="form-input h-10 flex-1 rounded-lg text-sm"
        />
      </div>
    </div>
  );

  return (
    <Card class="overflow-hidden">
      <CardHeader title="Konfigurasi Map" />
      <Suspense fallback={<div class="p-8 text-center text-sm text-[#6B6B6B]">Memuat...</div>}>
        <Show when={config()}>
          {(cfg) => {
            ensureInit(cfg());
            return (
              <form onSubmit={save} class="grid gap-5 p-5 sm:grid-cols-3">
                {colorField("Kering", keringColor(), setKeringColor)}
                {colorField("Lembab", lembabColor(), setLembabColor)}
                {colorField("Basah", basahColor(), setBasahColor)}
                <div class="flex justify-end sm:col-span-3">
                  <Button type="submit" tone="primary" disabled={saving()}>
                    {saving() ? "Menyimpan..." : "Simpan Konfigurasi Map"}
                  </Button>
                </div>
              </form>
            );
          }}
        </Show>
      </Suspense>
    </Card>
  );
}

export default function SuperadminSettings() {
  return (
    <>
      <PageMeta page="home" />

      <div class="space-y-5">
        <PageHeader title="Pengaturan Superadmin" />
        <RegionConfigSection />
        <WebConfigSection />
        <MapDisplayConfigSection />
      </div>
    </>
  );
}
