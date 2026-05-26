import type { getMySettings } from "~/server/actions/settings";

export type Settings = Awaited<ReturnType<typeof getMySettings>>;
export type UserSettingsData = Extract<Settings, { role: "USER" }>;
export type AdminSettingsData = Extract<Settings, { role: "ADMIN" }>;
export type Preference = "KERING" | "LEMBAB" | "BASAH";
export type RegionThreshold = NonNullable<UserSettingsData["regions"][number]["threshold"]>;
export type SettingsRegion = { id: string; name: string; threshold: RegionThreshold | null };
export type AdminRegionSettings = SettingsRegion & { safetyTimeout: { min: number; max: number } };
