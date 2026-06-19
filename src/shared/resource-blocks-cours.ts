/**
 * Schéma des BLOCS pour les fiches de COURS (type de ressource `cours`).
 *
 * ── Principe ──────────────────────────────────────────────────────────────────
 * Comme `fiche_questions`, un cours est une LISTE de blocs hétérogènes — mais ici
 * des blocs de CONTENU (titre de section, paragraphe, définition, exemple, citation,
 * encadré, liste) plutôt que des blocs d'exercice. Le framework de rendu/édition est
 * partagé avec `fiche_questions` (voir doc/fiche-questions-blocs.md), seul le
 * vocabulaire de blocs change.
 *
 * ── Contrainte technique (IMPORTANT) ───────────────────────────────────────────
 * Même règle que pour fiche_questions : MODÈLE PLAT (un seul objet `CoursBlocSchema`
 * avec un champ `type` discriminant et TOUS les champs en `.nullable()`) pour rester
 * compatible avec les structured outputs OpenAI (`strict: true`) et Ollama.
 *
 * ── Champs par type de bloc ────────────────────────────────────────────────────
 *   titre_section → texte
 *   paragraphe    → texte
 *   definition    → terme, texte
 *   exemple       → texte
 *   citation      → texte, auteur
 *   encadre       → texte, encadre_variante, encadre_titre
 *   liste         → texte (intro optionnelle), items
 *   commun à tous → note_prof (PROF ONLY)
 */

import { z } from 'zod'
import { EncadreVarianteSchema } from './resource-blocks'

// ── Énumérations ────────────────────────────────────────────────────────────────

export const CoursBlocTypeSchema = z.enum([
  'titre_section',
  'paragraphe',
  'definition',
  'exemple',
  'citation',
  'encadre',
  'liste',
])
export type CoursBlocType = z.infer<typeof CoursBlocTypeSchema>

// ── Bloc unique (modèle plat) ────────────────────────────────────────────────────

export const CoursBlocSchema = z.object({
  id: z.string().describe('Identifiant unique court du bloc, ex: "b1", "b2"'),
  type: CoursBlocTypeSchema.describe('Type du bloc — détermine quels champs sont remplis'),

  texte: z.string().nullable().describe(
    'titre_section: le titre. paragraphe/exemple/encadre: le contenu. citation: le texte cité. definition: la définition du terme. liste: phrase d\'introduction (optionnelle). null si non pertinent.'
  ),
  terme: z.string().nullable().describe(
    'definition UNIQUEMENT: le mot ou l\'expression défini(e). null sinon.'
  ),
  auteur: z.string().nullable().describe(
    'citation UNIQUEMENT: l\'auteur / la source de la citation. null sinon.'
  ),
  items: z.array(z.string()).nullable().describe(
    'liste UNIQUEMENT: les éléments de la liste à puces. null sinon.'
  ),
  encadre_variante: EncadreVarianteSchema.nullable().describe(
    'encadre UNIQUEMENT: style du cadre (rappel/astuce/attention/exemple). null sinon.'
  ),
  encadre_titre: z.string().nullable().describe(
    'encadre UNIQUEMENT: titre court du cadre, ex "À retenir". null sinon.'
  ),

  note_prof: z.string().nullable().describe(
    'PROF ONLY: note pédagogique destinée au professeur (conseil, point de vigilance). Masquée dans la version élève. null si absente.'
  ),
})
export type CoursBloc = z.infer<typeof CoursBlocSchema>

// ── Contenu complet d\'un cours ────────────────────────────────────────────────────

export const CoursContenuSchema = z.object({
  titre: z.string().describe('Titre du cours, ex: "La poésie lyrique"'),
  introduction: z.string().nullable().describe('Chapeau introductif court affiché en tête, null si inutile'),
  blocs: z.array(CoursBlocSchema).min(2).max(30).describe('Liste ordonnée des blocs de contenu du cours'),
  note_prof_globale: z.string().nullable().describe('PROF ONLY: synthèse pédagogique globale (déroulé conseillé, prérequis…). null si absente.'),
})
export type CoursContenu = z.infer<typeof CoursContenuSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Champs PROF ONLY retirés (mis à null) dans la version élève. */
export const COURS_BLOC_CHAMPS_PROF: (keyof CoursBloc)[] = ['note_prof']

/** Produit une copie d\'un bloc sans les champs PROF ONLY (pour la version élève). */
export function stripCoursBlocProf(bloc: CoursBloc): CoursBloc {
  return { ...bloc, note_prof: null }
}

/** Crée un bloc vide d\'un type donné (utilisé par l\'éditeur frontend). */
export function createEmptyCoursBloc(type: CoursBlocType, id: string): CoursBloc {
  const base: CoursBloc = {
    id,
    type,
    texte: null,
    terme: null,
    auteur: null,
    items: null,
    encadre_variante: null,
    encadre_titre: null,
    note_prof: null,
  }

  switch (type) {
    case 'titre_section':
      return { ...base, texte: '' }
    case 'paragraphe':
      return { ...base, texte: '' }
    case 'definition':
      return { ...base, terme: '', texte: '' }
    case 'exemple':
      return { ...base, texte: '' }
    case 'citation':
      return { ...base, texte: '', auteur: '' }
    case 'encadre':
      return { ...base, texte: '', encadre_variante: 'rappel', encadre_titre: 'À retenir' }
    case 'liste':
      return { ...base, texte: null, items: ['', ''] }
    default:
      return base
  }
}

/** Champs pertinents par type de bloc (tout le reste doit être null). */
const COURS_BLOC_CHAMPS_PAR_TYPE: Record<CoursBlocType, (keyof CoursBloc)[]> = {
  titre_section: ['id', 'type', 'texte', 'note_prof'],
  paragraphe: ['id', 'type', 'texte', 'note_prof'],
  definition: ['id', 'type', 'terme', 'texte', 'note_prof'],
  exemple: ['id', 'type', 'texte', 'note_prof'],
  citation: ['id', 'type', 'texte', 'auteur', 'note_prof'],
  encadre: ['id', 'type', 'texte', 'encadre_variante', 'encadre_titre', 'note_prof'],
  liste: ['id', 'type', 'texte', 'items', 'note_prof'],
}

/**
 * Nettoie un bloc en mettant à null tous les champs qui ne sont PAS pertinents
 * pour son type (sécurité contre les hallucinations du LLM qui remplit tous les
 * champs du modèle plat).
 */
export function sanitizeCoursBloc(bloc: CoursBloc): CoursBloc {
  const allowed = new Set(COURS_BLOC_CHAMPS_PAR_TYPE[bloc.type])
  const cleaned = { ...bloc } as Record<string, unknown>
  for (const key of Object.keys(cleaned)) {
    if (!allowed.has(key as keyof CoursBloc)) cleaned[key] = null
  }
  return cleaned as CoursBloc
}

/** Nettoie tous les blocs d'un cours. */
export function sanitizeCoursBlocs(contenu: CoursContenu): CoursContenu {
  return { ...contenu, blocs: contenu.blocs.map(sanitizeCoursBloc) }
}

/** Libellés UI des types de blocs. */
export const COURS_BLOC_LABELS: Record<CoursBlocType, string> = {
  titre_section: 'Titre de section',
  paragraphe: 'Paragraphe',
  definition: 'Définition',
  exemple: 'Exemple',
  citation: 'Citation',
  encadre: 'Encadré',
  liste: 'Liste',
}

/**
 * Template (squelette) d'un cours vierge — sert à amorcer la création manuelle ET
 * à guider la structure attendue par le LLM. Respecte la contrainte min(2) blocs.
 */
export function createBlankCoursContenu(): CoursContenu {
  return {
    titre: 'Nouveau cours',
    introduction: null,
    note_prof_globale: null,
    blocs: [
      createEmptyCoursBloc('titre_section', 'b1'),
      createEmptyCoursBloc('paragraphe', 'b2'),
    ],
  }
}
