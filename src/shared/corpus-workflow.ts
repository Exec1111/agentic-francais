import type { CorpusItem } from './schemas'

export type CorpusIntent = 'identified' | 'guided' | 'free'
export type CorpusStudyType = 'groupement' | 'oeuvre_integrale'

export interface CorpusPassageSelection {
  id: string
  corpus_id: string
  titre: string
  angle?: string
  start_anchor?: string
  end_anchor?: string
  source: 'corpus' | 'ia' | 'manual'
}

export interface CorpusWorkflowSelection {
  intent: CorpusIntent
  study_type: CorpusStudyType
  work_refs: string[]
  passage_selections: CorpusPassageSelection[]
}

export type CorpusValidationResult =
  | { valid: true; message: null }
  | { valid: false; message: string }

/** Les seuils sont volontairement centralisés : l'UI et l'API appliquent la même règle. */
export function validateCorpusWorkflow(
  selection: CorpusWorkflowSelection,
  items: Pick<CorpusItem, 'id' | 'oeuvre' | 'contenu' | 'verified'>[],
): CorpusValidationResult {
  const uniqueRefs = Array.from(new Set(selection.work_refs))
  const usable = new Set(items.filter((item) => item.verified && item.contenu.trim()).map((item) => item.id))
  const usableRefs = uniqueRefs.filter((ref) => usable.has(ref))
  const usableItems = items.filter((item) => usable.has(item.id) && usableRefs.includes(item.id))
  const distinctWorks = new Set(usableItems.map((item) => item.oeuvre.trim().toLocaleLowerCase())).size

  if (usableRefs.length === 0) {
    return { valid: false, message: 'Sélectionnez au moins une œuvre avec un texte vérifié et exploitable.' }
  }

  if (selection.study_type === 'groupement' && distinctWorks < 3) {
    return { valid: false, message: `Un groupement de textes nécessite au moins 3 œuvres exploitables (${distinctWorks}/3).` }
  }

  if (selection.study_type === 'oeuvre_integrale' && usableRefs.length !== 1) {
    return { valid: false, message: 'Une œuvre intégrale nécessite exactement une œuvre principale exploitable.' }
  }

  if (selection.study_type === 'oeuvre_integrale') {
    const hasPassage = selection.passage_selections.some((passage) => passage.corpus_id === usableRefs[0])
    if (!hasPassage) {
      return { valid: false, message: 'Sélectionnez au moins un passage d’ancrage pour l’œuvre intégrale.' }
    }
  }

  return { valid: true, message: null }
}

export function corpusItemsByWork(items: CorpusItem[]): Map<string, CorpusItem[]> {
  const grouped = new Map<string, CorpusItem[]>()
  for (const item of items) {
    const key = item.parent_id ?? item.id
    grouped.set(key, [...(grouped.get(key) ?? []), item])
  }
  return grouped
}
