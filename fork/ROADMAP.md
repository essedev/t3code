# Fork roadmap

Only what is in progress or next. Done items leave this file; the git log and `DECISIONS.md`
keep the record.

- **First release and switch from Nightly.** Run `fork/release.sh` for 0.1.6, back up
  `~/.t3/userdata`, install the DMG and use it as the daily app.
- **Workspace sidebar** (DECISIONS #7). Phased: workspace list and tab strip first, then groups,
  then the global rows. Behind a switch so upstream's sidebar stays available.
- **Fork settings section with custom CSS.** A Settings page for fork options; a live, synced
  custom CSS field on top of `fork.css`, starting with a more opaque thread details card.
- **Automated upstream follow (later).** A GitHub Action on the fork that notices a new upstream
  stable tag, rebases `fork` and runs the release when the rebase is clean. Needs the signing
  identity in repository secrets and a macOS runner; worth it only if rebases stay conflict-free.
