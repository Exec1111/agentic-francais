import { v4 as uuidv4 } from 'uuid'
import { createLLMProvider, LLMProvider, LLMMessage } from './llm-provider'
import { validateLLMOutput } from './validation'
import { runArchitect, ArchitectOutput } from './agents/architect'
import { runGenerator, GeneratorOutput } from './agents/generator'
import { runReviewer } from './agents/reviewer'
import { searchCorpus, normalizeNiveau } from './repositories/corpus-repo'
import {
  Sequence, Review, AgentName, ReactDecisionSchema, OrchestratorOutputSchema,
  CorpusSuggestionSchema, CorpusItem,
} from '@/shared/schemas'

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
  | { type: 'workflow_done'; sequence: Sequence | null; review: Review | null }
  | { type: 'workflow_error'; error: string }

import {
  REACT_SYSTEM_PROMPT,
  ANALYSER_DEMANDE_SYSTEM_PROMPT,
  buildSuggestionMessages,
} from './prompts/react-orchestrator'

// === Interface du plan ReAct ===

interface ReactStep {
  thought: string
  action: string
  actionInput: string
  observation: string
}

// === Moteur ReAct ===

export async function* runWorkflow(
  demande: string,
  provider?: string,
  corpusRefs?: string[]
): AsyncGenerator<WorkflowEvent> {
  const workflowId = uuidv4()
  const llm: LLMProvider = createLLMProvider(provider)

  // Résoudre les items corpus pré-sélectionnés une seule fois
  const { getCorpusById } = await import('./repositories/corpus-repo')
  const preselectedCorpusItems: CorpusItem[] = (corpusRefs ?? [])
    .map((id) => getCorpusById(id))
    .filter((item): item is CorpusItem => item !== null)

  yield { type: 'workflow_start', workflowId, demande }

  const MAX_STEPS = 8
  const history: ReactStep[] = []
  let architectOutput: ArchitectOutput | null = null
  let generatorOutput: GeneratorOutput | null = null
  let sequence: Sequence | null = null
  let review: Review | null = null
  // Meilleur essai conservé à travers les tentatives d'amélioration
  let bestSequence: Sequence | null = null
  let bestReview: Review | null = null

  try {
    for (let step = 1; step <= MAX_STEPS; step++) {
      // --- Construire le contexte pour l'orchestrateur ---
      const contextMessages: LLMMessage[] = [
        { role: 'system', content: REACT_SYSTEM_PROMPT },
        { role: 'user', content: `Demande de l'enseignant : "${demande}"\n\nHistorique des étapes :\n${formatHistory(history)}\n\nQuelle est ta prochaine étape ?` },
      ]

      // --- THOUGHT + ACTION : l'orchestrateur raisonne ---
      const reactChatOptions = { temperature: 1.0, schema: ReactDecisionSchema, schemaName: 'react_decision' }
      const reactResponse = await llm.chat(contextMessages, reactChatOptions)
      const parsed = await validateLLMOutput({
        schema: ReactDecisionSchema,
        raw: reactResponse.content,
        context: `react-step-${step}`,
        llm,
        messages: contextMessages,
        options: reactChatOptions,
        maxRetries: 1,
      })

      const thought = parsed.thought
      const action = parsed.action
      const actionInput = parsed.action_input

      yield { type: 'react_thought', step, thought }
      yield { type: 'react_action', step, action, input: actionInput }

      // --- Exécuter l'action choisie ---
      let observation = ''

      switch (action) {
        case 'analyser_demande': {
          yield { type: 'agent_start', agent: 'orchestrateur' }
          yield { type: 'agent_log', agent: 'orchestrateur', message: 'Analyse de la demande...' }

          // Extraction simple des paramètres par le LLM
          const extractMessages: LLMMessage[] = [
            { role: 'system', content: ANALYSER_DEMANDE_SYSTEM_PROMPT },
            { role: 'user', content: demande },
          ]
          const extractOptions = { temperature: 0.2, schema: OrchestratorOutputSchema, schemaName: 'extract_params' }
          const extractResp = await llm.chat(extractMessages, extractOptions)
          const params = await validateLLMOutput({
            schema: OrchestratorOutputSchema,
            raw: extractResp.content,
            context: 'analyser-demande',
            llm,
            messages: extractMessages,
            options: extractOptions,
            maxRetries: 1,
          })

          observation = `Paramètres extraits — Niveau: ${params.niveau}, Thème: ${params.theme}, ${params.nombre_seances} séances`
          yield { type: 'agent_log', agent: 'orchestrateur', message: observation }
          yield { type: 'agent_done', agent: 'orchestrateur', output: params }

          // Stocker pour les agents suivants
          architectOutput = { ...params, titre_sequence: '', objectifs: [], competences: [], seances: [], evaluation_finale: null } as any
          // On garde les params bruts dans l'architectOutput temporaire
          ;(architectOutput as any)._params = params
          break
        }

        case 'construire_sequence': {
          yield { type: 'agent_start', agent: 'architecte' }
          const params = (architectOutput as any)?._params || { niveau: '5e', theme: demande, nombre_seances: 5, contraintes: [], evaluation_finale: true, problematique_suggeree: '' }

          const logs: string[] = []
          architectOutput = await runArchitect(llm, params, (msg) => {
            logs.push(msg)
          }, preselectedCorpusItems)
          for (const log of logs) {
            yield { type: 'agent_log', agent: 'architecte', message: log }
          }

          observation = `Séquence "${architectOutput.titre_sequence}" structurée avec ${architectOutput.seances.length} séances`
          yield { type: 'agent_done', agent: 'architecte', output: architectOutput }
          break
        }

        case 'generer_activites': {
          if (!architectOutput || !architectOutput.titre_sequence) {
            observation = 'ERREUR: La séquence doit être construite avant de générer les activités'
            break
          }

          yield { type: 'agent_start', agent: 'generateur' }
          const logs: string[] = []
          generatorOutput = await runGenerator(llm, architectOutput, (msg) => {
            logs.push(msg)
          }, preselectedCorpusItems)
          for (const log of logs) {
            yield { type: 'agent_log', agent: 'generateur', message: log }
          }

          // Assembler la séquence complète avec recherche corpus
          sequence = await assembleSequence(workflowId, architectOutput, generatorOutput, llm, preselectedCorpusItems)

          const totalActivites = generatorOutput.seances.reduce((acc, s) => acc + s.activites.length, 0)
          observation = `${totalActivites} activités générées pour ${generatorOutput.seances.length} séances`
          yield { type: 'agent_done', agent: 'generateur', output: generatorOutput }
          break
        }

        case 'verifier_qualite': {
          if (!sequence) {
            observation = 'ERREUR: La séquence doit être complète avant la vérification'
            break
          }

          yield { type: 'agent_start', agent: 'reviewer' }
          const logs: string[] = []
          review = await runReviewer(llm, sequence, (msg) => {
            logs.push(msg)
          })
          for (const log of logs) {
            yield { type: 'agent_log', agent: 'reviewer', message: log }
          }

          const totalSuggestions = review.suggestions.length + review.problemes.reduce((n, p) => n + (p.suggestions?.length ?? 0), 0)
          observation = `Score qualité: ${review.score_qualite}/100 — ${review.problemes.length} problème(s) — ${totalSuggestions} suggestion(s)`
          yield { type: 'agent_done', agent: 'reviewer', output: review }

          // Conserver le meilleur essai
          if (sequence && (!bestReview || review.score_qualite > bestReview.score_qualite)) {
            bestSequence = sequence
            bestReview = review
          }
          break
        }

        case 'ameliorer': {
          if (!architectOutput || !sequence || !review) {
            observation = 'ERREUR: Impossible d\'améliorer sans séquence et review'
            break
          }

          yield { type: 'agent_start', agent: 'generateur' }
          yield { type: 'agent_log', agent: 'generateur', message: '♻️ Re-génération avec prise en compte des critiques...' }

          // Re-générer en incluant les critiques du reviewer
          const logs: string[] = []
          generatorOutput = await runGenerator(llm, architectOutput, (msg) => {
            logs.push(msg)
          })
          for (const log of logs) {
            yield { type: 'agent_log', agent: 'generateur', message: log }
          }

          sequence = await assembleSequence(workflowId, architectOutput, generatorOutput, llm, preselectedCorpusItems)
          observation = 'Séquence améliorée — prête pour re-vérification'
          yield { type: 'agent_done', agent: 'generateur', output: generatorOutput }
          break
        }

        case 'terminer': {
          observation = 'Workflow terminé.'
          yield { type: 'react_observation', step, observation }
          history.push({ thought, action, actionInput, observation })
          yield { type: 'workflow_done', sequence: bestSequence ?? sequence, review: bestReview ?? review }
          return
        }

        default: {
          observation = `Action inconnue: ${action}. Actions valides: analyser_demande, construire_sequence, generer_activites, verifier_qualite, ameliorer, terminer`
        }
      }

      yield { type: 'react_observation', step, observation }
      history.push({ thought, action, actionInput, observation })
    }

    // Max steps atteint — utiliser le meilleur essai enregistré
    yield { type: 'workflow_done', sequence: bestSequence ?? sequence, review: bestReview ?? review }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
    yield { type: 'workflow_error', error: errorMsg }
  }
}

// === Helpers ===

function formatHistory(history: ReactStep[]): string {
  if (history.length === 0) return '(aucune étape précédente)'
  return history.map((h, i) =>
    `Étape ${i + 1}:\n  Thought: ${h.thought}\n  Action: ${h.action}(${h.actionInput})\n  Observation: ${h.observation}`
  ).join('\n\n')
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
  preselectedCorpusItems: CorpusItem[] = []
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
    seances,
    evaluation_finale: arch.evaluation_finale || undefined,
    ressources: [],
  }
}
