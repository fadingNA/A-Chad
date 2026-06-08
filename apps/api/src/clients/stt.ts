/**
 * Client for the speech-to-text service (`services/stt`, SeamlessM4T v2).
 * Self-hosted only; never OpenAI. The service streams NDJSON per chunk so we
 * can surface live transcription progress.
 *
 * If the service is unreachable we surface a clear message rather than failing
 * the whole chat turn.
 */
const STT_URL = process.env.STT_URL ?? "http://localhost:8802"

export interface TranscribeResult {
  text: string
  ok: boolean
  error?: string
}

export interface TranscribeProgress {
  partial: string
  done: string // transcript accumulated so far
  index: number
  total: number
}

export async function transcribeAudio(
  bytes: Buffer,
  name: string,
  mime: string,
  onProgress?: (p: TranscribeProgress) => void
): Promise<TranscribeResult> {
  try {
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name)
    const res = await fetch(`${STT_URL}/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(600_000),
    })
    if (!res.ok || !res.body) {
      return { text: "", ok: false, error: `stt ${res.status}` }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let acc = ""
    let full = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        let ev: { t: string; v?: string; text?: string; i?: number; n?: number }
        try {
          ev = JSON.parse(line)
        } catch {
          continue
        }
        if (ev.t === "partial") {
          acc = acc ? `${acc} ${ev.v ?? ""}` : ev.v ?? ""
          onProgress?.({
            partial: ev.v ?? "",
            done: acc,
            index: ev.i ?? 0,
            total: ev.n ?? 0,
          })
        } else if (ev.t === "done") {
          full = ev.text ?? acc
        }
      }
    }
    return { text: full || acc, ok: true }
  } catch (err) {
    return {
      text: "",
      ok: false,
      error: `stt unreachable at ${STT_URL}: ${String(err)}`,
    }
  }
}
