/** React bindings of the workspace model: live data, navigation and the synced group edits. */
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import type { ForkWorkspaceGroup } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useProjectPin } from "../../hooks/useProjectGroupUpdate";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";

import { filterSidebarV2VisibleThreads, useSnoozeWakeClock } from "../../components/Sidebar.logic";
import { toastManager } from "../../components/ui/toast";
import { useSidebar } from "../../components/ui/sidebar";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useClientSettings } from "../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import {
  getSidebarProjectSettingsKey,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import {
  useDelegatedUnderParent,
  useProjects,
  useQuietThreadShell,
  useQuietThreadShells,
} from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useUiStateStore } from "../../uiStateStore";
import { useForkSettings, useUpdateForkSettings } from "../forkSettings";
import {
  buildWorkspaceSidebarModel,
  findWorkspaceKey,
  threadShellKey,
  type Workspace,
  type WorkspaceMove,
  type WorkspaceSidebarModel,
} from "./workspaces.logic";

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
 * The live workspace model: projects, their tabs, statuses, the fork groups and the dragged
 * order, with the workspace on screen listed even when it has no open tab.
 */
export function useWorkspaceSidebarModel(): WorkspaceSidebarModel {
  const projects = useSidebarProjectGroups();
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const { workspaceGroups, workspaceOrder, tabOrder } = useForkSettings();
  const route = useRouteWorkspaceRef();
  // Both clocks re-render this hook when a snooze wakes or a minute passes, and the model reads
  // the time when it builds, so sections and statuses follow the clock.
  const minute = useNowMinute();
  const snoozeClock = useSnoozeWakeClock(threads);
  return buildWorkspaceSidebarModel({
    projects,
    threads: filterSidebarV2VisibleThreads(threads, null, delegatedUnderParent),
    lastVisitedAtByKey,
    groups: workspaceGroups,
    workspaceOrder,
    tabOrder,
    activeWorkspaceKey:
      route.projectRef === null ? null : findWorkspaceKey(projects, route.projectRef),
    clockKey: `${minute}:${snoozeClock}`,
  });
}

/** Navigation shared by the sidebar and the strip; closes the mobile sidebar sheet first. */
export function useWorkspaceNavigation() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleNewThread = useNewThreadHandler();
  const projects = useProjects();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const openThread = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) => {
    closeMobile();
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  };

  const newThreadIn = (project: SidebarProjectSnapshot) => {
    closeMobile();
    void handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };

  /** Opens the tab visited last on this device, else the one that matters, else a new thread. */
  const openWorkspace = (workspace: Workspace) => {
    const visited = (thread: EnvironmentThreadShell) =>
      Date.parse(lastVisitedAtByKey[threadShellKey(thread)] ?? thread.lastVisitedAt ?? "") || 0;
    const lastVisited = workspace.openTabs.toSorted(
      (left, right) => visited(right.thread) - visited(left.thread),
    )[0];
    const target =
      lastVisited !== undefined && visited(lastVisited.thread) > 0
        ? lastVisited
        : workspace.leadTab;
    if (target) openThread(target.thread);
    else newThreadIn(workspace.project);
  };

  const openProjectSettings = (project: SidebarProjectSnapshot) => {
    closeMobile();
    void router.navigate({
      to: "/projects/$projectKey",
      params: {
        projectKey: getSidebarProjectSettingsKey(project, projectGroupingSettings, projects),
      },
    });
  };

  return { openThread, openWorkspace, newThreadIn, openProjectSettings };
}

/**
 * Group, order and tab order edits. Groups and the workspace order save as whole lists, so
 * concurrent clients converge on the last write; a tab order saves per workspace.
 */
export function useWorkspaceLayoutEditor() {
  const { workspaceGroups, workspaceOrder } = useForkSettings();
  const updateForkSettings = useUpdateForkSettings();
  const { canPinProjectGroup, setProjectGroupPinned } = useProjectPin();
  return {
    groups: workspaceGroups,
    workspaceOrder,
    updateGroups: (edit: (groups: readonly ForkWorkspaceGroup[]) => ForkWorkspaceGroup[]) =>
      updateForkSettings({ workspaceGroups: edit(workspaceGroups) }),
    /** Whether `project` can be pinned or unpinned from here. */
    canPin: canPinProjectGroup,
    applyMove: (project: SidebarProjectSnapshot, move: WorkspaceMove) => {
      updateForkSettings({ workspaceGroups: move.groups, workspaceOrder: move.workspaceOrder });
      if (move.pinned !== null && canPinProjectGroup(project)) {
        setProjectGroupPinned(project, move.pinned);
      }
    },
    saveTabOrder: (projectKey: string, tabKeys: readonly string[]) =>
      updateForkSettings({ tabOrder: { [projectKey]: [...tabKeys] } }),
  };
}

/** Runs a thread command and toasts its failure, like upstream's sidebar rows do. */
export async function reportThreadAction(
  title: string,
  run: () => Promise<AtomCommandResult<unknown, unknown>>,
): Promise<void> {
  const result = await run();
  if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
    const error = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    });
  }
}
