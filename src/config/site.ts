export const siteConfig = {
  name: "Adosistering",
  url: import.meta.env.VITE_SITE_URL ?? "https://adosistering.local",
  description:
    "IoT drip irrigation management system for dryland farming with Firebase RTDB telemetry and SQL-backed administration.",
  locale: "id_ID",
  themeColor: "#67B744",
  socialImage: "/logo.svg",
} as const;
