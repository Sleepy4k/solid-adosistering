import type { TableSort } from "./tableSort";

/** Sort keys accepted by the region tables; the server maps them to Prisma orderBy. */
export const REGION_LIST_SORT_KEYS = [
  "name",
  "description",
  "blocks",
  "admins",
  "automaticMode",
  "firebaseSyncStatus",
  "createdAt",
] as const;
export type RegionListSortKey = (typeof REGION_LIST_SORT_KEYS)[number];

export const REGION_CONFIG_SORT_KEYS = ["name", "volumeDivider", "showWindDirection", "showAutoIrrigation"] as const;
export type RegionConfigSortKey = (typeof REGION_CONFIG_SORT_KEYS)[number];

export const REGION_SUMMARY_SORT_KEYS = ["name", "description", "blocks", "admins", "firebaseSyncStatus"] as const;
export type RegionSummarySortKey = (typeof REGION_SUMMARY_SORT_KEYS)[number];

export const ADMIN_USER_SORT_KEYS = ["name", "email", "city", "isActive", "createdAt"] as const;
export type AdminUserSortKey = (typeof ADMIN_USER_SORT_KEYS)[number];

export const ADMIN_ACCOUNT_FILTERS = ["active", "inactive", "attention"] as const;
export type AdminAccountFilter = (typeof ADMIN_ACCOUNT_FILTERS)[number];

export const SYNC_STATUS_FILTERS = ["SYNCED", "PENDING", "FAILED"] as const;

/** Wire shape for every server-paged list in this area. */
export type PagedQuery<K extends string> = {
  search?: string;
  limit?: number;
  offset?: number;
  sort?: TableSort<K>;
};

export type Paged<T> = { items: T[]; total: number };

export const DEFAULT_PAGE_SIZE = 10;
