/** Sortable columns of the user list. Mapped to real columns server-side only. */
export const USER_SORT_KEYS = ["name", "email", "whatsapp", "role", "status", "createdAt"] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];
