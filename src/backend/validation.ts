import { z, ZodError } from 'zod'
import { safeParseJSON, LLMProvider, LLMMessage, ChatOptions } from './llm-provider'

interface ValidateOptionsBase {
  raw: string
  context: string
  llm?: LLMProvider
  messages?: LLMMessage[]
  options?: ChatOptions
  maxRetries?: number
  onLog?: (msg: string) => void
}

/**
 * Valide la sortie d'un LLM avec un schéma Zod.
 * 
 * Stratégie :
 * 1. Parse le JSON brut (avec réparation trailing commas, etc.)
 * 2. Valide avec Zod (avec coerce + defaults)
 * 3. Si échec : log l'erreur + retry si LLM fourni
 * 4. Si retry échoue : throw avec détails Zod
 */
export async function validateLLMOutput<T extends z.ZodTypeAny>(
  opts: ValidateOptionsBase & { schema: T }
): Promise<z.infer<T>> {
  const { schema, raw, context, llm, messages, options, maxRetries = 1, onLog } = opts

  // 1. Parse JSON brut (peut échouer si le LLM renvoie du texte libre)
  let json: any
  let parseError: string | null = null
  try {
    json = safeParseJSON(raw, context)
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err)
    onLog?.(`⚠️ Réponse non-JSON reçue, tentative de correction...`)
  }

  // 2. Validation Zod (seulement si le JSON a été parsé)
  if (json !== undefined && !parseError) {
    const result = schema.safeParse(json)

    if (result.success) {
      return result.data
    }

    // 3. Log détaillé de l'erreur Zod
    parseError = formatZodError(result.error)
    console.error(`[VALIDATION ${context}] ❌ Erreurs Zod:`)
    console.error(parseError)
    onLog?.(`⚠️ Validation: ${parseError.slice(0, 200)}`)
  }

  // 4. Retry avec feedback au LLM (couvre AUSSI le cas non-JSON)
  if (llm && messages && maxRetries > 0) {
    onLog?.(`♻️ Retry avec correction (${maxRetries} tentative(s) restante(s))...`)

    const feedbackMsg = json === undefined
      ? `Ta réponse précédente n'est PAS du JSON. Tu as renvoyé du texte libre.\n\nTu DOIS répondre UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après.\nPas de markdown, pas d'explication, JUSTE le JSON.`
      : `Ta réponse JSON précédente est invalide. Voici les erreurs de validation :\n${parseError}\n\nCorrige ta réponse et renvoie UNIQUEMENT du JSON valide respectant exactement le schéma demandé.`

    const retryMessages: LLMMessage[] = [
      ...messages,
      { role: 'assistant', content: raw.slice(0, 2000) },
      { role: 'user', content: feedbackMsg },
    ]

    const retryResponse = await llm.chat(retryMessages, options)

    return validateLLMOutput({
      schema,
      raw: retryResponse.content,
      context: `${context}/retry`,
      llm,
      messages,
      options,
      maxRetries: maxRetries - 1,
      onLog,
    })
  }

  // 5. Échec final
  throw new Error(
    `[${context}] Validation échouée après retry:\n${parseError}`
  )
}

/**
 * Formate une ZodError en string lisible pour le LLM et les logs.
 */
function formatZodError(error: ZodError): string {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? `[${issue.path.join('.')}]` : '[racine]'
    return `- ${path}: ${issue.message} (attendu: ${issue.code})`
  }).join('\n')
}
