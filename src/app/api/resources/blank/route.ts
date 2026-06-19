import { NextRequest } from 'next/server'
import { buildBlankResourcePair } from '@/backend/resources/generator'
import { saveRessourcePaire } from '@/backend/repositories/resource-repo'
import { RessourceTypeSchema } from '@/shared/schemas'

/**
 * POST /api/resources/blank
 *
 * Crée une ressource VIERGE (sans appel LLM), à composer manuellement bloc par
 * bloc dans l'éditeur. Body : { type?: RessourceType, activiteId?: string }
 * (type par défaut : "fiche_questions").
 *
 * Le type doit être « composable » (exposer un template, ex: fiche_questions, cours),
 * sinon la création échoue avec un message clair.
 *
 * Si activiteId est fourni, la paire est persistée immédiatement (comme pour une
 * génération IA). Sinon, elle est seulement retournée au client. cf. /api/generate/resource.
 *
 * Réponse : RessourcePaire (professeur + élève éventuel)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const activiteId = typeof body?.activiteId === 'string' ? body.activiteId : undefined

    const typeValidation = RessourceTypeSchema.safeParse(body?.type ?? 'fiche_questions')
    if (!typeValidation.success) {
      return Response.json({ error: `Type de ressource inconnu : "${body?.type}"` }, { status: 400 })
    }

    const paire = buildBlankResourcePair(typeValidation.data, activiteId)

    if (activiteId) {
      try {
        saveRessourcePaire(paire)
      } catch (saveErr) {
        // Cohérent avec /api/generate/resource : un échec de persistance
        // (activite_id absent de la DB) ne doit pas faire échouer la création.
        console.warn('[resources/blank] Persistance DB ignorée :', saveErr)
      }
    }

    return Response.json(paire, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    console.error('[POST /api/resources/blank]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
