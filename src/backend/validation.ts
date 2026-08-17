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

    const feedbackMsg = parseError
      ? `Ta réponse JSON précédente est syntaxiquement invalide. Erreur détectée :\n${parseError}\n\nLa réponse semble avoir été interrompue ou contient une erreur de syntaxe. Recommence la sortie depuis le début et renvoie l'objet JSON COMPLET, avec toutes les virgules, tous les crochets et toutes les chaînes fermés. Ne renvoie pas de fragment.\n\nRéponds UNIQUEMENT avec du JSON valide, sans markdown ni explication.`
      : `Ta réponse précédente n'est PAS du JSON. Tu as renvoyé du texte libre.\n\nTu DOIS répondre UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après.\nPas de markdown, pas d'explication, JUSTE le JSON.`

    const retryMessages: LLMMessage[] = [
      ...messages,
      {
        role: 'assistant',
        content: buildRetryResponseExcerpt(raw, parseError),
      },
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
 * Donne au modèle la zone réellement fautive sans faire exploser le contexte
 * avec une copie complète d'une longue fiche JSON.
 */
function buildRetryResponseExcerpt(raw: string, parseError: string | null): string {
  const position = parseError?.match(/position (\d+)/i)?.[1]
  if (!position) return raw.slice(0, 4000)

  const at = Number(position)
  const start = Math.max(0, at - 1200)
  const end = Math.min(raw.length, at + 1200)
  return `${start > 0 ? '[début de la réponse omis]\n' : ''}${raw.slice(start, end)}${end < raw.length ? '\n[fin de la réponse omise]' : ''}`
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
