import { v4 as uuidv4 } from 'uuid'
import { createLLMProvider, LLMProvider, LLMMessage } from './llm-provider'
import { validateLLMOutput } from './validation'
import { runArchitect, ArchitectOutput } from './agents/architect'
import { runGenerator, GeneratorOutput } from './agents/generator'
import { runReviewer } from './agents/reviewer'
import { runPedagogyAdvisor } from './agents/pedagogy-advisor'
import { searchCorpus, normalizeNiveau } from './repositories/corpus-repo'
import {
  Sequence, Review, AgentName, OrchestratorOutputSchema,
  CorpusSuggestionSchema, CorpusItem, PedagogyAdvisorOutput, ModePedagogique,
} from '@/shared/schemas'
import type { CorpusWorkflowSelection } from '@/shared/corpus-workflow'

// Décision pédagogique par séance, transmise par l'enseignant après le gate.
export interface SeancePedagogie {
  numero: number
  mode: ModePedagogique
  recommande?: boolean
  justification?: string
}

// === Types d'événements ReAct ===

export type WorkflowEvent =
  | { type: 'workflow_start'; workflowId: string; demande: string }
  | { type: 'react_thought'; step: number; thought: string }
  | { type: 'react_action'; step: number; action: string; input: string }
  | { type: 'react_observation'; step: number; observation: string }
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_log'; agent: AgentName; message: string }
  | { type: 'agent_done'; agent: AgentName; output: unknown }
  | { type: 'agent_error'; agent: AgentName; error: string }
  // Gate « enseignement explicite » : la structure est prête, on attend que
  // l'enseignant choisisse le mode de chaque séance avant de générer les activités.
  | { type: 'awaiting_pedagogy'; workflowId: string; architecture: ArchitectOutput; recommendations: PedagogyAdvisorOutput }
  | { type: 'workflow_done'; sequence: Sequence | null; review: Review | null }
  | { type: 'workflow_error'; error: string }

import {
  ANALYSER_DEMANDE_SYSTEM_PROMPT,
  buildSuggestionMessages,
} from './prompts/react-orchestrator'

// === Flux en deux temps (gate « enseignement explicite ») ===
//
// Le parcours de génération est scindé en deux pour insérer une validation humaine
// APRÈS l'architecte (un flux SSE ne peut pas attendre une réponse du client en cours
// de route) :
//   1. runStructurePhase  : orchestrateur → architecte → conseiller pédagogique,
//      puis émet `awaiting_pedagogy` et s'arrête.
//   2. runGenerationPhase : générateur (conscient du mode) → assemblage → reviewer.
// Le client relaie l'architecture + le mode choisi par séance entre les deux.


/** Phase 1 : structure la séquence et recommande un mode par séance, puis s'arrête. */
export async function* runStructurePhase(
  demande: string,
  provider?: string,
  corpusRefs?: string[],
  corpusSelection?: CorpusWorkflowSelection,
): AsyncGenerator<WorkflowEvent> {
  const workflowId = uuidv4()
  const llm: LLMProvider = createLLMProvider(provider)
  const preselectedCorpusItems = await resolveCorpusItems(corpusRefs)

  yield { type: 'workflow_start', workflowId, demande }
  let step = 0

  try {
    // 1) Orchestrateur — extraction des paramètres
    step++
    yield { type: 'react_thought', step, thought: 'J\'analyse la demande pour en extraire les paramètres.' }
    yield { type: 'react_action', step, action: 'analyser_demande', input: demande }
    yield { type: 'agent_start', agent: 'orchestrateur' }
    const extractMessages: LLMMessage[] = [
      { role: 'system', content: ANALYSER_DEMANDE_SYSTEM_PROMPT },
      { role: 'user', content: demande },
    ]
    const extractOptions = { temperature: 0.2, schema: OrchestratorOutputSchema, schemaName: 'extract_params' }
    const extractResp = await llm.chat(extractMessages, extractOptions)
    const params = await validateLLMOutput({
      schema: OrchestratorOutputSchema, raw: extractResp.content, context: 'analyser-demande',
      llm, messages: extractMessages, options: extractOptions, maxRetries: 1,
    })
    yield { type: 'agent_done', agent: 'orchestrateur', output: params }
    yield { type: 'react_observation', step, observation: `Niveau ${params.niveau}, thème « ${params.theme} », ${params.nombre_seances} séances` }

    // 2) Architecte — structure des séances
    step++
    yield { type: 'react_thought', step, thought: 'Je construis la structure pédagogique de la séquence.' }
    yield { type: 'react_action', step, action: 'construire_sequence', input: params.theme }
    yield { type: 'agent_start', agent: 'architecte' }
    const archLogs: string[] = []
    const architecture = await runArchitect(llm, params, (m) => archLogs.push(m), preselectedCorpusItems, corpusSelection?.study_type)
    for (const log of archLogs) yield { type: 'agent_log', agent: 'architecte', message: log }
    yield { type: 'agent_done', agent: 'architecte', output: architecture }
    yield { type: 'react_observation', step, observation: `Séquence « ${architecture.titre_sequence} » — ${architecture.seances.length} séances` }

    // 3) Conseiller pédagogique — recommandation par séance
    step++
    yield { type: 'react_thought', step, thought: 'J\'évalue quelles séances se prêtent à l\'enseignement explicite.' }
    yield { type: 'react_action', step, action: 'conseiller_pedagogie', input: architecture.titre_sequence }
    yield { type: 'agent_start', agent: 'conseiller' }
    const advLogs: string[] = []
    const recommendations = await runPedagogyAdvisor(llm, architecture, (m) => advLogs.push(m))
    for (const log of advLogs) yield { type: 'agent_log', agent: 'conseiller', message: log }
    yield { type: 'agent_done', agent: 'conseiller', output: recommendations }
    const nbReco = recommendations.seances.filter((s) => s.recommande).length
    yield { type: 'react_observation', step, observation: `${nbReco} séance(s) recommandée(s) en enseignement explicite` }

    // 4) Gate : on rend la main à l'enseignant
    yield { type: 'awaiting_pedagogy', workflowId, architecture, recommendations }
  } catch (error) {
    yield { type: 'workflow_error', error: error instanceof Error ? error.message : 'Erreur inconnue' }
  }
}

/** Phase 2 : génère les activités (selon le mode choisi par séance), assemble et révise. */
export async function* runGenerationPhase(
  workflowId: string,
  architecture: ArchitectOutput,
  pedagogie: SeancePedagogie[],
  provider?: string,
  corpusRefs?: string[],
  corpusSelection?: CorpusWorkflowSelection,
): AsyncGenerator<WorkflowEvent> {
  const llm: LLMProvider = createLLMProvider(provider)
  const preselectedCorpusItems = await resolveCorpusItems(corpusRefs)
  const byNumero = new Map(pedagogie.map((p) => [p.numero, p]))
  const modeMap = new Map<number, ModePedagogique>(pedagogie.map((p) => [p.numero, p.mode]))

  let step = 0
  try {
    // 5) Générateur — conscient du mode pédagogique de chaque séance
    step++
    yield { type: 'react_thought', step, thought: 'Je génère les activités en respectant le mode de chaque séance.' }
    yield { type: 'react_action', step, action: 'generer_activites', input: architecture.titre_sequence }
    yield { type: 'agent_start', agent: 'generateur' }
    const genLogs: string[] = []
    const generatorOutput = await runGenerator(llm, architecture, (m) => genLogs.push(m), preselectedCorpusItems, modeMap)
    for (const log of genLogs) yield { type: 'agent_log', agent: 'generateur', message: log }
    yield { type: 'agent_done', agent: 'generateur', output: generatorOutput }

    let sequence = await assembleSequence(workflowId, architecture, generatorOutput, llm, preselectedCorpusItems, corpusSelection)
    // Attache le mode retenu et la recommandation à chaque séance.
    sequence = {
      ...sequence,
      seances: sequence.seances.map((s) => {
        const p = byNumero.get(s.numero)
        if (!p) return s
        return {
          ...s,
          mode_pedagogique: p.mode,
          pedagogie_reco: p.recommande != null
            ? { recommande: p.recommande, justification: p.justification ?? '' }
            : s.pedagogie_reco,
        }
      }),
    }
    const totalActivites = generatorOutput.seances.reduce((acc, s) => acc + s.activites.length, 0)
    yield { type: 'react_observation', step, observation: `${totalActivites} activités générées` }

    // 6) Reviewer
    step++
    yield { type: 'react_thought', step, thought: 'Je vérifie la cohérence et la qualité de la séquence.' }
    yield { type: 'react_action', step, action: 'verifier_qualite', input: sequence.titre }
    yield { type: 'agent_start', agent: 'reviewer' }
    const revLogs: string[] = []
    const review = await runReviewer(llm, sequence, (m) => revLogs.push(m))
    for (const log of revLogs) yield { type: 'agent_log', agent: 'reviewer', message: log }
    yield { type: 'agent_done', agent: 'reviewer', output: review }
    yield { type: 'react_observation', step, observation: `Score qualité : ${review.score_qualite}/100` }

    yield { type: 'workflow_done', sequence, review }
  } catch (error) {
    yield { type: 'workflow_error', error: error instanceof Error ? error.message : 'Erreur inconnue' }
  }
}

// === Helpers ===

/** Résout des ids corpus pré-sélectionnés en items complets. */
async function resolveCorpusItems(corpusRefs?: string[]): Promise<CorpusItem[]> {
  const { getCorpusById } = await import('./repositories/corpus-repo')
  return (corpusRefs ?? [])
    .map((id) => getCorpusById(id))
    .filter((item): item is CorpusItem => item !== null)
}

import { assignCorpusFromPreselection } from '@/shared/corpus-match'
import { ACTIVITES_CORPUS } from '@/shared/corpus-match'

export { assignCorpusFromPreselection }

// Construit le bloc de contexte corpus à injecter dans les prompts de génération de ressources
export function buildCorpusContextBlock(item: CorpusItem): string {
  return buildCorpusContextBlocks([item])
}

export function buildCorpusContextBlocks(items: CorpusItem[]): string {
  if (items.length === 0) return ''
  const blocks = items.map((item) =>
    [
      '═══════════════════════════════════════════════════════════════',
      'TEXTE SOURCE — À UTILISER TEL QUEL',
      '(ne pas modifier, ne pas résumer, ne pas paraphraser)',
      '',
      `Auteur    : ${item.auteur}`,
      `Œuvre     : ${item.oeuvre}`,
      `Référence : ${item.edition_reference}${item.pages ? `, ${item.pages}` : ''}`,
      '',
      item.contenu,
      '═══════════════════════════════════════════════════════════════',
    ].join('\n')
  )
  const footer =
    items.length === 1
      ? [
          '',
          'Génère les ressources en te basant EXCLUSIVEMENT sur ce texte.',
          'Toute citation doit être extraite mot pour mot du texte ci-dessus.',
          'Indique la référence complète en bas de chaque ressource produite.',
        ]
      : [
          '',
          `Génère les ressources en te basant EXCLUSIVEMENT sur ces ${items.length} textes.`,
          'Toute citation doit être extraite mot pour mot des textes ci-dessus.',
          'Indique la référence complète en bas de chaque ressource produite.',
        ]
  return [...blocks, ...footer].join('\n')
}

async function searchCorpusForActivity(
  activiteTitre: string,
  activiteType: string,
  niveau: string,
  theme: string,
  objectif: string,
  llm: LLMProvider,
  consigne?: string,
  supports?: string[]
): Promise<{
  corpus_refs?: string[]
  corpus_status: 'non_requis' | 'trouve' | 'manquant' | 'manquant_sans_suggestion'
  corpus_suggestion?: import('@/shared/schemas').CorpusSuggestion
  _corpusItems?: CorpusItem[]
}> {
  if (!ACTIVITES_CORPUS.has(activiteType)) {
    return { corpus_status: 'non_requis' }
  }

  const normalizedNiveau = normalizeNiveau(niveau)
  const themeKeywords = theme.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 3)

  const results = searchCorpus({
    niveaux: normalizedNiveau ? [normalizedNiveau] : [],
    themes: themeKeywords.slice(0, 3),
    limit: 3,
  })

  if (results.length > 0) {
    const refs = assignCorpusFromPreselection(
      results,
      activiteType,
      activiteTitre,
      [objectif],
      consigne,
      supports
    )
    const matched = refs?.corpus_refs ?? [results[0].id]
    const items = results.filter((r) => matched.includes(r.id))
    return {
      corpus_refs: matched,
      corpus_status: 'trouve',
      _corpusItems: items.length > 0 ? items : [results[0]],
    }
  }

  // Aucun texte trouvé → demander une suggestion à l'IA
  try {
    const messages = buildSuggestionMessages(activiteTitre, niveau, theme, objectif)
    const resp = await llm.chat(messages, {
      temperature: 0.3,
      schema: CorpusSuggestionSchema,
      schemaName: 'corpus_suggestion',
    })
    const parsed = CorpusSuggestionSchema.safeParse({
      // Défauts pour un modèle libre qui omettrait les clés nullable.
      genres: null, themes: null, annee_publication: null,
      ...JSON.parse(resp.content.replace(/```json\n?|```/g, '').trim()),
    })
    if (parsed.success) {
      return { corpus_status: 'manquant', corpus_suggestion: parsed.data }
    }
  } catch {
    // suggestion échouée → statut sans suggestion
  }

  return { corpus_status: 'manquant_sans_suggestion' }
}

async function assembleSequence(
  workflowId: string,
  arch: ArchitectOutput,
  gen: GeneratorOutput,
  llm: LLMProvider,
  preselectedCorpusItems: CorpusItem[] = [],
  corpusSelection?: CorpusWorkflowSelection,
): Promise<Sequence> {
  const seances = await Promise.all(
    arch.seances.map(async (s) => {
      const generated = gen.seances.find((gs) => gs.numero === s.numero)
      const rawActivites = generated?.activites || []

      const activites = await Promise.all(
        rawActivites.map(async (act, actIdx) => {

          // Corpus : pré-sélection prioritaire, sinon recherche autonome (fallback)
          let corpusResult: {
            corpus_refs?: string[]
            corpus_status: 'non_requis' | 'trouve' | 'manquant' | 'manquant_sans_suggestion'
            corpus_suggestion?: import('@/shared/schemas').CorpusSuggestion
          }

          if (preselectedCorpusItems.length > 0) {
            const assigned = assignCorpusFromPreselection(
              preselectedCorpusItems,
              act.type,
              act.titre,
              s.objectifs,
              act.consigne,
              act.supports
            )
            corpusResult = assigned ?? { corpus_status: 'non_requis' }
          } else {
            corpusResult = await searchCorpusForActivity(
              act.titre,
              act.type,
              arch.niveau,
              arch.theme,
              s.objectifs[0] ?? arch.theme,
              llm,
              act.consigne,
              act.supports
            )
          }

          return {
            ...act,
            corpus_refs: corpusResult.corpus_refs ?? [],
            corpus_status: corpusResult.corpus_status,
            corpus_suggestion: corpusResult.corpus_suggestion,
          }
        })
      )

      return {
        numero: s.numero,
        titre: s.titre,
        duree: s.duree,
        objectifs: s.objectifs,
        activites,
        evaluation: undefined,
        ressources: [],
      }
    })
  )

  return {
    id: workflowId,
    titre: arch.titre_sequence,
    niveau: arch.niveau,
    theme: arch.theme,
    problematique: arch.problematique,
    objectifs: arch.objectifs,
    competences: arch.competences,
    corpus_refs: preselectedCorpusItems.map((item) => item.id),
    corpus_intent: corpusSelection?.intent,
    corpus_study_type: corpusSelection?.study_type,
    corpus_passages: corpusSelection?.passage_selections ?? [],
    seances,
    evaluation_finale: arch.evaluation_finale || undefined,
    ressources: [],
  }
}
