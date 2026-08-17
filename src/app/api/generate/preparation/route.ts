import { NextRequest } from 'next/server'
import { getDb } from '@/backend/db'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { generateResourcePair } from '@/backend/resources/generator'
import { buildSeanceDigest } from '@/backend/resources/prompt-context'
import {
  getRessourcesByActivite,
  saveRessource,
  deleteRessourcesBySeanceScope,
} from '@/backend/repositories/resource-repo'
import { SequenceSchema } from '@/shared/schemas'
import { computeSeanceChecksum } from '@/shared/seance-checksum'
import type { ResourceGenerationContext, ActiviteType } from '@/backend/resources/registry'
import type { CorpusItem, RessourceStructuree, RessourceType } from '@/shared/schemas'

/**
 * Types de ressources dont le CONTENU nourrit la fiche de préparation : le cours
 * alimente la trace écrite au tableau, les fiches/exercices les corrections
 * anticipées. Même sélection que l'évaluation finale.
 */
const PREP_CONTENT_TYPES = new Set<RessourceType>([
  'cours', 'fiche_questions', 'fiche_methode', 'bilan', 'fiche_lecture', 'carte_mentale',
])

/**
 * POST /api/generate/preparation
 *
 * Génère la FICHE DE PRÉPARATION d'une séance (déroulé enseignant minuté) :
 * document professeur unique (TEACHER_ONLY), rattaché à la séance
 * (scope 'seance'). Voir doc/fiche-preparation.md.
 *
 * Body : { sequenceId: string, seanceId: string, sequence: Sequence, provider?, consignes? }
 * Réponse : { fiche: RessourceStructuree }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sequenceId, seanceId, sequence: rawSequence, provider, consignes } = body

    if (!sequenceId || typeof sequenceId !== 'string' || !seanceId || typeof seanceId !== 'string') {
      return Response.json(
        { error: 'sequenceId et seanceId sont requis (la séquence doit être sauvegardée avant de générer la fiche de préparation).' },
        { status: 400 }
      )
    }

    const parsed = SequenceSchema.safeParse(rawSequence)
    if (!parsed.success) {
      return Response.json(
        { error: 'Séquence invalide.', details: parsed.error.issues },
        { status: 400 }
      )
    }
    const sequence = parsed.data

    const seance = sequence.seances.find((s) => s.id === seanceId)
    if (!seance) {
      return Response.json(
        { error: `Séance introuvable dans la séquence (id: ${seanceId}).` },
        { status: 404 }
      )
    }

    // Ressources produites pour les activités de la séance (version prof, types « contenu »)
    // — c'est ce qui nourrit la trace écrite et les corrections anticipées.
    const activiteResources: Record<string, RessourceStructuree[]> = {}
    for (const a of seance.activites ?? []) {
      if (!a.id) continue
      const res = getRessourcesByActivite(a.id).filter(
        (r) => r.audience === 'professeur' && PREP_CONTENT_TYPES.has(r.type),
      )
      if (res.length) activiteResources[a.id] = res
    }

    // Les textes de la séance sont dérivés des ressources réellement produites.
    // Le fallback sur les anciennes références d'activité ne sert qu'aux données
    // créées avant la migration vers les références portées par les ressources.
    const corpusIds = Array.from(new Set(
      (seance.activites ?? []).flatMap((a) => {
        const refs = a.id
          ? getRessourcesByActivite(a.id)
              .filter((r) => r.audience === 'professeur')
              .flatMap((r) => r.corpus_refs ?? [])
          : []
        return refs.length > 0 ? refs : (a.corpus_refs ?? (a.corpus_ref ? [a.corpus_ref] : []))
      })
    ))
    const corpusItems: CorpusItem[] = corpusIds
      .map((id) => getCorpusById(id))
      .filter((item): item is CorpusItem => item != null)

    const digest = buildSeanceDigest(sequence, seance, corpusItems, activiteResources)
    const checksum = computeSeanceChecksum(seance)

    const context: ResourceGenerationContext = {
      sequenceTitle: sequence.titre,
      niveau: sequence.niveau,
      theme: sequence.theme,
      seanceNumero: seance.numero,
      seanceTitle: seance.titre,
      seanceObjectifs: seance.objectifs,
      activiteTitre: 'Fiche de préparation',
      activiteType: 'exercice' as ActiviteType, // non utilisé par le type (cohérence d'interface)
      activiteConsigne: '',
      ressourceTitre: `Fiche de préparation — Séance ${seance.numero} : ${seance.titre}`,
      corpusRefs: corpusIds,
      seanceDigest: digest,
      seanceChecksum: checksum,
      modePedagogique: seance.mode_pedagogique,
      consignes: typeof consignes === 'string' ? consignes : undefined,
    }

    // TEACHER_ONLY → seule la version professeur est produite.
    const paire = await generateResourcePair({ type: 'fiche_preparation', context, provider })

    // Estampillage : rattachement séance (exclusif avec activite_id / sequence_id)
    const fiche: RessourceStructuree = {
      ...paire.professeur,
      activite_id: undefined,
      seance_id: seanceId,
      scope: 'seance',
    }

    // Persistance atomique : remplace la fiche existante (idempotent)
    const db = getDb()
    db.transaction(() => {
      deleteRessourcesBySeanceScope(seanceId, 'seance')
      saveRessource(fiche)
    })()

    return Response.json({ fiche })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de la fiche de préparation'
    console.error('[POST /api/generate/preparation]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
