/**
 * Paragraph-aware text chunker. Packs paragraphs into ~`size`-char windows with
 * a trailing `overlap` carried into the next window (so context spanning a
 * boundary isn't lost). Oversized single paragraphs are hard-split.
 */
export interface ChunkOptions {
  /** Target max characters per chunk. */
  size?: number
  /** Characters of trailing overlap carried into the next chunk. */
  overlap?: number
}

const DEFAULT_SIZE = Number(process.env.RAG_CHUNK_SIZE ?? 1200)
const DEFAULT_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP ?? 200)

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = opts.size ?? DEFAULT_SIZE
  const overlap = Math.min(opts.overlap ?? DEFAULT_OVERLAP, Math.floor(size / 2))
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ""

  const flush = () => {
    const c = current.trim()
    if (c) chunks.push(c)
    // Carry the tail of the flushed chunk as overlap into the next one.
    current = overlap > 0 && c.length > overlap ? c.slice(-overlap) + "\n\n" : ""
  }

  for (const para of paragraphs) {
    // A single paragraph larger than `size` is sliced into fixed windows.
    if (para.length > size) {
      if (current.trim()) flush()
      for (let i = 0; i < para.length; i += size - overlap) {
        chunks.push(para.slice(i, i + size).trim())
      }
      current = ""
      continue
    }
    if (current.length + para.length + 2 > size) flush()
    current += (current ? "\n\n" : "") + para
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}
