# Workspace sidebar and thread tabs

Turn it on in Settings > Fork > Workspace sidebar. Off, the app shows upstream's sidebar
unchanged. Design and rejected variants: DECISIONS #7 and
[`concepts/concept-a-sidebar-workspace.html`](../concepts/concept-a-sidebar-workspace.html)
(variant C).

## What it does

- **Sidebar**: one row per project (workspace), with its icon (`ProjectFavicon`), the number of
  open tabs, the status icon of its most urgent tab and, below the name, the tab that matters
  (the most urgent, else the latest updated). Pinned projects sit on top. Clicking a workspace
  opens the tab visited last on this device, else the one that matters, else a new thread.
- **Only workspaces you are working in**: a workspace is listed while it has an open tab (pinned
  or live), is pinned, or is the one on screen. Settling or snoozing its last tab takes it off the
  list; a new thread there, or a snooze that wakes, brings it back. The rest are one `Cmd+N` (pick
  a project) or Go to project away.
- **Groups**: named cards that collect workspaces, like Relay. Create one from a workspace's right-click
  menu (Move to group > New group) or with `Ctrl+Cmd+G`. Rename,
  reorder and delete from the group's right-click menu. A group shows only its listed members and
  hides while none is, except a new empty group, which stays so a workspace can be dragged in.
  Groups sync through server settings (`fork.workspaceGroups`); open or closed is per device. A
  closed group shows the most urgent status among its workspaces.
- **Dragging**: drag a workspace up or down within its list, into a group (onto its card, open or
  closed), out of one (onto Workspaces), or into or out of the pinned list, which pins or unpins
  it; pinned and grouped are exclusive, as in Relay. Drag a tab left or right in the strip;
  pinned tabs stay ahead of the rest. Orders sync through server settings
  (`fork.workspaceOrder`, and `fork.tabOrder` per workspace); a tab the order does not name yet
  goes to the end.
- **Global rows** at the bottom: Needs you (approvals, questions, guest requests, plans, failures
  and results not seen yet), Snoozed (with wake time and Wake) and Settled (newest 10, Show all,
  Un-settle), across every workspace. A row opens its thread.
- **Tab strip** under the chat header: the workspace's open threads, pinned first, then the rest
  in the dragged order, else creation order. Each tab has its status icon; hover shows Snooze and Settle; right click
  opens upstream's full thread menu; double click renames; middle click settles. A snoozed or
  settled thread opened from a list shows as an extra tab. The `+N` button lists the
  workspace's snoozed and settled threads; the pen starts a new thread in the workspace.
- **Status icons**: upstream's sidebar icons and colours (Working, Waiting, Approval, Input,
  Request, Failed, Woke, Done), plus Plan ready, which upstream's sidebar does not draw.
- **Shortcuts**, Relay's two axes (fixed, not remappable):

  | Keys                         | Action                                                                               |
  | ---------------------------- | ------------------------------------------------------------------------------------ |
  | `Cmd+T`                      | New thread (a new tab) in the current workspace; in the right panel, its own new tab |
  | `Cmd+1..9`                   | Workspace N among the visible rows (desktop app; upstream's jump-to-thread binding)  |
  | `Option+1..9`                | Tab N of the current workspace                                                       |
  | `Option+Cmd+Up/Down`         | Previous or next workspace                                                           |
  | `Ctrl+Tab`, `Ctrl+Shift+Tab` | Next or previous tab (also upstream's `Cmd+Shift+]` and `[`)                         |
  | `Option+Cmd+J`, `+Shift`     | Next or previous thread in Needs you                                                 |
  | `Ctrl+Cmd+G`                 | Ungroup the current workspace, or start a new group with it                          |

  Holding `Cmd` or `Option` for a moment shows the numbers on the rows and tabs, like upstream's
  jump hints. Relay's `Cmd+J`, `Cmd+W`, `Cmd+D` and `Cmd+P` stay upstream's (terminal, right
  panel, diff, file picker); `Cmd+Shift+S` settles. Settle-and-advance settles the tab and opens the next one.

## How it is built

New files only, in `apps/web/src/fork/workspaces/`, importing upstream's logic:

- `workspaces.logic.ts`: the pure model. Sections follow upstream's precedence (snoozed, settled,
  pinned); statuses come from `resolveThreadStatusPill` plus upstream's woke check, ranked by
  upstream's project priority with Woke between Failed and Working.
- `useWorkspaces.ts`: live data (`useSidebarProjectGroups`, `useQuietThreadShells`), navigation
  and layout edits. Fork settings show an edit right away (`forkSettings.ts`), since upstream's
  settings save is not optimistic and a dropped row would otherwise jump back for a moment.
- `WorkspaceSidebar.tsx`, `ThreadTabStrip.tsx`, `WorkspaceParts.tsx`: the UI. Thread actions go
  through `useThreadActions` and `useThreadActionMenu`, like upstream's rows.

Upstream files touched: two mount points (`AppSidebarLayout.tsx`, `ChatView.tsx`), listed in the
README's differences table.

## Differences from the concept

- The strip sits under the chat header, not above it: on desktop the header is the window's
  title bar (drag region, traffic lights), and a strip above it would have to take that role.
- Approve and Decline are not offered inside Needs you; the row opens the thread, where the
  approval card is.

## Limits

- Settled lists only the settled threads the client has loaded; upstream pages older ones in on
  demand in its own sidebar.
- Upstream's sidebar search is not there; the Go to project or thread field opens the command
  palette (Cmd+K), which searches projects and threads.
- Mobile keeps its own thread-centred navigation.
