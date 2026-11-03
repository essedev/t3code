import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import {
  assignWorkspaceToGroup,
  buildWorkspaceSidebarModel,
  moveWorkspace,
  moveWorkspaceGroup,
  removeWorkspaceGroup,
  renameWorkspaceGroup,
  reorderTabs,
} from "./workspaces.logic";

const NOW = "2026-11-02T16:20:00.000Z";
const environmentId = EnvironmentId.make("local");

function project(key: string, overrides: Partial<SidebarProjectSnapshot> = {}) {
  // Only the fields the model reads; the rest of the snapshot is display data.
  return {
    projectKey: key,
    displayName: key,
    pinned: false,
    archived: false,
    memberProjectRefs: [{ environmentId, projectId: ProjectId.make(key) }],
    ...overrides,
  } as unknown as SidebarProjectSnapshot;
}

function thread(id: string, projectKey: string, overrides: Partial<EnvironmentThreadShell> = {}) {
  // Only the fields section and status resolution read.
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: ProjectId.make(projectKey),
    title: id,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    pinnedAt: null,
    pinOrderKey: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: [],
    interactionMode: "default",
    latestRun: null,
    runtime: null,
    lastVisitedAt: null,
    ...overrides,
  } as unknown as EnvironmentThreadShell;
}

const group = (id: string, projectKeys: string[]) => ({ id, name: id, projectKeys });

function listedKeys(model: ReturnType<typeof buildWorkspaceSidebarModel>): string[] {
  return [
    ...model.pinned,
    ...model.groups.flatMap((view) => view.workspaces),
    ...model.ungrouped,
  ].map((workspace) => workspace.key);
}

describe("buildWorkspaceSidebarModel", () => {
  it("splits tabs by section and orders pinned, then live by creation", () => {
    const model = buildWorkspaceSidebarModel({
      projects: [project("t3code")],
      threads: [
        thread("late", "t3code", { createdAt: "2026-11-02T09:00:00.000Z" }),
        thread("early", "t3code", { createdAt: "2026-11-01T09:00:00.000Z" }),
        thread("pinned", "t3code", { pinnedAt: "2026-11-01T00:00:00.000Z" }),
        thread("settled", "t3code", { settledOverride: "settled" }),
        thread("snoozed", "t3code", {
          snoozedUntil: "2026-11-03T08:00:00.000Z",
          snoozedAt: "2026-11-02T08:00:00.000Z",
        }),
        thread("woke", "t3code", {
          snoozedUntil: "2026-11-02T08:00:00.000Z",
          snoozedAt: "2026-11-01T08:00:00.000Z",
        }),
      ],
      lastVisitedAtByKey: {},
      groups: [],
      now: NOW,
    });
    const workspace = model.workspaceByKey.get("t3code")!;
    expect(workspace.openTabs.map((tab) => tab.thread.id)).toEqual([
      "pinned",
      "early",
      "woke",
      "late",
    ]);
    expect(workspace.snoozedTabs.map((tab) => tab.thread.id)).toEqual(["snoozed"]);
    expect(workspace.settledTabs.map((tab) => tab.thread.id)).toEqual(["settled"]);
    expect(workspace.openTabs.find((tab) => tab.thread.id === "woke")?.status?.kind).toBe("woke");

    const dragged = buildWorkspaceSidebarModel({
      projects: [project("t3code")],
      threads: [
        thread("late", "t3code", { createdAt: "2026-11-02T09:00:00.000Z" }),
        thread("early", "t3code", { createdAt: "2026-11-01T09:00:00.000Z" }),
        thread("new", "t3code", { createdAt: "2026-11-02T10:00:00.000Z" }),
      ],
      lastVisitedAtByKey: {},
      groups: [],
      // A tab the saved order does not name yet goes to the end, like a new browser tab.
      tabOrder: { t3code: ["local:late", "local:early", "local:gone"] },
      now: NOW,
    }).workspaceByKey.get("t3code")!;
    expect(dragged.openTabs.map((tab) => tab.thread.id)).toEqual(["late", "early", "new"]);
    expect(reorderTabs(dragged.openTabs, "local:new", "local:late")).toEqual([
      "local:new",
      "local:late",
      "local:early",
    ]);
  });

  it("badges the workspace with the most urgent open tab and lists it under Needs you", () => {
    const model = buildWorkspaceSidebarModel({
      projects: [project("relay")],
      threads: [
        thread("working", "relay", {
          runtime: { status: "running" } as EnvironmentThreadShell["runtime"],
        }),
        thread("asking", "relay", { hasPendingUserInput: true }),
        thread("parked", "relay", { hasPendingApprovals: true, settledOverride: "settled" }),
      ],
      lastVisitedAtByKey: {},
      groups: [],
      now: NOW,
    });
    const workspace = model.workspaceByKey.get("relay")!;
    expect(workspace.status).toEqual({ kind: "input", label: "Input", needsYou: true });
    expect(workspace.leadTab?.thread.id).toBe("asking");
    expect(model.needsYou.map((tab) => tab.thread.id)).toEqual(["asking"]);
  });

  it("lists pinned, then groups, then the rest, and only workspaces with open tabs", () => {
    const model = buildWorkspaceSidebarModel({
      projects: [
        project("a"),
        project("b"),
        project("c", { pinned: true }),
        project("d"),
        project("quiet"),
        project("idle"),
        project("current"),
        project("gone", { archived: true }),
      ],
      threads: [
        thread("a1", "a"),
        thread("b1", "b"),
        thread("d1", "d"),
        thread("idle1", "idle", { settledOverride: "settled" }),
      ],
      lastVisitedAtByKey: {},
      // "c" is pinned and "missing" no longer exists, so neither shows in a group. "rest" has
      // only a quiet member and hides; "new" has no members and shows so a row can be dropped in.
      groups: [
        group("work", ["d", "c", "missing"]),
        group("side", ["a", "d", "quiet"]),
        group("rest", ["idle"]),
        group("new", []),
      ],
      workspaceOrder: ["current", "b"],
      activeWorkspaceKey: "current",
      now: NOW,
    });
    expect(model.pinned.map((workspace) => workspace.key)).toEqual(["c"]);
    expect(
      model.groups.map((view) => [view.group.id, view.workspaces.map((ws) => ws.key)]),
    ).toEqual([
      ["work", ["d"]],
      ["side", ["a"]],
      ["new", []],
    ]);
    expect(model.ungrouped.map((workspace) => workspace.key)).toEqual(["current", "b"]);
    expect(
      model.workspaces.filter((ws) => !listedKeys(model).includes(ws.key)).map((ws) => ws.key),
    ).toEqual(["quiet", "idle"]);
  });
});

describe("workspace group edits", () => {
  const groups = [group("one", ["a", "b"]), group("two", ["c"])];

  it("moves a workspace between groups and out of every group", () => {
    expect(assignWorkspaceToGroup(groups, "a", "two")).toEqual([
      group("one", ["b"]),
      group("two", ["c", "a"]),
    ]);
    expect(assignWorkspaceToGroup(groups, "c", null)).toEqual([
      group("one", ["a", "b"]),
      group("two", []),
    ]);
  });

  it("reorders groups, clamped at the ends", () => {
    expect(moveWorkspaceGroup(groups, "two", -1).map((g) => g.id)).toEqual(["two", "one"]);
    expect(moveWorkspaceGroup(groups, "two", 1).map((g) => g.id)).toEqual(["one", "two"]);
  });

  it("drags a workspace within a group, across groups, out of them and into pinned", () => {
    const base = { groups, workspaceOrder: ["x", "y"] };
    const within = moveWorkspace({
      ...base,
      key: "b",
      from: "group:one",
      to: "group:one",
      targetKeys: ["a", "b"],
      overKey: "a",
    });
    expect(within.groups[0]!.projectKeys).toEqual(["b", "a"]);
    expect(within.pinned).toBeNull();

    const across = moveWorkspace({
      ...base,
      key: "a",
      from: "group:one",
      to: "group:two",
      targetKeys: ["c"],
      overKey: "c",
    });
    expect(across.groups).toEqual([group("one", ["b"]), group("two", ["a", "c"])]);

    const out = moveWorkspace({
      ...base,
      key: "a",
      from: "group:one",
      to: "ungrouped",
      targetKeys: ["x", "y"],
      overKey: "y",
    });
    expect(out.groups[0]!.projectKeys).toEqual(["b"]);
    expect(out.workspaceOrder).toEqual(["x", "a", "y"]);

    const pinned = moveWorkspace({
      ...base,
      key: "y",
      from: "ungrouped",
      to: "pinned",
      targetKeys: [],
      overKey: null,
    });
    expect(pinned.pinned).toBe(true);
    expect(pinned.workspaceOrder).toEqual(["y", "x"]);
  });

  it("keeps the old name for a blank rename and ungroups on removal", () => {
    expect(renameWorkspaceGroup(groups, "one", "  ")[0]!.name).toBe("one");
    expect(renameWorkspaceGroup(groups, "one", " Work ")[0]!.name).toBe("Work");
    expect(removeWorkspaceGroup(groups, "one")).toEqual([group("two", ["c"])]);
  });
});
