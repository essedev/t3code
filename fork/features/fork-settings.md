# Fork settings and custom CSS

Settings > Fork holds the options that exist only in this fork. They are server settings under
one `fork` key (`packages/contracts/src/forkSettings.ts`), saved in the environment's
`settings.json` and synced to every client of that machine (DECISIONS #6).

- **Workspace sidebar**: switches between upstream's sidebar and the workspace sidebar with the
  thread tab strip. See [`workspace-sidebar.md`](workspace-sidebar.md).
- **Custom CSS**: CSS applied on top of the app's styles in every client, live while you type
  (the editor previews right away and saves after a short pause or on blur). Above the editor,
  the fork defaults (`fork.css`, read only) are listed rule by rule; "Copy to my CSS" puts a rule
  at the top of the editor, so the rules already there still win, and it reads "In your CSS"
  once the editor holds it.

## Style layers

1. The app's own styles.
2. `apps/web/src/fork/fork.css`, the fork's defaults, versioned in the repo. Today it raises the
   thread details card to `--glass-opacity: 96%` (the app-wide default is 80%, set by Settings >
   Appearance > Glass opacity) and drops the rule under the running turn's "Working for" timer.
3. The Custom CSS field, injected last by `ForkStyles` (`apps/web/src/fork/ForkStyles.tsx`).

The two layers stay separate on purpose: a saved editor never changes, so defaults kept in it
would stop arriving with releases, and a copy of a rule whose selector a release renames would
break silently. A rule that proves itself in the editor moves into `fork.css` with a commit, so it
ships with the build instead of living only in one machine's settings.

## Useful hooks

- `[data-thread-details-card]`: the details card at the top right of a thread.
- `[data-thread-tab-strip]`: the tab strip of the workspace sidebar.
- `[data-app-sidebar]`: the left sidebar.
- `[data-timeline-row-kind="..."]`: a chat timeline row by kind (`working`, `message`, ...).

## Recovery

If a rule breaks the layout, clear the field in Settings > Fork. If Settings cannot be reached,
quit the app and remove `fork.customCss` from `~/.t3/userdata/settings.json`.

## Limits

The official app does not know the `fork` key and drops it the next time it rewrites
`settings.json`, so switching back and forth loses these settings (DECISIONS #6).
