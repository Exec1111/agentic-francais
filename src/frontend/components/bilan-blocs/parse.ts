import { BilanContenuSchema, type BilanContenu } from '@/shared/resource-blocks-bilan'

/**
 * Tente de parser un contenu_json en BilanContenu (blocs de bilan).
 * Retourne null si incompatible — l'appelant retombe sur le rendu Markdown.
 */
export function parseBilanBlocs(contenu: unknown): BilanContenu | null {
  if (!contenu || typeof contenu !== 'object') return null
  if (!Array.isArray((contenu as Record<string, unknown>).blocs)) return null
  const result = BilanContenuSchema.safeParse(contenu)
  return result.success ? result.data : null
}
