import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as HostProcess from "@t3tools/shared/HostProcess";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as ExternalLauncher from "./externalLauncher.ts";

const TARGET = "/workspace with spaces/report.html";

const runLaunch = (input: { readonly platform: NodeJS.Platform; readonly lookupOutput: string }) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-system-browser-" });
    for (const command of ["open", "osascript", "xdg-open"]) {
      yield* fileSystem.writeFileString(path.join(binDir, command), "#!/bin/sh\n");
      yield* fileSystem.chmod(path.join(binDir, command), 0o755);
    }

    const spawned: ChildProcess.StandardCommand[] = [];
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        if (!ChildProcess.isStandardCommand(command)) {
          throw new Error("Expected a standard command");
        }
        spawned.push(command);
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(true),
          kill: () => Effect.void,
          unref: Effect.succeed(Effect.void),
          stdin: Sink.drain,
          stdout:
            command.command === "osascript"
              ? Stream.make(new TextEncoder().encode(input.lookupOutput))
              : Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        });
      }),
    );

    const exit = yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      return yield* launcher.launchEditor({
        editor: "file-manager",
        cwd: TARGET,
        systemBrowser: true,
      });
    }).pipe(
      Effect.exit,
      Effect.provide(
        Layer.mergeAll(
          ExternalLauncher.layer.pipe(
            Layer.provide(
              Layer.merge(
                NodeServices.layer,
                Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
              ),
            ),
          ),
          Layer.succeed(HostProcess.Platform, input.platform),
          Layer.succeed(SpawnExecutableResolution, (command) => command),
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { PATH: binDir, DISPLAY: ":0" } })),
        ),
      ),
    );

    return { exit, launches: spawned.filter((command) => command.command === "open") };
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

it.effect("names the default browser instead of following the file type's handler", () =>
  Effect.gen(function* () {
    const { exit, launches } = yield* runLaunch({
      platform: "darwin",
      lookupOutput: "/Applications/Brave Browser.app\n",
    });
    assert.isTrue(Exit.isSuccess(exit));
    assert.deepEqual(
      launches.map((command) => command.args),
      [["-a", "/Applications/Brave Browser.app", TARGET]],
    );
  }),
);

it.effect("fails instead of opening the file when no browser is reported", () =>
  Effect.gen(function* () {
    const { exit, launches } = yield* runLaunch({ platform: "darwin", lookupOutput: "\n" });
    assert.isTrue(Exit.isFailure(exit));
    assert.deepEqual(launches, []);
  }),
);

it.effect("is unsupported outside macOS", () =>
  Effect.gen(function* () {
    const { exit, launches } = yield* runLaunch({ platform: "linux", lookupOutput: "" });
    assert.isTrue(Exit.isFailure(exit));
    assert.deepEqual(launches, []);
  }),
);
