import { createSignal, Show } from "solid-js";
import { Link2, Upload, X } from "lucide-solid";

type Props = {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  previewContainerClass?: string;
  previewImgClass?: string;
};

const inp =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export function ImageUpload(props: Props) {
  const [mode, setMode] = createSignal<"url" | "file">("url");
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal("");

  const switchMode = (m: "url" | "file") => {
    setMode(m);
    setUploadError("");
  };

  const handleFileChange = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
      setUploadError("Hanya file PNG, JPG, atau JPEG yang diperbolehkan.");
      input.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 2MB.");
      input.value = "";
      return;
    }

    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setUploadError((await res.text()) || "Gagal mengupload file.");
        return;
      }
      const data = (await res.json()) as { url: string };
      props.onChange(data.url);
    } catch {
      setUploadError("Gagal mengupload file. Periksa koneksi.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  return (
    <div class="flex flex-col gap-2">
      {/* Mode toggle */}
      <div class="flex w-fit rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => switchMode("url")}
          class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
            mode() === "url" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Link2 size={12} />
          URL
        </button>
        <button
          type="button"
          onClick={() => switchMode("file")}
          class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
            mode() === "file" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Upload size={12} />
          Upload
        </button>
      </div>

      {/* URL input */}
      <Show when={mode() === "url"}>
        <input
          class={inp}
          type="text"
          value={props.value}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          placeholder={props.placeholder ?? "/uploads/cms/gambar.jpg atau https://..."}
        />
      </Show>

      {/* File picker */}
      <Show when={mode() === "file"}>
        <label
          class={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition ${
            uploading()
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              : "border-slate-200 text-slate-500 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-600"
          }`}
        >
          <Show when={!uploading()} fallback={<span class="text-slate-400">Mengupload...</span>}>
            <Upload size={15} />
            <span>Pilih file PNG / JPG / JPEG (maks. 2 MB)</span>
          </Show>
          <input
            type="file"
            class="sr-only"
            accept=".png,.jpg,.jpeg"
            disabled={uploading()}
            onChange={handleFileChange}
          />
        </label>
        <Show when={uploadError()}>
          <p class="text-xs text-rose-600">{uploadError()}</p>
        </Show>
      </Show>

      {/* Preview */}
      <Show when={props.value}>
        <div class="relative w-fit">
          <div
            class={
              props.previewContainerClass ??
              "mt-1 flex h-20 w-40 items-center justify-center rounded-lg border border-slate-200 bg-neutral-100 p-2"
            }
          >
            <img
              src={props.value}
              alt="Preview"
              class={props.previewImgClass ?? "max-h-full max-w-full object-contain"}
              loading="lazy"
            />
          </div>
          <button
            type="button"
            onClick={() => props.onChange("")}
            title="Hapus gambar"
            class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
          >
            <X size={10} />
          </button>
        </div>
      </Show>
    </div>
  );
}
