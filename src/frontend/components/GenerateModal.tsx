'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Loader2, Send, Sparkles, X } from 'lucide-react'
import { ProviderSwitch } from './ProviderSwitch'
import { CorpusWorkflowSelector } from './CorpusWorkflowSelector'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'
import type { CorpusIntent, CorpusStudyType, CorpusWorkflowSelection } from '@/shared/corpus-workflow'
import { cn } from '@/shared/utils'

type Step = 'input' | 'analysing' | 'qualification' | 'loading_corpus' | 'corpus'

interface GenerateModalProps {
  isOpen: boolean
  onClose: () => void
  provider: 'ollama' | 'openai'
  onSwitchProvider: (p: 'ollama' | 'openai') => void
  onGenerate: (demande: string, selection: CorpusWorkflowSelection) => void
}

export function GenerateModal({ isOpen, onClose, provider, onSwitchProvider, onGenerate }: GenerateModalProps) {
  const [demande, setDemande] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [response, setResponse] = useState<CorpusSuggestResponse | null>(null)
  const [intent, setIntent] = useState<CorpusIntent | null>(null)
  const [studyType, setStudyType] = useState<CorpusStudyType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep('input'); setDemande(''); setResponse(null); setIntent(null); setStudyType(null); setError(null)
  }
  const close = () => { if (step === 'analysing' || step === 'loading_corpus') return; reset(); onClose() }

  const analyse = async () => {
    if (!demande.trim() || step !== 'input') return
    setStep('analysing'); setError(null)
    try {
      const res = await fetch('/api/corpus/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demande, provider }) })
      const data = await res.json() as CorpusSuggestResponse
      if (!res.ok) throw new Error(data.error ?? 'Analyse impossible')
      setResponse(data); setStep('qualification')
    } catch (e) { setError(e instanceof Error ? e.message : 'Analyse impossible'); setStep('input') }
  }

  const chooseIntent = async (nextIntent: CorpusIntent) => {
    setIntent(nextIntent)
    if (studyType) await loadCorpus(nextIntent, studyType)
  }
  const chooseStudyType = async (nextType: CorpusStudyType) => {
    setStudyType(nextType)
    if (intent) await loadCorpus(intent, nextType)
  }
  const loadCorpus = async (nextIntent: CorpusIntent, nextType: CorpusStudyType) => {
    setStep('loading_corpus'); setError(null)
    try {
      const res = await fetch('/api/corpus/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demande, provider, intent: nextIntent, study_type: nextType }) })
      const data = await res.json() as CorpusSuggestResponse
      if (!res.ok) throw new Error(data.error ?? 'Recherche du corpus impossible')
      setResponse(data); setStep('corpus')
    } catch (e) { setError(e instanceof Error ? e.message : 'Recherche du corpus impossible'); setStep('qualification') }
  }

  const backFromCorpus = () => { setStep('qualification'); setError(null) }
  const launch = (selection: CorpusWorkflowSelection) => { const text = demande; reset(); onGenerate(text, selection) }

  return <AnimatePresence>{isOpen && <>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={close} />
    <motion.div initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }} className="fixed inset-x-0 top-[6%] z-[95] mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col px-4">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary-400" /><h2 className="text-sm font-semibold text-white">Construire une nouvelle séquence</h2></div><div className="flex items-center gap-3"><ProviderSwitch provider={provider} onSwitch={onSwitchProvider} disabled={step === 'analysing' || step === 'loading_corpus'} /><button onClick={close} disabled={step === 'analysing' || step === 'loading_corpus'} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-white disabled:opacity-30"><X className="h-4 w-4" /></button></div></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
          <AnimatePresence mode="wait">
            {(step === 'input' || step === 'analysing') && <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><label className="mb-2 block text-xs font-medium text-gray-400">Décrivez votre besoin pédagogique</label><div className="flex gap-3"><textarea value={demande} onChange={(e) => setDemande(e.target.value)} disabled={step === 'analysing'} rows={4} autoFocus placeholder="Ex : Un groupement de textes de 5e sur le récit d'aventure, 5 séances, autour de la peur et du courage." className="flex-1 resize-none rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/30" onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) analyse(); if (e.key === 'Escape') close() }} /><button onClick={analyse} disabled={step !== 'input' || !demande.trim()} className={cn('flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-xl transition-all', step !== 'input' || !demande.trim() ? 'bg-gray-800 text-gray-600' : 'bg-primary-600 text-white hover:bg-primary-500')}>{step === 'analysing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div><p className="mt-1.5 text-xs text-gray-600">Ctrl+Enter · Échap pour fermer</p>{error && <p className="mt-2 text-xs text-red-400">{error}</p>}</motion.div>}
            {step === 'qualification' && response && <motion.div key="qualification" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5"><button type="button" onClick={() => setStep('input')} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white"><ChevronLeft className="h-3.5 w-3.5" /> Modifier la demande</button><div><p className="text-xs uppercase tracking-wider text-emerald-400">Avant de chercher les supports</p><h3 className="mt-1 text-lg font-semibold text-white">Quel rôle les œuvres doivent-elles jouer ?</h3><p className="mt-1 text-xs leading-relaxed text-gray-400">{response.corpus_found.length > 0 ? `${response.corpus_found.length} support(s) correspondent déjà à votre demande.` : 'Aucun support exact n’a encore été identifié dans votre corpus.'}</p></div><div className="grid gap-2"><label className={cn('cursor-pointer rounded-xl border p-3 transition', intent === 'identified' ? 'border-emerald-500/70 bg-emerald-950/30' : 'border-gray-800 hover:border-gray-700')}><input type="radio" className="sr-only" checked={intent === 'identified'} onChange={() => chooseIntent('identified')} /><strong className="block text-sm text-white">J’ai déjà identifié les œuvres</strong><span className="mt-1 block text-xs text-gray-400">Les œuvres citées sont des contraintes. Le système vérifie qu’il dispose de supports exploitables, sans recommander autre chose.</span></label><label className={cn('cursor-pointer rounded-xl border p-3 transition', intent === 'guided' ? 'border-emerald-500/70 bg-emerald-950/30' : 'border-gray-800 hover:border-gray-700')}><input type="radio" className="sr-only" checked={intent === 'guided'} onChange={() => chooseIntent('guided')} /><strong className="block text-sm text-white">J’ai des pistes, aidez-moi à arbitrer</strong><span className="mt-1 block text-xs text-gray-400">Les œuvres citées deviennent des candidates, comparées avec d’autres supports pertinents du corpus.</span></label><label className={cn('cursor-pointer rounded-xl border p-3 transition', intent === 'free' ? 'border-emerald-500/70 bg-emerald-950/30' : 'border-gray-800 hover:border-gray-700')}><input type="radio" className="sr-only" checked={intent === 'free'} onChange={() => chooseIntent('free')} /><strong className="block text-sm text-white">Choisissez librement pour moi</strong><span className="mt-1 block text-xs text-gray-400">Le système propose une shortlist d’œuvres déjà exploitables, alignées sur votre séquence.</span></label></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Type de corpus obligatoire</p><div className="grid grid-cols-2 gap-2"><label className={cn('cursor-pointer rounded-xl border p-3 transition', studyType === 'groupement' ? 'border-blue-500/70 bg-blue-950/30' : 'border-gray-800 hover:border-gray-700')}><input type="radio" className="sr-only" checked={studyType === 'groupement'} onChange={() => chooseStudyType('groupement')} /><strong className="block text-sm text-white">Groupement de textes</strong><span className="mt-1 block text-xs text-gray-400">Au moins 3 œuvres distinctes</span></label><label className={cn('cursor-pointer rounded-xl border p-3 transition', studyType === 'oeuvre_integrale' ? 'border-blue-500/70 bg-blue-950/30' : 'border-gray-800 hover:border-gray-700')}><input type="radio" className="sr-only" checked={studyType === 'oeuvre_integrale'} onChange={() => chooseStudyType('oeuvre_integrale')} /><strong className="block text-sm text-white">Œuvre intégrale</strong><span className="mt-1 block text-xs text-gray-400">Une œuvre + un passage d’ancrage</span></label></div></div>{error && <p className="text-xs text-red-400">{error}</p>}</motion.div>}
            {step === 'loading_corpus' && <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /><p className="text-sm">Recherche des supports exploitables…</p><p className="text-xs text-gray-600">Les œuvres absentes ne seront pas remplacées automatiquement.</p></motion.div>}
            {step === 'corpus' && response && intent && studyType && <motion.div key="corpus" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CorpusWorkflowSelector demande={demande} provider={provider} initialResponse={response} intent={intent} studyType={studyType} onBack={backFromCorpus} onConfirm={launch} /></motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  </>}</AnimatePresence>
}
