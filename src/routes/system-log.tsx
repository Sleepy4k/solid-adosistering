import { PageMeta } from "~/components/shared/PageMeta";
import { ActivityLogView, preloadActivityLogs } from "~/features/logs/ActivityLogPage";

export const route = { preload: () => preloadActivityLogs("system") };

export default function LogSistem() {
  return (
    <>
      <PageMeta page="systemLog" />
      <ActivityLogView category="system" title="Log Sistem" />
    </>
  );
}
