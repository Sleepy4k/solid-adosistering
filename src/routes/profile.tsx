import { query, createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, Suspense } from "solid-js";
import { PageMeta } from "~/components/shared/PageMeta";
import { ModalFrame } from "~/components/shared/ModalFrame";
import { getMyProfile, updateMyProfile, changeMyPassword, type MyProfile } from "~/server/actions/index";
import { SkCard } from "~/components/shared/Skeleton";
import { useToast } from "~/components/shared/ToastProvider";
import { SelectSearch } from "~/components/ui/SelectSearch";
import { Pencil } from "lucide-solid";

const loadProfile = query(() => getMyProfile(), "my-profile");
export const route = { preload: () => loadProfile() };

function InfoRow(props: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p class="text-xs text-slate-500">{props.label}</p>
      <p class="mt-0.5 font-medium text-slate-900">{props.value || "-"}</p>
    </div>
  );
}

function SectionCard(props: { title: string; onEdit?: () => void; children: unknown }) {
  return (
    <div class="rounded-xl border border-slate-200 bg-white p-6">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="font-semibold text-slate-900">{props.title}</h2>
        <Show when={props.onEdit}>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={props.onEdit}
          >
            <Pencil size={16} aria-hidden="true" />
            Edit
          </button>
        </Show>
      </div>
      {props.children as never}
    </div>
  );
}

function EditProfileModal(props: { profile: MyProfile; onClose: () => void }) {
  const { notify } = useToast();
  const p = props.profile;
  const [name, setName] = createSignal<string>(p.name);
  const [whatsapp, setWhatsapp] = createSignal<string>(p.profile?.whatsapp ?? "");
  const [gender, setGender] = createSignal<string>(p.profile?.gender ?? "");
  const [address, setAddress] = createSignal<string>(p.profile?.address ?? "");
  const [country, setCountry] = createSignal<string>(p.profile?.country ?? "");
  const [province, setProvince] = createSignal<string>(p.profile?.province ?? "");
  const [city, setCity] = createSignal<string>(p.profile?.city ?? "");
  const [postalCode, setPostalCode] = createSignal<string>(p.profile?.postalCode ?? "");
  const [loading, setLoading] = createSignal<boolean>(false);

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateMyProfile({
        name: name(),
        whatsapp: whatsapp(),
        gender: gender(),
        address: address(),
        country: country(),
        province: province(),
        city: city(),
        postalCode: postalCode(),
      });
      await revalidate("my-profile");
      notify({ kind: "success", title: "Profil berhasil diperbarui" });
      props.onClose();
    } catch {
      notify({ kind: "error", title: "Gagal memperbarui profil" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto p-6">
      <>
        <h2 class="mb-4 text-lg font-semibold text-slate-900">Edit Profil</h2>
        <form onSubmit={save} class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs font-medium text-slate-600">Nama Lengkap</label>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class="input-base w-full" required />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Nomor WhatsApp</label>
            <input value={whatsapp()} onInput={(e) => setWhatsapp(e.currentTarget.value)} class="input-base w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Jenis Kelamin</label>
            <SelectSearch
              value={gender()}
              placeholder="Pilih"
              options={[
                { value: "", label: "Pilih" },
                { value: "Laki-laki", label: "Laki-laki" },
                { value: "Perempuan", label: "Perempuan" },
              ]}
              onChange={setGender}
            />
          </div>
          <div class="sm:col-span-2">
            <label class="mb-1 block text-xs font-medium text-slate-600">Alamat</label>
            <input value={address()} onInput={(e) => setAddress(e.currentTarget.value)} class="input-base w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Negara</label>
            <input value={country()} onInput={(e) => setCountry(e.currentTarget.value)} class="input-base w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Provinsi</label>
            <input value={province()} onInput={(e) => setProvince(e.currentTarget.value)} class="input-base w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Kota / Kabupaten</label>
            <input value={city()} onInput={(e) => setCity(e.currentTarget.value)} class="input-base w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Kode Pos</label>
            <input
              value={postalCode()}
              onInput={(e) => setPostalCode(e.currentTarget.value)}
              class="input-base w-full"
            />
          </div>
          <div class="flex justify-end gap-3 sm:col-span-2">
            <button type="button" class="btn-outline" onClick={props.onClose}>
              Batal
            </button>
            <button type="submit" class="btn-primary" disabled={loading()}>
              {loading() ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}

function ChangePasswordModal(props: { onClose: () => void }) {
  const { notify } = useToast();
  const [current, setCurrent] = createSignal<string>("");
  const [newPw, setNewPw] = createSignal<string>("");
  const [confirmPw, setConfirmPw] = createSignal<string>("");
  const [loading, setLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<string>("");

  const save = async (e: SubmitEvent) => {
    e.preventDefault();
    if (newPw() !== confirmPw()) {
      setError("Password baru tidak cocok.");
      return;
    }
    if (newPw().length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await changeMyPassword({ currentPassword: current(), newPassword: newPw() });
      notify({ kind: "success", title: "Password berhasil diubah" });
      props.onClose();
    } catch (err) {
      const msg = err instanceof Response ? await err.text() : "Gagal mengubah password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame onClose={props.onClose} panelClass="max-w-sm p-6">
      <>
        <h2 class="mb-4 text-lg font-semibold text-slate-900">Ubah Kata Sandi</h2>
        <Show when={error()}>
          <div class="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error()}</div>
        </Show>
        <form onSubmit={save} class="flex flex-col gap-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Password Saat Ini</label>
            <input
              type="password"
              value={current()}
              onInput={(e) => setCurrent(e.currentTarget.value)}
              class="input-base w-full"
              required
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Password Baru</label>
            <input
              type="password"
              value={newPw()}
              onInput={(e) => setNewPw(e.currentTarget.value)}
              class="input-base w-full"
              required
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-600">Konfirmasi Password</label>
            <input
              type="password"
              value={confirmPw()}
              onInput={(e) => setConfirmPw(e.currentTarget.value)}
              class="input-base w-full"
              required
            />
          </div>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-outline" onClick={props.onClose}>
              Batal
            </button>
            <button type="submit" class="btn-primary" disabled={loading()}>
              {loading() ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </>
    </ModalFrame>
  );
}

export default function Profil() {
  const profile = createAsync(() => loadProfile());
  const [editProfile, setEditProfile] = createSignal<boolean>(false);
  const [editPw, setEditPw] = createSignal<boolean>(false);

  return (
    <>
      <PageMeta page="profile" />

      <div class="flex flex-col gap-5">
        <h1 class="text-2xl font-bold text-slate-900">Profil</h1>

        <Suspense
          fallback={
            <div class="flex flex-col gap-4">
              <SkCard />
              <SkCard />
              <SkCard />
            </div>
          }
        >
          <Show when={profile()}>
            {(p) => (
              <>
                {/* Profil Saya */}
                <div class="rounded-xl border border-slate-200 bg-white p-6">
                  <h2 class="mb-4 font-semibold text-slate-900">Profil Saya</h2>
                  <div class="flex items-center gap-4">
                    <div class="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-emerald-100 text-xl font-bold text-emerald-700">
                      {p().name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p class="font-bold text-emerald-700">{p().name}</p>
                      <p class="text-sm text-slate-500">{p().profile?.address || "-"}</p>
                      <p class="text-sm text-slate-500">{p().profile?.whatsapp || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* Informasi Pribadi */}
                <SectionCard title="Informasi Pribadi" onEdit={() => setEditProfile(true)}>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <InfoRow label="Nama Lengkap" value={p().name} />
                    <InfoRow label="Nomor WhatsApp" value={p().profile?.whatsapp} />
                    <InfoRow label="Email" value={p().email} />
                    <InfoRow label="Jenis Kelamin" value={p().profile?.gender} />
                    <InfoRow label="Alamat" value={p().profile?.address} />
                  </div>
                </SectionCard>

                {/* Domisili */}
                <SectionCard title="Domisili" onEdit={() => setEditProfile(true)}>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <InfoRow label="Negara" value={p().profile?.country ?? "Indonesia"} />
                    <InfoRow label="Provinsi" value={p().profile?.province} />
                    <InfoRow label="Kota / Kabupaten" value={p().profile?.city} />
                    <InfoRow label="Kode Pos" value={p().profile?.postalCode} />
                  </div>
                </SectionCard>

                {/* Keamanan */}
                <SectionCard title="Keamanan">
                  <div class="mb-4 flex justify-end">
                    <button type="button" class="btn-outline text-sm" onClick={() => setEditPw(true)}>
                      Ubah Kata Sandi
                    </button>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <InfoRow label="Username" value={p().name} />
                    <InfoRow label="Kata Sandi" value="••••••••••" />
                  </div>
                </SectionCard>

                {/* Modals */}
                <Show when={editProfile()}>
                  <EditProfileModal profile={p()} onClose={() => setEditProfile(false)} />
                </Show>
                <Show when={editPw()}>
                  <ChangePasswordModal onClose={() => setEditPw(false)} />
                </Show>
              </>
            )}
          </Show>
        </Suspense>
      </div>

      <style>{`
        .input-base {
          border-radius: 0.625rem;
          border: 1px solid #e2e8f0;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .input-base:focus { border-color: #10b981; box-shadow: 0 0 0 3px #10b98133; }
        .btn-primary { background: #059669; color: #fff; font-size: 0.875rem; font-weight: 600; padding: 0.5rem 1.25rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-primary:hover { background: #047857; }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-outline { border: 1px solid #e2e8f0; color: #374151; font-size: 0.875rem; font-weight: 500; padding: 0.5rem 1rem; border-radius: 0.625rem; transition: background 150ms; }
        .btn-outline:hover { background: #f8fafc; }
      `}</style>
    </>
  );
}
