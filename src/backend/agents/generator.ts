import { LLMProvider, LLMMessage } from '../llm-provider'
import { validateLLMOutput } from '../validation'
import { ArchitectOutput, GeneratorSeanceOutputSchema, Activite, CorpusItem, ModePedagogique } from '@/shared/schemas'
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
  corpusItems: CorpusItem[] = [],
  /** Mode pédagogique retenu par séance (numéro → mode). Défaut : 'standard'. */
  modes: Map<number, ModePedagogique> = new Map()
): Promise<GeneratorOutput> {
  onLog(`Génération des activités pour ${architecture.seances.length} séances...`)

  const corpusBlock = buildCorpusBlock(corpusItems)
  const results: GeneratorOutput = { seances: [] }

  for (const seance of architecture.seances) {
    const mode = modes.get(seance.numero) ?? 'standard'
    onLog(`  → Séance ${seance.numero}: "${seance.titre}"${mode === 'explicite' ? ' [explicite]' : ''}...`)

    const userPrompt = buildSeanceUserPrompt(architecture, seance, corpusBlock, mode)

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
        // En mode standard, on ignore toute phase éventuelle renvoyée par le modèle.
        phase: mode === 'explicite' ? (a.phase ?? undefined) : undefined,
        ressources: [],
        corpus_refs: [],
      })),
    })

    onLog(`    ✓ ${parsed.activites.length} activités générées`)
  }

  onLog(`✓ Toutes les activités générées (${results.seances.reduce((acc, s) => acc + s.activites.length, 0)} au total)`)
  return results
}
