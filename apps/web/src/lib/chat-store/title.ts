import type { TitleGenerationAdapter } from "@assistant-ui/core/react";
import type { ThreadMessage } from "@assistant-ui/react";

const MAX_TITLE_LENGTH = 48;

/** Pull the plain text out of a message's parts. */
function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

/**
 * Derives a chat title from the first user message — no extra model call, so
 * it's instant and keeps everything local (nothing leaves the machine).
 *
 * If you later want richer titles, swap this for an adapter that asks Ollama
 * to summarize; the `TitleGenerationAdapter` contract is the only thing the
 * store depends on.
 */
export function createFirstMessageTitleAdapter(): TitleGenerationAdapter {
  return {
    async generateTitle(messages) {
      const firstUser = messages.find((m) => m.role === "user");
      const text = firstUser ? messageText(firstUser) : "";
      if (!text) return "New chat";
      const firstLine = text.split("\n")[0]!.trim();
      return firstLine.length > MAX_TITLE_LENGTH
        ? firstLine.slice(0, MAX_TITLE_LENGTH).trimEnd() + "…"
        : firstLine;
    },
  };
}
