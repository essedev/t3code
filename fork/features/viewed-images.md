# Viewed images survive a deleted file

When an agent opens an image with a file read, the chat shows it under the tool call. Upstream
loads that image from the file on disk, so it turns into "Image unavailable" as soon as the agent
or anyone else deletes the file, as agents often do with their screenshots once they are done.

The fork falls back to the copy saved in the read's tool output, which the database already keeps.
Deleting the file frees its space without losing the image in the chat, and the database does not
grow, since that copy was stored anyway.

## How it is built

`apps/web/src/fork/viewedImages.ts` finds, for each viewed path, the latest read whose output can
hold the image, as upstream's `tool-output-image` asset. `apps/web/src/fork/ViewedImage.tsx` shows
the file as upstream does and switches to that asset when the file's URL cannot be minted. The
server already serves the asset, so there is no server change. The upstream files that mount it
are in the README's differences table.

## Limits

- The file still wins while it exists, so an image overwritten under the same path shows the new
  version, as upstream does.
- Reads whose output keeps no image bytes, such as Codex image views or images over the size limit,
  still show "Image unavailable" once the file is gone.
- Web and desktop only: the mobile work log shows no viewed images.
