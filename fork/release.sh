#!/usr/bin/env bash
# Builds a self-signed macOS release of the fork and publishes it to essedev/t3code, where the
# installed app's updater looks for it. See fork/README.md for the version scheme and the flow.
# --dry-run prints the version, checks and changelog entry without writing anything.
set -euo pipefail

REPO_SLUG="essedev/t3code"
BRANCH="fork"
IDENTITY="T3 Code Fork Self-Signed"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/share/vite-plus/bin:$PATH"
cd "$ROOT"

fail() {
  echo "release: $*" >&2
  exit 1
}

[ "$(git branch --show-current)" = "$BRANCH" ] || fail "run it from the '$BRANCH' branch"
dry_run=false
[ "${1:-}" = "--dry-run" ] && dry_run=true
$dry_run || [ -z "$(git status --porcelain)" ] || fail "the working tree is not clean"
[ "$(gh api user -q .login)" = "essedev" ] || fail "gh must be on essedev: gh auth switch --user essedev"
bash fork/setup-signing.sh >/dev/null || fail "signing identity not ready, run fork/setup-signing.sh"

git fetch origin --tags --quiet
git fetch upstream --tags --quiet

# Upstream stable tags look like v0.1.7; fork tags are fork-v*, so they never match here.
base_tag="$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' HEAD)"
base="${base_tag#v}"
IFS=. read -r major minor patch <<<"$base"

released="$(git tag --points-at HEAD -l 'fork-v*')"
[ -z "$released" ] || fail "HEAD is already released as $released"

# The first fork release on an upstream base takes the upstream version, so the CLI runtime that
# some features download from upstream by version exists. Later fork-only releases on the same
# base are prereleases of the next patch: semver orders 0.1.6 < 0.1.7-fork.1 < 0.1.7.
if ! git rev-parse -q --verify "refs/tags/fork-v$base" >/dev/null; then
  version="$base"
else
  next="$major.$minor.$((patch + 1))"
  n="$(git tag -l "fork-v$next-fork.*" | sed 's/.*-fork\.//' | sort -n | tail -1)"
  version="$next-fork.$((${n:-0} + 1))"
fi
tag="fork-v$version"
out="release/fork-$version"

echo "Upstream base: $base_tag"
echo "Fork release:  $version ($tag)"

# Every upstream file the fork changes must have a row in the README's "Differences from upstream".
# Files the fork adds cannot conflict on a rebase, so they need no row, only "fork" in their path.
listed="$(awk '/^## Differences from upstream/{f=1;next} /^## /{f=0} f' fork/README.md |
  sed -nE 's/^- `([^`]+)`.*/\1/p' | sort -u)"
changed="$(git diff --name-only --diff-filter=MDRT "$base_tag" HEAD -- . ':(exclude)fork' | sort -u)"
unmarked="$(git diff --name-only --diff-filter=A "$base_tag" HEAD -- . ':(exclude)fork' | grep -iv fork || true)"
[ -z "$unmarked" ] || fail "files added by the fork need \"fork\" in their path:
$unmarked"
missing="$(comm -23 <(printf '%s\n' "$changed" | sed '/^$/d') <(printf '%s\n' "$listed" | sed '/^$/d'))"
stale="$(comm -13 <(printf '%s\n' "$changed" | sed '/^$/d') <(printf '%s\n' "$listed" | sed '/^$/d'))"
[ -z "$missing" ] || fail "add these files to 'Differences from upstream' in fork/README.md:
$missing"
[ -z "$stale" ] || fail "remove these files from 'Differences from upstream', they match upstream now:
$stale"

# Changelog entry: fork commits absent from the previous release, compared by subject because a
# rebase rewrites hashes. The entry is committed before the build so the tag includes it.
prev_tag="$(git tag -l 'fork-v*' --sort=-taggerdate | head -1)"
subjects() { git log --reverse --format=%s "$1" | sed -E '/^docs\(fork\): changelog for /d'; }
current="$(mktemp)"
previous="$(mktemp)"
subjects "$base_tag..HEAD" >"$current"
lines=()
if [ -z "$prev_tag" ]; then
  lines+=("First fork release.")
else
  prev_base="$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' "$prev_tag")"
  subjects "$prev_base..$prev_tag" >"$previous"
  [ "$prev_base" = "$base_tag" ] || lines+=("Rebased on upstream $base_tag.")
fi
while IFS= read -r subject; do
  [ -n "$subject" ] && lines+=("$subject")
done < <(grep -Fxv -f "$previous" "$current" || true)
rm -f "$current" "$previous"
[ "${#lines[@]}" -gt 0 ] || fail "nothing changed since $prev_tag"

notes="$(printf -- '- %s\n' "${lines[@]}")"
heading="## $version ($(date +%F)), upstream $base_tag"
if $dry_run; then
  printf '\nDry run, nothing written. Changelog entry:\n\n%s\n\n%s\n' "$heading" "$notes"
  exit 0
fi
mkdir -p fork/changelog
if ! grep -qsF "## $version (" fork/changelog/*.md; then
  month_file="fork/changelog/$(date +%Y-%m).md"
  [ -f "$month_file" ] || printf '# Fork changelog, %s\n\nOne entry per release, newest first. Written by `fork/release.sh`.\n' \
    "$(date +%Y-%m)" >"$month_file"
  entry_file="$(mktemp)"
  printf '%s\n\n%s\n' "$heading" "$notes" >"$entry_file"
  # Insert above the newest entry, or append to a new month file.
  awk -v entry_file="$entry_file" '
    function emit() { while ((getline line < entry_file) > 0) print line; print "" }
    /^## / && !done { emit(); done = 1 }
    { print }
    END { if (!done) { print ""; emit() } }
  ' "$month_file" >"$month_file.tmp" && mv "$month_file.tmp" "$month_file"
  rm -f "$entry_file"
  git add "$month_file"
  git commit -q -m "docs(fork): changelog for $version"
fi
echo "$notes"

vp i >/dev/null
# pnpm records the local @pnpm/exe install in the lockfile even when frozen; it is not a fork change.
git checkout -- pnpm-lock.yaml
rm -rf "$out"
CSC_NAME="$IDENTITY" T3CODE_DESKTOP_UPDATE_REPOSITORY="$REPO_SLUG" \
  vp run dist:desktop:dmg --build-version "$version" --output-dir "$out"

zip="$out/T3-Code-$version-arm64.zip"
dmg="$out/T3-Code-$version-arm64.dmg"
for f in "$zip" "$zip.blockmap" "$dmg" "$dmg.blockmap" "$out/latest-mac.yml"; do
  [ -f "$f" ] || fail "missing build output: $f"
done
grep -qx "version: $version" "$out/latest-mac.yml" || fail "latest-mac.yml does not describe $version"

check="$(mktemp -d)"
trap 'rm -rf "$check"' EXIT
ditto -x -k "$zip" "$check"
app="$(ls -d "$check"/*.app)"
codesign --verify --deep --strict "$app" || fail "the app signature does not verify"
codesign -dvv "$app" 2>&1 | grep -q "Authority=$IDENTITY" || fail "the app is not signed by '$IDENTITY'"
grep -q "repo: t3code" "$app/Contents/Resources/app-update.yml" &&
  grep -q "owner: essedev" "$app/Contents/Resources/app-update.yml" ||
  fail "the update feed does not point at $REPO_SLUG"

git tag -a "$tag" -m "T3 Code fork $version"
git push origin "$BRANCH" "$tag"
gh release create "$tag" --repo "$REPO_SLUG" --latest \
  --title "T3 Code fork $version" \
  --notes "Fork release on top of upstream $base_tag.

$notes" \
  "$zip" "$zip.blockmap" "$dmg" "$dmg.blockmap" "$out/latest-mac.yml"

echo "Published $tag: https://github.com/$REPO_SLUG/releases/tag/$tag"
