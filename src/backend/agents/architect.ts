import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { OrchestratorOutput, ArchitectOutputSchema, ArchitectOutput, CorpusItem } from '@/shared/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/architect'
import type { CorpusStudyType } from '@/shared/corpus-workflow'

export type { ArchitectOutput } from '@/shared/schemas'

export async function runArchitect(
  llm: LLMProvider,
  params: OrchestratorOutput,
  onLog: (msg: string) => void,
  corpusItems: CorpusItem[] = [],
  corpusStudyType?: CorpusStudyType,
): Promise<ArchitectOutput> {
  onLog('Construction de la structure pédagogique...')

  const corpusInstruction = corpusStudyType === 'groupement'
    ? 'la séquence est un groupement de textes : faire circuler et comparer au moins trois œuvres distinctes.'
    : corpusStudyType === 'oeuvre_integrale'
      ? 'la séquence porte sur une œuvre intégrale unique : construire la progression autour de cette œuvre et de son passage d’ancrage.'
      : ''
  const userPrompt = buildUserPrompt(params, corpusItems, corpusInstruction)

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const chatOptions = { temperature: 0.7, schema: ArchitectOutputSchema, schemaName: 'architect_output' }
  onLog('Définition des objectifs et compétences...')
  const response = await llm.chat(messages, chatOptions)

  onLog('Validation Zod de la structure...')
  const parsed = await validateLLMOutput({
    schema: ArchitectOutputSchema,
    raw: response.content,
    context: 'architecte',
    llm,
    messages,
    options: chatOptions,
    maxRetries: 1,
    onLog,
  })

  onLog(`✓ Séquence "${parsed.titre_sequence}" — ${parsed.seances.length} séances planifiées`)
  return parsed
}
