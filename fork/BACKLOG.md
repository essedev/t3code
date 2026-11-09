# Fork backlog

Open work nobody is about to do, by area and in no order. A roadmap item is picked from here; an
item leaves when it is done or dropped.

## Release

- **Automated upstream follow.** A GitHub Action on the fork that notices a new upstream stable
  tag, rebases `fork` and runs the release when the rebase is clean. Needs the signing identity in
  repository secrets and a macOS runner; worth it only if rebases stay conflict-free.
