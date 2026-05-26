import { SquarePen } from "lucide-solid";

export function EditButton(props: { editing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="inline-flex items-center gap-2 rounded-lg border border-[#C2C2C2] px-4 py-2 text-sm text-[#4F4F4F] hover:bg-gray-50"
    >
      <SquarePen size={16} />
      {props.editing ? "Selesai" : "Edit"}
    </button>
  );
}
