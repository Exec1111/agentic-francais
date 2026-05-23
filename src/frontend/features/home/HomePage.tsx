'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, RotateCcw, Download, Terminal, Save, Loader2 } from 'lucide-react'
import { WorkflowPipeline } from '@/frontend/components/WorkflowPipeline'
import { SequenceEditor } from '@/frontend/components/SequenceEditor'
import { ReviewPanel } from '@/frontend/components/ReviewPanel'
import { ProviderSwitch } from '@/frontend/components/ProviderSwitch'
import { ReactTrace, ReactStepData } from '@/frontend/components/ReactTrace'
import { LLMLogsPanel } from '@/frontend/components/LLMLogsPanel'
import { SavedSequences } from '@/frontend/components/SavedSequences'
import { CorpusSelector } from '@/frontend/components/CorpusSelector'
import { useSequenceEditor } from '@/frontend/hooks/useSequenceEditor'
import { useSequenceStore } from '@/frontend/hooks/useSequenceStore'
import { cn } from '@/shared/utils'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'

type AgentName = 'orchestrateur' | 'architecte' | 'generateur' | 'reviewer'
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  name: AgentName
  status: AgentStatus
  logs: string[]
}

type GenerationStep = 'idle' | 'suggesting' | 'corpus_selection' | 'generating' | 'done'

export default function HomePage() {
  const [demande, setDemande] = useState('')
  const [provider, setProvider] = useState<'ollama' | 'openai'>('ollama')
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle')
  const [corpusSuggest, setCorpusSuggest] = useState<CorpusSuggestResponse | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [agents, setAgents] = useState<AgentState[]>([
    { name: 'orchestrateur', status: 'idle', logs: [] },
    { name: 'architecte', status: 'idle', logs: [] },
    { name: 'generateur', status: 'idle', logs: [] },
    { name: 'reviewer', status: 'idle', logs: [] },
  ])
  const [reactSteps, setReactSteps] = useState<ReactStepData[]>([])
  const editor = useSequenceEditor()
  const [review, setReview] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
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
    setAgents([
      { name: 'orchestrateur', status: 'idle', logs: [] },
      { name: 'architecte', status: 'idle', logs: [] },
      { name: 'generateur', status: 'idle', logs: [] },
      { name: 'reviewer', status: 'idle', logs: [] },
    ])
    setReactSteps([])
    setReview(null)
    setError(null)
    setGenerationStep('idle')
    setCorpusSuggest(null)
  }, [])

  // Étape 1 : suggérer le corpus avant de lancer le workflow
  const handleSubmit = useCallback(async () => {
    if (!demande.trim() || isRunning) return
    resetState()
    setGenerationStep('suggesting')
    try {
      const res = await fetch('/api/corpus/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demande, provider }),
      })
      const data: CorpusSuggestResponse = await res.json()
      setCorpusSuggest(data)
      setGenerationStep('corpus_selection')
    } catch {
      // Si la suggestion échoue, on lance quand même sans corpus
      handleGenerate([])
    }
  }, [demande, provider, isRunning, resetState])

  // Étape 2 : lancer le vrai workflow avec les refs sélectionnées
  const handleGenerate = useCallback(async (corpusRefs: string[]) => {
    setGenerationStep('generating')
    setIsRunning(true)
    setError(null)

    abortRef.current = new AbortController()

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demande, provider, corpus_refs: corpusRefs }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

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
          const data = JSON.parse(line.slice(6))

          switch (data.type) {
            // === Événements ReAct ===
            case 'react_thought':
              setReactSteps(prev => {
                const existing = prev.find(s => s.step === data.step)
                if (existing) {
                  return prev.map(s => s.step === data.step ? { ...s, thought: data.thought, status: 'thinking' } : s)
                }
                return [...prev, { step: data.step, thought: data.thought, status: 'thinking' }]
              })
              break

            case 'react_action':
              setReactSteps(prev => prev.map(s =>
                s.step === data.step ? { ...s, action: data.action, actionInput: data.input, status: 'acting' } : s
              ))
              break

            case 'react_observation':
              setReactSteps(prev => prev.map(s =>
                s.step === data.step ? { ...s, observation: data.observation, status: 'done' } : s
              ))
              break

            // === Événements agents ===
            case 'agent_start':
              setAgents(prev => prev.map(a =>
                a.name === data.agent ? { ...a, status: 'running' } : a
              ))
              break

            case 'agent_log':
              setAgents(prev => prev.map(a =>
                a.name === data.agent ? { ...a, logs: [...a.logs, data.message] } : a
              ))
              break

            case 'agent_done':
              setAgents(prev => prev.map(a =>
                a.name === data.agent ? { ...a, status: 'done' } : a
              ))
              break

            case 'agent_error':
              setAgents(prev => prev.map(a =>
                a.name === data.agent ? { ...a, status: 'error', logs: [...a.logs, `❌ ${data.error}`] } : a
              ))
              break

            case 'workflow_done':
              if (data.sequence) editor.setSequence(data.sequence)
              setReview(data.review)
              setGenerationStep('done')
              break

            case 'workflow_error':
              setError(data.error)
              break
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setIsRunning(false)
    }
  }, [demande, provider])

  const handleSave = useCallback(async () => {
    if (!editor.sequence) return
    await store.save(editor.sequence, review)
  }, [editor.sequence, review, store])

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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
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
            <ProviderSwitch
              provider={provider}
              onSwitch={setProvider}
              disabled={isRunning}
            />
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

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Colonne gauche : Pipeline + Trace ReAct */}
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="sticky top-20 space-y-6">
              <WorkflowPipeline agents={agents} />
              <ReactTrace steps={reactSteps} />
            </div>
          </div>

          {/* Colonne droite : Saisie + Résultats */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">

            {/* Zone de saisie */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Décrivez votre besoin pédagogique
              </label>
              <div className="flex gap-3">
                <textarea
                  value={demande}
                  onChange={(e) => setDemande(e.target.value)}
                  placeholder="Ex: Prépare une séquence de 5e sur le récit d'aventure avec 5 séances et une évaluation finale."
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 resize-none"
                  rows={3}
                  disabled={isRunning}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) handleSubmit()
                  }}
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSubmit}
                    disabled={isRunning || generationStep === 'suggesting' || !demande.trim()}
                    className={cn(
                      'flex items-center justify-center h-10 w-10 rounded-lg transition-all',
                      isRunning || generationStep === 'suggesting' || !demande.trim()
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-500 shadow-lg shadow-primary-500/20',
                    )}
                  >
                    {generationStep === 'suggesting'
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </button>
                  {(editor.sequence || error || generationStep !== 'idle') && (
                    <button
                      onClick={() => { resetState(); setDemande('') }}
                      className="flex items-center justify-center h-10 w-10 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-all"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">Ctrl+Enter pour envoyer</p>
            </div>

            {/* Étape corpus */}
            <AnimatePresence>
              {generationStep === 'corpus_selection' && corpusSuggest && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <CorpusSelector
                    response={corpusSuggest}
                    onConfirm={(refs) => handleGenerate(refs)}
                    onSkip={() => handleGenerate([])}
                    isLoading={isRunning}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-950/50 border border-red-800/50 rounded-xl p-4"
                >
                  <p className="text-sm text-red-300">❌ {error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Résultat : Review */}
            <AnimatePresence>
              {review && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ReviewPanel review={review} />
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

                  <SequenceEditor editor={editor} provider={provider} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Séquences sauvegardées */}
            <SavedSequences
              sequences={store.savedList}
              loading={store.loading}
              onLoad={handleLoad}
              onDelete={handleDelete}
              onRefresh={store.refresh}
            />

            {/* État initial */}
            {!isRunning && !editor.sequence && !error && (
              <div className="text-center py-20">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 border border-gray-800 mb-4">
                  <Sparkles className="h-8 w-8 text-gray-600" />
                </div>
                <h2 className="text-lg font-medium text-gray-400 mb-2">
                  Prêt à créer
                </h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  Décrivez votre besoin pédagogique et les agents spécialisés construiront
                  votre séquence étape par étape.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
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
