/** Pieces shared by the workspace sidebar and the tab strip. */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { snoozeWakeLabel } from "@t3tools/client-runtime/state/thread-settled";
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
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { useThreadActions } from "../../hooks/useThreadActions";
import { cn } from "../../lib/utils";
import { reportThreadAction, useWorkspaceNavigation } from "./useWorkspaces";
import type { TabStatus, TabStatusKind, WorkspaceTab } from "./workspaces.logic";

const SETTLED_PREVIEW_COUNT = 10;

function wakeLabel(snoozedUntil: string): string {
  return snoozeWakeLabel(snoozedUntil, { now: new Date().toISOString() });
}

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

/**
 * A list of tabs for the popovers: Needs you, Snoozed, Settled, and the strip's `+N`. A row opens
 * its tab; snoozed rows offer Wake and settled rows Un-settle.
 */
export function TabList(props: {
  readonly tabs: readonly WorkspaceTab[];
  readonly kind: "needs-you" | "snoozed" | "settled";
  readonly workspaceNameOf?: (tab: WorkspaceTab) => string | null;
  readonly onOpened?: () => void;
  readonly emptyLabel: string;
}) {
  const { tabs, kind } = props;
  const { openThread } = useWorkspaceNavigation();
  const { unsnoozeThread, unsettleThread } = useThreadActions();
  const [showAll, setShowAll] = useState(false);
  const shown = kind === "settled" && !showAll ? tabs.slice(0, SETTLED_PREVIEW_COUNT) : tabs;
  if (tabs.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">{props.emptyLabel}</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5 p-1">
      {shown.map((tab) => {
        const ref = scopeThreadRef(tab.thread.environmentId, tab.thread.id);
        const workspaceName = props.workspaceNameOf?.(tab) ?? null;
        return (
          <li key={tab.key} className="flex items-center gap-1">
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => {
                openThread(tab.thread);
                props.onOpened?.();
              }}
            >
              <StatusIcon status={tab.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{tab.thread.title}</span>
                {workspaceName !== null || (kind === "needs-you" && tab.status) ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[kind === "needs-you" ? tab.status?.label : null, workspaceName]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </span>
              {kind === "snoozed" && tab.thread.snoozedUntil ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {wakeLabel(tab.thread.snoozedUntil)}
                </span>
              ) : null}
            </button>
            {kind === "snoozed" ? (
              <Button
                size="compact"
                variant="ghost"
                onClick={() =>
                  void reportThreadAction("Failed to wake thread", () => unsnoozeThread(ref))
                }
              >
                Wake
              </Button>
            ) : null}
            {kind === "settled" ? (
              <Button
                size="compact"
                variant="ghost"
                onClick={() =>
                  void reportThreadAction("Failed to un-settle thread", () => unsettleThread(ref))
                }
              >
                Un-settle
              </Button>
            ) : null}
          </li>
        );
      })}
      {kind === "settled" && !showAll && tabs.length > SETTLED_PREVIEW_COUNT ? (
        <li>
          <Button
            size="compact"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setShowAll(true)}
          >
            Show all settled ({tabs.length})
          </Button>
        </li>
      ) : null}
    </ul>
  );
}
