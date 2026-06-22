'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Library, Loader2, Scissors, Eye, Pencil, Trash2, Check, X, ShieldCheck,
  Plus, AlertTriangle, BookOpen, Search,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { normalizeForMatch } from '@/shared/corpus-match'
import { CorpusViewer } from './CorpusViewer'
import { DecoupePanel } from './DecoupePanel'
import { TextDepositPanel } from './TextDepositPanel'
import { IA_AUTEUR, type CorpusItem } from '@/shared/schemas'

type CorpusMeta = Omit<CorpusItem, 'contenu'> & { has_content?: boolean }

const NIVEAU_LABELS: Record<string, string> = {
  sixieme: '6e', cinquieme: '5e', quatrieme: '4e', troisieme: '3e',
  seconde: '2nde', premiere: '1re', terminale: 'Tle',
}

interface CorpusManagerProps {
  provider: 'ollama' | 'openai'
}

/**
 * Espace de gestion du corpus, indépendant de toute séquence.
 *
 * Permet de déposer des textes, de découper une œuvre en passages, puis de
 * relire / éditer / valider / supprimer ces items. Les passages sont affichés
 * groupés sous leur œuvre source (parent_id).
 */
export function CorpusManager({ provider }: CorpusManagerProps) {
  const [items, setItems] = useState<CorpusMeta[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const [decoupe, setDecoupe] = useState<{ id: string; label: string } | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/corpus')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      setItems(data.items as CorpusMeta[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Ordonne pour afficher chaque passage juste sous son œuvre source, et applique
  // la recherche : une œuvre qui matche montre tous ses passages (contexte) ; sinon
  // seuls les passages qui matchent s'affichent, sous leur œuvre rappelée en tête.
  const ordered = useMemo(() => {
    const list = items ?? []
    const q = normalizeForMatch(search)
    const matches = (it: CorpusMeta) => {
      if (!q) return true
      const hay = normalizeForMatch(
        [it.auteur, it.oeuvre, it.titre, it.angle ?? '', ...it.genres, ...it.themes].join(' '),
      )
      return hay.includes(q)
    }

    const byId = new Set(list.map((i) => i.id))
    const childrenByParent = new Map<string, CorpusMeta[]>()
    for (const it of list) {
      if (it.parent_id) {
        const arr = childrenByParent.get(it.parent_id) ?? []
        arr.push(it)
        childrenByParent.set(it.parent_id, arr)
      }
    }

    const out: { item: CorpusMeta; depth: number }[] = []
    for (const it of list) {
      if (it.parent_id) {
        // Passage orphelin (œuvre source absente de la liste) → à plat s'il matche
        if (!byId.has(it.parent_id) && matches(it)) out.push({ item: it, depth: 0 })
        continue
      }
      const children = childrenByParent.get(it.id) ?? []
      const oeuvreMatch = matches(it)
      const childrenAffiches = oeuvreMatch ? children : children.filter(matches)
      if (oeuvreMatch || childrenAffiches.length > 0) {
        out.push({ item: it, depth: 0 })
        for (const child of childrenAffiches) out.push({ item: child, depth: 1 })
      }
    }
    return out
  }, [items, search])

  const patchItem = (updated: CorpusItem) =>
    setItems((prev) => {
      const { contenu: _c, ...meta } = updated
      const next = prev ? [...prev] : []
      const idx = next.findIndex((i) => i.id === updated.id)
      if (idx >= 0) next[idx] = { ...meta, has_content: updated.contenu !== '' }
      else next.unshift({ ...meta, has_content: updated.contenu !== '' })
      return next
    })

  const removeItem = (id: string) =>
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null)

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold text-white">Mon corpus</h2>
          {items && <span className="text-xs text-gray-500">({items.length})</span>}
        </div>
        <button
          onClick={() => setShowDeposit((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-700/80 text-white text-sm hover:bg-emerald-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Déposer un texte
        </button>
      </div>

      {/* Dépôt d'un texte */}
      {showDeposit && (
        <TextDepositPanel
          niveau=""
          onDeposited={(item) => { patchItem(item); setShowDeposit(false) }}
        />
      )}

      {/* Recherche */}
      {items && items.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un texte ou un passage (titre, angle, auteur, œuvre, thème…)"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
              title="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading && !items && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement du corpus…</span>
        </div>
      )}

      {items && items.length === 0 && !loading && (
        <p className="text-sm text-gray-500 text-center py-12">
          Corpus vide. Déposez un texte pour commencer.
        </p>
      )}

      {items && items.length > 0 && ordered.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-12">
          Aucun texte ne correspond à « {search} ».
        </p>
      )}

      {/* Liste groupée */}
      <div className="space-y-2">
        {ordered.map(({ item, depth }) => (
          <div key={item.id} className={cn(depth > 0 && 'ml-5 border-l border-gray-800 pl-3')}>
            <CorpusManagerCard
              item={item}
              onView={() => setViewId(item.id)}
              onDecoupe={
                !item.parent_id && item.has_content !== false
                  ? () => setDecoupe({ id: item.id, label: `${item.auteur}, « ${item.oeuvre} »` })
                  : undefined
              }
              onUpdated={patchItem}
              onDeleted={() => removeItem(item.id)}
            />
          </div>
        ))}
      </div>

      {/* Overlays */}
      <CorpusViewer corpusId={viewId} onClose={() => setViewId(null)} />
      <DecoupePanel
        oeuvreId={decoupe?.id ?? null}
        oeuvreLabel={decoupe?.label}
        provider={provider}
        onClose={() => setDecoupe(null)}
        onCreated={() => { setDecoupe(null); load() }}
      />
    </motion.div>
  )
}

function CorpusManagerCard({
  item,
  onView,
  onDecoupe,
  onUpdated,
  onDeleted,
}: {
  item: CorpusMeta
  onView: () => void
  onDecoupe?: () => void
  onUpdated: (item: CorpusItem) => void
  onDeleted: () => void
}) {
  const isPassage = !!item.parent_id
  const isIa = item.auteur === IA_AUTEUR
  const editable = isPassage || isIa || item.verified_by === 'depot-enseignant'

  const [editing, setEditing] = useState(false)
  const [draftTitre, setDraftTitre] = useState(item.titre)
  const [draftAngle, setDraftAngle] = useState(item.angle ?? '')
  const [draftTexte, setDraftTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)

  // Charge le contenu complet à l'entrée en édition (la liste ne le contient pas).
  const startEdit = async () => {
    setCardError(null)
    setDraftTitre(item.titre)
    setDraftAngle(item.angle ?? '')
    setEditing(true)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(item.id)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      setDraftTexte((data.item as CorpusItem).contenu)
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Chargement du texte impossible')
    }
  }

  const save = async () => {
    if (busy || !draftTitre.trim() || !draftTexte.trim()) return
    setBusy(true)
    setCardError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: draftTitre, texte: draftTexte, angle: isPassage ? draftAngle : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onUpdated(data.item as CorpusItem)
      setEditing(false)
    } catch (err) {
      setCardError(err instanceof Error ? err.message : "L'enregistrement a échoué")
    } finally {
      setBusy(false)
    }
  }

  const toggleVerified = async () => {
    if (busy) return
    setBusy(true)
    setCardError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(item.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: !item.verified }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onUpdated(data.item as CorpusItem)
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (busy) return
    setBusy(true)
    setCardError(null)
    try {
      const res = await fetch(`/api/corpus/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onDeleted()
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Suppression impossible')
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isPassage ? 'bg-amber-950/10 border-amber-900/30' : 'bg-gray-900/40 border-gray-800',
      )}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={draftTitre}
            onChange={(e) => setDraftTitre(e.target.value)}
            disabled={busy}
            placeholder="Titre"
            className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/60"
          />
          {isPassage && (
            <input
              type="text"
              value={draftAngle}
              onChange={(e) => setDraftAngle(e.target.value)}
              disabled={busy}
              placeholder="Angle d'étude"
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-amber-300/90 focus:outline-none focus:border-amber-500/60"
            />
          )}
          <textarea
            value={draftTexte}
            onChange={(e) => setDraftTexte(e.target.value)}
            disabled={busy}
            rows={10}
            placeholder="Texte"
            className="w-full bg-gray-950/60 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200 leading-relaxed focus:outline-none focus:border-blue-500/60 resize-y scrollbar-thin font-serif"
            onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setEditing(false) }}
          />
          {cardError && <p className="text-xs text-red-400">❌ {cardError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={busy || !draftTitre.trim() || !draftTexte.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border shrink-0 mt-0.5 bg-gray-800/60 border-gray-700 text-gray-400">
            {isPassage ? <Scissors className="h-3.5 w-3.5 text-amber-400" /> : <BookOpen className="h-3.5 w-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">
              {isPassage ? item.titre : <>{item.auteur}, <em>« {item.oeuvre} »</em></>}
            </p>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {item.angle && (
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300/90 border border-amber-800/40">
                  <Scissors className="h-2.5 w-2.5" />{item.angle}
                </span>
              )}
              {item.niveaux.map((n) => (
                <span key={n} className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary-900/40 text-primary-300 border border-primary-700/40">
                  {NIVEAU_LABELS[n] ?? n}
                </span>
              ))}
              {item.genres.slice(0, 3).map((g) => (
                <span key={g} className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-800/80 text-gray-400 border border-gray-700/60">{g}</span>
              ))}
              <span className={cn(
                'text-[11px] px-1.5 py-0.5 rounded-full border',
                item.verified
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                  : 'bg-gray-800/60 text-gray-500 border-gray-700/60',
              )}>
                {item.verified ? 'validé ✓' : 'à valider'}
              </span>
            </div>
            {cardError && <p className="text-xs text-red-400 mt-1">❌ {cardError}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {onDecoupe && (
              <button onClick={onDecoupe} title="Découper en passages" className="p-1 rounded text-gray-500 hover:text-amber-400 transition-colors">
                <Scissors className="h-4 w-4" />
              </button>
            )}
            <button onClick={toggleVerified} disabled={busy} title={item.verified ? 'Dévalider' : 'Valider'}
              className={cn('p-1 rounded transition-colors disabled:opacity-50', item.verified ? 'text-emerald-500 hover:text-emerald-400' : 'text-gray-500 hover:text-emerald-400')}>
              <ShieldCheck className="h-4 w-4" />
            </button>
            {editable && (
              <button onClick={startEdit} title="Modifier" className="p-1 rounded text-gray-500 hover:text-blue-400 transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button onClick={onView} title="Lire" className="p-1 rounded text-gray-500 hover:text-emerald-400 transition-colors">
              <Eye className="h-4 w-4" />
            </button>
            {confirmDelete ? (
              <span className="inline-flex items-center gap-1">
                <button onClick={doDelete} disabled={busy} title="Confirmer la suppression" className="p-1 rounded text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button onClick={() => setConfirmDelete(false)} disabled={busy} title="Annuler" className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} title="Supprimer" className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
