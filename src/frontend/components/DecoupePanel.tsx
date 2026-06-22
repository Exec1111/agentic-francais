'use client'

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scissors, X, Loader2, AlertTriangle, Check, Trash2, Plus, Sparkles, TextCursorInput, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { CorpusItem } from '@/shared/schemas'
import type { CorpusDecoupeResponse } from '@/app/api/corpus/[id]/decoupe/route'
import type { CorpusPassagesResponse } from '@/app/api/corpus/[id]/passages/route'

interface DecoupePanelProps {
  /** Id de l'œuvre à découper — null ferme le panneau. */
  oeuvreId: string | null
  /** Libellé affiché (auteur, œuvre). */
  oeuvreLabel?: string
  provider: 'ollama' | 'openai'
  onClose: () => void
  /** Appelé avec les passages créés après enregistrement. */
  onCreated?: (items: CorpusItem[]) => void
}

interface DraftPassage {
  titre: string
  angle: string
  contenu: string
  themes: string[]
  found: boolean
  keep: boolean
  source: 'manuel' | 'ia'
}

/**
 * Backoffice de découpe d'une œuvre en passages.
 *
 * Deux voies, au choix de l'utilisateur (aucune n'est déclenchée d'office) :
 *  - MANUEL : sélectionner une portion du texte de l'œuvre puis l'ajouter comme
 *    passage (fidélité garantie : le contenu est la sélection exacte).
 *  - IA : demander une proposition de découpage (ancres résolues côté serveur).
 * Les deux alimentent la même liste éditable, que le prof valide et enregistre.
 */
export function DecoupePanel({ oeuvreId, oeuvreLabel, provider, onClose, onCreated }: DecoupePanelProps) {
  const [oeuvre, setOeuvre] = useState<CorpusItem | null>(null)
  const [drafts, setDrafts] = useState<DraftPassage[]>([])
  const [loadingOeuvre, setLoadingOeuvre] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState('')
  const textRef = useRef<HTMLDivElement>(null)

  // Recherche DANS le texte en cours de découpe (pour sauter à un passage).
  const [find, setFind] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)
  const currentMarkRef = useRef<HTMLElement>(null)

  // Offsets des occurrences de la recherche dans le texte (insensible à la casse).
  const matchOffsets = useMemo(() => {
    const content = oeuvre?.contenu ?? ''
    const q = find.trim().toLowerCase()
    if (!q) return [] as number[]
    const hay = content.toLowerCase()
    const offsets: number[] = []
    let from = hay.indexOf(q)
    while (from !== -1) {
      offsets.push(from)
      from = hay.indexOf(q, from + q.length)
    }
    return offsets
  }, [oeuvre?.contenu, find])

  // Réinitialise l'occurrence courante quand la recherche change.
  useEffect(() => { setCurrentMatch(0) }, [find])

  // Fait défiler jusqu'à l'occurrence courante.
  useEffect(() => {
    if (matchOffsets.length > 0) currentMarkRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch, matchOffsets])

  const gotoMatch = (delta: number) => {
    if (matchOffsets.length === 0) return
    setCurrentMatch((c) => (c + delta + matchOffsets.length) % matchOffsets.length)
  }

  // Construit le rendu du texte avec les occurrences surlignées.
  const renderedText = useMemo(() => {
    const content = oeuvre?.contenu ?? ''
    const q = find.trim()
    if (!q || matchOffsets.length === 0) return content
    const len = q.length
    const nodes: ReactNode[] = []
    let cursor = 0
    matchOffsets.forEach((off, i) => {
      if (off > cursor) nodes.push(content.slice(cursor, off))
      const isCurrent = i === currentMatch
      nodes.push(
        <mark
          key={off}
          ref={isCurrent ? currentMarkRef : undefined}
          className={cn(
            'rounded-sm',
            isCurrent ? 'bg-amber-400 text-black' : 'bg-amber-500/25 text-amber-100',
          )}
        >
          {content.slice(off, off + len)}
        </mark>,
      )
      cursor = off + len
    })
    if (cursor < content.length) nodes.push(content.slice(cursor))
    return nodes
  }, [oeuvre?.contenu, find, matchOffsets, currentMatch])

  // À l'ouverture : on charge le TEXTE de l'œuvre (pas d'appel IA).
  useEffect(() => {
    if (!oeuvreId) {
      setOeuvre(null)
      setDrafts([])
      setSelection('')
      setError(null)
      setFind('')
      return
    }
    let cancelled = false
    setLoadingOeuvre(true)
    setError(null)
    fetch(`/api/corpus/${encodeURIComponent(oeuvreId)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
        return data.item as CorpusItem
      })
      .then((it) => { if (!cancelled) setOeuvre(it) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible') })
      .finally(() => { if (!cancelled) setLoadingOeuvre(false) })
    return () => { cancelled = true }
  }, [oeuvreId])

  // Échap pour fermer
  useEffect(() => {
    if (!oeuvreId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [oeuvreId, onClose, saving])

  // Capture la sélection courante, uniquement si elle est dans le pavé de texte.
  const captureSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !textRef.current) { setSelection(''); return }
    const within = sel.anchorNode && textRef.current.contains(sel.anchorNode)
    setSelection(within ? sel.toString().trim() : '')
  }, [])

  const ajouterSelection = () => {
    if (!selection) return
    setDrafts((prev) => [
      ...prev,
      { titre: '', angle: '', contenu: selection, themes: [], found: true, keep: true, source: 'manuel' },
    ])
    setSelection('')
    window.getSelection()?.removeAllRanges()
  }

  // Découpage assisté par l'IA — ajouté à la suite des passages manuels.
  const proposerIA = async () => {
    if (!oeuvreId || aiLoading) return
    setAiLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(oeuvreId)}/decoupe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      const { passages } = data as CorpusDecoupeResponse
      setDrafts((prev) => [
        ...prev,
        ...passages.map((p): DraftPassage => ({
          titre: p.titre,
          angle: p.angle,
          contenu: p.contenu,
          themes: p.themes ?? [],
          found: p.found,
          keep: p.found,
          source: 'ia',
        })),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La découpe IA a échoué')
    } finally {
      setAiLoading(false)
    }
  }

  const patch = (i: number, change: Partial<DraftPassage>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...change } : d)))
  const remove = (i: number) => setDrafts((prev) => prev.filter((_, idx) => idx !== i))

  const retenus = drafts.filter((d) => d.keep && d.contenu.trim() && d.titre.trim())

  const enregistrer = async () => {
    if (!oeuvreId || saving || retenus.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(oeuvreId)}/passages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passages: retenus.map((d) => ({
            titre: d.titre.trim(),
            angle: d.angle.trim(),
            contenu: d.contenu.trim(),
            themes: d.themes,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onCreated?.((data as CorpusPassagesResponse).items)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'enregistrement a échoué")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {oeuvreId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black backdrop-blur-sm z-[110]"
            onClick={() => { if (!saving) onClose() }}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-950/97 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-[111] flex flex-col text-gray-200"
          >
            {/* En-tête */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-start gap-3 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 mt-0.5 bg-amber-900/40 border-amber-700/50 text-amber-400">
                <Scissors className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-white leading-snug">Découper en passages</h2>
                {oeuvreLabel && <p className="text-sm text-gray-400 mt-0.5 truncate">{oeuvreLabel}</p>}
              </div>
              <button
                onClick={() => { if (!saving) onClose() }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all shrink-0"
                title="Fermer (Échap)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {loadingOeuvre && (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Chargement du texte…</span>
                </div>
              )}

              {oeuvre && (
                <>
                  {/* Découpage MANUEL : sélectionner dans le texte */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <TextCursorInput className="h-3 w-3 text-emerald-400" />
                      Découper à la main
                    </p>
                    <p className="text-xs text-gray-500">
                      Sélectionnez une portion du texte ci-dessous, puis ajoutez-la comme passage.
                    </p>

                    {/* Recherche dans le texte (pour sauter directement à un passage) */}
                    <div className="relative flex items-center">
                      <Search className="absolute left-2.5 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={find}
                        onChange={(e) => setFind(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1) }
                        }}
                        placeholder="Rechercher dans le texte…"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-28 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
                      />
                      <div className="absolute right-1.5 flex items-center gap-1">
                        {find.trim() && (
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {matchOffsets.length > 0 ? `${currentMatch + 1}/${matchOffsets.length}` : '0/0'}
                          </span>
                        )}
                        <button
                          onClick={() => gotoMatch(-1)}
                          disabled={matchOffsets.length === 0}
                          className="p-1 rounded text-gray-500 hover:text-amber-400 disabled:opacity-30 transition-colors"
                          title="Occurrence précédente (Maj+Entrée)"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => gotoMatch(1)}
                          disabled={matchOffsets.length === 0}
                          className="p-1 rounded text-gray-500 hover:text-amber-400 disabled:opacity-30 transition-colors"
                          title="Occurrence suivante (Entrée)"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div
                      ref={textRef}
                      onMouseUp={captureSelection}
                      onKeyUp={captureSelection}
                      className="max-h-64 overflow-y-auto scrollbar-thin rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap font-serif selection:bg-emerald-500/30"
                    >
                      {renderedText}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-600">
                        {selection ? `${selection.length} caractères sélectionnés` : 'Aucune sélection'}
                      </span>
                      <button
                        onClick={ajouterSelection}
                        disabled={!selection}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                          selection
                            ? 'bg-emerald-700/80 text-white hover:bg-emerald-600'
                            : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed',
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ajouter la sélection
                      </button>
                    </div>
                  </div>

                  {/* Découpage IA : sur demande */}
                  <div className="flex items-center gap-2 border-t border-gray-800 pt-4">
                    <button
                      onClick={proposerIA}
                      disabled={aiLoading}
                      className={cn(
                        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        aiLoading
                          ? 'border-purple-800/50 bg-purple-950/20 text-purple-400 cursor-wait'
                          : 'border-purple-800/50 bg-purple-950/20 text-purple-300 hover:bg-purple-900/30',
                      )}
                    >
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {drafts.some((d) => d.source === 'ia') ? "Reproposer avec l'IA" : "Proposer un découpage avec l'IA"}
                    </button>
                    <span className="text-xs text-gray-600">facultatif — vient compléter vos passages</span>
                  </div>

                  {/* Liste des passages (manuels + IA) */}
                  <div className="space-y-3 border-t border-gray-800 pt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Passages à enregistrer {drafts.length > 0 && `(${drafts.length})`}
                    </p>

                    {drafts.length === 0 && (
                      <p className="text-sm text-gray-600 py-4 text-center">
                        Aucun passage pour l'instant. Sélectionnez du texte ou lancez une proposition IA.
                      </p>
                    )}

                    {drafts.map((d, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border p-3 space-y-2 transition-colors',
                          d.keep ? 'bg-amber-950/20 border-amber-800/40' : 'bg-gray-900/40 border-gray-800',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => patch(i, { keep: !d.keep })}
                            className={cn(
                              'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                              d.keep ? 'border-amber-500 bg-amber-500' : 'border-gray-600',
                            )}
                            title={d.keep ? 'Retirer de la sélection' : 'Retenir ce passage'}
                          >
                            {d.keep && <Check className="h-3 w-3 text-white" />}
                          </button>
                          <input
                            type="text"
                            value={d.titre}
                            onChange={(e) => patch(i, { titre: e.target.value })}
                            placeholder="Titre du passage"
                            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
                          />
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0',
                            d.source === 'manuel'
                              ? 'bg-emerald-950/40 text-emerald-400/80 border-emerald-800/40'
                              : 'bg-purple-950/40 text-purple-300/80 border-purple-800/40',
                          )}>
                            {d.source === 'manuel' ? 'manuel' : 'IA'}
                          </span>
                          <button
                            onClick={() => remove(i)}
                            className="p-1 rounded text-gray-600 hover:text-red-400 transition-colors shrink-0"
                            title="Supprimer ce passage"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={d.angle}
                          onChange={(e) => patch(i, { angle: e.target.value })}
                          placeholder="Angle d'étude (ex. ironie, incipit, satire de la guerre)"
                          className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-amber-300/90 placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
                        />

                        {!d.found && (
                          <p className="flex items-center gap-1.5 text-xs text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Ancres non retrouvées dans l'œuvre — ajustez le texte ci-dessous avant d'enregistrer.
                          </p>
                        )}

                        <textarea
                          value={d.contenu}
                          onChange={(e) => patch(i, { contenu: e.target.value })}
                          rows={4}
                          placeholder="Texte du passage (copie exacte de l'œuvre)"
                          className="w-full bg-gray-950/60 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 leading-relaxed placeholder-gray-600 focus:outline-none focus:border-amber-500/60 resize-y scrollbar-thin font-serif"
                        />
                        <p className="text-[11px] text-gray-600">
                          ~{d.contenu.trim().split(/\s+/).filter(Boolean).length} mots
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Pied : enregistrement */}
            <div className="px-6 py-3 border-t border-gray-800 shrink-0 flex items-center justify-end">
              <button
                onClick={enregistrer}
                disabled={saving || retenus.length === 0}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  retenus.length > 0 && !saving
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
                    : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed',
                )}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                {retenus.length > 0
                  ? `Enregistrer ${retenus.length} passage${retenus.length > 1 ? 's' : ''}`
                  : 'Sélectionnez des passages'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
