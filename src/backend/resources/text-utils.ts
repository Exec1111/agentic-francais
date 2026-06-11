/**
 * Utilitaires de mise en forme des textes littéraires injectés par code
 * dans les ressources (le LLM ne recopie jamais le texte source).
 */

import type { CorpusItem } from '@/shared/schemas'

/**
 * Numérote les lignes non vides d'un texte tous les `step` :
 * la 5e, 10e, 15e… ligne non vide est préfixée de son numéro `[n]`.
 * Convention scolaire de repérage des vers/lignes dans un extrait.
 * Un texte en un seul paragraphe (une seule ligne) reste non numéroté.
 */
export function numberTextLines(text: string, step = 5): string {
  let count = 0
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return line
      count++
      return count % step === 0 ? `[${count}] ${line}` : line
    })
    .join('\n')
}

/**
 * Encart standard affiché à la place du texte pour une œuvre protégée
 * par droits d'auteur (l'enseignant distribue le texte séparément).
 */
export function buildTexteProtegePlaceholder(item: Pick<CorpusItem, 'oeuvre' | 'auteur' | 'pages'>): string {
  return `[Texte à insérer par l'enseignant — ${item.oeuvre}, ${item.auteur}${item.pages ? `, ${item.pages}` : ''}]`
}
