import { describe, expect, it } from "vite-plus/test";

import { splitCssBlocks } from "./forkCss";

describe("splitCssBlocks", () => {
  it("splits top-level rules and keeps the comment written right above each", () => {
    const css = `/*
 * File header.
 */

/* The card reads poorly. */
[data-card] {
  --glass-opacity: 96%;
}

a::before { content: "}"; }

@media (min-width: 600px) {
  /* nested comment */
  .x { color: red; }
}
/* trailing comment */
`;
    expect(splitCssBlocks(css)).toEqual([
      { note: "The card reads poorly.", css: "[data-card] {\n  --glass-opacity: 96%;\n}" },
      { note: null, css: 'a::before { content: "}"; }' },
      {
        note: null,
        css: "@media (min-width: 600px) {\n  /* nested comment */\n  .x { color: red; }\n}",
      },
    ]);
  });
});
