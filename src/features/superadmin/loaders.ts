import { query } from "@solidjs/router";
import { getRegionsForConfig } from "~/server/actions/regions";
import { getMapDisplayConfig } from "~/server/actions/map";

export const loadRegionsConfig = query(() => getRegionsForConfig(), "superadmin-regions-config");
export const loadMapDisplayConfig = query(() => getMapDisplayConfig(), "superadmin-map-display-config");
