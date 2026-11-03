# Workspace sidebar and thread tabs

Turn it on in Settings > Fork > Workspace sidebar. Off, the app shows upstream's sidebar
unchanged. Design and rejected variants: DECISIONS #7 and
[`concepts/concept-a-sidebar-workspace.html`](../concepts/concept-a-sidebar-workspace.html)
(variant C).

## What it does

- **Sidebar**: one row per project (workspace), with its icon (`ProjectFavicon`), the number of
  open tabs, the status dot of its most urgent tab and, below the name, the tab that matters
  (the most urgent, else the latest updated). Pinned projects sit on top. Clicking a workspace
  opens the tab visited last on this device, else the one that matters, else a new thread.
- **Groups**: named cards that collect workspaces, like Relay. Create one with "New group" at the
  bottom of the list or from a workspace's right-click menu (Move to group > New group). Rename,
  reorder and delete from the group's right-click menu; a workspace moves in, out and up or down
  from its own menu. Groups sync through server settings (`fork.workspaceGroups`); open or closed
  is per device. A closed group shows the most urgent status among its workspaces.
- **Global rows** at the bottom: Needs you (approvals, questions, guest requests, plans, failures
  and results not seen yet), Snoozed (with wake time and Wake) and Settled (newest 10, Show all,
  Un-settle), across every workspace. A row opens its thread.
- **Tab strip** under the chat header: the workspace's open threads, pinned first, then the rest
  in creation order. Each tab has its status dot; hover shows Snooze and Settle; right click
  opens upstream's full thread menu; double click renames; middle click settles. A snoozed or
  settled thread opened from a list shows as an extra tab. The `+N` button lists the
  workspace's snoozed and settled threads; the pen starts a new thread in the workspace.
- **Shortcuts**: previous and next thread and jump to thread 1 to 9 move between the tabs of the
  current workspace. Settle-and-advance settles the tab and opens the next one.

## How it is built

New files only, in `apps/web/src/fork/workspaces/`, importing upstream's logic:

- `workspaces.logic.ts`: the pure model. Sections follow upstream's precedence (snoozed, settled,
  pinned); statuses come from `resolveThreadStatusPill` and the workspace badge from
  `resolveProjectStatusIndicator` (needs you > failed > working > finished unread > idle).
- `useWorkspaces.ts`: live data (`useSidebarProjectGroups`, `useQuietThreadShells`), navigation
  and group edits.
- `WorkspaceSidebar.tsx`, `ThreadTabStrip.tsx`, `WorkspaceParts.tsx`: the UI. Thread actions go
  through `useThreadActions` and `useThreadActionMenu`, like upstream's rows.

Upstream files touched: two mount points (`AppSidebarLayout.tsx`, `ChatView.tsx`), listed in the
README's differences table.

## Differences from the concept

- The strip sits under the chat header, not above it: on desktop the header is the window's
  title bar (drag region, traffic lights), and a strip above it would have to take that role.
- Approve and Decline are not offered inside Needs you; the row opens the thread, where the
  approval card is.
- No drag and drop yet: workspaces move between groups with the right-click menu.

## Limits

- Settled lists only the settled threads the client has loaded; upstream pages older ones in on
  demand in its own sidebar.
- Upstream's sidebar search is not there; the Go to project or thread field opens the command
  palette (Cmd+K), which searches projects and threads.
- Mobile keeps its own thread-centred navigation.
