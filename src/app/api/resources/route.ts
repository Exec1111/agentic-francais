import { NextRequest } from 'next/server'
import {
  getRessourcesByActivite,
  getRessourcesBySequenceScope,
  getRessourcesBySeanceScope,
  saveRessourcePaire,
  deleteRessourcePaire,
} from '@/backend/repositories/resource-repo'
import { RessourcePaireSchema } from '@/shared/schemas'

/**
 * GET /api/resources?activite_id=xxx
 * Retourne toutes les ressources d'une activité.
 *
 * POST /api/resources
 * Sauvegarde une paire de ressources déjà générées (sans re-générer).
 * Body : RessourcePaire
 *
 * DELETE /api/resources?id=xxx
 * Supprime une ressource et sa paire liée.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activiteId = searchParams.get('activite_id')
  const sequenceId = searchParams.get('sequence_id')
  const seanceId = searchParams.get('seance_id')

  // Rattachement séquence (évaluation finale)
  if (sequenceId) {
    const scope = searchParams.get('scope')
    if (scope !== 'evaluation_finale') {
      return Response.json(
        { error: "Le paramètre scope doit valoir 'evaluation_finale' avec sequence_id." },
        { status: 400 }
      )
    }
    const ressources = getRessourcesBySequenceScope(sequenceId, 'evaluation_finale')
    return Response.json({ ressources })
  }

  // Rattachement séance (fiche de préparation)
  if (seanceId) {
    const scope = searchParams.get('scope')
    if (scope !== 'seance') {
      return Response.json(
        { error: "Le paramètre scope doit valoir 'seance' avec seance_id." },
        { status: 400 }
      )
    }
    const ressources = getRessourcesBySeanceScope(seanceId, 'seance')
    return Response.json({ ressources })
  }

  if (!activiteId) {
    return Response.json(
      { error: 'Le paramètre activite_id, sequence_id ou seance_id est requis.' },
      { status: 400 }
    )
  }

  const ressources = getRessourcesByActivite(activiteId)
  return Response.json({ ressources })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = RessourcePaireSchema.safeParse(body)

    if (!result.success) {
      return Response.json(
        { error: 'Corps de requête invalide.', details: result.error.issues },
        { status: 400 }
      )
    }

    const saved = saveRessourcePaire(result.data)
    return Response.json(saved, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'Le paramètre id est requis.' }, { status: 400 })
  }

  const count = deleteRessourcePaire(id)
  if (count === 0) {
    return Response.json({ error: 'Ressource introuvable.' }, { status: 404 })
  }

  return Response.json({ deleted: count })
}
