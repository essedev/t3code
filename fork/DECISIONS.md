# Fork decisions

Decisions that constrain future work on the fork, each with the alternative it rejected. Cite them
as `DECISIONS #N`. A superseded entry stays, marked as such, with a pointer to its replacement.

## 1. Fork-specific files live in `fork/`

Status: active (2026-11-02)

Scripts, docs and decisions that exist only because of the fork go in `fork/`; the only upstream
file touched for them is the `@fork/README.md` line in `CLAUDE.md`. Changes to the app itself go
in the app's packages, as #8 describes. Rejected: fork material in `scripts/` and `docs/`, which
would make every rebase on a new upstream release conflict.

## 2. The fork follows upstream stable tags

Status: active (2026-11-02)

`fork` is rebased onto upstream `vX.Y.Z` tags, never onto `main` or a nightly. Stable tags are
upstream's verified builds, and their versions are the ones whose CLI runtime exists on upstream's
releases (see #4). Rejected: tracking `main`, which moves every few minutes and is not verified.

## 3. Builds are signed with a stable self-signed identity

Status: active (2026-11-02)

Squirrel.Mac installs an update only when it is signed by the same identity as the running app,
and ad-hoc signatures change on every build. `fork/setup-signing.sh` creates "T3 Code Fork
Self-Signed"; an update from 0.1.601 to 0.1.602 was verified end to end with it. Rejected: an Apple
Developer ID (99 USD a year, needed only for notarization and passkeys) and manual reinstalls.

## 4. Version scheme: upstream version first, then `-fork.N` of the next patch

Status: active (2026-11-02)

The first release on upstream `vX.Y.Z` is `X.Y.Z`; later ones are `X.Y.(Z+1)-fork.N`, so upstream's
next stable still sorts higher. Tags are `fork-v<version>` because upstream owns `v*`. Rejected:
`X.Y.Z` scaled to `X.Y.ZNN` (0.1.601 sorts above 0.1.7, so upstream releases would never be
offered) and upstream versions only (fork changes between upstream releases would not update).

## 5. Telemetry and OpenTelemetry export are off by default

Status: active (2026-11-02)

`apps/desktop/src/boot.ts` defaults `T3CODE_TELEMETRY_ENABLED=false` and
`T3CODE_OTEL_SDK_DISABLED=true` before the app starts; the backend child inherits them, and every
consumer (server PostHog analytics, relay tracing, OTLP export) reads these two variables. An
environment that sets them explicitly still wins. Rejected: removing the telemetry code, which
spans server, desktop and web and would conflict on every rebase.

## 6. Fork state that must sync lives in server settings, never in the database

Status: active (2026-11-02)

Fork-only data that has to follow the user across clients (workspace groups first) is a new field
in the server settings schema, persisted in `settings.json`. The database is shared with the
official app and its migrations are numbered by upstream, so a fork migration could collide with a
future upstream one and leave `~/.t3` in a state the official app does not know. Cost: the official
app drops unknown settings fields when it rewrites `settings.json`. Rejected: event-sourced
commands and a migration, the native T3 way, for the reasons above.

## 7. Workspace sidebar: projects in the sidebar, threads as tabs, states in a strip

Status: active (2026-11-02)

A fork-only sidebar, switchable against upstream's, lists workspaces (projects) and groups like
Relay; threads become tabs above the chat, and every tab state lives in the strip and in compact
global rows. Order is the user's plus Relay's bump, because derived status sorting moves rows under
the cursor. Rejected: an inbox shelf of tabs (A), status sections (B), listing every project and an
"Other projects" fold. Detail: `features/workspace-sidebar.md`.

## 8. Fork code lives in new files marked "fork", upstream files only get mount points

Status: active (2026-11-03)

Fork features are new files with "fork" in their path (`apps/web/src/fork/`,
`packages/contracts/src/forkSettings.ts`, `routes/_chat.settings.fork.tsx`). An upstream file
changes only to mount them, a few lines each, listed in the README's differences table. Added
files cannot conflict on a rebase, so `release.sh` checks only that they carry "fork" in their
path. Rejected: editing upstream components in place (the workspace sidebar inside `Sidebar.tsx`,
3,600 lines that move every release), which would turn each rebase into a manual merge.

## 9. Default CSS ships in `fork.css`, the Custom CSS field holds only the user's rules

Status: active (2026-11-03)

Fork style defaults live in `apps/web/src/fork/fork.css` and ship with the build; Settings > Fork
lists them read only, and "Copy to my CSS" puts a rule at the top of the editor so the user's own
rules still win. Rejected: seeding the defaults into the Custom CSS field, because a saved field
never changes, so new defaults would stop arriving with releases and a copied rule whose selector
upstream renames would break silently. A rule that proves itself in the editor moves into
`fork.css` with a commit. Detail: `features/fork-settings.md`.
