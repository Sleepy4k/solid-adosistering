import { query } from "@solidjs/router";
import { getRegionsForConfig, type RegionConfigQuery } from "~/server/actions/regions";
import { getMapDisplayConfig } from "~/server/actions/map";
import { DEFAULT_PAGE_SIZE } from "~/lib/shared/regionTable";

export const loadRegionsConfig = query((q: RegionConfigQuery) => getRegionsForConfig(q), "superadmin-regions-config");
export const loadMapDisplayConfig = query(() => getMapDisplayConfig(), "superadmin-map-display-config");

/** First-page query used by route preloading; matches the section's initial state. */
export const DEFAULT_REGION_CONFIG_QUERY: RegionConfigQuery = { limit: DEFAULT_PAGE_SIZE, offset: 0 };
