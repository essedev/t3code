import "./fork.css";

import { useCustomCssDraft, useForkSettings } from "./forkSettings";

/** Injects the custom CSS from Settings > Fork after the app's styles and `fork.css`. */
export function ForkStyles() {
  const savedCss = useForkSettings().customCss;
  const draftCss = useCustomCssDraft();
  const css = draftCss ?? savedCss;
  if (css.trim() === "") return null;
  return <style data-fork-custom-css>{css}</style>;
}
