import { useEffect, useRef, useState } from "react";

import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../components/settings/settingsLayout";
import { searchableSetting } from "../components/settings/settingsSearch";
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
  return (
    <SettingsRow
      {...searchableSetting("fork-custom-css")}
      description="Applied on top of the app's styles in every client of this machine, live as you type. If a rule breaks the layout, clear it here or remove `fork.customCss` from settings.json."
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
      <div className="mt-3 pb-3.5">
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
