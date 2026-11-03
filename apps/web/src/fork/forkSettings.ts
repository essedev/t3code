/** Read and write access to the fork's server settings on the primary environment. */
import type { ForkSettings, ForkSettingsPatch } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../hooks/useSettings";

// Saves are not optimistic upstream, so a dropped row would jump back until the server echoes the
// write. Patches show right away and expire once the echo has had time to land.
const OPTIMISTIC_PATCH_TTL_MS = 5_000;
let optimisticPatch: ForkSettingsPatch = {};
const optimisticListeners = new Set<() => void>();

function emitOptimistic(): void {
  for (const listener of optimisticListeners) listener();
}

function applyOptimistic(patch: ForkSettingsPatch): void {
  const tabOrder =
    patch.tabOrder === undefined
      ? optimisticPatch.tabOrder
      : { ...optimisticPatch.tabOrder, ...patch.tabOrder };
  const applied: Record<string, unknown> = {
    ...optimisticPatch,
    ...patch,
    ...(tabOrder ? { tabOrder } : {}),
  };
  optimisticPatch = applied;
  emitOptimistic();
  setTimeout(() => {
    // A key patched again since keeps the newer value until its own timer.
    const next: Record<string, unknown> = { ...optimisticPatch };
    for (const key of Object.keys(patch)) {
      if (Object.is(next[key], applied[key])) delete next[key];
    }
    optimisticPatch = next;
    emitOptimistic();
  }, OPTIMISTIC_PATCH_TTL_MS);
}

function useOptimisticPatch(): ForkSettingsPatch {
  return useSyncExternalStore(
    (listener) => {
      optimisticListeners.add(listener);
      return () => optimisticListeners.delete(listener);
    },
    () => optimisticPatch,
  );
}

/** The fork settings of the environment this client is anchored to, unsaved edits included. */
export function useForkSettings(): ForkSettings {
  const saved = usePrimarySettings((settings) => settings.fork);
  const patch = useOptimisticPatch();
  if (Object.keys(patch).length === 0) return saved;
  return {
    ...saved,
    ...patch,
    tabOrder: { ...saved.tabOrder, ...patch.tabOrder },
  };
}

/** A function that saves a partial fork settings patch on the primary environment. */
export function useUpdateForkSettings(): (patch: ForkSettingsPatch) => void {
  const updateSettings = useUpdatePrimarySettings();
  return (patch) => {
    applyOptimistic(patch);
    updateSettings({ fork: patch });
  };
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
