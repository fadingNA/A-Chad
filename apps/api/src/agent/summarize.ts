import { generateText } from "ai"
import { defaultModel } from "./registry"

/**
 * Map-reduce summarization for very long transcripts (e.g. 30-min audio).
 * Instead of cramming the whole transcript into one slow prompt, summarize it
 * in segments (map) then merge the summaries (reduce). Each call is small and
 * fast, and it scales to any length. Used by the agent when an attachment's
 * resolved text is large.
 */

const SEG_CHARS = 8000 // ~2k tokens per map segment
const THRESHOLD = Math.round(SEG_CHARS * 1.5) // ~12k chars (~3k tokens)

const OPTS = (numCtx: number, numPredict: number) => ({
  ollama: { think: false, options: { num_ctx: numCtx, num_predict: numPredict } },
})

function segments(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += SEG_CHARS) out.push(text.slice(i, i + SEG_CHARS))
  return out
}

/**
 * Condense `text` if it's long; otherwise return it unchanged.
 * `onProgress` reports map/reduce stages for the UI.
 */
export async function condenseTranscript(
  text: string,
  onProgress?: (status: string) => void
): Promise<string> {
  if (text.length <= THRESHOLD) return text

  const segs = segments(text)
  const partials: string[] = []
  for (let i = 0; i < segs.length; i++) {
    onProgress?.(`Summarizing part ${i + 1}/${segs.length}…`)
    const { text: part } = await generateText({
      model: defaultModel,
      prompt:
        "Summarize the key points, names, numbers, and decisions in this " +
        "transcript excerpt. Be concise and factual; keep the order.\n\n---\n" +
        segs[i] +
        "\n---",
      providerOptions: OPTS(8192, 600),
    })
    partials.push(part.trim())
  }

  if (partials.length === 1) return partials[0]

  onProgress?.(`Combining ${partials.length} summaries…`)
  const { text: merged } = await generateText({
    model: defaultModel,
    prompt:
      "These are sequential summaries of one long transcript, in order. Merge " +
      "them into a single coherent summary, preserving key facts, names, " +
      "numbers, and sequence.\n\n" +
      partials.map((p, i) => `[Part ${i + 1}]\n${p}`).join("\n\n"),
    providerOptions: OPTS(16384, 1200),
  })
  return merged.trim()
}
