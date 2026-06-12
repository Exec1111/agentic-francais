import { FicheQuestionsContenuSchema, type FicheQuestionsContenu } from '@/shared/resource-blocks'

/**
 * Tente de parser un contenu_json en FicheQuestionsContenu (structure par blocs).
 * Retourne null si le JSON ne correspond pas (ex : ancienne ressource au format
 * `items[]`) — l'appelant doit alors retomber sur le rendu Markdown.
 */
export function parseFicheBlocs(contenu: unknown): FicheQuestionsContenu | null {
  if (!contenu || typeof contenu !== 'object') return null
  if (!Array.isArray((contenu as Record<string, unknown>).blocs)) return null
  const result = FicheQuestionsContenuSchema.safeParse(contenu)
  return result.success ? result.data : null
}
