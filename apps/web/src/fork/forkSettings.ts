/** Read and write access to the fork's server settings on the primary environment. */
import type { ForkSettings, ForkSettingsPatch } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../hooks/useSettings";

/** The fork settings of the environment this client is anchored to. */
export function useForkSettings(): ForkSettings {
  return usePrimarySettings((settings) => settings.fork);
}

/** A function that saves a partial fork settings patch on the primary environment. */
export function useUpdateForkSettings(): (patch: ForkSettingsPatch) => void {
  const updateSettings = useUpdatePrimarySettings();
  return (patch) => updateSettings({ fork: patch });
}

// Unsaved CSS from the editor, applied right away so typing previews before the save lands.
let customCssDraft: string | null = null;
const draftListeners = new Set<() => void>();

/** Sets or clears (null) the custom CSS shown instead of the saved value. */
export function setCustomCssDraft(css: string | null): void {
  if (customCssDraft === css) return;
  customCssDraft = css;
  for (const listener of draftListeners) listener();
}

/** The custom CSS being edited, or null when the saved value applies. */
export function useCustomCssDraft(): string | null {
  return useSyncExternalStore(
    (listener) => {
      draftListeners.add(listener);
      return () => draftListeners.delete(listener);
    },
    () => customCssDraft,
  );
}
