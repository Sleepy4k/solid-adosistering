import { createMemo, Show } from "solid-js";
import { saveSafetyTimeout } from "~/server/actions/index";
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
          <SafetyTimeoutPanel
            initialMin={props.settings.safetyTimeout.min}
            initialMax={props.settings.safetyTimeout.max}
            onSave={(min, max) => saveSafetyTimeout({ min, max })}
          />
        </>
      )}
    </Show>
  );
}
