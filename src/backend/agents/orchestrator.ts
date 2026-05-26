import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { OrchestratorOutputSchema, OrchestratorOutput } from '@/shared/schemas'
import { SYSTEM_PROMPT } from '../prompts/orchestrator'

export type { OrchestratorOutput } from '@/shared/schemas'

export async function runOrchestrator(
  llm: LLMProvider,
  demande: string,
  onLog: (msg: string) => void
): Promise<OrchestratorOutput> {
  onLog('Analyse de la demande utilisateur...')

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: demande },
  ]

  const chatOptions = { temperature: 0.3, schema: OrchestratorOutputSchema, schemaName: 'orchestrator_output' }
  onLog('Extraction des paramètres pédagogiques...')
  const response = await llm.chat(messages, chatOptions)

  onLog('Validation Zod des paramètres...')
  const parsed = await validateLLMOutput({
    schema: OrchestratorOutputSchema,
    raw: response.content,
    context: 'orchestrateur',
    llm,
    messages,
    options: chatOptions,
    maxRetries: 1,
    onLog,
  })

  onLog(`✓ Niveau: ${parsed.niveau} | Thème: ${parsed.theme} | ${parsed.nombre_seances} séances`)
  return parsed
}
