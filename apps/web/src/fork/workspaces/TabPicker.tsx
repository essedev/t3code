/**
 * The searchable thread lists of the workspace sidebar (Needs you, Snoozed, Settled) and of the
 * strip's `+N`, built on the command palette's parts so they look and type like Cmd+K.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { snoozeWakeLabel } from "@t3tools/client-runtime/state/thread-settled";
import { useState, type ReactNode } from "react";

import { Button } from "../../components/ui/button";
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import { useThreadActions } from "../../hooks/useThreadActions";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { StatusIcon } from "./WorkspaceParts";
import { reportThreadAction, useWorkspaceNavigation } from "./useWorkspaces";
import { searchTabs, type WorkspaceTab } from "./workspaces.logic";

/** Which list a tab is shown in; it decides the row's detail and its action. */
export type TabListKind = "needs-you" | "snoozed" | "settled";

/** A titled run of tabs inside one picker. */
export interface TabPickerSection {
  readonly kind: TabListKind;
  readonly tabs: readonly WorkspaceTab[];
  readonly label?: string;
}

// Clock reads live outside components; the purity lint cannot tell them from render reads.
function wakeLabel(snoozedUntil: string): string {
  return snoozeWakeLabel(snoozedUntil, { now: new Date().toISOString() });
}

function settledLabel(tab: WorkspaceTab): string {
  return formatRelativeTimeLabel(tab.thread.settledAt ?? tab.thread.updatedAt);
}

/**
 * A searchable list of tabs. The caller owns the query, so a list can widen its search (Settled
 * asks the server); `footer` adds rows after the results, such as Show more.
 */
export function TabPicker(props: {
  readonly label: string;
  readonly sections: readonly TabPickerSection[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly placeholder: string;
  readonly emptyLabel: string;
  readonly workspaceNameOf?: (tab: WorkspaceTab) => string | null;
  readonly onOpened?: () => void;
  readonly footer?: ReactNode;
}) {
  const total = props.sections.reduce((count, section) => count + section.tabs.length, 0);
  return (
    <Command
      mode="none"
      value={props.query}
      onValueChange={props.onQueryChange}
      aria-label={props.label}
    >
      <CommandInput placeholder={props.placeholder} />
      <CommandList className="max-h-[min(26rem,60dvh)] overflow-y-auto">
        {total === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {props.emptyLabel}
          </div>
        ) : (
          props.sections.map((section) =>
            section.tabs.length === 0 ? null : (
              <CommandGroup key={section.label ?? section.kind}>
                {section.label ? <CommandGroupLabel>{section.label}</CommandGroupLabel> : null}
                {section.tabs.map((tab) => (
                  <TabPickerItem
                    key={tab.key}
                    tab={tab}
                    kind={section.kind}
                    workspaceName={props.workspaceNameOf?.(tab) ?? null}
                    {...(props.onOpened ? { onOpened: props.onOpened } : {})}
                  />
                ))}
              </CommandGroup>
            ),
          )
        )}
        {props.footer}
      </CommandList>
    </Command>
  );
}

/** A picker that filters its tabs locally, by title and workspace name. */
export function LocalTabPicker(
  props: Omit<Parameters<typeof TabPicker>[0], "query" | "onQueryChange">,
) {
  const [query, setQuery] = useState("");
  const nameOf = props.workspaceNameOf ?? (() => null);
  return (
    <TabPicker
      {...props}
      query={query}
      onQueryChange={setQuery}
      sections={props.sections.map((section) => ({
        ...section,
        tabs: searchTabs(section.tabs, query, nameOf),
      }))}
    />
  );
}

function TabPickerItem(props: {
  readonly tab: WorkspaceTab;
  readonly kind: TabListKind;
  readonly workspaceName: string | null;
  readonly onOpened?: () => void;
}) {
  const { tab, kind } = props;
  const { openThread } = useWorkspaceNavigation();
  const { unsnoozeThread, unsettleThread } = useThreadActions();
  const ref = scopeThreadRef(tab.thread.environmentId, tab.thread.id);
  const detail = [kind === "needs-you" ? tab.status?.label : null, props.workspaceName]
    .filter(Boolean)
    .join(" · ");
  const when =
    kind === "snoozed" && tab.thread.snoozedUntil
      ? wakeLabel(tab.thread.snoozedUntil)
      : kind === "settled"
        ? settledLabel(tab)
        : null;
  const action =
    kind === "snoozed"
      ? {
          label: "Wake",
          run: () => reportThreadAction("Failed to wake thread", () => unsnoozeThread(ref)),
        }
      : kind === "settled"
        ? {
            label: "Un-settle",
            run: () => reportThreadAction("Failed to un-settle thread", () => unsettleThread(ref)),
          }
        : null;
  return (
    <CommandItem
      className="group/pick"
      value={tab.key}
      onClick={() => {
        openThread(tab.thread);
        props.onOpened?.();
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <StatusIcon status={tab.status} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{tab.thread.title || "Untitled thread"}</span>
        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
      {when ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when}</span>
      ) : null}
      {action ? (
        // Shown on the highlighted or hovered row, like the palette's own row actions.
        <span className="shrink-0 opacity-0 group-hover/pick:opacity-100 group-data-highlighted/pick:opacity-100 pointer-coarse:opacity-100">
          <Button
            size="xs"
            variant="ghost-muted"
            onClick={(event) => {
              // The row opens the thread; the button acts on it in place.
              event.stopPropagation();
              void action.run();
            }}
          >
            {action.label}
          </Button>
        </span>
      ) : null}
    </CommandItem>
  );
}
