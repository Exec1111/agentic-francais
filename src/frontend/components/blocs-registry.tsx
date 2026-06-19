/**
 * Registre frontend des types de ressources « à blocs ».
 *
 * Mappe un RessourceType vers son parseur + ses composants de rendu/édition.
 * Permet au ResourcePanel d'être agnostique du type : il ne câble plus
 * `fiche_questions` en dur mais consulte ce registre.
 *
 * Pour brancher un nouveau type composable : ajouter une entrée ici (et fournir
 * un `template` côté backend pour la création manuelle).
 */

import type { RessourceType } from '@/shared/schemas'
import { parseFicheBlocs } from './fiche-blocs/parse'
import { FicheBlocsRenderer } from './fiche-blocs/FicheBlocsRenderer'
import { FicheBlocsEditor } from './fiche-blocs/FicheBlocsEditor'
import { parseCoursBlocs } from './cours-blocs/parse'
import { CoursBlocsRenderer } from './cours-blocs/CoursBlocsRenderer'
import { CoursBlocsEditor } from './cours-blocs/CoursBlocsEditor'
import { parseMethodeBlocs } from './methode-blocs/parse'
import { MethodeBlocsRenderer } from './methode-blocs/MethodeBlocsRenderer'
import { MethodeBlocsEditor } from './methode-blocs/MethodeBlocsEditor'
import { parseBilanBlocs } from './bilan-blocs/parse'
import { BilanBlocsRenderer } from './bilan-blocs/BilanBlocsRenderer'
import { BilanBlocsEditor } from './bilan-blocs/BilanBlocsEditor'

/** Contenu structuré générique (chaque type a son schéma précis côté shared). */
export type BlocsContenu = Record<string, unknown>

export interface BlocResourceUI {
  /** Libellé de l'entrée « Créer vierge » pour ce type. */
  blankLabel: string
  /** Parse le contenu_json en contenu typé, ou null si incompatible. */
  parse: (contenu: unknown) => BlocsContenu | null
  /** Composant d'aperçu (lecture seule). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Renderer: React.FC<{ contenu: any; audience: 'eleve' | 'professeur' }>
  /** Composant d'édition (contrôlé). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Editor: React.FC<{ contenu: any; onChange: (next: any) => void }>
}

const REGISTRY: Partial<Record<RessourceType, BlocResourceUI>> = {
  fiche_questions: {
    blankLabel: 'Fiche vierge',
    parse: parseFicheBlocs as (c: unknown) => BlocsContenu | null,
    Renderer: FicheBlocsRenderer as BlocResourceUI['Renderer'],
    Editor: FicheBlocsEditor as BlocResourceUI['Editor'],
  },
  cours: {
    blankLabel: 'Cours vierge',
    parse: parseCoursBlocs as (c: unknown) => BlocsContenu | null,
    Renderer: CoursBlocsRenderer as BlocResourceUI['Renderer'],
    Editor: CoursBlocsEditor as BlocResourceUI['Editor'],
  },
  fiche_methode: {
    blankLabel: 'Fiche méthode vierge',
    parse: parseMethodeBlocs as (c: unknown) => BlocsContenu | null,
    Renderer: MethodeBlocsRenderer as BlocResourceUI['Renderer'],
    Editor: MethodeBlocsEditor as BlocResourceUI['Editor'],
  },
  bilan: {
    blankLabel: 'Bilan vierge',
    parse: parseBilanBlocs as (c: unknown) => BlocsContenu | null,
    Renderer: BilanBlocsRenderer as BlocResourceUI['Renderer'],
    Editor: BilanBlocsEditor as BlocResourceUI['Editor'],
  },
}

/** Retourne l'UI de blocs d'un type, ou undefined si le type n'est pas « à blocs ». */
export function getBlocResourceUI(type: RessourceType): BlocResourceUI | undefined {
  return REGISTRY[type]
}

/** Liste des types composables manuellement (pour le menu « Créer vierge »). */
export const MANUAL_BLOC_TYPES = Object.keys(REGISTRY) as RessourceType[]
