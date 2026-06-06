import { createMemo, createSignal, onCleanup, Show } from "solid-js";
import { CONTACT_CARDS, CONTACT_USER_TYPES } from "~/constants/landing";
import LandingSelect from "~/features/landing/components/LandingSelect";
import { saveContactSubmission } from "~/server/actions/index";
import { debounce } from "~/lib/shared/debounce";
import { validateEmail, validateMessage, validateName, validatePhone } from "~/lib/shared/validation";

export default function ContactSection() {
  const [name, setName] = createSignal<string>("");
  const [email, setEmail] = createSignal<string>("");
  const [phone, setPhone] = createSignal<string>("");
  const [userType, setUserType] = createSignal<string>("");
  const [message, setMessage] = createSignal<string>("");
  const [loading, setLoading] = createSignal<boolean>(false);
  const [success, setSuccess] = createSignal<boolean>(false);
  const [submitError, setSubmitError] = createSignal<string>("");

  const [nameErr, setNameErr] = createSignal<string>("");
  const [emailErr, setEmailErr] = createSignal<string>("");
  const [phoneErr, setPhoneErr] = createSignal<string>("");
  const [messageErr, setMessageErr] = createSignal<string>("");

  const validateNameD = debounce((v: string) => setNameErr(validateName(v)), 300);
  const validateEmailD = debounce((v: string) => setEmailErr(validateEmail(v)), 300);
  const validatePhoneD = debounce((v: string) => setPhoneErr(validatePhone(v)), 300);
  const validateMessageD = debounce((v: string) => setMessageErr(validateMessage(v)), 300);
  onCleanup(() => {
    validateNameD.cancel();
    validateEmailD.cancel();
    validatePhoneD.cancel();
    validateMessageD.cancel();
  });

  const onNameInput = (v: string) => {
    setName(v);
    if (nameErr()) setNameErr(validateName(v));
    else validateNameD(v);
  };
  const onEmailInput = (v: string) => {
    setEmail(v);
    if (emailErr()) setEmailErr(validateEmail(v));
    else validateEmailD(v);
  };
  const onPhoneInput = (v: string) => {
    setPhone(v);
    if (phoneErr()) setPhoneErr(validatePhone(v));
    else validatePhoneD(v);
  };
  const onMessageInput = (v: string) => {
    setMessage(v);
    if (messageErr()) setMessageErr(validateMessage(v));
    else validateMessageD(v);
  };

  const hasErrors = createMemo(() => !!(nameErr() || emailErr() || phoneErr() || messageErr()));

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    validateNameD.cancel();
    validateEmailD.cancel();
    validatePhoneD.cancel();
    validateMessageD.cancel();

    const nErr = validateName(name());
    const eErr = validateEmail(email());
    const pErr = validatePhone(phone());
    const mErr = validateMessage(message());
    setNameErr(nErr);
    setEmailErr(eErr);
    setPhoneErr(pErr);
    setMessageErr(mErr);
    if (nErr || eErr || pErr || mErr) return;

    setSubmitError("");
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
      setNameErr("");
      setEmailErr("");
      setPhoneErr("");
      setMessageErr("");
    } catch {
      setSubmitError("Gagal mengirim pesan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    "h-[49px] rounded-[12px] border bg-white px-4 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410]";

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
                    autocomplete="name"
                    placeholder="Nama Lengkap"
                    class={`${inputBase} ${nameErr() ? "border-rose-400" : "border-[#C2C2C2]"}`}
                    value={name()}
                    onInput={(e) => onNameInput(e.currentTarget.value)}
                    onBlur={() => setNameErr(validateName(name()))}
                    aria-invalid={nameErr() ? "true" : undefined}
                  />
                  <Show when={nameErr()}>
                    <span class="text-xs text-rose-600">{nameErr()}</span>
                  </Show>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-[#4F4F4F]" for="lp-email">
                    Email
                  </label>
                  <input
                    id="lp-email"
                    type="email"
                    autocomplete="email"
                    placeholder="Alamat email"
                    class={`${inputBase} ${emailErr() ? "border-rose-400" : "border-[#C2C2C2]"}`}
                    value={email()}
                    onInput={(e) => onEmailInput(e.currentTarget.value)}
                    onBlur={() => setEmailErr(validateEmail(email()))}
                    aria-invalid={emailErr() ? "true" : undefined}
                  />
                  <Show when={emailErr()}>
                    <span class="text-xs text-rose-600">{emailErr()}</span>
                  </Show>
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
                    class={`${inputBase} ${phoneErr() ? "border-rose-400" : "border-[#C2C2C2]"}`}
                    value={phone()}
                    onInput={(e) => onPhoneInput(e.currentTarget.value)}
                    onBlur={() => setPhoneErr(validatePhone(phone()))}
                    aria-invalid={phoneErr() ? "true" : undefined}
                  />
                  <Show when={phoneErr()}>
                    <span class="text-xs text-rose-600">{phoneErr()}</span>
                  </Show>
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
                  rows="5"
                  placeholder="Apakah ada yang perlu kami ketahui?"
                  class={`min-h-[120px] rounded-[12px] border bg-white px-4 py-3 text-[0.9375rem] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#3b7410] ${
                    messageErr() ? "border-rose-400" : "border-[#C2C2C2]"
                  }`}
                  value={message()}
                  onInput={(e) => onMessageInput(e.currentTarget.value)}
                  onBlur={() => setMessageErr(validateMessage(message()))}
                  aria-invalid={messageErr() ? "true" : undefined}
                />
                <Show when={messageErr()}>
                  <span class="text-xs text-rose-600">{messageErr()}</span>
                </Show>
              </div>
              <Show when={submitError()}>
                <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{submitError()}</p>
              </Show>
              <Show when={success()}>
                <p class="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Pesan berhasil dikirim! Kami akan menghubungi Anda segera.
                </p>
              </Show>
              <button
                type="submit"
                disabled={loading() || hasErrors()}
                class="inline-flex items-center rounded-full bg-emerald-600 px-10 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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
