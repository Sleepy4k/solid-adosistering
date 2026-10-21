"use server";

import type { Prisma } from "@prisma/client";
import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { getPublicCached, invalidateWebConfigAndPublish } from "../cache";
import { cacheKeys, WEB_CONFIG_TTL_MS } from "../cache/keys";
import { prisma } from "../db/prisma";
import { assertSuperadmin, sanitizeImageUrl } from "../auth/security";
import { getSession } from "../auth/session";
import { logActivity } from "../domain";
import { parseInput, webConfigSchema } from "../validation";
import type { WebConfig } from "~/types/web-config";

export type { WebConfig };

/**
 * Public config read. A successful read (including the "no setting yet"
 * defaults) is cached for five minutes; another replica's write is observed
 * within ~12s via the shared cache version. A rejected Prisma read propagates
 * and is never cached.
 */
export async function getWebConfig(): Promise<WebConfig> {
  return getPublicCached(cacheKeys.webConfig, readWebConfig, WEB_CONFIG_TTL_MS);
}

async function readWebConfig(): Promise<WebConfig> {
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
  await invalidateWebConfigAndPublish();
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "webConfig",
  });
  return { ok: true };
}
