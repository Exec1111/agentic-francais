'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Download, Terminal, Save, Bot, ShieldCheck, Library } from 'lucide-react'
import { cn } from '@/shared/utils'
import { WorkflowProgress } from '@/frontend/components/WorkflowPipeline'
import { SequenceEditor } from '@/frontend/components/SequenceEditor'
import { ReviewPanel } from '@/frontend/components/ReviewPanel'
import { ProviderSwitch } from '@/frontend/components/ProviderSwitch'
import { ReactStepData } from '@/frontend/components/ReactTrace'
import { LLMLogsPanel } from '@/frontend/components/LLMLogsPanel'
import { PipelinePanel } from '@/frontend/components/PipelinePanel'
import { SavedSequences } from '@/frontend/components/SavedSequences'
import { GenerateModal } from '@/frontend/components/GenerateModal'
import { CorpusManager } from '@/frontend/components/CorpusManager'
import { PedagogyGate, type SeancePedagogieChoice } from '@/frontend/components/PedagogyGate'
import { useSequenceEditor } from '@/frontend/hooks/useSequenceEditor'
import { useSequenceStore } from '@/frontend/hooks/useSequenceStore'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'
import type { ArchitectOutput, PedagogyAdvisorOutput } from '@/shared/schemas'

type AgentName = 'orchestrateur' | 'architecte' | 'conseiller' | 'generateur' | 'reviewer'

/** Structure produite par la phase 1, en attente du choix pédagogique de l'enseignant. */
interface PendingStructure {
  workflowId: string
  architecture: ArchitectOutput
  recommendations: PedagogyAdvisorOutput
}

const INITIAL_AGENTS: { name: AgentName; status: 'idle'; logs: string[] }[] = [
  { name: 'orchestrateur', status: 'idle', logs: [] },
  { name: 'architecte', status: 'idle', logs: [] },
  { name: 'conseiller', status: 'idle', logs: [] },
  { name: 'generateur', status: 'idle', logs: [] },
  { name: 'reviewer', status: 'idle', logs: [] },
]
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

type GenerationStep = 'idle' | 'suggesting' | 'corpus_selection' | 'generating' | 'pedagogy_gate' | 'done'

export default function HomePage() {
  const [demande, setDemande] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [provider, setProvider] = useState<'ollama' | 'openai'>('ollama')
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [corpusSuggest, setCorpusSuggest] = useState<CorpusSuggestResponse | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [agents, setAgents] = useState<AgentState[]>(INITIAL_AGENTS)
  // Structure en attente de validation pédagogique (gate) + refs corpus pour la phase 2.
  const [pendingStructure, setPendingStructure] = useState<PendingStructure | null>(null)
  const [corpusRefs, setCorpusRefs] = useState<string[]>([])
  const [reactSteps, setReactSteps] = useState<ReactStepData[]>([])
  const [progress, setProgress] = useState<WorkflowProgress | null>(null)
  const editor = useSequenceEditor()
  const [review, setReview] = useState<any>(null)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [showPipeline, setShowPipeline] = useState(false)
  const [view, setView] = useState<'sequences' | 'corpus'>('sequences')
  const abortRef = useRef<AbortController | null>(null)
  const store = useSequenceStore()

  // Raccourcis clavier undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        editor.undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        editor.redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editor])

  const resetState = useCallback(() => {
    setAgents(INITIAL_AGENTS)
    setReactSteps([])
    setReview(null)
    setError(null)
    setGenerationStep('idle')
    setCorpusSuggest(null)
    setProgress(null)
    setPendingStructure(null)
  }, [])

  // Applique un événement du flux SSE à l'état de l'UI (commun aux deux phases).
  const handleEvent = useCallback((data: any) => {
    switch (data.type) {
      case 'workflow_start':
        setProgress({ percent: 5, label: 'Démarrage du workflow…' })
        break

      case 'react_thought':
        setReactSteps(prev => {
          const existing = prev.find(s => s.step === data.step)
          if (existing) {
            return prev.map(s => s.step === data.step ? { ...s, thought: data.thought, status: 'thinking' } : s)
          }
          return [...prev, { step: data.step, thought: data.thought, status: 'thinking' }]
        })
        break

      case 'react_action': {
        setReactSteps(prev => prev.map(s =>
          s.step === data.step ? { ...s, action: data.action, actionInput: data.input, status: 'acting' } : s
        ))
        const ACTION_PROGRESS: Record<string, WorkflowProgress> = {
          analyser_demande:     { percent: 10, label: 'Analyse de la demande…' },
          construire_sequence:  { percent: 28, label: 'Construction de la séquence…' },
          conseiller_pedagogie: { percent: 42, label: 'Analyse pédagogique…' },
          generer_activites:    { percent: 62, label: 'Génération des activités…' },
          verifier_qualite:     { percent: 85, label: 'Vérification qualité…' },
          terminer:             { percent: 96, label: 'Finalisation…' },
        }
        if (ACTION_PROGRESS[data.action]) setProgress(ACTION_PROGRESS[data.action])
        break
      }

      case 'react_observation':
        setReactSteps(prev => prev.map(s =>
          s.step === data.step ? { ...s, observation: data.observation, status: 'done' } : s
        ))
        break

      case 'agent_start':
        setAgents(prev => prev.map(a => a.name === data.agent ? { ...a, status: 'running' } : a))
        break

      case 'agent_log':
        setAgents(prev => prev.map(a => a.name === data.agent ? { ...a, logs: [...a.logs, data.message] } : a))
        break

      case 'agent_done': {
        setAgents(prev => prev.map(a => a.name === data.agent ? { ...a, status: 'done' } : a))
        const AGENT_PROGRESS: Record<string, WorkflowProgress> = {
          orchestrateur: { percent: 22, label: 'Paramètres extraits' },
          architecte:    { percent: 38, label: 'Structure définie' },
          conseiller:    { percent: 48, label: 'Analyse pédagogique prête' },
          generateur:    { percent: 80, label: 'Activités générées' },
          reviewer:      { percent: 94, label: 'Révision terminée' },
        }
        if (AGENT_PROGRESS[data.agent]) setProgress(AGENT_PROGRESS[data.agent])
        break
      }

      case 'agent_error':
        setAgents(prev => prev.map(a =>
          a.name === data.agent ? { ...a, status: 'error', logs: [...a.logs, `❌ ${data.error}`] } : a
        ))
        break

      // Gate : la structure est prête, on attend le choix pédagogique de l'enseignant.
      case 'awaiting_pedagogy':
        setPendingStructure({
          workflowId: data.workflowId,
          architecture: data.architecture,
          recommendations: data.recommendations,
        })
        setGenerationStep('pedagogy_gate')
        setProgress({ percent: 50, label: 'En attente de votre choix pédagogique…' })
        setIsRunning(false)
        break

      case 'workflow_done':
        if (data.sequence) editor.setSequence(data.sequence)
        setReview(data.review)
        setGenerationStep('done')
        setPendingStructure(null)
        setProgress({ percent: 100, label: 'Séquence prête !' })
        break

      case 'workflow_error':
        setError(data.error)
        break
    }
  }, [editor])

  // Lit un flux SSE jusqu'à sa fin en appliquant chaque événement.
  const consumeStream = useCallback(async (response: Response) => {
    if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Pas de stream disponible')

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        handleEvent(JSON.parse(line.slice(6)))
      }
    }
  }, [handleEvent])

  // Phase 1 (depuis la modale) : structure la séquence, puis ouvre le gate pédagogique.
  const handleGenerate = useCallback(async (texte: string, refs: string[]) => {
    setDemande(texte)
    setCorpusRefs(refs)
    setGenerationStep('generating')
    setIsRunning(true)
    setError(null)
    setShowPipeline(true)
    setShowModal(false)
    abortRef.current = new AbortController()
    try {
      const response = await fetch('/api/generate/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demande: texte, provider, corpus_refs: refs }),
        signal: abortRef.current.signal,
      })
      await consumeStream(response)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }, [provider, consumeStream])

  // Phase 2 : l'enseignant a validé les modes → génération des activités.
  const handleConfirmPedagogy = useCallback(async (choices: SeancePedagogieChoice[]) => {
    if (!pendingStructure) return
    setGenerationStep('generating')
    setIsRunning(true)
    setError(null)
    setShowPipeline(true)
    abortRef.current = new AbortController()
    try {
      const response = await fetch('/api/generate/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: pendingStructure.workflowId,
          architecture: pendingStructure.architecture,
          pedagogie: choices,
          provider,
          corpus_refs: corpusRefs,
        }),
        signal: abortRef.current.signal,
      })
      await consumeStream(response)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }, [pendingStructure, provider, corpusRefs, consumeStream])

  const handleSave = useCallback(async () => {
    if (!editor.sequence) return
    await store.save(editor.sequence, review)
  }, [editor.sequence, review, store])

  // Génère le bundle « évaluation finale ». Sauvegarde d'abord la séquence (la
  // ressource est rattachée par FK à la séquence en base), puis appelle l'API
  // d'orchestration. Retourne la liste plate des ressources générées.
  const handleGenerateEvaluation = useCallback(async (consignes?: string) => {
    if (!editor.sequence) throw new Error('Aucune séquence à évaluer.')
    // Garantit l'existence de la séquence en base (contrainte FK)
    await store.save(editor.sequence, review)
    const res = await fetch('/api/generate/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: editor.sequence.id,
        sequence: editor.sequence,
        provider,
        consignes,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur serveur')
    return [data.sujet.professeur, data.sujet.eleve, data.grille.eleve]
  }, [editor.sequence, review, provider, store])

  // Génère la fiche de préparation d'une séance. Même contrat que l'évaluation
  // finale : sauvegarde préalable (la fiche est rattachée par FK à la séance en
  // base), puis appel de l'API d'orchestration. Retourne la fiche générée.
  const handleGeneratePreparation = useCallback(async (seanceId: string, consignes?: string) => {
    if (!editor.sequence) throw new Error('Aucune séquence en cours.')
    // Garantit l'existence de la séquence ET de la séance en base (contrainte FK)
    await store.save(editor.sequence, review)
    const res = await fetch('/api/generate/preparation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequenceId: editor.sequence.id,
        seanceId,
        sequence: editor.sequence,
        provider,
        consignes,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur serveur')
    return data.fiche
  }, [editor.sequence, review, provider, store])

  // Relance le Reviewer sur la séquence courante (y compris après édition).
  // Produit une review au format structuré → correctifs au clic disponibles.
  const handleRunReview = useCallback(async () => {
    if (!editor.sequence || reviewing) return
    setReviewing(true)
    setError(null)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: editor.sequence, provider, previousReview: review }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur serveur')
      setReview(data.review)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setReviewing(false)
    }
  }, [editor.sequence, provider, reviewing, review])

  const handleLoad = useCallback(async (id: string) => {
    const result = await store.load(id)
    if (result) {
      editor.setSequence(result.sequence)
      setReview(result.review)
    }
  }, [store, editor])

  const handleDelete = useCallback(async (id: string) => {
    await store.remove(id)
  }, [store])

  const handleExportHTML = useCallback(() => {
    if (!editor.sequence) return

    const html = generateHTML(editor.sequence, review)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editor.sequence.titre.replace(/\s+/g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [editor.sequence, review])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm flex-shrink-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-900/50 border border-primary-700/50">
              <Sparkles className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Atelier</h1>
              <p className="text-xs text-gray-500">Système agentique de conception de cours</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setView((v) => (v === 'corpus' ? 'sequences' : 'corpus'))}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all',
                view === 'corpus'
                  ? 'bg-blue-900/40 border-blue-700/50 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-blue-400 hover:border-blue-700/50',
              )}
            >
              <Library className="h-3.5 w-3.5" />
              {view === 'corpus' ? 'Séquences' : 'Mon corpus'}
            </button>
            <ProviderSwitch
              provider={provider}
              onSwitch={setProvider}
              disabled={isRunning}
            />
            <button
              onClick={() => setShowPipeline(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-purple-400 hover:border-purple-700/50 transition-all"
            >
              <Bot className="h-3.5 w-3.5" />
              Pipeline
            </button>
            <button
              onClick={() => setShowLogs(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-green-400 hover:border-green-700/50 transition-all"
            >
              <Terminal className="h-3.5 w-3.5" />
              Logs LLM
            </button>
          </div>
        </div>
      </header>

      {/* Panel Logs LLM */}
      <LLMLogsPanel isOpen={showLogs} onClose={() => setShowLogs(false)} />

      {/* Modale de génération */}
      <GenerateModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); if (!isRunning) resetState() }}
        provider={provider}
        onSwitchProvider={setProvider}
        onGenerate={handleGenerate}
      />

      {/* Panel Pipeline Agentique */}
      <PipelinePanel
        isOpen={showPipeline}
        onClose={() => setShowPipeline(false)}
        agents={agents}
        progress={progress}
        isRunning={isRunning}
        reactSteps={reactSteps}
      />

      {/* Main content */}
      {view === 'corpus' ? (
        <main className="flex-1 overflow-y-auto w-full scrollbar-thin">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <CorpusManager provider={provider} />
          </div>
        </main>
      ) : (
      <main className="flex-1 overflow-hidden w-full">
        <div className="max-w-7xl mx-auto h-full px-4 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Colonne gauche : Séquences sauvegardées */}
          <div className="lg:col-span-3 h-full overflow-y-auto py-6 scrollbar-thin">
            <SavedSequences
              sequences={store.savedList}
              loading={store.loading}
              onLoad={handleLoad}
              onDelete={handleDelete}
              onRefresh={store.refresh}
              onNew={() => { resetState(); setShowModal(true) }}
            />
          </div>

          {/* Colonne droite : Résultats */}
          <div className="lg:col-span-9 h-full overflow-y-auto py-6 space-y-6 scrollbar-thin">

            {/* Résultat : Review */}
            <AnimatePresence>
              {review && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ReviewPanel
                    review={review}
                    editor={editor}
                    provider={provider}
                    onRerun={handleRunReview}
                    rerunning={reviewing}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Résultat : Éditeur de séquence */}
            <AnimatePresence>
              {editor.sequence && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Boutons sauvegarde et export */}
                  <div className="flex justify-end gap-2">
                    {!review && (
                      <button
                        onClick={handleRunReview}
                        disabled={reviewing}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-900/40 border border-amber-700/50 hover:bg-amber-800/50 text-amber-200 rounded-lg text-sm transition-all disabled:opacity-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {reviewing ? 'Analyse…' : 'Relecture qualité'}
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={store.loading}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm transition-all disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Sauvegarder
                    </button>
                    <button
                      onClick={handleExportHTML}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-all"
                    >
                      <Download className="h-4 w-4" />
                      Exporter HTML
                    </button>
                  </div>

                  <SequenceEditor editor={editor} provider={provider} onGenerateEvaluation={handleGenerateEvaluation} onGeneratePreparation={handleGeneratePreparation} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gate : validation pédagogique (enseignement explicite) */}
            <AnimatePresence>
              {generationStep === 'pedagogy_gate' && pendingStructure && !editor.sequence && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PedagogyGate
                    architecture={pendingStructure.architecture}
                    recommendations={pendingStructure.recommendations}
                    onConfirm={handleConfirmPedagogy}
                    onCancel={resetState}
                    loading={isRunning}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* État : génération en cours */}
            {isRunning && !editor.sequence && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <div className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 border border-primary-800/50 mb-6">
                  <Sparkles className="h-7 w-7 text-primary-400" />
                  <span className="absolute inset-0 rounded-2xl border border-primary-500/30 animate-ping" />
                </div>
                <h2 className="text-base font-medium text-gray-300 mb-1">Génération en cours…</h2>
                <p className="text-xs text-gray-600">
                  Suivez le pipeline agentique dans le panneau latéral.
                </p>
              </motion.div>
            )}

            {/* État initial */}
            {!isRunning && !editor.sequence && generationStep !== 'pedagogy_gate' && (
              <div className="text-center py-20">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 border border-gray-800 mb-4">
                  <Sparkles className="h-8 w-8 text-gray-600" />
                </div>
                <h2 className="text-lg font-medium text-gray-400 mb-3">Prêt à créer</h2>
                <button
                  onClick={() => { resetState(); setShowModal(true) }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-500/20 mx-auto"
                >
                  <Sparkles className="h-4 w-4" />
                  Nouvelle séquence
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
      )}

    </div>
  )
}

// === Générateur HTML pour l'export ===

function generateHTML(sequence: any, review: any): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sequence.titre}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { color: #2d3748; margin-bottom: 0.5rem; font-size: 1.8rem; }
    h2 { color: #4a5568; margin: 1.5rem 0 0.75rem; font-size: 1.3rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    h3 { color: #2d3748; margin: 1rem 0 0.5rem; font-size: 1.1rem; }
    .meta { color: #718096; font-size: 0.9rem; margin-bottom: 1rem; }
    .problematique { font-style: italic; color: #5a67d8; margin: 1rem 0; font-size: 1.1rem; }
    .objectifs, .competences { list-style: none; padding: 0; }
    .objectifs li, .competences li { padding: 0.3rem 0; padding-left: 1.5rem; position: relative; }
    .objectifs li::before { content: "🎯"; position: absolute; left: 0; }
    .competences li::before { content: "⭐"; position: absolute; left: 0; }
    .seance { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; }
    .seance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .seance-num { background: #5a67d8; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem; }
    .duree { color: #718096; font-size: 0.85rem; }
    .activite { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; margin: 0.75rem 0; }
    .activite-type { display: inline-block; font-size: 0.75rem; text-transform: uppercase; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 4px; background: #edf2f7; color: #4a5568; }
    .activite-duree { color: #a0aec0; font-size: 0.8rem; }
    .consigne { margin-top: 0.5rem; color: #4a5568; font-size: 0.9rem; }
    .score { font-size: 2rem; font-weight: bold; text-align: center; padding: 1rem; }
    .score.good { color: #38a169; }
    .score.medium { color: #d69e2e; }
    .score.bad { color: #e53e3e; }
    @media print { body { max-width: 100%; } .seance { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${sequence.titre}</h1>
  <p class="meta">${sequence.niveau} — ${sequence.theme}</p>
  ${sequence.problematique ? `<p class="problematique">« ${sequence.problematique} »</p>` : ''}
  
  <h2>Objectifs</h2>
  <ul class="objectifs">
    ${sequence.objectifs.map((o: string) => `<li>${o}</li>`).join('\n    ')}
  </ul>
  
  <h2>Compétences</h2>
  <ul class="competences">
    ${sequence.competences.map((c: string) => `<li>${c}</li>`).join('\n    ')}
  </ul>
  
  <h2>Séances</h2>
  ${sequence.seances.map((s: any) => `
  <div class="seance">
    <div class="seance-header">
      <h3><span class="seance-num">${s.numero}</span> ${s.titre}</h3>
      <span class="duree">${s.duree} min</span>
    </div>
    ${s.activites.map((a: any) => `
    <div class="activite">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${a.titre}</strong>
        <span class="activite-duree">${a.duree} min</span>
      </div>
      <span class="activite-type">${a.type}</span>
      <p class="consigne">${a.consigne}</p>
    </div>`).join('')}
  </div>`).join('')}
  
  ${sequence.evaluation_finale ? `
  <h2>Évaluation finale</h2>
  <p>${sequence.evaluation_finale}</p>` : ''}
  
  ${review ? `
  <h2>Relecture qualité</h2>
  <p class="score ${review.score_qualite >= 80 ? 'good' : review.score_qualite >= 60 ? 'medium' : 'bad'}">${review.score_qualite}/100</p>
  <p>${review.resume}</p>` : ''}
  
  <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid #e2e8f0;color:#a0aec0;font-size:0.8rem;text-align:center">
    Généré par l'Atelier Pédagogique Agentique — ${new Date().toLocaleDateString('fr-FR')}
  </footer>
</body>
</html>`
}
