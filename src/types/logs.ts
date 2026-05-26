import type { ActivityAction } from "@prisma/client";

export type ActivityLogItem = {
  id: string;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  actor: { name: string; email: string } | null;
  metadata: unknown;
};
