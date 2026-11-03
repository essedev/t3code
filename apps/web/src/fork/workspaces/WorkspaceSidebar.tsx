import { useAtomValue } from "@effect/atom-react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, FolderPlusIcon, PinIcon, SearchIcon, SquarePenIcon } from "lucide-react";
import * as Schema from "effect/Schema";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { isCommandPaletteOpen, openCommandPalette } from "../../commandPaletteBus";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { SidebarChromeFooter, SidebarChromeHeader } from "../../components/sidebar/SidebarChrome";
import { Button } from "../../components/ui/button";
import { SidebarContent, SidebarGroup } from "../../components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { isElectron } from "../../env";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
} from "../../keybindings";
import { useThreadJumpHintsVisible } from "../../components/Sidebar.logic";
import { useTerminalFocus } from "../../hooks/useTerminalFocus";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { readLocalApi } from "../../localApi";
import { cn, isMacPlatform, randomUUID } from "../../lib/utils";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { toastManager } from "../../components/ui/toast";
import { GlobalRows } from "./GlobalRows";
import { ShortcutHint, StatusIcon, statusColorClass } from "./WorkspaceParts";
import {
  useRouteWorkspaceRef,
  useWorkspaceLayoutEditor,
  useWorkspaceNavigation,
  useWorkspaceSidebarModel,
} from "./useWorkspaces";
import {
  addWorkspaceGroup,
  assignWorkspaceToGroup,
  bumpWorkspace,
  needsYouSnapshot,
  newlyNeedingYou,
  type NeedsYouSnapshot,
  findWorkspaceKey,
  moveWorkspace,
  moveWorkspaceGroup,
  navigableWorkspaces,
  removeWorkspaceGroup,
  renameWorkspaceGroup,
  stepThrough,
  type Workspace,
  type WorkspaceContainer,
  type WorkspaceSidebarModel,
  type WorkspaceTab,
} from "./workspaces.logic";

const COLLAPSED_GROUPS_KEY = "t3code:fork:workspace-groups-collapsed:v1";
const NEW_GROUP_NAME = "New group";
const CONTAINER_PREFIX = "container:";
const CollapsedGroupIds = Schema.Array(Schema.String);
const DRAG_MODIFIERS = [restrictToVerticalAxis];

/** The list a draggable row or a drop zone belongs to, as dnd-kit data. */
interface DragData {
  readonly container: WorkspaceContainer;
}

function containerOf(data: unknown): WorkspaceContainer | null {
  return typeof data === "object" && data !== null && "container" in data
    ? (data as DragData).container
    : null;
}

// Lists do not nest, so the pointer is inside at most one: drop on its nearest row, or on the list
// itself when it shows none (a collapsed or empty group).
const workspaceCollision: CollisionDetection = (args) => {
  const list = pointerWithin(args).find((hit) => String(hit.id).startsWith(CONTAINER_PREFIX));
  if (!list) return closestCenter(args);
  const container = String(list.id).slice(CONTAINER_PREFIX.length);
  const rows = args.droppableContainers.filter(
    (droppable) =>
      !String(droppable.id).startsWith(CONTAINER_PREFIX) &&
      containerOf(droppable.data.current) === container,
  );
  return rows.length === 0 ? [list] : closestCenter({ ...args, droppableContainers: rows });
};

/** The fork's sidebar: workspaces (projects) in pinned, grouped and ungrouped order. */
export function WorkspaceSidebar() {
  const model = useWorkspaceSidebarModel();
  const route = useRouteWorkspaceRef();
  const activeWorkspaceKey =
    route.projectRef === null
      ? null
      : findWorkspaceKey(
          model.workspaces.map((workspace) => workspace.project),
          route.projectRef,
        );
  const { newThreadIn } = useWorkspaceNavigation();
  const layout = useWorkspaceLayoutEditor();
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useLocalStorage(
    COLLAPSED_GROUPS_KEY,
    [] as readonly string[],
    CollapsedGroupIds,
  );
  const [dragging, setDragging] = useState<{
    readonly key: string;
    readonly from: WorkspaceContainer;
    readonly over: WorkspaceContainer | null;
  } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const createGroup = (projectKey?: string) => {
    const id = randomUUID();
    layout.updateGroups((groups) => {
      const added = addWorkspaceGroup(groups, { id, name: NEW_GROUP_NAME });
      return projectKey === undefined ? added : assignWorkspaceToGroup(added, projectKey, id);
    });
    setRenamingGroupId(id);
  };

  /** Relay's Ctrl+Cmd+G: ungroup the workspace, or start a new group with it. */
  const toggleGroupOf = (workspace: Workspace) => {
    const groupId = layout.groups.find((group) => group.projectKeys.includes(workspace.key))?.id;
    if (groupId === undefined) createGroup(workspace.key);
    else layout.updateGroups((groups) => assignWorkspaceToGroup(groups, workspace.key, null));
  };

  useBumpOnUnseenActivity(model, route.threadKey, layout);

  useWorkspaceShortcuts({
    model,
    collapsedGroupIds,
    activeWorkspaceKey,
    activeThreadKey: route.threadKey,
    onToggleGroup: toggleGroupOf,
  });

  const keysOf = (container: WorkspaceContainer): string[] => {
    if (container === "pinned") return model.pinned.map((workspace) => workspace.key);
    if (container === "ungrouped") return model.ungrouped.map((workspace) => workspace.key);
    return (
      model.groups
        .find((view) => `group:${view.group.id}` === container)
        ?.workspaces.map((workspace) => workspace.key) ?? []
    );
  };

  const dropTarget = (event: DragOverEvent | DragEndEvent) => {
    const { over } = event;
    if (!over) return null;
    const overId = String(over.id);
    const isList = overId.startsWith(CONTAINER_PREFIX);
    const to = isList
      ? (overId.slice(CONTAINER_PREFIX.length) as WorkspaceContainer)
      : containerOf(over.data.current);
    return to === null ? null : { to, overKey: isList ? null : overId };
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const from = containerOf(event.active.data.current);
    const target = dropTarget(event);
    const key = String(event.active.id);
    const workspace = model.workspaceByKey.get(key);
    if (from === null || target === null || workspace === undefined) return;
    if (from === target.to && (target.overKey === null || target.overKey === key)) return;
    const pinChanges = from !== target.to && (from === "pinned" || target.to === "pinned");
    if (pinChanges && !layout.canPin(workspace.project)) {
      toastManager.add({
        type: "warning",
        title: target.to === "pinned" ? "Cannot pin this workspace" : "Cannot unpin this workspace",
        description: "This connection lacks permission to change the project.",
      });
      return;
    }
    layout.applyMove(
      workspace.project,
      moveWorkspace({
        groups: layout.groups,
        workspaceOrder: layout.workspaceOrder,
        key,
        from,
        to: target.to,
        targetKeys: keysOf(target.to),
        overKey: target.overKey,
      }),
    );
  };

  const activeWorkspace =
    activeWorkspaceKey === null ? null : (model.workspaceByKey.get(activeWorkspaceKey) ?? null);
  const jumpHints = useWorkspaceJumpHints(navigableWorkspaces(model, collapsedGroupIds));
  const rowProps = {
    jumpHints,
    activeWorkspaceKey,
    groups: layout.groups,
    onCreateGroup: createGroup,
  };
  const dropHighlight = (container: WorkspaceContainer) =>
    dragging !== null && dragging.over === container && dragging.from !== container;
  const listedCount = model.pinned.length + model.ungrouped.length + model.groups.length;

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent
        className="min-h-full"
        fixedHeader={
          <SidebarGroup className="z-[1]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openCommandPalette()}
                className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
                <span className="truncate">Go to project or thread</span>
              </button>
              <HeaderIconButton
                label={
                  activeWorkspace
                    ? `New thread in ${activeWorkspace.project.displayName}`
                    : "New thread"
                }
                onClick={() => {
                  if (activeWorkspace) newThreadIn(activeWorkspace.project);
                  else openCommandPalette({ open: "new-thread-in" });
                }}
              >
                <SquarePenIcon />
              </HeaderIconButton>
              <HeaderIconButton
                label="Add project"
                onClick={() => openCommandPalette({ open: "add-project" })}
              >
                <FolderPlusIcon />
              </HeaderIconButton>
            </div>
          </SidebarGroup>
        }
      >
        <SidebarGroup className="flex-1" role="presentation">
          <DndContext
            sensors={sensors}
            collisionDetection={workspaceCollision}
            modifiers={DRAG_MODIFIERS}
            onDragStart={(event) => {
              const from = containerOf(event.active.data.current);
              if (from !== null) setDragging({ key: String(event.active.id), from, over: from });
            }}
            onDragOver={(event) => {
              const target = dropTarget(event);
              setDragging((current) =>
                current === null ? null : { ...current, over: target?.to ?? null },
              );
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <div className="flex flex-col gap-3">
              {model.workspaces.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-sidebar-muted-foreground">
                  No projects yet. Add one to start.
                </p>
              ) : listedCount === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-sidebar-muted-foreground">
                  No open threads. Start one with the pen above, or pick any project with Go to
                  project.
                </p>
              ) : null}
              {model.pinned.length > 0 || dragging !== null ? (
                <WorkspaceList
                  container="pinned"
                  label="Pinned workspaces"
                  highlight={dropHighlight("pinned")}
                  workspaces={model.pinned}
                  emptyLabel="Drop here to pin."
                  rowProps={rowProps}
                />
              ) : null}
              {model.groups.map((view, index) => {
                const container = `group:${view.group.id}` as const;
                const collapsed = collapsedGroupIds.includes(view.group.id);
                return (
                  <GroupCard
                    key={view.group.id}
                    container={container}
                    highlight={dropHighlight(container)}
                    name={view.group.name}
                    count={view.workspaces.length}
                    collapsed={collapsed}
                    status={collapsed ? view.status : null}
                    renaming={renamingGroupId === view.group.id}
                    onToggle={() =>
                      setCollapsedGroupIds((ids) =>
                        collapsed
                          ? ids.filter((id) => id !== view.group.id)
                          : [...ids, view.group.id],
                      )
                    }
                    onRename={(name) => {
                      setRenamingGroupId(null);
                      layout.updateGroups((groups) =>
                        renameWorkspaceGroup(groups, view.group.id, name),
                      );
                    }}
                    onMenu={(position) =>
                      void openGroupMenu(position, {
                        canMoveUp: index > 0,
                        canMoveDown: index < model.groups.length - 1,
                      }).then((action) => {
                        if (action === "rename") setRenamingGroupId(view.group.id);
                        if (action === "move-up" || action === "move-down") {
                          layout.updateGroups((groups) =>
                            moveWorkspaceGroup(
                              groups,
                              view.group.id,
                              action === "move-up" ? -1 : 1,
                            ),
                          );
                        }
                        if (action === "delete") {
                          layout.updateGroups((groups) =>
                            removeWorkspaceGroup(groups, view.group.id),
                          );
                        }
                      })
                    }
                  >
                    <SortableContext
                      items={view.workspaces.map((workspace) => workspace.key)}
                      strategy={verticalListSortingStrategy}
                    >
                      {view.workspaces.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-sidebar-muted-foreground">
                          Empty. Drag a workspace here.
                        </p>
                      ) : (
                        view.workspaces.map((workspace) => (
                          <WorkspaceRow
                            key={workspace.key}
                            workspace={workspace}
                            container={container}
                            {...rowProps}
                          />
                        ))
                      )}
                    </SortableContext>
                  </GroupCard>
                );
              })}
              {model.ungrouped.length > 0 || dragging !== null ? (
                <div className="flex flex-col gap-0.5">
                  {model.groups.length > 0 || model.pinned.length > 0 ? (
                    <h3 className="px-2 pt-1 text-xs font-medium text-sidebar-muted-foreground">
                      Workspaces
                    </h3>
                  ) : null}
                  <WorkspaceList
                    container="ungrouped"
                    label="Workspaces"
                    highlight={dropHighlight("ungrouped")}
                    workspaces={model.ungrouped}
                    emptyLabel="Drop here to take it out of its group."
                    rowProps={rowProps}
                  />
                </div>
              ) : null}
            </div>
            {/* In a portal so the sidebar's fixed header and scroll clipping cannot cover it. */}
            {createPortal(
              <DragOverlay dropAnimation={null} zIndex={60}>
                {dragging === null ? null : (
                  <WorkspaceDragPreview
                    workspace={model.workspaceByKey.get(dragging.key) ?? null}
                  />
                )}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </SidebarGroup>
      </SidebarContent>
      <GlobalRows model={model} />
      <SidebarChromeFooter />
    </>
  );
}

/**
 * Relay's "chat list" order: a workspace whose tab starts waiting on the user moves to the top of
 * its group or of the ungrouped list, and the move is saved like a drag (DECISIONS #7).
 */
function useBumpOnUnseenActivity(
  model: WorkspaceSidebarModel,
  activeThreadKey: string | null,
  layout: ReturnType<typeof useWorkspaceLayoutEditor>,
) {
  const previous = useRef<NeedsYouSnapshot | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- compares tab statuses with the previous render to bump workspaces when a tab starts waiting, then saves the order to settings
  useEffect(() => {
    const next = needsYouSnapshot(model);
    const before = previous.current;
    previous.current = next;
    if (before === null) return;
    let groups = layout.groups;
    let order = layout.workspaceOrder;
    let moved = false;
    for (const key of newlyNeedingYou(before, next, activeThreadKey)) {
      const pinned = model.workspaceByKey.get(key)?.project.pinned ?? false;
      const bumped = bumpWorkspace({ groups, workspaceOrder: order, key, pinned });
      if (bumped === null) continue;
      groups = bumped.groups;
      order = bumped.workspaceOrder;
      moved = true;
    }
    if (moved) layout.saveLayout([...groups], [...order]);
  }, [model, activeThreadKey, layout]);
}

/**
 * Relay's workspace shortcuts (fork/features/workspace-sidebar.md): Cmd+T, Cmd+1..9,
 * Option+Cmd+Up/Down, Option+Cmd+J and Ctrl+Cmd+G.
 */
function useWorkspaceShortcuts(input: {
  readonly model: WorkspaceSidebarModel;
  readonly collapsedGroupIds: readonly string[];
  readonly activeWorkspaceKey: string | null;
  readonly activeThreadKey: string | null;
  readonly onToggleGroup: (workspace: Workspace) => void;
}) {
  const { model, collapsedGroupIds, activeWorkspaceKey, activeThreadKey, onToggleGroup } = input;
  const { openWorkspace, openThread, newThreadIn } = useWorkspaceNavigation();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to window keydown in the capture phase so Cmd+T reaches the strip before the right panel's own Cmd+T
  useEffect(() => {
    const isMac = isMacPlatform(navigator.platform);
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || event.altKey || event.shiftKey || event.code !== "KeyT") return;
      if (event.defaultPrevented || isCommandPaletteOpen() || isModelPickerOpen()) return;
      // Inside the right panel, Cmd+T stays upstream's new panel tab.
      if (document.activeElement?.closest('[data-workspace-area="panel"]')) return;
      const current =
        activeWorkspaceKey === null ? undefined : model.workspaceByKey.get(activeWorkspaceKey);
      if (!current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) newThreadIn(current.project);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [model, activeWorkspaceKey, newThreadIn]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to window keydown for the workspace shortcuts with the current sidebar order
  useEffect(() => {
    const isMac = isMacPlatform(navigator.platform);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen()) {
        return;
      }
      const mod = isMac ? event.metaKey : event.ctrlKey;
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      const workspaces = navigableWorkspaces(model, collapsedGroupIds);
      const current =
        activeWorkspaceKey === null ? null : model.workspaceByKey.get(activeWorkspaceKey);
      if (mod && event.altKey && (event.code === "ArrowUp" || event.code === "ArrowDown")) {
        const next = stepThrough(workspaces, activeWorkspaceKey, event.code === "ArrowUp" ? -1 : 1);
        if (next) {
          handled();
          openWorkspace(next);
        }
        return;
      }
      if (mod && event.altKey && event.code === "KeyJ") {
        const next = stepThrough<WorkspaceTab>(
          model.needsYou,
          activeThreadKey,
          event.shiftKey ? -1 : 1,
        );
        if (next) {
          handled();
          openThread(next.thread);
        }
        return;
      }
      if (
        event.code === "KeyG" &&
        event.ctrlKey &&
        (isMac ? event.metaKey : event.altKey) &&
        !event.shiftKey
      ) {
        if (current) {
          handled();
          onToggleGroup(current);
        }
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          modelPickerOpen: isModelPickerOpen(),
          isWeb: !isElectron,
          isDesktop: isElectron,
        },
      });
      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      const target = jumpIndex === null ? undefined : workspaces[jumpIndex];
      if (target) {
        handled();
        openWorkspace(target);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    model,
    collapsedGroupIds,
    activeWorkspaceKey,
    activeThreadKey,
    onToggleGroup,
    openWorkspace,
    openThread,
    keybindings,
  ]);
}

/**
 * The `Cmd+1..9` label of each visible workspace while the jump modifier is held, empty
 * otherwise; upstream's sidebar does the same for its threads.
 */
function useWorkspaceJumpHints(workspaces: readonly Workspace[]): ReadonlyMap<string, string> {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const modifiers = useShortcutModifierState();
  const terminalFocus = useTerminalFocus();
  const visible = useThreadJumpHintsVisible(
    shouldShowThreadJumpHintsForModifiers(modifiers, keybindings, {
      platform: navigator.platform,
      context: {
        terminalFocus,
        modelPickerOpen: isModelPickerOpen(),
        isWeb: !isElectron,
        isDesktop: isElectron,
      },
    }),
  );
  const hints = new Map<string, string>();
  if (!visible) return hints;
  for (const [index, workspace] of workspaces.entries()) {
    const label = shortcutLabelForCommand(keybindings, threadJumpCommandForIndex(index), {
      platform: navigator.platform,
      context: { isWeb: !isElectron, isDesktop: isElectron },
    });
    if (label === null) break;
    hints.set(workspace.key, label);
  }
  return hints;
}

/** The row that follows the pointer while a workspace is dragged, across lists too. */
function WorkspaceDragPreview(props: { readonly workspace: Workspace | null }) {
  if (props.workspace === null) return null;
  const { project } = props.workspace;
  return (
    <div className="flex cursor-grabbing items-center gap-2.5 rounded-md bg-sidebar-row-active px-2 py-1.5 text-sm font-medium text-sidebar-foreground shadow-md ring-1 ring-sidebar-border">
      <ProjectFavicon project={project} className="size-4" />
      <span className="min-w-0 flex-1 truncate">{project.displayName}</span>
      <StatusIcon status={props.workspace.status} />
    </div>
  );
}

function HeaderIconButton(props: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label={props.label}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup>{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** A sortable list of workspace rows that is also a drop zone, with a hint while empty. */
function WorkspaceList(props: {
  readonly container: "pinned" | "ungrouped";
  readonly label: string;
  readonly highlight: boolean;
  readonly workspaces: readonly Workspace[];
  readonly emptyLabel: string;
  readonly rowProps: Omit<WorkspaceRowProps, "workspace" | "container">;
}) {
  const { setNodeRef } = useDroppable({
    id: `${CONTAINER_PREFIX}${props.container}`,
    data: { container: props.container } satisfies DragData,
  });
  return (
    <ul
      ref={setNodeRef}
      aria-label={props.label}
      className={cn(
        "flex min-h-7 flex-col gap-0.5 rounded-md",
        props.highlight && "ring-1 ring-ring ring-inset",
      )}
    >
      <SortableContext
        items={props.workspaces.map((workspace) => workspace.key)}
        strategy={verticalListSortingStrategy}
      >
        {props.workspaces.length === 0 ? (
          <li className="list-none px-2 py-1.5 text-xs text-sidebar-muted-foreground">
            {props.emptyLabel}
          </li>
        ) : (
          props.workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.key}
              workspace={workspace}
              container={props.container}
              {...props.rowProps}
            />
          ))
        )}
      </SortableContext>
    </ul>
  );
}

function GroupCard(props: {
  readonly container: WorkspaceContainer;
  readonly highlight: boolean;
  readonly name: string;
  readonly count: number;
  readonly collapsed: boolean;
  readonly status: Workspace["status"];
  readonly renaming: boolean;
  readonly onToggle: () => void;
  readonly onRename: (name: string) => void;
  readonly onMenu: (position: { x: number; y: number }) => void;
  readonly children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `${CONTAINER_PREFIX}${props.container}`,
    data: { container: props.container } satisfies DragData,
  });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-lg border p-1",
        props.highlight ? "border-ring" : "border-sidebar-border/70",
      )}
    >
      <div className="flex items-center gap-1">
        {props.renaming ? (
          <input
            autoFocus
            aria-label="Group name"
            defaultValue={props.name}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => props.onRename(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") props.onRename(props.name);
            }}
            className="h-7 min-w-0 flex-1 rounded-md bg-sidebar-row-hover px-2 text-xs font-medium text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        ) : (
          <button
            type="button"
            aria-expanded={!props.collapsed}
            onClick={props.onToggle}
            onContextMenu={(event) => {
              event.preventDefault();
              props.onMenu({ x: event.clientX, y: event.clientY });
            }}
            className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 transition-transform",
                props.collapsed && "-rotate-90",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{props.name}</span>
            <StatusIcon status={props.status} />
            <span className="shrink-0 tabular-nums">{props.count}</span>
          </button>
        )}
      </div>
      {props.collapsed ? null : <ul className="mt-0.5 flex flex-col gap-0.5">{props.children}</ul>}
    </section>
  );
}

interface WorkspaceRowProps {
  readonly workspace: Workspace;
  /** The list the row is dragged within. */
  readonly container: WorkspaceContainer;
  /** `Cmd+N` labels shown while the modifier is held, by workspace key. */
  readonly jumpHints: ReadonlyMap<string, string>;
  readonly activeWorkspaceKey: string | null;
  readonly groups: ReturnType<typeof useWorkspaceLayoutEditor>["groups"];
  readonly onCreateGroup: (projectKey: string) => void;
}

function WorkspaceRow(props: WorkspaceRowProps) {
  const { workspace } = props;
  const { project } = workspace;
  const { openWorkspace, newThreadIn, openProjectSettings } = useWorkspaceNavigation();
  const layout = useWorkspaceLayoutEditor();
  const { copyToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) =>
      toastManager.add({ type: "success", title: "Path copied", description: path }),
  });
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.key,
    data: { container: props.container } satisfies DragData,
  });
  const active = props.activeWorkspaceKey === workspace.key;
  const openCount = workspace.openTabs.length;
  const jumpHint = props.jumpHints.get(workspace.key) ?? null;
  const currentGroupId =
    props.groups.find((group) => group.projectKeys.includes(workspace.key))?.id ?? null;

  const openMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        [
          { id: "new-thread", label: "New thread" },
          ...(layout.canPin(project)
            ? [
                project.pinned
                  ? { id: "unpin", label: "Unpin workspace", icon: "pin-off" }
                  : { id: "pin", label: "Pin workspace", icon: "pin" },
              ]
            : []),
          {
            id: "move-to-group",
            label: "Move to group",
            separatorBefore: true,
            children: [
              ...props.groups.map((group) => ({
                id: `group:${group.id}`,
                label: group.name,
                checked: group.id === currentGroupId,
              })),
              { id: "group:new", label: "New group…", separatorBefore: props.groups.length > 0 },
            ],
          },
          ...(currentGroupId !== null ? [{ id: "ungroup", label: "Remove from group" }] : []),
          { id: "copy-path", label: "Copy path", separatorBefore: true },
          { id: "project-settings", label: "Project settings", icon: "settings" },
        ],
        position,
      ),
    );
    if (clicked._tag === "Failure" || clicked.value === null) return;
    const action = clicked.value;
    if (action === "group:new") {
      props.onCreateGroup(workspace.key);
      return;
    }
    if (action.startsWith("group:")) {
      const groupId = action.slice("group:".length);
      layout.updateGroups((groups) => assignWorkspaceToGroup(groups, workspace.key, groupId));
      return;
    }
    switch (action) {
      case "new-thread":
        newThreadIn(project);
        return;
      case "pin":
      case "unpin":
        layout.applyMove(project, {
          groups:
            action === "pin"
              ? assignWorkspaceToGroup(props.groups, workspace.key, null)
              : [...props.groups],
          workspaceOrder: [...layout.workspaceOrder],
          pinned: action === "pin",
        });
        return;
      case "ungroup":
        layout.updateGroups((groups) => assignWorkspaceToGroup(groups, workspace.key, null));
        return;
      case "copy-path":
        copyToClipboard(project.workspaceRoot, { path: project.workspaceRoot });
        return;
      case "project-settings":
        openProjectSettings(project);
        return;
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group/workspace relative list-none", isDragging && "opacity-40")}
    >
      <button
        type="button"
        {...listeners}
        aria-current={active ? "page" : undefined}
        onClick={() => openWorkspace(workspace)}
        onContextMenu={(event) => {
          event.preventDefault();
          void openMenu({ x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          active
            ? "bg-sidebar-row-active text-sidebar-foreground light:ring-1 light:ring-inset light:ring-sidebar-border/70"
            : "text-sidebar-foreground hover:bg-sidebar-row-hover",
        )}
      >
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
          <ProjectFavicon project={project} className="size-4" />
          {project.pinned ? (
            <PinIcon
              aria-label="Pinned"
              className="absolute -right-1.5 -bottom-1 size-2.5 text-sidebar-muted-foreground"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {project.displayName}
            </span>
            <StatusIcon status={workspace.status} />
            {openCount > 0 && jumpHint === null ? (
              <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/workspace:invisible pointer-coarse:invisible">
                {openCount}
              </span>
            ) : null}
          </span>
          {workspace.leadTab ? (
            <span
              className={cn(
                "block truncate text-xs",
                workspace.status
                  ? statusColorClass(workspace.status)
                  : "text-sidebar-muted-foreground",
              )}
            >
              {workspace.leadTab.thread.title}
            </span>
          ) : null}
        </span>
        {jumpHint ? <ShortcutHint label={jumpHint} /> : null}
      </button>
      <span className="absolute top-1 right-1 flex items-center opacity-0 focus-within:opacity-100 group-hover/workspace:opacity-100 pointer-coarse:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`New thread in ${project.displayName}`}
                onClick={() => newThreadIn(project)}
              />
            }
          >
            <SquarePenIcon aria-hidden />
          </TooltipTrigger>
          <TooltipPopup>New thread in {project.displayName}</TooltipPopup>
        </Tooltip>
      </span>
    </li>
  );
}

async function openGroupMenu(
  position: { x: number; y: number },
  options: { readonly canMoveUp: boolean; readonly canMoveDown: boolean },
): Promise<string | null> {
  const api = readLocalApi();
  if (!api) return null;
  const clicked = await settlePromise(() =>
    api.contextMenu.show(
      [
        { id: "rename", label: "Rename group" },
        ...(options.canMoveUp ? [{ id: "move-up", label: "Move up" }] : []),
        ...(options.canMoveDown ? [{ id: "move-down", label: "Move down" }] : []),
        {
          id: "delete",
          label: "Delete group",
          destructive: true,
          separatorBefore: true,
        },
      ],
      position,
    ),
  );
  return clicked._tag === "Failure" ? null : clicked.value;
}
