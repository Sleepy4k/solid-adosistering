import { PageMeta } from "~/components/shared/PageMeta";
import ActivityLogTable, { preloadLogs } from "~/features/logs/ActivityLogTable";

export const route = { preload: () => preloadLogs("auth") };

export default function LogAutentikasi() {
  return (
    <>
      <PageMeta page="authLog" />
      <ActivityLogTable category="auth" title="Log Autentikasi" />
    </>
  );
}
