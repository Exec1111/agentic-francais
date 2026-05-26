/**
 * Prompts du classeur de corpus par LLM
 * Rôle : noter la pertinence thématique de chaque texte du corpus
 *        par rapport à une demande pédagogique donnée.
 */

import type { LLMMessage } from '../llm-provider'
import type { CorpusItem } from '@/shared/schemas'

export function buildCorpusRankerMessages(
  items: CorpusItem[],
  niveau: string,
  theme: string,
  demande: string,
): LLMMessage[] {
  const textesList = items
    .map(
      (it) =>
        `- id: "${it.id}" | ${it.auteur}, « ${it.oeuvre} » (${it.annee_publication})` +
        ` | genres: ${it.genres.join(', ')} | thèmes: ${it.themes.join(', ')}`,
    )
    .join('\n')

  return [
    {
      role: 'system',
      content: `Tu es un expert en littérature française et en pédagogie scolaire.
Tu évalues la pertinence de textes littéraires pour une séquence pédagogique.

Règles de notation (score de 0 à 10) :
- 8-10 : texte central, directement en lien avec le thème et le niveau
- 5-7  : texte pertinent mais connexe (lien indirect ou niveau à adapter)
- 0-4  : texte peu ou pas pertinent pour cette séquence

Tu dois noter TOUS les textes fournis, même les non-pertinents.

Réponds UNIQUEMENT avec un objet JSON : { "items": [ { "id": "...", "score": 7, "raison": "..." }, ... ] }`,
    },
    {
      role: 'user',
      content: `Séquence pédagogique :
- Niveau : ${niveau}
- Thème : ${theme}
- Demande complète : "${demande}"

Textes disponibles dans le corpus :
${textesList}`,
    },
  ]
}
