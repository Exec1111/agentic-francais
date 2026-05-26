import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { Sequence, Review, ReviewSchema } from '@/shared/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/reviewer'

export async function runReviewer(
  llm: LLMProvider,
  sequence: Sequence,
  onLog: (msg: string) => void
): Promise<Review> {
  onLog('Analyse qualité de la séquence...')

  const userPrompt = buildUserPrompt(sequence)

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]

  const chatOptions = { temperature: 0.4, schema: ReviewSchema, schemaName: 'review_output' }
  onLog('Vérification de la cohérence pédagogique...')
  onLog('Évaluation de la progressivité...')
  const response = await llm.chat(messages, chatOptions)

  onLog('Validation Zod du review...')
  const parsed = await validateLLMOutput({
    schema: ReviewSchema,
    raw: response.content,
    context: 'reviewer',
    llm,
    messages,
    options: chatOptions,
    maxRetries: 2,
    onLog,
  })

  onLog(`✓ Score qualité : ${parsed.score_qualite}/100 | ${parsed.problemes.length} problème(s) détecté(s)`)
  return parsed
}
