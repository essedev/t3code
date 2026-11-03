/**
 * Needs you, Snoozed and Settled across every workspace, at the bottom of the workspace sidebar.
 * Settled pages older threads in like upstream's Settled shelf, since the server's shell stream
 * keeps only the newest settled ones, and searches them through the server's thread search.
 */
import type { OlderSettledScope } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { AlarmClockIcon, BellDotIcon, CheckCheckIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CommandItem } from "../../components/ui/command";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";
import { useQuietThreadShells } from "../../state/entities";
import { useOlderSettledShelf, useOlderSettledShelfGrowth } from "../../state/olderSettledShelf";
import { useThreadSearch } from "../../state/queries";
import { LocalTabPicker, TabPicker } from "./TabPicker";
import {
  searchTabs,
  threadShellKey,
  type WorkspaceSidebarModel,
  type WorkspaceTab,
} from "./workspaces.logic";

// Upstream's Settled shelf grows by the same step.
const SETTLED_PAGE_SIZE = 25;

/** The sidebar's projects per environment: older settled threads load only for those. */
function settledScopes(model: WorkspaceSidebarModel): OlderSettledScope[] {
  const byEnvironment = new Map<EnvironmentId, ProjectId[]>();
  for (const workspace of model.workspaces) {
    for (const ref of workspace.project.memberProjectRefs) {
      const ids = byEnvironment.get(ref.environmentId) ?? [];
      ids.push(ref.projectId);
      byEnvironment.set(ref.environmentId, ids);
    }
  }
  return [...byEnvironment].map(([environmentId, projectIds]) => ({ environmentId, projectIds }));
}

/** The three rows, each opening a searchable list to the right of the sidebar. */
export function GlobalRows(props: { readonly model: WorkspaceSidebarModel }) {
  const { model } = props;
  const threads = useQuietThreadShells();
  const [settledOpen, setSettledOpen] = useState(false);
  const [settledVisible, setSettledVisible] = useState(SETTLED_PAGE_SIZE);
  const scopes = settledScopes(model);
  const shelf = useOlderSettledShelf({
    scopes,
    expanded: settledOpen,
    visibleCount: settledVisible,
  });
  // Rows below the shelf's frontier could sort under threads not loaded yet, so they wait.
  const listedSettled = model.settled.filter((tab) => shelf.isListed(tab.thread));
  useOlderSettledShelfGrowth(
    shelf,
    listedSettled.map((tab) => tab.thread),
  );
  const settledCount = model.settled.length + shelf.unloadedCount(threads);
  const workspaceNameOf = (tab: WorkspaceTab) =>
    model.workspaces.find((workspace) =>
      workspace.project.memberProjectRefs.some(
        (ref) =>
          ref.environmentId === tab.thread.environmentId && ref.projectId === tab.thread.projectId,
      ),
    )?.project.displayName ?? null;

  return (
    <div className="flex flex-col gap-0.5 border-t border-sidebar-border/70 px-(--sidebar-content-inset) py-1.5">
      <GlobalRow
        icon={<BellDotIcon />}
        label="Needs you"
        count={model.needsYou.length}
        highlight={model.needsYou.length > 0}
      >
        {(close) => (
          <LocalTabPicker
            label="Needs you"
            sections={[{ kind: "needs-you", tabs: model.needsYou }]}
            placeholder="Search threads that need you…"
            emptyLabel="Nothing waits on you."
            workspaceNameOf={workspaceNameOf}
            onOpened={close}
          />
        )}
      </GlobalRow>
      <GlobalRow icon={<AlarmClockIcon />} label="Snoozed" count={model.snoozed.length}>
        {(close) => (
          <LocalTabPicker
            label="Snoozed"
            sections={[{ kind: "snoozed", tabs: model.snoozed }]}
            placeholder="Search snoozed threads…"
            emptyLabel="No snoozed threads."
            workspaceNameOf={workspaceNameOf}
            onOpened={close}
          />
        )}
      </GlobalRow>
      <GlobalRow
        icon={<CheckCheckIcon />}
        label="Settled"
        count={settledCount}
        open={settledOpen}
        onOpenChange={(open) => {
          setSettledOpen(open);
          // Closing drops the pages read beyond the first, as upstream's shelf does.
          if (!open) setSettledVisible(SETTLED_PAGE_SIZE);
        }}
      >
        {(close) => (
          <SettledPicker
            model={model}
            listed={listedSettled}
            visibleCount={settledVisible}
            totalCount={settledCount}
            scopes={scopes}
            loading={shelf.loading}
            failed={shelf.failed}
            onRetry={shelf.retry}
            onShowMore={() => setSettledVisible((count) => count + SETTLED_PAGE_SIZE)}
            workspaceNameOf={workspaceNameOf}
            onOpened={close}
          />
        )}
      </GlobalRow>
    </div>
  );
}

function SettledPicker(props: {
  readonly model: WorkspaceSidebarModel;
  readonly listed: readonly WorkspaceTab[];
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly scopes: readonly OlderSettledScope[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly onShowMore: () => void;
  readonly workspaceNameOf: (tab: WorkspaceTab) => string | null;
  readonly onOpened: () => void;
}) {
  const [query, setQuery] = useState("");
  // Mounts the older settled threads that match, which the shell stream leaves out.
  const search = useThreadSearch(
    [...new Set(props.scopes.map((scope) => scope.environmentId))],
    query,
    { projectIds: props.scopes.flatMap((scope) => scope.projectIds ?? []) },
  );
  const searching = query.trim() !== "";
  const matchedKeys = new Set(
    search.matches.map((match) =>
      threadShellKey({ environmentId: match.environmentId, id: match.threadId }),
    ),
  );
  const tabs = searching
    ? searchTabs(props.model.settled, query, props.workspaceNameOf, matchedKeys)
    : props.listed.slice(0, props.visibleCount);
  const remaining = Math.max(0, props.totalCount - tabs.length);
  const status = (text: string) => (
    <div className="px-3 py-2 text-xs text-muted-foreground">{text}</div>
  );
  return (
    <TabPicker
      label="Settled"
      sections={[{ kind: "settled", tabs }]}
      query={query}
      onQueryChange={setQuery}
      placeholder="Search settled threads…"
      emptyLabel={
        searching
          ? search.isPending
            ? "Searching…"
            : "No settled thread matches."
          : props.loading
            ? "Loading…"
            : "No settled threads."
      }
      workspaceNameOf={props.workspaceNameOf}
      onOpened={props.onOpened}
      footer={
        searching ? (
          search.isPending && tabs.length > 0 ? (
            status("Searching older threads…")
          ) : null
        ) : props.failed ? (
          <CommandItem value="settled:retry" onClick={props.onRetry}>
            Older threads did not load. Retry
          </CommandItem>
        ) : props.loading && tabs.length > 0 ? (
          status("Loading…")
        ) : remaining > 0 ? (
          <CommandItem value="settled:more" onClick={props.onShowMore}>
            <span className="text-muted-foreground">
              Show {Math.min(SETTLED_PAGE_SIZE, remaining)} more ({remaining} left)
            </span>
          </CommandItem>
        ) : null
      }
    />
  );
}

function GlobalRow(props: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly count: number;
  readonly highlight?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children: (close: () => void) => ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.open ?? localOpen;
  const setOpen = props.onOpenChange ?? setLocalOpen;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:shrink-0"
          />
        }
      >
        {props.icon}
        <span className={cn("flex-1", props.highlight && "font-medium text-sidebar-foreground")}>
          {props.label}
        </span>
        <span className="tabular-nums">{props.count}</span>
      </PopoverTrigger>
      <PopoverPopup side="right" align="end" padding="none">
        {/* As wide as the palette allows here, so thread titles read in full. */}
        <div className="w-[30rem] max-w-[calc(100vw-2rem)]">
          {props.children(() => setOpen(false))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
