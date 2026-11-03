import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import {
  AlarmClockIcon,
  BellDotIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SquarePenIcon,
} from "lucide-react";
import * as Schema from "effect/Schema";
import { useState, type ReactNode } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { SidebarChromeFooter, SidebarChromeHeader } from "../../components/sidebar/SidebarChrome";
import { Button } from "../../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover";
import { SidebarContent, SidebarGroup } from "../../components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { isElectron } from "../../env";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useProjectPin } from "../../hooks/useProjectGroupUpdate";
import { readLocalApi } from "../../localApi";
import { cn, randomUUID } from "../../lib/utils";
import { toastManager } from "../../components/ui/toast";
import { StatusDot, TabList, useRouteWorkspaceRef } from "./WorkspaceParts";
import {
  useWorkspaceGroupsEditor,
  useWorkspaceNavigation,
  useWorkspaceSidebarModel,
} from "./useWorkspaces";
import {
  addWorkspaceGroup,
  assignWorkspaceToGroup,
  findWorkspaceKey,
  moveWorkspaceGroup,
  moveWorkspaceInGroup,
  removeWorkspaceGroup,
  renameWorkspaceGroup,
  type Workspace,
  type WorkspaceSidebarModel,
  type WorkspaceTab,
} from "./workspaces.logic";

const COLLAPSED_GROUPS_KEY = "t3code:fork:workspace-groups-collapsed:v1";
const NEW_GROUP_NAME = "New group";
const CollapsedGroupIds = Schema.Array(Schema.String);

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
  const groupsEditor = useWorkspaceGroupsEditor();
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useLocalStorage(
    COLLAPSED_GROUPS_KEY,
    [] as readonly string[],
    CollapsedGroupIds,
  );

  const createGroup = (projectKey?: string) => {
    const id = randomUUID();
    groupsEditor.update((groups) => {
      const added = addWorkspaceGroup(groups, { id, name: NEW_GROUP_NAME });
      return projectKey === undefined ? added : assignWorkspaceToGroup(added, projectKey, id);
    });
    setRenamingGroupId(id);
  };

  const activeWorkspace =
    activeWorkspaceKey === null ? null : (model.workspaceByKey.get(activeWorkspaceKey) ?? null);
  const rowProps = {
    activeWorkspaceKey,
    groups: groupsEditor.groups,
    onCreateGroup: createGroup,
  };

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
          <div className="flex flex-col gap-3">
            {model.workspaces.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-sidebar-muted-foreground">
                No projects yet. Add one to start.
              </p>
            ) : null}
            {model.pinned.length > 0 ? (
              <ul className="flex flex-col gap-0.5" aria-label="Pinned workspaces">
                {model.pinned.map((workspace) => (
                  <WorkspaceRow key={workspace.key} workspace={workspace} pinned {...rowProps} />
                ))}
              </ul>
            ) : null}
            {model.groups.map((view, index) => {
              const collapsed = collapsedGroupIds.includes(view.group.id);
              return (
                <GroupCard
                  key={view.group.id}
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
                    groupsEditor.update((groups) =>
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
                        groupsEditor.update((groups) =>
                          moveWorkspaceGroup(groups, view.group.id, action === "move-up" ? -1 : 1),
                        );
                      }
                      if (action === "delete") {
                        groupsEditor.update((groups) =>
                          removeWorkspaceGroup(groups, view.group.id),
                        );
                      }
                    })
                  }
                >
                  {view.workspaces.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-sidebar-muted-foreground">
                      Empty. Right-click a workspace to move it here.
                    </p>
                  ) : (
                    view.workspaces.map((workspace, position) => (
                      <WorkspaceRow
                        key={workspace.key}
                        workspace={workspace}
                        groupId={view.group.id}
                        canMoveUp={position > 0}
                        canMoveDown={position < view.workspaces.length - 1}
                        {...rowProps}
                      />
                    ))
                  )}
                </GroupCard>
              );
            })}
            {model.ungrouped.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {model.groups.length > 0 || model.pinned.length > 0 ? (
                  <h3 className="px-2 pt-1 text-xs font-medium text-sidebar-muted-foreground">
                    Workspaces
                  </h3>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {model.ungrouped.map((workspace) => (
                    <WorkspaceRow key={workspace.key} workspace={workspace} {...rowProps} />
                  ))}
                </ul>
              </div>
            ) : null}
            {model.workspaces.length > 0 ? (
              <button
                type="button"
                onClick={() => createGroup()}
                className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                <PlusIcon className="size-3.5" />
                New group
              </button>
            ) : null}
          </div>
        </SidebarGroup>
      </SidebarContent>
      <GlobalRows model={model} />
      <SidebarChromeFooter />
    </>
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

function GroupCard(props: {
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
  return (
    <section className="rounded-lg border border-sidebar-border/70 p-1">
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
            <StatusDot status={props.status} />
            <span className="shrink-0 tabular-nums">{props.count}</span>
          </button>
        )}
      </div>
      {props.collapsed ? null : <ul className="mt-0.5 flex flex-col gap-0.5">{props.children}</ul>}
    </section>
  );
}

function WorkspaceRow(props: {
  readonly workspace: Workspace;
  readonly activeWorkspaceKey: string | null;
  readonly groups: ReturnType<typeof useWorkspaceGroupsEditor>["groups"];
  readonly onCreateGroup: (projectKey: string) => void;
  readonly pinned?: boolean;
  readonly groupId?: string;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
}) {
  const { workspace } = props;
  const { project } = workspace;
  const { openWorkspace, newThreadIn, openProjectSettings } = useWorkspaceNavigation();
  const groupsEditor = useWorkspaceGroupsEditor();
  const { canPinProjectGroup, setProjectGroupPinned } = useProjectPin();
  const { copyToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) =>
      toastManager.add({ type: "success", title: "Path copied", description: path }),
  });
  const active = props.activeWorkspaceKey === workspace.key;
  const openCount = workspace.openTabs.length;

  const openMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const currentGroupId = props.groupId ?? null;
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        [
          { id: "new-thread", label: "New thread" },
          ...(canPinProjectGroup(project)
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
          ...(currentGroupId !== null
            ? [
                ...(props.canMoveUp ? [{ id: "move-up", label: "Move up" }] : []),
                ...(props.canMoveDown ? [{ id: "move-down", label: "Move down" }] : []),
                { id: "ungroup", label: "Remove from group" },
              ]
            : []),
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
      groupsEditor.update((groups) => assignWorkspaceToGroup(groups, workspace.key, groupId));
      return;
    }
    switch (action) {
      case "new-thread":
        newThreadIn(project);
        return;
      case "pin":
      case "unpin":
        setProjectGroupPinned(project, action === "pin");
        return;
      case "move-up":
      case "move-down":
        groupsEditor.update((groups) =>
          moveWorkspaceInGroup(groups, workspace.key, action === "move-up" ? -1 : 1),
        );
        return;
      case "ungroup":
        groupsEditor.update((groups) => assignWorkspaceToGroup(groups, workspace.key, null));
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
    <li className="group/workspace relative list-none">
      <button
        type="button"
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
          {props.pinned ? (
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
            <StatusDot status={workspace.status} />
            {openCount > 0 ? (
              <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/workspace:invisible pointer-coarse:invisible">
                {openCount}
              </span>
            ) : null}
          </span>
          {workspace.leadTab ? (
            <span
              className={cn(
                "block truncate text-xs",
                workspace.status ? workspace.status.colorClass : "text-sidebar-muted-foreground",
              )}
            >
              {workspace.leadTab.thread.title}
            </span>
          ) : null}
        </span>
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

/** Needs you, Snoozed and Settled across every workspace, outside the scrolling list. */
function GlobalRows(props: { readonly model: WorkspaceSidebarModel }) {
  const { model } = props;
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
        tabs={model.needsYou}
        kind="needs-you"
        emptyLabel="Nothing waits on you."
        workspaceNameOf={workspaceNameOf}
        highlight={model.needsYou.length > 0}
      />
      <GlobalRow
        icon={<AlarmClockIcon />}
        label="Snoozed"
        tabs={model.snoozed}
        kind="snoozed"
        emptyLabel="No snoozed threads."
        workspaceNameOf={workspaceNameOf}
      />
      <GlobalRow
        icon={<CheckCheckIcon />}
        label="Settled"
        tabs={model.settled}
        kind="settled"
        emptyLabel="No settled threads."
        workspaceNameOf={workspaceNameOf}
      />
    </div>
  );
}

function GlobalRow(props: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly tabs: readonly WorkspaceTab[];
  readonly kind: "needs-you" | "snoozed" | "settled";
  readonly emptyLabel: string;
  readonly workspaceNameOf: (tab: WorkspaceTab) => string | null;
  readonly highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
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
        <span className="tabular-nums">{props.tabs.length}</span>
      </PopoverTrigger>
      <PopoverPopup side="right" align="end" width="md" padding="none">
        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
          <h2 className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
            {props.label}
          </h2>
          <TabList
            tabs={props.tabs}
            kind={props.kind}
            workspaceNameOf={props.workspaceNameOf}
            emptyLabel={props.emptyLabel}
            onOpened={() => setOpen(false)}
          />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
