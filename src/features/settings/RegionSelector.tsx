import { SelectSearch } from "~/components/ui/SelectSearch";

export function RegionSelector(props: {
  regions: Array<{ id: string; name: string }>;
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const disabled = () => props.regions.length <= 1;
  return (
    <div class="rounded-2xl border border-[#C2C2C2] bg-white p-5">
      <label class="mb-2 block text-sm font-medium text-[#4F4F4F]">Region</label>
      <SelectSearch
        value={props.selectedId}
        options={props.regions.map((region) => ({ value: region.id, label: region.name }))}
        onChange={props.onChange}
        disabled={disabled()}
      />
    </div>
  );
}
