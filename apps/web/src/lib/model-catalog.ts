/**
 * Friendly, non-technical names for models.
 *
 * Users pick by *what a model is good at* (General, Reasoning, Coding, Vision…)
 * instead of a raw Ollama tag like `gemma4:31b`. Matching is by pattern so it
 * covers whatever is pulled on the server — including models we've never seen —
 * and hides non-chat models (embeddings) from the picker.
 */

export interface ModelDescriptor {
  /** Raw model id (e.g. "gemma4:31b"). */
  id: string
  /** Friendly label shown to the user (e.g. "General · Large"). */
  title: string
  /** Base category without size hint (e.g. "General") — used for grouping. */
  category: string
  /** One-line, plain-language description. */
  description: string
  /** Non-chat models (embeddings) — kept out of the chat model picker. */
  hidden: boolean
}

interface Rule {
  test: RegExp
  category: string
  description: string
  hidden?: boolean
}

// First match wins — order from most specific to most general.
const RULES: Rule[] = [
  {
    test: /(nomic|embed|bge|gte|e5|minilm)/i,
    category: "Embedding",
    description: "Text embeddings (not for chat)",
    hidden: true,
  },
  {
    test: /(deepseek[-_]?r1|\br1\b|reason|thinking|qwq|marco-?o1)/i,
    category: "Reasoning",
    description: "Thinks step-by-step — best for complex problems and analysis",
  },
  {
    test: /(coder|code[-_]|codellama|starcoder|codestral|deepseek[-_]?coder)/i,
    category: "Coding",
    description: "Tuned for writing, explaining, and reviewing code",
  },
  {
    test: /(llava|vision|[-_]vl\b|minicpm[-_]?v|moondream|bakllava|pixtral)/i,
    category: "Vision",
    description: "Understands images as well as text",
  },
  {
    test: /nemotron/i,
    category: "Advanced",
    description: "Large, high-capability model for demanding tasks",
  },
  {
    test: /qwen/i,
    category: "Technical",
    description: "Strong at code, math, and technical reasoning",
  },
  {
    test: /(gemma|llama|mistral|mixtral|phi|command|granite|olmo|smol)/i,
    category: "General",
    description: "Everyday chat, writing, and questions",
  },
]

/** Rough size band from a tag like ":31b" / ":7b" — "" when no size is present. */
function sizeHint(id: string): string {
  const m = id.match(/(\d+(?:\.\d+)?)\s*b\b/i)
  if (!m) return ""
  const b = parseFloat(m[1]!)
  return b >= 30 ? "Large" : b >= 12 ? "Medium" : "Small"
}

/** Map a raw model id to its friendly descriptor. */
export function describeModel(id: string): ModelDescriptor {
  const rule = RULES.find((r) => r.test.test(id))
  const category = rule?.category ?? "General"
  const description = rule?.description ?? "General-purpose language model"
  const hidden = rule?.hidden ?? false
  const hint = hidden ? "" : sizeHint(id)
  return {
    id,
    category,
    description,
    hidden,
    title: hint ? `${category} · ${hint}` : category,
  }
}

/** Category display order for the "featured" section of the picker. */
export const CATEGORY_ORDER = [
  "General",
  "Reasoning",
  "Technical",
  "Coding",
  "Vision",
  "Advanced",
]
