/**
 * Schéma des BLOCS pour les fiches de questions (type de ressource `fiche_questions`).
 *
 * ── Principe ──────────────────────────────────────────────────────────────────
 * Une fiche est une LISTE de blocs hétérogènes (consigne, QCM, texte à trous…).
 * Chaque bloc est rendu par un composant React dédié (côté élève ET prof) et
 * éditable via un mini-formulaire dédié.
 *
 * ── Contrainte technique (IMPORTANT) ───────────────────────────────────────────
 * Le provider LLM utilise OpenAI structured outputs avec `strict: true` (et Ollama).
 * Les unions discriminées (anyOf) sont fragiles en mode strict. On utilise donc
 * un MODÈLE PLAT : un seul objet `BlocSchema` avec un champ `type` discriminant
 * et TOUS les champs en `.nullable()` (jamais `.optional()`).
 * → Pour chaque `type`, seuls certains champs sont renseignés (voir tableau ci-dessous).
 *
 * ── Champs par type de bloc ────────────────────────────────────────────────────
 *   consigne          → texte
 *   encadre           → texte, encadre_variante, encadre_titre
 *   qcm               → question, propositions, bonnes_reponses (PROF), explication (PROF)
 *   texte_a_trous     → texte_lacunaire, banque_mots, reponses_trous (PROF)
 *   question_ouverte  → enonce, lignes_reponse, reponse_attendue (PROF)
 *   commun à tous     → difficulte (nullable), aide (nullable)
 *
 * ── Champs PROF ONLY ───────────────────────────────────────────────────────────
 * bonnes_reponses, explication, reponses_trous, reponse_attendue sont retirés
 * (mis à null) dans la version élève via toStudentVersion().
 *
 * Pour AJOUTER un nouveau type de bloc, voir doc/fiche-questions-blocs.md.
 */

import { z } from 'zod'

// ── Énumérations ────────────────────────────────────────────────────────────────

export const BlocTypeSchema = z.enum([
  'consigne',
  'encadre',
  'qcm',
  'texte_a_trous',
  'question_ouverte',
])
export type BlocType = z.infer<typeof BlocTypeSchema>

export const EncadreVarianteSchema = z.enum(['rappel', 'astuce', 'attention', 'exemple'])
export type EncadreVariante = z.infer<typeof EncadreVarianteSchema>

export const DifficulteSchema = z.enum(['facile', 'moyen', 'difficile'])
export type Difficulte = z.infer<typeof DifficulteSchema>

// ── Bloc unique (modèle plat) ────────────────────────────────────────────────────

export const BlocSchema = z.object({
  id: z.string().describe('Identifiant unique court du bloc, ex: "b1", "b2", "b3"'),
  type: BlocTypeSchema.describe('Type du bloc — détermine quels champs sont remplis'),

  // ── consigne & encadre ──
  texte: z.string().nullable().describe(
    'consigne: instruction adressée à l\'élève. encadre: contenu du cadre. null pour les autres types.'
  ),
  encadre_variante: EncadreVarianteSchema.nullable().describe(
    'encadre UNIQUEMENT: style du cadre (rappel/astuce/attention/exemple). null sinon.'
  ),
  encadre_titre: z.string().nullable().describe(
    'encadre UNIQUEMENT: titre court du cadre, ex "Rappel", "À retenir". null sinon.'
  ),

  // ── qcm ──
  question: z.string().nullable().describe('qcm UNIQUEMENT: énoncé de la question. null sinon.'),
  propositions: z.array(z.string()).nullable().describe(
    'qcm UNIQUEMENT: liste des choix proposés (2 à 5 items). null sinon.'
  ),
  bonnes_reponses: z.array(z.number()).nullable().describe(
    'PROF ONLY — qcm UNIQUEMENT: index (base 0) des bonnes propositions. Peut en contenir plusieurs. null sinon.'
  ),
  explication: z.string().nullable().describe(
    'PROF ONLY — qcm UNIQUEMENT: explication pédagogique de la bonne réponse. null sinon.'
  ),

  // ── texte_a_trous ──
  texte_lacunaire: z.string().nullable().describe(
    'texte_a_trous UNIQUEMENT: texte avec les trous notés [1], [2], [3]… aux emplacements à compléter. null sinon.'
  ),
  banque_mots: z.array(z.string()).nullable().describe(
    'texte_a_trous UNIQUEMENT: boîte à mots (mélangés) pour aider l\'élève. null si pas de boîte à mots.'
  ),
  reponses_trous: z.array(z.string()).nullable().describe(
    'PROF ONLY — texte_a_trous UNIQUEMENT: réponses dans l\'ordre des numéros [1], [2]… null sinon.'
  ),

  // ── question_ouverte ──
  enonce: z.string().nullable().describe('question_ouverte UNIQUEMENT: la question posée. null sinon.'),
  lignes_reponse: z.number().nullable().describe(
    'question_ouverte UNIQUEMENT: nombre de lignes vides à laisser pour répondre (entre 3 et 8). null sinon.'
  ),
  reponse_attendue: z.string().nullable().describe(
    'PROF ONLY — question_ouverte UNIQUEMENT: éléments de réponse attendus. null sinon.'
  ),

  // ── commun à tous les blocs d\'exercice ──
  difficulte: DifficulteSchema.nullable().describe(
    'Niveau de difficulté du bloc (facile/moyen/difficile). null pour consigne et encadre.'
  ),
  aide: z.string().nullable().describe(
    'Indice optionnel affiché dans une bulle "Besoin d\'aide ?". null si pas d\'aide.'
  ),
})
export type Bloc = z.infer<typeof BlocSchema>

// ── Contenu complet d\'une fiche de questions ─────────────────────────────────────

export const FicheQuestionsContenuSchema = z.object({
  objectif: z.string().describe('Compétence visée, ex: "Identifier les figures de style"'),
  introduction: z.string().nullable().describe('Mise en contexte courte affichée en tête, null si inutile'),
  blocs: z.array(BlocSchema).min(2).max(20).describe('Liste ordonnée des blocs de la fiche'),
  duree_estimee: z.number().nullable().describe('Durée estimée en minutes, null si non pertinent'),
})
export type FicheQuestionsContenu = z.infer<typeof FicheQuestionsContenuSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Champs PROF ONLY retirés (mis à null) dans la version élève. */
export const BLOC_CHAMPS_PROF: (keyof Bloc)[] = [
  'bonnes_reponses',
  'explication',
  'reponses_trous',
  'reponse_attendue',
]

/** Produit une copie d\'un bloc sans les champs PROF ONLY (pour la version élève). */
export function stripBlocProf(bloc: Bloc): Bloc {
  return {
    ...bloc,
    bonnes_reponses: null,
    explication: null,
    reponses_trous: null,
    reponse_attendue: null,
  }
}

/** Crée un bloc vide d\'un type donné (utilisé par l\'éditeur frontend). */
export function createEmptyBloc(type: BlocType, id: string): Bloc {
  const base: Bloc = {
    id,
    type,
    texte: null,
    encadre_variante: null,
    encadre_titre: null,
    question: null,
    propositions: null,
    bonnes_reponses: null,
    explication: null,
    texte_lacunaire: null,
    banque_mots: null,
    reponses_trous: null,
    enonce: null,
    lignes_reponse: null,
    reponse_attendue: null,
    difficulte: null,
    aide: null,
  }

  switch (type) {
    case 'consigne':
      return { ...base, texte: '' }
    case 'encadre':
      return { ...base, texte: '', encadre_variante: 'rappel', encadre_titre: 'Rappel' }
    case 'qcm':
      return { ...base, question: '', propositions: ['', ''], bonnes_reponses: [0], difficulte: 'facile' }
    case 'texte_a_trous':
      return { ...base, texte_lacunaire: '', banque_mots: null, reponses_trous: [], difficulte: 'facile' }
    case 'question_ouverte':
      return { ...base, enonce: '', lignes_reponse: 4, reponse_attendue: '', difficulte: 'moyen' }
    default:
      return base
  }
}

/** Champs pertinents par type de bloc (tout le reste doit être null). */
const BLOC_CHAMPS_PAR_TYPE: Record<BlocType, (keyof Bloc)[]> = {
  consigne: ['id', 'type', 'texte', 'difficulte', 'aide'],
  encadre: ['id', 'type', 'texte', 'encadre_variante', 'encadre_titre', 'difficulte', 'aide'],
  qcm: ['id', 'type', 'question', 'propositions', 'bonnes_reponses', 'explication', 'difficulte', 'aide'],
  texte_a_trous: ['id', 'type', 'texte_lacunaire', 'banque_mots', 'reponses_trous', 'difficulte', 'aide'],
  question_ouverte: ['id', 'type', 'enonce', 'lignes_reponse', 'reponse_attendue', 'difficulte', 'aide'],
}

/**
 * Nettoie un bloc en mettant à null tous les champs qui ne sont PAS pertinents
 * pour son type. C'est une sécurité contre les hallucinations du LLM qui remplit
 * tous les champs du schéma plat au lieu de ne remplir que ceux du type.
 */
export function sanitizeBloc(bloc: Bloc): Bloc {
  const allowed = new Set(BLOC_CHAMPS_PAR_TYPE[bloc.type])
  const cleaned = { ...bloc } as Record<string, unknown>
  for (const key of Object.keys(cleaned)) {
    if (!allowed.has(key as keyof Bloc)) {
      cleaned[key] = null
    }
  }
  return cleaned as Bloc
}

/** Nettoie tous les blocs d'une fiche. */
export function sanitizeFicheBlocs(fiche: FicheQuestionsContenu): FicheQuestionsContenu {
  return {
    ...fiche,
    blocs: fiche.blocs.map(sanitizeBloc),
  }
}

/** Libellés UI des types de blocs. */
export const BLOC_LABELS: Record<BlocType, string> = {
  consigne: 'Consigne',
  encadre: 'Encadré',
  qcm: 'QCM',
  texte_a_trous: 'Texte à trous',
  question_ouverte: 'Question ouverte',
}
