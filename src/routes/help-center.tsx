import { cache, createAsync } from "@solidjs/router";
import { PageMeta } from "~/components/shared/PageMeta";
import { ChevronDown } from "lucide-solid";
import { createSignal, For, Show, Suspense } from "solid-js";
import { Card } from "~/components/ui/Card";
import { PageHeader } from "~/components/ui/PageHeader";
import { getUser } from "~/server/auth";
import type { Role } from "@prisma/client";

type HelpItem = { title: string; body: string };

const loadUser = cache(() => getUser(), "help-center-user");

const COMMON_HELP: HelpItem[] = [
  {
    title: "Bagaimana cara membaca status koneksi realtime?",
    body: "Status Realtime berarti data sprayer berhasil diterima dari Firebase. Menunggu Data berarti block belum mengirim data atau koneksi sedang dipulihkan.",
  },
  {
    title: "Apa arti kondisi Kering, Lembab, dan Basah?",
    body: "Label kondisi mengikuti batas Kondisi Lahan yang disimpan di Pengaturan. Nilai ini hanya untuk tampilan dashboard dan riwayat.",
  },
  {
    title: "Apa bedanya range otomatis dan kondisi lahan?",
    body: "Range otomatis mengatur kapan IoT menyiram. Kondisi lahan hanya mengatur label tampilan seperti Kering, Lembab, dan Basah.",
  },
  {
    title: "Mengapa halaman menampilkan skeleton loading?",
    body: "Skeleton muncul saat sistem menunggu data backend atau Firebase agar halaman tidak kosong ketika koneksi lambat.",
  },
  {
    title: "Mengapa ada pesan data belum bisa dimuat?",
    body: "Pesan ini muncul jika backend atau Firebase gagal diakses. Coba muat ulang data, cek koneksi, atau hubungi pengelola.",
  },
  {
    title: "Bagaimana melihat riwayat irigasi?",
    body: "Buka menu Riwayat Irigasi, lalu gunakan filter nama lahan, status, jenis irigasi, dan tanggal sesuai kebutuhan.",
  },
  {
    title: "Bagaimana membaca grafik statistik?",
    body: "Grafik kelembaban menampilkan persentase tanah, sedangkan penggunaan air menampilkan volume atau debit air dari data sensor.",
  },
  {
    title: "Mengapa grafik tetap tampil saat data kosong?",
    body: "Sistem tetap menampilkan sumbu grafik agar halaman stabil. Data akan muncul ketika sensor mengirim pembacaan baru.",
  },
  {
    title: "Apa fungsi Peta Area Irigasi?",
    body: "Peta menunjukkan region, block, marker, dan polygon lokasi lahan. Warna block mengikuti kondisi kelembaban realtime bila data tersedia.",
  },
  {
    title: "Mengapa polygon block belum terlihat?",
    body: "Polygon hanya tampil jika koordinat block sudah dikonfigurasi dan memiliki minimal tiga titik koordinat valid.",
  },
  {
    title: "Apa arti mode Otomatis?",
    body: "Mode Otomatis membuat IoT mengambil keputusan penyiraman berdasarkan range kelembaban tanah yang tersimpan di Firebase.",
  },
  {
    title: "Apa arti mode Manual?",
    body: "Mode Manual membuat perintah ON atau OFF dikirim langsung dari web ke Firebase untuk dibaca perangkat IoT.",
  },
  {
    title: "Kapan tombol logout digunakan?",
    body: "Gunakan Logout setelah selesai bekerja, terutama pada perangkat bersama, agar sesi akun tidak tertinggal.",
  },
  {
    title: "Apa yang harus dilakukan jika tombol tidak merespons?",
    body: "Tunggu beberapa detik sampai loading selesai. Jika tetap tidak merespons, periksa koneksi dan muat ulang halaman.",
  },
  {
    title: "Bagaimana memastikan data aman?",
    body: "Gunakan password kuat, jangan bagikan akun, dan pastikan hanya role yang tepat memiliki akses ke region.",
  },
];

const HELP_BY_ROLE: Record<Role, HelpItem[]> = {
  USER: [
    {
      title: "Bagaimana cara melihat kondisi lahan?",
      body: "Buka Beranda. Setiap block menampilkan kelembaban rata-rata, debit air, volume air, status sprayer, dan kondisi lahan realtime dari Firebase.",
    },
    {
      title: "Bagaimana membuka detail sprayer di block?",
      body: "Gunakan tombol panah pada kartu block untuk expand atau collapse daftar sprayer seperti tampilan Laravel.",
    },
    {
      title: "Bagaimana menyalakan semua sprayer dalam satu block?",
      body: "Pada kartu block, tekan Nyalakan Semua. Sistem akan mengubah semua sprayer pada block tersebut ke mode manual ON.",
    },
    {
      title: "Bagaimana mematikan semua sprayer dalam satu block?",
      body: "Pada kartu block, tekan Matikan Semua. Sistem akan mengirim perintah manual OFF ke sprayer di block tersebut.",
    },
    {
      title: "Bagaimana mengatur penyiraman otomatis?",
      body: "Buka Pengaturan, ubah range Kelembaban Tanah, lalu simpan. Range ini disinkronkan ke Firebase sebagai batas otomatis IoT.",
    },
    {
      title: "Bagaimana mengatur label kondisi lahan?",
      body: "Buka Pengaturan bagian Kondisi Lahan, pilih Kering, Lembab, atau Basah, lalu isi nilai batas display yang diinginkan.",
    },
    {
      title: "Mengapa perubahan pengaturan tidak langsung terlihat?",
      body: "Tunggu proses simpan selesai dan data realtime masuk kembali dari Firebase. Dashboard akan menyesuaikan nilai terbaru.",
    },
    {
      title: "Apa fungsi Safety Timeout?",
      body: "Safety Timeout membantu membatasi durasi saat alat tidak mengirim sinyal digital agar penyiraman tidak terus berjalan tanpa kontrol.",
    },
  ],
  ADMIN: [
    {
      title: "User apa saja yang bisa dikelola Admin?",
      body: "Admin hanya bisa melihat, membuat, mengedit, mengaktifkan, dan menghapus User yang berada pada region yang ditugaskan oleh Superadmin.",
    },
    {
      title: "Bagaimana membuat User baru?",
      body: "Buka Manajemen User lalu Tambah User. Role otomatis User dan Admin wajib memilih tepat satu region dari region yang berada di hak aksesnya.",
    },
    {
      title: "Mengapa Admin tidak bisa memilih role?",
      body: "Admin hanya berwenang membuat User agar hak akses tetap sesuai region yang dikelola.",
    },
    {
      title: "Bagaimana mengedit data User?",
      body: "Buka Manajemen User, tekan Edit, ubah data, pilih region yang valid, lalu simpan.",
    },
    {
      title: "Mengapa User dari region lain tidak muncul?",
      body: "Daftar User dibatasi oleh assignment region Admin agar data antarwilayah tidak tercampur.",
    },
    {
      title: "Bagaimana menonaktifkan akun User?",
      body: "Gunakan tombol Nonaktifkan pada tabel Manajemen User. Akun tidak dihapus, tetapi tidak dapat dipakai login.",
    },
    {
      title: "Mengapa menu Pengaturan tidak muncul?",
      body: "Pengaturan region hanya tersedia untuk User. Admin berfokus pada pengelolaan User di region yang dikelolanya.",
    },
    {
      title: "Bagaimana memantau kondisi User di Beranda Admin?",
      body: "Beranda Admin menampilkan kartu pengguna dan ringkasan sensor utama dari region yang dikelola.",
    },
  ],
  SUPERADMIN: [
    {
      title: "Bagaimana menambahkan region?",
      body: "Buka Manajemen Region, isi nama region dan koordinat pusat. Sistem akan mencoba membuat node region di Firebase sesuai skema baru.",
    },
    {
      title: "Bagaimana mengatur polygon block?",
      body: "Buka Konfigurasi Peta, pilih region dan block, lalu isi titik koordinat polygon satu baris per titik dalam format latitude, longitude.",
    },
    {
      title: "Bagaimana assignment Admin bekerja?",
      body: "Superadmin dapat memberi satu atau beberapa region ke Admin agar Admin hanya mengelola wilayah tersebut.",
    },
    {
      title: "Bagaimana assignment User bekerja?",
      body: "User hanya boleh diassign tepat satu region agar dashboard, pengaturan, dan riwayatnya fokus pada lahan yang benar.",
    },
    {
      title: "Bagaimana mengubah akun menjadi Admin?",
      body: "Pada Manajemen User, edit akun, pilih role Admin, lalu centang satu atau beberapa region yang akan dikelola.",
    },
    {
      title: "Bagaimana membuat User dari Superadmin?",
      body: "Saat membuat User, pilih role User dan assign tepat satu region.",
    },
    {
      title: "Mengapa menu Pengaturan tidak muncul?",
      body: "Pengaturan threshold dan preferensi lahan hanya tersedia untuk User. Superadmin menggunakan Manajemen Region dan Konfigurasi Peta.",
    },
    {
      title: "Bagaimana membaca status sinkron Firebase?",
      body: "Pada Manajemen Region, status sinkron menunjukkan apakah node region berhasil dibuat atau diperbarui di Firebase.",
    },
  ],
};

function AccordionItem(props: HelpItem & { index: number }) {
  const [open, setOpen] = createSignal(props.index === 0);
  return (
    <section class="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-4 py-4 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open()}
      >
        <span class="font-semibold text-[#186D3C]">{props.title}</span>
        <ChevronDown size={18} class={`shrink-0 text-[#4F4F4F] transition-transform ${open() ? "rotate-180" : ""}`} />
      </button>
      <Show when={open()}>
        <p class="animate-in pb-4 text-sm leading-6 text-[#6B6B6B]">{props.body}</p>
      </Show>
    </section>
  );
}

export default function PusatBantuan() {
  const user = createAsync(() => loadUser());
  const items = () => [...COMMON_HELP, ...HELP_BY_ROLE[user()?.role ?? "USER"]];

  return (
    <>
      <PageMeta page="helpCenter" />

      <div class="space-y-5">
        <PageHeader title="Pusat Bantuan" />
        <Card class="bg-gradient-to-br from-white to-[#F4F9F2] p-6">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="rounded-xl border border-[#C2C2C2] bg-white p-4">
              <p class="text-sm font-semibold text-[#186D3C]">Navigasi</p>
              <p class="mt-1 text-xs leading-5 text-[#6B6B6B]">
                Gunakan menu sidebar untuk berpindah halaman tanpa hard reload.
              </p>
            </div>
            <div class="rounded-xl border border-[#C2C2C2] bg-white p-4">
              <p class="text-sm font-semibold text-[#186D3C]">Realtime</p>
              <p class="mt-1 text-xs leading-5 text-[#6B6B6B]">
                Data Firebase akan tampil saat perangkat IoT mengirim node sesuai skema.
              </p>
            </div>
            <div class="rounded-xl border border-[#C2C2C2] bg-white p-4">
              <p class="text-sm font-semibold text-[#186D3C]">Akses</p>
              <p class="mt-1 text-xs leading-5 text-[#6B6B6B]">
                Setiap role hanya melihat fitur dan region yang sesuai hak aksesnya.
              </p>
            </div>
          </div>
        </Card>
        <Card class="p-6">
          <Suspense fallback={<div class="skeleton h-40 rounded-xl" />}>
            <div class="mb-2">
              <h2 class="text-lg font-bold text-[#4F4F4F]">FAQ</h2>
              <p class="mt-1 text-sm text-[#6B6B6B]">Pilih topik yang ingin dibuka.</p>
            </div>
            <div class="divide-y divide-gray-100">
              <For each={items()}>{(item, index) => <AccordionItem {...item} index={index()} />}</For>
            </div>
          </Suspense>
        </Card>
      </div>
    </>
  );
}
