import "server-only";

import { ActivityAction, Role, type SyncStatus } from "@prisma/client";
import { z } from "zod";
import { ACTION_LABELS } from "~/constants/activity-log";
import { formatJakartaDateTime } from "~/lib/shared/datetime";
import type { SessionUser } from "~/server/auth/session";
import { prisma } from "~/server/db/prisma";
import {
  AUTH_ACTIVITY_ACTIONS,
  buildActivityLogWhere,
  type ActivityLogCategory,
} from "~/server/domain/activityLogQuery";
import { loadRegionList } from "~/server/domain/regionList";
import { buildUserListWhere } from "~/server/domain/userListQuery";
import type { ExportColumn, ExportRow } from "./table";

/**
 * Exportable admin tables served by `/api/export/[dataset]`. Each dataset
 * reuses the scoping of the page it mirrors, so an export never contains rows
 * the page would hide from the same session.
 */

export type ExportDateRange = { readonly gte: Date; readonly lt: Date };

/** Lazily evaluated reads for one export request. */
export type PreparedExport = {
  readonly count: () => Promise<number>;
  /** Rows in export order, at most `take`. */
  readonly rows: (take: number) => Promise<ExportRow[]>;
};

type DatasetDefinition<F> = {
  readonly title: string;
  readonly filenamePrefix: string;
  /** Logs must be exported per date range; lists may export everything. */
  readonly dateRange: "required" | "optional";
  /** What the date range filters on, shown in the PDF intro. */
  readonly dateField: string;
  /** Newest-first datasets keep the newest rows when over the cap. */
  readonly order: "newest-first" | "page-order";
  readonly columns: readonly ExportColumn[];
  readonly allow: (session: SessionUser) => boolean;
  readonly filterSchema: z.ZodType<F>;
  readonly describeFilters: (filters: F) => string[];
  /** `null` means nothing is in scope; the request then yields no rows. */
  readonly prepare: (session: SessionUser, filters: F, range?: ExportDateRange) => Promise<PreparedExport | null>;
};

export type ExportDataset = Omit<DatasetDefinition<unknown>, "filterSchema" | "describeFilters" | "prepare"> & {
  /** Validate dataset filters from the query string, then build the reads. */
  readonly open: (
    session: SessionUser,
    params: Record<string, string>,
    range?: ExportDateRange,
  ) => Promise<{ readonly error: string } | { readonly filters: string[]; readonly prepared: PreparedExport | null }>;
};

function defineDataset<F>(definition: DatasetDefinition<F>): ExportDataset {
  const { filterSchema, describeFilters, prepare, ...meta } = definition;
  return {
    ...meta,
    async open(session, params, range) {
      const parsed = filterSchema.safeParse(params);
      if (!parsed.success) return { error: "Filter ekspor tidak valid." };
      return { filters: describeFilters(parsed.data), prepared: await prepare(session, parsed.data, range) };
    },
  };
}

const EMPTY_FILTERS = z.object({});

const isAdminOrHigher = (session: SessionUser) => session.role === "ADMIN" || session.role === "SUPERADMIN";
const isSuperadmin = (session: SessionUser) => session.role === "SUPERADMIN";

const activeLabel = (active: boolean) => (active ? "Aktif" : "Nonaktif");
const dateTime = (value: Date | string | null) => (value ? formatJakartaDateTime(value) : null);

const ROLE_LABELS: Record<Role, string> = { SUPERADMIN: "Superadmin", ADMIN: "Admin", USER: "User" };
const SYNC_LABELS: Record<SyncStatus, string> = { SYNCED: "Tersinkron", PENDING: "Menunggu", FAILED: "Gagal" };

function activityLogDataset(category: ActivityLogCategory, title: string, filenamePrefix: string) {
  const inCategory = (action: ActivityAction) => AUTH_ACTIVITY_ACTIONS.includes(action) === (category === "auth");
  return defineDataset({
    title,
    filenamePrefix,
    dateRange: "required",
    dateField: "Periode",
    order: "newest-first",
    columns: [
      { header: "Waktu (WIB)", xlsxWidth: 30, pdfWeight: 82 },
      { header: "Aktor", xlsxWidth: 24, pdfWeight: 60 },
      { header: "Email Aktor", xlsxWidth: 30, pdfWeight: 78 },
      { header: "Aksi", xlsxWidth: 20, pdfWeight: 46 },
      { header: "Entitas", xlsxWidth: 22, pdfWeight: 50 },
      { header: "ID Entitas", xlsxWidth: 30, pdfWeight: 72 },
    ],
    allow: isAdminOrHigher,
    filterSchema: z.object({
      action: z.enum(ActivityAction).refine(inCategory, "Tipe aksi tidak sesuai dengan log ini.").optional(),
    }),
    describeFilters: (filters) =>
      filters.action ? [`Tipe aksi: ${ACTION_LABELS[filters.action] ?? filters.action}`] : [],
    async prepare(session, filters, range) {
      const where = await buildActivityLogWhere(session, {
        category,
        ...(filters.action ? { action: filters.action } : {}),
        ...(range ? { createdAt: range } : {}),
      });
      if (!where) return null;
      return {
        count: () => prisma.activityLog.count({ where }),
        async rows(take) {
          const logs = await prisma.activityLog.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            select: {
              createdAt: true,
              action: true,
              entityType: true,
              entityId: true,
              actor: { select: { name: true, email: true } },
            },
          });
          return logs.map((log) => [
            formatJakartaDateTime(log.createdAt, { seconds: true }),
            log.actor?.name ?? "Sistem",
            log.actor?.email ?? null,
            ACTION_LABELS[log.action] ?? log.action,
            log.entityType,
            log.entityId,
          ]);
        },
      };
    },
  });
}

/** CMS lists share one shape: ordered by `sortOrder`, filtered by `createdAt`. */
function cmsWhere(range?: ExportDateRange) {
  return range ? { createdAt: range } : {};
}

const CMS_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

export const EXPORT_DATASETS = {
  "auth-log": activityLogDataset("auth", "Log Autentikasi", "log-autentikasi"),
  "system-log": activityLogDataset("system", "Log Sistem", "log-sistem"),

  users: defineDataset({
    title: "Daftar User",
    filenamePrefix: "daftar-user",
    dateRange: "optional",
    dateField: "Tanggal bergabung",
    order: "page-order",
    columns: [
      { header: "Nama", xlsxWidth: 26, pdfWeight: 70 },
      { header: "Email", xlsxWidth: 30, pdfWeight: 84 },
      { header: "WhatsApp", xlsxWidth: 18, pdfWeight: 52 },
      { header: "Role", xlsxWidth: 12, pdfWeight: 36 },
      { header: "Region", xlsxWidth: 30, pdfWeight: 80 },
      { header: "Status", xlsxWidth: 12, pdfWeight: 34 },
      { header: "Bergabung (WIB)", xlsxWidth: 28, pdfWeight: 74 },
    ],
    allow: isAdminOrHigher,
    filterSchema: z.object({
      role: z.enum(Role).optional(),
      search: z.string().trim().max(100).optional(),
    }),
    describeFilters: (filters) => [
      ...(filters.role ? [`Role: ${ROLE_LABELS[filters.role]}`] : []),
      ...(filters.search ? [`Pencarian: "${filters.search}"`] : []),
    ],
    async prepare(session, filters, range) {
      const where = await buildUserListWhere(session, {
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(range ? { createdAt: range } : {}),
      });
      if (!where) return null;
      return {
        count: () => prisma.user.count({ where }),
        async rows(take) {
          const users = await prisma.user.findMany({
            where,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take,
            select: {
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
              profile: { select: { whatsapp: true } },
              assignedRegions: { select: { region: { select: { name: true } } } },
              administeredRegions: { select: { region: { select: { name: true } } } },
            },
          });
          return users.map((user) => {
            const regions = user.role === "ADMIN" ? user.administeredRegions : user.assignedRegions;
            return [
              user.name,
              user.email,
              user.profile?.whatsapp ?? null,
              ROLE_LABELS[user.role],
              regions.map((row) => row.region.name).join(", ") || null,
              activeLabel(user.isActive),
              formatJakartaDateTime(user.createdAt),
            ];
          });
        },
      };
    },
  }),

  regions: defineDataset({
    title: "Daftar Region",
    filenamePrefix: "daftar-region",
    dateRange: "optional",
    dateField: "Tanggal dibuat",
    order: "page-order",
    columns: [
      { header: "Nama Region", xlsxWidth: 24, pdfWeight: 62 },
      { header: "Deskripsi", xlsxWidth: 36, pdfWeight: 86 },
      { header: "Latitude", xlsxWidth: 18, pdfWeight: 44, align: "right" },
      { header: "Longitude", xlsxWidth: 18, pdfWeight: 46, align: "right" },
      { header: "Jumlah Blok", xlsxWidth: 12, pdfWeight: 30, numeric: true, align: "right" },
      { header: "Sprayer Aktif", xlsxWidth: 14, pdfWeight: 34, numeric: true, align: "right" },
      { header: "Admin", xlsxWidth: 28, pdfWeight: 66 },
      { header: "Mode Otomatis", xlsxWidth: 14, pdfWeight: 38 },
      { header: "Firebase", xlsxWidth: 14, pdfWeight: 36 },
      { header: "Sinkron Terakhir (WIB)", xlsxWidth: 28, pdfWeight: 70 },
      { header: "Dibuat (WIB)", xlsxWidth: 28, pdfWeight: 70 },
    ],
    allow: isSuperadmin,
    filterSchema: EMPTY_FILTERS,
    describeFilters: () => [],
    async prepare(_session, _filters, range) {
      const regions = await loadRegionList(range ? { createdAt: range } : {});
      return {
        count: async () => regions.length,
        rows: async (take) =>
          regions
            .slice(0, take)
            .map((region) => [
              region.name,
              region.description,
              region.latitude === null ? null : String(region.latitude),
              region.longitude === null ? null : String(region.longitude),
              region._count.blocks,
              region.sprayerCount,
              region.adminAssignments.map((row) => row.admin.name).join(", ") || null,
              activeLabel(region.automaticMode),
              SYNC_LABELS[region.firebaseSyncStatus],
              dateTime(region.firebaseSyncedAt),
              formatJakartaDateTime(region.createdAt),
            ]),
      };
    },
  }),

  testimonials: defineDataset({
    title: "Testimoni Landing Page",
    filenamePrefix: "testimoni",
    dateRange: "optional",
    dateField: "Tanggal dibuat",
    order: "page-order",
    columns: [
      { header: "Urutan", xlsxWidth: 10, pdfWeight: 26, numeric: true, align: "right" },
      { header: "Nama", xlsxWidth: 22, pdfWeight: 56 },
      { header: "Peran", xlsxWidth: 30, pdfWeight: 70 },
      { header: "Kutipan", xlsxWidth: 60, pdfWeight: 150 },
      { header: "URL Foto", xlsxWidth: 36, pdfWeight: 70 },
      { header: "Status", xlsxWidth: 12, pdfWeight: 34 },
      { header: "Dibuat (WIB)", xlsxWidth: 28, pdfWeight: 70 },
      { header: "Diperbarui (WIB)", xlsxWidth: 28, pdfWeight: 70 },
    ],
    allow: isSuperadmin,
    filterSchema: EMPTY_FILTERS,
    describeFilters: () => [],
    async prepare(_session, _filters, range) {
      const where = cmsWhere(range);
      return {
        count: () => prisma.landingTestimonial.count({ where }),
        async rows(take) {
          const items = await prisma.landingTestimonial.findMany({ where, orderBy: CMS_ORDER, take });
          return items.map((item) => [
            item.sortOrder,
            item.name,
            item.role,
            item.quote,
            item.imageUrl,
            activeLabel(item.isActive),
            formatJakartaDateTime(item.createdAt),
            formatJakartaDateTime(item.updatedAt),
          ]);
        },
      };
    },
  }),

  locations: defineDataset({
    title: "Lokasi Implementasi",
    filenamePrefix: "lokasi-implementasi",
    dateRange: "optional",
    dateField: "Tanggal dibuat",
    order: "page-order",
    columns: [
      { header: "Urutan", xlsxWidth: 10, pdfWeight: 26, numeric: true, align: "right" },
      { header: "Nama", xlsxWidth: 30, pdfWeight: 70 },
      { header: "Deskripsi", xlsxWidth: 60, pdfWeight: 160 },
      { header: "URL Gambar", xlsxWidth: 36, pdfWeight: 70 },
      { header: "Status", xlsxWidth: 12, pdfWeight: 34 },
      { header: "Dibuat (WIB)", xlsxWidth: 28, pdfWeight: 70 },
      { header: "Diperbarui (WIB)", xlsxWidth: 28, pdfWeight: 70 },
    ],
    allow: isSuperadmin,
    filterSchema: EMPTY_FILTERS,
    describeFilters: () => [],
    async prepare(_session, _filters, range) {
      const where = cmsWhere(range);
      return {
        count: () => prisma.landingLocation.count({ where }),
        async rows(take) {
          const items = await prisma.landingLocation.findMany({ where, orderBy: CMS_ORDER, take });
          return items.map((item) => [
            item.sortOrder,
            item.name,
            item.description,
            item.imageUrl,
            activeLabel(item.isActive),
            formatJakartaDateTime(item.createdAt),
            formatJakartaDateTime(item.updatedAt),
          ]);
        },
      };
    },
  }),

  partners: defineDataset({
    title: "Mitra Landing Page",
    filenamePrefix: "mitra",
    dateRange: "optional",
    dateField: "Tanggal dibuat",
    order: "page-order",
    columns: [
      { header: "Urutan", xlsxWidth: 10, pdfWeight: 26, numeric: true, align: "right" },
      { header: "Nama", xlsxWidth: 30, pdfWeight: 76 },
      { header: "URL Logo", xlsxWidth: 40, pdfWeight: 100 },
      { header: "Website", xlsxWidth: 40, pdfWeight: 100 },
      { header: "Status", xlsxWidth: 12, pdfWeight: 34 },
      { header: "Dibuat (WIB)", xlsxWidth: 28, pdfWeight: 70 },
      { header: "Diperbarui (WIB)", xlsxWidth: 28, pdfWeight: 70 },
    ],
    allow: isSuperadmin,
    filterSchema: EMPTY_FILTERS,
    describeFilters: () => [],
    async prepare(_session, _filters, range) {
      const where = cmsWhere(range);
      return {
        count: () => prisma.landingPartner.count({ where }),
        async rows(take) {
          const items = await prisma.landingPartner.findMany({ where, orderBy: CMS_ORDER, take });
          return items.map((item) => [
            item.sortOrder,
            item.name,
            item.logoUrl,
            item.websiteUrl,
            activeLabel(item.isActive),
            formatJakartaDateTime(item.createdAt),
            formatJakartaDateTime(item.updatedAt),
          ]);
        },
      };
    },
  }),
} satisfies Record<string, ExportDataset>;

export type ExportDatasetId = keyof typeof EXPORT_DATASETS;

export function getExportDataset(id: string): ExportDataset | null {
  return Object.hasOwn(EXPORT_DATASETS, id) ? EXPORT_DATASETS[id as ExportDatasetId] : null;
}
