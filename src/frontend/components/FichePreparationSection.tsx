'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardList, Sparkles, Loader2, Printer, RefreshCw, User,
  AlertCircle, AlertTriangle, Eye, Edit3, Save, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { cn } from '@/shared/utils'
import { computeSeanceChecksum } from '@/shared/seance-checksum'
import { renderMarkdown, printResource } from './ResourcePanel'
import type { Seance, RessourceStructuree } from '@/shared/schemas'

interface FichePreparationSectionProps {
  /** Séance courante — sert au calcul du checksum de dérive et au chargement de la fiche. */
  seance: Seance
  /**
   * Déclenche la génération. Le parent garantit la sauvegarde préalable de la
   * séquence (FK seance_id) puis appelle l'API. Retourne la fiche générée.
   */
  onGenerate: (consignes?: string) => Promise<RessourceStructuree>
}

/**
 * Section « Fiche de préparation » d'une séance : génération, affichage,
 * édition Markdown, impression, et badge de dérive quand la séance a été
 * modifiée depuis la génération. Voir doc/fiche-preparation.md.
 */
export function FichePreparationSection({ seance, onGenerate }: FichePreparationSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [fiche, setFiche] = useState<RessourceStructuree | null>(null)
  const [consignes, setConsignes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seanceId = seance.id

  // Charge la fiche existante au montage / changement de séance (lecture seule).
  useEffect(() => {
    if (!seanceId) {
      setFiche(null)
      return
    }
    let cancelled = false
    fetch(`/api/resources?seance_id=${encodeURIComponent(seanceId)}&scope=seance`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.ressources)) return
        setFiche(data.ressources.find((r: RessourceStructuree) => r.type === 'fiche_preparation') ?? null)
      })
      .catch(() => { /* silencieux */ })
    return () => { cancelled = true }
  }, [seanceId])

  // Dérive : la séance a-t-elle changé depuis la génération de la fiche ?
  const stale = useMemo(() => {
    const stored = fiche?.contenu_json?.seance_checksum
    if (!fiche || typeof stored !== 'string' || !stored) return false
    return stored !== computeSeanceChecksum(seance)
  }, [fiche, seance])

  const handleGenerate = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const generated = await onGenerate(consignes.trim() || undefined)
      setFiche(generated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la génération')
    } finally {
      setLoading(false)
    }
  }, [consignes, loading, onGenerate])

  const handleSaved = useCallback((markdown: string) => {
    setFiche((prev) => (prev ? { ...prev, contenu_markdown: markdown } : prev))
  }, [])

  return (
    <div className="border-t border-gray-800/50">
      {/* En-tête repliable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-gray-800/20 transition-colors"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 text-gray-600 transition-transform', expanded && 'rotate-90')} />
        <ClipboardList className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs text-gray-400 uppercase font-semibold flex-1">Fiche de préparation</span>
        {fiche && !stale && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-800/50 bg-emerald-900/20 text-emerald-400 text-[10px] font-semibold">
            <CheckCircle2 className="h-3 w-3" />
            Générée
          </span>
        )}
        {fiche && stale && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-700/50 bg-amber-900/30 text-amber-300 text-[10px] font-semibold"
            title="Le contenu de la séance (titre, durée, objectifs ou activités) a changé depuis la génération de la fiche."
          >
            <AlertTriangle className="h-3 w-3" />
            Séance modifiée
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-gray-500">
            Déroulé minuté côté enseignant : gestes professionnels, difficultés anticipées,
            trace écrite au tableau, matériel et transitions. Généré à partir des activités
            et des ressources déjà produites pour la séance.
          </p>

          {stale && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                La séance a été modifiée depuis la génération de cette fiche : le déroulé
                peut ne plus correspondre. Pensez à la régénérer.
              </span>
            </div>
          )}

          <textarea
            value={consignes}
            onChange={(e) => setConsignes(e.target.value)}
            placeholder="Instructions complémentaires (optionnel) : rituel de classe, contraintes matérielles, élèves à besoins particuliers…"
            rows={2}
            disabled={loading}
            className="w-full text-sm bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-600/50 resize-none disabled:opacity-50"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-900/40 border border-amber-700/50 hover:bg-amber-800/40 text-amber-200 rounded-lg text-sm transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : fiche ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading
                ? 'Génération en cours…'
                : fiche
                  ? 'Régénérer la fiche de préparation'
                  : 'Générer la fiche de préparation'}
            </button>
            {loading && (
              <span className="text-xs text-gray-500">
                Analyse de la séance et rédaction du déroulé…
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {fiche && (
            <div className="rounded-xl border border-gray-800 bg-gray-950/40 overflow-hidden">
              <FicheView key={fiche.id} resource={fiche} onSaved={handleSaved} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Vue du document : aperçu rendu / édition Markdown + sauvegarde + impression ──
// Même comportement que les documents de l'évaluation finale (EvalResourceView).

function FicheView({
  resource,
  onSaved,
}: {
  resource: RessourceStructuree
  onSaved: (markdown: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(resource.contenu_markdown)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = draft !== resource.contenu_markdown

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch(`/api/resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu_markdown: draft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onSaved(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [saving, dirty, resource.id, draft, onSaved])

  return (
    <div>
      {/* Barre d'actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/70 bg-gray-900/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setEditing(false)}
              className={cn('p-1.5 transition-colors', !editing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400')}
              title="Aperçu rendu"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(true)}
              className={cn('p-1.5 transition-colors', editing ? 'bg-gray-700 text-gray-100' : 'text-gray-600 hover:text-gray-400')}
              title="Éditer le Markdown"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-amber-400/80 font-medium">
            <User className="h-3 w-3" />
            Document professeur
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {editing && (
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs transition-all disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? 'Enregistré' : 'Enregistrer'}
            </button>
          )}
          <button
            onClick={() => printResource(resource, resource.audience)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-800/50 text-amber-400 hover:bg-amber-500/10 text-xs transition-all"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Contenu */}
      <div className="p-4 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {!editing ? (
          <div
            className="prose prose-invert max-w-none font-sans"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(resource.contenu_markdown) }}
          />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[28rem] bg-transparent border-0 resize-none font-mono text-sm text-gray-300 focus:outline-none leading-relaxed"
            placeholder="Contenu Markdown…"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}
