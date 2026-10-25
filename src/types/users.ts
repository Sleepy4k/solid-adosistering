import type { Role } from "@prisma/client";

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  whatsapp: string | null;
  regions: { id: string; name: string }[];
  createdAt: Date;
  /** Never logged in nor set a password yet: the set-password link can be resent. */
  pendingSetup: boolean;
};
