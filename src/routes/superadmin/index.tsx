import { PageMeta } from "~/components/shared/PageMeta";
import { PageHeader } from "~/components/ui/PageHeader";
import { loadRegionsConfig, loadMapDisplayConfig } from "~/features/superadmin/loaders";
import { loadWebConfig } from "~/lib/shared/webConfig";
import { RegionConfigSection } from "~/features/superadmin/RegionConfigSection";
import { WebConfigSection } from "~/features/superadmin/WebConfigSection";
import { MapDisplayConfigSection } from "~/features/superadmin/MapDisplayConfigSection";

export const route = {
  preload: () => Promise.all([loadRegionsConfig(), loadWebConfig(), loadMapDisplayConfig()]),
};

export default function SuperadminSettings() {
  return (
    <>
      <PageMeta page="home" />

      <div class="space-y-5">
        <PageHeader title="Pengaturan Superadmin" />
        <RegionConfigSection />
        <WebConfigSection />
        <MapDisplayConfigSection />
      </div>
    </>
  );
}
