# essedev/t3code fork

A personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that ships its own
macOS desktop builds with working in-app updates. Its scripts and docs live in `fork/`, its app
features in new files with "fork" in their path, and upstream files change only as the table below
lists, so rebasing on a new upstream release rarely conflicts.

Fork docs, all in this folder:

- [`DECISIONS.md`](DECISIONS.md): why the fork works this way, numbered and citable as `#N`.
- [`ROADMAP.md`](ROADMAP.md): what is in progress or next.
- [`BACKLOG.md`](BACKLOG.md): open work nobody is about to do.
- `changelog/YYYY-MM.md`: every release in order, newest first, one file per month. Written by
  `release.sh`, never by hand.
- `features/<name>.md`: one page per fork-only feature, created with the feature.
- `concepts/`: the design mocks behind a feature, linked from its page.
- [`release-flow.html`](release-flow.html): visual overview of the release flow.

## Differences from upstream

Every upstream file the fork changes, one row each, so a rebase conflict is easy to place. This is
the current state, not history: a row goes away when the file matches upstream again. Files the
fork adds need no row: they cannot conflict, and they carry "fork" in their path (DECISIONS #8).
`release.sh` refuses to release while a changed file has no row, a row has no change, or an added
file lacks "fork" in its path.

- `apps/desktop/src/boot.ts`: telemetry and OpenTelemetry export off by default (DECISIONS #5).
- `apps/server/src/process/externalLauncher.ts`: mounts `forkSystemBrowser.ts` for the
  `systemBrowser` launch.
- `apps/server/src/project/ProjectFaviconResolver.ts`: when the root has no icon, a bounded search
  of subfolders finds a monorepo app's favicon (`frontend/public`, `apps/web/public`) or a macOS
  app's `AppIcon.icns` (`bundle/`).
- `apps/server/src/project/ProjectFaviconResolver.test.ts`: the monorepo layouts it covers.
- `apps/web/src/components/AppSidebarLayout.tsx`: mounts the workspace sidebar when it is on.
- `apps/web/src/components/ChatMarkdown.tsx`: "Open in system browser" on chat file links.
- `apps/web/src/components/ChatView.tsx`: mounts the thread tab strip under the chat header.
- `apps/web/src/components/chat/MarkdownFileLink.tsx`: the menu item of that action.
- `apps/web/src/components/settings/SettingsSidebarNav.tsx`: icon of the Fork settings page.
- `apps/web/src/components/settings/settingsSearch.ts`: Fork settings page and its search entries.
- `apps/web/src/fileContextMenu.ts`: "Open in system browser" in the file tree and diff menus.
- `apps/web/src/routeTree.gen.ts`: generated; on a conflict take upstream's and run `vp run dev`
  once to regenerate it with the fork's settings route.
- `apps/web/src/routes/_chat.tsx`: mounts `ForkStyles` (`fork.css` and the custom CSS).
- `packages/contracts/src/editor.ts`: the `systemBrowser` flag of the launch input.
- `packages/contracts/src/index.ts`: exports `forkSettings.ts`.
- `packages/contracts/src/settings.ts`: the `fork` key in server settings and their patch.
- `CLAUDE.md`: imports this README.

## Branches and remotes

- `origin` is `essedev/t3code`, `upstream` is `pingdotgg/t3code`.
- `fork` is the working branch: upstream's latest stable tag plus the fork commits. Releases are
  cut from it.
- `main` only mirrors upstream and carries no fork commits.

## One-time setup on a Mac

1. `curl -fsSL https://vite.plus | bash`, then `vp i`.
2. Rust 1.95 or newer (`rustup update stable`); the resource monitor's dependencies require it.
3. `bash fork/setup-signing.sh`. It creates the "T3 Code Fork Self-Signed" identity in a dedicated
   keychain under `~/.t3-fork/codesign` and prints one `sudo` command to trust it for code signing.
4. `gh auth switch --user essedev`.

## Releasing

```sh
bash fork/release.sh --dry-run   # version, checks and changelog entry, nothing written
bash fork/release.sh
```

It checks the branch, a clean tree, the gh account, the signing identity and the differences
table, picks the version, and commits the changelog entry: the fork commits whose subjects were
not in the previous release, plus a line when the upstream base moved. It then builds a signed DMG
and zip with the update feed pointing at `essedev/t3code`, verifies the signature and the feed,
pushes `fork` with an annotated `fork-v<version>` tag and publishes the GitHub release with the
same entry as notes. The installed app finds it on its next update check. Commit subjects become
the changelog, so write them for a reader.

## Following a new upstream stable

```sh
git fetch upstream --tags
git rebase v0.1.7          # the new upstream stable tag
bash fork/release.sh
```

`release.sh` pushes the rebased branch with `--force-with-lease`. If it stops before pushing, fix
the cause and run it again: the changelog entry is not written twice. A push by hand would leave
the branch without a GitHub release, and the installed app would not see the update.

## Version scheme

The updater only offers a stable version greater than the installed one, and semver compares
patches as numbers, so the scheme is:

| Release                                   | Version                        | Tag                  |
| ----------------------------------------- | ------------------------------ | -------------------- |
| First fork release on upstream `v0.1.7`   | `0.1.7`                        | `fork-v0.1.7`        |
| Later fork-only releases on the same base | `0.1.8-fork.1`, `0.1.8-fork.2` | `fork-v0.1.8-fork.1` |

Order: `0.1.7 < 0.1.8-fork.1 < 0.1.8-fork.2 < 0.1.8`. The app keeps the `latest` update channel
because T3 Code derives it from nightly and preview version patterns only, which `-fork.N` does
not match. Tags are prefixed with `fork-` so they never collide with upstream's `v*` tags.

`-fork.N` releases lack one thing: the background service, SSH environments and `t3 update`
download the CLI runtime from upstream's releases by exact version, and those versions do not exist
there. They work again from the next release that takes an upstream version.

## Gotchas

- The fork app and the official app share the bundle id, the Electron profile
  (`~/Library/Application Support/t3code-v2`) and `~/.t3`, so only one runs at a time. Quit the
  other with Cmd+Q; closing the window leaves it running and the second app exits silently.
- Never install a fork release older than the official build that last ran on `~/.t3`: an older
  build lacks the newer database migrations. Back up `~/.t3/userdata` before switching.
- Builds are self-signed, not notarized: they run because a local build has no quarantine flag.
  A DMG downloaded through a browser needs `xattr -dr com.apple.quarantine` on the app once.
  In-browser passkeys need Apple's provisioning profile and stay disabled.
