import { createOllama } from "ollama-ai-provider-v2"

/**
 * Multi-model registry over the shared local Ollama server. No OpenAI / cloud.
 *
 * Spike scope: just the default model. Step 3 expands this into the full
 * capability-aware set (vision / tools / reasoning) + the modality router.
 */
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api"

const ollama = createOllama({ baseURL: OLLAMA_URL })

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "gemma4:latest"

export const defaultModel = ollama(DEFAULT_MODEL)
