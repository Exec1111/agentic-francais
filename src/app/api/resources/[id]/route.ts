import { NextRequest } from 'next/server'
import {
  updateRessourceMarkdown,
  updateRessourceContenu,
  getRessourceById,
} from '@/backend/repositories/resource-repo'
import { getResourceDefinition } from '@/backend/resources/registry'

/**
 * PATCH /api/resources/:id
 *
 * Deux modes de mise à jour :
 *
 * 1. Édition Markdown brut (ressources textuelles classiques) :
 *    Body : { contenu_markdown: string }
 *
 * 2. Édition structurée par blocs (fiche_questions) :
 *    Body : { contenu_json: object }
 *    → Le Markdown est régénéré automatiquement via le renderer du type
 *      (en respectant l'audience prof/élève de la ressource), afin que
 *      l'impression PDF reste cohérente avec les blocs édités.
 *
 * Réponse : RessourceStructuree mise à jour
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { contenu_markdown, contenu_json } = body

    // ── Mode 2 : édition structurée (blocs) ──────────────────────────────────
    if (contenu_json && typeof contenu_json === 'object') {
      const existing = getRessourceById(id)
      if (!existing) {
        return Response.json({ error: `Ressource introuvable (id: ${id}).` }, { status: 404 })
      }

      const definition = getResourceDefinition(existing.type)
      if (!definition) {
        return Response.json(
          { error: `Type de ressource non géré : "${existing.type}".` },
          { status: 422 }
        )
      }

      // Régénération du Markdown selon l'audience de la ressource
      const renderer =
        existing.audience === 'eleve' && definition.toMarkdown.eleve
          ? definition.toMarkdown.eleve
          : definition.toMarkdown.professeur
      const markdown = renderer(contenu_json as Record<string, unknown>)

      const updated = updateRessourceContenu(id, contenu_json as Record<string, unknown>, markdown)
      if (!updated) {
        return Response.json({ error: `Ressource introuvable (id: ${id}).` }, { status: 404 })
      }
      return Response.json(updated)
    }

    // ── Mode 1 : édition Markdown brut ───────────────────────────────────────
    if (typeof contenu_markdown !== 'string') {
      return Response.json(
        { error: 'Le champ contenu_markdown (string) ou contenu_json (object) est requis.' },
        { status: 400 }
      )
    }

    const updated = updateRessourceMarkdown(id, contenu_markdown)
    if (!updated) {
      return Response.json({ error: `Ressource introuvable (id: ${id}).` }, { status: 404 })
    }

    return Response.json(updated)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    console.error(`[PATCH /api/resources/${params.id}]`, msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
