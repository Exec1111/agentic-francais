/**
 * Schéma des BLOCS pour les fiches MÉTHODE (type de ressource `fiche_methode`).
 *
 * Même famille « document par blocs » que `cours` (framework de rendu/édition
 * partagé). Bloc caractéristique : `etape` (étape numérotée d'une méthode).
 *
 * ── Champs par type de bloc ────────────────────────────────────────────────────
 *   titre_section → texte
 *   etape         → titre, texte               (NUMÉROTÉ : 1, 2, 3…)
 *   paragraphe    → texte
 *   exemple       → texte
 *   encadre       → texte, encadre_variante, encadre_titre
 *   liste         → texte (intro optionnelle), items
 *   commun à tous → note_prof (PROF ONLY)
 */

import { z } from 'zod'
import { EncadreVarianteSchema } from './resource-blocks'

// ── Énumérations ────────────────────────────────────────────────────────────────

export const MethodeBlocTypeSchema = z.enum([
  'titre_section',
  'etape',
  'paragraphe',
  'exemple',
  'encadre',
  'liste',
])
export type MethodeBlocType = z.infer<typeof MethodeBlocTypeSchema>

/** Seul `etape` est numéroté (1, 2, 3…) dans les renderers. */
export const METHODE_NUMBERED_TYPES: MethodeBlocType[] = ['etape']
export function isMethodeEtape(type: MethodeBlocType): boolean {
  return METHODE_NUMBERED_TYPES.includes(type)
}

// ── Bloc unique (modèle plat) ────────────────────────────────────────────────────

export const MethodeBlocSchema = z.object({
  id: z.string().describe('Identifiant unique court du bloc, ex: "b1", "b2"'),
  type: MethodeBlocTypeSchema.describe('Type du bloc — détermine quels champs sont remplis'),

  titre: z.string().nullable().describe(
    'etape UNIQUEMENT: titre court de l\'étape (ex: "Lire et comprendre le sujet"). null sinon.'
  ),
  texte: z.string().nullable().describe(
    'titre_section: le titre. etape: la description de l\'étape. paragraphe/exemple/encadre: le contenu. liste: phrase d\'introduction (optionnelle). null si non pertinent.'
  ),
  items: z.array(z.string()).nullable().describe(
    'liste UNIQUEMENT: les éléments de la liste à puces. null sinon.'
  ),
  encadre_variante: EncadreVarianteSchema.nullable().describe(
    'encadre UNIQUEMENT: style du cadre (rappel/astuce/attention/exemple). null sinon.'
  ),
  encadre_titre: z.string().nullable().describe(
    'encadre UNIQUEMENT: titre court du cadre, ex "Astuce", "Attention". null sinon.'
  ),

  note_prof: z.string().nullable().describe(
    'PROF ONLY: note pédagogique destinée au professeur. Masquée dans la version élève. null si absente.'
  ),
})
export type MethodeBloc = z.infer<typeof MethodeBlocSchema>

// ── Contenu complet d\'une fiche méthode ───────────────────────────────────────────

export const MethodeContenuSchema = z.object({
  titre: z.string().describe('Titre de la méthode, ex: "Rédiger un paragraphe argumenté"'),
  objectif: z.string().nullable().describe('Objectif / à quoi sert cette méthode, affiché en tête. null si inutile'),
  blocs: z.array(MethodeBlocSchema).min(2).max(30).describe('Liste ordonnée des blocs (dont les étapes)'),
  note_prof_globale: z.string().nullable().describe('PROF ONLY: conseils de mise en œuvre. null si absente.'),
})
export type MethodeContenu = z.infer<typeof MethodeContenuSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────────

export const METHODE_BLOC_CHAMPS_PROF: (keyof MethodeBloc)[] = ['note_prof']

export function stripMethodeBlocProf(bloc: MethodeBloc): MethodeBloc {
  return { ...bloc, note_prof: null }
}

export function createEmptyMethodeBloc(type: MethodeBlocType, id: string): MethodeBloc {
  const base: MethodeBloc = {
    id,
    type,
    titre: null,
    texte: null,
    items: null,
    encadre_variante: null,
    encadre_titre: null,
    note_prof: null,
  }

  switch (type) {
    case 'titre_section':
      return { ...base, texte: '' }
    case 'etape':
      return { ...base, titre: '', texte: '' }
    case 'paragraphe':
      return { ...base, texte: '' }
    case 'exemple':
      return { ...base, texte: '' }
    case 'encadre':
      return { ...base, texte: '', encadre_variante: 'astuce', encadre_titre: 'Astuce' }
    case 'liste':
      return { ...base, texte: null, items: ['', ''] }
    default:
      return base
  }
}

const METHODE_BLOC_CHAMPS_PAR_TYPE: Record<MethodeBlocType, (keyof MethodeBloc)[]> = {
  titre_section: ['id', 'type', 'texte', 'note_prof'],
  etape: ['id', 'type', 'titre', 'texte', 'note_prof'],
  paragraphe: ['id', 'type', 'texte', 'note_prof'],
  exemple: ['id', 'type', 'texte', 'note_prof'],
  encadre: ['id', 'type', 'texte', 'encadre_variante', 'encadre_titre', 'note_prof'],
  liste: ['id', 'type', 'texte', 'items', 'note_prof'],
}

export function sanitizeMethodeBloc(bloc: MethodeBloc): MethodeBloc {
  const allowed = new Set(METHODE_BLOC_CHAMPS_PAR_TYPE[bloc.type])
  const cleaned = { ...bloc } as Record<string, unknown>
  for (const key of Object.keys(cleaned)) {
    if (!allowed.has(key as keyof MethodeBloc)) cleaned[key] = null
  }
  return cleaned as MethodeBloc
}

export function sanitizeMethodeBlocs(contenu: MethodeContenu): MethodeContenu {
  return { ...contenu, blocs: contenu.blocs.map(sanitizeMethodeBloc) }
}

export const METHODE_BLOC_LABELS: Record<MethodeBlocType, string> = {
  titre_section: 'Titre de section',
  etape: 'Étape',
  paragraphe: 'Paragraphe',
  exemple: 'Exemple',
  encadre: 'Encadré',
  liste: 'Liste',
}

/** Template (squelette) d'une fiche méthode vierge — amorce la création manuelle. */
export function createBlankMethodeContenu(): MethodeContenu {
  return {
    titre: 'Nouvelle méthode',
    objectif: null,
    note_prof_globale: null,
    blocs: [
      createEmptyMethodeBloc('etape', 'b1'),
      createEmptyMethodeBloc('etape', 'b2'),
    ],
  }
}
