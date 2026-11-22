import type { WorkLogPresentationEntry } from "@t3tools/client-runtime/work-log/presentation";
import { RunId, ThreadId, TurnItemId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { viewedImageOutputs } from "./viewedImages";

const threadId = ThreadId.make("viewed-images-thread");
const at = DateTime.makeUnsafe("2026-11-22T08:40:54.000Z");

function read(id: string, path: string, output: Record<string, unknown>): WorkLogPresentationEntry {
  return {
    id,
    createdAt: "2026-11-22T08:40:54.000Z",
    label: `Read ${path}`,
    tone: "tool",
    viewedImagePath: path,
    structuredPayload: {
      id: TurnItemId.make(id),
      threadId,
      runId: RunId.make("viewed-images-run"),
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 0,
      status: "completed",
      title: null,
      startedAt: at,
      completedAt: at,
      updatedAt: at,
      type: "dynamic_tool",
      toolName: "Read",
      input: { file_path: path },
      ...output,
    },
  };
}

describe("viewedImageOutputs", () => {
  it("backs each path with the latest read that saved its image", () => {
    const entries = [
      read("first-a", "/repo/a.png", { outputOmitted: true }),
      // The wire withholds large outputs, so the server is asked even without a marker.
      read("again-a", "/repo/a.png", { outputOmitted: true }),
      read("marker-b", "/repo/b.png", { output: [{ type: "image", mimeType: "image/png" }] }),
      read("text-c", "/repo/c.png", { output: [{ type: "text", text: "no image" }] }),
      read("empty-d", "/repo/d.png", {}),
    ];
    const paths = ["/repo/a.png", "/repo/b.png", "/repo/c.png", "/repo/d.png", "/repo/e.png"];

    expect(viewedImageOutputs(entries, paths).map((output) => output?.itemId ?? null)).toEqual([
      "again-a",
      "marker-b",
      null,
      null,
      null,
    ]);
    expect(viewedImageOutputs(entries, ["/repo/a.png"])[0]).toEqual({
      _tag: "tool-output-image",
      threadId,
      itemId: "again-a",
      index: 0,
    });
  });
});
