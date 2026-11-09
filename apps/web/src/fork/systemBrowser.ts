/**
 * The fork's "Open in system browser" action, shared by the file tree menu and chat file links.
 * It runs on the server's machine, so it is offered only when that machine is the user's own Mac.
 */
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";

import { canUseMarkdownFileShellActions } from "~/components/chat/MarkdownFileLink.logic";
import { toastManager } from "~/components/ui/toast";
import { useRemoteOpenResolution } from "~/remoteOpen";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";

/** Menu label of the action, the same in every menu. */
export const OPEN_IN_SYSTEM_BROWSER_LABEL = "Open in system browser";

// Derived to a boolean so every chat message does not re-render on each server config change.
const macEnvironmentAtom = Atom.family((environmentId: EnvironmentId | null) =>
  Atom.make((get) => {
    const config = get(serverEnvironment.configValueAtom(environmentId));
    return (
      config?.environment.platform.os === "darwin" &&
      config.availableEditors.includes("file-manager")
    );
  }).pipe(Atom.withLabel("fork-system-browser-mac-environment")),
);

function failureMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "An error occurred.";
}

/** Whether this client can use the action, and the action itself with its failure toast. */
export function useSystemBrowser(environmentId: EnvironmentId | null) {
  const isMac = useAtomValue(macEnvironmentAtom(environmentId));
  const canOperateHost = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const remoteOpen = useRemoteOpenResolution(environmentId);
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });

  const open = async (resolveAbsolutePath: () => string | Promise<string>): Promise<void> => {
    if (environmentId === null) return;
    const showFailure = (cause: unknown) =>
      toastManager.add({
        type: "error",
        title: "Could not open in system browser",
        description: failureMessage(cause),
      });
    try {
      const result = await openInEditor({
        environmentId,
        input: {
          cwd: await resolveAbsolutePath(),
          editor: "file-manager",
          systemBrowser: true,
        },
      });
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
      showFailure(squashAtomCommandFailure(result));
    } catch (cause) {
      showFailure(cause);
    }
  };

  return {
    available:
      isMac &&
      canOperateHost &&
      canUseMarkdownFileShellActions(environmentId, remoteOpen.state.mode, remoteOpen.isResolved),
    open,
  };
}
