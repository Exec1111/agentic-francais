import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { ArchitectOutput, GeneratorSeanceOutputSchema, Activite, CorpusItem } from '@/shared/schemas'
import { SYSTEM_PROMPT, buildCorpusBlock, buildSeanceUserPrompt } from '../prompts/generator'

export interface GeneratorOutput {
  seances: {
    numero: number
    titre: string
    activites: Activite[]
  }[]
}

export async function runGenerator(
  llm: LLMProvider,
  architecture: ArchitectOutput,
  onLog: (msg: string) => void,
  corpusItems: CorpusItem[] = []
): Promise<GeneratorOutput> {
  onLog(`Génération des activités pour ${architecture.seances.length} séances...`)

  const corpusBlock = buildCorpusBlock(corpusItems)
  const results: GeneratorOutput = { seances: [] }

  for (const seance of architecture.seances) {
    onLog(`  → Séance ${seance.numero}: "${seance.titre}"...`)

    const userPrompt = buildSeanceUserPrompt(architecture, seance, corpusBlock)

    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    const chatOptions = { temperature: 0.8, schema: GeneratorSeanceOutputSchema, schemaName: 'generator_seance' }
    const response = await llm.chat(messages, chatOptions)

    const parsed = await validateLLMOutput({
      schema: GeneratorSeanceOutputSchema,
      raw: response.content,
      context: `generateur/seance-${seance.numero}`,
      llm,
      messages,
      options: chatOptions,
      maxRetries: 1,
      onLog,
    })

    results.seances.push({
      numero: seance.numero,
      titre: seance.titre,
      activites: parsed.activites.map((a) => ({
        ...a,
        differenciation: a.differenciation ?? undefined,
        ressources: [],
        corpus_refs: [],
      })),
    })

    onLog(`    ✓ ${parsed.activites.length} activités générées`)
  }

  onLog(`✓ Toutes les activités générées (${results.seances.reduce((acc, s) => acc + s.activites.length, 0)} au total)`)
  return results
}
