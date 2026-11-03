/**
 * Server settings that exist only in the essedev/t3code fork, kept under one `fork` key so the
 * upstream settings schema gains a single field. See fork/DECISIONS.md #6.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** A named group of workspaces in the fork's workspace sidebar. Open or closed stays per device. */
export const ForkWorkspaceGroup = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  name: Schema.String.check(Schema.isMaxLength(80)),
  /** Logical project keys, the same keys the sidebar uses to merge a project across machines. */
  projectKeys: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type ForkWorkspaceGroup = typeof ForkWorkspaceGroup.Type;

const CustomCss = Schema.String.check(Schema.isMaxLength(100_000));

/** Fork-only server settings, synced to every client of the environment through `settings.json`. */
export const ForkSettings = Schema.Struct({
  /** CSS applied on top of the app's styles and `fork.css`, live in every client. */
  customCss: CustomCss.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  /** Replaces upstream's sidebar with the workspace sidebar and the thread tab strip. */
  workspaceSidebarEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  workspaceGroups: Schema.Array(ForkWorkspaceGroup).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type ForkSettings = typeof ForkSettings.Type;

/** Partial fork settings; a patched key replaces the saved value, arrays included. */
export const ForkSettingsPatch = Schema.Struct({
  customCss: Schema.optionalKey(CustomCss),
  workspaceSidebarEnabled: Schema.optionalKey(Schema.Boolean),
  workspaceGroups: Schema.optionalKey(Schema.Array(ForkWorkspaceGroup)),
});
export type ForkSettingsPatch = typeof ForkSettingsPatch.Type;
