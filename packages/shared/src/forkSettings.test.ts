import { DEFAULT_SERVER_SETTINGS, ServerSettings, ServerSettingsPatch } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { applyServerSettingsPatch } from "./serverSettings.ts";

const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const encodeServerSettings = Schema.encodeSync(ServerSettings);

const group = (id: string, projectKeys: string[]) => ({
  id,
  name: id,
  projectKeys,
});

describe("fork settings", () => {
  it("defaults when settings.json predates the fork", () => {
    expect(decodeServerSettings({}).fork).toEqual({
      customCss: "",
      workspaceSidebarEnabled: false,
      workspaceGroups: [],
    });
  });

  it("merges one fork key without touching the others, and replaces groups whole", () => {
    const withGroups = applyServerSettingsPatch(
      DEFAULT_SERVER_SETTINGS,
      decodeServerSettingsPatch({
        fork: { workspaceGroups: [group("work", ["a", "b"]), group("side", ["c"])] },
      }),
    );
    const withCss = applyServerSettingsPatch(
      withGroups,
      decodeServerSettingsPatch({ fork: { customCss: "body { color: red; }" } }),
    );
    expect(withCss.fork.workspaceGroups).toHaveLength(2);
    expect(withCss.fork.customCss).toBe("body { color: red; }");

    const shrunk = applyServerSettingsPatch(
      withCss,
      decodeServerSettingsPatch({ fork: { workspaceGroups: [group("work", ["b"])] } }),
    );
    expect(shrunk.fork.workspaceGroups).toEqual([group("work", ["b"])]);
    expect(decodeServerSettings(encodeServerSettings(shrunk)).fork).toEqual(shrunk.fork);
  });
});
