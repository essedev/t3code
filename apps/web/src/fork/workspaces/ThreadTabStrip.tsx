import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlarmClockIcon, CheckIcon, ChevronDownIcon, PinIcon, SquarePenIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { requestCustomSnooze } from "../../components/CustomSnoozeDialog";
import { pickSnoozePreset, resolveSnoozePresets } from "../../components/Sidebar.snooze";
import { Button } from "../../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover";
import { toastManager } from "../../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { useClientSettings } from "../../hooks/useSettings";
import { useThreadActionMenu } from "../../hooks/useThreadActionMenu";
import { useThreadActions } from "../../hooks/useThreadActions";
import { resolveShortcutCommand, threadTraversalDirectionFromCommand } from "../../keybindings";
import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { registerSettleAndAdvance } from "../../settleAndAdvance";
import { useEnvironmentScope } from "../../state/session";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";
import { useForkSettings } from "../forkSettings";
import { ShortcutHint, StatusIcon, TabList } from "./WorkspaceParts";
import { useThreadJumpHintsVisible } from "../../components/Sidebar.logic";
import { useTerminalFocus } from "../../hooks/useTerminalFocus";
import { isMacPlatform } from "../../lib/utils";
import { useShortcutModifierState } from "../../shortcutModifierState";
import {
  reportThreadAction,
  useWorkspaceLayoutEditor,
  useWorkspaceNavigation,
  useWorkspaceSidebarModel,
} from "./useWorkspaces";
import { findWorkspaceKey, reorderTabs, stepThrough, type WorkspaceTab } from "./workspaces.logic";

const TAB_DRAG_MODIFIERS = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];

/**
 * The open threads of the current workspace as tabs, under the chat header. Renders nothing
 * unless the workspace sidebar is on (Settings > Fork).
 */
export function ThreadTabStrip(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly isServerThread: boolean;
}) {
  const { workspaceSidebarEnabled } = useForkSettings();
  if (!workspaceSidebarEnabled) return null;
  return <ThreadTabStripContent {...props} />;
}

function ThreadTabStripContent(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly isServerThread: boolean;
}) {
  const model = useWorkspaceSidebarModel();
  const { openThread, newThreadIn } = useWorkspaceNavigation();
  const { settleThread } = useThreadActions();
  const { saveTabOrder } = useWorkspaceLayoutEditor();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [parkedOpen, setParkedOpen] = useState(false);
  const workspaceKey = findWorkspaceKey(
    model.workspaces.map((workspace) => workspace.project),
    { environmentId: props.environmentId, projectId: props.projectId },
  );
  const workspace = workspaceKey === null ? null : (model.workspaceByKey.get(workspaceKey) ?? null);
  const activeKey = props.isServerThread
    ? scopedThreadKey(scopeThreadRef(props.environmentId, props.threadId))
    : null;
  const openTabs = workspace?.openTabs ?? [];
  const parkedTabs = [...(workspace?.snoozedTabs ?? []), ...(workspace?.settledTabs ?? [])];
  // A snoozed or settled thread opened from a list shows as an extra tab until it is left.
  const peekTab =
    activeKey !== null && !openTabs.some((tab) => tab.key === activeKey)
      ? (parkedTabs.find((tab) => tab.key === activeKey) ?? null)
      : null;
  const tabs = peekTab ? [...openTabs, peekTab] : openTabs;

  useThreadTabShortcuts({ tabs, activeKey, routeRef: props, onOpen: openThread });
  const modifiers = useShortcutModifierState();
  const terminalFocus = useTerminalFocus();
  const showTabHints = useThreadJumpHintsVisible(
    modifiers.altKey &&
      !modifiers.metaKey &&
      !modifiers.ctrlKey &&
      !modifiers.shiftKey &&
      !terminalFocus,
  );
  const optionLabel = isMacPlatform(navigator.platform) ? "\u2325" : "Alt+";

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the settle-and-advance handler the composer and shortcuts call, with the current tab order
  useEffect(
    () =>
      registerSettleAndAdvance((threadRef) => {
        const key = scopedThreadKey(threadRef);
        const index = tabs.findIndex((tab) => tab.key === key);
        const next = index === -1 ? null : (tabs[index + 1] ?? tabs[index - 1] ?? null);
        void reportThreadAction("Failed to settle thread", () => settleThread(threadRef));
        if (next) openThread(next.thread);
      }),
    [tabs, settleThread, openThread],
  );

  if (workspace === null) return null;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const order = reorderTabs(openTabs, String(active.id), String(over.id));
    if (order) saveTabOrder(workspace.key, order);
  };
  return (
    <div
      data-thread-tab-strip
      className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3"
    >
      <div
        role="tablist"
        aria-label={`Threads in ${workspace.project.displayName}`}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={TAB_DRAG_MODIFIERS}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={openTabs.map((tab) => tab.key)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab, index) => (
              <ThreadTab
                key={tab.key}
                tab={tab}
                shortcutHint={showTabHints && index < 9 ? `${optionLabel}${index + 1}` : null}
                active={tab.key === activeKey}
                sortable={tab !== peekTab}
                onOpen={() => openThread(tab.thread)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {props.isServerThread ? null : (
          <div
            role="tab"
            aria-selected
            className="flex h-7 max-w-48 min-w-24 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm text-foreground"
          >
            <SquarePenIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">New thread</span>
          </div>
        )}
      </div>
      {parkedTabs.length > 0 ? (
        <Popover open={parkedOpen} onOpenChange={setParkedOpen}>
          <PopoverTrigger
            render={
              <Button
                size="compact"
                variant="ghost-muted"
                aria-label={`${parkedTabs.length} snoozed and settled threads`}
              />
            }
          >
            +{parkedTabs.length}
            <ChevronDownIcon aria-hidden />
          </PopoverTrigger>
          <PopoverPopup side="bottom" align="end" width="md" padding="none">
            <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
              {workspace.snoozedTabs.length > 0 ? (
                <>
                  <h2 className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
                    Snoozed
                  </h2>
                  <TabList
                    tabs={workspace.snoozedTabs}
                    kind="snoozed"
                    emptyLabel=""
                    onOpened={() => setParkedOpen(false)}
                  />
                </>
              ) : null}
              {workspace.settledTabs.length > 0 ? (
                <>
                  <h2 className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
                    Settled
                  </h2>
                  <TabList
                    tabs={workspace.settledTabs}
                    kind="settled"
                    emptyLabel=""
                    onOpened={() => setParkedOpen(false)}
                  />
                </>
              ) : null}
            </div>
          </PopoverPopup>
        </Popover>
      ) : null}
      <StripIconButton
        label={`New thread in ${workspace.project.displayName}`}
        onClick={() => newThreadIn(workspace.project)}
      >
        <SquarePenIcon />
      </StripIconButton>
    </div>
  );
}

function StripIconButton(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={props.label}
            onClick={(event) => {
              event.stopPropagation();
              props.onClick();
            }}
            {...(props.className ? { className: props.className } : {})}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup>{props.label}</TooltipPopup>
    </Tooltip>
  );
}

function ThreadTab(props: {
  readonly tab: WorkspaceTab;
  readonly active: boolean;
  /** False for the peeked snoozed or settled tab, which has no place in the order. */
  readonly sortable: boolean;
  /** The `Option+N` label shown while Option is held. */
  readonly shortcutHint: string | null;
  readonly onOpen: () => void;
}) {
  const { tab, active } = props;
  const thread = tab.thread;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const [renaming, setRenaming] = useState(false);
  const tabRef = useRef<HTMLDivElement>(null);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.key,
    disabled: !props.sortable || renaming,
  });
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const { settleThread, snoozeThread } = useThreadActions();
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const canOperate = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  const { openMenu } = useThreadActionMenu({
    threadRef,
    projectCwd: thread.worktreePath,
    onStartRename: () => setRenaming(true),
    canShareWithGuest: false,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the selected tab in view when the route changes it
  useEffect(() => {
    if (active) tabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const commitRename = (value: string) => {
    setRenaming(false);
    const title = value.trim();
    if (title === "") {
      toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
      return;
    }
    if (title === thread.title || !canOperate) return;
    void reportThreadAction("Failed to rename thread", () =>
      updateThreadMetadata({
        environmentId: thread.environmentId,
        input: { threadId: thread.id, title },
      }),
    );
  };

  const openSnoozeMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const presets = resolveSnoozePresets(new Date(), timestampFormat, thread.environmentId);
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        [
          ...presets.map((preset) => ({ id: preset.id, label: preset.label })),
          { id: "custom", label: "Custom…", separatorBefore: true },
        ],
        position,
      ),
    );
    if (clicked._tag === "Failure" || clicked.value === null) return;
    const preset =
      clicked.value === "custom"
        ? await requestCustomSnooze()
        : pickSnoozePreset(presets, clicked.value, timestampFormat, thread.environmentId);
    if (!preset) return;
    await reportThreadAction("Failed to snooze thread", () =>
      snoozeThread(threadRef, preset.snoozedUntil),
    );
  };

  return (
    <div
      ref={(node) => {
        tabRef.current = node;
        setNodeRef(node);
      }}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => {
        if (!renaming) props.onOpen();
      }}
      onDoubleClick={() => {
        if (canOperate) setRenaming(true);
      }}
      onAuxClick={(event) => {
        // Middle click settles, like closing a browser tab.
        if (event.button !== 1 || !canOperate) return;
        event.preventDefault();
        void reportThreadAction("Failed to settle thread", () => settleThread(threadRef));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !renaming) props.onOpen();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu({ x: event.clientX, y: event.clientY });
      }}
      className={cn(
        isDragging && "z-10 shadow-sm",
        "group/tab relative flex h-7 max-w-52 min-w-28 flex-[0_1_13rem] cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2.5 text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active
          ? "bg-accent text-foreground"
          : tab.section === "snoozed" || tab.section === "settled"
            ? "text-muted-foreground italic hover:bg-accent/60"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {thread.pinnedAt != null ? (
        <PinIcon aria-label="Pinned" className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      <StatusIcon status={tab.status} />
      {renaming ? (
        <input
          autoFocus
          aria-label="Thread title"
          defaultValue={thread.title}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commitRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setRenaming(false);
          }}
          className="h-6 min-w-0 flex-1 rounded-sm bg-background px-1 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      )}
      {canOperate && !renaming && tab.section !== "settled" ? (
        <span
          className={cn(
            "flex shrink-0 items-center opacity-0 group-hover/tab:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
            active && "opacity-100",
          )}
        >
          {tab.section !== "snoozed" ? (
            <StripIconButton
              label="Snooze"
              onClick={() => {
                const rect = tabRef.current?.getBoundingClientRect();
                void openSnoozeMenu({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
              }}
            >
              <AlarmClockIcon />
            </StripIconButton>
          ) : null}
          <StripIconButton
            label="Settle"
            onClick={() =>
              void reportThreadAction("Failed to settle thread", () => settleThread(threadRef))
            }
          >
            <CheckIcon />
          </StripIconButton>
        </span>
      ) : null}
      {props.shortcutHint ? <ShortcutHint label={props.shortcutHint} /> : null}
    </div>
  );
}

/**
 * Tab shortcuts: upstream's previous and next thread, and Relay's `Option+1..9` and
 * `Ctrl+Tab` / `Ctrl+Shift+Tab`, all over the workspace's tabs. `Cmd+1..9` picks a workspace
 * (WorkspaceSidebar).
 */
function useThreadTabShortcuts(input: {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeKey: string | null;
  readonly routeRef: { readonly environmentId: EnvironmentId; readonly threadId: ThreadId };
  readonly onOpen: (thread: WorkspaceTab["thread"]) => void;
}) {
  const { tabs, activeKey, onOpen } = input;
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const terminalOpen = useTerminalUiStateStore(
    (state) =>
      selectThreadTerminalUiState(
        state.terminalUiStateByThreadKey,
        scopeThreadRef(input.routeRef.environmentId, input.routeRef.threadId),
      ).terminalOpen,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to window keydown for the tab shortcuts with the current tab order
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) {
        return;
      }
      const open = (tab: WorkspaceTab | null | undefined) => {
        if (!tab) return;
        event.preventDefault();
        event.stopPropagation();
        onOpen(tab.thread);
      };
      // Option+digit composes a character on macOS, so match the physical key, not `event.key`.
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        open(tabs[Number(digit[1]) - 1]);
        return;
      }
      if (event.key === "Tab" && event.ctrlKey && !event.metaKey && !event.altKey) {
        open(stepThrough(tabs, activeKey, event.shiftKey ? -1 : 1));
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
          modelPickerOpen: isModelPickerOpen(),
          isWeb: !isElectron,
          isDesktop: isElectron,
        },
      });
      const direction = threadTraversalDirectionFromCommand(command);
      if (direction !== null) open(stepThrough(tabs, activeKey, direction === "next" ? 1 : -1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, terminalOpen, tabs, activeKey, onOpen]);
}
