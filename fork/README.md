# essedev/t3code fork

A personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that ships its own
macOS desktop builds with working in-app updates. Everything fork-specific lives in `fork/`, plus
one import line in `CLAUDE.md`, so rebasing on a new upstream release rarely conflicts.

Visual overview of the flow: [`release-flow.html`](release-flow.html).

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
bash fork/release.sh
```

It checks the branch, a clean tree, the gh account and the signing identity, picks the version,
builds a signed DMG and zip with the update feed pointing at `essedev/t3code`, verifies the
signature and the feed, then pushes `fork` with a `fork-v<version>` tag and publishes the GitHub
release. The installed app finds it on its next update check.

## Following a new upstream stable

```sh
git fetch upstream --tags
git rebase v0.1.7          # the new upstream stable tag
bash fork/release.sh
git push --force-with-lease origin fork   # only if release.sh stopped before pushing
```

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
