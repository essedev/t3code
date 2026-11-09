# Project icons from subfolders

Upstream looks for a project's icon at the repository root only, so a monorepo or a native app shows
the generic folder. When the root has no icon, the fork searches the subfolders too.

## What it looks for

Up to two levels below the root, in each folder, in this order:

1. `public/favicon.svg`, `public/favicon.png`, `public/favicon.ico`.
2. `AppIcon.icns`, `Resources/AppIcon.icns` (a Swift app that keeps its icon in `bundle/`).
3. The icon link in the folder's `index.html`.

Folders named `frontend`, `web`, `client` or `app` come first, then alphabetical order. Hidden
folders, `node_modules` and build output are skipped, and the walk stops after 50 folders, so a
large repository stays cheap.

## How it is built

The walk is in `apps/server/src/project/forkProjectFavicon.ts`, tested in
`forkProjectFavicon.test.ts`. Upstream's `ProjectFaviconResolver.ts` calls it when the root has no
icon and passes the folder to its private lookups, so it gains a base directory parameter on top of
the mount point: on a rebase, expect any conflict there.
