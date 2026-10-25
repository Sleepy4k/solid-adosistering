/**
 * Shared contract for server-side table sorting. The client only ever sends a
 * column KEY and a direction; the server maps the key through an allow-list to
 * a real column, so no client string reaches an ORDER BY.
 */

export type SortDir = "asc" | "desc";

export type TableSort<K extends string = string> = { key: K; dir: SortDir };

export const SORT_DIRS = ["asc", "desc"] as const;

/** Next state when a header is clicked: new column -> asc, same -> flip. */
export function nextSort<K extends string>(current: TableSort<K> | null, key: K): TableSort<K> {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

/**
 * Validate an incoming sort against the allowed column keys, falling back to
 * `fallback` when it is missing or not allowed.
 */
export function resolveSort<K extends string>(
  allowed: readonly K[],
  input: { key?: string | undefined; dir?: string | undefined } | null | undefined,
  fallback: TableSort<K>,
): TableSort<K> {
  const key = allowed.find((candidate) => candidate === input?.key);
  if (!key) return fallback;
  return { key, dir: input?.dir === "desc" ? "desc" : "asc" };
}
