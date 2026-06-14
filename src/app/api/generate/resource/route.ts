import { NextRequest } from 'next/server'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { generateResourcePair } from '@/backend/resources/generator'
import { saveRessourcePaire } from '@/backend/repositories/resource-repo'
import { getSuggestedResourceTypes } from '@/backend/resources/registry'
import { RessourceTypeSchema } from '@/shared/schemas'
import type { ResourceGenerationContext, ActiviteType } from '@/backend/resources/registry'

/**
 * POST /api/generate/resource
 *
 * Génère une paire de ressources structurées (version professeur + version élève).
 * Un seul appel LLM produit les deux versions cohérentes.
 *
 * Body :
 * {
 *   // Contexte pédagogique
 *   sequenceTitle:   string
 *   niveau:          string
 *   theme:           string
 *   seanceNumero:    number
 *   seanceTitle:     string
 *   activiteId?:     string   — si fourni, les ressources sont sauvegardées en DB
 *   activiteTitre:   string
 *   activiteType:    ActiviteType
 *   activiteConsigne: string
 *
 *   // Ressource à générer
 *   ressourceType:   RessourceType
 *   ressourceTitre:  string
 *
 *   // Contexte pédagogique enrichi (optionnel — améliore l'ancrage des prompts)
 *   sequenceProblematique?: string
 *   sequenceObjectifs?:     string[]
 *   sequenceCompetences?:   string[]
 *   seanceObjectifs?:       string[]
 *   activiteDuree?:         number    — minutes
 *   progression?:           { numero: number; titre: string }[]
 *   autresActivites?:       { titre: string; type: string; duree?: number }[]
 *
 *   // Corpus optionnel
 *   corpus_ref?:     string   — ID d'un texte dans la table corpus
 *
 *   // Provider LLM
 *   provider?:       'openai' | 'ollama'
 * }
 *
 * Réponse :
 * {
 *   professeur: RessourceStructuree
 *   eleve?:     RessourceStructuree   — absent pour les types TEACHER_ONLY
 * }
 *
 * GET /api/generate/resource?activiteType=exercice
 *
 * Retourne les types de ressources suggérés pour un type d'activité.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteId,
      activiteTitre,
      activiteType,
      activiteConsigne,
      ressourceType,
      ressourceTitre,
      corpus_ref,
      provider,
      // Contexte pédagogique enrichi (optionnel)
      sequenceProblematique,
      sequenceObjectifs,
      sequenceCompetences,
      seanceObjectifs,
      activiteDuree,
      progression,
      autresActivites,
      consignes,
    } = body

    // Validation minimale
    if (!ressourceType || !ressourceTitre) {
      return Response.json(
        { error: 'Les champs ressourceType et ressourceTitre sont requis.' },
        { status: 400 }
      )
    }

    const typeValidation = RessourceTypeSchema.safeParse(ressourceType)
    if (!typeValidation.success) {
      return Response.json(
        { error: `Type de ressource inconnu : "${ressourceType}"` },
        { status: 400 }
      )
    }

    // Résolution corpus (si fourni)
    const corpusItem = corpus_ref ? getCorpusById(corpus_ref) : null

    // Vérification corpus obligatoire pour extrait_oeuvre
    if (ressourceType === 'extrait_oeuvre' && !corpusItem) {
      const detail = corpus_ref
        ? `Texte introuvable dans le corpus (id: ${corpus_ref}). Vérifiez que le texte est bien chargé.`
        : `Le type "extrait_oeuvre" nécessite un texte au programme. Associez un corpus avant de générer.`
      return Response.json({ error: detail }, { status: 422 })
    }

    // Construction du contexte de génération
    const context: ResourceGenerationContext = {
      sequenceTitle: sequenceTitle || '',
      niveau: niveau || '5e',
      theme: theme || '',
      seanceNumero: seanceNumero || 1,
      seanceTitle: seanceTitle || '',
      activiteId: activiteId || undefined,
      activiteTitre: activiteTitre || ressourceTitre,
      activiteType: (activiteType || 'exercice') as ActiviteType,
      activiteConsigne: activiteConsigne || '',
      ressourceTitre,
      corpusItem,
      // Contexte enrichi — transmis tel quel s'il est présent et bien formé
      sequenceProblematique: typeof sequenceProblematique === 'string' ? sequenceProblematique : undefined,
      sequenceObjectifs: Array.isArray(sequenceObjectifs) ? sequenceObjectifs : undefined,
      sequenceCompetences: Array.isArray(sequenceCompetences) ? sequenceCompetences : undefined,
      seanceObjectifs: Array.isArray(seanceObjectifs) ? seanceObjectifs : undefined,
      activiteDuree: typeof activiteDuree === 'number' ? activiteDuree : undefined,
      progression: Array.isArray(progression) ? progression : undefined,
      autresActivites: Array.isArray(autresActivites) ? autresActivites : undefined,
      consignes: typeof consignes === 'string' ? consignes : undefined,
    }

    // Génération (un seul appel LLM → deux versions)
    const paire = await generateResourcePair({
      type: typeValidation.data,
      context,
      provider,
    })

    // Sauvegarde en DB si une activité est liée
    // Isolation dans un try/catch : un échec de persistance (ex : activite_id
    // absent de la DB car séquence pas encore sauvegardée) ne doit PAS faire
    // échouer la génération — la ressource est retournée au client dans tous les cas.
    if (activiteId) {
      try {
        saveRessourcePaire(paire)
      } catch (saveErr) {
        console.warn('[resource] Persistance DB ignorée (activite_id introuvable en DB) :', saveErr)
      }
    }

    return Response.json(paire)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne lors de la génération'
    console.error('[POST /api/generate/resource]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activiteType = searchParams.get('activiteType') as ActiviteType | null

  if (!activiteType) {
    return Response.json(
      { error: 'Le paramètre activiteType est requis.' },
      { status: 400 }
    )
  }

  const suggestions = getSuggestedResourceTypes(activiteType)
  return Response.json({ suggestions })
}
