import "server-only";

import type { Prisma } from "@prisma/client";
import { serverConfig } from "../config";
import { hashToken, newOpaqueToken } from "./security";

/** First-time set-password links live longer than normal resets (30 min). */
export const PASSWORD_SETUP_TTL_HOURS = 72;

/**
 * Store a fresh token (hash only) and, by default, invalidate every earlier
 * unused one. Pass `revokeOthers: false` when the new link is not delivered
 * yet: revoke the old ones with `revokeOtherPasswordTokens` only after the
 * email was sent, so a failed send never kills the link the user already has.
 * Returns the plaintext link and the new token id; the caller must email the
 * link and never log it.
 */
export async function issuePasswordSetupToken(
  tx: Prisma.TransactionClient,
  userId: string,
  options: { revokeOthers?: boolean } = {},
) {
  const token = newOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_SETUP_TTL_HOURS * 60 * 60_000);
  if (options.revokeOthers ?? true) {
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  }
  const created = await tx.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
    select: { id: true },
  });
  return {
    tokenId: created.id,
    expiresAt,
    setPasswordUrl: `${serverConfig.appOrigin}/reset-password?token=${encodeURIComponent(token)}`,
  };
}
