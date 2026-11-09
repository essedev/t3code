import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as ProjectFaviconResolver from "./ProjectFaviconResolver.ts";
import * as T3ProjectFileLoader from "./T3ProjectFileLoader.ts";

const layerTest = Layer.empty.pipe(
  Layer.provideMerge(
    ProjectFaviconResolver.layer.pipe(
      Layer.provide(WorkspacePaths.layer),
      Layer.provide(T3ProjectFileLoader.layer),
    ),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const LAYOUTS: ReadonlyArray<{
  readonly files: ReadonlyArray<string>;
  readonly expected: string | null;
}> = [
  { files: ["frontend/public/favicon.svg"], expected: "frontend/public/favicon.svg" },
  { files: ["apps/web/public/favicon.ico"], expected: "apps/web/public/favicon.ico" },
  {
    files: ["mvp/client/public/favicon.svg", "upload-log/client/public/favicon.svg"],
    expected: "mvp/client/public/favicon.svg",
  },
  {
    files: ["backend/public/favicon.svg", "frontend/public/favicon.svg"],
    expected: "frontend/public/favicon.svg",
  },
  {
    files: ["site/index.html", "site/public/brand/logo.svg"],
    expected: "site/public/brand/logo.svg",
  },
  { files: ["bundle/AppIcon.icns"], expected: "bundle/AppIcon.icns" },
  { files: ["node_modules/pkg/public/favicon.svg"], expected: null },
  { files: ["a/b/c/public/favicon.svg"], expected: null },
];

it.layer(layerTest)("ProjectFaviconResolver nested apps", (it) => {
  describe("resolvePath", () => {
    it.effect("finds a monorepo app icon in a nested folder", () =>
      Effect.gen(function* () {
        const resolver = yield* ProjectFaviconResolver.ProjectFaviconResolver;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        for (const layout of LAYOUTS) {
          const cwd = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "t3code-fork-project-favicon-",
          });
          for (const file of layout.files) {
            const absolutePath = path.join(cwd, file);
            yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true });
            yield* fileSystem.writeFileString(
              absolutePath,
              file.endsWith(".html") ? '<link rel="icon" href="/brand/logo.svg">' : "icon",
            );
          }

          expect(yield* resolver.resolvePath(cwd)).toBe(
            layout.expected === null ? null : path.join(cwd, layout.expected),
          );
        }
      }),
    );
  });
});
