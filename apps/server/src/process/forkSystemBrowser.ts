/**
 * Opens a file in the default web browser of the Mac running the server. `open <file>` follows the
 * file type's handler, often an editor for `.html`, so the browser is looked up and named. Used by
 * `externalLauncher` for the fork's "Open in system browser" menu item.
 */
import {
  ExternalLauncherEditorSpawnError,
  ExternalLauncherUnsupportedEditorError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const LOOKUP_COMMAND = "osascript";
const LOOKUP_ARGS = [
  "-l",
  "JavaScript",
  "-e",
  'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("https://example.com")).path.js',
];

/** The `open -a` launch for a file in the default browser; only macOS is supported. */
export const resolveSystemBrowserLaunch = Effect.fn("forkSystemBrowser.resolveLaunch")(function* (
  target: string,
  platform: NodeJS.Platform,
) {
  if (platform !== "darwin") {
    return yield* new ExternalLauncherUnsupportedEditorError({ editor: "file-manager" });
  }
  const lookupError = (cause: unknown) =>
    new ExternalLauncherEditorSpawnError({
      editor: "file-manager",
      target,
      command: LOOKUP_COMMAND,
      args: LOOKUP_ARGS,
      cause,
    });
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const output = yield* spawner
    .string(
      ChildProcess.make(LOOKUP_COMMAND, LOOKUP_ARGS, {
        stdin: "ignore",
        stderr: "ignore",
        forceKillAfter: "1 second",
      }),
    )
    .pipe(Effect.timeout("5 seconds"), Effect.mapError(lookupError));
  const browserApp = output.trim();
  if (browserApp === "") {
    return yield* lookupError(new Error("macOS did not report a default browser."));
  }
  return {
    editor: "file-manager" as const,
    target,
    command: "open",
    args: ["-a", browserApp, target],
  };
});
