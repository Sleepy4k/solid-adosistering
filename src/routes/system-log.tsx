import { ActivityLogPage, preloadActivityLogs } from "~/features/logs/ActivityLogPage";

export const route = { preload: () => preloadActivityLogs("system") };

export default function LogSistem() {
  return <ActivityLogPage category="system" title="Log Sistem" meta="systemLog" />;
}
