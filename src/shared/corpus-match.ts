/**
 * Détection des textes du corpus mentionnés dans une activité
 * (consigne, supports, titre, objectifs).
 */

export const ACTIVITES_CORPUS = new Set(['lecture', 'exercice', 'production_ecrite'])

export interface CorpusMatchable {
  id: string
  auteur: string
  oeuvre: string
  titre: string
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''«»""]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Variantes de libellés exploitables pour repérer un texte dans un texte libre. */
function matchCandidates(item: CorpusMatchable): string[] {
  const slugLabel = item.id
    .replace(/^ia-/, '')
    .replace(/-[a-z0-9]{6,}$/i, '')
    .replace(/-/g, ' ')

  return [item.oeuvre, item.titre, item.auteur, item.id.replace(/-/g, ' '), slugLabel]
    .map(normalizeForMatch)
    .filter((c) => c.length >= 4)
}

export function isCorpusItemMentioned(item: CorpusMatchable, contextText: string): boolean {
  const ctx = normalizeForMatch(contextText)
  return matchCandidates(item).some((c) => ctx.includes(c))
}

function scoreBestItem(
  corpusItems: CorpusMatchable[],
  activiteTitre: string,
  seanceObjectifs: string[]
): CorpusMatchable {
  const keywords = [activiteTitre, ...seanceObjectifs]
    .join(' ')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3)

  const scored = corpusItems.map((item) => {
    const haystack = normalizeForMatch([item.oeuvre, item.titre, item.auteur].join(' '))
    const score = keywords.filter((k) => haystack.includes(k)).length
    return { item, score }
  })

  return scored.sort((a, b) => b.score - a.score)[0].item
}

/**
 * Infère les IDs corpus liés à une activité.
 * - Priorité aux textes explicitement mentionnés (supports, consigne…).
 * - Sinon conserve les refs existantes, ou retombe sur le seul texte / le meilleur score.
 */
export function inferCorpusRefs(
  corpusItems: CorpusMatchable[],
  activiteType: string,
  activiteTitre: string,
  seanceObjectifs: string[],
  options: {
    consigne?: string
    supports?: string[]
    existingRefs?: string[]
  } = {}
): string[] {
  if (!ACTIVITES_CORPUS.has(activiteType) || corpusItems.length === 0) {
    return options.existingRefs ?? []
  }

  const contextText = [
    activiteTitre,
    ...seanceObjectifs,
    options.consigne ?? '',
    ...(options.supports ?? []),
  ].join(' ')

  const mentioned = corpusItems
    .filter((item) => isCorpusItemMentioned(item, contextText))
    .map((item) => item.id)

  if (mentioned.length > 0) {
    return Array.from(new Set([...(options.existingRefs ?? []), ...mentioned]))
  }

  if (options.existingRefs?.length) return options.existingRefs
  if (corpusItems.length === 1) return [corpusItems[0].id]

  return [scoreBestItem(corpusItems, activiteTitre, seanceObjectifs).id]
}

export type CorpusAssignResult = {
  corpus_refs: string[]
  corpus_status: 'trouve'
}

/** Assigne un ou plusieurs textes pré-sélectionnés à une activité. */
export function assignCorpusFromPreselection(
  corpusItems: CorpusMatchable[],
  activiteType: string,
  activiteTitre: string,
  seanceObjectifs: string[],
  consigne?: string,
  supports?: string[]
): CorpusAssignResult | null {
  const refs = inferCorpusRefs(corpusItems, activiteType, activiteTitre, seanceObjectifs, {
    consigne,
    supports,
  })
  if (refs.length === 0) return null
  return { corpus_refs: refs, corpus_status: 'trouve' }
}

/** Lit corpus_refs avec repli sur l'ancien champ singulier corpus_ref. */
export function resolveActiviteCorpusRefs(
  activite: { corpus_refs?: string[]; corpus_ref?: string }
): string[] {
  if (activite.corpus_refs?.length) return activite.corpus_refs
  if (activite.corpus_ref) return [activite.corpus_ref]
  return []
}
