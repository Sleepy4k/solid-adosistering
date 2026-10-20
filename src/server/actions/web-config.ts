"use server";

import type { Prisma } from "@prisma/client";
import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin, sanitizeImageUrl } from "../security";
import { getSession } from "../session";
import { logActivity } from "./_helpers";
import { parseInput, webConfigSchema } from "../validation";
import type { WebConfig } from "~/types/web-config";

export type { WebConfig };

export async function getWebConfig(): Promise<WebConfig> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "webConfig" } });
  const defaults: WebConfig = {
    projectName: "Adosistering",
    logoUrl: null,
    iconUrl: null,
    primaryColor: "#67B744",
    tagline: "Sistem Irigasi Cerdas Berbasis IoT untuk Mengoptimalkan Pengairan Lahan Kering",
  };
  if (!setting?.value) return defaults;
  const stored = setting.value as Partial<WebConfig>;
  const storedColor = stored.primaryColor;
  const primaryColor = storedColor && /^#[0-9a-fA-F]{6}$/.test(storedColor) ? storedColor : defaults.primaryColor;
  return {
    ...defaults,
    ...stored,
    logoUrl: sanitizeImageUrl(stored.logoUrl),
    iconUrl: sanitizeImageUrl(stored.iconUrl),
    primaryColor,
  };
}

export async function saveWebConfig(input: WebConfig) {
  const data = parseInput(webConfigSchema, input);
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "webConfig" },
    create: { key: "webConfig", value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "webConfig",
  });
  return { ok: true };
}
