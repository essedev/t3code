/**
 * The fork's default CSS (`fork.css`) as text, split into rules for the read-only list in
 * Settings > Fork, where each one can be copied into the user's custom CSS.
 */
import forkCssText from "./fork.css?raw";

/** One top-level rule of a stylesheet, with the comment written right above it. */
export interface CssBlock {
  readonly note: string | null;
  readonly css: string;
}

function commentText(comment: string): string {
  return comment
    .slice(2, -2)
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .filter((line) => line !== "")
    .join(" ");
}

/**
 * The top-level rules of `text` in order (at-rules keep their nested rules), each with the last
 * comment between it and the previous rule. Comments with no rule after them are dropped.
 */
export function splitCssBlocks(text: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let start = -1;
  let note: string | null = null;
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote !== null) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      const close = end === -1 ? text.length : end + 2;
      if (depth === 0 && start === -1) note = commentText(text.slice(index, close));
      index = close - 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (depth === 0 && start === -1 && !/\s/.test(char)) start = index;
    if (char === "{") depth += 1;
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        blocks.push({ note, css: text.slice(start, index + 1).trim() });
        start = -1;
        note = null;
      }
    }
  }
  return blocks;
}

/** The rules of `fork.css`, as shipped in this build. */
export const FORK_DEFAULT_CSS_BLOCKS: readonly CssBlock[] = splitCssBlocks(forkCssText);
