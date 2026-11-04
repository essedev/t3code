import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

const FAVICON_CACHE_CAPACITY = 512;
const FAVICON_POSITIVE_CACHE_TTL = Duration.minutes(10);
const FAVICON_NEGATIVE_CACHE_TTL = Duration.minutes(1);

function faviconCacheKey(cwd: string, faviconPath?: string): string {
  return `${faviconPath ?? ""}\0${cwd}`;
}

function parseFaviconCacheKey(key: string): {
  readonly cwd: string;
  readonly faviconPath?: string;
} {
  const separatorIndex = key.indexOf("\0");
  if (separatorIndex === -1) {
    return { cwd: key };
  }
  const faviconPath = key.slice(0, separatorIndex);
  const cwd = key.slice(separatorIndex + 1);
  return faviconPath.length === 0 ? { cwd } : { cwd, faviconPath };
}

const FAVICON_CANDIDATES = [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "app/favicon.ico",
  "app/favicon.png",
  "app/icon.svg",
  "app/icon.png",
  "app/icon.ico",
  "src/favicon.ico",
  "src/favicon.svg",
  "src/app/favicon.ico",
  "src/app/icon.svg",
  "src/app/icon.png",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg",
  "assets/logo.png",
  ".idea/icon.svg",
  "Resources/AppIcon.icns",
  "AppIcon.icns",
] as const;

const ICON_SOURCE_FILES = [
  "index.html",
  "public/index.html",
  "app/routes/__root.tsx",
  "src/routes/__root.tsx",
  "app/root.tsx",
  "src/root.tsx",
  "src/index.html",
] as const;

// Monorepos keep the app's icon in a subfolder (frontend/public, apps/web/public, bundle). The walk is
// bounded so a large repository stays cheap; it runs only when the root has no icon.
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

// Anchor HTML at <link and scan brace-free metadata runs to avoid quadratic regex rescans.
const LINK_ICON_HTML_RE =
  /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?]+))[^>]*>/i;
const ICON_REL_RE = /\brel\s*:\s*["'](?:icon|shortcut icon)["']/i;
const ICON_HREF_RE = /\bhref\s*:\s*["']([^"'?]+)/i;

export class ProjectFaviconResolutionError extends Schema.TaggedError<ProjectFaviconResolutionError>()(
  "ProjectFaviconResolutionError",
  {
    operation: Schema.Literals([
      "normalize-workspace",
      "resolve-path",
      "stat-candidate",
      "read-source",
      "read-directory",
    ]),
    workspaceRoot: Schema.String,
    relativePath: Schema.optional(Schema.String),
    absolutePath: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to resolve project favicon during ${this.operation} for workspace ${this.workspaceRoot}.`;
  }
}

const isWorkspaceRootNotExistsError = Schema.is(WorkspacePaths.WorkspaceRootNotExistsError);

export const isMissingWorkspaceRoot = (error: ProjectFaviconResolutionError): boolean =>
  error.operation === "normalize-workspace" && isWorkspaceRootNotExistsError(error.cause);

export class ProjectFaviconResolver extends Context.Service<
  ProjectFaviconResolver,
  {
    readonly resolvePath: (
      cwd: string,
      faviconPath?: string,
    ) => Effect.Effect<string | null, ProjectFaviconResolutionError>;
    /** Forgets cached lookups for a workspace whose files changed, such as a finished clone. */
    readonly invalidate: (cwd: string) => Effect.Effect<void>;
  }
>()("t3/project/ProjectFaviconResolver") {}

function extractIconHref(source: string): string | null {
  const htmlMatch = source.match(LINK_ICON_HTML_RE);
  if (htmlMatch?.[1]) return htmlMatch[1];
  for (const run of source.split("}")) {
    if (!ICON_REL_RE.test(run)) continue;
    const hrefMatch = run.match(ICON_HREF_RE);
    if (hrefMatch?.[1]) return hrefMatch[1];
  }
  return null;
}

export const optionOnNotFound = <A, R>(
  effect: Effect.Effect<A, PlatformError.PlatformError, R>,
): Effect.Effect<Option.Option<A>, PlatformError.PlatformError, R> =>
  effect.pipe(
    Effect.asSome,
    Effect.catchTags({
      PlatformError: (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed(Option.none<A>()) : Effect.fail(error),
    }),
  );

const nestedAppRank = (name: string): number => {
  const rank = (NESTED_APP_PREFERRED_NAMES as ReadonlyArray<string>).indexOf(name);
  return rank === -1 ? NESTED_APP_PREFERRED_NAMES.length : rank;
};

// Names with a dot are hidden folders or files with an extension; skipping them avoids a stat per file.
const isNestedAppCandidateName = (name: string): boolean =>
  !name.includes(".") && !NESTED_APP_SKIPPED_NAMES.has(name);

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const projectFileLoader = yield* T3ProjectFileLoader.T3ProjectFileLoader;

  const resolveIconHref = (href: string, baseDir: string): ReadonlyArray<string> => {
    const clean = href.replace(/^\//, "");
    return [path.join(baseDir, "public", clean), path.join(baseDir, clean)];
  };

  const findExistingFile = Effect.fn("ProjectFaviconResolver.findExistingFile")(function* (
    projectCwd: string,
    relativeCandidates: ReadonlyArray<string>,
    candidateScope: "workspace" | "filesystem",
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    for (const relativePath of relativeCandidates) {
      const candidate = yield* (
        candidateScope === "filesystem" && path.isAbsolute(relativePath)
          ? Effect.succeed({ absolutePath: relativePath, relativePath })
          : workspacePaths.resolveRelativePathWithinRoot({
              workspaceRoot: projectCwd,
              relativePath,
            })
      ).pipe(
        Effect.asSome,
        Effect.catchTags({
          WorkspacePathOutsideRootError: () =>
            Effect.succeed(
              Option.none<{ readonly absolutePath: string; readonly relativePath: string }>(),
            ),
        }),
      );
      if (Option.isNone(candidate)) {
        continue;
      }
      const stats = yield* optionOnNotFound(fileSystem.stat(candidate.value.absolutePath)).pipe(
        Effect.mapError(
          (cause) =>
            new ProjectFaviconResolutionError({
              operation: "stat-candidate",
              workspaceRoot: projectCwd,
              relativePath,
              absolutePath: candidate.value.absolutePath,
              cause,
            }),
        ),
      );
      if (Option.isSome(stats) && stats.value.type === "File") {
        return candidate.value.absolutePath;
      }
    }
    return null;
  });

  const findIconFromSource = Effect.fn("ProjectFaviconResolver.findIconFromSource")(function* (
    projectCwd: string,
    sourceFile: string,
    baseDir = "",
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    const sourcePath = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: projectCwd,
        relativePath: sourceFile,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectFaviconResolutionError({
              operation: "resolve-path",
              workspaceRoot: projectCwd,
              relativePath: sourceFile,
              cause,
            }),
        ),
      );
    const source = yield* optionOnNotFound(fileSystem.readFileString(sourcePath.absolutePath)).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "read-source",
            workspaceRoot: projectCwd,
            relativePath: sourceFile,
            absolutePath: sourcePath.absolutePath,
            cause,
          }),
      ),
    );
    if (Option.isNone(source)) {
      return null;
    }
    const href = extractIconHref(source.value);
    if (!href) {
      return null;
    }
    return yield* findExistingFile(projectCwd, resolveIconHref(href, baseDir), "workspace");
  });

  const listChildDirectories = Effect.fn("ProjectFaviconResolver.listChildDirectories")(function* (
    projectCwd: string,
    relativeDir: string,
  ): Effect.fn.Return<ReadonlyArray<string>, ProjectFaviconResolutionError> {
    const toResolutionError = (cause: PlatformError.PlatformError) =>
      new ProjectFaviconResolutionError({
        operation: "read-directory",
        workspaceRoot: projectCwd,
        relativePath: relativeDir,
        cause,
      });
    const unreadable = (error: PlatformError.PlatformError) =>
      error.reason._tag === "NotFound" || error.reason._tag === "PermissionDenied";

    const names = yield* fileSystem.readDirectory(path.join(projectCwd, relativeDir)).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          unreadable(error) ? Effect.succeed<Array<string>>([]) : Effect.fail(error),
      }),
      Effect.mapError(toResolutionError),
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
              unreadable(error) ? Effect.succeed(null) : Effect.fail(error),
          }),
          Effect.mapError(toResolutionError),
        ),
      { concurrency: 16 },
    );
    return directories.filter((directory) => directory !== null);
  });

  const listNestedAppDirectories = Effect.fn("ProjectFaviconResolver.listNestedAppDirectories")(
    function* (
      projectCwd: string,
    ): Effect.fn.Return<ReadonlyArray<string>, ProjectFaviconResolutionError> {
      const found: Array<string> = [];
      let level: ReadonlyArray<string> = [""];
      for (let depth = 0; depth < NESTED_APP_MAX_DEPTH && level.length > 0; depth++) {
        const children = (yield* Effect.forEach(
          level,
          (dir) => listChildDirectories(projectCwd, dir),
          {
            concurrency: 8,
          },
        ))
          .flat()
          .toSorted(
            (a, b) =>
              nestedAppRank(path.basename(a)) - nestedAppRank(path.basename(b)) ||
              a.localeCompare(b),
          );
        level = children.slice(0, NESTED_APP_MAX_DIRECTORIES - found.length);
        found.push(...level);
      }
      return found;
    },
  );

  const findNestedAppIcon = Effect.fn("ProjectFaviconResolver.findNestedAppIcon")(function* (
    projectCwd: string,
    appDir: string,
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    const wellKnown = yield* findExistingFile(
      projectCwd,
      NESTED_APP_ICON_CANDIDATES.map((candidate) => path.join(appDir, candidate)),
      "workspace",
    );
    return (
      wellKnown ?? (yield* findIconFromSource(projectCwd, path.join(appDir, "index.html"), appDir))
    );
  });

  // Probe concurrently but join in list order so lower-ranked probes cannot delay a hit.
  // A failure surfaces only if no earlier probe found a file; scope exit interrupts remaining probes.
  const firstInOrder = Effect.fn("ProjectFaviconResolver.firstInOrder")(function* <A>(
    items: ReadonlyArray<A>,
    probe: (item: A) => Effect.Effect<string | null, ProjectFaviconResolutionError>,
  ) {
    const fibers = yield* Effect.forEach(items, (item) => Effect.forkScoped(probe(item)));
    for (const fiber of fibers) {
      const found = yield* Fiber.join(fiber);
      if (found) {
        return found;
      }
    }
    return null;
  }, Effect.scoped);

  const resolvePathUncached = Effect.fn("ProjectFaviconResolver.resolvePathUncached")(function* (
    cwd: string,
    faviconPath?: string,
  ): Effect.fn.Return<string | null, ProjectFaviconResolutionError> {
    const projectCwd = yield* workspacePaths.normalizeWorkspaceRoot(cwd).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "normalize-workspace",
            workspaceRoot: cwd,
            cause,
          }),
      ),
    );
    if (faviconPath !== undefined) {
      const existing = yield* findExistingFile(projectCwd, [faviconPath], "filesystem");
      if (existing) {
        return existing;
      }
    }

    const projectFile = yield* projectFileLoader.load(projectCwd);
    if (Option.isSome(projectFile) && projectFile.value.iconPath !== undefined) {
      const existing = yield* findExistingFile(
        projectCwd,
        [projectFile.value.iconPath],
        "workspace",
      );
      if (existing) {
        return existing;
      }
    }

    const wellKnown = yield* firstInOrder(FAVICON_CANDIDATES, (candidate) =>
      findExistingFile(projectCwd, [candidate], "workspace"),
    );
    if (wellKnown) {
      return wellKnown;
    }

    const fromSource = yield* firstInOrder(ICON_SOURCE_FILES, (sourceFile) =>
      findIconFromSource(projectCwd, sourceFile),
    );
    if (fromSource) {
      return fromSource;
    }

    const nestedAppDirectories = yield* listNestedAppDirectories(projectCwd);
    return yield* firstInOrder(nestedAppDirectories, (appDir) =>
      findNestedAppIcon(projectCwd, appDir),
    );
  });

  const faviconCache = yield* Cache.makeWith<string, string | null, ProjectFaviconResolutionError>(
    (key) => {
      const { cwd, faviconPath } = parseFaviconCacheKey(key);
      return resolvePathUncached(cwd, faviconPath);
    },
    {
      capacity: FAVICON_CACHE_CAPACITY,
      timeToLive: Exit.match({
        onSuccess: (value: string | null) =>
          value === null ? FAVICON_NEGATIVE_CACHE_TTL : FAVICON_POSITIVE_CACHE_TTL,
        onFailure: () => Duration.zero,
      }),
    },
  );

  const resolvePath: ProjectFaviconResolver["Service"]["resolvePath"] = Effect.fn(
    "ProjectFaviconResolver.resolvePath",
  )(function* (cwd, faviconPath) {
    const key = faviconCacheKey(cwd, faviconPath);
    const cached = yield* Cache.get(faviconCache, key);
    if (cached === null) {
      return null;
    }

    const stats = yield* optionOnNotFound(fileSystem.stat(cached)).pipe(
      Effect.mapError(
        (cause) =>
          new ProjectFaviconResolutionError({
            operation: "stat-candidate",
            workspaceRoot: cwd,
            absolutePath: cached,
            cause,
          }),
      ),
    );
    if (Option.isSome(stats) && stats.value.type === "File") {
      return cached;
    }

    yield* Cache.invalidate(faviconCache, key);
    return yield* Cache.get(faviconCache, key);
  });

  const invalidate: ProjectFaviconResolver["Service"]["invalidate"] = (cwd) =>
    Cache.keys(faviconCache).pipe(
      Effect.flatMap((keys) =>
        Effect.forEach(
          Array.from(keys).filter((key) => parseFaviconCacheKey(key).cwd === cwd),
          (key) => Cache.invalidate(faviconCache, key),
          { discard: true },
        ),
      ),
    );

  return ProjectFaviconResolver.of({ resolvePath, invalidate });
});

export const layer = Layer.effect(ProjectFaviconResolver, make);
