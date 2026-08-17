import OpenAI from 'openai'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// === Logging LLM ===

export interface LLMCallLog {
  id: number
  timestamp: string
  provider: string
  messages: LLMMessage[]
  options?: { temperature?: number; json?: boolean }
  response?: string
  error?: string
  doneReason?: string
  durationMs: number
}

// Utiliser globalThis pour persister les logs entre les routes API Next.js
// (en dev, chaque route peut avoir sa propre instance de module)
const globalStore = globalThis as typeof globalThis & {
  __llmCallCounter?: number
  __llmCallLogs?: LLMCallLog[]
}
if (!globalStore.__llmCallLogs) globalStore.__llmCallLogs = []
if (!globalStore.__llmCallCounter) globalStore.__llmCallCounter = 0

export function getLLMCallLogs(): LLMCallLog[] {
  return globalStore.__llmCallLogs!
}

export function clearLLMCallLogs(): void {
  globalStore.__llmCallLogs!.length = 0
}

function logCall(log: LLMCallLog) {
  globalStore.__llmCallLogs!.push(log)
  // Garder max 50 logs en mémoire
  if (globalStore.__llmCallLogs!.length > 50) globalStore.__llmCallLogs!.shift()

  // Log console coloré
  const arrow = log.error ? '❌' : '✅'
  console.log(`\n${'═'.repeat(80)}`)
  console.log(`${arrow} LLM CALL #${log.id} [${log.provider}] — ${log.durationMs}ms`)
  console.log(`${'─'.repeat(80)}`)
  console.log(`📤 INPUT (${log.messages.length} messages):`)
  for (const msg of log.messages) {
    const label = msg.role === 'system' ? '🔧 SYSTEM' : msg.role === 'user' ? '👤 USER' : '🤖 ASSISTANT'
    const content = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content
    console.log(`   ${label}: ${content}`)
  }
  console.log(`${'─'.repeat(80)}`)
  if (log.response) {
    const resp = log.response.length > 500 ? log.response.slice(0, 500) + '...' : log.response
    console.log(`📥 OUTPUT: ${resp}`)
  }
  if (log.error) {
    console.log(`❌ ERROR: ${log.error}`)
  }
  if (log.doneReason) {
    console.log(`ℹ️ DONE REASON: ${log.doneReason}`)
  }
  console.log(`${'═'.repeat(80)}\n`)
}

export interface ChatOptions {
  temperature?: number
  json?: boolean
  /** Schéma Zod pour forcer une sortie structurée (Structured Outputs) */
  schema?: z.ZodTypeAny
  /** Nom du schéma (requis pour OpenAI Structured Outputs) */
  schemaName?: string
}

export interface LLMProvider {
  name: string
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>
}

// === OpenAI Provider ===

export class OpenAIProvider implements LLMProvider {
  name = 'openai'
  private client: OpenAI
  private model: string

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    const id = ++globalStore.__llmCallCounter!
    const start = Date.now()

    // Construire le response_format
    let responseFormat: any = undefined
    if (options?.schema) {
      const jsonSchema = zodToJsonSchema(options.schema, {
        $refStrategy: 'none',
        target: 'openApi3',
      })
      responseFormat = {
        type: 'json_schema',
        json_schema: {
          name: options.schemaName || 'response',
          strict: true,
          schema: jsonSchema,
        },
      }
    } else if (options?.json) {
      responseFormat = { type: 'json_object' }
    }

    const MODEL_TEMPERATURE_OVERRIDES: Record<string, number> = {
      'gpt-5.5': 1.0,
    }
    const temperature = MODEL_TEMPERATURE_OVERRIDES[this.model] ?? options?.temperature ?? 0.7

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature,
        response_format: responseFormat,
      })

      const content = response.choices[0]?.message?.content || ''
      logCall({ id, timestamp: new Date().toISOString(), provider: `openai/${this.model}`, messages, options: { temperature: options?.temperature, json: !!options?.schema || options?.json }, response: content, durationMs: Date.now() - start })

      return {
        content,
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined,
      }
    } catch (err) {
      logCall({ id, timestamp: new Date().toISOString(), provider: `openai/${this.model}`, messages, options: { temperature: options?.temperature, json: !!options?.schema || options?.json }, error: String(err), durationMs: Date.now() - start })
      throw err
    }
  }
}

// === Ollama Provider ===

export class OllamaProvider implements LLMProvider {
  name = 'ollama'
  private baseUrl: string
  private model: string
  private numCtx: number
  private keepAlive: string

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.model = process.env.OLLAMA_MODEL || 'llama3'
    // Fenêtre de contexte : le défaut Ollama (2048/4096) est trop petit pour
    // les prompts de ressources (contexte pédagogique + corpus) + sortie JSON longue.
    // Les fiches structurées + le texte source + les consignes dépassent
    // régulièrement 8k tokens. Ollama tronque alors la sortie JSON au milieu
    // d'une chaîne. La valeur reste configurable via OLLAMA_NUM_CTX.
    this.numCtx = Number(process.env.OLLAMA_NUM_CTX) || 16384
    // Durée de résidence du modèle en VRAM entre deux appels. Le défaut Ollama
    // (5 min) provoque un rechargement (~10-30 s pour 8 GB) si les générations
    // sont espacées. 30 min garde le modèle chaud pendant une session de travail
    // tout en le libérant après inactivité. Mettre "-1" pour le garder résident
    // en permanence, ou "0" pour le décharger après chaque appel.
    this.keepAlive = process.env.OLLAMA_KEEP_ALIVE || '30m'
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    const id = ++globalStore.__llmCallCounter!
    const start = Date.now()

    // Construire le format pour Ollama
    let format: any = undefined
    if (options?.schema) {
      // Ollama ≥0.5 supporte un JSON Schema objet pour contraindre la sortie.
      // Pas de target 'openApi3' ici : la grammaire llama.cpp ignore
      // `nullable: true` (syntaxe OpenAPI) et forcerait tous les champs à
      // non-null. La cible par défaut (jsonSchema7) produit
      // `type: ["string","null"]`, que la grammaire comprend.
      format = zodToJsonSchema(options.schema, {
        $refStrategy: 'none',
      })
    } else if (options?.json) {
      format = 'json'
    }

    // Désactive le mode "thinking" (gemma, qwen, deepseek-r1…) quand on attend
    // du JSON structuré. Sinon le modèle dépense son budget de génération en
    // raisonnement (renvoyé dans `message.thinking`, que l'on ignore) et
    // `message.content` revient vide ou tronqué → "Unexpected end of JSON input".
    // `think: false` est ignoré sans erreur par les modèles non-thinking.
    const think = format ? false : undefined

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          format,
          think,
          keep_alive: this.keepAlive,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_ctx: this.numCtx,
          },
        }),
      })

      if (!response.ok) {
        const errMsg = `Ollama error: ${response.status} ${response.statusText}`
        logCall({ id, timestamp: new Date().toISOString(), provider: `ollama/${this.model}`, messages, options: { temperature: options?.temperature, json: !!options?.schema || options?.json }, error: errMsg, durationMs: Date.now() - start })
        throw new Error(errMsg)
      }

      const data = await response.json()
      const content = data.message?.content || ''
       logCall({ id, timestamp: new Date().toISOString(), provider: `ollama/${this.model}`, messages, options: { temperature: options?.temperature, json: !!options?.schema || options?.json }, response: content, doneReason: data.done_reason, durationMs: Date.now() - start })

      return {
        content,
        usage: data.eval_count ? {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        } : undefined,
      }
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith('Ollama error'))) {
        logCall({ id, timestamp: new Date().toISOString(), provider: `ollama/${this.model}`, messages, options: { temperature: options?.temperature, json: !!options?.schema || options?.json }, error: String(err), durationMs: Date.now() - start })
      }
      throw err
    }
  }
}

// === Utilitaire : extraction JSON robuste ===

export function extractJSON(raw: string): string {
  let cleaned = raw.trim()

  // Supprime les blocs ```json ... ``` ou ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Supprime un éventuel texte avant le premier { ou [
  const firstBrace = cleaned.search(/[{[]/)
  if (firstBrace > 0) {
    cleaned = cleaned.slice(firstBrace)
  }

  // Supprime un éventuel texte après le dernier } ou ]
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1)
  }

  // Répare les trailing commas (erreur fréquente des LLM)
  // ,] → ] et ,} → }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

  // Certains modèles produisent deux objets/tableaux adjacents sans virgule,
  // notamment dans les longues listes de blocs : `}\n{`. Cette correction ne
  // touche que les séparateurs structurels hors chaînes JSON.
  cleaned = repairMissingValueSeparators(cleaned)

  // Supprime les commentaires // ...
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '')

  // Supprime les commentaires /* ... */
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

  return cleaned
}

function repairMissingValueSeparators(input: string): string {
  let output = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      continue
    }

    if (char === '}' || char === ']') {
      output += char
      let next = i + 1
      while (next < input.length && /\s/.test(input[next])) next += 1
      const nextChar = input[next]
      if (nextChar === '{' || nextChar === '[') output += ','
      continue
    }

    output += char
  }

  return output
}

// === Utilitaire : parse JSON avec retry et logs ===

export function safeParseJSON(raw: string, context: string): any {
  const cleaned = extractJSON(raw)
  try {
    return JSON.parse(cleaned)
  } catch (err) {
    // Log l'erreur avec contexte pour debug
    console.error(`[JSON PARSE ERROR] Contexte: ${context}`)
    console.error(`[JSON PARSE ERROR] Erreur: ${err instanceof Error ? err.message : err}`)
    console.error(`[JSON PARSE ERROR] Raw (500 premiers chars): ${raw.slice(0, 500)}`)
    console.error(`[JSON PARSE ERROR] Cleaned (500 premiers chars): ${cleaned.slice(0, 500)}`)

    // Tentative de réparation : chercher le dernier JSON valide
    // Essai : couper au dernier } ou ] qui ferme correctement
    for (let i = cleaned.length; i > 0; i--) {
      const substr = cleaned.slice(0, i)
      try {
        return JSON.parse(substr)
      } catch {
        continue
      }
    }

    throw new Error(`Impossible de parser le JSON de ${context}: ${err instanceof Error ? err.message : err}`)
  }
}

// === Factory ===

export function createLLMProvider(provider?: string): LLMProvider {
  const name = provider || process.env.LLM_PROVIDER || 'ollama'
  switch (name) {
    case 'openai':
      return new OpenAIProvider()
    case 'ollama':
      return new OllamaProvider()
    default:
      throw new Error(`Provider LLM inconnu: ${name}`)
  }
}
