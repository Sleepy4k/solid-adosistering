import { PageMeta } from "~/components/shared/PageMeta";
import { ActivityLogView, preloadActivityLogs } from "~/features/logs/ActivityLogPage";

export const route = { preload: () => preloadActivityLogs("auth") };

export default function LogAutentikasi() {
  return (
    <>
      <PageMeta page="authLog" />
      <ActivityLogView category="auth" title="Log Autentikasi" />
    </>
  );
}
