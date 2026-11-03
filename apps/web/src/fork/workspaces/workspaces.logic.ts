/**
 * Pure model of the fork's workspace sidebar and tab strip (fork/DECISIONS.md #7): which threads
 * are tabs of which workspace, in which section, and how fork groups arrange the workspaces.
 */
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import type { ForkWorkspaceGroup } from "@t3tools/contracts";

import {
  resolveProjectStatusIndicator,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
  sortPinnedThreadsForSidebar,
  type ThreadStatusPill,
} from "../../components/Sidebar.logic";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";

/** Where a tab sits: pinned and live in the strip, snoozed and settled folded into its `+N`. */
export type TabSection = "pinned" | "live" | "snoozed" | "settled";

/** One thread as a tab of its workspace. */
export interface WorkspaceTab {
  readonly key: string;
  readonly thread: EnvironmentThreadShell;
  readonly section: TabSection;
  readonly status: ThreadStatusPill | null;
}

/** A project shown as a workspace, with its tabs split by section. */
export interface Workspace {
  readonly key: string;
  readonly project: SidebarProjectSnapshot;
  /** Pinned tabs first, then live tabs in creation order: the strip's order. */
  readonly openTabs: readonly WorkspaceTab[];
  readonly snoozedTabs: readonly WorkspaceTab[];
  readonly settledTabs: readonly WorkspaceTab[];
  /** The most urgent status among the open tabs, `resolveProjectStatusIndicator`'s order. */
  readonly status: ThreadStatusPill | null;
  /** The open tab the workspace row names: the most urgent one, else the latest updated. */
  readonly leadTab: WorkspaceTab | null;
}

/** A fork group with the workspaces it lists that still exist. */
export interface WorkspaceGroupView {
  readonly group: ForkWorkspaceGroup;
  readonly workspaces: readonly Workspace[];
  readonly status: ThreadStatusPill | null;
}

/** Everything the workspace sidebar renders. */
export interface WorkspaceSidebarModel {
  readonly workspaces: readonly Workspace[];
  readonly workspaceByKey: ReadonlyMap<string, Workspace>;
  readonly pinned: readonly Workspace[];
  readonly groups: readonly WorkspaceGroupView[];
  readonly ungrouped: readonly Workspace[];
  readonly needsYou: readonly WorkspaceTab[];
  readonly snoozed: readonly WorkspaceTab[];
  readonly settled: readonly WorkspaceTab[];
}

// Statuses that wait on the user: a question, an approval, a plan, or a result not seen yet.
const NEEDS_YOU_LABELS = new Set([
  "Pending Approval",
  "Awaiting Input",
  "Guest Request",
  "Plan Ready",
  "Failed",
  "Completed",
]);

/** True when the tab waits on the user. */
function tabNeedsYou(tab: WorkspaceTab): boolean {
  return tab.status !== null && NEEDS_YOU_LABELS.has(tab.status.label);
}

/** The scoped key of a thread, the same key the rest of the app uses. */
export function threadShellKey(thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

/** The section of a thread at `now`, with upstream's precedence: snoozed, settled, pinned. */
function resolveTabSection(thread: EnvironmentThreadShell, now: string): TabSection {
  if (effectiveSnoozed(thread, { now })) return "snoozed";
  if (thread.settledOverride === "settled") return "settled";
  if (thread.pinnedAt != null) return "pinned";
  return "live";
}

function timestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildWorkspace(project: SidebarProjectSnapshot, tabs: readonly WorkspaceTab[]): Workspace {
  const pinned = sortPinnedThreadsForSidebar(
    tabs.filter((tab) => tab.section === "pinned").map((tab) => tab.thread),
  ).flatMap((thread) => tabs.find((tab) => tab.thread === thread) ?? []);
  const live = tabs
    .filter((tab) => tab.section === "live")
    .toSorted(
      (left, right) => timestampMs(left.thread.createdAt) - timestampMs(right.thread.createdAt),
    );
  const openTabs = [...pinned, ...live];
  const status = resolveProjectStatusIndicator(openTabs.map((tab) => tab.status));
  const leadTab =
    (status === null ? null : openTabs.find((tab) => tab.status?.label === status.label)) ??
    openTabs.toSorted(
      (left, right) => timestampMs(right.thread.updatedAt) - timestampMs(left.thread.updatedAt),
    )[0] ??
    null;
  return {
    key: project.projectKey,
    project,
    openTabs,
    snoozedTabs: tabs
      .filter((tab) => tab.section === "snoozed")
      .toSorted(
        (left, right) =>
          timestampMs(left.thread.snoozedUntil) - timestampMs(right.thread.snoozedUntil),
      ),
    settledTabs: tabs
      .filter((tab) => tab.section === "settled")
      .toSorted(
        (left, right) =>
          timestampMs(right.thread.settledAt ?? right.thread.updatedAt) -
          timestampMs(left.thread.settledAt ?? left.thread.updatedAt),
      ),
    status,
    leadTab,
  };
}

/**
 * Builds the sidebar model. `projects` comes in the sidebar's project order, `threads` are the
 * visible thread shells, and `lastVisitedAtByKey` is this device's visit record per thread key.
 */
export function buildWorkspaceSidebarModel(input: {
  readonly projects: readonly SidebarProjectSnapshot[];
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByKey: Readonly<Record<string, string>>;
  readonly groups: readonly ForkWorkspaceGroup[];
  /** The time to resolve snoozes at; the current time when omitted. */
  readonly now?: string;
  /** Changes when the caller's clocks tick, so a memoizing caller rebuilds. Not read. */
  readonly clockKey?: string;
}): WorkspaceSidebarModel {
  const now = input.now ?? new Date().toISOString();
  const projects = input.projects.filter((project) => !project.archived);
  const projectByMember = new Map<string, SidebarProjectSnapshot>();
  for (const project of projects) {
    for (const ref of project.memberProjectRefs) {
      projectByMember.set(`${ref.environmentId}:${ref.projectId}`, project);
    }
  }
  const tabsByProject = new Map<string, WorkspaceTab[]>();
  for (const thread of input.threads) {
    const project = projectByMember.get(`${thread.environmentId}:${thread.projectId}`);
    if (project === undefined) continue;
    const key = threadShellKey(thread);
    const status = resolveThreadStatusPill({
      thread: {
        ...thread,
        lastVisitedAt: resolveThreadLastVisitedAt(
          thread.lastVisitedAt,
          input.lastVisitedAtByKey[key],
        ),
      },
    });
    const tabs = tabsByProject.get(project.projectKey) ?? [];
    tabs.push({ key, thread, section: resolveTabSection(thread, now), status });
    tabsByProject.set(project.projectKey, tabs);
  }
  const workspaces = projects.map((project) =>
    buildWorkspace(project, tabsByProject.get(project.projectKey) ?? []),
  );
  const workspaceByKey = new Map(workspaces.map((workspace) => [workspace.key, workspace]));

  const placed = new Set<string>();
  const pinned = workspaces.filter((workspace) => workspace.project.pinned);
  for (const workspace of pinned) placed.add(workspace.key);
  const groups = input.groups.map((group) => {
    const members = group.projectKeys.flatMap((key) => {
      const workspace = workspaceByKey.get(key);
      if (workspace === undefined || placed.has(key)) return [];
      placed.add(key);
      return [workspace];
    });
    return {
      group,
      workspaces: members,
      status: resolveProjectStatusIndicator(members.map((workspace) => workspace.status)),
    };
  });
  const ungrouped = workspaces.filter((workspace) => !placed.has(workspace.key));

  const allTabs = workspaces.flatMap((workspace) => workspace.openTabs);
  return {
    workspaces,
    workspaceByKey,
    pinned,
    groups,
    ungrouped,
    needsYou: allTabs
      .filter(tabNeedsYou)
      .toSorted(
        (left, right) => timestampMs(right.thread.updatedAt) - timestampMs(left.thread.updatedAt),
      ),
    snoozed: workspaces
      .flatMap((workspace) => workspace.snoozedTabs)
      .toSorted(
        (left, right) =>
          timestampMs(left.thread.snoozedUntil) - timestampMs(right.thread.snoozedUntil),
      ),
    settled: workspaces
      .flatMap((workspace) => workspace.settledTabs)
      .toSorted(
        (left, right) =>
          timestampMs(right.thread.settledAt ?? right.thread.updatedAt) -
          timestampMs(left.thread.settledAt ?? left.thread.updatedAt),
      ),
  };
}

/** The workspace a thread or a draft belongs to. */
export function findWorkspaceKey(
  projects: readonly SidebarProjectSnapshot[],
  ref: { readonly environmentId: string; readonly projectId: string },
): string | null {
  return (
    projects.find((project) =>
      project.memberProjectRefs.some(
        (member) =>
          member.environmentId === ref.environmentId && member.projectId === ref.projectId,
      ),
    )?.projectKey ?? null
  );
}

/** Groups with a new empty group appended. */
export function addWorkspaceGroup(
  groups: readonly ForkWorkspaceGroup[],
  group: { readonly id: string; readonly name: string },
): ForkWorkspaceGroup[] {
  return [...groups, { id: group.id, name: group.name, projectKeys: [] }];
}

/** Groups with one renamed; a blank name keeps the old one. */
export function renameWorkspaceGroup(
  groups: readonly ForkWorkspaceGroup[],
  groupId: string,
  name: string,
): ForkWorkspaceGroup[] {
  const trimmed = name.trim();
  return groups.map((group) =>
    group.id === groupId && trimmed !== "" ? { ...group, name: trimmed } : group,
  );
}

/** Groups without one; its workspaces go back to the ungrouped list. */
export function removeWorkspaceGroup(
  groups: readonly ForkWorkspaceGroup[],
  groupId: string,
): ForkWorkspaceGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** Groups with one moved by `offset` places, clamped to the list. */
export function moveWorkspaceGroup(
  groups: readonly ForkWorkspaceGroup[],
  groupId: string,
  offset: number,
): ForkWorkspaceGroup[] {
  const from = groups.findIndex((group) => group.id === groupId);
  if (from === -1) return [...groups];
  const to = Math.min(Math.max(from + offset, 0), groups.length - 1);
  const next = [...groups];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Groups with a workspace moved into `groupId` (appended), or out of every group with null. */
export function assignWorkspaceToGroup(
  groups: readonly ForkWorkspaceGroup[],
  projectKey: string,
  groupId: string | null,
): ForkWorkspaceGroup[] {
  return groups.map((group) => {
    const without = group.projectKeys.filter((key) => key !== projectKey);
    return {
      ...group,
      projectKeys: group.id === groupId ? [...without, projectKey] : without,
    };
  });
}

/** Groups with a workspace moved one place up or down inside its group. */
export function moveWorkspaceInGroup(
  groups: readonly ForkWorkspaceGroup[],
  projectKey: string,
  offset: number,
): ForkWorkspaceGroup[] {
  return groups.map((group) => {
    const from = group.projectKeys.indexOf(projectKey);
    if (from === -1) return group;
    const to = Math.min(Math.max(from + offset, 0), group.projectKeys.length - 1);
    const projectKeys = [...group.projectKeys];
    projectKeys.splice(from, 1);
    projectKeys.splice(to, 0, projectKey);
    return { ...group, projectKeys };
  });
}
