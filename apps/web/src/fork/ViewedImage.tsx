/**
 * An image the agent opened with a file read. It shows the file on disk, as upstream does, and
 * falls back to the copy saved in the tool's output once the file is gone.
 */
import { use, type ComponentProps } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import {
  ChatMarkdownAssetImage,
  WorkspaceMutationIdContext,
} from "~/components/chat/ChatMarkdownMedia";

import type { ViewedImageOutput } from "./viewedImages";

export function ViewedImage(
  props: ComponentProps<typeof ChatMarkdownAssetImage> & {
    /** The saved copy to show when the file cannot be read. */
    readonly output: ViewedImageOutput | null;
  },
) {
  const { output, ...imageProps } = props;
  const threadWorkspaceMutationId = use(WorkspaceMutationIdContext);
  // Same atom key as ChatMarkdownAssetImage's own lookup, so this adds no request.
  const file = useAssetUrlState(
    props.environmentId,
    props.resource,
    props.workspaceMutationId ?? threadWorkspaceMutationId,
  );
  if (file._tag !== "Failure" || output === null) return <ChatMarkdownAssetImage {...imageProps} />;
  const { srcFragment: _srcFragment, workspaceRoot: _workspaceRoot, ...outputProps } = imageProps;
  return <ChatMarkdownAssetImage {...outputProps} resource={output} />;
}
