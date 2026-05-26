export function RestrictedSettings(_props: { role: "SUPERADMIN" }) {
  return (
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      Menu Pengaturan hanya tersedia untuk User dan Admin. Role Superadmin mengelola konfigurasi dari menu khususnya.
    </div>
  );
}
