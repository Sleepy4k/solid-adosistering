import { cache, redirect } from "@solidjs/router";
import { getSession } from "./session";
import type { Role } from "~/lib/shared/irrigation";

export type { SessionUser } from "./session";

export const getUser = cache(async () => {
  "use server";
  const session = await getSession();
  if (!session) throw redirect("/login");
  return session;
}, "current-user");

export const getOptionalUser = cache(async () => {
  "use server";
  return await getSession();
}, "optional-user");

export const redirectIfLoggedIn = cache(async () => {
  "use server";
  const session = await getSession();
  if (session) throw redirect("/dashboard");
  return null;
}, "redirect-if-logged-in");

export function hasRole(role: Role, minimum: Role): boolean {
  const rank: Record<Role, number> = { USER: 1, ADMIN: 2, SUPERADMIN: 3 };
  return rank[role] >= rank[minimum];
}
