import { query, createAsync } from "@solidjs/router";
import { DEFAULT_WEB_CONFIG } from "~/constants/landing";
import { getWebConfig, type WebConfig } from "~/server/actions/index";

export const WEB_CONFIG_KEY = "web-config";

export const loadWebConfig = query(() => getWebConfig(), WEB_CONFIG_KEY);

export function useWebConfig(): () => WebConfig {
  const data = createAsync(() => loadWebConfig());
  return () => ({ ...DEFAULT_WEB_CONFIG, ...(data() ?? {}) });
}
