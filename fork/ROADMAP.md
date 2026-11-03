# Fork roadmap

Only what is in progress or next. Done items leave this file; the git log and `DECISIONS.md`
keep the record.

- **Workspace sidebar, next round.** Built and switchable (`features/workspace-sidebar.md`).
  Next: the Settled, Snoozed and Needs you lists rebuilt on the command palette's components,
  with older settled threads paged in like upstream's shelf, a true count, and search through
  the server's thread search. Later: dragging group cards (today their right-click menu reorders
  them), Approve and Decline inside Needs you.
- **Card opacity.** `fork.css` sets the thread details card to 96%; adjust once used for real.
- **Automated upstream follow (later).** A GitHub Action on the fork that notices a new upstream
  stable tag, rebases `fork` and runs the release when the rebase is clean. Needs the signing
  identity in repository secrets and a macOS runner; worth it only if rebases stay conflict-free.
