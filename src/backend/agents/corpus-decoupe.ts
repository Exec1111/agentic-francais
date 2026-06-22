/**
 * Agent de découpe d'une œuvre en passages.
 *
 * Lance le LLM avec le prompt de découpe, valide la sortie structurée, puis
 * résout les ancres verbatim en sous-chaînes EXACTES de l'œuvre source.
 * Les passages dont les ancres sont introuvables sont conservés mais marqués
 * `found: false` pour que le prof les ajuste dans le backoffice.
 */

import { LLMProvider } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { CorpusDecoupeSchema, type CorpusItem, type CorpusPassageProposal } from '@/shared/schemas'
import { buildDecoupeMessages } from '../prompts/corpus-decoupe'
import { resolvePassageSpan } from '@/shared/passage-anchor'

export interface PassageResolu extends CorpusPassageProposal {
  /** Sous-chaîne exacte de l'œuvre (vide si les ancres n'ont pas été localisées). */
  contenu: string
  /** true si les deux ancres ont été retrouvées dans l'œuvre. */
  found: boolean
}

export async function runDecoupe(
  llm: LLMProvider,
  oeuvre: CorpusItem,
  onLog: (msg: string) => void = () => {},
): Promise<PassageResolu[]> {
  onLog(`Découpe de « ${oeuvre.oeuvre} » en passages...`)

  const messages = buildDecoupeMessages(oeuvre)
  const options = { temperature: 0.5, schema: CorpusDecoupeSchema, schemaName: 'corpus_decoupe' }
  const response = await llm.chat(messages, options)

  const parsed = await validateLLMOutput({
    schema: CorpusDecoupeSchema,
    raw: response.content,
    context: `decoupe/${oeuvre.id}`,
    llm,
    messages,
    options,
    maxRetries: 1,
    onLog,
  })

  const resolus = parsed.passages.map((p): PassageResolu => {
    const span = resolvePassageSpan(oeuvre.contenu, {
      debut_texte: p.debut_texte,
      fin_texte: p.fin_texte,
    })
    return { ...p, contenu: span.contenu, found: span.found }
  })

  const ok = resolus.filter((p) => p.found).length
  onLog(`✓ ${resolus.length} passages proposés (${ok} ancrés, ${resolus.length - ok} à ajuster)`)
  return resolus
}
