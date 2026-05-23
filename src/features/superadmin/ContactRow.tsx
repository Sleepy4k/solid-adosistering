import { createSignal, Show } from "solid-js";
import { useToast } from "~/components/shared/ToastProvider";
import { getContactSubmissions, markContactRead } from "~/server/actions/index";

type ContactRowData = Awaited<ReturnType<typeof getContactSubmissions>>[number];

type ContactRowProps = {
  contact: ContactRowData;
  onUpdate: () => void;
};

export default function ContactRow(props: ContactRowProps) {
  const { notify } = useToast();
  const [loading, setLoading] = createSignal(false);

  const toggle = async () => {
    setLoading(true);
    try {
      await markContactRead({ id: props.contact.id, isRead: !props.contact.isRead });
      props.onUpdate();
    } catch {
      notify({ kind: "error", title: "Gagal memperbarui status." });
    } finally {
      setLoading(false);
    }
  };

  const date = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(props.contact.createdAt));

  return (
    <tr class={`border-b border-gray-100 last:border-0 ${props.contact.isRead ? "opacity-60" : ""}`}>
      <td class="px-5 py-4">
        <p class="font-medium text-[#333]">{props.contact.name}</p>
        <p class="text-xs text-[#6B6B6B]">{props.contact.email}</p>
        <Show when={props.contact.phone}>
          <p class="text-xs text-[#6B6B6B]">{props.contact.phone}</p>
        </Show>
      </td>
      <td class="px-5 py-4 text-xs text-[#6B6B6B]">{props.contact.userType ?? "-"}</td>
      <td class="max-w-xs px-5 py-4 text-sm text-[#4F4F4F]">
        <p class="line-clamp-3 whitespace-pre-wrap">{props.contact.message}</p>
      </td>
      <td class="whitespace-nowrap px-5 py-4 text-xs text-[#6B6B6B]">{date}</td>
      <td class="px-5 py-4">
        <button
          type="button"
          disabled={loading()}
          onClick={toggle}
          class={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
            props.contact.isRead
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          }`}
        >
          {props.contact.isRead ? "Tandai Belum Dibaca" : "Tandai Dibaca"}
        </button>
      </td>
    </tr>
  );
}
