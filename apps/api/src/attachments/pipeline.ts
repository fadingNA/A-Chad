import { attachmentStore, type StoredAttachment } from "./store"
import { extractDocument } from "../clients/docproc"
import { transcribeAudio } from "../clients/stt"

/** An image resolved for the vision model (data URL). */
export interface ResolvedImage {
  name: string
  dataUrl: string
}

/** A user turn's attachments resolved for the model: inline text + images. */
export interface ResolvedAttachments {
  /** Combined user text + attachment blocks (back-compat convenience). */
  text: string
  /** The user's own typed text (markers stripped). */
  userText: string
  /** Just the resolved attachment blocks (transcript/extract) — may be huge. */
  attachmentText: string
  images: ResolvedImage[]
}

/** Optional live-progress callback (used for slow steps like transcription). */
export type ProgressFn = (status: string) => void

/** Resolve a non-image attachment into a labeled text block for the prompt. */
async function resolveText(a: StoredAttachment, onProgress?: ProgressFn): Promise<string> {
  switch (a.kind) {
    case "text":
      return `### Attached file: ${a.name}\n\n${a.bytes.toString("utf8")}`
    case "document": {
      const r = await extractDocument(a.bytes, a.name, a.mime)
      return r.ok
        ? `### Attached document: ${a.name}\n\n${r.markdown}`
        : `### Attached document: ${a.name}\n\n_(could not extract: ${r.error})_`
    }
    case "audio": {
      const r = await transcribeAudio(a.bytes, a.name, a.mime, (p) => {
        const tail = p.done.slice(-70).trim()
        const count = p.total ? ` ${p.index}/${p.total}` : ""
        onProgress?.(`Transcribing${count}${tail ? ` · …${tail}` : "…"}`)
      })
      return r.ok
        ? `### Transcript of audio "${a.name}":\n\n${r.text}`
        : `### Audio "${a.name}"\n\n_(could not transcribe: ${r.error})_`
    }
    default:
      return `### Attached file: ${a.name} _(unsupported type ${a.mime})_`
  }
}

const MARKER = /\[\[attachment:([0-9a-fA-F-]+)\]\]/g

/** Strip `[[attachment:<id>]]` markers from text (files render as chips). */
export function stripMarkers(text: string): string {
  return text.replace(MARKER, "").trim()
}

/** Metadata for the attachments referenced in a user turn (for display). */
export function attachmentsInText(text: string) {
  return [...text.matchAll(MARKER)]
    .map((m) => attachmentStore.get(m[1]!))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind, mime: a.mime }))
}

/**
 * Expand attachment markers in a user turn into model content: inline text for
 * text/PDF/audio, and base64 image parts for images (routed to the vision
 * model). All processing is server-side.
 */
export async function resolveAttachmentsForModel(
  text: string,
  onProgress?: ProgressFn
): Promise<ResolvedAttachments> {
  const ids = [...text.matchAll(MARKER)].map((m) => m[1]!)
  const stripped = text.replace(MARKER, "").trim()
  if (ids.length === 0)
    return { text: stripped, userText: stripped, attachmentText: "", images: [] }

  const textBlocks: string[] = []
  const images: ResolvedImage[] = []

  for (const id of ids) {
    const a = attachmentStore.get(id)
    if (!a) {
      textBlocks.push(`_(attachment ${id} not found or expired)_`)
      continue
    }
    if (a.kind === "image") {
      images.push({
        name: a.name,
        dataUrl: `data:${a.mime};base64,${a.bytes.toString("base64")}`,
      })
      textBlocks.push(`### Attached image: ${a.name}`)
    } else {
      textBlocks.push(await resolveText(a, onProgress))
    }
  }

  const attachmentText = textBlocks.join("\n\n")
  return {
    text: [stripped, attachmentText].filter(Boolean).join("\n\n"),
    userText: stripped,
    attachmentText,
    images,
  }
}
