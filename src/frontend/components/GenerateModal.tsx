'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2, Sparkles } from 'lucide-react'
import { CorpusSelector } from './CorpusSelector'
import { ProviderSwitch } from './ProviderSwitch'
import { cn } from '@/shared/utils'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'

type Step = 'idle' | 'suggesting' | 'corpus'

interface GenerateModalProps {
  isOpen: boolean
  onClose: () => void
  provider: 'ollama' | 'openai'
  onSwitchProvider: (p: 'ollama' | 'openai') => void
  // Appelé avec la demande finale + refs corpus choisies → ferme la modale et lance le workflow
  onGenerate: (demande: string, corpusRefs: string[]) => void
}

export function GenerateModal({ isOpen, onClose, provider, onSwitchProvider, onGenerate }: GenerateModalProps) {
  const [demande, setDemande] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [corpusSuggest, setCorpusSuggest] = useState<CorpusSuggestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (step === 'suggesting') return // bloquer pendant le fetch
    setStep('idle')
    setDemande('')
    setCorpusSuggest(null)
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!demande.trim() || step !== 'idle') return
    setStep('suggesting')
    setError(null)
    try {
      const res = await fetch('/api/corpus/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demande, provider }),
      })
      const data: CorpusSuggestResponse = await res.json()
      const hasContent = (data.corpus_found && data.corpus_found.length > 0)
        || (data.suggestions && data.suggestions.length > 0)
      if (hasContent) {
        setCorpusSuggest(data)
        setStep('corpus')
      } else {
        launch([])
      }
    } catch {
      launch([])
    }
  }

  const launch = (corpusRefs: string[]) => {
    const texte = demande
    setStep('idle')
    setDemande('')
    setCorpusSuggest(null)
    setError(null)
    onGenerate(texte, corpusRefs)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
            onClick={step !== 'suggesting' ? handleClose : undefined}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="fixed inset-x-0 top-[8%] mx-auto z-[95] w-full max-w-2xl px-4 max-h-[85vh] flex flex-col"
          >
            <div className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-0">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-400" />
                  <h2 className="text-sm font-semibold text-white">Nouvelle séquence</h2>
                </div>
                <div className="flex items-center gap-3">
                  <ProviderSwitch provider={provider} onSwitch={onSwitchProvider} disabled={step === 'suggesting'} />
                  <button
                    onClick={handleClose}
                    disabled={step === 'suggesting'}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Corps */}
              <div className="p-5 space-y-4 overflow-y-auto scrollbar-thin flex-1">

                {/* Saisie */}
                <AnimatePresence mode="wait">
                  {step !== 'corpus' && (
                    <motion.div
                      key="input"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Décrivez votre besoin pédagogique
                      </label>
                      <div className="flex gap-3">
                        <textarea
                          value={demande}
                          onChange={(e) => setDemande(e.target.value)}
                          placeholder="Ex : Séquence de 5e sur le récit d'aventure, 5 séances, évaluation finale."
                          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 resize-none"
                          rows={3}
                          disabled={step === 'suggesting'}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.ctrlKey) handleSubmit()
                            if (e.key === 'Escape') handleClose()
                          }}
                          autoFocus
                        />
                        <button
                          onClick={handleSubmit}
                          disabled={step !== 'idle' || !demande.trim()}
                          className={cn(
                            'flex items-center justify-center h-10 w-10 rounded-xl transition-all self-start mt-0.5',
                            step !== 'idle' || !demande.trim()
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-primary-600 text-white hover:bg-primary-500 shadow-lg shadow-primary-500/20',
                          )}
                        >
                          {step === 'suggesting'
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Send className="h-4 w-4" />
                          }
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5">Ctrl+Enter · Échap pour fermer</p>

                      {error && (
                        <p className="mt-2 text-xs text-red-400">❌ {error}</p>
                      )}
                    </motion.div>
                  )}

                  {/* Sélection corpus */}
                  {step === 'corpus' && corpusSuggest && (
                    <motion.div
                      key="corpus"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <CorpusSelector
                        response={corpusSuggest}
                        onConfirm={(refs) => launch(refs)}
                        onSkip={() => launch([])}
                        isLoading={false}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
