/** Pieces shared by the workspace sidebar and the tab strip. */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { snoozeWakeLabel } from "@t3tools/client-runtime/state/thread-settled";
import { useState } from "react";

import type { ThreadStatusPill } from "../../components/Sidebar.logic";
import { Button } from "../../components/ui/button";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { cn } from "../../lib/utils";
import { useQuietThreadShell } from "../../state/entities";
import { reportThreadAction, useWorkspaceNavigation } from "./useWorkspaces";
import { threadShellKey, type WorkspaceTab } from "./workspaces.logic";

const SETTLED_PREVIEW_COUNT = 10;

function wakeLabel(snoozedUntil: string): string {
  return snoozeWakeLabel(snoozedUntil, { now: new Date().toISOString() });
}

/** The status dot of a tab or a workspace; nothing when idle. */
export function StatusDot(props: {
  readonly status: ThreadStatusPill | null;
  readonly className?: string;
}) {
  const { status } = props;
  if (status === null) return null;
  return (
    <span
      role="img"
      aria-label={status.label}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status.dotClass,
        status.pulse && "motion-safe:animate-status-pulse",
        props.className,
      )}
    />
  );
}

/** The thread and workspace the route shows: a server thread, or a draft's project. */
export function useRouteWorkspaceRef(): {
  readonly threadKey: string | null;
  readonly projectRef: { readonly environmentId: string; readonly projectId: string } | null;
} {
  const target = useThreadRouteTarget();
  const thread = useQuietThreadShell(target?.kind === "server" ? target.threadRef : null);
  const draft = useComposerDraftStore((store) =>
    target?.kind === "draft" ? store.getDraftSession(target.draftId) : null,
  );
  if (thread) {
    return {
      threadKey: threadShellKey(thread),
      projectRef: { environmentId: thread.environmentId, projectId: thread.projectId },
    };
  }
  if (draft) {
    return {
      threadKey: null,
      projectRef: { environmentId: draft.environmentId, projectId: draft.projectId },
    };
  }
  return { threadKey: null, projectRef: null };
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
              <StatusDot status={tab.status} />
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
