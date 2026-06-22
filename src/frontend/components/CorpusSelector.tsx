'use client'

import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, AlertTriangle, Plus, ChevronRight, ChevronDown, Sparkles, Search, Library, Wand2, Loader2, Eye, EyeOff, Pencil, Check, X, Upload, ShieldCheck, Scissors } from 'lucide-react'
import { cn } from '@/shared/utils'
import { CorpusViewer } from './CorpusViewer'
import { DecoupePanel } from './DecoupePanel'
import { TextDepositPanel } from './TextDepositPanel'
import type { CorpusSuggestResponse } from '@/app/api/corpus/suggest/route'
import type { CorpusGenerateResponse } from '@/app/api/corpus/generate/route'
import type { CorpusItem } from '@/shared/schemas'

interface CorpusSelectorProps {
  response: CorpusSuggestResponse
  /** Demande complète de l'enseignant — contexte pour la génération de texte original */
  demande: string
  provider: 'ollama' | 'openai'
  onConfirm: (selectedRefs: string[]) => void
  onSkip: () => void
  isLoading?: boolean
}

const NIVEAU_LABELS: Record<string, string> = {
  sixieme: '6e', cinquieme: '5e', quatrieme: '4e', troisieme: '3e',
  seconde: '2nde', premiere: '1re', terminale: 'Tle',
}

function hasNiveauMismatch(itemNiveaux: string[], niveauxRecherches: string[]): boolean {
  if (niveauxRecherches.length === 0) return false
  return !itemNiveaux.some((n) => niveauxRecherches.includes(n))
}

function formatNiveaux(niveaux: string[]): string {
  return niveaux.map((n) => NIVEAU_LABELS[n] ?? n).join(' / ')
}

// Carte réutilisée dans les deux sections (suggérés + browser)
function CorpusItemCard({
  item,
  selected,
  niveauxRecherches,
  onToggle,
  onView,
  onValidated,
  onDecoupe,
}: {
  item: Omit<CorpusItem, 'contenu'>
  selected: boolean
  niveauxRecherches: string[]
  onToggle: () => void
  onView: (id: string) => void
  /** Si fourni et que l'item n'est pas vérifié, affiche un bouton « Valider ». */
  onValidated?: () => void
  /** Si fourni et que l'item est une œuvre source (pas un passage), affiche « Découper ». */
  onDecoupe?: () => void
}) {
  const mismatch = hasNiveauMismatch(item.niveaux, niveauxRecherches)
  const [validating, setValidating] = useState(false)

  const validate = async () => {
    if (validating) return
    setValidating(true)
    try {
      const res = await fetch(`/api/corpus/${item.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: true }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `Erreur HTTP ${res.status}`)
      onValidated?.()
    } catch {
      /* échec silencieux : l'item reste non validé, l'enseignant peut réessayer */
    } finally {
      setValidating(false)
    }
  }
  return (
    <div
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border transition-all',
        selected
          ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
          : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700',
      )}
    >
      <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        {/* Checkbox */}
        <div className={cn(
          'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
          selected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-600',
        )}>
          {selected && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm block truncate">
            {item.auteur}, <em>« {item.oeuvre} »</em>
          </span>
          <span className="text-xs opacity-60 block truncate">
            {item.titre} · {item.genres.join(', ')}
            {item.pages && ` · ${item.pages}`}
          </span>
          {item.angle && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300/90 border border-amber-800/40">
              <Scissors className="h-2.5 w-2.5 shrink-0" />
              {item.angle}
            </span>
          )}
          {mismatch && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-700/40">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              Prévu pour {formatNiveaux(item.niveaux)} — à adapter
            </span>
          )}
        </div>
      </button>

      {onValidated && !item.verified && (
        <button
          onClick={validate}
          disabled={validating}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-950/50 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/40 disabled:opacity-50 transition-colors whitespace-nowrap"
          title="Valider ce texte (le rend suggérable et utilisable par l'appariement automatique)"
        >
          {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          Valider
        </button>
      )}

      {onDecoupe && !item.parent_id && (
        <button
          onClick={onDecoupe}
          className="shrink-0 p-1 rounded text-gray-500 hover:text-amber-400 transition-colors"
          title="Découper cette œuvre en passages"
        >
          <Scissors className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={() => onView(item.id)}
        className="shrink-0 p-1 rounded text-gray-500 hover:text-emerald-400 transition-colors"
        title="Lire le texte"
      >
        <Eye className="h-4 w-4" />
      </button>
    </div>
  )
}

// Carte d'un texte original généré par l'IA (sélectionnable + aperçu dépliable + édition)
function GeneratedTextCard({
  item,
  notice,
  selected,
  onToggle,
  onUpdate,
}: {
  item: CorpusItem
  notice: string
  selected: boolean
  onToggle: () => void
  onUpdate: (item: CorpusItem) => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTitre, setDraftTitre] = useState(item.titre)
  const [draftTexte, setDraftTexte] = useState(item.contenu)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const wordCount = item.contenu.trim().split(/\s+/).filter(Boolean).length

  // Validation : marque le texte comme vérifié (verified=1) → éligible aux
  // suggestions et à l'appariement automatique.
  const validate = async () => {
    if (validating) return
    setValidating(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/corpus/${item.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onUpdate(data.item as CorpusItem)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'La validation a échoué')
    } finally {
      setValidating(false)
    }
  }

  const startEdit = () => {
    setDraftTitre(item.titre)
    setDraftTexte(item.contenu)
    setEditError(null)
    setEditing(true)
    setShowPreview(false)
  }

  const cancelEdit = () => {
    if (saving) return
    setEditing(false)
    setEditError(null)
  }

  const saveEdit = async () => {
    if (saving || !draftTitre.trim() || !draftTexte.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/corpus/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: draftTitre, texte: draftTexte }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onUpdate(data.item as CorpusItem)
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "L'enregistrement a échoué")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        selected
          ? 'bg-purple-950/30 border-purple-700/50'
          : 'bg-gray-900/40 border-gray-800 hover:border-gray-700',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggle}
          disabled={editing}
          className={cn(
            'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors mt-0.5',
            selected ? 'border-purple-500 bg-purple-500' : 'border-gray-600',
            editing && 'opacity-40',
          )}
        >
          {selected && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {editing ? (
          <input
            type="text"
            value={draftTitre}
            onChange={(e) => setDraftTitre(e.target.value)}
            disabled={saving}
            placeholder="Titre du texte"
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/60"
          />
        ) : (
          <button onClick={onToggle} className="flex-1 min-w-0 text-left">
            <span className={cn('font-medium text-sm block', selected ? 'text-purple-300' : 'text-gray-400')}>
              <em>« {item.titre} »</em>
            </span>
            <span className="text-xs opacity-60 block mt-0.5 text-gray-400">
              {item.genres.join(', ')} · {item.themes.join(', ')} · ~{wordCount} mots
              {item.verified ? ' · validé ✓' : item.verified_by === 'professeur' ? ' · relu' : ''}
            </span>
            {notice && (
              <span className="text-xs opacity-50 block mt-0.5 italic text-gray-400">{notice}</span>
            )}
          </button>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={saving || !draftTitre.trim() || !draftTexte.trim()}
                className="p-1 rounded text-emerald-500 hover:text-emerald-400 disabled:opacity-40 transition-colors"
                title="Enregistrer les modifications"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="p-1 rounded text-gray-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                title="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              {!item.verified && (
                <button
                  onClick={validate}
                  disabled={validating}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-950/50 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-900/40 disabled:opacity-50 transition-colors whitespace-nowrap"
                  title="Valider ce texte (le rend suggérable et utilisable par l'appariement automatique)"
                >
                  {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  Valider
                </button>
              )}
              <button
                onClick={startEdit}
                className="p-1 rounded text-gray-500 hover:text-purple-400 transition-colors"
                title="Modifier le texte"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="p-1 rounded text-gray-500 hover:text-purple-400 transition-colors"
                title={showPreview ? "Masquer le texte" : "Lire le texte"}
              >
                {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {!editing && editError && (
        <p className="mx-3 mb-2 text-xs text-red-400">❌ {editError}</p>
      )}

      {/* Zone d'édition du texte */}
      {editing && (
        <div className="mx-3 mb-3 space-y-2">
          <textarea
            value={draftTexte}
            onChange={(e) => setDraftTexte(e.target.value)}
            disabled={saving}
            rows={12}
            className="w-full bg-gray-950/60 border border-gray-700 rounded-md px-3 py-2 text-xs text-gray-200 leading-relaxed placeholder-gray-600 focus:outline-none focus:border-purple-500/60 resize-y scrollbar-thin"
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit()
              if (e.key === 'Enter' && e.ctrlKey) saveEdit()
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">
              ~{draftTexte.trim().split(/\s+/).filter(Boolean).length} mots · Ctrl+Enter pour enregistrer · Échap pour annuler
            </p>
            {editError && <p className="text-xs text-red-400">❌ {editError}</p>}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showPreview && !editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-3 mb-3 px-3 py-2 rounded-md bg-gray-950/60 border border-gray-800 max-h-56 overflow-y-auto scrollbar-thin">
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{item.contenu}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CorpusSelector({
  response,
  demande,
  provider,
  onConfirm,
  onSkip,
  isLoading = false,
}: CorpusSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(response.corpus_found.map((item) => item.id)),
  )

  // === Textes originaux générés par l'IA ===
  const [generated, setGenerated] = useState<{ item: CorpusItem; notice: string }[]>([])
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // Instructions du professeur pour guider l'écriture du prochain texte
  const [genInstructions, setGenInstructions] = useState('')

  // Texte affiché dans le panneau de lecture (null = fermé)
  const [viewCorpusId, setViewCorpusId] = useState<string | null>(null)

  // Œuvre en cours de découpe dans le backoffice (null = fermé)
  const [decoupe, setDecoupe] = useState<{ id: string; label: string } | null>(null)

  // Passages créés via la découpe → ajoutés au browser et pré-sélectionnés
  const handlePassagesCreated = (items: CorpusItem[]) => {
    if (items.length === 0) return
    const metas = items.map(({ contenu: _c, ...meta }) => meta as Omit<CorpusItem, 'contenu'>)
    setBrowserItems((prev) => [...metas, ...(prev ?? [])])
    setBrowserOpen(true)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const it of items) next.add(it.id)
      return next
    })
  }

  const handleGenerateText = async () => {
    if (genLoading) return
    setGenLoading(true)
    setGenError(null)
    try {
      const res = await fetch('/api/corpus/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demande,
          niveau: response.niveau,
          theme: response.theme,
          provider,
          consignes: genInstructions,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      const { item, notice_pedagogique } = data as CorpusGenerateResponse
      setGenerated((prev) => [...prev, { item, notice: notice_pedagogique }])
      // Le texte généré est pré-sélectionné comme support de la séquence
      setSelected((prev) => new Set(prev).add(item.id))
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'La génération du texte a échoué')
    } finally {
      setGenLoading(false)
    }
  }

  const handleUpdateGenerated = (updated: CorpusItem) => {
    setGenerated((prev) =>
      prev.map((g) => (g.item.id === updated.id ? { ...g, item: updated } : g)),
    )
  }

  // === Textes RÉELS déposés par l'enseignant (collage / fichier) ===
  const [deposited, setDeposited] = useState<CorpusItem[]>([])
  // Pré-remplissage du panneau de dépôt depuis une suggestion IA (métadonnées incluses)
  type DepositSeed = {
    auteur: string
    oeuvre: string
    genres: string[]
    themes: string[]
    annee: number | null
  }
  const [depositSeed, setDepositSeed] = useState<DepositSeed | null>(null)
  const depositRef = useRef<HTMLDivElement>(null)

  const seedDepositFromSuggestion = (sugg: CorpusSuggestResponse['suggestions'][number]) => {
    setDepositSeed({
      auteur: sugg.auteur,
      oeuvre: sugg.oeuvre,
      genres: sugg.genres ?? [],
      themes: sugg.themes ?? [],
      annee: sugg.annee_publication,
    })
    // Laisser le remount du panneau se faire avant de défiler vers lui
    requestAnimationFrame(() => depositRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const handleDeposited = (item: CorpusItem) => {
    setDeposited((prev) => [...prev, item])
    setSelected((prev) => new Set(prev).add(item.id))
  }

  const handleUpdateDeposited = (updated: CorpusItem) => {
    setDeposited((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
  }

  // === Browser état ===
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserItems, setBrowserItems] = useState<Omit<CorpusItem, 'contenu'>[] | null>(null)
  const [browserLoading, setBrowserLoading] = useState(false)
  const [browserSearch, setBrowserSearch] = useState('')

  const suggestedIds = useMemo(
    () => new Set(response.corpus_found.map((i) => i.id)),
    [response.corpus_found],
  )

  const openBrowser = async () => {
    setBrowserOpen(true)
    if (browserItems !== null) return // déjà chargé
    setBrowserLoading(true)
    try {
      const res = await fetch('/api/corpus')
      const data = await res.json()
      // Exclure les items déjà affichés dans la section "Disponibles"
      setBrowserItems((data.items as Omit<CorpusItem, 'contenu'>[]).filter(
        (i) => !suggestedIds.has(i.id),
      ))
    } catch {
      setBrowserItems([])
    } finally {
      setBrowserLoading(false)
    }
  }

  const closeBrowser = () => {
    setBrowserOpen(false)
    setBrowserSearch('')
  }

  const filteredBrowserItems = useMemo(() => {
    // Exclure les textes générés/déposés dans cette session (affichés dans leur propre section)
    const ownIds = new Set([...generated.map((g) => g.item.id), ...deposited.map((d) => d.id)])
    const items = (browserItems ?? []).filter((i) => !ownIds.has(i.id))
    const q = browserSearch.toLowerCase().trim()
    if (!q) return items
    return items.filter(
      (item) =>
        item.auteur.toLowerCase().includes(q) ||
        item.oeuvre.toLowerCase().includes(q) ||
        item.titre.toLowerCase().includes(q) ||
        item.themes.some((t) => t.toLowerCase().includes(q)) ||
        item.genres.some((g) => g.toLowerCase().includes(q)),
    )
  }, [browserItems, browserSearch, generated, deposited])

  // Ordonne les items pour afficher chaque passage juste sous son œuvre source.
  // depth=1 → passage rattaché à une œuvre présente dans la liste (affiché indenté).
  const orderedBrowserItems = useMemo(() => {
    const items = filteredBrowserItems
    const byId = new Set(items.map((i) => i.id))
    const childrenByParent = new Map<string, typeof items>()
    for (const it of items) {
      if (it.parent_id) {
        const arr = childrenByParent.get(it.parent_id) ?? []
        arr.push(it)
        childrenByParent.set(it.parent_id, arr)
      }
    }
    const out: { item: (typeof items)[number]; depth: number }[] = []
    for (const it of items) {
      if (it.parent_id) {
        // Passage orphelin (œuvre source absente de la liste) → affiché à plat
        if (!byId.has(it.parent_id)) out.push({ item: it, depth: 0 })
        continue
      }
      out.push({ item: it, depth: 0 })
      for (const child of childrenByParent.get(it.id) ?? []) out.push({ item: child, depth: 1 })
    }
    return out
  }, [filteredBrowserItems])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => onConfirm(Array.from(selected))

  const displayNiveau = NIVEAU_LABELS[response.niveau] ?? response.niveau

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/60 rounded-xl border border-gray-800 p-5 space-y-5"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-400" />
            Textes du corpus pour cette séquence
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {displayNiveau} — {response.theme}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          Ignorer
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Textes suggérés par le LLM */}
      {response.corpus_found.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Suggéré depuis votre corpus
          </p>
          {response.corpus_found.map((item) => (
            <CorpusItemCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              niveauxRecherches={response.niveaux_recherches}
              onToggle={() => toggle(item.id)}
              onView={setViewCorpusId}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-900/30 rounded-lg p-3 border border-gray-800">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          Aucun texte trouvé dans votre corpus pour ce thème.
        </div>
      )}

      {/* ── Browser du corpus ── */}
      <div className="border-t border-gray-800 pt-4">
        <button
          onClick={browserOpen ? closeBrowser : openBrowser}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full"
        >
          <Library className="h-3.5 w-3.5" />
          <span>Parcourir tout le corpus</span>
          {browserOpen
            ? <ChevronDown className="h-3 w-3 ml-auto" />
            : <ChevronRight className="h-3 w-3 ml-auto" />}
        </button>

        <AnimatePresence>
          {browserOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-3">
                {/* Barre de recherche */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={browserSearch}
                    onChange={(e) => setBrowserSearch(e.target.value)}
                    placeholder="Rechercher par auteur, titre, thème…"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                  />
                </div>

                {/* Résultats */}
                {browserLoading ? (
                  <p className="text-xs text-gray-500 text-center py-4">Chargement…</p>
                ) : filteredBrowserItems.length === 0 ? (
                  <p className="text-xs text-gray-600 text-center py-4">
                    {browserSearch ? 'Aucun résultat pour cette recherche.' : 'Tous les textes du corpus sont déjà proposés ci-dessus.'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                    {orderedBrowserItems.map(({ item, depth }) => (
                      <div key={item.id} className={cn(depth > 0 && 'ml-5 border-l border-gray-800 pl-2')}>
                        <CorpusItemCard
                          item={item}
                          selected={selected.has(item.id)}
                          niveauxRecherches={response.niveaux_recherches}
                          onToggle={() => toggle(item.id)}
                          onView={setViewCorpusId}
                          onValidated={() =>
                            setBrowserItems((prev) =>
                              prev?.map((b) => (b.id === item.id ? { ...b, verified: true } : b)) ?? null,
                            )
                          }
                          onDecoupe={() => setDecoupe({ id: item.id, label: `${item.auteur}, « ${item.oeuvre} »` })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Suggestions IA */}
      {response.suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Suggérés par l'IA (à ajouter au corpus)
          </p>
          {response.suggestions.map((sugg, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg border border-amber-900/30 bg-amber-950/20 text-amber-300/80"
            >
              <Plus className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm block">
                  {sugg.auteur}, <em>« {sugg.oeuvre} »</em>
                </span>
                <span className="text-xs opacity-70 block mt-0.5">{sugg.extrait_recommande}</span>
                <span className="text-xs opacity-50 block mt-0.5 italic">{sugg.pourquoi}</span>
              </div>
              <button
                onClick={() => seedDepositFromSuggestion(sugg)}
                className="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-700/80 text-white hover:bg-emerald-600 transition-colors whitespace-nowrap"
                title={`Fournir le texte de « ${sugg.oeuvre} »`}
              >
                <Upload className="h-3 w-3" />
                Fournir le texte
              </button>
            </div>
          ))}
          <p className="text-xs text-gray-600 pl-1">
            Ces textes ne sont pas dans votre corpus. L'IA n'en invente pas le contenu : cliquez
            « Fournir le texte » pour le déposer ou le coller vous-même ci-dessous.
          </p>
        </div>
      )}

      {/* Texte RÉEL déposé par l'enseignant */}
      <div ref={depositRef} className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-emerald-400" />
          Déposer ou coller un texte
          {depositSeed && (
            <span className="ml-1 normal-case font-normal text-emerald-400/90">
              — {depositSeed.auteur}, « {depositSeed.oeuvre} »
            </span>
          )}
        </p>

        {deposited.map((item) => (
          <GeneratedTextCard
            key={item.id}
            item={item}
            notice=""
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
            onUpdate={handleUpdateDeposited}
          />
        ))}

        <TextDepositPanel
          key={depositSeed ? `${depositSeed.auteur}|${depositSeed.oeuvre}` : 'blank'}
          niveau={response.niveau}
          defaultAuteur={depositSeed?.auteur ?? ''}
          defaultOeuvre={depositSeed?.oeuvre ?? ''}
          defaultGenres={depositSeed?.genres ?? []}
          defaultThemes={depositSeed?.themes ?? []}
          defaultAnnee={depositSeed?.annee ?? null}
          onDeposited={(item) => { handleDeposited(item); setDepositSeed(null) }}
        />
      </div>

      {/* Texte original généré par l'IA */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Wand2 className="h-3 w-3 text-purple-400" />
          Texte original écrit par l'IA
        </p>

        {generated.map(({ item, notice }) => (
          <GeneratedTextCard
            key={item.id}
            item={item}
            notice={notice}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
            onUpdate={handleUpdateGenerated}
          />
        ))}

        {genError && (
          <p className="text-xs text-red-400">❌ {genError}</p>
        )}

        {/* Instructions du professeur pour guider l'écriture */}
        <textarea
          value={genInstructions}
          onChange={(e) => setGenInstructions(e.target.value)}
          disabled={genLoading}
          rows={2}
          placeholder="Guidez l'écriture (optionnel) : genre, longueur, personnages, registre, points de langue à faire apparaître…"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 resize-none disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleGenerateText()
          }}
        />

        <button
          onClick={handleGenerateText}
          disabled={genLoading}
          className={cn(
            'w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed text-sm transition-all',
            genLoading
              ? 'border-purple-800/50 bg-purple-950/20 text-purple-400 cursor-wait'
              : 'border-purple-900/50 text-purple-400/80 hover:border-purple-700/60 hover:bg-purple-950/20 hover:text-purple-300',
          )}
        >
          {genLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Écriture du texte en cours…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              {generated.length > 0
                ? 'Écrire et ajouter un autre texte'
                : 'Écrire un texte original pour cette séquence'}
            </>
          )}
        </button>
        <p className="text-xs text-gray-600 pl-1">
          L'IA rédige un texte inédit adapté au niveau, au thème et à vos instructions. Chaque texte
          s'ajoute à la liste ci-dessus et à votre corpus
          (<code className="text-gray-500">data/corpus/</code>) — sélectionnez ceux à utiliser comme supports.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-800">
        <span className="text-xs text-gray-600">
          {selected.size === 0
            ? 'Aucun texte sélectionné — génération sans corpus'
            : `${selected.size} texte${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''}`}
        </span>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
            selected.size > 0
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {selected.size > 0 ? 'Générer avec ces textes' : 'Générer sans corpus'}
        </button>
      </div>

      {/* Panneau de lecture d'un texte du corpus (au-dessus de la modale) */}
      <CorpusViewer corpusId={viewCorpusId} onClose={() => setViewCorpusId(null)} />

      {/* Backoffice de découpe d'une œuvre en passages */}
      <DecoupePanel
        oeuvreId={decoupe?.id ?? null}
        oeuvreLabel={decoupe?.label}
        provider={provider}
        onClose={() => setDecoupe(null)}
        onCreated={handlePassagesCreated}
      />
    </motion.div>
  )
}
