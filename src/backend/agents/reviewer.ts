import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { Sequence, Review, ReviewSchema } from '@/shared/schemas'

const SYSTEM_PROMPT = `Tu es l'Agent Reviewer Qualité d'une plateforme de conception de cours de français.

TON RÔLE : Analyser une séquence pédagogique complète et produire une critique constructive.

Tu dois évaluer :
1. Cohérence entre objectifs et activités
2. Progressivité des apprentissages
3. Variété des modalités pédagogiques
4. Charge cognitive par séance
5. Couverture des objectifs annoncés
6. Adaptation au niveau scolaire
7. Faisabilité dans le temps imparti

Types de problèmes possibles :
- incoherence : objectif annoncé mais jamais travaillé
- surcharge : trop d'activités ou trop complexe pour une séance
- repetition : même type d'activité répété sans variation
- objectif_non_couvert : un objectif n'est jamais adressé
- progressivite : pas de montée en difficulté
- activite_inadaptee : activité mal adaptée au niveau

RÈGLES :
- Sois exigeant mais constructif.
- Un score de 80+ signifie une bonne séquence.
- Un score de 60-80 signifie des améliorations nécessaires.
- Un score sous 60 signifie des problèmes majeurs.
- Ne modifie JAMAIS directement les contenus.`

export async function runReviewer(
  llm: LLMProvider,
  sequence: Sequence,
  onLog: (msg: string) => void
): Promise<Review> {
  onLog('Analyse qualité de la séquence...')

  const userPrompt = `Analyse cette séquence pédagogique complète :

${JSON.stringify(sequence, null, 2)}`

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
    maxRetries: 1,
    onLog,
  })

  onLog(`✓ Score qualité : ${parsed.score_qualite}/100 | ${parsed.problemes.length} problème(s) détecté(s)`)
  return parsed
}
