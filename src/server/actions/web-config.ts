"use server";

import type { Prisma } from "@prisma/client";
import { ActivityAction } from "@prisma/client";
import { redirect } from "@solidjs/router";
import { prisma } from "../db/prisma";
import { assertSuperadmin } from "../security";
import { getSession } from "../session";
import { logActivity } from "./_helpers";
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
  return { ...defaults, ...(setting.value as Partial<WebConfig>) };
}

export async function saveWebConfig(input: WebConfig) {
  const session = await getSession();
  if (!session) throw redirect("/login");
  assertSuperadmin(session);

  await prisma.systemSetting.upsert({
    where: { key: "webConfig" },
    create: { key: "webConfig", value: input as unknown as Prisma.InputJsonValue },
    update: { value: input as unknown as Prisma.InputJsonValue },
  });
  await logActivity({
    actorId: session.id,
    action: ActivityAction.UPDATE,
    entityType: "SystemSetting",
    entityId: "webConfig",
  });
  return { ok: true };
}
