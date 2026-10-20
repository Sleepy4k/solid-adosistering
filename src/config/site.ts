function resolveSiteUrl() {
  const raw = import.meta.env.VITE_SITE_URL?.trim();
  if (!raw) return "https://adosistering.labgo.id";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://adosistering.labgo.id";
  }
}

export const siteConfig = {
  name: "Adosistering",
  legalName: "Adosistering",
  url: resolveSiteUrl(),
  description:
    "Adosistering adalah sistem manajemen irigasi tetes cerdas berbasis IoT untuk lahan kering: monitoring kelembapan tanah, kontrol sprayer real-time, riwayat irigasi, statistik, dan administrasi region berbasis peran.",
  shortDescription: "Sistem irigasi tetes cerdas berbasis IoT untuk lahan kering.",
  locale: "id_ID",
  language: "id-ID",
  themeColor: "#67B744",
  backgroundColor: "#F7FBF5",
  socialImage: "/og-image.png",
  socialImageWidth: 1200,
  socialImageHeight: 630,
  socialImageType: "image/png",
  twitterHandle: import.meta.env.VITE_TWITTER_HANDLE?.trim() || "@adosistering",
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL?.trim() || "adosisteringteam@gmail.com",
  keywords: [
    "irigasi tetes",
    "irigasi cerdas",
    "IoT pertanian",
    "monitoring kelembapan tanah",
    "kontrol sprayer",
    "lahan kering",
    "Adosistering",
    "sistem irigasi otomatis",
    "smart farming Indonesia",
    "dashboard irigasi",
  ],
  sameAs: ["https://www.instagram.com/adosistering", "https://www.linkedin.com/company/adosistering"],
  foundingDate: "2024",
  areaServed: "Indonesia",
} as const;
