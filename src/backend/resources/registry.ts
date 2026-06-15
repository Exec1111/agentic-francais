/**
 * Registre central des types de ressources pédagogiques.
 *
 * Pour ajouter un nouveau type :
 *   1. Créer src/backend/resources/types/mon-type.ts (implémenter ResourceTypeDefinition)
 *   2. L'importer ici et l'ajouter à RESOURCE_REGISTRY
 *   Voir doc/resource-types.md pour le guide complet.
 */

import { z } from 'zod'
import type { RessourceType } from '@/shared/schemas'
import type { LLMMessage } from '@/backend/llm-provider'
import type { CorpusItem } from '@/shared/schemas'

// ── Types d'activités ──────────────────────────────────────────────────────────

export type ActiviteType =
  | 'exercice'
  | 'production_ecrite'
  | 'debat'
  | 'lecture'
  | 'oral'
  | 'evaluation'
  | 'collaboration'
  | 'recherche'

// ── Contexte transmis au buildPrompt ──────────────────────────────────────────

export interface ResourceGenerationContext {
  sequenceTitle: string
  niveau: string
  theme: string
  seanceNumero: number
  seanceTitle: string
  activiteId?: string
  activiteTitre: string
  activiteType: ActiviteType
  activiteConsigne: string
  ressourceTitre: string
  corpusItem?: CorpusItem | null
  /** Tous les textes liés à l'activité (comparaison, activités multi-supports). */
  corpusItems?: CorpusItem[]

  // ── Contexte pédagogique enrichi (optionnel — transmis par le frontend) ────
  /** Problématique de la séquence */
  sequenceProblematique?: string
  /** Objectifs généraux de la séquence */
  sequenceObjectifs?: string[]
  /** Compétences travaillées dans la séquence */
  sequenceCompetences?: string[]
  /** Objectifs de la séance en cours */
  seanceObjectifs?: string[]
  /** Durée de l'activité en minutes */
  activiteDuree?: number
  /** Progression complète : toutes les séances de la séquence dans l'ordre */
  progression?: { numero: number; titre: string }[]
  /** Autres activités de la même séance (pour éviter les doublons) */
  autresActivites?: { titre: string; type: string; duree?: number }[]
  /**
   * Instructions complémentaires libres saisies par le professeur au moment de
   * la génération (portée : cette génération uniquement, non persistées).
   * Injectées en priorité dans le prompt via buildContextePedagogique.
   */
  consignes?: string
}

// ── Interface à implémenter pour chaque type ───────────────────────────────────

export interface ResourceTypeDefinition<T extends Record<string, unknown>> {
  /** Identifiant unique du type (snake_case, doit correspondre à RessourceTypeSchema) */
  type: RessourceType

  /** Libellé affiché dans l'UI */
  label: string

  /**
   * TWO_VERSIONS : génère une version élève ET une version professeur.
   * TEACHER_ONLY : un seul document, à destination du professeur.
   */
  category: 'TWO_VERSIONS' | 'TEACHER_ONLY'

  /** Schéma Zod du document complet (version professeur, tous champs inclus). */
  schema: z.ZodSchema<T>

  /**
   * Transforme le document complet en version élève.
   * Obligatoire si category === 'TWO_VERSIONS'.
   * Doit retirer tous les champs marqués PROF ONLY dans le schéma.
   */
  toStudentVersion?: (full: T) => Partial<T>

  /**
   * Construit les messages LLM à envoyer.
   * Le système de génération injecte automatiquement le schéma JSON (structured outputs).
   */
  buildPrompt: (context: ResourceGenerationContext) => LLMMessage[]

  /**
   * Post-traitement appliqué APRÈS validation de la sortie LLM, AVANT la
   * dérivation des versions prof/élève. Permet d'injecter par code des données
   * de référence (ex : texte corpus exact) plutôt que de les faire recopier
   * par le LLM — garantie de fidélité absolue.
   */
  postProcess?: (full: T, context: ResourceGenerationContext) => T

  /**
   * Renderers Markdown.
   * - 'professeur' : toujours requis
   * - 'eleve' : requis si category === 'TWO_VERSIONS'
   */
  toMarkdown: {
    professeur: (resource: T) => string
    eleve?: (resource: Partial<T>) => string
  }

  /**
   * Types d'activités pour lesquels cette ressource est proposée automatiquement
   * lors de la validation d'une activité.
   */
  suggestedFor: ActiviteType[]

  /** Instructions supplémentaires pour le prompt système (optionnel). */
  systemPromptAddendum?: string
}

// ── Imports des définitions de types ──────────────────────────────────────────

import { ficheQuestionsDefinition } from './types/fiche-questions'
import { extraitOeuvreDefinition } from './types/extrait-oeuvre'

// ── Registre ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RESOURCE_REGISTRY: ResourceTypeDefinition<any>[] = [
  ficheQuestionsDefinition,
  extraitOeuvreDefinition,
  // Ajouter les nouveaux types ici dans l'ordre souhaité d'affichage UI
]

export const RESOURCE_REGISTRY_MAP = new Map<RessourceType, ResourceTypeDefinition<any>>(
  RESOURCE_REGISTRY.map((def) => [def.type, def])
)

/** Récupère la définition d'un type de ressource. Retourne undefined si non enregistré. */
export function getResourceDefinition(type: RessourceType): ResourceTypeDefinition<any> | undefined {
  return RESOURCE_REGISTRY_MAP.get(type)
}

/** Liste tous les types enregistrés avec leur label. */
export function listResourceTypes(): { type: RessourceType; label: string; category: string }[] {
  return RESOURCE_REGISTRY.map((def) => ({
    type: def.type,
    label: def.label,
    category: def.category,
  }))
}

/**
 * Retourne les types de ressources suggérés pour un type d'activité.
 * Utilisé pour proposer automatiquement des ressources lors de la validation d'une activité.
 */
export function getSuggestedResourceTypes(activiteType: ActiviteType): RessourceType[] {
  return RESOURCE_REGISTRY
    .filter((def) => def.suggestedFor.includes(activiteType))
    .map((def) => def.type)
}
