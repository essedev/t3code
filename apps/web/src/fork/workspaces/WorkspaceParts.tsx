/** Pieces shared by the workspace sidebar and the tab strip. */
import {
  AlarmClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";
import type { TabStatus, TabStatusKind } from "./workspaces.logic";

// Upstream's sidebar icons and colours per state (`TOP_STATUS_ICONS` in
// components/sidebar/SidebarThreadRow.tsx), copied so the upstream file stays untouched.
const STATUS_ICONS: Record<
  TabStatusKind,
  { readonly icon: LucideIcon; readonly className: string }
> = {
  working: { icon: CircleDashedIcon, className: "text-info-foreground" },
  waiting: { icon: CircleDotDashedIcon, className: "text-muted-foreground" },
  approval: { icon: ShieldQuestionIcon, className: "text-warning-foreground" },
  input: { icon: MessageCircleQuestionIcon, className: "text-indigo-600 dark:text-indigo-300" },
  request: { icon: UserRoundIcon, className: "text-guest-foreground" },
  plan: { icon: ListTodoIcon, className: "text-violet-600 dark:text-violet-300" },
  failed: { icon: CircleAlertIcon, className: "text-error-foreground" },
  woke: { icon: AlarmClockIcon, className: "text-warning-foreground" },
  done: { icon: CircleCheckIcon, className: "text-success-foreground" },
};

/** The colour class of a status, for text that takes its tone. */
export function statusColorClass(status: TabStatus): string {
  return STATUS_ICONS[status.kind].className;
}

/** The status icon of a tab, a workspace or a group; nothing when idle. */
export function StatusIcon(props: {
  readonly status: TabStatus | null;
  readonly className?: string;
}) {
  const { status } = props;
  if (status === null) return null;
  const { icon: Icon, className } = STATUS_ICONS[status.kind];
  return (
    <Icon
      role="img"
      aria-label={status.label}
      className={cn("size-3.5 shrink-0", className, props.className)}
    />
  );
}

/** The shortcut a row answers to, shown while its modifier is held; upstream's jump hint look. */
export function ShortcutHint(props: { readonly label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-1.5 top-1/2 z-10 inline-flex h-5 -translate-y-1/2 items-center rounded-full border border-border/80 bg-background/95 px-1.5 font-mono text-3xs font-medium tracking-tight text-foreground shadow-sm"
    >
      {props.label}
    </span>
  );
}
