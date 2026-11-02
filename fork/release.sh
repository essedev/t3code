#!/usr/bin/env bash
# Builds a self-signed macOS release of the fork and publishes it to essedev/t3code, where the
# installed app's updater looks for it. See fork/README.md for the version scheme and the flow.
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
[ -z "$(git status --porcelain)" ] || fail "the working tree is not clean"
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

vp i >/dev/null
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

git tag "$tag"
git push origin "$BRANCH" "$tag"
gh release create "$tag" --repo "$REPO_SLUG" --latest \
  --title "T3 Code fork $version" \
  --notes "Fork release on top of upstream $base_tag." \
  "$zip" "$zip.blockmap" "$dmg" "$dmg.blockmap" "$out/latest-mac.yml"

echo "Published $tag: https://github.com/$REPO_SLUG/releases/tag/$tag"
