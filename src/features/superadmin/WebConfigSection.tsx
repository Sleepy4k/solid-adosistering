import { createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, Suspense } from "solid-js";
import { Card, CardHeader } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { ErrorBoundary } from "solid-js";
import { useToast } from "~/components/shared/ToastProvider";
import { saveWebConfig } from "~/server/actions/index";
import { loadWebConfig, WEB_CONFIG_KEY } from "~/lib/shared/webConfig";
import type { WebConfig } from "~/types/web-config";

const inp = "form-input rounded-lg text-sm h-10 w-full";

export function WebConfigSection() {
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
                  <div class="flex justify-end sm:col-span-2">
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
