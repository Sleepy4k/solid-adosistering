import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { Title, Meta } from "@solidjs/meta";
import { createUserWithProfile } from "~/server/actions";
import { useToast } from "~/components/ToastProvider";
import type { Role } from "@prisma/client";

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
        <Show when={props.required}><span class="ml-0.5 text-rose-500">*</span></Show>
      </label>
      {props.children as never}
    </div>
  );
}

export default function TambahUser() {
  const navigate = useNavigate();
  const { notify } = useToast();

  // Required
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<Role>("USER");
  const [password, setPassword] = createSignal("");
  const [confirmPw, setConfirmPw] = createSignal("");
  const [showPw, setShowPw] = createSignal(false);

  // Optional profile
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

  const baseInput = "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 w-full";

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");

    if (password().length < 8) { setError("Password minimal 8 karakter."); return; }
    if (password() !== confirmPw()) { setError("Konfirmasi password tidak cocok."); return; }

    setLoading(true);
    try {
      await createUserWithProfile({
        actor: undefined as never,
        name: name(),
        email: email(),
        password: password(),
        role: role(),
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
      navigate("/manajemen-user");
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal membuat pengguna. Periksa email atau coba lagi.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Title>Tambah User | Adosistering</Title>
      <Meta name="description" content="Formulir pendaftaran pengguna baru dengan data profil dan kredensial." />

      <div class="flex flex-col gap-5">
        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/manajemen-user")}
            class="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 class="text-2xl font-bold text-slate-900">Tambah Pengguna</h1>
        </div>

        <Show when={error()}>
          <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error()}
          </div>
        </Show>

        <form onSubmit={submit} class="flex flex-col gap-5">
          {/* Data Wajib */}
          <FormSection title="Data Wajib" subtitle="Informasi utama yang harus diisi untuk membuat akun">
            <div class="grid gap-4 sm:grid-cols-2">
              <Field label="Nama Lengkap" required>
                <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class={baseInput} required />
              </Field>
              <Field label="Email" required>
                <input type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} class={baseInput} required />
              </Field>
              <Field label="Role" required>
                <select value={role()} onChange={(e) => setRole(e.currentTarget.value as Role)} class={baseInput}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                  <option value="SUPERADMIN">Superadmin</option>
                </select>
              </Field>
              <Field label="Nomor WhatsApp">
                <input value={whatsapp()} onInput={(e) => setWhatsapp(e.currentTarget.value)} placeholder="08xx" class={baseInput} />
              </Field>
            </div>
          </FormSection>

          {/* Data Opsional */}
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
                <input type="date" value={birthDate()} onChange={(e) => setBirthDate(e.currentTarget.value)} class={baseInput} />
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
                <input value={deviceUsername()} onInput={(e) => setDeviceUsername(e.currentTarget.value)} placeholder="Untuk autentikasi sensor" class={baseInput} />
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

          {/* Kredensial */}
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
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                      <Show
                        when={!showPw()}
                        fallback={<path stroke-linecap="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 4.16-5.595M6.228 6.228A10.015 10.015 0 0 1 12 5c4.478 0 8.268 2.943 9.542 7a10.024 10.024 0 0 1-4.132 5.411M3 3l18 18" />}
                      >
                        <path stroke-linecap="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                        <path stroke-linecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </Show>
                    </svg>
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

          {/* Actions */}
          <div class="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/manajemen-user")}
              class="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading()}
              class="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading() ? "Membuat akun…" : "Buat Pengguna"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
