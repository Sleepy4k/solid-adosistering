import { query } from "@solidjs/router";
import { getRegionsForConfig, getMapDisplayConfig } from "~/server/actions/index";

export const loadRegionsConfig = query(() => getRegionsForConfig(), "superadmin-regions-config");
export const loadMapDisplayConfig = query(() => getMapDisplayConfig(), "superadmin-map-display-config");
