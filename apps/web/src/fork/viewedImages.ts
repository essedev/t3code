/**
 * Fallback sources for images an agent opened with a file read: the copy saved in the tool's
 * output, so the chat keeps showing an image after its file is deleted from disk.
 */
import {
  workEntryViewedImagePath,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import type { AssetResource, OrchestrationV2TurnItem } from "@t3tools/contracts";
import { toolOutputImages } from "@t3tools/shared/toolOutput";

/** The asset of an image saved in a tool item's output. */
export type ViewedImageOutput = Extract<AssetResource, { readonly _tag: "tool-output-image" }>;

/** The first image saved in a tool item's output, or null when the item holds none. */
export function viewedImageOutput(
  item: OrchestrationV2TurnItem | undefined,
): ViewedImageOutput | null {
  if (item?.type !== "dynamic_tool") return null;
  // The wire withholds large outputs; the server still has them, and answers not-found if empty.
  if (item.outputOmitted !== true && toolOutputImages(item.output).length === 0) return null;
  return { _tag: "tool-output-image", threadId: item.threadId, itemId: item.id, index: 0 };
}

/** For each viewed path, the image saved by the group's latest read of it. */
export function viewedImageOutputs(
  entries: ReadonlyArray<WorkLogPresentationEntry>,
  paths: ReadonlyArray<string>,
): ReadonlyArray<ViewedImageOutput | null> {
  const latest = new Map<string, ViewedImageOutput>();
  for (const entry of entries) {
    const path = workEntryViewedImagePath(entry);
    const output = path === null ? null : viewedImageOutput(entry.structuredPayload);
    if (path !== null && output !== null) latest.set(path, output);
  }
  return paths.map((path) => latest.get(path) ?? null);
}
