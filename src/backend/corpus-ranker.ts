import { LLMProvider } from './llm-provider'
import { validateLLMOutput } from './validation'
import { CorpusRankingSchema, CorpusItem } from '@/shared/schemas'
import { buildCorpusRankerMessages } from './prompts/corpus-ranker'

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

  const messages = buildCorpusRankerMessages(items, niveau, theme, demande)

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

  // Désemballer le tableau depuis l'enveloppe objet imposée par OpenAI structured outputs
  const scoreMap = new Map(ranked.items.map((r) => [r.id, r]))

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
