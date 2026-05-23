import type { ActivityAction } from "@prisma/client";
import { ACTION_COLORS, ACTION_LABELS } from "~/constants/activity-log";

type ActionBadgeProps = {
  action: ActivityAction;
};

export default function ActionBadge(props: ActionBadgeProps) {
  const label = ACTION_LABELS[props.action] ?? props.action;
  const color = ACTION_COLORS[props.action] ?? "bg-slate-100 text-slate-600";
  return <span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>;
}
