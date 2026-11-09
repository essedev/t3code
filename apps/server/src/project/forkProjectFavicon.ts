/**
 * The folders where a monorepo or a native app keeps its icon (frontend/public, apps/web/public,
 * bundle). `ProjectFaviconResolver` walks them only when the root has no icon. See
 * fork/features/project-favicons.md.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

// The walk is bounded so a large repository stays cheap.
const NESTED_APP_MAX_DEPTH = 2;
const NESTED_APP_MAX_DIRECTORIES = 50;
const NESTED_APP_PREFERRED_NAMES = ["frontend", "web", "client", "app"] as const;
const NESTED_APP_SKIPPED_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "coverage",
  "venv",
  "__pycache__",
]);
const NESTED_APP_ICON_CANDIDATES = [
  "public/favicon.svg",
  "public/favicon.png",
  "public/favicon.ico",
  "AppIcon.icns",
  "Resources/AppIcon.icns",
] as const;

const nestedAppRank = (name: string): number => {
  const rank = (NESTED_APP_PREFERRED_NAMES as ReadonlyArray<string>).indexOf(name);
  return rank === -1 ? NESTED_APP_PREFERRED_NAMES.length : rank;
};

// Names with a dot are hidden folders or files with an extension; skipping them avoids a stat per file.
const isNestedAppCandidateName = (name: string): boolean =>
  !name.includes(".") && !NESTED_APP_SKIPPED_NAMES.has(name);

const isUnreadable = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound" || error.reason._tag === "PermissionDenied";

/** The walk over a project's subfolders and the icon paths to try in each one. */
export const makeNestedAppSearch = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const listChildDirectories = Effect.fn("forkProjectFavicon.listChildDirectories")(function* (
    projectCwd: string,
    relativeDir: string,
  ): Effect.fn.Return<ReadonlyArray<string>, PlatformError.PlatformError> {
    const names = yield* fileSystem.readDirectory(path.join(projectCwd, relativeDir)).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          isUnreadable(error) ? Effect.succeed<Array<string>>([]) : Effect.fail(error),
      }),
    );
    const candidates = names
      .filter(isNestedAppCandidateName)
      .map((name) => path.join(relativeDir, name));
    const directories = yield* Effect.forEach(
      candidates,
      (candidate) =>
        fileSystem.stat(path.join(projectCwd, candidate)).pipe(
          Effect.map((info) => (info.type === "Directory" ? candidate : null)),
          Effect.catchTags({
            PlatformError: (error) =>
              isUnreadable(error) ? Effect.succeed(null) : Effect.fail(error),
          }),
        ),
      { concurrency: 16 },
    );
    return directories.filter((directory) => directory !== null);
  });

  const listDirectories = Effect.fn("forkProjectFavicon.listDirectories")(function* (
    projectCwd: string,
  ): Effect.fn.Return<ReadonlyArray<string>, PlatformError.PlatformError> {
    const found: Array<string> = [];
    let level: ReadonlyArray<string> = [""];
    for (let depth = 0; depth < NESTED_APP_MAX_DEPTH && level.length > 0; depth++) {
      const children = (yield* Effect.forEach(
        level,
        (dir) => listChildDirectories(projectCwd, dir),
        { concurrency: 8 },
      ))
        .flat()
        .toSorted(
          (a, b) =>
            nestedAppRank(path.basename(a)) - nestedAppRank(path.basename(b)) || a.localeCompare(b),
        );
      level = children.slice(0, NESTED_APP_MAX_DIRECTORIES - found.length);
      found.push(...level);
    }
    return found;
  });

  const iconCandidates = (appDir: string): ReadonlyArray<string> =>
    NESTED_APP_ICON_CANDIDATES.map((candidate) => path.join(appDir, candidate));

  return { listDirectories, iconCandidates };
});
