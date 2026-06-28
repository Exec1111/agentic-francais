import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { ArchitectOutput, PedagogyAdvisorOutputSchema, PedagogyAdvisorOutput } from '@/shared/schemas'
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/pedagogy-advisor'

export type { PedagogyAdvisorOutput } from '@/shared/schemas'

/**
 * Conseiller pédagogique : classe chaque séance selon son adéquation à l'enseignement
 * explicite. L'IA propose, l'enseignant tranche ensuite via le gate de validation.
 */
export async function runPedagogyAdvisor(
  llm: LLMProvider,
  architecture: ArchitectOutput,
  onLog: (msg: string) => void = () => {},
): Promise<PedagogyAdvisorOutput> {
  onLog('Analyse de l\'adéquation des séances à l\'enseignement explicite...')

  const messages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(architecture) },
  ]

  const chatOptions = { temperature: 0.3, schema: PedagogyAdvisorOutputSchema, schemaName: 'pedagogy_advisor' }
  const response = await llm.chat(messages, chatOptions)

  const parsed = await validateLLMOutput({
    schema: PedagogyAdvisorOutputSchema,
    raw: response.content,
    context: 'conseiller-pedagogique',
    llm,
    messages,
    options: chatOptions,
    maxRetries: 1,
    onLog,
  })

  // Garantit une recommandation par séance, même si le modèle en a oublié.
  const byNumero = new Map(parsed.seances.map((s) => [s.numero, s]))
  const complete: PedagogyAdvisorOutput = {
    seances: architecture.seances.map((s) => {
      const reco = byNumero.get(s.numero)
      return reco ?? { numero: s.numero, recommande: false, justification: 'Non évaluée — mode standard par défaut.' }
    }),
  }

  const nbReco = complete.seances.filter((s) => s.recommande).length
  onLog(`✓ ${nbReco}/${complete.seances.length} séance(s) recommandée(s) en enseignement explicite`)
  return complete
}
