'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, FileText, Loader2, Plus, Search, Sparkles, Upload, X } from 'lucide-react'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'
import type { CorpusItem } from '@/shared/schemas'
import type { CorpusIntent, CorpusPassageSelection, CorpusStudyType, CorpusWorkflowSelection } from '@/shared/corpus-workflow'
import { TextDepositPanel } from './TextDepositPanel'
import { cn } from '@/shared/utils'

type Meta = Omit<CorpusItem, 'contenu'> & { has_content?: boolean }
type Recommendation = CorpusSuggestResponse['recommendations'][number]
type PassageProposal = {
  titre: string
  angle: string
  debut_texte: string
  fin_texte: string
  pourquoi: string
  contenu: string
  found: boolean
}

interface Props {
  demande: string
  provider: 'ollama' | 'openai'
  initialResponse: CorpusSuggestResponse
  intent: CorpusIntent
  studyType: CorpusStudyType
  onBack: () => void
  onConfirm: (selection: CorpusWorkflowSelection) => void
}

function SupportCard({ item, selected, onToggle, reason, disabled }: {
  item: Meta
  selected: boolean
  onToggle: () => void
  reason?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'w-full text-left rounded-xl border p-3 transition-colors disabled:opacity-50',
        selected ? 'border-emerald-500/70 bg-emerald-950/30' : 'border-gray-800 bg-gray-900/50 hover:border-gray-700',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border', selected ? 'border-emerald-400 bg-emerald-500 text-gray-950' : 'border-gray-600')}>
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-100">{item.oeuvre}</span>
          <span className="block text-xs text-gray-400">{item.auteur} · {item.titre}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-gray-500">
            <span className="rounded border border-gray-700 px-1.5 py-0.5">{item.type === 'extrait' ? 'Extrait' : 'Œuvre complète courte'}</span>
            {item.has_content !== false && <span className="rounded border border-emerald-800/60 px-1.5 py-0.5 text-emerald-400">Texte exploitable</span>}
            {item.verified && <span className="rounded border border-blue-800/60 px-1.5 py-0.5 text-blue-400">Vérifié</span>}
          </span>
          {reason && <span className="mt-2 block text-xs leading-relaxed text-amber-300/80">{reason}</span>}
        </span>
      </div>
    </button>
  )
}

export function CorpusWorkflowSelector({ demande, provider, initialResponse, intent, studyType, onBack, onConfirm }: Props) {
  const [response, setResponse] = useState<CorpusSuggestResponse>(initialResponse)
  const [selected, setSelected] = useState<Meta[]>([])
  const [passages, setPassages] = useState<CorpusPassageSelection[]>([])
  const [passageProposals, setPassageProposals] = useState<PassageProposal[]>([])
  const [passageLoading, setPassageLoading] = useState(false)
  const [passageError, setPassageError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Meta[]>([])
  const [depositFor, setDepositFor] = useState<{ auteur: string; oeuvre: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const all = [
      ...response.corpus_found,
      ...response.recommendations.map((r) => r.item),
      ...searchResults,
      ...selected,
    ]
    return Array.from(new Map(all.map((item) => [item.id, item])).values())
  }, [response, searchResults, selected])
  const reasons = useMemo(() => new Map(response.recommendations.map((r) => [r.item.id, r.raison])), [response])
  const selectedIds = new Set(selected.map((item) => item.id))
  const selectedWorkCount = new Set(selected.map((item) => item.oeuvre.trim().toLocaleLowerCase())).size
  const minWorks = studyType === 'groupement' ? 3 : 1
  const meetsWorkCount = studyType === 'groupement' ? selectedWorkCount >= 3 : selected.length === 1
  const meetsPassage = studyType === 'groupement' || passages.some((p) => p.corpus_id === selected[0]?.id)

  useEffect(() => {
    if (intent === 'identified') return
    let cancelled = false
    fetch('/api/corpus/suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demande, provider, intent }),
    }).then(async (res) => {
      const data = await res.json() as CorpusSuggestResponse
      if (!res.ok) throw new Error(data.error ?? 'Analyse impossible')
      if (!cancelled) setResponse(data)
    }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Analyse impossible') })
    return () => { cancelled = true }
  }, [demande, provider, intent])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const timer = window.setTimeout(() => {
      fetch(`/api/corpus/search?oeuvre=${encodeURIComponent(search)}&limit=20`)
        .then((r) => r.json())
        .then((data) => setSearchResults((data.results ?? []) as Meta[]))
        .catch(() => setSearchResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const toggle = (item: Meta) => {
    setSelected((prev) => prev.some((x) => x.id === item.id) ? prev.filter((x) => x.id !== item.id) : [...prev, item])
    if (studyType === 'oeuvre_integrale' && !selectedIds.has(item.id)) {
      setPassages([])
      setPassageProposals([])
    }
  }

  const proposePassages = async () => {
    const item = selected[0]
    if (!item) return
    setPassageLoading(true)
    setPassageError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(item.id)}/decoupe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, sequenceContext: demande }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Proposition de passages impossible')
      setPassageProposals((data.passages ?? []) as PassageProposal[])
    } catch (e) {
      setPassageError(e instanceof Error ? e.message : 'Proposition de passages impossible')
    } finally { setPassageLoading(false) }
  }

  const choosePassage = (proposal: PassageProposal) => {
    const item = selected[0]
    if (!item || !proposal.found) return
    setPassages([{ id: crypto.randomUUID(), corpus_id: item.id, titre: proposal.titre, angle: proposal.angle, start_anchor: proposal.debut_texte, end_anchor: proposal.fin_texte, source: 'ia' }])
  }

  const confirm = () => {
    if (!meetsWorkCount) { setError(studyType === 'groupement' ? `Sélectionnez au moins 3 œuvres distinctes (${selectedWorkCount}/3).` : 'Sélectionnez une œuvre intégrale.') ; return }
    if (!meetsPassage) { setError('Sélectionnez un passage d’ancrage pour l’œuvre intégrale.') ; return }
    onConfirm({ intent, study_type: studyType, work_refs: selected.map((x) => x.id), passage_selections: passages })
  }

  const workToProvide = intent === 'identified' && response.corpus_found.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-wider text-emerald-400">Gestion des œuvres</p><h3 className="mt-1 text-base font-semibold text-white">{studyType === 'groupement' ? 'Construire un groupement de textes' : 'Choisir une œuvre intégrale'}</h3></div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"><ChevronLeft className="h-3.5 w-3.5" /> Modifier</button>
      </div>
      <p className="text-xs leading-relaxed text-gray-400">{studyType === 'groupement' ? 'Sélectionnez au moins trois œuvres distinctes. Les supports sont déjà exploitables : aucun découpage supplémentaire n’est nécessaire ici.' : 'Sélectionnez une œuvre, puis un passage d’ancrage proposé à partir de votre séquence.'}</p>

      {error && <div className="flex items-center justify-between gap-2 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300"><span>{error}</span><button type="button" onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button></div>}
      {workToProvide && <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200">L’œuvre demandée n’est pas disponible dans le corpus. Fournissez l’extrait exact pour la rendre exploitable.</div>}

      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une œuvre dans mon corpus…" className="w-full rounded-lg border border-gray-800 bg-gray-900 py-2 pl-9 pr-3 text-xs text-gray-200 outline-none focus:border-emerald-600/60" /></div>

      {intent === 'identified' ? <section className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Œuvres identifiées dans votre demande</h4>{response.corpus_found.length > 0 ? response.corpus_found.map((item) => <div key={item.id} className="flex gap-2"><div className="min-w-0 flex-1"><SupportCard item={item} selected={selectedIds.has(item.id)} onToggle={() => toggle(item)} /></div><button type="button" onClick={() => setDepositFor({ auteur: item.auteur, oeuvre: item.oeuvre })} className="self-start rounded-lg border border-gray-700 p-2 text-gray-400 hover:text-white" title="Fournir un autre extrait"><Upload className="h-4 w-4" /></button></div>) : <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-700 p-4"><p className="text-xs text-gray-500">Aucune correspondance exacte dans le corpus.</p><button type="button" onClick={() => setDepositFor({ auteur: '', oeuvre: '' })} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700/70 px-2.5 py-1.5 text-[11px] text-white"><Upload className="h-3 w-3" /> Fournir l’extrait</button></div>}</section> : <section className="space-y-2"><h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400"><Sparkles className="h-3.5 w-3.5" /> Œuvres du corpus les plus pertinentes</h4>{response.recommendations.length > 0 ? response.recommendations.map((rec: Recommendation) => <SupportCard key={rec.item.id} item={rec.item} selected={selectedIds.has(rec.item.id)} onToggle={() => toggle(rec.item)} reason={rec.raison} />) : <p className="rounded-lg border border-dashed border-gray-700 p-4 text-xs text-gray-500">Aucune recommandation exploitable. Recherchez directement dans votre corpus.</p>}</section>}

      {searchResults.length > 0 && <section className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Résultats de recherche</h4>{searchResults.map((item) => <SupportCard key={item.id} item={item} selected={selectedIds.has(item.id)} onToggle={() => toggle(item)} disabled={item.has_content === false} />)}</section>}

      {depositFor && <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/10 p-3"><div className="mb-2 flex justify-between text-xs text-emerald-300"><span>Fournir l’extrait exact</span><button type="button" onClick={() => setDepositFor(null)}><X className="h-4 w-4" /></button></div><TextDepositPanel niveau={response.niveau} defaultAuteur={depositFor.auteur} defaultOeuvre={depositFor.oeuvre} onDeposited={(item) => { setSelected((prev) => [...prev, item]); setDepositFor(null) }} /></div>}

      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3"><p className="text-xs font-semibold text-gray-300">Sélection : {studyType === 'groupement' ? `${selectedWorkCount}/${minWorks} œuvres distinctes` : `${selected.length}/${minWorks} œuvre`}{studyType === 'groupement' ? ' minimum' : ''}</p>{selected.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-300">{item.oeuvre}<button type="button" onClick={() => toggle(item)}><X className="h-3 w-3" /></button></span>)}</div>}</div>

      {studyType === 'oeuvre_integrale' && selected.length === 1 && <section className="space-y-2 rounded-xl border border-blue-800/50 bg-blue-950/10 p-3"><div className="flex items-center justify-between"><h4 className="flex items-center gap-1.5 text-xs font-semibold text-blue-300"><FileText className="h-3.5 w-3.5" /> Passage d’ancrage obligatoire</h4><button type="button" onClick={proposePassages} disabled={passageLoading} className="inline-flex items-center gap-1 rounded-lg bg-blue-700/70 px-2.5 py-1.5 text-[11px] text-white disabled:opacity-50">{passageLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Proposer 3 passages</button></div>{passageError && <p className="text-xs text-red-300">{passageError}</p>}{passages.length > 0 && <p className="text-xs text-emerald-300">Passage retenu : {passages[0].titre} · {passages[0].angle}</p>}{passageProposals.map((proposal) => <button type="button" key={proposal.titre + proposal.debut_texte} onClick={() => choosePassage(proposal)} disabled={!proposal.found} className={cn('w-full rounded-lg border p-2 text-left text-xs', proposal.found ? 'border-gray-700 hover:border-blue-500/70' : 'border-red-900/40 opacity-50')}><strong className="text-gray-200">{proposal.titre}</strong><span className="ml-2 text-blue-300">{proposal.angle}</span><span className="mt-1 block text-gray-400">{proposal.pourquoi}</span></button>)}</section>}

      <button type="button" onClick={confirm} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"><Plus className="h-4 w-4" /> Valider le corpus et construire la séquence</button>
    </div>
  )
}
