import { NextRequest } from 'next/server'
import { updateRessourceMarkdown } from '@/backend/repositories/resource-repo'

/**
 * PATCH /api/resources/:id
 *
 * Met à jour le contenu Markdown d'une ressource existante.
 * Utilisé par le ResourcePanel pour persister les éditions manuelles.
 *
 * Body : { contenu_markdown: string }
 * Réponse : RessourceStructuree mise à jour
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { contenu_markdown } = body

    if (typeof contenu_markdown !== 'string') {
      return Response.json(
        { error: 'Le champ contenu_markdown (string) est requis.' },
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
