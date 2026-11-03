/**
 * Pure model of the fork's workspace sidebar and tab strip (fork/DECISIONS.md #7): which threads
 * are tabs of which workspace, in which section and order, which workspaces the sidebar lists, and
 * the edits that dragging and the group menus make.
 */
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  effectiveSnoozed,
  isThreadWokeUnseen,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import type { ForkWorkspaceGroup } from "@t3tools/contracts";

import {
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
  sortPinnedThreadsForSidebar,
} from "../../components/Sidebar.logic";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";

/** Where a tab sits: pinned and live in the strip, snoozed and settled folded into its `+N`. */
export type TabSection = "pinned" | "live" | "snoozed" | "settled";

/** The states upstream's sidebar draws an icon for, plus Plan ready. */
export type TabStatusKind =
  | "approval"
  | "input"
  | "request"
  | "plan"
  | "failed"
  | "woke"
  | "working"
  | "waiting"
  | "done";

/** The status of a tab: what its icon shows and whether it waits on the user. */
export interface TabStatus {
  readonly kind: TabStatusKind;
  readonly label: string;
  readonly needsYou: boolean;
}

/** One thread as a tab of its workspace. */
export interface WorkspaceTab {
  readonly key: string;
  readonly thread: EnvironmentThreadShell;
  readonly section: TabSection;
  readonly status: TabStatus | null;
}

/** A project shown as a workspace, with its tabs split by section. */
export interface Workspace {
  readonly key: string;
  readonly project: SidebarProjectSnapshot;
  /** Pinned tabs, then live tabs: the strip's order, dragged order first. */
  readonly openTabs: readonly WorkspaceTab[];
  readonly snoozedTabs: readonly WorkspaceTab[];
  readonly settledTabs: readonly WorkspaceTab[];
  /** The most urgent status among the open tabs. */
  readonly status: TabStatus | null;
  /** The open tab the workspace row names: the most urgent one, else the latest updated. */
  readonly leadTab: WorkspaceTab | null;
}

/** A fork group with the workspaces it shows. */
export interface WorkspaceGroupView {
  readonly group: ForkWorkspaceGroup;
  readonly workspaces: readonly Workspace[];
  readonly status: TabStatus | null;
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

/** A list a workspace can be dragged within or into. */
export type WorkspaceContainer = "pinned" | "ungrouped" | `group:${string}`;

const STATUS_BY_PILL_LABEL: Record<string, Omit<TabStatus, "needsYou">> = {
  "Pending Approval": { kind: "approval", label: "Approval" },
  "Awaiting Input": { kind: "input", label: "Input" },
  "Guest Request": { kind: "request", label: "Request" },
  "Plan Ready": { kind: "plan", label: "Plan ready" },
  Failed: { kind: "failed", label: "Failed" },
  Working: { kind: "working", label: "Working" },
  Connecting: { kind: "working", label: "Connecting" },
  Waiting: { kind: "waiting", label: "Waiting" },
  Completed: { kind: "done", label: "Done" },
};

// Upstream's project priority (`THREAD_STATUS_PRIORITY`), with Woke between Failed and Working.
const STATUS_PRIORITY: Record<TabStatusKind, number> = {
  approval: 5,
  input: 4,
  request: 3.75,
  failed: 3.5,
  woke: 3.25,
  working: 3,
  waiting: 2.5,
  plan: 2,
  done: 1,
};

const NEEDS_YOU_KINDS = new Set<TabStatusKind>([
  "approval",
  "input",
  "request",
  "plan",
  "failed",
  "woke",
  "done",
]);

/** The scoped key of a thread, the same key the rest of the app uses. */
export function threadShellKey(thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

/**
 * The status of a thread at `now`: upstream's status pill, relabelled as upstream's sidebar does,
 * with Woke when a snooze ended and nothing more urgent shows.
 */
function resolveTabStatus(
  thread: EnvironmentThreadShell,
  lastVisitedAt: string | undefined,
  now: string,
): TabStatus | null {
  const pill = resolveThreadStatusPill({ thread: { ...thread, lastVisitedAt } });
  const base = pill === null ? null : (STATUS_BY_PILL_LABEL[pill.label] ?? null);
  const woke =
    (base === null || base.kind === "done") &&
    isThreadWokeUnseen({
      wokeAt: threadWokeAt(thread, { now }),
      settled: thread.settledOverride === "settled",
      lastVisitedAt,
      latestRunCompletedAt: thread.latestRun?.completedAt ?? null,
    });
  const resolved: Omit<TabStatus, "needsYou"> | null = woke
    ? { kind: "woke", label: "Woke" }
    : base?.kind === "working" && pill?.label === "Working" && thread.goal?.status === "active"
      ? { kind: "working", label: "Goal" }
      : base;
  return resolved === null ? null : { ...resolved, needsYou: NEEDS_YOU_KINDS.has(resolved.kind) };
}

/** The most urgent of some statuses, or null when none is set. */
function mostUrgentStatus(statuses: ReadonlyArray<TabStatus | null>): TabStatus | null {
  let urgent: TabStatus | null = null;
  for (const status of statuses) {
    if (
      status !== null &&
      (urgent === null || STATUS_PRIORITY[status.kind] > STATUS_PRIORITY[urgent.kind])
    ) {
      urgent = status;
    }
  }
  return urgent;
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

/** `items` with the ones `order` names first, in that order; the rest keep their order after. */
function applyOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[]) {
  const rank = new Map(order.map((key, index) => [key, index]));
  const known = items
    .filter((item) => rank.has(keyOf(item)))
    .toSorted((left, right) => rank.get(keyOf(left))! - rank.get(keyOf(right))!);
  return [...known, ...items.filter((item) => !rank.has(keyOf(item)))];
}

function buildWorkspace(
  project: SidebarProjectSnapshot,
  tabs: readonly WorkspaceTab[],
  tabOrder: readonly string[],
): Workspace {
  const pinned = sortPinnedThreadsForSidebar(
    tabs.filter((tab) => tab.section === "pinned").map((tab) => tab.thread),
  ).flatMap((thread) => tabs.find((tab) => tab.thread === thread) ?? []);
  const live = tabs
    .filter((tab) => tab.section === "live")
    .toSorted(
      (left, right) => timestampMs(left.thread.createdAt) - timestampMs(right.thread.createdAt),
    );
  const byKey = (tab: WorkspaceTab) => tab.key;
  const openTabs = [...applyOrder(pinned, byKey, tabOrder), ...applyOrder(live, byKey, tabOrder)];
  const status = mostUrgentStatus(openTabs.map((tab) => tab.status));
  const leadTab =
    (status === null ? null : openTabs.find((tab) => tab.status?.kind === status.kind)) ??
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
 * A workspace is listed while it has an open tab, is pinned, or is `activeWorkspaceKey`; the rest
 * are reached from the command palette until a thread opens there again.
 */
export function buildWorkspaceSidebarModel(input: {
  readonly projects: readonly SidebarProjectSnapshot[];
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByKey: Readonly<Record<string, string>>;
  readonly groups: readonly ForkWorkspaceGroup[];
  readonly workspaceOrder?: readonly string[];
  readonly tabOrder?: Readonly<Record<string, readonly string[]>>;
  readonly activeWorkspaceKey?: string | null;
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
    const lastVisitedAt = resolveThreadLastVisitedAt(
      thread.lastVisitedAt,
      input.lastVisitedAtByKey[key],
    );
    const tabs = tabsByProject.get(project.projectKey) ?? [];
    tabs.push({
      key,
      thread,
      section: resolveTabSection(thread, now),
      status: resolveTabStatus(thread, lastVisitedAt, now),
    });
    tabsByProject.set(project.projectKey, tabs);
  }
  const workspaces = projects.map((project) =>
    buildWorkspace(
      project,
      tabsByProject.get(project.projectKey) ?? [],
      input.tabOrder?.[project.projectKey] ?? [],
    ),
  );
  const workspaceByKey = new Map(workspaces.map((workspace) => [workspace.key, workspace]));
  const listed = (workspace: Workspace) =>
    workspace.openTabs.length > 0 ||
    workspace.project.pinned ||
    workspace.key === input.activeWorkspaceKey;
  const ordered = applyOrder(workspaces, (workspace) => workspace.key, input.workspaceOrder ?? []);

  const placed = new Set<string>();
  const pinned = ordered.filter((workspace) => workspace.project.pinned);
  for (const workspace of pinned) placed.add(workspace.key);
  const groups: WorkspaceGroupView[] = [];
  for (const group of input.groups) {
    const members = group.projectKeys.flatMap((key) => {
      const workspace = workspaceByKey.get(key);
      if (workspace === undefined || placed.has(key)) return [];
      placed.add(key);
      return [workspace];
    });
    const shown = members.filter(listed);
    // A new group shows empty so something can be dragged in; one whose members all went quiet hides.
    if (shown.length === 0 && members.length > 0) continue;
    groups.push({
      group,
      workspaces: shown,
      status: mostUrgentStatus(shown.map((workspace) => workspace.status)),
    });
  }
  const ungrouped = ordered.filter((workspace) => !placed.has(workspace.key) && listed(workspace));

  const allTabs = workspaces.flatMap((workspace) => workspace.openTabs);
  return {
    workspaces,
    workspaceByKey,
    pinned,
    groups,
    ungrouped,
    needsYou: allTabs
      .filter((tab) => tab.status?.needsYou === true)
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

/**
 * The workspaces `Cmd+1..9` and next/previous workspace step through: the sidebar's visible rows
 * top to bottom, so members of a collapsed group are skipped.
 */
export function navigableWorkspaces(
  model: WorkspaceSidebarModel,
  collapsedGroupIds: readonly string[],
): Workspace[] {
  return [
    ...model.pinned,
    ...model.groups.flatMap((view) =>
      collapsedGroupIds.includes(view.group.id) ? [] : view.workspaces,
    ),
    ...model.ungrouped,
  ];
}

/** The item `offset` places from `currentKey`, wrapping; the first or last when it is absent. */
export function stepThrough<T extends { readonly key: string }>(
  items: readonly T[],
  currentKey: string | null,
  offset: 1 | -1,
): T | null {
  if (items.length === 0) return null;
  const index = items.findIndex((item) => item.key === currentKey);
  if (index === -1) return offset === 1 ? items[0]! : items[items.length - 1]!;
  return items[(index + offset + items.length) % items.length]!;
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

function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * The open tab keys after dragging `activeKey` onto `overKey`, or null when the drop changes
 * nothing. Pinned tabs stay ahead of live ones, so a drop across that line is ignored.
 */
export function reorderTabs(
  tabs: readonly WorkspaceTab[],
  activeKey: string,
  overKey: string,
): string[] | null {
  const from = tabs.findIndex((tab) => tab.key === activeKey);
  const to = tabs.findIndex((tab) => tab.key === overKey);
  if (from === -1 || to === -1 || from === to) return null;
  if (tabs[from]!.section !== tabs[to]!.section) return null;
  return arrayMove(tabs, from, to).map((tab) => tab.key);
}

/** The tab to show after closing `key`: the one to its right, else to its left, else none. */
export function tabAfterClosing(tabs: readonly WorkspaceTab[], key: string): WorkspaceTab | null {
  const index = tabs.findIndex((tab) => tab.key === key);
  if (index === -1) return null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

/**
 * Where to go when the last open tab of workspace `key` closes: the next listed workspace in the
 * sidebar's order, else the previous one, else none (the caller stays in the workspace).
 */
export function workspaceAfterClosing(model: WorkspaceSidebarModel, key: string): Workspace | null {
  const listed = [
    ...model.pinned,
    ...model.groups.flatMap((view) => view.workspaces),
    ...model.ungrouped,
  ];
  const index = listed.findIndex((workspace) => workspace.key === key);
  if (index === -1) return listed[0] ?? null;
  return listed[index + 1] ?? listed[index - 1] ?? null;
}

/** The result of dragging a workspace: what to save, and the pin to set when it changes. */
export interface WorkspaceMove {
  readonly groups: ForkWorkspaceGroup[];
  readonly workspaceOrder: string[];
  readonly pinned: boolean | null;
}

/**
 * The edits for dropping workspace `key` from list `from` into list `to`, over `overKey` (the row
 * it takes the place of) or on the list itself (`overKey` null, appended). `targetKeys` are the
 * rows `to` shows now. Pinned and grouped are exclusive, as in Relay: entering one leaves the other.
 */
export function moveWorkspace(input: {
  readonly groups: readonly ForkWorkspaceGroup[];
  readonly workspaceOrder: readonly string[];
  readonly key: string;
  readonly from: WorkspaceContainer;
  readonly to: WorkspaceContainer;
  readonly targetKeys: readonly string[];
  readonly overKey: string | null;
}): WorkspaceMove {
  const { key, from, to } = input;
  const pinned = from === to ? null : to === "pinned" ? true : from === "pinned" ? false : null;
  if (to.startsWith("group:")) {
    const groupId = to.slice("group:".length);
    const groups = input.groups.map((group) => {
      if (group.id !== groupId) {
        return { ...group, projectKeys: group.projectKeys.filter((member) => member !== key) };
      }
      const without = group.projectKeys.filter((member) => member !== key);
      if (from === to && input.overKey !== null) {
        const fromIndex = group.projectKeys.indexOf(key);
        const toIndex = group.projectKeys.indexOf(input.overKey);
        if (fromIndex !== -1 && toIndex !== -1) {
          return { ...group, projectKeys: arrayMove(group.projectKeys, fromIndex, toIndex) };
        }
      }
      const at = input.overKey === null ? -1 : without.indexOf(input.overKey);
      return {
        ...group,
        projectKeys: at === -1 ? [...without, key] : without.toSpliced(at, 0, key),
      };
    });
    return { groups, workspaceOrder: [...input.workspaceOrder], pinned };
  }
  let sequence: string[];
  const fromIndex = input.targetKeys.indexOf(key);
  const overIndex = input.overKey === null ? -1 : input.targetKeys.indexOf(input.overKey);
  if (fromIndex !== -1 && overIndex !== -1) {
    sequence = arrayMove(input.targetKeys, fromIndex, overIndex);
  } else {
    const without = input.targetKeys.filter((member) => member !== key);
    const at = input.overKey === null ? -1 : without.indexOf(input.overKey);
    sequence = at === -1 ? [...without, key] : without.toSpliced(at, 0, key);
  }
  return {
    groups: input.groups.map((group) => ({
      ...group,
      projectKeys: group.projectKeys.filter((member) => member !== key),
    })),
    workspaceOrder: [
      ...sequence,
      ...input.workspaceOrder.filter((member) => !sequence.includes(member)),
    ],
    pinned,
  };
}

/** Which tabs wait on the user, per workspace, and every tab the client knew at that moment. */
export interface NeedsYouSnapshot {
  readonly waiting: ReadonlyMap<string, ReadonlySet<string>>;
  readonly known: ReadonlySet<string>;
}

/** The tabs of `model` that wait on the user, and all its tabs in any section. */
export function needsYouSnapshot(model: WorkspaceSidebarModel): NeedsYouSnapshot {
  const known = new Set<string>();
  const waiting = new Map<string, Set<string>>();
  for (const workspace of model.workspaces) {
    const tabs = [...workspace.openTabs, ...workspace.snoozedTabs, ...workspace.settledTabs];
    for (const tab of tabs) known.add(tab.key);
    waiting.set(
      workspace.key,
      new Set(
        workspace.openTabs.filter((tab) => tab.status?.needsYou === true).map((tab) => tab.key),
      ),
    );
  }
  return { waiting, known };
}

/**
 * The workspaces with a tab that started waiting on the user between two snapshots: Relay's
 * "unseen activity". The tab on screen does not count, nor one the previous snapshot did not hold,
 * so threads arriving while the app loads move nothing.
 */
export function newlyNeedingYou(
  previous: NeedsYouSnapshot,
  next: NeedsYouSnapshot,
  activeThreadKey: string | null,
): string[] {
  const keys: string[] = [];
  for (const [workspaceKey, tabKeys] of next.waiting) {
    const before = previous.waiting.get(workspaceKey);
    for (const tabKey of tabKeys) {
      if (tabKey !== activeThreadKey && previous.known.has(tabKey) && !before?.has(tabKey)) {
        keys.push(workspaceKey);
        break;
      }
    }
  }
  return keys;
}

/**
 * The layout after Relay's bump: a workspace with unseen activity moves to the top of its group,
 * or of the ungrouped list; pinned ones stay. Null when nothing moves.
 */
export function bumpWorkspace(input: {
  readonly groups: readonly ForkWorkspaceGroup[];
  readonly workspaceOrder: readonly string[];
  readonly key: string;
  readonly pinned: boolean;
}): { groups: ForkWorkspaceGroup[]; workspaceOrder: string[] } | null {
  const { key } = input;
  if (input.pinned) return null;
  const group = input.groups.find((candidate) => candidate.projectKeys.includes(key));
  if (group !== undefined) {
    if (group.projectKeys[0] === key) return null;
    return {
      groups: input.groups.map((candidate) =>
        candidate === group
          ? { ...candidate, projectKeys: [key, ...candidate.projectKeys.filter((k) => k !== key)] }
          : candidate,
      ),
      workspaceOrder: [...input.workspaceOrder],
    };
  }
  if (input.workspaceOrder[0] === key) return null;
  return {
    groups: [...input.groups],
    workspaceOrder: [key, ...input.workspaceOrder.filter((k) => k !== key)],
  };
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
  return arrayMove(groups, from, Math.min(Math.max(from + offset, 0), groups.length - 1));
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
