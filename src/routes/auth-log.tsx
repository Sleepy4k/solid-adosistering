import { ActivityLogPage, preloadActivityLogs } from "~/features/logs/ActivityLogPage";

export const route = { preload: () => preloadActivityLogs("auth") };

export default function LogAutentikasi() {
  return <ActivityLogPage category="auth" title="Log Autentikasi" meta="authLog" />;
}
