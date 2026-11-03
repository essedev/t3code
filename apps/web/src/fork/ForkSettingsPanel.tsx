import { useEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../components/settings/settingsLayout";
import { searchableSetting } from "../components/settings/settingsSearch";
import { FORK_DEFAULT_CSS_BLOCKS, type CssBlock } from "./forkCss";
import { setCustomCssDraft, useForkSettings, useUpdateForkSettings } from "./forkSettings";

const CUSTOM_CSS_SAVE_DELAY_MS = 600;

/** Settings that exist only in the essedev/t3code fork. */
export function ForkSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection id="fork" title="Fork">
        <WorkspaceSidebarRow />
        <CustomCssRow />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function WorkspaceSidebarRow() {
  const { workspaceSidebarEnabled } = useForkSettings();
  const updateForkSettings = useUpdateForkSettings();
  return (
    <SettingsRow
      {...searchableSetting("fork-workspace-sidebar")}
      description="List projects as workspaces in the sidebar, grouped as you like, and open their threads as tabs above the chat. Turn it off to get the standard sidebar back."
      control={
        <Switch
          checked={workspaceSidebarEnabled}
          onCheckedChange={(checked) =>
            updateForkSettings({ workspaceSidebarEnabled: Boolean(checked) })
          }
          aria-label="Workspace sidebar"
        />
      }
    />
  );
}

function CustomCssRow() {
  const { customCss } = useForkSettings();
  const updateForkSettings = useUpdateForkSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<(() => void) | null>(null);

  const save = (css: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pendingSave.current = null;
    if (css !== customCss) updateForkSettings({ customCss: css });
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- saves a pending edit and drops the live preview when the page closes
  useEffect(
    () => () => {
      pendingSave.current?.();
      setCustomCssDraft(null);
    },
    [],
  );

  const value = draft ?? customCss;
  const replaceCss = (css: string) => {
    setDraft(css);
    setCustomCssDraft(css);
    save(css);
  };
  return (
    <SettingsRow
      {...searchableSetting("fork-custom-css")}
      description="The fork's defaults ship with each release; your CSS below applies after them, so a rule of yours wins. Changes show live as you type. If a rule breaks the layout, clear it here or remove `fork.customCss` from settings.json."
      resetAction={
        value !== "" ? (
          <SettingResetButton
            label="custom CSS"
            onClick={() => {
              setDraft(null);
              setCustomCssDraft(null);
              save("");
            }}
          />
        ) : null
      }
    >
      <div className="mt-3 flex flex-col gap-2 pb-3.5">
        {FORK_DEFAULT_CSS_BLOCKS.length > 0 ? (
          <>
            <h3 className="text-xs font-medium text-muted-foreground">Fork defaults</h3>
            <ul className="flex flex-col gap-2">
              {FORK_DEFAULT_CSS_BLOCKS.map((block) => (
                <DefaultCssBlock
                  key={block.css}
                  block={block}
                  copied={value.includes(block.css)}
                  // At the top, so the rules already there still come later and win.
                  onCopy={() =>
                    replaceCss(
                      value.trim() === ""
                        ? `${block.css}\n`
                        : `${block.css}\n\n${value.trimStart()}`,
                    )
                  }
                />
              ))}
            </ul>
            <h3 className="mt-2 text-xs font-medium text-muted-foreground">Your CSS</h3>
          </>
        ) : null}
        <Textarea
          aria-label="Custom CSS"
          rows={12}
          spellCheck={false}
          value={value}
          placeholder={"[data-thread-details-card] {\n  --glass-opacity: 100%;\n}"}
          onChange={(event) => {
            const css = event.target.value;
            setDraft(css);
            setCustomCssDraft(css);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            pendingSave.current = () => save(css);
            saveTimer.current = setTimeout(() => save(css), CUSTOM_CSS_SAVE_DELAY_MS);
          }}
          onBlur={() => {
            if (draft !== null) save(draft);
          }}
        />
      </div>
    </SettingsRow>
  );
}

/** A rule of `fork.css`, read only, with a button that copies it into the custom CSS. */
function DefaultCssBlock(props: {
  readonly block: CssBlock;
  readonly copied: boolean;
  readonly onCopy: () => void;
}) {
  return (
    <li className="list-none rounded-lg border border-border bg-muted/40">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {props.block.note ?? "No description."}
        </p>
        <Button size="xs" variant="outline" disabled={props.copied} onClick={props.onCopy}>
          {props.copied ? "In your CSS" : "Copy to my CSS"}
        </Button>
      </div>
      <pre className="overflow-x-auto px-3 pt-1.5 pb-2.5 font-mono text-xs text-foreground">
        {props.block.css}
      </pre>
    </li>
  );
}
