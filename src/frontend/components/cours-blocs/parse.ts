import { CoursContenuSchema, type CoursContenu } from '@/shared/resource-blocks-cours'

/**
 * Tente de parser un contenu_json en CoursContenu (structure par blocs de contenu).
 * Retourne null si le JSON ne correspond pas — l'appelant retombe alors sur le
 * rendu Markdown.
 */
export function parseCoursBlocs(contenu: unknown): CoursContenu | null {
  if (!contenu || typeof contenu !== 'object') return null
  if (!Array.isArray((contenu as Record<string, unknown>).blocs)) return null
  const result = CoursContenuSchema.safeParse(contenu)
  return result.success ? result.data : null
}
