import { createMemo, createSignal, Show } from "solid-js";
import { saveRegionSafetyTimeout } from "~/server/actions/index";
import { IrrigationControl } from "./IrrigationControl";
import { SafetyTimeoutPanel } from "./SafetyTimeoutPanel";
import { RegionSelector } from "./RegionSelector";
import type { AdminSettingsData } from "./types";

export function AdminSettings(props: { settings: AdminSettingsData }) {
  const [selectedRegionId, setSelectedRegionId] = createSignal(props.settings.regions[0]?.id ?? "");
  const selectedRegion = createMemo(
    () => props.settings.regions.find((region) => region.id === selectedRegionId()) ?? props.settings.regions[0],
  );

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
          <RegionSelector
            regions={props.settings.regions}
            selectedId={selectedRegionId()}
            onChange={setSelectedRegionId}
          />
          <IrrigationControl region={region()} />
          <SafetyTimeoutPanel
            initialMin={region().safetyTimeout.min}
            initialMax={region().safetyTimeout.max}
            onSave={(min, max) => saveRegionSafetyTimeout({ regionId: region().id, min, max })}
            note={`Fitur ini memastikan irigasi aktif dapat dimatikan otomatis untuk region ${region().name}.`}
          />
        </>
      )}
    </Show>
  );
}
