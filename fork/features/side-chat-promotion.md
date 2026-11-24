# Make a side chat a main thread

A side chat started with `/btw` or `/side` lives in the right panel and dies with its thread.
"Make main thread", next to Bring back at the top of the side chat, turns it into a thread of its
own: same conversation, same provider session, listed in the sidebar as a fork of the thread it
came from. Deleting the original thread no longer deletes it.

## When it is offered

After a finished reply, while nothing runs in the side chat. The server also refuses it until the
parent's context has reached the agent: a side chat whose only turn was a `/goal` command still
carries that context for its next prompt. Servers without the `sideChatPromotion` capability (the
official build) show the button disabled with an update hint.

## How it is built

The `thread.side-chat.promote` command drops `lineage.sideChat` and emits `thread.metadata-updated`
(DECISIONS #10). From then on the thread is a plain fork: the timeline shows the parent's history up
to the fork point above its own turns, and new turns capture checkpoints in the shared worktree.
Earlier side chat turns keep no checkpoint, as before. The parent's delete reads its side chats
under the parent's lock, so the promotion takes that lock first; `runtimeLayer.test.ts` covers the
order and `SteeringCompletion.integration.test.ts` the guards over real turns. A side chat tab left
open on another client shows "This side chat is now a main thread" with a link to it.

## Limits

- Web and desktop only. The fork ships no mobile build, so the official mobile app has no button;
  a promoted thread still shows there as a normal thread.
- No MCP tool: agents cannot promote a side chat.
- One way: a main thread cannot become a side chat again. Delete it to get rid of it.
