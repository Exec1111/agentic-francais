import { MethodeContenuSchema, type MethodeContenu } from '@/shared/resource-blocks-methode'

/**
 * Tente de parser un contenu_json en MethodeContenu (blocs de méthode).
 * Retourne null si incompatible — l'appelant retombe sur le rendu Markdown.
 */
export function parseMethodeBlocs(contenu: unknown): MethodeContenu | null {
  if (!contenu || typeof contenu !== 'object') return null
  if (!Array.isArray((contenu as Record<string, unknown>).blocs)) return null
  const result = MethodeContenuSchema.safeParse(contenu)
  return result.success ? result.data : null
}
