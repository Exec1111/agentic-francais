import { LLMProvider, LLMMessage } from './llm-provider'
import { validateLLMOutput } from './validation'
import { CorpusRankingSchema, CorpusItem } from '@/shared/schemas'

/**
 * Utilise le LLM pour noter la pertinence de chaque texte du corpus
 * par rapport à une demande pédagogique.
 *
 * Remplace le scoring par mots-clés qui échoue sur les variantes
 * morphologiques ("symboliste" ≠ "symbolisme", etc.).
 *
 * @param llm      - Provider LLM
 * @param items    - Candidats présélectionnés par le filtre SQL (niveau)
 * @param niveau   - Niveau scolaire extrait de la demande
 * @param theme    - Thème extrait de la demande
 * @param demande  - Demande originale de l'enseignant
 * @returns Items triés par pertinence décroissante, avec score et justification
 */
export async function rankCorpusWithLLM(
  llm: LLMProvider,
  items: CorpusItem[],
  niveau: string,
  theme: string,
  demande: string
): Promise<Array<{ item: CorpusItem; score: number; raison: string }>> {
  if (items.length === 0) return []

  // Résumé compact de chaque texte (métadonnées uniquement, pas le contenu)
  const textesList = items
    .map(
      (it) =>
        `- id: "${it.id}" | ${it.auteur}, « ${it.oeuvre} » (${it.annee_publication})` +
        ` | genres: ${it.genres.join(', ')} | thèmes: ${it.themes.join(', ')}`
    )
    .join('\n')

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `Tu es un expert en littérature française et en pédagogie scolaire.
Tu évalues la pertinence de textes littéraires pour une séquence pédagogique.

Règles de notation (score de 0 à 10) :
- 8-10 : texte central, directement en lien avec le thème et le niveau
- 5-7  : texte pertinent mais connexe (lien indirect ou niveau à adapter)
- 0-4  : texte peu ou pas pertinent pour cette séquence

Tu dois noter TOUS les textes fournis, même les non-pertinents.`,
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

  const chatOptions = {
    temperature: 0.1,
    schema: CorpusRankingSchema,
    schemaName: 'corpus_ranking',
  }

  const response = await llm.chat(messages, chatOptions)

  const ranked = await validateLLMOutput({
    schema: CorpusRankingSchema,
    raw: response.content,
    context: 'corpus-ranker',
    llm,
    messages,
    options: chatOptions,
    maxRetries: 1,
  })

  // Joindre les scores aux items d'origine (ignorer les IDs inconnus du LLM)
  const scoreMap = new Map(ranked.map((r) => [r.id, r]))

  return items
    .map((item) => {
      const ranking = scoreMap.get(item.id)
      return {
        item,
        score: ranking?.score ?? 0,
        raison: ranking?.raison ?? '',
      }
    })
    .sort((a, b) => b.score - a.score)
}
