import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { OrchestratorOutput, ArchitectOutputSchema, ArchitectOutput } from '@/shared/schemas'

const SYSTEM_PROMPT = `Tu es l'Agent Architecte Pédagogique d'une plateforme de conception de cours de français.

TON RÔLE : Construire la structure pédagogique globale d'une séquence.

Tu reçois les paramètres extraits par l'orchestrateur et tu dois produire :
- Un titre de séquence accrocheur
- Des objectifs pédagogiques clairs (3 à 6)
- Des compétences travaillées (3 à 5)
- La liste structurée des séances avec pour chacune : numéro, titre, durée, objectifs spécifiques

RÈGLES :
- Les séances doivent montrer une progression claire.
- Chaque séance dure 55 minutes par défaut.
- Les objectifs doivent être concrets et évaluables.
- Les compétences doivent correspondre aux domaines du français (lire, écrire, s'exprimer à l'oral, comprendre le fonctionnement de la langue, acquérir des éléments de culture littéraire).
- Ne rédige PAS les activités détaillées.`

export type { ArchitectOutput } from '@/shared/schemas'

export async function runArchitect(
  llm: LLMProvider,
  params: OrchestratorOutput,
  onLog: (msg: string) => void
): Promise<ArchitectOutput> {
  onLog('Construction de la structure pédagogique...')

  const userPrompt = `Construis une séquence pédagogique avec ces paramètres :
- Niveau : ${params.niveau}
- Thème : ${params.theme}
- Nombre de séances : ${params.nombre_seances}
- Problématique suggérée : ${params.problematique_suggeree}
- Évaluation finale : ${params.evaluation_finale ? 'oui' : 'non'}
- Contraintes : ${params.contraintes.length > 0 ? params.contraintes.join(', ') : 'aucune'}`

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
