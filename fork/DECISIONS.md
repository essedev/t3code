# Fork decisions

Decisions that constrain future work on the fork, each with the alternative it rejected. Cite them
as `DECISIONS #N`. A superseded entry stays, marked as such, with a pointer to its replacement.

## 1. Fork-specific files live in `fork/`

Status: active (2026-11-02)

Scripts, docs and decisions that exist only because of the fork go in `fork/`; the only upstream
file touched for them is the `@fork/README.md` line in `CLAUDE.md`. Changes to the app itself go
where upstream keeps that code. Rejected: fork material in `scripts/` and `docs/`, which would make
every rebase on a new upstream release conflict.

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
