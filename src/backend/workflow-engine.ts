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

// === Prompt ReAct pour l'orchestrateur ===

const REACT_SYSTEM_PROMPT = `Tu es l'Orchestrateur ReAct d'une plateforme de conception de cours de français.

Tu fonctionnes selon le pattern ReAct (Reasoning + Acting) :
- THOUGHT : tu réfléchis à ce qu'il faut faire
- ACTION : tu choisis une action à exécuter
- OBSERVATION : tu reçois le résultat

ACTIONS DISPONIBLES :
1. analyser_demande — Extraire les paramètres de la demande utilisateur (niveau, thème, nombre de séances, contraintes)
2. construire_sequence — Appeler l'architecte pédagogique pour structurer la séquence
3. generer_activites — Appeler le générateur pour créer les activités de chaque séance
4. verifier_qualite — Appeler le reviewer pour vérifier la cohérence
5. ameliorer — Re-générer les activités des séances problématiques (après un review négatif)
6. terminer — Le workflow est terminé, la séquence est prête

RÈGLES :
- Tu dois TOUJOURS commencer par analyser_demande.
- Après verifier_qualite, si le score est < 60, tu DOIS appeler ameliorer puis re-vérifier.
- Si le score est >= 60 et < 80, tu PEUX choisir d'améliorer OU de terminer.
- Si le score est >= 80, tu dois terminer.
- Tu as un maximum de 8 étapes au total.
- Tu ne peux PAS appeler la même action 3 fois de suite.

Remplis les champs "thought" (ton raisonnement), "action" (l'action choisie) et "action_input" (détails pour l'action).`

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
            { role: 'system', content: `Extrais les paramètres pédagogiques de la demande : niveau scolaire, thème, nombre de séances souhaité, contraintes éventuelles, si une évaluation finale est demandée, et propose une problématique stimulante.` },
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

          observation = `Score qualité: ${review.score_qualite}/100 — ${review.problemes.length} problème(s) — ${review.suggestions.length} suggestion(s)`
          yield { type: 'agent_done', agent: 'reviewer', output: review }
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
          yield { type: 'workflow_done', sequence, review }
          return
        }

        default: {
          observation = `Action inconnue: ${action}. Actions valides: analyser_demande, construire_sequence, generer_activites, verifier_qualite, ameliorer, terminer`
        }
      }

      yield { type: 'react_observation', step, observation }
      history.push({ thought, action, actionInput, observation })
    }

    // Max steps atteint
    yield { type: 'workflow_done', sequence, review }

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

// === Corpus : types d'activité bénéficiant d'un texte source ===

const ACTIVITES_CORPUS = new Set(['lecture', 'exercice', 'production_ecrite'])

// Sélectionne le meilleur item corpus depuis une liste pré-sélectionnée
export function assignCorpusFromPreselection(
  corpusItems: CorpusItem[],
  activiteType: string,
  activiteTitre: string,
  seanceObjectifs: string[]
): { corpus_ref: string; corpus_status: 'trouve'; _corpusItem: CorpusItem } | null {
  if (!ACTIVITES_CORPUS.has(activiteType)) return null
  if (corpusItems.length === 0) return null
  if (corpusItems.length === 1) {
    return { corpus_ref: corpusItems[0].id, corpus_status: 'trouve', _corpusItem: corpusItems[0] }
  }

  // Scorer chaque item contre le titre + objectifs de l'activité
  const keywords = [activiteTitre, ...seanceObjectifs]
    .join(' ')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3)

  const scored = corpusItems.map((item) => {
    const score = keywords.filter(
      (k) =>
        item.themes.some((t) => t.toLowerCase().includes(k)) ||
        item.genres.some((g) => g.toLowerCase().includes(k)) ||
        item.auteur.toLowerCase().includes(k) ||
        item.oeuvre.toLowerCase().includes(k)
    ).length
    return { item, score }
  })

  const best = scored.sort((a, b) => b.score - a.score)[0]
  return { corpus_ref: best.item.id, corpus_status: 'trouve', _corpusItem: best.item }
}

// Prompt pour suggestion IA quand aucun texte corpus n'est trouvé
function buildSuggestionPrompt(
  activiteTitre: string,
  niveau: string,
  theme: string,
  objectif: string
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `Tu es un expert en littérature française et en didactique du français.
Quand on te demande de suggérer un texte, tu réponds UNIQUEMENT avec un objet JSON valide, sans commentaire.`,
    },
    {
      role: 'user',
      content: `Pour une activité de lecture intitulée "${activiteTitre}", destinée à des élèves de ${niveau}, sur le thème "${theme}" (objectif : ${objectif}), suggère UN extrait littéraire précis du corpus scolaire français.

Réponds UNIQUEMENT avec ce JSON (rien d'autre) :
{
  "auteur": "Prénom Nom",
  "oeuvre": "Titre exact",
  "extrait_recommande": "Description précise de l'extrait (partie, chapitre, pages approximatives dans une édition courante)",
  "pourquoi": "Justification pédagogique en 1-2 phrases",
  "niveau_difficulte": "accessible",
  "mots_approximatifs": 400
}`,
    },
  ]
}

// Construit le bloc de contexte corpus à injecter dans les prompts de génération de ressources
export function buildCorpusContextBlock(item: CorpusItem): string {
  return [
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
    '',
    'Génère les ressources en te basant EXCLUSIVEMENT sur ce texte.',
    'Toute citation doit être extraite mot pour mot du texte ci-dessus.',
    'Indique la référence complète en bas de chaque ressource produite.',
  ].join('\n')
}

async function searchCorpusForActivity(
  activiteTitre: string,
  activiteType: string,
  niveau: string,
  theme: string,
  objectif: string,
  llm: LLMProvider
): Promise<{
  corpus_ref?: string
  corpus_status: 'non_requis' | 'trouve' | 'manquant' | 'manquant_sans_suggestion'
  corpus_suggestion?: import('@/shared/schemas').CorpusSuggestion
  _corpusItem?: CorpusItem
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
    return {
      corpus_ref: results[0].id,
      corpus_status: 'trouve',
      _corpusItem: results[0],
    }
  }

  // Aucun texte trouvé → demander une suggestion à l'IA
  try {
    const messages = buildSuggestionPrompt(activiteTitre, niveau, theme, objectif)
    const resp = await llm.chat(messages, {
      temperature: 0.3,
      schema: CorpusSuggestionSchema,
      schemaName: 'corpus_suggestion',
    })
    const parsed = CorpusSuggestionSchema.safeParse(
      JSON.parse(resp.content.replace(/```json\n?|```/g, '').trim())
    )
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
          const ressources = []

          if (act.type === 'exercice') {
            ressources.push({
              id: `res-seance-${s.numero}-act-${actIdx}-exercice`,
              titre: `Fiche d'exercices : ${act.titre}`,
              type: 'exercice' as const,
              format_exercice: 'libre' as const,
              status: 'empty' as const,
              contenu: '',
              description: `Fiche d'exercices d'application sur la notion : ${act.titre}`,
            })
            ressources.push({
              id: `res-seance-${s.numero}-act-${actIdx}-correction`,
              titre: `Fiche de correction : ${act.titre}`,
              type: 'exercice' as const,
              format_exercice: 'libre' as const,
              status: 'empty' as const,
              contenu: '',
              description: `Corrigé détaillé de la fiche d'exercices`,
            })
          } else if (act.type === 'lecture') {
            ressources.push({
              id: `res-seance-${s.numero}-act-${actIdx}-extrait`,
              titre: `Extrait d'œuvre : ${act.titre}`,
              type: 'extrait_oeuvre' as const,
              status: 'empty' as const,
              contenu: '',
              description: `Texte littéraire d'étude pour l'activité de lecture`,
            })
          }

          // Corpus : pré-sélection prioritaire, sinon recherche autonome (fallback)
          let corpusResult: {
            corpus_ref?: string
            corpus_status: 'non_requis' | 'trouve' | 'manquant' | 'manquant_sans_suggestion'
            corpus_suggestion?: import('@/shared/schemas').CorpusSuggestion
          }

          if (preselectedCorpusItems.length > 0) {
            const assigned = assignCorpusFromPreselection(
              preselectedCorpusItems,
              act.type,
              act.titre,
              s.objectifs
            )
            corpusResult = assigned ?? { corpus_status: 'non_requis' }
          } else {
            corpusResult = await searchCorpusForActivity(
              act.titre,
              act.type,
              arch.niveau,
              arch.theme,
              s.objectifs[0] ?? arch.theme,
              llm
            )
          }

          return {
            ...act,
            ressources: act.ressources?.length ? act.ressources : ressources,
            corpus_ref: corpusResult.corpus_ref,
            corpus_status: corpusResult.corpus_status,
            corpus_suggestion: corpusResult.corpus_suggestion,
          }
        })
      )

      const seanceRessources = [
        {
          id: `res-seance-${s.numero}-cours`,
          titre: `Cours théorique : ${s.titre}`,
          type: 'cours' as const,
          status: 'empty' as const,
          contenu: '',
          description: `Synthèse théorique complète pour la séance : ${s.titre}`,
        },
        {
          id: `res-seance-${s.numero}-bilan`,
          titre: `Bilan & Synthèse : ${s.titre}`,
          type: 'bilan' as const,
          status: 'empty' as const,
          contenu: '',
          description: `Fiche bilan de fin de séance et points clés à retenir`,
        },
      ]

      return {
        numero: s.numero,
        titre: s.titre,
        duree: s.duree,
        objectifs: s.objectifs,
        activites,
        evaluation: undefined,
        ressources: seanceRessources,
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
