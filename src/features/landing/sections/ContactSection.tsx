import { createSignal, Show } from "solid-js";
import { CONTACT_CARDS, CONTACT_USER_TYPES } from "~/constants/landing";
import LandingSelect from "~/features/landing/components/LandingSelect";
import { saveContactSubmission } from "~/server/actions/index";

export default function ContactSection() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [userType, setUserType] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [success, setSuccess] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim() || !email().trim() || !message().trim()) {
      setError("Nama, email, dan pesan wajib diisi.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await saveContactSubmission({
        name: name(),
        email: email(),
        phone: phone() || undefined,
        userType: userType() || undefined,
        message: message(),
      });
      setSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setUserType("");
      setMessage("");
    } catch {
      setError("Gagal mengirim pesan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="hubungi-kami" class="bg-white py-16 md:py-24 lg:py-32">
      <div class="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-12 xl:px-16">
        <div class="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 class="mb-10 text-3xl font-extrabold leading-tight text-emerald-600 sm:text-4xl md:text-5xl">
              Hubungi Kami
            </h2>
            <form class="space-y-6" onSubmit={submit}>
              <div class="grid gap-6 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-[#4F4F4F]" for="lp-nama">
                    Nama
                  </label>
                  <input
                    id="lp-nama"
                    type="text"
                    required
                    autocomplete="name"
                    placeholder="Nama Lengkap"
                    class="h-[49px] rounded-[12px] border border-[#C2C2C2] bg-white px-4 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410]"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-[#4F4F4F]" for="lp-email">
                    Email
                  </label>
                  <input
                    id="lp-email"
                    type="email"
                    required
                    autocomplete="email"
                    placeholder="Alamat email"
                    class="h-[49px] rounded-[12px] border border-[#C2C2C2] bg-white px-4 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410]"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                  />
                </div>
              </div>
              <div class="grid gap-6 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-[#4F4F4F]" for="lp-telepon">
                    Nomor Telepon / WA
                  </label>
                  <input
                    id="lp-telepon"
                    type="tel"
                    autocomplete="tel"
                    placeholder="Nomor yang dapat dihubungi"
                    class="h-[49px] rounded-[12px] border border-[#C2C2C2] bg-white px-4 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410]"
                    value={phone()}
                    onInput={(e) => setPhone(e.currentTarget.value)}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-[#4F4F4F]" for="lp-tipe">
                    Tipe Pengguna
                  </label>
                  <LandingSelect
                    id="lp-tipe"
                    value={userType()}
                    placeholder="Pilih tipe pengguna"
                    options={CONTACT_USER_TYPES}
                    onChange={setUserType}
                  />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-[#4F4F4F]" for="lp-pesan">
                  Pesan / Instruksi Khusus
                </label>
                <textarea
                  id="lp-pesan"
                  required
                  rows="5"
                  placeholder="Apakah ada yang perlu kami ketahui?"
                  class="min-h-[120px] rounded-[12px] border border-[#C2C2C2] bg-white px-4 py-3 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410]"
                  value={message()}
                  onInput={(e) => setMessage(e.currentTarget.value)}
                />
              </div>
              <Show when={error()}>
                <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error()}</p>
              </Show>
              <Show when={success()}>
                <p class="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Pesan berhasil dikirim! Kami akan menghubungi Anda segera.
                </p>
              </Show>
              <button
                type="submit"
                disabled={loading()}
                class="inline-flex items-center rounded-full bg-emerald-600 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading() ? "Mengirim..." : "Kirim Pesan"}
              </button>
            </form>
          </div>

          <div class="flex items-start justify-center lg:justify-end">
            <img
              src="/landing/contact-feature.png"
              alt="Tim ADOSISTERING"
              class="h-auto w-full max-w-lg"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              width={2336}
              height={2207}
            />
          </div>
        </div>

        <div class="mt-20 grid gap-8 md:mt-28 md:grid-cols-3">
          {CONTACT_CARDS.map((card) => (
            <div class="text-center">
              <div class="mb-4 flex justify-center">
                <img
                  src={card.icon}
                  alt=""
                  class="h-14 w-14"
                  loading="lazy"
                  decoding="async"
                  fetchpriority="low"
                  width={56}
                  height={56}
                />
              </div>
              <h3 class="mb-2 text-lg font-bold text-slate-800">{card.title}</h3>
              {card.lines.map((line) => (
                <p class="text-sm leading-relaxed text-slate-500">{line}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
