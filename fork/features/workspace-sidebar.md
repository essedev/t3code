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
- **Groups**: named cards that collect workspaces, like Relay. Create one from a workspace's
  right-click menu (Move to group > New group) or with `Ctrl+Cmd+G`. Rename, reorder and delete
  from the group's right-click menu. A group shows only its listed members and
  hides while none is, except a new empty group, which stays so a workspace can be dragged in.
  Groups sync through server settings (`fork.workspaceGroups`); open or closed is per device. A
  closed group shows the most urgent status among its workspaces.
- **Unseen activity moves a row up**, as in Relay's sidebar: when a tab starts waiting on you
  (approval, question, guest request, plan, failure, woke, finished unread) while you look
  elsewhere, its workspace moves to the top of its group, or of the Workspaces list; pinned ones
  stay. The move is saved like a drag and lasts until another one passes it or you move it. Only
  changes seen while the app runs count, so a restart reorders nothing.
- **Dragging**: drag a workspace up or down within its list, into a group (onto its card, open or
  closed), out of one (onto Workspaces), or into or out of the pinned list, which pins or unpins
  it; pinned and grouped are exclusive, as in Relay. Drag a tab left or right in the strip;
  pinned tabs stay ahead of the rest. Orders sync through server settings
  (`fork.workspaceOrder`, and `fork.tabOrder` per workspace); a tab the order does not name yet
  goes to the end.
- **Global rows** at the bottom: Needs you (approvals, questions, guest requests, plans, failures
  and results not seen yet), Snoozed and Settled, across every workspace. Each opens a list built
  on the command palette's parts: a search field (title or workspace, accents ignored), arrows and
  Enter to open a thread, Wake or Un-settle on the highlighted row. Settled shows the true count and
  pages older threads in 25 at a time with Show more, as upstream's Settled shelf does, since the
  server's shell stream keeps only the 25 most recently settled; its search goes through the
  server's thread search, so it finds settled threads not loaded yet, by title or message text.
  The strip's `+N` uses the same list for the workspace's snoozed and settled threads.
- **Tab strip** under the chat header: the workspace's open threads, pinned first, then the rest
  in the dragged order, else creation order. Each tab has its status icon; hover shows Snooze and
  Settle; right click opens upstream's full thread menu; double click renames; middle click
  settles. Settling or snoozing the tab on screen, from any control, the menu or `Cmd+Shift+S`,
  opens the tab to its right (else its left) once the server confirms. Closing the last tab closes
  the workspace too, as in Relay: the next workspace in the sidebar opens (a pinned workspace
  stays and gets a new thread instead); an
  auto-settle never moves you. A snoozed or settled thread opened from a list shows as an extra
  tab until you leave it. The `+N` button lists the
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
  panel, diff, file picker); `Cmd+Shift+S` settles and moves on, `Cmd+N` starts a thread in a
  project picked from the palette.

## How it is built

New files only, in `apps/web/src/fork/workspaces/`, importing upstream's logic:

- `workspaces.logic.ts`: the pure model. Sections follow upstream's precedence (snoozed, settled,
  pinned); statuses come from `resolveThreadStatusPill` plus upstream's woke check, ranked by
  upstream's project priority with Woke between Failed and Working. The pill drops Failed once
  the thread is visited, like the header dot; the tab keeps it until the next run, out of Needs
  you, as upstream's sidebar row does.
- `useWorkspaces.ts`: live data (`useSidebarProjectGroups`, `useQuietThreadShells`), navigation
  and layout edits. Fork settings show an edit right away (`forkSettings.ts`), since upstream's
  settings save is not optimistic and a dropped row would otherwise jump back for a moment.
- `WorkspaceSidebar.tsx`, `ThreadTabStrip.tsx`, `GlobalRows.tsx`, `TabPicker.tsx`,
  `WorkspaceParts.tsx`: the UI. Settled reuses upstream's `useOlderSettledShelf` and
  `useThreadSearch`. Thread actions go
  through `useThreadActions` and `useThreadActionMenu`, like upstream's rows.

Upstream files touched: two mount points (`AppSidebarLayout.tsx`, `ChatView.tsx`), listed in the
README's differences table.

## Differences from the concept

- The strip sits under the chat header, not above it: on desktop the header is the window's
  title bar (drag region, traffic lights), and a strip above it would have to take that role.
- Approve and Decline are not offered inside Needs you; the row opens the thread, where the
  approval card is.

## Limits

- Upstream's sidebar search is not there; the Go to project or thread field opens the command
  palette (Cmd+K), which searches projects and threads.
- Mobile keeps its own thread-centred navigation.
