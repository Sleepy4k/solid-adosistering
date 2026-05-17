import { cache, createAsync, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { createUserWithProfile, getUserFormOptions } from "~/server/actions/index";
import { useToast } from "~/components/shared/ToastProvider";
import { SkCard } from "~/components/shared/Skeleton";
import type { Role } from "@prisma/client";
import chevronLeftIcon from "~/assets/icons/chevron-left.svg?url";
import eyeOnIcon from "~/assets/icons/eye_on.svg?url";
import eyeOffIcon from "~/assets/icons/eye_off.svg?url";

const loadFormOptions = cache(() => getUserFormOptions(), "user-create-form-options");
export const route = { preload: () => loadFormOptions() };

function FormSection(props: { title: string; subtitle?: string; children: unknown }) {
  return (
    <div class="rounded-xl border border-slate-200 bg-white p-6">
      <div class="mb-5">
        <h2 class="font-semibold text-slate-900">{props.title}</h2>
        <Show when={props.subtitle}>
          <p class="mt-0.5 text-sm text-slate-500">{props.subtitle}</p>
        </Show>
      </div>
      {props.children as never}
    </div>
  );
}

function Field(props: { label: string; required?: boolean; children: unknown }) {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-slate-600">
        {props.label}
        <Show when={props.required}>
          <span class="ml-0.5 text-rose-500">*</span>
        </Show>
      </label>
      {props.children as never}
    </div>
  );
}

export default function TambahUser() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const formOptions = createAsync(() => loadFormOptions());

  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<Role>("USER");
  const [regionIds, setRegionIds] = createSignal<string[]>([]);
  const [password, setPassword] = createSignal("");
  const [confirmPw, setConfirmPw] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);

  const [whatsapp, setWhatsapp] = createSignal("");
  const [nickname, setNickname] = createSignal("");
  const [gender, setGender] = createSignal("");
  const [birthDate, setBirthDate] = createSignal("");
  const [altPhone, setAltPhone] = createSignal("");
  const [occupation, setOccupation] = createSignal("");
  const [domicile, setDomicile] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [internalNotes, setInternalNotes] = createSignal("");
  const [deviceUsername, setDeviceUsername] = createSignal("");

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const actorRole = createMemo(() => formOptions()?.actorRole ?? "ADMIN");
  const targetRole = createMemo<Role>(() => (actorRole() === "ADMIN" ? "USER" : role()));
  const selectedRegion = createMemo(() => regionIds()[0] ?? "");
  const baseInput =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

  createEffect(() => {
    if (actorRole() === "ADMIN") setRole("USER");
    if (targetRole() === "SUPERADMIN") setRegionIds([]);
    if (targetRole() === "USER" && regionIds().length > 1) setRegionIds([regionIds()[0]]);
  });

  const setSingleRegion = (regionId: string) => setRegionIds(regionId ? [regionId] : []);
  const toggleRegion = (regionId: string) => {
    setRegionIds((ids) => (ids.includes(regionId) ? ids.filter((id) => id !== regionId) : [...ids, regionId]));
  };

  const validateAssignment = () => {
    if (targetRole() === "USER" && regionIds().length !== 1) return "User wajib di-assign tepat 1 region.";
    if (targetRole() === "ADMIN" && regionIds().length === 0) return "Admin wajib memiliki minimal 1 region.";
    return "";
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");

    if (password().length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password() !== confirmPw()) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    const assignmentError = validateAssignment();
    if (assignmentError) {
      setError(assignmentError);
      return;
    }

    setLoading(true);
    try {
      await createUserWithProfile({
        name: name(),
        email: email(),
        password: password(),
        role: targetRole(),
        regionIds: targetRole() === "SUPERADMIN" ? [] : regionIds(),
        whatsapp: whatsapp() || undefined,
        nickname: nickname() || undefined,
        gender: gender() || undefined,
        birthDate: birthDate() || undefined,
        altPhone: altPhone() || undefined,
        occupation: occupation() || undefined,
        domicile: domicile() || undefined,
        address: address() || undefined,
        internalNotes: internalNotes() || undefined,
        deviceUsername: deviceUsername() || undefined,
      });
      notify({ kind: "success", title: `Pengguna "${name()}" berhasil dibuat` });
      navigate("/user-management");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal membuat pengguna. Periksa email atau coba lagi.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta page="userCreate" />

      <div class="flex flex-col gap-5">
        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/user-management")}
            class="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <img src={chevronLeftIcon} alt="" class="h-4 w-4" aria-hidden="true" />
          </button>
          <h1 class="text-2xl font-bold text-slate-900">Tambah Pengguna</h1>
        </div>

        <Show when={error()}>
          <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error()}</div>
        </Show>

        <Suspense fallback={<SkCard />}>
          <form onSubmit={submit} class="flex flex-col gap-5">
            <FormSection title="Data Wajib" subtitle="Informasi utama yang harus diisi untuk membuat akun">
              <div class="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Lengkap" required>
                  <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class={baseInput} required />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    class={baseInput}
                    required
                  />
                </Field>
                <Show
                  when={actorRole() === "SUPERADMIN"}
                  fallback={
                    <Field label="Role" required>
                      <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                        User
                      </div>
                    </Field>
                  }
                >
                  <Field label="Role" required>
                    <select value={role()} onChange={(e) => setRole(e.currentTarget.value as Role)} class={baseInput}>
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                      <option value="SUPERADMIN">Superadmin</option>
                    </select>
                  </Field>
                </Show>
                <Field label="Nomor WhatsApp">
                  <input
                    value={whatsapp()}
                    onInput={(e) => setWhatsapp(e.currentTarget.value)}
                    placeholder="08xx"
                    class={baseInput}
                  />
                </Field>
              </div>
            </FormSection>

            <Show when={targetRole() !== "SUPERADMIN"}>
              <FormSection
                title="Assignment Region"
                subtitle={
                  targetRole() === "USER"
                    ? "User wajib terhubung ke tepat 1 region."
                    : "Admin bisa mengelola satu atau beberapa region."
                }
              >
                <Show
                  when={targetRole() === "ADMIN"}
                  fallback={
                    <select
                      value={selectedRegion()}
                      onChange={(e) => setSingleRegion(e.currentTarget.value)}
                      class={baseInput}
                      required
                    >
                      <option value="">Pilih region...</option>
                      <For each={formOptions()?.regions ?? []}>
                        {(region) => <option value={region.id}>{region.name}</option>}
                      </For>
                    </select>
                  }
                >
                  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={formOptions()?.regions ?? []}>
                      {(region) => (
                        <label class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={regionIds().includes(region.id)}
                            onChange={() => toggleRegion(region.id)}
                            class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          {region.name}
                        </label>
                      )}
                    </For>
                  </div>
                </Show>
              </FormSection>
            </Show>

            <FormSection title="Data Opsional" subtitle="Informasi tambahan profil pengguna">
              <div class="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Panggilan">
                  <input value={nickname()} onInput={(e) => setNickname(e.currentTarget.value)} class={baseInput} />
                </Field>
                <Field label="Jenis Kelamin">
                  <select value={gender()} onChange={(e) => setGender(e.currentTarget.value)} class={baseInput}>
                    <option value="">Pilih</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </Field>
                <Field label="Tanggal Lahir">
                  <input
                    type="date"
                    value={birthDate()}
                    onChange={(e) => setBirthDate(e.currentTarget.value)}
                    class={baseInput}
                  />
                </Field>
                <Field label="Telepon Alternatif">
                  <input value={altPhone()} onInput={(e) => setAltPhone(e.currentTarget.value)} class={baseInput} />
                </Field>
                <Field label="Pekerjaan">
                  <input value={occupation()} onInput={(e) => setOccupation(e.currentTarget.value)} class={baseInput} />
                </Field>
                <Field label="Domisili">
                  <input value={domicile()} onInput={(e) => setDomicile(e.currentTarget.value)} class={baseInput} />
                </Field>
                <div class="sm:col-span-2">
                  <Field label="Alamat Lengkap">
                    <input value={address()} onInput={(e) => setAddress(e.currentTarget.value)} class={baseInput} />
                  </Field>
                </div>
                <Field label="Username Perangkat">
                  <input
                    value={deviceUsername()}
                    onInput={(e) => setDeviceUsername(e.currentTarget.value)}
                    placeholder="Untuk autentikasi sensor"
                    class={baseInput}
                  />
                </Field>
                <div class="sm:col-span-2">
                  <Field label="Catatan Internal">
                    <textarea
                      value={internalNotes()}
                      onInput={(e) => setInternalNotes(e.currentTarget.value)}
                      rows="3"
                      placeholder="Catatan khusus yang hanya terlihat oleh admin"
                      class={`${baseInput} resize-none`}
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection title="Kredensial" subtitle="Password untuk login ke aplikasi">
              <div class="grid gap-4 sm:grid-cols-2">
                <Field label="Password" required>
                  <div class="relative">
                    <input
                      type={showPw() ? "text" : "password"}
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                      placeholder="Min. 8 karakter"
                      class={`${baseInput} pr-11`}
                      required
                    />
                    <button
                      type="button"
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      <img
                        src={showPw() ? eyeOffIcon : eyeOnIcon}
                        alt={showPw() ? "Sembunyikan password" : "Tampilkan password"}
                        class="h-4 w-4"
                      />
                    </button>
                  </div>
                </Field>
                <Field label="Konfirmasi Password" required>
                  <input
                    type="password"
                    value={confirmPw()}
                    onInput={(e) => setConfirmPw(e.currentTarget.value)}
                    placeholder="Ulangi password"
                    class={baseInput}
                    required
                  />
                </Field>
              </div>
            </FormSection>

            <div class="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate("/user-management")}
                class="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading()}
                class="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading() ? "Membuat akun..." : "Buat Pengguna"}
              </button>
            </div>
          </form>
        </Suspense>
      </div>
    </>
  );
}
