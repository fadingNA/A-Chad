import type { ChatModelAdapter, ChatModelRunOptions } from "@assistant-ui/react";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

/** Fetch available models from a running Ollama instance. */
export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`);
  const data = await res.json();
  return (data.models ?? []) as OllamaModel[];
}

/** Quick health check — resolves true if Ollama is reachable. */
export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Creates a ChatModelAdapter that streams from Ollama.
 *
 * Accepts a getter so the config (URL / model) can be changed at runtime
 * without needing to recreate the runtime.
 */
export function createOllamaAdapter(getConfig: () => OllamaConfig): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
      const { baseUrl, model } = getConfig();

      // Convert @assistant-ui ThreadMessage[] → Ollama message format
      const ollamaMessages = messages.flatMap((msg) => {
        const text = msg.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("");
        if (!text) return [];
        return [{ role: msg.role, content: text }];
      });

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(
          `Ollama error ${response.status}: ${response.statusText}. ` +
            `Is model "${model}" pulled? Run: ollama pull ${model}`
        );
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the incomplete trailing line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };
            if (data.message?.content) {
              accumulated += data.message.content;
              yield { content: [{ type: "text", text: accumulated }] };
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    },
  };
}
