import { createMemo, Show } from "solid-js";
import { AutomaticModePanel } from "./AutomaticModePanel";
import { IrrigationControl } from "./IrrigationControl";
import { SafetyTimeoutPanel } from "./SafetyTimeoutPanel";
import type { UserSettingsData } from "./types";

export function UserSettings(props: { settings: UserSettingsData }) {
  const selectedRegion = createMemo(() => props.settings.regions[0]);

  return (
    <Show
      when={selectedRegion()}
      fallback={
        <div class="rounded-2xl border border-[#C2C2C2] bg-white p-8 text-center text-sm text-[#6B7280]">
          Belum ada region yang ditugaskan.
        </div>
      }
    >
      {(region) => (
        <>
          <IrrigationControl region={region()} />
          <AutomaticModePanel
            regionId={region().id}
            regionName={region().name}
            automaticMode={region().automaticMode}
            sprayerCount={region().sprayerCount}
            readOnly
          />
          <SafetyTimeoutPanel
            initialMin={region().safetyTimeout.min}
            initialMax={region().safetyTimeout.max}
            readOnly
            note="Pengaturan ini dikelola oleh Admin/operator region dan dikirim ke Firebase jika didukung."
          />
        </>
      )}
    </Show>
  );
}
