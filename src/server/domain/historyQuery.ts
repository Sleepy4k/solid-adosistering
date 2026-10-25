import "server-only";

import { IrrigationMode, type Prisma, RelayState } from "@prisma/client";
import type { SessionUser } from "../auth/session";
import { prisma } from "../db/prisma";
import { getScopedBlockIds, getScopedRegionIds } from "./access";

/**
 * Filters shared by the paginated history list and the monthly CSV export.
 * Keeping them in one place guarantees both read paths apply identical
 * scoping (role/region/block) and identical event filters.
 */
export type HistoryScopeFilters = {
  regionId?: string;
  blockId?: string;
  status?: "ON" | "OFF";
  mode?: "AUTO" | "MANUAL";
  startedAt?: { gte?: Date; lt?: Date };
};

/**
 * Resolve the user's effective block scope for the requested region/block.
 * An unknown or out-of-scope region intentionally yields an empty id list so
 * the caller produces an empty result instead of leaking another region.
 */
async function resolveScopedBlockIds(
  session: SessionUser,
  regionId: string | undefined,
  blockId: string | undefined,
): Promise<string[]> {
  if (regionId && !blockId) {
    const scopedRegionIds = await getScopedRegionIds(session);
    const allowed = scopedRegionIds ? scopedRegionIds.includes(regionId) : true;
    if (!allowed) return [];

    const blocks = await prisma.block.findMany({
      where: { regionId },
      select: { id: true },
    });
    return blocks.map((block) => block.id);
  }

  const scopedBlockIds = await getScopedBlockIds(session, blockId);
  if (!regionId) return scopedBlockIds;

  const regionBlocks = new Set(
    (await prisma.block.findMany({ where: { regionId }, select: { id: true } })).map((block) => block.id),
  );
  return scopedBlockIds.filter((id) => regionBlocks.has(id));
}

/**
 * Block ids the session may see for the requested region/block, or `null`
 * when the scope is unrestricted (SUPERADMIN without region/block filters).
 */
export async function resolveHistoryBlockScope(
  session: SessionUser,
  filters: Pick<HistoryScopeFilters, "regionId" | "blockId">,
): Promise<string[] | null> {
  if (session.role !== "SUPERADMIN" || filters.blockId || filters.regionId) {
    return resolveScopedBlockIds(session, filters.regionId, filters.blockId);
  }
  return null;
}

/**
 * Build the Prisma `where` for irrigation events visible to `session`.
 *
 * - SUPERADMIN without explicit filters sees every event.
 * - ADMIN/USER (and any explicit region/block filter) are constrained to the
 *   blocks resolved by `getScopedBlockIds` / `getScopedRegionIds`.
 * - Cursor pagination is intentionally excluded: callers add their own
 *   keyset predicate after merging this filter.
 */
export async function buildIrrigationEventWhere(
  session: SessionUser,
  filters: HistoryScopeFilters,
): Promise<Prisma.IrrigationEventWhereInput> {
  const where: Prisma.IrrigationEventWhereInput = {};

  const scopedBlockIds = await resolveHistoryBlockScope(session, filters);
  if (scopedBlockIds) where.sprayer = { blockId: { in: scopedBlockIds } };

  if (filters.status) where.relay = filters.status === "ON" ? RelayState.ON : RelayState.OFF;
  if (filters.mode) where.mode = filters.mode === "AUTO" ? IrrigationMode.AUTO : IrrigationMode.MANUAL;

  const startedAt: Prisma.DateTimeFilter = {};
  if (filters.startedAt?.gte) startedAt.gte = filters.startedAt.gte;
  if (filters.startedAt?.lt) startedAt.lt = filters.startedAt.lt;
  if (startedAt.gte || startedAt.lt) where.startedAt = startedAt;

  return where;
}
