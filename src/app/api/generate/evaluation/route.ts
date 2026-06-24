import { NextRequest } from 'next/server'
import { getDb } from '@/backend/db'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { generateResourcePair } from '@/backend/resources/generator'
import { buildSequenceDigest } from '@/backend/resources/prompt-context'
import {
  getRessourcesByActivite,
  saveRessourcePaire,
  saveRessource,
  deleteRessourcesBySequenceScope,
} from '@/backend/repositories/resource-repo'
import { SequenceSchema } from '@/shared/schemas'
import type { ResourceGenerationContext, ActiviteType } from '@/backend/resources/registry'
import type { CorpusItem, RessourceStructuree, RessourceType } from '@/shared/schemas'

/**
 * Types de ressources dont le CONTENU nourrit l'évaluation : cours (notions) et
 * exercices/fiches (format des questions). On exclut les types redondants ou
 * méta : extrait_oeuvre/oeuvre_complete (texte déjà dans le corpus), grille_evaluation
 * et evaluation_sommative (méta-évaluation), dictee.
 */
const EVAL_CONTENT_TYPES = new Set<RessourceType>([
  'cours', 'fiche_questions', 'fiche_methode', 'bilan', 'fiche_lecture', 'carte_mentale',
])

/**
 * POST /api/generate/evaluation
 *
 * Génère, en une opération, le bundle « évaluation finale » d'une séquence :
 *   A. Sujet d'évaluation — version élève
 *   B. Sujet d'évaluation — version professeur (barème + corrigé intégrés)
 *   C. Grille + Q/R d'autoévaluation — version élève uniquement
 *
 * Génération CHAÎNÉE : le sujet est généré d'abord, puis injecté dans la génération
 * de la grille pour aligner l'autocontrôle sur les questions réellement posées.
 *
 * Body : { sequenceId: string, sequence: Sequence, provider?, consignes? }
 * Réponse : { sujet: { professeur, eleve }, grille: { eleve } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sequenceId, sequence: rawSequence, provider, consignes } = body

    if (!sequenceId || typeof sequenceId !== 'string') {
      return Response.json(
        { error: 'sequenceId est requis (la séquence doit être sauvegardée avant de générer l\'évaluation finale).' },
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

    // Résolution du corpus de la séquence (textes étudiés → support possible)
    const corpusItems: CorpusItem[] = (sequence.corpus_refs ?? [])
      .map((id) => getCorpusById(id))
      .filter((item): item is CorpusItem => item != null)

    // Ressources produites en classe (version prof, types « contenu ») — pour que
    // l'évaluation puise dans les cours et imite les exercices réellement travaillés.
    const activiteResources: Record<string, RessourceStructuree[]> = {}
    for (const seance of sequence.seances) {
      for (const a of seance.activites ?? []) {
        if (!a.id) continue
        const res = getRessourcesByActivite(a.id).filter(
          (r) => r.audience === 'professeur' && EVAL_CONTENT_TYPES.has(r.type),
        )
        if (res.length) activiteResources[a.id] = res
      }
    }

    const digest = buildSequenceDigest(sequence, corpusItems, activiteResources)

    // Contexte de base partagé (les types évaluation finale n'utilisent que le digest,
    // ressourceTitre, sujetGenere, evaluationFinale et consignes — le reste est rempli
    // par cohérence avec l'interface).
    const baseCtx: ResourceGenerationContext = {
      sequenceTitle: sequence.titre,
      niveau: sequence.niveau,
      theme: sequence.theme,
      seanceNumero: 0,
      seanceTitle: 'Évaluation finale',
      activiteTitre: 'Évaluation finale',
      activiteType: 'evaluation' as ActiviteType,
      activiteConsigne: sequence.evaluation_finale ?? '',
      ressourceTitre: `Évaluation finale — ${sequence.titre}`,
      sequenceDigest: digest,
      consignes: typeof consignes === 'string' ? consignes : undefined,
    }

    // ── Étape 1 : sujet d'évaluation (A + B) ──────────────────────────────────
    const paireSujet = await generateResourcePair({
      type: 'evaluation_sommative',
      context: { ...baseCtx, ressourceTitre: `Sujet — ${sequence.titre}` },
      provider,
    })

    // ── Étape 2 : grille + autoévaluation, alignée sur le sujet (C) ───────────
    const paireGrille = await generateResourcePair({
      type: 'grille_evaluation',
      context: {
        ...baseCtx,
        ressourceTitre: `Autoévaluation — ${sequence.titre}`,
        sujetGenere: paireSujet.professeur.contenu_json,
        evaluationFinale: true,
      },
      provider,
    })

    if (!paireSujet.eleve || !paireGrille.eleve) {
      // Les deux types sont TWO_VERSIONS → la version élève doit exister.
      return Response.json(
        { error: 'Génération incomplète : version élève manquante.' },
        { status: 500 }
      )
    }

    // ── Estampillage : rattachement séquence ──────────────────────────────────
    const stamp = (r: RessourceStructuree): RessourceStructuree => ({
      ...r,
      activite_id: undefined,
      sequence_id: sequenceId,
      scope: 'evaluation_finale',
    })

    const sujetProf = stamp(paireSujet.professeur)
    const sujetEleve = stamp(paireSujet.eleve)
    // La version prof de la grille n'est pas persistée → on retire paired_with
    // (sinon FK violée : référence vers une ressource jamais insérée).
    const grilleEleve = { ...stamp(paireGrille.eleve), paired_with: undefined }

    // ── Persistance ATOMIQUE (remplace le bundle existant) ────────────────────
    const db = getDb()
    db.transaction(() => {
      deleteRessourcesBySequenceScope(sequenceId, 'evaluation_finale')
      saveRessourcePaire({ professeur: sujetProf, eleve: sujetEleve })
      saveRessource(grilleEleve)
    })()

    return Response.json({
      sujet: { professeur: sujetProf, eleve: sujetEleve },
      grille: { eleve: grilleEleve },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de l\'évaluation finale'
    console.error('[POST /api/generate/evaluation]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
