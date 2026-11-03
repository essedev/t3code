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
import { useDelegatedUnderParent, useProjects, useQuietThreadShells } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useUiStateStore } from "../../uiStateStore";
import { useForkSettings, useUpdateForkSettings } from "../forkSettings";
import {
  buildWorkspaceSidebarModel,
  threadShellKey,
  type Workspace,
  type WorkspaceSidebarModel,
} from "./workspaces.logic";

/** The live workspace model: projects, their tabs, statuses and the fork groups. */
export function useWorkspaceSidebarModel(): WorkspaceSidebarModel {
  const projects = useSidebarProjectGroups();
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const { workspaceGroups } = useForkSettings();
  // Both clocks re-render this hook when a snooze wakes or a minute passes, and the model reads
  // the time when it builds, so sections and statuses follow the clock.
  const minute = useNowMinute();
  const snoozeClock = useSnoozeWakeClock(threads);
  return buildWorkspaceSidebarModel({
    projects,
    threads: filterSidebarV2VisibleThreads(threads, null, delegatedUnderParent),
    lastVisitedAtByKey,
    groups: workspaceGroups,
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

/** Saves group edits as a whole new list, so concurrent clients converge on the last write. */
export function useWorkspaceGroupsEditor() {
  const { workspaceGroups } = useForkSettings();
  const updateForkSettings = useUpdateForkSettings();
  return {
    groups: workspaceGroups,
    update: (edit: (groups: readonly ForkWorkspaceGroup[]) => ForkWorkspaceGroup[]) =>
      updateForkSettings({ workspaceGroups: edit(workspaceGroups) }),
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
