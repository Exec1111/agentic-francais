/**
 * Schéma des BLOCS pour les BILANS (type de ressource `bilan`).
 *
 * Même famille « document par blocs » que `cours` (framework partagé). Bloc
 * caractéristique : `checklist` (auto-évaluation « Je sais… » avec remédiation prof).
 *
 * ── Champs par type de bloc ────────────────────────────────────────────────────
 *   titre_section → texte
 *   paragraphe    → texte
 *   liste         → texte (intro optionnelle), items
 *   encadre       → texte, encadre_variante, encadre_titre
 *   checklist     → texte (intro optionnelle), checklist_items, checklist_remediation (PROF)
 *   commun à tous → note_prof (PROF ONLY)
 */

import { z } from 'zod'
import { EncadreVarianteSchema } from './resource-blocks'

// ── Énumérations ────────────────────────────────────────────────────────────────

export const BilanBlocTypeSchema = z.enum([
  'titre_section',
  'paragraphe',
  'liste',
  'encadre',
  'checklist',
])
export type BilanBlocType = z.infer<typeof BilanBlocTypeSchema>

// ── Bloc unique (modèle plat) ────────────────────────────────────────────────────

export const BilanBlocSchema = z.object({
  id: z.string().describe('Identifiant unique court du bloc, ex: "b1", "b2"'),
  type: BilanBlocTypeSchema.describe('Type du bloc — détermine quels champs sont remplis'),

  texte: z.string().nullable().describe(
    'titre_section: le titre. paragraphe/encadre: le contenu. liste/checklist: phrase d\'introduction (optionnelle). null si non pertinent.'
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
  checklist_items: z.array(z.string()).nullable().describe(
    'checklist UNIQUEMENT: énoncés d\'auto-évaluation à cocher par l\'élève (ex: "Je sais reconnaître une métaphore"). null sinon.'
  ),
  checklist_remediation: z.array(z.string()).nullable().describe(
    'PROF ONLY — checklist UNIQUEMENT: pour chaque énoncé (même ordre), conseil de remédiation si non maîtrisé. Chaîne vide si aucun. null sinon.'
  ),

  note_prof: z.string().nullable().describe(
    'PROF ONLY: note pédagogique destinée au professeur. Masquée dans la version élève. null si absente.'
  ),
})
export type BilanBloc = z.infer<typeof BilanBlocSchema>

// ── Contenu complet d\'un bilan ────────────────────────────────────────────────────

export const BilanContenuSchema = z.object({
  titre: z.string().describe('Titre du bilan, ex: "Bilan : la poésie lyrique"'),
  introduction: z.string().nullable().describe('Chapeau introductif court. null si inutile'),
  blocs: z.array(BilanBlocSchema).min(2).max(30).describe('Liste ordonnée des blocs du bilan'),
  note_prof_globale: z.string().nullable().describe('PROF ONLY: synthèse / pistes de remédiation globales. null si absente.'),
})
export type BilanContenu = z.infer<typeof BilanContenuSchema>

// ── Helpers ──────────────────────────────────────────────────────────────────────

export const BILAN_BLOC_CHAMPS_PROF: (keyof BilanBloc)[] = ['note_prof', 'checklist_remediation']

export function stripBilanBlocProf(bloc: BilanBloc): BilanBloc {
  return { ...bloc, note_prof: null, checklist_remediation: null }
}

export function createEmptyBilanBloc(type: BilanBlocType, id: string): BilanBloc {
  const base: BilanBloc = {
    id,
    type,
    texte: null,
    items: null,
    encadre_variante: null,
    encadre_titre: null,
    checklist_items: null,
    checklist_remediation: null,
    note_prof: null,
  }

  switch (type) {
    case 'titre_section':
      return { ...base, texte: '' }
    case 'paragraphe':
      return { ...base, texte: '' }
    case 'encadre':
      return { ...base, texte: '', encadre_variante: 'rappel', encadre_titre: 'À retenir' }
    case 'liste':
      return { ...base, texte: null, items: ['', ''] }
    case 'checklist':
      return { ...base, texte: null, checklist_items: ['', ''], checklist_remediation: ['', ''] }
    default:
      return base
  }
}

const BILAN_BLOC_CHAMPS_PAR_TYPE: Record<BilanBlocType, (keyof BilanBloc)[]> = {
  titre_section: ['id', 'type', 'texte', 'note_prof'],
  paragraphe: ['id', 'type', 'texte', 'note_prof'],
  liste: ['id', 'type', 'texte', 'items', 'note_prof'],
  encadre: ['id', 'type', 'texte', 'encadre_variante', 'encadre_titre', 'note_prof'],
  checklist: ['id', 'type', 'texte', 'checklist_items', 'checklist_remediation', 'note_prof'],
}

export function sanitizeBilanBloc(bloc: BilanBloc): BilanBloc {
  const allowed = new Set(BILAN_BLOC_CHAMPS_PAR_TYPE[bloc.type])
  const cleaned = { ...bloc } as Record<string, unknown>
  for (const key of Object.keys(cleaned)) {
    if (!allowed.has(key as keyof BilanBloc)) cleaned[key] = null
  }
  return cleaned as BilanBloc
}

export function sanitizeBilanBlocs(contenu: BilanContenu): BilanContenu {
  return { ...contenu, blocs: contenu.blocs.map(sanitizeBilanBloc) }
}

export const BILAN_BLOC_LABELS: Record<BilanBlocType, string> = {
  titre_section: 'Titre de section',
  paragraphe: 'Paragraphe',
  liste: 'Liste',
  encadre: 'Encadré',
  checklist: 'Auto-évaluation',
}

/** Template (squelette) d'un bilan vierge — amorce la création manuelle. */
export function createBlankBilanContenu(): BilanContenu {
  return {
    titre: 'Nouveau bilan',
    introduction: null,
    note_prof_globale: null,
    blocs: [
      createEmptyBilanBloc('paragraphe', 'b1'),
      createEmptyBilanBloc('checklist', 'b2'),
    ],
  }
}
