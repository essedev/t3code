# Open in system browser

Right-click an `.html`, `.htm` or `.pdf` file in the file tree, a diff or a chat file link and pick
"Open in system browser" to open it in the Mac's default web browser. Upstream's "Open" follows the
file type's handler, often an editor for `.html`, and its "Open in integrated browser" stays inside
the app.

The file opens on the machine running the server, so the item appears only when that machine is the
user's own Mac: it is hidden on remote connections, on servers that are not macOS and for clients
without the host operate scope.

## How it is built

`apps/web/src/fork/systemBrowser.ts` decides availability and calls upstream's `openInEditor` with
`editor: "file-manager"` and `systemBrowser: true`, so there is no new RPC.
`apps/server/src/process/forkSystemBrowser.ts` asks macOS for the handler of an `https` URL and
runs `open -a <browser> <file>`. The upstream files that mount it are in the README's differences
table.

## Limits

- macOS only: other platforms answer with an unsupported error, and the menu never offers the item
  there.
- Web and desktop menus only, not on mobile.
