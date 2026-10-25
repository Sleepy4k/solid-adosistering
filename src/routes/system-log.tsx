import { PageMeta } from "~/components/shared/PageMeta";
import ActivityLogTable, { preloadLogs } from "~/features/logs/ActivityLogTable";

export const route = { preload: () => preloadLogs("system") };

export default function LogSistem() {
  return (
    <>
      <PageMeta page="systemLog" />
      <ActivityLogTable category="system" title="Log Sistem" />
    </>
  );
}
