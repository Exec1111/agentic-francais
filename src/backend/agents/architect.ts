import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { OrchestratorOutput, ArchitectOutputSchema, ArchitectOutput, CorpusItem } from '@/shared/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/architect'

export type { ArchitectOutput } from '@/shared/schemas'

export async function runArchitect(
  llm: LLMProvider,
  params: OrchestratorOutput,
  onLog: (msg: string) => void,
  corpusItems: CorpusItem[] = []
): Promise<ArchitectOutput> {
  onLog('Construction de la structure pédagogique...')

  const userPrompt = buildUserPrompt(params, corpusItems)

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
