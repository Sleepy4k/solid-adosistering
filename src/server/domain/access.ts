import type { Prisma, Role } from "@prisma/client";
import type { SessionUser } from "../auth/security";
import { prisma } from "../db/prisma";

export async function getScopedRegionIds(session: SessionUser): Promise<string[] | null> {
  if (session.role === "SUPERADMIN") return null;
  if (session.role === "ADMIN") {
    const rows = await prisma.adminRegionAssignment.findMany({
      where: { adminId: session.id },
      select: { regionId: true },
    });
    return rows.map((row) => row.regionId);
  }
  const rows = await prisma.userRegionAssignment.findMany({
    where: { userId: session.id },
    select: { regionId: true },
  });
  return rows.map((row) => row.regionId);
}

export async function getScopedBlockIds(session: SessionUser, requestedBlockId?: string): Promise<string[]> {
  const regionIds = await getScopedRegionIds(session);
  const where: Prisma.BlockWhereInput = {
    ...(requestedBlockId ? { id: requestedBlockId } : {}),
    ...(regionIds ? { regionId: { in: regionIds } } : {}),
  };
  const blocks = await prisma.block.findMany({ where, select: { id: true } });
  return blocks.map((block) => block.id);
}

export async function assertRegionsAssignable(session: SessionUser, regionIds: string[], role: Role) {
  const uniqueIds = [...new Set(regionIds.filter(Boolean))];
  if (role === "USER" && uniqueIds.length !== 1) {
    throw new Response("User wajib di-assign tepat 1 region.", { status: 400 });
  }
  if (role === "ADMIN" && session.role === "SUPERADMIN" && uniqueIds.length === 0) {
    throw new Response("Admin wajib memiliki minimal 1 region.", { status: 400 });
  }
  if (uniqueIds.length > 0) {
    const found = await prisma.region.count({ where: { id: { in: uniqueIds } } });
    if (found !== uniqueIds.length) {
      throw new Response("Satu atau lebih region tidak ditemukan.", { status: 400 });
    }
  }
  if (session.role === "ADMIN") {
    if (role !== "USER") throw new Response("Admin hanya dapat membuat atau mengubah role User.", { status: 403 });
    const adminRegionIds = await getScopedRegionIds(session);
    if (!adminRegionIds || uniqueIds.some((id) => !adminRegionIds.includes(id))) {
      throw new Response("Region berada di luar hak akses admin.", { status: 403 });
    }
  }
  return uniqueIds;
}
