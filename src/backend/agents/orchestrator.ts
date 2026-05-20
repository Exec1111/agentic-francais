import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { OrchestratorOutputSchema, OrchestratorOutput } from '@/shared/schemas'

const SYSTEM_PROMPT = `Tu es l'Agent Orchestrateur d'une plateforme de conception de cours de français.

TON RÔLE : Analyser la demande de l'enseignant et extraire les paramètres structurés pour piloter les autres agents.

Tu dois extraire de la demande :
- le niveau scolaire (6e, 5e, 4e, 3e, 2nde, 1ère, Terminale)
- le thème ou l'objet d'étude
- le nombre de séances souhaité (par défaut 5)
- les contraintes particulières mentionnées
- si une évaluation finale est demandée

RÈGLES :
- Ne génère JAMAIS de contenu pédagogique détaillé.
- Si le niveau n'est pas précisé, suggère "5e" par défaut.
- Si le nombre de séances n'est pas précisé, utilise 5.
- La problématique doit être une question ouverte stimulante.`

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
